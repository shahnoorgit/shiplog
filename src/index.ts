#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { upgradeCommand } from "./commands/upgrade.js";
import { doctorCommand } from "./commands/doctor.js";
import { autopilotCommand } from "./commands/autopilot.js";

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
  .version("1.2.1");

program.addCommand(initCommand);
program.addCommand(upgradeCommand);
program.addCommand(doctorCommand);
program.addCommand(autopilotCommand);

program.parse();
