import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { spawn, execSync, ChildProcess } from "child_process";

// Module-level state for interrupt handling
let currentClaudeProcess: ChildProcess | null = null;
let currentState: AutopilotState | null = null;
let currentCwd: string | null = null;
let isInterrupted = false;

interface AutopilotOptions {
  maxIterations: number;
  stallThreshold: number;
  timeout: number; // Session timeout in seconds
  dryRun: boolean;
}

interface SessionLog {
  sessionId: string;
  iteration: number;
  startTime: string;
  endTime?: string;
  startCommits: number;
  endCommits?: number;
  commitsMade?: number;
  exitCode?: number;
  timedOut?: boolean;
  status: "running" | "completed" | "stalled" | "error" | "timeout";
}

interface AutopilotState {
  initiative: string;
  started: string;
  iterations: number;
  totalCommits: number;
  stallCount: number;
  sessions: SessionLog[];
  status: "running" | "completed" | "stalled" | "interrupted";
}

function handleInterrupt(): void {
  if (isInterrupted) return; // Prevent double handling
  isInterrupted = true;

  console.log("\n\n⚠️  Interrupt received (Ctrl+C)");
  console.log("💾 Saving state...");

  // Kill Claude process if running
  if (currentClaudeProcess && !currentClaudeProcess.killed) {
    console.log("🛑 Stopping Claude session...");
    currentClaudeProcess.kill("SIGTERM");
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

function loadSkillbook(cwd: string): string {
  const skillbookPath = path.join(cwd, "docs/SKILLBOOK.md");
  if (fs.existsSync(skillbookPath)) {
    return fs.readFileSync(skillbookPath, "utf-8");
  }
  return "";
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

function generateContinuationPrompt(
  cwd: string,
  iteration: number,
  sprintTask: { initiative: string; task: string } | null
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
  prompt += `Make commits frequently. When done with current feature, move to the next one.\n`;
  prompt += `Use /ship to check your progress.\n`;

  return prompt;
}

function runClaudeSession(
  cwd: string,
  prompt: string,
  options: AutopilotOptions
): Promise<{ exitCode: number; output: string; timedOut: boolean }> {
  if (options.dryRun) {
    console.log("\n📝 Would run claude with prompt:\n");
    console.log("---");
    console.log(prompt.slice(0, 500) + (prompt.length > 500 ? "..." : ""));
    console.log("---\n");
    return Promise.resolve({ exitCode: 0, output: "(dry run)", timedOut: false });
  }

  const timeoutSeconds = options.timeout;
  console.log(`\n🚀 Starting Claude session (timeout: ${Math.floor(timeoutSeconds / 60)}m)...\n`);

  // Save prompt for reference
  const promptPath = path.join(cwd, ".shiplog/current-prompt.md");
  fs.writeFileSync(promptPath, prompt);

  return new Promise((resolve) => {
    let timedOut = false;
    let timeoutHandle: NodeJS.Timeout | null = null;

    // Use async spawn for real-time streaming to terminal
    // Key insight from Agent SDK: real-time output requires async event-based approach
    const claude = spawn("claude", ["--print"], {
      cwd,
      stdio: ["pipe", "inherit", "inherit"],  // stdin=pipe, stdout/stderr=terminal
      env: { ...process.env },
    });

    // Track process for interrupt handling
    currentClaudeProcess = claude;

    // Set up timeout
    if (timeoutSeconds > 0) {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        console.log(`\n\n⏱️  Session timeout (${Math.floor(timeoutSeconds / 60)}m) - killing Claude process...`);
        if (!claude.killed) {
          claude.kill("SIGTERM");
        }
      }, timeoutSeconds * 1000);
    }

    // Write prompt to stdin and close it
    claude.stdin.write(prompt);
    claude.stdin.end();

    claude.on("close", (code) => {
      currentClaudeProcess = null;
      if (timeoutHandle) clearTimeout(timeoutHandle);

      const exitCode = code ?? 0;
      if (timedOut) {
        console.log(`\n⏱️  Claude session timed out (exit code: ${exitCode})`);
      } else {
        console.log(`\n✅ Claude session ended (exit code: ${exitCode})`);
      }
      resolve({ exitCode, output: "", timedOut });
    });

    claude.on("error", (err) => {
      currentClaudeProcess = null;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      console.error(`\n❌ Error starting Claude: ${err.message}`);
      resolve({ exitCode: 1, output: "", timedOut: false });
    });
  });
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
  $ shiplog autopilot              # Start with sensible defaults
  $ shiplog autopilot --dry-run    # See what would happen, don't run
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
    console.log(`🔄 Max iterations: ${maxIterations}`);
    console.log(`⏸️  Stall threshold: ${stallThreshold} iterations`);
    console.log(`⏱️  Session timeout: ${Math.floor(timeout / 60)} minutes`);

    if (options.dryRun) {
      console.log(`\n🧪 DRY RUN MODE - No actual execution\n`);
    }

    // Ensure .shiplog directory exists
    ensureShiplogDir(cwd);

    // Initialize or load state
    let state: AutopilotState = loadState(cwd) || {
      initiative: sprintTask.initiative,
      started: new Date().toISOString(),
      iterations: 0,
      totalCommits: 0,
      stallCount: 0,
      sessions: [],
      status: "running",
    };

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

      // Generate prompt with learnings
      const prompt = generateContinuationPrompt(cwd, iteration, sprintTask);

      // Run Claude session
      const { exitCode, timedOut } = await runClaudeSession(cwd, prompt, {
        ...options,
        maxIterations,
        stallThreshold,
        timeout,
      });

      // Update session log
      const endCommits = getCommitCount(cwd);
      const commitsMade = endCommits - startCommits;

      sessionLog.endTime = new Date().toISOString();
      sessionLog.endCommits = endCommits;
      sessionLog.commitsMade = commitsMade;
      sessionLog.exitCode = exitCode;
      sessionLog.timedOut = timedOut;
      sessionLog.status = timedOut ? "timeout" : "completed";

      state.totalCommits += commitsMade;

      console.log(`\n📊 Session ${iteration} Results:`);
      console.log(`   Commits made: ${commitsMade}`);
      console.log(`   Total commits: ${state.totalCommits}`);

      // Extract learnings
      const recentCommits = getRecentCommitMessages(cwd, commitsMade || 5);
      extractLearnings(cwd, sessionLog, recentCommits);

      // Save state
      saveState(cwd, state);

      // Check for stall
      if (commitsMade === 0) {
        stallCount++;
        console.log(`\n⚠️  No commits this session (${stallCount}/${stallThreshold})`);

        if (stallCount >= stallThreshold) {
          console.log("\n🛑 STALLED - No progress for multiple iterations.\n");
          state.status = "stalled";
          saveState(cwd, state);
          break;
        }
      } else {
        stallCount = 0; // Reset on progress
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
    console.log(`Status: ${state.status}`);
    console.log(`\nSession logs: .shiplog/autopilot-state.json\n`);

    if (state.status === "stalled") {
      process.exit(1);
    }
  });
