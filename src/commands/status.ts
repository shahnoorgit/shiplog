import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";

interface SprintFeature {
  id: string;
  description: string;
  passes: boolean;
  [key: string]: unknown;
}

interface SprintFile {
  initiative: string;
  created: string;
  status: string;
  features: SprintFeature[];
  [key: string]: unknown;
}

interface SessionMetadata {
  timestamp: string;
  reason: string;
  files_changed: string[];
  recent_commits: string[];
}

interface StatusOptions {
  json: boolean;
  sprint?: string;
}

export const statusCommand = new Command("status")
  .description(
    "Show current sprint status and progress.\n\n" +
      "Displays the active sprint, feature completion, and last session info.\n\n" +
      "Examples:\n" +
      "  $ shiplog status              # Show current sprint status\n" +
      "  $ shiplog status --json       # Output as JSON\n" +
      "  $ shiplog status -s my-sprint # Show specific sprint"
  )
  .option("--json", "Output as JSON for scripting", false)
  .option("-s, --sprint <name>", "Show a specific sprint file")
  .action(async (options: StatusOptions) => {
    const cwd = process.cwd();
    const docsDir = path.join(cwd, "docs");
    const sprintsDir = path.join(cwd, "docs/sprints");

    // ========================================
    // Check 1: Shiplog initialized
    // ========================================
    if (!fs.existsSync(docsDir)) {
      console.error("❌ No shiplog installation found.");
      console.error("   Run 'shiplog init' to set up this project.");
      process.exit(1);
    }

    // Get project name from directory
    const projectName = path.basename(cwd);

    // ========================================
    // Find active sprint
    // ========================================
    const sprint = findActiveSprint(sprintsDir, options.sprint);

    // ========================================
    // Get last session metadata
    // ========================================
    const lastSession = getLastSessionMetadata(cwd);

    // ========================================
    // Build status object
    // ========================================
    const status = buildStatusOutput(projectName, sprint, lastSession);

    // ========================================
    // Output
    // ========================================
    if (options.json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      printStatus(status);
    }
  });

// ========================================
// Helper: Find active sprint
// ========================================
interface SprintWithFile extends SprintFile {
  _file: string;
}

function findActiveSprint(sprintsDir: string, sprintName?: string): SprintWithFile | null {
  if (!fs.existsSync(sprintsDir)) {
    return null;
  }

  const sprintFiles = fs.readdirSync(sprintsDir)
    .filter(f => f.endsWith(".json"))
    .map(f => ({
      name: f,
      path: path.join(sprintsDir, f),
      mtime: fs.statSync(path.join(sprintsDir, f)).mtime.getTime()
    }))
    .sort((a, b) => b.mtime - a.mtime);

  if (sprintFiles.length === 0) {
    return null;
  }

  // Find specific sprint or use most recent
  let targetFile = sprintFiles[0];
  if (sprintName) {
    const found = sprintFiles.find(f =>
      f.name.includes(sprintName) ||
      f.name === `${sprintName}.json`
    );
    if (found) {
      targetFile = found;
    } else {
      console.error(`❌ Sprint file not found: ${sprintName}`);
      console.error("   Available sprints:");
      for (const file of sprintFiles) {
        console.error(`     - ${file.name.replace(".json", "")}`);
      }
      process.exit(1);
    }
  }

  try {
    const content = fs.readFileSync(targetFile.path, "utf-8");
    const sprint = JSON.parse(content) as SprintFile;
    return { ...sprint, _file: targetFile.name };
  } catch (error) {
    console.error(`❌ Failed to parse sprint file: ${targetFile.name}`);
    console.error(`   ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// ========================================
// Helper: Get last session metadata
// ========================================
interface LastSession {
  timestamp: string;
  timeAgo: string;
  reason: string;
  filesChanged: number;
}

function getLastSessionMetadata(cwd: string): LastSession | null {
  const metadataPath = path.join(cwd, ".claude/session-metadata.jsonl");

  if (!fs.existsSync(metadataPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(metadataPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    if (lines.length === 0) {
      return null;
    }

    const lastEntry = JSON.parse(lines[lines.length - 1]) as SessionMetadata;
    return {
      timestamp: lastEntry.timestamp,
      timeAgo: getTimeAgo(lastEntry.timestamp),
      reason: lastEntry.reason || "unknown",
      filesChanged: lastEntry.files_changed?.length || 0,
    };
  } catch {
    return null;
  }
}

function getTimeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;

  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return "just now";
}

// ========================================
// Helper: Build status output
// ========================================
interface StatusOutput {
  project: string;
  sprint: {
    name: string;
    file: string;
    status: string;
    created: string;
    progress: {
      completed: number;
      total: number;
      percentage: number;
    };
    completedFeatures: Array<{ id: string; description: string }>;
    remainingFeatures: Array<{ id: string; description: string }>;
  } | null;
  lastSession: LastSession | null;
}

function buildStatusOutput(
  projectName: string,
  sprint: SprintWithFile | null,
  lastSession: LastSession | null
): StatusOutput {
  const output: StatusOutput = {
    project: projectName,
    sprint: null,
    lastSession,
  };

  if (sprint) {
    const completed = sprint.features.filter(f => f.passes);
    const remaining = sprint.features.filter(f => !f.passes);
    const percentage = sprint.features.length > 0
      ? Math.round((completed.length / sprint.features.length) * 100)
      : 0;

    output.sprint = {
      name: sprint.initiative,
      file: sprint._file,
      status: sprint.status,
      created: sprint.created,
      progress: {
        completed: completed.length,
        total: sprint.features.length,
        percentage,
      },
      completedFeatures: completed.map(f => ({ id: f.id, description: f.description })),
      remainingFeatures: remaining.map(f => ({ id: f.id, description: f.description })),
    };
  }

  return output;
}

// ========================================
// Helper: Print formatted status
// ========================================
function printStatus(status: StatusOutput): void {
  console.log("\n📊 SHIPLOG STATUS\n");

  console.log(`📁 Project: ${status.project}`);

  if (!status.sprint) {
    console.log("\n📍 No active sprint found.");
    console.log("   Create one with: /ship \"your feature\"\n");
  } else {
    const s = status.sprint;
    console.log(`📍 Active Sprint: ${s.name}`);
    console.log(`   File: ${s.file}`);
    console.log(`   Status: ${s.status}`);
    console.log("");

    // Progress
    const barWidth = 20;
    const filled = Math.round((s.progress.percentage / 100) * barWidth);
    const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
    console.log(`📈 Progress: [${bar}] ${s.progress.completed}/${s.progress.total} (${s.progress.percentage}%)`);
    console.log("");

    // Completed features
    if (s.completedFeatures.length > 0) {
      console.log(`✅ Completed (${s.completedFeatures.length}):`);
      for (const feat of s.completedFeatures) {
        console.log(`   • ${feat.id}: ${feat.description}`);
      }
      console.log("");
    }

    // Remaining features
    if (s.remainingFeatures.length > 0) {
      console.log(`⏳ Remaining (${s.remainingFeatures.length}):`);
      for (const feat of s.remainingFeatures) {
        console.log(`   • ${feat.id}: ${feat.description}`);
      }
      console.log("");
    }
  }

  // Last session
  if (status.lastSession) {
    const ls = status.lastSession;
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`📝 Last Session: ${ls.timeAgo}`);
    console.log(`   Reason: ${ls.reason}`);
    console.log(`   Files changed: ${ls.filesChanged}`);
    console.log("");
  }
}

