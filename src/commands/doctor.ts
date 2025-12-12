import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";

interface DoctorOptions {
  fix: boolean;
}

interface Issue {
  type: "error" | "warning";
  message: string;
  fix?: () => void;
  fixDescription?: string;
}

export const doctorCommand = new Command("doctor")
  .description(
    "Check shiplog installation health and validate configuration.\n\n" +
      "Verifies that all required components are present and correctly\n" +
      "configured without modifying any files.\n\n" +
      "Examples:\n" +
      "  $ shiplog doctor        # Check installation health\n" +
      "  $ shiplog doctor --fix  # Auto-fix issues where possible"
  )
  .option("-f, --fix", "Automatically fix issues where possible", false)
  .action(async (options: DoctorOptions) => {
    const cwd = process.cwd();
    const issues: Issue[] = [];
    let checksRun = 0;
    let checksPassed = 0;

    console.log("\n🩺 Shiplog Doctor\n");

    // ========================================
    // Check 1: Basic installation
    // ========================================
    checksRun++;
    const claudeDir = path.join(cwd, ".claude");
    const docsDir = path.join(cwd, "docs");

    if (!fs.existsSync(claudeDir) && !fs.existsSync(docsDir)) {
      console.log("❌ No shiplog installation found.\n");
      console.log("   Run 'shiplog init' to set up this project.\n");
      process.exit(1);
    }
    console.log("✓ Shiplog installation detected");
    checksPassed++;

    // ========================================
    // Check 2: Required directories
    // ========================================
    const requiredDirs = [
      ".claude/commands",
      ".claude/hooks",
      "docs",
      "docs/sprints",
    ];

    for (const dir of requiredDirs) {
      checksRun++;
      const dirPath = path.join(cwd, dir);
      if (fs.existsSync(dirPath)) {
        checksPassed++;
      } else {
        issues.push({
          type: "error",
          message: `Missing directory: ${dir}`,
          fix: () => fs.mkdirSync(dirPath, { recursive: true }),
          fixDescription: `Create ${dir}/`,
        });
      }
    }
    console.log(`✓ Directory structure (${requiredDirs.length} checked)`);

    // ========================================
    // Check 3: Required files
    // ========================================
    const requiredFiles = [
      { path: "CLAUDE.md", critical: true },
      { path: "docs/PROGRESS.md", critical: true },
      { path: "docs/DECISIONS.md", critical: false },
      { path: "docs/HANDOFF.md", critical: true },
      { path: ".claude/commands/ship.md", critical: true },
      { path: ".claude/commands/status.md", critical: false },
      { path: ".claude/hooks/session-start.sh", critical: false },
      { path: ".claude/hooks/session-end.sh", critical: false },
    ];

    let missingFiles = 0;
    for (const file of requiredFiles) {
      checksRun++;
      const filePath = path.join(cwd, file.path);
      if (fs.existsSync(filePath)) {
        checksPassed++;
      } else {
        missingFiles++;
        issues.push({
          type: file.critical ? "error" : "warning",
          message: `Missing file: ${file.path}`,
          fixDescription: `Run 'shiplog init --force' or 'shiplog upgrade' to regenerate`,
        });
      }
    }
    console.log(
      `✓ Required files (${requiredFiles.length - missingFiles}/${requiredFiles.length} present)`
    );

    // ========================================
    // Check 4: Hook scripts executable
    // ========================================
    const hookScripts = [
      ".claude/hooks/session-start.sh",
      ".claude/hooks/session-end.sh",
    ];

    for (const script of hookScripts) {
      const scriptPath = path.join(cwd, script);
      if (fs.existsSync(scriptPath)) {
        checksRun++;
        const stats = fs.statSync(scriptPath);
        if (stats.mode & 0o111) {
          checksPassed++;
        } else {
          issues.push({
            type: "warning",
            message: `Hook script not executable: ${script}`,
            fix: () => fs.chmodSync(scriptPath, 0o755),
            fixDescription: `chmod +x ${script}`,
          });
        }
      }
    }
    console.log(`✓ Hook script permissions`);

    // ========================================
    // Check 5: settings.json format
    // ========================================
    const settingsPath = path.join(cwd, ".claude/settings.json");
    if (fs.existsSync(settingsPath)) {
      checksRun++;
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));

        // Check hooks format
        if (settings.hooks) {
          let hooksValid = true;
          const hookEvents = ["SessionStart", "SessionEnd"];

          for (const event of hookEvents) {
            if (settings.hooks[event]) {
              checksRun++;
              const hooks = settings.hooks[event];

              if (!Array.isArray(hooks)) {
                hooksValid = false;
                issues.push({
                  type: "error",
                  message: `Invalid hook format: ${event} should be an array`,
                  fixDescription: `Run 'shiplog init --force' to regenerate settings`,
                });
                continue;
              }

              for (let i = 0; i < hooks.length; i++) {
                const hook = hooks[i];

                // Check for old format (missing matcher or hooks array)
                if (typeof hook.matcher === "undefined") {
                  hooksValid = false;
                  issues.push({
                    type: "error",
                    message: `Invalid hook format: ${event}[${i}] missing 'matcher' field`,
                    fix: () => {
                      // Transform old format to new format
                      const oldHook = settings.hooks[event][i];
                      settings.hooks[event][i] = {
                        matcher: "",
                        hooks: [oldHook],
                      };
                      fs.writeFileSync(
                        settingsPath,
                        JSON.stringify(settings, null, 2) + "\n"
                      );
                    },
                    fixDescription: `Transform to new hook format with 'matcher' and 'hooks' array`,
                  });
                } else if (typeof hook.matcher !== "string") {
                  hooksValid = false;
                  issues.push({
                    type: "error",
                    message: `Invalid hook format: ${event}[${i}].matcher must be a string, got ${typeof hook.matcher}`,
                    fix: () => {
                      settings.hooks[event][i].matcher = "";
                      fs.writeFileSync(
                        settingsPath,
                        JSON.stringify(settings, null, 2) + "\n"
                      );
                    },
                    fixDescription: `Change matcher from object to empty string`,
                  });
                }

                if (hook.matcher !== undefined && !Array.isArray(hook.hooks)) {
                  hooksValid = false;
                  issues.push({
                    type: "error",
                    message: `Invalid hook format: ${event}[${i}].hooks must be an array`,
                    fixDescription: `Run 'shiplog init --force' to regenerate settings`,
                  });
                }
              }

              if (hooksValid) {
                checksPassed++;
              }
            }
          }
        }

        checksPassed++;
        console.log(`✓ Settings file valid JSON`);
      } catch (e) {
        issues.push({
          type: "error",
          message: `settings.json is not valid JSON: ${e instanceof Error ? e.message : "unknown error"}`,
          fixDescription: `Manually fix JSON syntax or run 'shiplog init --force'`,
        });
      }
    } else {
      checksRun++;
      issues.push({
        type: "warning",
        message: `Missing .claude/settings.json`,
        fixDescription: `Run 'shiplog init' to create it`,
      });
    }

    // ========================================
    // Check 6: Version detection
    // ========================================
    checksRun++;
    const shipMdPath = path.join(cwd, ".claude/commands/ship.md");
    if (fs.existsSync(shipMdPath)) {
      console.log(`✓ Version: current (ship.md present)`);
      checksPassed++;
    } else {
      issues.push({
        type: "error",
        message: `Missing ship.md - run 'shiplog init --force' to create`,
      });
    }

    // ========================================
    // Summary
    // ========================================
    console.log("");

    const errors = issues.filter((i) => i.type === "error");
    const warnings = issues.filter((i) => i.type === "warning");

    if (issues.length === 0) {
      console.log(`✨ All ${checksRun} checks passed. Installation is healthy!\n`);
      return;
    }

    // Show issues
    if (errors.length > 0) {
      console.log(`\n❌ Errors (${errors.length}):\n`);
      for (const issue of errors) {
        console.log(`  • ${issue.message}`);
        if (issue.fixDescription) {
          console.log(`    Fix: ${issue.fixDescription}`);
        }
      }
    }

    if (warnings.length > 0) {
      console.log(`\n⚠️  Warnings (${warnings.length}):\n`);
      for (const issue of warnings) {
        console.log(`  • ${issue.message}`);
        if (issue.fixDescription) {
          console.log(`    Fix: ${issue.fixDescription}`);
        }
      }
    }

    // Auto-fix if requested
    if (options.fix) {
      const fixable = issues.filter((i) => i.fix);
      if (fixable.length > 0) {
        console.log(`\n🔧 Applying ${fixable.length} auto-fixes...\n`);
        for (const issue of fixable) {
          try {
            issue.fix!();
            console.log(`  ✓ Fixed: ${issue.message}`);
          } catch (e) {
            console.log(
              `  ✗ Failed to fix: ${issue.message} (${e instanceof Error ? e.message : "unknown error"})`
            );
          }
        }
        console.log("");
      } else {
        console.log(
          `\n  No auto-fixable issues. Manual intervention required.\n`
        );
      }
    } else {
      const fixable = issues.filter((i) => i.fix);
      if (fixable.length > 0) {
        console.log(`\n💡 ${fixable.length} issues can be auto-fixed with: shiplog doctor --fix\n`);
      }
    }

    // Exit code
    if (errors.length > 0) {
      process.exit(1);
    }
  });
