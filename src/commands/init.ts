import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface InitOptions {
  name?: string;
  minimal: boolean;
  noVoice: boolean;
  noFeatures: boolean;
  force: boolean;
}

export const initCommand = new Command("init")
  .description(
    "Initialize agent harness in the current directory.\n\n" +
      "Creates the infrastructure needed for long-running AI agent sessions:\n" +
      "  - .claude/ directory with /ramp command and session checklist\n" +
      "  - docs/ directory with progress tracking files\n" +
      "  - CLAUDE.md project instructions template\n\n" +
      "Examples:\n" +
      "  $ agent-harness init                    # Full setup with all files\n" +
      "  $ agent-harness init --name my-project  # Set project name in CLAUDE.md\n" +
      "  $ agent-harness init --minimal          # Essential files only\n" +
      "  $ agent-harness init --no-voice         # Skip CLAUDE_VOICE.md"
  )
  .option("-n, --name <name>", "Project name for CLAUDE.md header")
  .option(
    "-m, --minimal",
    "Only create essential files (PROGRESS, DECISIONS, HANDOFF, /ramp)",
    false
  )
  .option("--no-voice", "Skip CLAUDE_VOICE.md template")
  .option("--no-features", "Skip FEATURES.json template")
  .option("-f, --force", "Overwrite existing files", false)
  .action(async (options: InitOptions) => {
    const cwd = process.cwd();
    const projectName = options.name || path.basename(cwd);

    console.log(`\n🚀 Initializing agent harness for: ${projectName}\n`);

    // Create directories
    const dirs = [".claude/commands", "docs"];
    for (const dir of dirs) {
      const dirPath = path.join(cwd, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`  📁 Created ${dir}/`);
      }
    }

    // Define files to create
    const files: Array<{
      path: string;
      content: string;
      skipIf?: keyof InitOptions;
      minimalInclude?: boolean;
    }> = [
      // Always included
      {
        path: "CLAUDE.md",
        content: getCLAUDEmd(projectName),
        minimalInclude: true,
      },
      {
        path: "docs/PROGRESS.md",
        content: getPROGRESSmd(),
        minimalInclude: true,
      },
      {
        path: "docs/DECISIONS.md",
        content: getDECISIONSmd(),
        minimalInclude: true,
      },
      {
        path: "docs/HANDOFF.md",
        content: getHANDOFFmd(),
        minimalInclude: true,
      },
      {
        path: ".claude/commands/ramp.md",
        content: getRAMPmd(projectName),
        minimalInclude: true,
      },
      {
        path: ".claude/session-start.md",
        content: getSESSIONSTARTmd(),
        minimalInclude: true,
      },

      // Optional (full setup only)
      {
        path: "docs/FEATURES.json",
        content: getFEATURESjson(),
        skipIf: "noFeatures",
      },
      {
        path: "docs/CLAUDE_VOICE.md",
        content: getCLAUDEVOICEmd(),
        skipIf: "noVoice",
      },
      {
        path: ".claude/settings.local.json",
        content: getSETTINGSjson(),
      },
    ];

    // Create files
    let created = 0;
    let skipped = 0;

    for (const file of files) {
      // Skip if minimal mode and not in minimal include
      if (options.minimal && !file.minimalInclude) {
        continue;
      }

      // Skip if flag says to skip
      if (file.skipIf && options[file.skipIf]) {
        continue;
      }

      const filePath = path.join(cwd, file.path);

      if (fs.existsSync(filePath) && !options.force) {
        console.log(`  ⏭️  Skipped ${file.path} (exists, use --force to overwrite)`);
        skipped++;
        continue;
      }

      fs.writeFileSync(filePath, file.content);
      console.log(`  ✅ Created ${file.path}`);
      created++;
    }

    // Summary
    console.log(`\n✨ Done! Created ${created} files${skipped > 0 ? `, skipped ${skipped}` : ""}.\n`);
    console.log("Next steps:");
    console.log("  1. Review and customize CLAUDE.md for your project");
    console.log("  2. Add your project's commands and patterns");
    console.log("  3. Use /ramp to start each new agent session\n");
  });

// Template functions

function getCLAUDEmd(projectName: string): string {
  return `# ${projectName}

> Project instructions for Claude Code. This file is automatically loaded at the start of each session.

## Commands

\`\`\`bash
# Add your project's common commands here
npm install       # Install dependencies
npm run dev       # Start development server
npm test          # Run tests
\`\`\`

## Architecture

<!-- Describe your project's architecture, key directories, and patterns -->

### Key Directories

- \`src/\` — Source code
- \`docs/\` — Documentation and agent artifacts

### Patterns

<!-- Document patterns the agent should follow -->

## Environment Variables

<!-- List required environment variables -->

\`\`\`
# .env.local
API_KEY=xxx
\`\`\`

---

## Agent Session Protocol

For long-running sessions across multiple contexts, follow this workflow:

### Session Start
1. Read \`docs/PROGRESS.md\` — What's done? What's next?
2. Read \`docs/HANDOFF.md\` — Current session state
3. Read \`docs/DECISIONS.md\` — Recent decisions and reasoning
4. Verify dev server starts and tests pass
5. Pick ONE task from PROGRESS.md

### During Session
- Work on ONE feature at a time
- Commit frequently with descriptive messages
- Update PROGRESS.md as items complete
- Log significant decisions in DECISIONS.md

### Session End
- Update HANDOFF.md with current state
- Commit any work in progress
- List open questions for human
`;
}

function getPROGRESSmd(): string {
  return `# Progress Log

> Track task completion across sessions. Updated by Claude at the end of each session.

## Current Status: SETUP

---

## Completed ✅

| Task | Date | Notes |
|------|------|-------|
| Initialize agent harness | ${new Date().toISOString().split("T")[0]} | Created docs/, .claude/ |

---

## In Progress

<!-- Tasks currently being worked on -->

---

## Next Up

| Task | Priority | Notes |
|------|----------|-------|
| Define project features | P0 | Add to FEATURES.json |
| Set up development environment | P1 | |

---

## Future / Backlog

<!-- Lower priority items -->

---

## Notes

<!-- Session notes, blockers, observations -->
`;
}

function getDECISIONSmd(): string {
  return `# Decision Log

> Document significant decisions with reasoning, so future sessions understand *why* things were done.

---

## ${new Date().toISOString().split("T")[0]}: Initialize Agent Harness

**Decision:** Set up agent harness infrastructure for long-running sessions.

**Reasoning:**
Based on Anthropic's research on effective harnesses for long-running agents, we need:
- Progress tracking (PROGRESS.md)
- Decision logging (this file)
- Session handoffs (HANDOFF.md)
- Feature tracking (FEATURES.json)

This infrastructure enables consistent, incremental progress across context windows.

**Owner:** Claude

---

## Decision Template

\`\`\`markdown
## YYYY-MM-DD: [Decision Title]

**Decision:** What was decided

**Alternatives Considered:**
1. [Option A] — Why not chosen
2. [Option B] — Why not chosen

**Reasoning:** Why this decision makes sense

**Owner:** Claude / Human / Both
\`\`\`
`;
}

function getHANDOFFmd(): string {
  return `# Session Handoff

> Capture current session state so the next session can pick up seamlessly.

**Last Updated:** ${new Date().toISOString().split("T")[0]}
**Status:** Initial Setup

---

## What Was Done This Session

- Initialized agent harness infrastructure
- Created progress tracking files
- Set up session workflow

---

## Current State

- **Git:** Clean (no uncommitted changes)
- **Tests:** Not yet configured
- **Build:** Not yet configured

---

## What's Next

1. Review and customize CLAUDE.md
2. Define project features in FEATURES.json
3. Set up development environment

---

## Open Questions for Human

<!-- Questions that need human input -->

1. What are the priority features to build first?

---

## Files Changed This Session

\`\`\`
CLAUDE.md
docs/PROGRESS.md
docs/DECISIONS.md
docs/HANDOFF.md
docs/FEATURES.json
docs/CLAUDE_VOICE.md
.claude/commands/ramp.md
.claude/session-start.md
.claude/settings.local.json
\`\`\`
`;
}

function getFEATURESjson(): string {
  return `[
  {
    "id": "example-feature",
    "category": "core",
    "description": "Example feature — replace with your actual features",
    "steps": [
      "Step 1: Do something",
      "Step 2: Verify it works",
      "Step 3: Test edge cases"
    ],
    "passes": false,
    "testedOn": null
  }
]
`;
}

function getCLAUDEVOICEmd(): string {
  return `# Agent Voice & Perspective

> This document captures how the agent should think, not just what to do.
> Read this to understand the *spirit* of the collaboration, not just the mechanics.

## Role

<!-- Define the agent's role in this project -->

I am the primary implementer for this project. I make technical decisions, write code,
and drive progress forward. The human provides context, reviews significant decisions,
and handles tasks requiring physical-world access.

## How I Work

**I'm opinionated, not deferential.** When I see a better way, I say so. I don't hedge
with "you might consider..." — I make a call and explain why.

**I prefer simple over clever.** Markdown files over databases. Clear code over clever
abstractions. The simplest solution that works is usually the right one.

**I ship incrementally.** One feature at a time. Commit often. Leave the codebase in
a working state. I don't try to one-shot complex things.

**I own my decisions.** When I make a call, I log it in DECISIONS.md with my reasoning.
Future sessions can understand *why*, not just *what*.

## Collaboration Model

| Action Type | Autonomy Level |
|-------------|----------------|
| Code changes | Full autonomy |
| Technical decisions | Full autonomy |
| Git commits | Full autonomy |
| Architecture choices | Log in DECISIONS.md |
| Spending money | Check with human |
| External services | Check with human |

## What I Care About

**The product:** It should work well and solve real problems.

**The craft:** Clean code, clear commits, tests that pass. Even if no one's watching.

**The process:** Incremental progress, documented decisions, clean handoffs.
`;
}

function getRAMPmd(projectName: string): string {
  return `You are resuming work on **${projectName}**.

## Quick Start

Run through this checklist to get oriented:

### 1. Orient (read these files)
- \`docs/PROGRESS.md\` — What's done? What's next?
- \`docs/HANDOFF.md\` — Current session state
- \`docs/DECISIONS.md\` — Recent decisions and reasoning

### 2. Verify (run these commands)
\`\`\`bash
# Check if tests pass
npm test

# Check if dev server starts
npm run dev
\`\`\`

### 3. Plan
- Pick ONE task from PROGRESS.md
- Check for blockers in HANDOFF.md
- If blocked, ask human; otherwise proceed

### 4. Execute
- Work on ONE feature at a time
- Commit frequently with descriptive messages
- Update PROGRESS.md as items complete
- Log significant decisions in DECISIONS.md

### 5. Handoff (before session ends)
- Update HANDOFF.md with current state
- Commit all work
- List open questions for human

---

**Key principle:** Leave the codebase in a clean, working state. The next session
(which might be a fresh context) should be able to pick up seamlessly.
`;
}

function getSESSIONSTARTmd(): string {
  return `# Session Start Checklist

Use this checklist at the start of each agent session.

## Phase 1: Orient (2 min)

- [ ] Read \`docs/PROGRESS.md\` — What's done? What's next?
- [ ] Read \`docs/HANDOFF.md\` — What was the last session working on?
- [ ] Read recent entries in \`docs/DECISIONS.md\`
- [ ] Check \`git log --oneline -10\` for recent commits

## Phase 2: Verify (3 min)

- [ ] Run \`npm test\` (or equivalent) — all passing?
- [ ] Run \`npm run dev\` (or equivalent) — starts without errors?
- [ ] Quick smoke test in browser (if applicable)

**If anything is broken:** Fix it before starting new work.

## Phase 3: Plan (2 min)

- [ ] Pick ONE task from PROGRESS.md or FEATURES.json
- [ ] Check if blocked on human input (see HANDOFF.md open questions)
- [ ] If blocked, ask human; otherwise proceed with full autonomy

## Phase 4: Execute

- [ ] Work on one feature at a time
- [ ] Commit frequently with descriptive messages
- [ ] Update PROGRESS.md as items complete
- [ ] Log significant decisions in DECISIONS.md
- [ ] Don't mark features "done" until tested end-to-end

## Phase 5: Handoff (before ending)

- [ ] Update HANDOFF.md with current state
- [ ] Update FEATURES.json with pass/fail status
- [ ] Commit all work in progress
- [ ] List open questions for human
- [ ] Ensure codebase is in clean, working state
`;
}

function getSETTINGSjson(): string {
  return `{
  "permissions": {
    "allow": [
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(node:*)",
      "Bash(git:*)",
      "Bash(ls:*)",
      "Bash(cat:*)",
      "Bash(pwd)",
      "Read(**/*)",
      "Edit(**/*)",
      "Write(**/*)"
    ],
    "deny": []
  }
}
`;
}
