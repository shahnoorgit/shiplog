import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";

// Module-level state for interrupt handling
let currentAbortController: AbortController | null = null;
let currentState: AutopilotState | null = null;
let currentCwd: string | null = null;
let isInterrupted = false;

interface AutopilotOptions {
  maxIterations: number;
  stallThreshold: number;
  timeout: number; // Session timeout in seconds
  maxRetries: number; // Max retries per session on failure
  maxBudget: number; // Max budget per session in USD
  model: string; // Claude model to use (sonnet/opus/haiku)
  resume: boolean; // Continue from interrupted state
  fresh: boolean; // Start fresh, ignore existing state
  dryRun: boolean;
}

interface SessionLog {
  sessionId: string;
  iteration: number;
  startTime: string;
  endTime?: string;
  durationSeconds?: number;
  startCommits: number;
  endCommits?: number;
  commitsMade?: number;
  filesChanged?: number;
  sprintUpdated?: boolean;
  exitCode?: number;
  timedOut?: boolean;
  retriesUsed?: number;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  status: "running" | "completed" | "stalled" | "error" | "timeout";
}

interface AutopilotState {
  initiative: string;
  started: string;
  iterations: number;
  totalCommits: number;
  stallCount: number;
  sessions: SessionLog[];
  currentSessionId?: string; // SDK session ID for resume
  totalCostUsd?: number; // Accumulated cost across all sessions
  totalDurationSeconds?: number; // Total time spent across all sessions
  status: "running" | "completed" | "stalled" | "interrupted";
}

/**
 * Sprint memory entry - tracks what was tried in each iteration
 */
interface SprintMemoryEntry {
  iteration: number;
  timestamp: string;
  feature: string;
  approach: string; // What the crew attempted
  result: "success" | "partial" | "failure";
  commits: number;
  learnings: string[]; // What was learned
  failures: string[]; // What to avoid
  critique?: string; // From review phase (v2-003)
}

interface SprintMemory {
  initiative: string;
  sprintFile: string;
  started: string;
  entries: SprintMemoryEntry[];
}

function handleInterrupt(): void {
  if (isInterrupted) return; // Prevent double handling
  isInterrupted = true;

  console.log("\n\n⚠️  Interrupt received (Ctrl+C)");
  console.log("💾 Saving state...");

  // Abort SDK query if running
  if (currentAbortController) {
    console.log("🛑 Stopping Claude session...");
    currentAbortController.abort();
  }

  // Update and save state
  if (currentState && currentCwd) {
    currentState.status = "interrupted";

    // Mark current session as interrupted if one is running
    const runningSession = currentState.sessions.find(s => s.status === "running");
    if (runningSession) {
      runningSession.status = "error";
      runningSession.endTime = new Date().toISOString();
    }

    const statePath = path.join(currentCwd, ".shiplog/autopilot-state.json");
    fs.writeFileSync(statePath, JSON.stringify(currentState, null, 2) + "\n");
    console.log("✅ State saved to .shiplog/autopilot-state.json");
    console.log("   Run 'shiplog autopilot' to resume.\n");
  }

  process.exit(130); // Standard exit code for SIGINT
}

function setupInterruptHandler(): void {
  process.on("SIGINT", handleInterrupt);
  process.on("SIGTERM", handleInterrupt);
}

function getCommitCount(cwd: string): number {
  try {
    const result = execSync("git rev-list --count HEAD", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return parseInt(result.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function getRecentCommitMessages(cwd: string, count: number): string[] {
  try {
    const result = execSync(`git log -${count} --format="%s"`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Detect uncommitted file changes as "soft progress"
 * Returns number of files with changes (staged or unstaged)
 */
function getFileChanges(cwd: string): {
  changedFiles: number;
  sprintFileModified: boolean;
  changedPaths: string[];
} {
  try {
    // Get list of modified files (staged and unstaged)
    const result = execSync("git diff --name-only HEAD", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const changedPaths = result.trim().split("\n").filter(Boolean);
    const changedFiles = changedPaths.length;

    // Check if any sprint file was modified
    const sprintFileModified = changedPaths.some(p =>
      p.startsWith("docs/sprints/") && p.endsWith(".json")
    );

    return { changedFiles, sprintFileModified, changedPaths };
  } catch {
    return { changedFiles: 0, sprintFileModified: false, changedPaths: [] };
  }
}

interface SprintFeature {
  id: string;
  description: string;
  deliverable?: string;
  passes: boolean;
}

interface Sprint {
  initiative: string;
  status: string;
  features?: SprintFeature[];
  context?: {
    type?: string;
    quality_criteria?: string[];
    test_command?: string;
    allowed_tools?: string[];
  };
}

function getCurrentSprintTask(cwd: string): { initiative: string; task: string } | null {
  const sprintsDir = path.join(cwd, "docs/sprints");
  if (!fs.existsSync(sprintsDir)) return null;

  const files = fs.readdirSync(sprintsDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) return null;

  // Get most recent sprint file
  const sortedFiles = files.sort().reverse();

  for (const file of sortedFiles) {
    try {
      const sprint = JSON.parse(
        fs.readFileSync(path.join(sprintsDir, file), "utf-8")
      );
      if (sprint.status === "in_progress") {
        // Find first incomplete feature
        const nextFeature = sprint.features?.find(
          (f: { passes: boolean }) => !f.passes
        );
        if (nextFeature) {
          return {
            initiative: sprint.initiative,
            task: nextFeature.description,
          };
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Get the current sprint data including quality criteria
 */
function getCurrentSprint(cwd: string): Sprint | null {
  const sprintsDir = path.join(cwd, "docs/sprints");
  if (!fs.existsSync(sprintsDir)) return null;

  const files = fs.readdirSync(sprintsDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) return null;

  const sortedFiles = files.sort().reverse();

  for (const file of sortedFiles) {
    try {
      const sprint = JSON.parse(
        fs.readFileSync(path.join(sprintsDir, file), "utf-8")
      ) as Sprint;
      if (sprint.status === "in_progress") {
        return sprint;
      }
    } catch {
      continue;
    }
  }

  return null;
}

// Read a specific sprint file by path (regardless of status)
// Used for re-reading sprint after session to check for newly completed features
function getSprintByPath(cwd: string, sprintFilePath: string): Sprint | null {
  const fullPath = path.join(cwd, sprintFilePath);
  if (!fs.existsSync(fullPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf-8")) as Sprint;
  } catch {
    return null;
  }
}

/**
 * Check if a feature was marked complete (passes: true) since start of iteration
 * by comparing what was incomplete before vs after
 */
function getNewlyCompletedFeatures(
  beforeFeatures: string[],
  currentSprint: Sprint | null
): SprintFeature[] {
  if (!currentSprint?.features) return [];

  // Features that now pass but were in the "incomplete" list before
  return currentSprint.features.filter(
    (f) => f.passes && beforeFeatures.includes(f.description)
  );
}

function loadSkillbook(cwd: string): string {
  const skillbookPath = path.join(cwd, "docs/SKILLBOOK.md");
  if (fs.existsSync(skillbookPath)) {
    return fs.readFileSync(skillbookPath, "utf-8");
  }
  return "";
}

/**
 * Get path to sprint memory file
 */
function getSprintMemoryPath(cwd: string): string {
  return path.join(cwd, ".shiplog/sprint-memory.json");
}

/**
 * Load sprint memory, or create new if doesn't exist or is for different sprint
 */
function loadSprintMemory(cwd: string, initiative: string, sprintFile: string): SprintMemory {
  const memoryPath = getSprintMemoryPath(cwd);

  if (fs.existsSync(memoryPath)) {
    try {
      const memory = JSON.parse(fs.readFileSync(memoryPath, "utf-8")) as SprintMemory;
      // Check if this is for the same sprint
      if (memory.initiative === initiative && memory.sprintFile === sprintFile) {
        return memory;
      }
      // Different sprint - archive old memory and start fresh
      const archivePath = path.join(cwd, `.shiplog/sprint-memory-${Date.now()}.json`);
      fs.renameSync(memoryPath, archivePath);
      console.log(`📦 Archived previous sprint memory to ${path.basename(archivePath)}`);
    } catch {
      // Corrupted file - start fresh
    }
  }

  // Create new sprint memory
  return {
    initiative,
    sprintFile,
    started: new Date().toISOString(),
    entries: [],
  };
}

/**
 * Save sprint memory to file
 */
function saveSprintMemory(cwd: string, memory: SprintMemory): void {
  const memoryPath = getSprintMemoryPath(cwd);
  fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2) + "\n");
}

/**
 * Add entry to sprint memory after an iteration
 */
function addSprintMemoryEntry(
  memory: SprintMemory,
  entry: SprintMemoryEntry
): void {
  memory.entries.push(entry);
}

/**
 * Format sprint memory for injection into crew prompt
 */
function formatSprintMemoryForPrompt(memory: SprintMemory): string {
  if (memory.entries.length === 0) {
    return "";
  }

  let output = "## Sprint Memory (What's Been Tried)\n\n";
  output += `Initiative: ${memory.initiative}\n`;
  output += `Started: ${memory.started}\n`;
  output += `Iterations: ${memory.entries.length}\n\n`;

  // Collect all failures to avoid (most important)
  const allFailures: string[] = [];
  for (const entry of memory.entries) {
    allFailures.push(...entry.failures);
  }

  if (allFailures.length > 0) {
    output += "### ⚠️ DO NOT REPEAT THESE FAILURES\n";
    for (const failure of [...new Set(allFailures)]) { // dedupe
      output += `- ${failure}\n`;
    }
    output += "\n";
  }

  // Show recent iterations (last 5)
  const recentEntries = memory.entries.slice(-5);
  output += "### Recent Iterations\n";

  for (const entry of recentEntries) {
    const emoji = entry.result === "success" ? "✅" : entry.result === "partial" ? "🟡" : "❌";
    output += `\n**Iteration ${entry.iteration}** ${emoji} (${entry.feature})\n`;
    output += `- Approach: ${entry.approach}\n`;
    output += `- Result: ${entry.result} (${entry.commits} commits)\n`;

    if (entry.learnings.length > 0) {
      output += `- Learnings: ${entry.learnings.join("; ")}\n`;
    }

    if (entry.critique) {
      output += `- Critique: ${entry.critique}\n`;
    }
  }

  output += "\n---\n";
  output += "Use this memory to avoid repeating failed approaches and build on successes.\n\n";

  return output;
}

/**
 * Analyze sprint memory for loop patterns (oscillation detection)
 * Returns warnings about potential loops
 */
interface LoopAnalysis {
  hasLoop: boolean;
  warnings: string[];
  blockedApproaches: string[];
}

function analyzeSprintMemoryForLoops(memory: SprintMemory): LoopAnalysis {
  const warnings: string[] = [];
  const blockedApproaches: string[] = [];

  if (memory.entries.length < 2) {
    return { hasLoop: false, warnings, blockedApproaches };
  }

  // Check for repeated failures on the same feature
  const featureFailures: Record<string, number> = {};
  for (const entry of memory.entries) {
    if (entry.result === "failure") {
      featureFailures[entry.feature] = (featureFailures[entry.feature] || 0) + 1;
    }
  }

  for (const [feature, count] of Object.entries(featureFailures)) {
    if (count >= 3) {
      warnings.push(`⚠️ LOOP DETECTED: "${feature}" has failed ${count} times. Consider a different approach or human intervention.`);
      blockedApproaches.push(`Repeated attempts at "${feature}" with same approach`);
    } else if (count >= 2) {
      warnings.push(`⚡ Warning: "${feature}" has failed ${count} times. Try a fundamentally different approach.`);
    }
  }

  // Check for fix/revert oscillation patterns
  // Look for patterns like: "fix A", "fix B caused by A", "fix A broke by B"
  const recentEntries = memory.entries.slice(-5);
  const fixPatterns: string[] = [];

  for (const entry of recentEntries) {
    for (const failure of entry.failures) {
      if (failure.toLowerCase().includes("fix") || failure.toLowerCase().includes("revert")) {
        fixPatterns.push(failure);
      }
    }
  }

  if (fixPatterns.length >= 3) {
    warnings.push(`🔄 OSCILLATION WARNING: Multiple fix/revert cycles detected. You may be in a fix loop.`);
    warnings.push(`   Recent fixes: ${fixPatterns.slice(-3).join(", ")}`);
    blockedApproaches.push("Continuing the current fix/revert cycle");
  }

  // Check for same approach being tried multiple times
  const approachCounts: Record<string, number> = {};
  for (const entry of memory.entries) {
    // Normalize approach for comparison (lowercase, trim)
    const normalizedApproach = entry.approach.toLowerCase().trim().slice(0, 50);
    approachCounts[normalizedApproach] = (approachCounts[normalizedApproach] || 0) + 1;
  }

  for (const [approach, count] of Object.entries(approachCounts)) {
    if (count >= 2) {
      warnings.push(`🔁 Similar approach tried ${count} times: "${approach.slice(0, 40)}..."`);
      if (count >= 3) {
        blockedApproaches.push(approach);
      }
    }
  }

  const hasLoop = warnings.some(w => w.includes("LOOP DETECTED") || w.includes("OSCILLATION"));

  return { hasLoop, warnings, blockedApproaches };
}

/**
 * Detect the current sprint file path
 */
function getCurrentSprintFile(cwd: string): string | null {
  const sprintsDir = path.join(cwd, "docs/sprints");
  if (!fs.existsSync(sprintsDir)) return null;

  const files = fs.readdirSync(sprintsDir).filter((f) => f.endsWith(".json"));
  if (files.length === 0) return null;

  const sortedFiles = files.sort().reverse();

  for (const file of sortedFiles) {
    try {
      const sprint = JSON.parse(
        fs.readFileSync(path.join(sprintsDir, file), "utf-8")
      );
      if (sprint.status === "in_progress") {
        return path.join("docs/sprints", file);
      }
    } catch {
      continue;
    }
  }

  return null;
}

function ensureShiplogDir(cwd: string): string {
  const shiplogDir = path.join(cwd, ".shiplog");
  const sessionsDir = path.join(shiplogDir, "sessions");

  if (!fs.existsSync(shiplogDir)) {
    fs.mkdirSync(shiplogDir, { recursive: true });
  }
  if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
  }

  // Add to .gitignore if not already there
  const gitignorePath = path.join(cwd, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const gitignore = fs.readFileSync(gitignorePath, "utf-8");
    if (!gitignore.includes(".shiplog/")) {
      fs.appendFileSync(gitignorePath, "\n# Shiplog session data\n.shiplog/\n");
    }
  }

  return sessionsDir;
}

function saveState(cwd: string, state: AutopilotState): void {
  const statePath = path.join(cwd, ".shiplog/autopilot-state.json");
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
}

function loadState(cwd: string): AutopilotState | null {
  const statePath = path.join(cwd, ".shiplog/autopilot-state.json");
  if (fs.existsSync(statePath)) {
    try {
      return JSON.parse(fs.readFileSync(statePath, "utf-8"));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Map friendly model names to SDK model IDs
 */
function getModelId(friendlyName: string): string {
  const modelMap: Record<string, string> = {
    sonnet: "claude-sonnet-4-5-20250929",
    opus: "claude-opus-4-5-20251101",
    haiku: "claude-3-5-haiku-20241022",
  };

  const normalized = friendlyName.toLowerCase();
  return modelMap[normalized] || modelMap.sonnet; // Default to sonnet
}

/**
 * Format duration in seconds to human-readable string
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Format tool use for display with relevant details
 * Extracts file paths, commands, etc. and truncates if needed
 */
function formatToolUse(toolName: string, toolInput: any): string {
  // Truncate helper - keeps start and end of long strings
  const truncate = (str: string, maxLen: number = 60): string => {
    if (str.length <= maxLen) return str;
    const prefixLen = Math.floor(maxLen * 0.6);
    const suffixLen = Math.floor(maxLen * 0.3);
    return `${str.slice(0, prefixLen)}...${str.slice(-suffixLen)}`;
  };

  // Extract relevant details based on tool type
  let details = "";

  try {
    if (toolName === "Read" && toolInput?.file_path) {
      details = ` ${truncate(toolInput.file_path, 50)}`;
    } else if (toolName === "Write" && toolInput?.file_path) {
      details = ` ${truncate(toolInput.file_path, 50)}`;
    } else if (toolName === "Edit" && toolInput?.file_path) {
      details = ` ${truncate(toolInput.file_path, 50)}`;
    } else if (toolName === "Bash" && toolInput?.command) {
      // Show abbreviated command (first line, truncated)
      const firstLine = toolInput.command.split("\n")[0];
      details = ` ${truncate(firstLine, 45)}`;
    } else if (toolName === "Glob" && toolInput?.pattern) {
      details = ` ${truncate(toolInput.pattern, 40)}`;
    } else if (toolName === "Grep" && toolInput?.pattern) {
      details = ` "${truncate(toolInput.pattern, 35)}"`;
    }
  } catch {
    // If extraction fails, just show tool name
  }

  return `🔧 ${toolName}${details}`;
}

function generateContinuationPrompt(
  cwd: string,
  iteration: number,
  sprintTask: { initiative: string; task: string } | null,
  sprintMemory?: SprintMemory,
  loopAnalysis?: LoopAnalysis
): string {
  const skillbook = loadSkillbook(cwd);
  const recentCommits = getRecentCommitMessages(cwd, 5);

  let prompt = "";

  // Header
  prompt += `# Autopilot Session ${iteration}\n\n`;

  // Current task
  if (sprintTask) {
    prompt += `## Current Task\n`;
    prompt += `Initiative: ${sprintTask.initiative}\n`;
    prompt += `Feature: ${sprintTask.task}\n\n`;
  }

  // CRITICAL: Loop warnings (show first if detected)
  if (loopAnalysis && loopAnalysis.warnings.length > 0) {
    prompt += `## 🚨 LOOP DETECTION WARNINGS\n\n`;
    prompt += `The autopilot has detected potential issues that may indicate you're stuck in a loop:\n\n`;
    for (const warning of loopAnalysis.warnings) {
      prompt += `${warning}\n`;
    }
    prompt += `\n`;

    if (loopAnalysis.blockedApproaches.length > 0) {
      prompt += `### BLOCKED APPROACHES (DO NOT TRY THESE):\n`;
      for (const blocked of loopAnalysis.blockedApproaches) {
        prompt += `- ❌ ${blocked}\n`;
      }
      prompt += `\n`;
    }

    prompt += `**YOU MUST try a fundamentally different approach.** Consider:\n`;
    prompt += `- Stepping back and re-reading the requirements\n`;
    prompt += `- Using a completely different implementation strategy\n`;
    prompt += `- Breaking the problem into smaller pieces\n`;
    prompt += `- Flagging this for human review if truly stuck\n\n`;
  }

  // Sprint memory (CRITICAL for loop prevention)
  if (sprintMemory && sprintMemory.entries.length > 0) {
    prompt += formatSprintMemoryForPrompt(sprintMemory);
  }

  // Recent progress
  if (recentCommits.length > 0) {
    prompt += `## Recent Commits\n`;
    for (const msg of recentCommits) {
      prompt += `- ${msg}\n`;
    }
    prompt += "\n";
  }

  // Skillbook learnings
  if (skillbook) {
    prompt += `## Learnings (from previous sessions)\n`;
    prompt += skillbook + "\n\n";
  }

  // Instructions
  prompt += `## Instructions\n`;
  prompt += `You are running in autopilot mode. Work autonomously until:\n`;
  prompt += `- The current feature is complete (mark it as passes: true in the sprint file)\n`;
  prompt += `- You encounter a blocker that requires human input\n`;
  prompt += `- Context is exhausted\n\n`;

  // Memory-aware instructions
  if (sprintMemory && sprintMemory.entries.length > 0) {
    prompt += `**IMPORTANT**: Review the Sprint Memory above. DO NOT repeat approaches that failed.\n`;
    prompt += `Build on what worked. Try NEW approaches if previous ones failed.\n\n`;
  }

  prompt += `Make commits frequently. When done with current feature, move to the next one.\n`;
  prompt += `Use /ship to check your progress.\n`;

  return prompt;
}

interface SessionResult {
  exitCode: number;
  timedOut: boolean;
  sessionId?: string;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Result from the independent review sub-agent
 */
interface ReviewResult {
  approved: boolean;
  critique: string;
  suggestions: string[];
}

/**
 * Result from running the test gate
 */
interface TestGateResult {
  passed: boolean;
  output: string;
  command: string;
}

/**
 * Run the binary test gate before review
 * If sprint specifies test_command, run it. Otherwise try common test commands.
 */
function runTestGate(cwd: string, testCommand?: string): TestGateResult {
  // Determine which command to run
  let command = testCommand;

  if (!command) {
    // Auto-detect test command based on project type
    if (fs.existsSync(path.join(cwd, "package.json"))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf-8"));
        if (pkg.scripts?.test && pkg.scripts.test !== "echo \"Error: no test specified\" && exit 1") {
          command = "npm test";
        }
      } catch {
        // ignore
      }
    }

    // Check for other common test patterns
    if (!command && fs.existsSync(path.join(cwd, "pytest.ini"))) {
      command = "pytest";
    }
    if (!command && fs.existsSync(path.join(cwd, "Cargo.toml"))) {
      command = "cargo test";
    }
    if (!command && fs.existsSync(path.join(cwd, "go.mod"))) {
      command = "go test ./...";
    }
  }

  if (!command) {
    // No test command found - pass the gate
    return {
      passed: true,
      output: "No test command configured or detected - skipping test gate",
      command: "none",
    };
  }

  console.log(`\n🧪 Running test gate: ${command}`);

  try {
    const output = execSync(command, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5 * 60 * 1000, // 5 minute timeout for tests
    });

    console.log(`   ✅ Tests passed!`);
    return {
      passed: true,
      output: output.slice(-500), // Last 500 chars
      command,
    };
  } catch (err) {
    const error = err as { status?: number; stdout?: string; stderr?: string };
    const output = (error.stdout || "") + (error.stderr || "");

    console.log(`   ❌ Tests FAILED (exit code: ${error.status})`);
    console.log(`   ${output.slice(-200)}`);

    return {
      passed: false,
      output: output.slice(-1000), // Last 1000 chars for failure context
      command,
    };
  }
}

/**
 * Run an independent review sub-agent with LIMITED context
 * Only sees: what was changed, quality criteria - NOT the full implementation journey
 */
async function runReviewSubAgent(
  cwd: string,
  feature: string,
  recentCommits: string[],
  changedFiles: string[],
  qualityCriteria: string[],
  maxBudget: number
): Promise<ReviewResult> {
  console.log(`\n🔍 Spawning independent review sub-agent...`);
  console.log(`   Feature: ${feature}`);
  console.log(`   Changed files: ${changedFiles.length}`);
  console.log(`   Quality criteria: ${qualityCriteria.length}`);

  // Build a focused review prompt with LIMITED context
  let reviewPrompt = `# Independent Code Review\n\n`;
  reviewPrompt += `You are an independent reviewer. You have NOT seen the implementation journey - only the results.\n`;
  reviewPrompt += `Your job is to objectively assess whether the work meets the quality criteria.\n\n`;

  reviewPrompt += `## Feature Being Reviewed\n`;
  reviewPrompt += `${feature}\n\n`;

  reviewPrompt += `## Recent Commits\n`;
  for (const commit of recentCommits.slice(0, 10)) {
    reviewPrompt += `- ${commit}\n`;
  }
  reviewPrompt += `\n`;

  reviewPrompt += `## Files Changed\n`;
  for (const file of changedFiles.slice(0, 20)) {
    reviewPrompt += `- ${file}\n`;
  }
  reviewPrompt += `\n`;

  reviewPrompt += `## Quality Criteria\n`;
  if (qualityCriteria.length > 0) {
    for (const criterion of qualityCriteria) {
      reviewPrompt += `- [ ] ${criterion}\n`;
    }
  } else {
    // Default criteria
    reviewPrompt += `- [ ] Code compiles/builds without errors\n`;
    reviewPrompt += `- [ ] Tests pass (if applicable)\n`;
    reviewPrompt += `- [ ] Changes are minimal and focused\n`;
    reviewPrompt += `- [ ] No obvious bugs or security issues\n`;
    reviewPrompt += `- [ ] Code follows existing patterns in the codebase\n`;
  }
  reviewPrompt += `\n`;

  reviewPrompt += `## Your Task\n`;
  reviewPrompt += `1. Review the changed files (use Read tool)\n`;
  reviewPrompt += `2. Run any tests if they exist\n`;
  reviewPrompt += `3. Check each quality criterion\n`;
  reviewPrompt += `4. Provide your verdict\n\n`;

  reviewPrompt += `## Required Output Format\n`;
  reviewPrompt += `End your review with a JSON block in this EXACT format:\n`;
  reviewPrompt += `\`\`\`json\n`;
  reviewPrompt += `{\n`;
  reviewPrompt += `  "approved": true/false,\n`;
  reviewPrompt += `  "critique": "Brief explanation of issues or approval",\n`;
  reviewPrompt += `  "suggestions": ["specific suggestion 1", "specific suggestion 2"]\n`;
  reviewPrompt += `}\n`;
  reviewPrompt += `\`\`\`\n`;

  const abortController = new AbortController();

  // Use a shorter timeout and budget for review
  const reviewTimeout = setTimeout(() => {
    console.log(`\n⏱️  Review timeout - aborting...`);
    abortController.abort();
  }, 5 * 60 * 1000); // 5 minute max for review

  const sdkOptions: Options = {
    model: "claude-sonnet-4-5-20250929", // Use Sonnet for reviews (faster/cheaper)
    cwd,
    maxBudgetUsd: Math.min(maxBudget, 1.0), // Cap review budget at $1
    permissionMode: "acceptEdits",
    settingSources: ["user", "project", "local"],
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: `\n\n# Review Mode\nYou are an independent code reviewer. Focus on quality assessment only. Be objective and thorough but concise.`,
    },
    abortController,
  };

  let fullResponse = "";

  try {
    for await (const msg of query({ prompt: reviewPrompt, options: sdkOptions })) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            fullResponse += block.text;
            process.stdout.write(".");
          }
        }
      }

      if (msg.type === "result") {
        console.log(` done`);
        if (msg.total_cost_usd) {
          console.log(`   Review cost: $${msg.total_cost_usd.toFixed(4)}`);
        }
      }
    }

    clearTimeout(reviewTimeout);

    // Parse the review result from the response
    const jsonMatch = fullResponse.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const result = JSON.parse(jsonMatch[1]) as ReviewResult;
        console.log(`   Verdict: ${result.approved ? "✅ APPROVED" : "❌ NEEDS WORK"}`);
        if (!result.approved) {
          console.log(`   Critique: ${result.critique}`);
        }
        return result;
      } catch {
        console.log(`   ⚠️  Could not parse review result - assuming approved`);
      }
    }

    // Default to approved if we can't parse
    return {
      approved: true,
      critique: "Review completed but no structured feedback provided",
      suggestions: [],
    };
  } catch (err) {
    clearTimeout(reviewTimeout);
    console.log(`\n   ⚠️  Review sub-agent error: ${(err as Error).message}`);
    // On error, don't block - assume approved
    return {
      approved: true,
      critique: "Review could not complete - continuing",
      suggestions: [],
    };
  }
}


async function runClaudeSession(
  cwd: string,
  prompt: string,
  options: AutopilotOptions,
  resumeSessionId?: string
): Promise<SessionResult> {
  if (options.dryRun) {
    console.log("\n📝 Would run claude with prompt:\n");
    console.log("---");
    console.log(prompt.slice(0, 500) + (prompt.length > 500 ? "..." : ""));
    console.log("---\n");
    return { exitCode: 0, timedOut: false };
  }

  const timeoutSeconds = options.timeout;
  console.log(`\n🚀 Starting Claude session (timeout: ${Math.floor(timeoutSeconds / 60)}m, budget: $${options.maxBudget})...\n`);

  // Save prompt for reference
  const promptPath = path.join(cwd, ".shiplog/current-prompt.md");
  fs.writeFileSync(promptPath, prompt);

  // Set up abort controller for timeout and interrupt handling
  const abortController = new AbortController();
  currentAbortController = abortController;

  let timedOut = false;
  let timeoutHandle: NodeJS.Timeout | null = null;

  // Set up timeout
  if (timeoutSeconds > 0) {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      console.log(`\n\n⏱️  Session timeout (${Math.floor(timeoutSeconds / 60)}m) - aborting...`);
      abortController.abort();
    }, timeoutSeconds * 1000);
  }

  // Configure SDK options
  // Autopilot uses acceptEdits + project's .claude/settings.json permissions
  // Run `shiplog init` to get a battle-tested permission config
  const sdkOptions: Options = {
    model: getModelId(options.model),
    cwd,
    maxBudgetUsd: options.maxBudget,
    permissionMode: "acceptEdits", // File edits auto-allowed, rest from settings.json
    // Load user, project, and local settings to inherit MCP servers and other config
    settingSources: ["user", "project", "local"],
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: `\n\n# Autopilot Mode\nYou are running in autopilot mode. Work autonomously until the task is complete.\nMake commits frequently. Use /ship to check progress.`,
    },
    abortController,
    // Resume from previous session if provided
    ...(resumeSessionId && { resume: resumeSessionId }),
  };

  if (resumeSessionId) {
    console.log(`🔗 Resuming session: ${resumeSessionId.slice(0, 8)}...`);
  }

  let sessionId: string | undefined;
  let costUsd: number | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;

  try {
    for await (const msg of query({ prompt, options: sdkOptions })) {
      // Extract session ID from init message
      if (msg.type === "system" && msg.subtype === "init") {
        sessionId = msg.session_id;
        console.log(`🔗 Session: ${sessionId?.slice(0, 8)}...`);
      }

      // Handle assistant messages - stream text to stdout
      if (msg.type === "assistant") {
        const content = msg.message.content;
        for (const block of content) {
          if (block.type === "text") {
            process.stdout.write(block.text);
          } else if (block.type === "tool_use") {
            console.log(`\n${formatToolUse(block.name, block.input)}`);
          }
        }
      }

      // Show tool progress
      if (msg.type === "tool_progress") {
        // Only show for long-running tools
        if (msg.elapsed_time_seconds > 2) {
          process.stdout.write(`\r   [${msg.tool_name}] ${Math.floor(msg.elapsed_time_seconds)}s...`);
        }
      }

      // Handle result (completion)
      if (msg.type === "result") {
        if (msg.usage) {
          inputTokens = msg.usage.input_tokens;
          outputTokens = msg.usage.output_tokens;
        }
        costUsd = msg.total_cost_usd;

        if (msg.subtype === "success") {
          console.log(`\n\n✅ Claude session completed`);
        } else {
          console.log(`\n\n⚠️  Session ended: ${msg.subtype}`);
          if (msg.errors?.length) {
            console.log(`   Errors: ${msg.errors.join(", ")}`);
          }
        }
      }
    }

    if (timeoutHandle) clearTimeout(timeoutHandle);
    currentAbortController = null;

    return {
      exitCode: 0,
      timedOut,
      sessionId,
      costUsd,
      inputTokens,
      outputTokens,
    };
  } catch (err) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    currentAbortController = null;

    const error = err as Error;
    if (error.name === "AbortError" || timedOut) {
      console.log(`\n⏱️  Claude session timed out`);
      return { exitCode: 1, timedOut: true, sessionId, costUsd, inputTokens, outputTokens };
    }

    console.error(`\n❌ Error in Claude session: ${error.message}`);
    return { exitCode: 1, timedOut: false, sessionId, costUsd, inputTokens, outputTokens };
  }
}

/**
 * Add critique-based learning to SKILLBOOK (v2-008)
 * When Captain catches an issue, add to SKILLBOOK so future crews avoid it
 */
function addCritiqueToSkillbook(
  cwd: string,
  feature: string,
  critique: string,
  suggestions: string[]
): void {
  const skillbookPath = path.join(cwd, "docs/SKILLBOOK.md");

  // Initialize skillbook if it doesn't exist
  if (!fs.existsSync(skillbookPath)) {
    const template = `# Skillbook

> Learnings accumulated across autopilot sessions. Updated automatically.

## What Works

<!-- Patterns that lead to successful outcomes -->

## What To Avoid

<!-- Patterns that caused issues -->

## Captain's Notes

<!-- Issues caught during review -->

## Patterns

<!-- Common patterns observed in this codebase -->

---

*Last updated: ${new Date().toISOString()}*
`;
    fs.writeFileSync(skillbookPath, template);
    console.log("📚 Created docs/SKILLBOOK.md");
  }

  let content = fs.readFileSync(skillbookPath, "utf-8");

  // Add Captain's notes section if it doesn't exist
  if (!content.includes("## Captain's Notes")) {
    const patternsSection = content.indexOf("## Patterns");
    if (patternsSection !== -1) {
      content = content.slice(0, patternsSection) +
        `## Captain's Notes\n\n<!-- Issues caught during review -->\n\n` +
        content.slice(patternsSection);
    }
  }

  // Add the critique to Captain's Notes
  const captainSection = content.indexOf("## Captain's Notes");
  if (captainSection !== -1) {
    const insertPoint = content.indexOf("\n\n", captainSection + 20) + 2;

    let entry = `### ${new Date().toISOString().slice(0, 10)}: ${feature}\n`;
    entry += `- **Issue**: ${critique}\n`;
    if (suggestions.length > 0) {
      entry += `- **Suggestions**: ${suggestions.join("; ")}\n`;
    }
    entry += `\n`;

    content = content.slice(0, insertPoint) + entry + content.slice(insertPoint);

    // Update timestamp
    content = content.replace(
      /\*Last updated:.*\*/,
      `*Last updated: ${new Date().toISOString()}*`
    );

    fs.writeFileSync(skillbookPath, content);
    console.log(`📚 Added critique to SKILLBOOK Captain's Notes`);
  }
}

function extractLearnings(
  cwd: string,
  sessionLog: SessionLog,
  commitMessages: string[]
): void {
  const skillbookPath = path.join(cwd, "docs/SKILLBOOK.md");

  // Initialize skillbook if it doesn't exist
  if (!fs.existsSync(skillbookPath)) {
    const template = `# Skillbook

> Learnings accumulated across autopilot sessions. Updated automatically.

## What Works

<!-- Patterns that lead to successful outcomes -->

## What To Avoid

<!-- Patterns that caused issues -->

## Patterns

<!-- Common patterns observed in this codebase -->

---

*Last updated: ${new Date().toISOString()}*
`;
    fs.writeFileSync(skillbookPath, template);
    console.log("📚 Created docs/SKILLBOOK.md");
  }

  // Analyze commits for patterns
  const successPatterns: string[] = [];
  const failurePatterns: string[] = [];

  for (const msg of commitMessages) {
    const lowerMsg = msg.toLowerCase();

    // Detect fix commits (indicates something was wrong)
    if (lowerMsg.includes("fix") || lowerMsg.includes("revert")) {
      failurePatterns.push(`- Needed fix: "${msg}"`);
    }

    // Detect test-related commits (good pattern)
    if (lowerMsg.includes("test") && !lowerMsg.includes("fix")) {
      successPatterns.push(`- Tests added/updated: "${msg}"`);
    }
  }

  // Only update if we have learnings
  if (successPatterns.length > 0 || failurePatterns.length > 0) {
    let content = fs.readFileSync(skillbookPath, "utf-8");

    if (successPatterns.length > 0) {
      const successSection = content.indexOf("## What Works");
      if (successSection !== -1) {
        const insertPoint =
          content.indexOf("\n\n", successSection) + 2 ||
          content.indexOf("\n", successSection) + 1;
        content =
          content.slice(0, insertPoint) +
          successPatterns.join("\n") +
          "\n" +
          content.slice(insertPoint);
      }
    }

    if (failurePatterns.length > 0) {
      const avoidSection = content.indexOf("## What To Avoid");
      if (avoidSection !== -1) {
        const insertPoint =
          content.indexOf("\n\n", avoidSection) + 2 ||
          content.indexOf("\n", avoidSection) + 1;
        content =
          content.slice(0, insertPoint) +
          failurePatterns.join("\n") +
          "\n" +
          content.slice(insertPoint);
      }
    }

    // Update timestamp
    content = content.replace(
      /\*Last updated:.*\*/,
      `*Last updated: ${new Date().toISOString()}*`
    );

    fs.writeFileSync(skillbookPath, content);
    console.log(
      `📚 Updated SKILLBOOK.md with ${successPatterns.length + failurePatterns.length} learnings`
    );
  }
}

export const autopilotCommand = new Command("autopilot")
  .description(
    `Let Claude drive your project autonomously for hours.

WHAT IT DOES
  Runs Claude Code in a loop. Each session works on your sprint until context
  fills up. Then autopilot extracts learnings, restarts Claude with fresh
  context + accumulated knowledge, and continues. Walk away. Come back to
  finished work.

THE LOOP
  ┌─────────────────────────────────────────────────────────────────────┐
  │  1. START    → Claude reads sprint, picks next feature, works on it │
  │  2. WORK     → Claude commits frequently, updates sprint progress   │
  │  3. EXIT     → Context fills up, Claude exits naturally             │
  │  4. LEARN    → Autopilot extracts learnings from commits            │
  │  5. RESTART  → Fresh Claude session with learnings injected         │
  │  6. REPEAT   → Until sprint complete or stall detected              │
  └─────────────────────────────────────────────────────────────────────┘

WHAT YOU'LL SEE
  ============================================================
    🚁 Shiplog Autopilot
  ============================================================

  📋 Initiative: Add user authentication
  📌 Current task: Implement login form
  🔄 Max iterations: 20
  ⏸️  Stall threshold: 3 iterations

  ------------------------------------------------------------
    SESSION 1/20
  ------------------------------------------------------------
  🚀 Starting Claude session...

  [Claude works here - you'll see its output]

  📊 Session 1 Results:
     Commits made: 7
     Total commits: 7
  📚 Updated SKILLBOOK.md with 2 learnings

  ⏳ Starting next iteration in 3 seconds...

SAFETY & GUARDRAILS
  • Stall detection   - Stops if no commits for N sessions (default: 3)
  • Max iterations    - Hard limit on sessions (default: 20)
  • Git-based         - Only counts real commits as progress
  • Interruptible     - Ctrl+C stops cleanly, state is saved
  • Dry-run mode      - Preview everything without running Claude

PREREQUISITES
  1. Active sprint file in docs/sprints/ with status: "in_progress"
  2. At least one feature with passes: false
  3. Git repository (commits are how progress is measured)

  No sprint? Run 'claude' first and use /ship to create one.

FILES CREATED
  .shiplog/                    - Session data directory (gitignored)
  .shiplog/autopilot-state.json - Current run state (resume support)
  .shiplog/sessions/           - Individual session logs
  docs/SKILLBOOK.md            - Accumulated learnings (persists)

EXAMPLES
  $ shiplog autopilot              # Start with sensible defaults (Sonnet)
  $ shiplog autopilot --dry-run    # See what would happen, don't run
  $ shiplog autopilot -m opus      # Use Claude Opus (slower, more capable)
  $ shiplog autopilot -m haiku     # Use Claude Haiku (faster, cheaper)
  $ shiplog autopilot -n 50        # Allow up to 50 sessions
  $ shiplog autopilot -s 5         # More patience before stall detection
  $ shiplog autopilot -n 10 -s 2   # Quick run, fail fast on stalls`
  )
  .option(
    "-n, --max-iterations <n>",
    "Max Claude sessions before stopping (default: 20)",
    "20"
  )
  .option(
    "-s, --stall-threshold <n>",
    "Sessions without commits before declaring stall (default: 3)",
    "3"
  )
  .option(
    "-t, --timeout <seconds>",
    "Session timeout in seconds (default: 1800 = 30 minutes)",
    "1800"
  )
  .option(
    "-r, --max-retries <n>",
    "Max retries per session on failure (default: 2)",
    "2"
  )
  .option(
    "-b, --max-budget <usd>",
    "Max budget per session in USD (default: 5.0)",
    "5.0"
  )
  .option(
    "-m, --model <name>",
    "Claude model to use: sonnet (default), opus, or haiku",
    "sonnet"
  )
  .option(
    "--resume",
    "Continue from interrupted autopilot run",
    false
  )
  .option(
    "--fresh",
    "Start fresh, ignore any existing state",
    false
  )
  .option(
    "--dry-run",
    "Preview the prompt and settings without running Claude",
    false
  )
  .action(async (options: AutopilotOptions) => {
    const cwd = process.cwd();

    // Set up interrupt handling for graceful Ctrl+C
    currentCwd = cwd;
    setupInterruptHandler();

    // Parse numeric options
    const maxIterations =
      typeof options.maxIterations === "string"
        ? parseInt(options.maxIterations, 10)
        : options.maxIterations;
    const stallThreshold =
      typeof options.stallThreshold === "string"
        ? parseInt(options.stallThreshold, 10)
        : options.stallThreshold;
    const timeout =
      typeof options.timeout === "string"
        ? parseInt(options.timeout, 10)
        : options.timeout;
    const maxRetries =
      typeof options.maxRetries === "string"
        ? parseInt(options.maxRetries, 10)
        : options.maxRetries;
    const maxBudget =
      typeof options.maxBudget === "string"
        ? parseFloat(options.maxBudget)
        : options.maxBudget;
    const model =
      typeof options.model === "string"
        ? options.model
        : "sonnet";

    console.log("\n" + "=".repeat(60));
    console.log("  🚁 Shiplog Autopilot");
    console.log("=".repeat(60));

    // Check for existing sprint
    const sprintTask = getCurrentSprintTask(cwd);
    if (!sprintTask) {
      console.log("\n❌ No active sprint found.\n");
      console.log("   Create a sprint first:");
      console.log("   1. Run 'claude' and use /ship to plan a new initiative");
      console.log("   2. Then run 'shiplog autopilot' to work on it\n");
      process.exit(1);
    }

    console.log(`\n📋 Initiative: ${sprintTask.initiative}`);
    console.log(`📌 Current task: ${sprintTask.task}`);
    console.log(`🤖 Model: ${model} (${getModelId(model)})`);
    console.log(`🔄 Max iterations: ${maxIterations}`);
    console.log(`⏸️  Stall threshold: ${stallThreshold} iterations`);
    console.log(`⏱️  Session timeout: ${Math.floor(timeout / 60)} minutes`);
    console.log(`💰 Budget per session: $${maxBudget}`);

    if (options.dryRun) {
      console.log(`\n🧪 DRY RUN MODE - No actual execution\n`);
    }

    // Ensure .shiplog directory exists
    ensureShiplogDir(cwd);

    // Load or create sprint memory for this initiative
    const sprintFile = getCurrentSprintFile(cwd) || "unknown";
    let sprintMemory = loadSprintMemory(cwd, sprintTask.initiative, sprintFile);

    if (sprintMemory.entries.length > 0) {
      console.log(`\n📝 Sprint memory: ${sprintMemory.entries.length} previous iteration(s)`);
      const failures = sprintMemory.entries.flatMap(e => e.failures);
      if (failures.length > 0) {
        console.log(`   ⚠️  ${failures.length} known failure(s) to avoid`);
      }
    }

    // Handle resume/fresh flags
    const existingState = loadState(cwd);
    let state: AutopilotState;

    if (options.fresh) {
      // Start fresh - ignore existing state and sprint memory
      console.log("\n🆕 Starting fresh (--fresh flag)");

      // Archive existing sprint memory if any
      const memoryPath = getSprintMemoryPath(cwd);
      if (fs.existsSync(memoryPath)) {
        const archivePath = path.join(cwd, `.shiplog/sprint-memory-${Date.now()}.json`);
        fs.renameSync(memoryPath, archivePath);
        console.log(`   📦 Archived sprint memory to ${path.basename(archivePath)}`);
      }

      // Create fresh sprint memory
      sprintMemory = {
        initiative: sprintTask.initiative,
        sprintFile,
        started: new Date().toISOString(),
        entries: [],
      };

      state = {
        initiative: sprintTask.initiative,
        started: new Date().toISOString(),
        iterations: 0,
        totalCommits: 0,
        stallCount: 0,
        sessions: [],
        status: "running",
      };
    } else if (options.resume) {
      // Resume from existing state
      if (!existingState) {
        console.log("\n❌ No existing state to resume from.");
        console.log("   Run without --resume to start fresh.\n");
        process.exit(1);
      }
      if (existingState.status === "completed") {
        console.log("\n✅ Previous run completed successfully.");
        console.log("   Run with --fresh to start a new run.\n");
        process.exit(0);
      }
      console.log("\n▶️  Resuming from interrupted run (--resume flag)");
      console.log(`   Previous sessions: ${existingState.sessions.length}`);
      console.log(`   Previous commits: ${existingState.totalCommits}`);
      state = existingState;
      state.status = "running";
    } else if (existingState && existingState.status === "interrupted") {
      // Auto-resume interrupted runs
      console.log("\n▶️  Resuming interrupted run");
      console.log(`   Previous sessions: ${existingState.sessions.length}`);
      console.log(`   Previous commits: ${existingState.totalCommits}`);
      console.log("   (Use --fresh to start over)");
      state = existingState;
      state.status = "running";
    } else {
      // Start fresh
      state = {
        initiative: sprintTask.initiative,
        started: new Date().toISOString(),
        iterations: 0,
        totalCommits: 0,
        stallCount: 0,
        sessions: [],
        status: "running",
      };
    }

    // Track state for interrupt handler
    currentState = state;

    // Main loop
    let iteration = state.iterations;
    let stallCount = state.stallCount;

    while (iteration < maxIterations) {
      iteration++;

      console.log("\n" + "-".repeat(60));
      console.log(`  SESSION ${iteration}/${maxIterations}`);
      console.log("-".repeat(60));

      // Track incomplete features BEFORE session (for review detection)
      // IMPORTANT: Track the sprint file path so we can re-read it after session
      // even if the crew marks it as "completed" (which would make getCurrentSprint return null)
      const sprintFilePath = getCurrentSprintFile(cwd);
      const sprintBefore = sprintFilePath ? getSprintByPath(cwd, sprintFilePath) : null;
      const incompleteFeaturesBeforeSession = sprintBefore?.features
        ?.filter(f => !f.passes)
        .map(f => f.description) || [];

      const startCommits = getCommitCount(cwd);

      // Create session log
      const sessionLog: SessionLog = {
        sessionId: `session-${Date.now()}`,
        iteration,
        startTime: new Date().toISOString(),
        startCommits,
        status: "running",
      };
      state.sessions.push(sessionLog);
      state.iterations = iteration;

      // Analyze sprint memory for loop patterns before starting
      const loopAnalysis = analyzeSprintMemoryForLoops(sprintMemory);

      if (loopAnalysis.warnings.length > 0) {
        console.log("\n🔍 Loop Analysis:");
        for (const warning of loopAnalysis.warnings) {
          console.log(`   ${warning}`);
        }
      }

      // If severe loop detected, warn but continue (could make this blocking)
      if (loopAnalysis.hasLoop) {
        console.log("\n⚠️  Potential loop detected - injecting warnings into prompt");
        // Future: Could add --strict mode that stops here and requires human intervention
      }

      // Generate prompt with learnings, sprint memory, and loop warnings
      const prompt = generateContinuationPrompt(cwd, iteration, sprintTask, sprintMemory, loopAnalysis);

      // Run Claude session with retry logic
      let exitCode = 0;
      let timedOut = false;
      let retriesUsed = 0;
      let costUsd: number | undefined;
      let inputTokens: number | undefined;
      let outputTokens: number | undefined;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          // Exponential backoff: 5s, 10s, 20s, etc.
          const backoffSeconds = 5 * Math.pow(2, attempt - 1);
          console.log(`\n🔄 Retry ${attempt}/${maxRetries} in ${backoffSeconds}s...`);
          await new Promise((resolve) => setTimeout(resolve, backoffSeconds * 1000));
        }

        const result = await runClaudeSession(cwd, prompt, {
          ...options,
          maxIterations,
          stallThreshold,
          timeout,
          maxRetries,
          maxBudget,
          model,
        }, state.currentSessionId);

        exitCode = result.exitCode;
        timedOut = result.timedOut;
        costUsd = result.costUsd;
        inputTokens = result.inputTokens;
        outputTokens = result.outputTokens;

        // Store session ID for potential resume
        if (result.sessionId) {
          state.currentSessionId = result.sessionId;
        }

        // Accumulate total cost
        if (costUsd !== undefined) {
          state.totalCostUsd = (state.totalCostUsd || 0) + costUsd;
        }

        // Success or timeout (don't retry timeouts)
        if (exitCode === 0 || timedOut) {
          break;
        }

        // Non-zero exit code - will retry if attempts remain
        retriesUsed = attempt + 1;
        if (attempt < maxRetries) {
          console.log(`\n⚠️  Claude exited with code ${exitCode}, will retry...`);
        } else {
          console.log(`\n❌ Claude failed after ${maxRetries + 1} attempts (exit code: ${exitCode})`);
        }
      }

      // Update session log
      const endCommits = getCommitCount(cwd);
      const commitsMade = endCommits - startCommits;

      // Check for file changes (soft progress)
      const { changedFiles, sprintFileModified, changedPaths } = getFileChanges(cwd);

      const endTime = new Date().toISOString();
      const durationSeconds = Math.floor(
        (new Date(endTime).getTime() - new Date(sessionLog.startTime).getTime()) / 1000
      );

      sessionLog.endTime = endTime;
      sessionLog.durationSeconds = durationSeconds;
      sessionLog.endCommits = endCommits;
      sessionLog.commitsMade = commitsMade;
      sessionLog.filesChanged = changedFiles;
      sessionLog.sprintUpdated = sprintFileModified;
      sessionLog.exitCode = exitCode;
      sessionLog.timedOut = timedOut;
      sessionLog.retriesUsed = retriesUsed;
      sessionLog.costUsd = costUsd;
      sessionLog.inputTokens = inputTokens;
      sessionLog.outputTokens = outputTokens;
      sessionLog.status = timedOut ? "timeout" : (exitCode !== 0 ? "error" : "completed");

      state.totalCommits += commitsMade;

      // Accumulate total duration
      if (durationSeconds !== undefined) {
        state.totalDurationSeconds = (state.totalDurationSeconds || 0) + durationSeconds;
      }

      console.log(`\n📊 Session ${iteration} Results:`);
      console.log(`   Duration: ${formatDuration(durationSeconds)}`);
      console.log(`   Commits made: ${commitsMade}`);
      console.log(`   Files changed: ${changedFiles}${sprintFileModified ? " (sprint updated)" : ""}`);
      if (retriesUsed > 0) {
        console.log(`   Retries used: ${retriesUsed}/${maxRetries}`);
      }
      if (costUsd !== undefined) {
        console.log(`   Cost: $${costUsd.toFixed(4)}`);
      }
      if (inputTokens && outputTokens) {
        console.log(`   Tokens: ${inputTokens.toLocaleString()} in / ${outputTokens.toLocaleString()} out`);
      }
      console.log(`   Total commits: ${state.totalCommits}`);

      // Extract learnings
      const recentCommits = getRecentCommitMessages(cwd, commitsMade || 5);
      extractLearnings(cwd, sessionLog, recentCommits);

      // Update sprint memory with this iteration's results
      const memoryResult: "success" | "partial" | "failure" =
        commitsMade > 0 ? "success" :
        changedFiles > 0 ? "partial" : "failure";

      // Extract approach from commit messages (what was tried)
      const approach = recentCommits.length > 0
        ? recentCommits.slice(0, 3).join("; ")
        : `Session ${iteration} - ${memoryResult === "failure" ? "no commits made" : "files modified but not committed"}`;

      // Extract learnings and failures from commit patterns
      const learnings: string[] = [];
      const failures: string[] = [];

      for (const msg of recentCommits) {
        const lowerMsg = msg.toLowerCase();
        if (lowerMsg.includes("fix") || lowerMsg.includes("revert")) {
          failures.push(`Had to fix/revert: ${msg}`);
        }
        if (lowerMsg.includes("test") && !lowerMsg.includes("fix")) {
          learnings.push(`Tests: ${msg}`);
        }
      }

      // If no progress, record as failure to avoid
      if (memoryResult === "failure") {
        failures.push(`Session ${iteration} made no progress on "${sprintTask.task}" - may need different approach`);
      }

      const memoryEntry: SprintMemoryEntry = {
        iteration,
        timestamp: new Date().toISOString(),
        feature: sprintTask.task,
        approach,
        result: memoryResult,
        commits: commitsMade,
        learnings,
        failures,
      };

      addSprintMemoryEntry(sprintMemory, memoryEntry);
      saveSprintMemory(cwd, sprintMemory);
      console.log(`📝 Sprint memory updated (iteration ${iteration})`);

      // REVIEW PHASE: Check if any features were newly marked complete
      // Re-read the SAME sprint file we tracked before (even if status changed to "completed")
      const sprintAfter = sprintFilePath ? getSprintByPath(cwd, sprintFilePath) : null;
      const newlyCompletedFeatures = getNewlyCompletedFeatures(
        incompleteFeaturesBeforeSession,
        sprintAfter
      );

      if (newlyCompletedFeatures.length > 0 && !options.dryRun) {
        console.log(`\n🎯 ${newlyCompletedFeatures.length} feature(s) marked complete - running quality gates...`);

        // BINARY TEST GATE: Run tests first (instant rejection if fails)
        const testCommand = sprintAfter?.context?.test_command;
        const testResult = runTestGate(cwd, testCommand);

        if (!testResult.passed) {
          console.log(`\n🚫 TEST GATE FAILED - skipping review phase`);

          // Mark all newly completed features as failed
          for (const feature of newlyCompletedFeatures) {
            // Mark feature as not-passed in sprint file
            const sprintFilePath = path.join(cwd, sprintFile);
            if (fs.existsSync(sprintFilePath)) {
              try {
                const sprintData = JSON.parse(fs.readFileSync(sprintFilePath, "utf-8"));
                const featureToUpdate = sprintData.features?.find(
                  (f: SprintFeature) => f.description === feature.description
                );
                if (featureToUpdate) {
                  featureToUpdate.passes = false;
                  fs.writeFileSync(sprintFilePath, JSON.stringify(sprintData, null, 2) + "\n");
                }
              } catch {
                // ignore
              }
            }

            // Add test failure to sprint memory
            const lastEntry = sprintMemory.entries[sprintMemory.entries.length - 1];
            if (lastEntry) {
              lastEntry.critique = `Tests failed: ${testResult.command}`;
              lastEntry.result = "failure";
              lastEntry.failures.push(`TEST GATE FAILED: ${testResult.output.slice(0, 200)}`);
              saveSprintMemory(cwd, sprintMemory);
            }
          }

          console.log(`   📝 Features marked as needs-work - must fix tests before review`);
        } else {
          // Tests passed - proceed to review phase
          for (const feature of newlyCompletedFeatures) {
            // Get quality criteria from sprint config or use defaults
            const qualityCriteria = sprintAfter?.context?.quality_criteria || [];

            // Run independent review
            const reviewResult = await runReviewSubAgent(
            cwd,
            feature.description,
            recentCommits,
            changedPaths,
            qualityCriteria,
            maxBudget
          );

          if (!reviewResult.approved) {
            console.log(`\n❌ Review FAILED for: ${feature.description}`);
            console.log(`   Critique: ${reviewResult.critique}`);

            // Add critique to SKILLBOOK for future crews (v2-008)
            addCritiqueToSkillbook(
              cwd,
              feature.description,
              reviewResult.critique,
              reviewResult.suggestions
            );

            // Mark feature as not-passed in sprint file
            const sprintFilePath = path.join(cwd, sprintFile);
            if (fs.existsSync(sprintFilePath)) {
              try {
                const sprintData = JSON.parse(fs.readFileSync(sprintFilePath, "utf-8"));
                const featureToUpdate = sprintData.features?.find(
                  (f: SprintFeature) => f.description === feature.description
                );
                if (featureToUpdate) {
                  featureToUpdate.passes = false;
                  fs.writeFileSync(sprintFilePath, JSON.stringify(sprintData, null, 2) + "\n");
                  console.log(`   📝 Feature marked as needs-work in sprint file`);
                }
              } catch {
                console.log(`   ⚠️  Could not update sprint file`);
              }
            }

            // Add critique to sprint memory for next iteration (v2-004: critique injection)
            const lastEntry = sprintMemory.entries[sprintMemory.entries.length - 1];
            if (lastEntry) {
              lastEntry.critique = reviewResult.critique;
              lastEntry.result = "partial"; // Downgrade from success to partial
              lastEntry.failures.push(`Review failed: ${reviewResult.critique}`);
              if (reviewResult.suggestions.length > 0) {
                lastEntry.failures.push(`Suggestions: ${reviewResult.suggestions.join("; ")}`);
              }
              saveSprintMemory(cwd, sprintMemory);
              console.log(`   📝 Critique added to sprint memory for next iteration`);
            }
          } else {
            console.log(`\n✅ Review PASSED for: ${feature.description}`);
          }
          }
        }
      }

      // Save state
      saveState(cwd, state);

      // Check for stall using improved progress detection
      // - Commits = hard progress (reset stall)
      // - File changes = soft progress (don't increment stall)
      // - No changes = increment stall
      if (commitsMade > 0) {
        stallCount = 0; // Hard progress: reset stall counter
        console.log(`\n✅ Progress made: ${commitsMade} commit(s)`);
      } else if (changedFiles > 0) {
        // Soft progress: don't increment stall counter
        console.log(`\n📝 Soft progress: ${changedFiles} file(s) changed (not committed)`);
        if (sprintFileModified) {
          console.log(`   Sprint file updated - work in progress`);
        }
      } else {
        // No progress at all
        stallCount++;
        console.log(`\n⚠️  No progress this session (${stallCount}/${stallThreshold})`);

        if (stallCount >= stallThreshold) {
          console.log("\n🛑 STALLED - No progress for multiple iterations.\n");
          state.status = "stalled";
          saveState(cwd, state);
          break;
        }
      }

      state.stallCount = stallCount;

      // Check if sprint is complete
      const currentTask = getCurrentSprintTask(cwd);
      if (!currentTask) {
        console.log("\n🎉 Sprint complete! All features pass.\n");
        state.status = "completed";
        saveState(cwd, state);
        break;
      }

      // Small delay before next iteration
      if (!options.dryRun && iteration < maxIterations) {
        console.log("\n⏳ Starting next iteration in 3 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    // Final summary
    console.log("\n" + "=".repeat(60));
    console.log("  AUTOPILOT SUMMARY");
    console.log("=".repeat(60));
    console.log(`\nInitiative: ${sprintTask.initiative}`);
    console.log(`Sessions: ${state.sessions.length}`);
    console.log(`Total commits: ${state.totalCommits}`);
    if (state.totalDurationSeconds !== undefined) {
      console.log(`Total time: ${formatDuration(state.totalDurationSeconds)}`);
    }
    if (state.totalCostUsd !== undefined) {
      console.log(`Total cost: $${state.totalCostUsd.toFixed(4)}`);
    }
    console.log(`Status: ${state.status}`);
    console.log(`\nSession logs: .shiplog/autopilot-state.json\n`);

    if (state.status === "stalled") {
      process.exit(1);
    }
  });
