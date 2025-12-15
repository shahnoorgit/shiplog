import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import {
  getSHIPmd,
  getSTATUSmd,
  getSessionEndHookSh,
  getSessionStartHookSh,
  getSETTINGSjson,
  getAutonomyStopHookSh,
  getAutonomySessionStartHookSh,
} from "./init.js";

interface UpgradeOptions {
  force: boolean;
  noBackup: boolean;
}

export const upgradeCommand = new Command("upgrade")
  .description(
    "Upgrade an existing shiplog installation to latest.\n\n" +
      "Safely updates command templates:\n" +
      "  - Updates /ship (unified command with auto mode detection)\n" +
      "  - Updates /status (health check command)\n" +
      "  - Updates session hooks for auto-metadata capture\n" +
      "  - Removes obsolete commands (ramp, plan, ship-design)\n\n" +
      "Your content files (PROGRESS.md, DECISIONS.md, HANDOFF.md, sprints/)\n" +
      "are preserved. Only command templates are updated.\n\n" +
      "Examples:\n" +
      "  $ shiplog upgrade              # Upgrade with backup\n" +
      "  $ shiplog upgrade --no-backup  # Upgrade without backup\n" +
      "  $ shiplog upgrade --force      # Force re-apply templates"
  )
  .option("-f, --force", "Overwrite even if already at v2", false)
  .option("--no-backup", "Skip backing up existing commands", false)
  .action(async (options: UpgradeOptions) => {
    const cwd = process.cwd();

    // Check if shiplog is initialized
    const claudeDir = path.join(cwd, ".claude");
    const commandsDir = path.join(claudeDir, "commands");
    const docsDir = path.join(cwd, "docs");

    if (!fs.existsSync(claudeDir) && !fs.existsSync(docsDir)) {
      console.log("\n❌ No shiplog installation found.");
      console.log("   Run 'shiplog init' first to set up a new project.\n");
      process.exit(1);
    }

    // Detect project name from CLAUDE.md or directory
    let projectName = path.basename(cwd);
    const claudeMdPath = path.join(cwd, "CLAUDE.md");
    if (fs.existsSync(claudeMdPath)) {
      const content = fs.readFileSync(claudeMdPath, "utf-8");
      const match = content.match(/^# (.+)$/m);
      if (match) {
        projectName = match[1];
      }
    }

    console.log(`\n🚢 Upgrading shiplog for: ${projectName}\n`);

    // Check if already v2 (has ship.md)
    const shipMdPath = path.join(commandsDir, "ship.md");
    if (fs.existsSync(shipMdPath) && !options.force) {
      console.log("  ℹ️  Already at v2 (ship.md exists).");
      console.log("     Use --force to re-apply v2 templates.\n");
      return;
    }

    // Create directories if missing
    const dirs = [".claude/commands", ".claude/hooks", ".claude/hooks/autonomy", "docs/sprints"];
    for (const dir of dirs) {
      const dirPath = path.join(cwd, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`  📁 Created ${dir}/`);
      }
    }

    // Backup existing commands if requested
    if (!options.noBackup && fs.existsSync(commandsDir)) {
      const backupDir = path.join(claudeDir, "commands.backup");
      const timestamp = new Date().toISOString().split("T")[0];
      const backupPath = `${backupDir}-${timestamp}`;

      if (!fs.existsSync(backupPath)) {
        fs.cpSync(commandsDir, backupPath, { recursive: true });
        console.log(`  💾 Backed up commands to .claude/commands.backup-${timestamp}/`);
      }
    }

    // Files to create/update
    const files = [
      // Unified /ship command (handles design, continue, planning, quick tasks)
      {
        path: ".claude/commands/ship.md",
        content: getSHIPmd(projectName),
        description: "unified /ship command",
      },
      // Status command
      {
        path: ".claude/commands/status.md",
        content: getSTATUSmd(projectName),
        description: "/status command",
      },
      // Hooks
      {
        path: ".claude/hooks/session-end.sh",
        content: getSessionEndHookSh(),
        description: "session-end hook",
        executable: true,
      },
      {
        path: ".claude/hooks/session-start.sh",
        content: getSessionStartHookSh(),
        description: "session-start hook",
        executable: true,
      },
      // Autonomy hooks (dormant until activated)
      {
        path: ".claude/hooks/autonomy/stop-hook.sh",
        content: getAutonomyStopHookSh(),
        description: "autonomy stop hook",
        executable: true,
      },
      {
        path: ".claude/hooks/autonomy/session-start-autonomy.sh",
        content: getAutonomySessionStartHookSh(),
        description: "autonomy session-start hook",
        executable: true,
      },
    ];

    // Remove obsolete commands
    const obsoleteCommands = [
      ".claude/commands/ramp.md",
      ".claude/commands/plan.md",
      ".claude/commands/ship-design.md",
    ];
    let removed = 0;
    for (const obsolete of obsoleteCommands) {
      const obsoletePath = path.join(cwd, obsolete);
      if (fs.existsSync(obsoletePath)) {
        fs.unlinkSync(obsoletePath);
        console.log(`  🗑️  Removed ${obsolete} (obsolete)`);
        removed++;
      }
    }

    // Create/update files
    let updated = 0;
    let added = 0;

    for (const file of files) {
      const filePath = path.join(cwd, file.path);
      const existed = fs.existsSync(filePath);

      fs.writeFileSync(filePath, file.content);

      // Make shell scripts executable
      if (file.executable) {
        fs.chmodSync(filePath, 0o755);
      }

      if (existed) {
        console.log(`  🔄 Updated ${file.path}`);
        updated++;
      } else {
        console.log(`  ✅ Added ${file.path}`);
        added++;
      }
    }

    // Update settings.json to include hooks (preserve existing config!)
    const settingsPath = path.join(claudeDir, "settings.json");
    let settingsUpdated = false;

    if (fs.existsSync(settingsPath)) {
      try {
        const existingSettings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

        // Check if hooks already configured, add missing ones
        let hooksModified = false;

        if (!existingSettings.hooks) {
          existingSettings.hooks = {};
        }

        // Add SessionStart hooks if missing
        if (!existingSettings.hooks.SessionStart) {
          existingSettings.hooks.SessionStart = [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command: "bash $CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh"
                }
              ]
            },
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command: "bash $CLAUDE_PROJECT_DIR/.claude/hooks/autonomy/session-start-autonomy.sh"
                }
              ]
            }
          ];
          hooksModified = true;
        }

        // Add SessionEnd hooks if missing
        if (!existingSettings.hooks.SessionEnd) {
          existingSettings.hooks.SessionEnd = [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command: "bash $CLAUDE_PROJECT_DIR/.claude/hooks/session-end.sh"
                }
              ]
            }
          ];
          hooksModified = true;
        }

        // Add Stop hook if missing (for autonomy mode)
        if (!existingSettings.hooks.Stop) {
          existingSettings.hooks.Stop = [
            {
              hooks: [
                {
                  type: "command",
                  command: "bash $CLAUDE_PROJECT_DIR/.claude/hooks/autonomy/stop-hook.sh"
                }
              ]
            }
          ];
          hooksModified = true;
        }

        if (hooksModified) {
          fs.writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2) + "\n");
          console.log(`  🔄 Updated .claude/settings.json (added hooks, preserved mcpServers)`);
          settingsUpdated = true;
        }
      } catch (e) {
        // If parsing fails, DON'T overwrite - user may have mcpServers or other config
        console.log(`  ⚠️  Could not parse .claude/settings.json`);
        console.log(`     Hooks not added. Please manually add hooks config.`);
        console.log(`     (Your mcpServers and other settings were preserved)`);
      }
    } else {
      fs.writeFileSync(settingsPath, getSETTINGSjson());
      console.log(`  ✅ Added .claude/settings.json`);
      added++;
    }

    // Summary
    console.log(`\n✨ Upgrade complete!`);
    console.log(`   Added: ${added} files`);
    console.log(`   Updated: ${updated} files`);
    if (removed > 0) {
      console.log(`   Removed: ${removed} obsolete commands`);
    }
    if (settingsUpdated) {
      console.log(`   Settings: hooks configured`);
    }

    console.log("\nCommands:");
    console.log("  • /ship — Unified command (auto-detects mode: design, continue, planning)");
    console.log("  • /status — Quick health check\n");

    console.log("Your content files were preserved:");
    console.log("  • docs/PROGRESS.md");
    console.log("  • docs/DECISIONS.md");
    console.log("  • docs/HANDOFF.md");
    console.log("  • docs/sprints/*\n");
  });
