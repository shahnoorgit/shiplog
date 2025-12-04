#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init.js";

const program = new Command();

program
  .name("agent-harness")
  .description(
    "Bootstrap infrastructure for long-running AI agents.\n\n" +
      "Based on Anthropic's research on effective harnesses for agents that work\n" +
      "across multiple context windows. Creates the directory structure, progress\n" +
      "tracking files, and startup commands needed for consistent agent sessions.\n\n" +
      "Learn more: https://github.com/danielgwilson/agent-harness"
  )
  .version("0.1.0");

program.addCommand(initCommand);

program.parse();
