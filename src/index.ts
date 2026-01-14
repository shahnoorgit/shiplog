#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { initCommand } from "./commands/init.js";
import { upgradeCommand } from "./commands/upgrade.js";
import { doctorCommand } from "./commands/doctor.js";
import { autopilotCommand } from "./commands/autopilot.js";
import { resetCommand } from "./commands/reset.js";
import { statusCommand } from "./commands/status.js";

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));

const program = new Command();

program
  .name("shiplog")
  .description(
    "Infrastructure for long-running AI agents.\n\n" +
      "Track progress, decisions, and handoffs across sessions.\n" +
      "Based on Anthropic's research on effective harnesses for agents.\n\n" +
      "Primary command: /ship (auto-detects plan vs continue mode)\n" +
      "Also: /ship design (creative work), /status (health check)\n\n" +
      "Learn more: https://github.com/danielgwilson/shiplog"
  )
  .version(packageJson.version);

program.addCommand(initCommand);
program.addCommand(upgradeCommand);
program.addCommand(doctorCommand);
program.addCommand(autopilotCommand);
program.addCommand(resetCommand);
program.addCommand(statusCommand);

program.parse();
