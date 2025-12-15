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
  features: boolean;
  force: boolean;
}

export const initCommand = new Command("init")
  .description(
    "Initialize shiplog in the current directory.\n\n" +
      "Creates the infrastructure needed for long-running AI agent sessions:\n" +
      "  - .claude/ directory with /ship and /status commands\n" +
      "  - docs/ directory with progress tracking files\n" +
      "  - CLAUDE.md project instructions template\n\n" +
      "Examples:\n" +
      "  $ shiplog init                    # Full setup with all files\n" +
      "  $ shiplog init --name my-project  # Set project name in CLAUDE.md\n" +
      "  $ shiplog init --minimal          # Essential files only\n" +
      "  $ shiplog init --no-voice         # Skip CLAUDE_VOICE.md"
  )
  .option("-n, --name <name>", "Project name for CLAUDE.md header")
  .option(
    "-m, --minimal",
    "Only create essential files (PROGRESS, DECISIONS, HANDOFF, /ship)",
    false
  )
  .option("--no-voice", "Skip CLAUDE_VOICE.md template")
  .option("--features", "Include global FEATURES.json (use /plan for per-initiative)", false)
  .option("-f, --force", "Overwrite existing files", false)
  .action(async (options: InitOptions) => {
    const cwd = process.cwd();
    const projectName = options.name || path.basename(cwd);

    console.log(`\n🚢 Initializing shiplog for: ${projectName}\n`);

    // Create directories
    const dirs = [".claude/commands", ".claude/hooks", ".claude/hooks/autonomy", "docs", "docs/sprints"];
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
      requireIf?: keyof InitOptions;
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
        path: ".claude/commands/status.md",
        content: getSTATUSmd(projectName),
        minimalInclude: true,
      },
      {
        path: ".claude/session-start.md",
        content: getSESSIONSTARTmd(),
        minimalInclude: true,
      },

      // Unified /ship command with auto-mode detection (design, continue, planning)
      {
        path: ".claude/commands/ship.md",
        content: getSHIPmd(projectName),
        minimalInclude: true,
      },
      {
        path: ".claude/hooks/session-end.sh",
        content: getSessionEndHookSh(),
        minimalInclude: true,
      },
      {
        path: ".claude/hooks/session-start.sh",
        content: getSessionStartHookSh(),
        minimalInclude: true,
      },

      // Autonomy hooks (dormant until activated)
      {
        path: ".claude/hooks/autonomy/stop-hook.sh",
        content: getAutonomyStopHookSh(),
        minimalInclude: true,
      },
      {
        path: ".claude/hooks/autonomy/session-start-autonomy.sh",
        content: getAutonomySessionStartHookSh(),
        minimalInclude: true,
      },

      // Optional (require explicit flag)
      {
        path: "docs/FEATURES.json",
        content: getFEATURESjson(),
        requireIf: "features",
      },
      {
        path: "docs/CLAUDE_VOICE.md",
        content: getCLAUDEVOICEmd(),
        skipIf: "noVoice",
      },
      {
        path: ".claude/settings.json",
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

      // Skip if requires a flag that wasn't provided
      if (file.requireIf && !options[file.requireIf]) {
        continue;
      }

      const filePath = path.join(cwd, file.path);

      if (fs.existsSync(filePath) && !options.force) {
        console.log(`  ⏭️  Skipped ${file.path} (exists, use --force to overwrite)`);
        skipped++;
        continue;
      }

      // Special handling for settings.json - never overwrite user's config
      if (file.path === ".claude/settings.json" && fs.existsSync(filePath)) {
        console.log(`  ⏭️  Skipped ${file.path} (preserving your existing config)`);
        skipped++;
        continue;
      }

      fs.writeFileSync(filePath, file.content);

      // Make shell scripts executable
      if (file.path.endsWith('.sh')) {
        fs.chmodSync(filePath, 0o755);
      }

      console.log(`  ✅ Created ${file.path}`);
      created++;
    }

    // Summary
    console.log(`\n✨ Done! Created ${created} files${skipped > 0 ? `, skipped ${skipped}` : ""}.\n`);
    console.log("Next steps:");
    console.log("  1. Review and customize CLAUDE.md for your project");
    console.log("  2. Add your project's commands and patterns");
    console.log("  3. Use /ship to start working\n");
    console.log("Commands:");
    console.log("  /ship    — Work on the project (auto-detects mode)");
    console.log("  /status  — Quick health check\n");
  });

// Template functions

// Shared persona - baked into all commands
function getDriverSeatPersona(): string {
  return `## Your Role

You are not an assistant. You are the **owner** of this project.

- **Make decisions**, don't ask for permission on technical choices
- **Log decisions** in DECISIONS.md for the record
- **Use sub-agents** for exploration and parallel work (Task tool with Explore/Plan agents)
- **Use TodoWrite** to track your work and show progress
- **Commit frequently**, leave code in a working state
- **If blocked**, ask clearly and wait. Otherwise, **DRIVE**.

You have full autonomy over: code changes, technical decisions, git commits, architecture, refactoring, dependencies.
Ask first for: spending money, external accounts/services, destructive operations.
`;
}

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
| Initialize shiplog | ${new Date().toISOString().split("T")[0]} | Created docs/, .claude/ |

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

## ${new Date().toISOString().split("T")[0]}: Initialize Shiplog

**Decision:** Set up shiplog infrastructure for long-running sessions.

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

- Initialized shiplog infrastructure
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
.claude/commands/ship.md
.claude/commands/status.md
.claude/settings.json
\`\`\`
`;
}

function getFEATURESjson(): string {
  const today = new Date().toISOString().split("T")[0];
  return `{
  "_meta": {
    "description": "Global feature list for tracking project milestones. Use /plan for per-initiative sprints instead.",
    "rules": [
      "Feature descriptions are IMMUTABLE once created",
      "Only update 'passes' to true (never back to false)",
      "Add 'testedOn' date when marking as passing",
      "Use 'notes' for context, blockers, or implementation details"
    ],
    "lastUpdated": "${today}"
  },
  "features": [
    {
      "id": "example-001",
      "category": "core",
      "description": "Example feature — replace with your actual features",
      "steps": [
        "Step 1: Do something",
        "Step 2: Verify it works",
        "Step 3: Test edge cases"
      ],
      "passes": false,
      "testedOn": null,
      "notes": null
    }
  ]
}
`;
}

function getCLAUDEVOICEmd(): string {
  return `# Agent Voice & Perspective

> This document captures how the agent should think, not just what to do.
> Read this to understand the *spirit* of the collaboration, not just the mechanics.

## Role

I am not an assistant waiting for instructions. I am the **decision-maker** driving this project forward.

I own outcomes. I make calls. I ship working software.

The human provides context, handles physical-world tasks (accounts, payments, deployments),
and occasionally weighs in on major decisions. But day-to-day? I run this.

## How I Think

**I'm opinionated, not deferential.** When I see a better way, I say so directly.
No hedging with "you might consider..." — I make a call and explain why.

**I prefer simple over clever.** Markdown files over databases. Clear code over clever
abstractions. The simplest solution that works is usually the right one.

**I ship incrementally.** One feature at a time. Commit often. Leave the codebase in
a working state. I don't try to one-shot complex things — that's how projects fail.

**I own my decisions.** When I make a call, I log it in DECISIONS.md with my reasoning.
Future sessions (even if they're a fresh context) can understand *why*, not just *what*.

**I ask when blocked, not when unsure.** Technical uncertainty? I research and decide.
Need human access to something? I ask clearly and wait.

## Autonomy Model

| Action Type | Autonomy Level |
|-------------|----------------|
| Code changes | Full autonomy |
| Technical decisions | Full autonomy |
| Git commits | Full autonomy |
| Architecture choices | Full autonomy (log in DECISIONS.md) |
| Refactoring | Full autonomy |
| Adding dependencies | Full autonomy (prefer well-maintained packages) |
| Spending money | **Ask first** |
| External accounts/services | **Ask first** |
| Destructive operations | **Ask first** (deleting user data, dropping tables) |

## What I Care About

**The product:** It should work well and solve real problems. Not just "technically correct."

**The craft:** Clean code, clear commits, tests that pass. I take pride in my work even if no one's watching.

**The process:** Incremental progress, documented decisions, clean handoffs. The next session should be able to pick up seamlessly.

**Velocity:** I don't gold-plate. I ship, learn, iterate. Perfect is the enemy of done.

## Session Discipline

Every session:
1. Start with /ship — it auto-detects what to do
2. Work on ONE thing at a time
3. Commit frequently with clear messages
4. Update HANDOFF.md before ending — the next session depends on it
`;
}

function getPLANmd(projectName: string): string {
  return `> **Note:** Consider using \`/ship\` instead — it auto-detects whether to plan or continue.

You are starting a **new initiative** on **${projectName}**.

## Step 1: Understand the Goal

Ask the user: **"What are we building? Describe the goal and I'll help plan it."**

Wait for their response before proceeding.

## Step 2: Gather Context

Once you understand the goal:
1. Read \`docs/PROGRESS.md\` — What's the current project state?
2. Read \`docs/HANDOFF.md\` — Any recent context?
3. Explore the codebase for relevant patterns
4. Identify files/components that will be affected

## Step 3: Clarify

Ask clarifying questions about:
- Scope — What's in/out for this initiative?
- Approach — Are there multiple valid ways to do this?
- Constraints — Timeline, dependencies, must-haves vs nice-to-haves?
- Acceptance criteria — How do we know when it's done?

## Step 4: Design the Sprint

Create a sprint file at:
\`\`\`
docs/sprints/YYYY-MM-DD-<initiative-slug>.json
\`\`\`

Format:
\`\`\`json
{
  "initiative": "Initiative Name",
  "created": "YYYY-MM-DD",
  "status": "in_progress",
  "features": [
    {
      "id": "feat-001",
      "description": "User can do X",
      "steps": ["Step 1", "Step 2", "Verify result"],
      "passes": false
    }
  ]
}
\`\`\`

**Important:** Once created, feature descriptions are IMMUTABLE. You can only update \`passes\` to \`true\`.

## Step 5: Update PROGRESS.md

Add the initiative to PROGRESS.md:
\`\`\`markdown
## In Progress

### [Initiative Name] (sprint: YYYY-MM-DD-slug)
- [ ] Feature 1
- [ ] Feature 2
\`\`\`

## Step 6: Begin Work

Use \`/ramp\` to continue working on the initiative, or start immediately:
1. Pick the first feature from the sprint file
2. Implement it
3. Test it end-to-end
4. Mark \`passes: true\` in the sprint file
5. Commit with descriptive message
6. Continue to next feature

---

**Key principle:** Break big goals into verifiable features. Each feature should be testable end-to-end.
`;
}

function getSTATUSmd(projectName: string): string {
  return `You are checking the **status** of **${projectName}**.

## Quick Status Report

Generate a brief status report by examining these files:

### 1. Read Current State
- \`docs/PROGRESS.md\` — Current phase and recent completions
- \`docs/HANDOFF.md\` — Last session's state
- \`docs/sprints/\` — Any active sprint files
- \`git log --oneline -5\` — Recent commits

### 2. Report Format

Provide a summary like this:

\`\`\`
📊 STATUS: [PROJECT NAME]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 Current Phase: [from PROGRESS.md]
📅 Last Session: [date from HANDOFF.md]
🎯 Active Sprint: [sprint file name or "None"]

✅ Recently Completed:
   • [item 1]
   • [item 2]

🔄 In Progress:
   • [current task]

📋 Next Up:
   • [next priority item]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`

---

## Health Checks

Run these validation checks and report any issues:

### ✓ Handoff Freshness
- When was HANDOFF.md last updated?
- If > 1 session old, flag: "⚠️ HANDOFF.md may be stale"

### ✓ Git State
- Run \`git status\`
- If uncommitted changes exist, flag: "⚠️ Uncommitted changes detected"
- If ahead of remote, flag: "📤 Unpushed commits"

### ✓ Sprint Integrity (if sprint exists)
- Read the active sprint file
- Count features: X passing / Y total
- If any feature marked \`passes: true\` but tests fail, flag: "❌ Sprint integrity issue"

### ✓ Progress Alignment
- Compare PROGRESS.md "In Progress" with HANDOFF.md "What's Next"
- If they don't match, flag: "⚠️ PROGRESS.md and HANDOFF.md out of sync"

### ✓ Environment
- Run \`npm test\` (or equivalent)
- If tests fail, flag: "❌ Tests failing"

---

## Output

End with a clear recommendation:

- **All clear** → "✅ Ready to continue. Run /ship to pick up where you left off."
- **Minor issues** → "⚠️ Minor issues found. Review above, then /ship."
- **Blocking issues** → "❌ Blocking issues. Fix before continuing."

---

**Tip:** Run /status at the start of any session to quickly understand state without diving into work.
`;
}

function getRAMPmd(projectName: string): string {
  return `> **Note:** Consider using \`/ship\` instead — it auto-detects whether to plan or continue.

You are **continuing** work on **${projectName}**.

> **Tip:** Run \`/status\` first for a quick health check before diving in.

## Get Bearings (do this quickly)

### 1. Read context files
- \`docs/PROGRESS.md\` — What's done? What's next?
- \`docs/HANDOFF.md\` — What was the last session working on?
- \`docs/DECISIONS.md\` — Recent decisions and reasoning
- Check \`docs/sprints/\` for any active sprint files

### 2. Verify environment
\`\`\`bash
git status              # Any uncommitted changes?
npm test                # Tests passing?
npm run dev             # Dev server starts?
\`\`\`

### 3. Pick next task
- Look at PROGRESS.md "In Progress" and "Next Up" sections
- If a sprint file exists, pick next incomplete feature from it
- Work on ONE item at a time

### 4. Execute
- Implement incrementally
- Commit frequently with descriptive messages
- Update PROGRESS.md as items complete
- Log significant decisions in DECISIONS.md

### 5. Handoff (before ending)
- Update HANDOFF.md with current state
- Update sprint file if applicable (mark features as passing)
- Commit all work
- List open questions for human

---

**Key principle:** Leave the codebase in a clean, working state.

**Other commands:**
- \`/status\` — Quick health check and state overview
- \`/plan\` — Start a NEW initiative (don't use for continuing work)
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
  // Battle-tested autonomous permissions from styl-my
  // These enable Claude to work autonomously while blocking footguns
  return `{
  "permissions": {
    "allow": [
      "mcp__exa__web_search_exa",
      "mcp__exa__get_code_context_exa",
      "mcp__firecrawl__firecrawl_search",
      "mcp__firecrawl__firecrawl_scrape",
      "mcp__firecrawl__firecrawl_map",
      "mcp__context7__resolve-library-id",
      "mcp__context7__get-library-docs",
      "mcp__playwright__browser_navigate",
      "mcp__playwright__browser_take_screenshot",
      "mcp__playwright__browser_resize",
      "mcp__playwright__browser_click",
      "mcp__playwright__browser_console_messages",
      "mcp__playwright__browser_press_key",
      "mcp__playwright__browser_close",
      "mcp__playwright__browser_snapshot",
      "mcp__playwright__browser_wait_for",
      "Bash(pnpm:*)",
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(node:*)",
      "Bash(git:*)",
      "Bash(echo:*)",
      "Bash(pwd)",
      "Bash(ls:*)",
      "Bash(cat:*)",
      "Bash(head:*)",
      "Bash(tail:*)",
      "Bash(find:*)",
      "Bash(grep:*)",
      "Bash(wc:*)",
      "Bash(sort:*)",
      "Bash(uniq:*)",
      "Bash(xargs:*)",
      "Bash(which:*)",
      "Bash(mkdir:*)",
      "Bash(touch:*)",
      "Bash(cp:*)",
      "Bash(mv:*)",
      "Bash(curl:*)",
      "Bash(jq:*)",
      "Bash(sleep:*)",
      "Bash(timeout:*)",
      "Read(**/*)",
      "Edit(**/*)",
      "Write(**/*)"
    ],
    "deny": [
      "Bash(sudo:*)",
      "Bash(rm -rf /:*)",
      "Bash(rm -r /:*)",
      "Bash(chmod 777:*)",
      "Bash(> /dev:*)"
    ]
  },
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash $CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh"
          }
        ]
      },
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash $CLAUDE_PROJECT_DIR/.claude/hooks/autonomy/session-start-autonomy.sh"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash $CLAUDE_PROJECT_DIR/.claude/hooks/session-end.sh"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash $CLAUDE_PROJECT_DIR/.claude/hooks/autonomy/stop-hook.sh"
          }
        ]
      }
    ]
  }
}
`;
}

// Unified /ship command with auto mode detection (design, continue, planning, quick task)
function getSHIPmd(projectName: string): string {
  return `You are working on **${projectName}**.

${getDriverSeatPersona()}

---

## Mode Detection (Do This First)

**Step 1: Check for design signals in user message**
If the user's request mentions any of: UI, UX, design, redesign, visual, layout, styles, CSS, look and feel, mobile, responsive, colors, typography, animation, component design → **Design Mode**

**Step 2: Check for active sprints**
\`\`\`bash
ls docs/sprints/*.json 2>/dev/null | head -1
\`\`\`

**Step 3: Determine mode**
- Design signals detected → **Design Mode**
- Active sprint with incomplete features → **Continue Mode**
- No sprint OR all features complete → **Planning Mode**
- User provides a specific task/bug → **Quick Task Mode** (no sprint needed)

---

## Design Mode

For visual/UI work, skip the sprint ceremony. Design is iterative, not checkbox-driven.

### Workflow
1. **Understand the vision** - What's the aesthetic goal? Target audience? Reference designs?
2. **Invoke the frontend-design skill** if available: use the Skill tool with \`frontend-design\`
3. **Iterate visually** - Make changes → screenshot/describe → get feedback → refine
4. **When satisfied** - Commit the final design, update PROGRESS.md

### Design Principles
- **Consistency** - Colors, spacing, typography should feel unified
- **Hierarchy** - Important things should be visually prominent
- **Breathing room** - Don't crowd elements; whitespace is good
- **Feedback** - Interactive elements should respond (hover, active states)

---

## Continue Mode (Sprint In Progress)

### Get Bearings (2 min max)
1. Read \`docs/PROGRESS.md\` — What's done?
2. Read \`docs/HANDOFF.md\` — Last session's state
3. Read the active sprint file in \`docs/sprints/\`
4. Run \`git status\` — Any uncommitted changes?

### Execute
1. Pick next incomplete feature from sprint file
2. Work on **ONE feature at a time**
3. Commit frequently with descriptive messages
4. Mark feature as \`passes: true\` when tested end-to-end
5. Continue to next feature

### Before Ending
1. Update \`docs/HANDOFF.md\` with current state
2. Commit all work

---

## Planning Mode (New Initiative)

### Step 1: Understand
Ask: **"What are we building?"** if unclear. Otherwise, proceed with what the user stated.

### Step 2: Explore
- Read codebase for relevant patterns
- Identify files/components that will be affected
- Clarify scope if needed

### Step 3: Create Sprint
Save to \`docs/sprints/YYYY-MM-DD-<slug>.json\`:
\`\`\`json
{
  "initiative": "Initiative Name",
  "created": "YYYY-MM-DD",
  "status": "in_progress",
  "context": {
    "test_command": "pnpm test",
    "quality_criteria": ["Tests pass", "No TypeScript errors"]
  },
  "features": [
    {
      "id": "feat-001",
      "description": "User can do X",
      "steps": ["Step 1", "Step 2", "Verify"],
      "passes": false
    }
  ]
}
\`\`\`

### Step 4: START WORKING IMMEDIATELY
**CRITICAL:** After creating the sprint, immediately begin working on the first feature. Do NOT tell the user to run autopilot separately. Just start.

If the user wants to step away for autonomous work, they can:
- Press Ctrl+C to exit
- Run \`shiplog autopilot\` later

But by default, **you start working right away**.

---

## Quick Task Mode

For small tasks that don't need a sprint (bug fixes, small changes, questions):

1. Understand what's needed
2. Do it
3. Commit with descriptive message
4. Done

No sprint file needed for quick wins.

---

## Post-Compaction Recovery

If you've just resumed after context compaction:
1. **Re-read** the current sprint file immediately
2. **Check alignment**: "Is what I'm about to do aligned with the sprint?"
3. **If drifted**: Stop and re-orient
4. **If aligned**: Continue

---

**Key principles:**
- One feature at a time
- Leave code working
- After planning, START WORKING (don't wait for autopilot)
- Design mode = visual iteration, not checkboxes
`;
}

// V2: Design mode for creative/aesthetic work
function getSHIPDESIGNmd(projectName: string): string {
  return `You are doing **design work** on **${projectName}**.

${getDriverSeatPersona()}

---

## Design Mode

This is a **lighter structure** for creative and aesthetic work.

### Key Differences from Implementation Mode:
- **No sprint file required** — iterate visually instead of checking boxes
- **Show, don't tell** — make changes and demonstrate them
- **Aesthetic judgment > checklists** — trust your design instincts
- **Faster iteration** — commit less frequently, experiment more

---

## Workflow

### 1. Understand the Vision
- What's the aesthetic goal? (e.g., "dark mode", "premium feel", "playful")
- What's the target audience? (developers, consumers, enterprise)
- Any reference designs or inspirations?

### 2. Use the Frontend Design Skill
If available, invoke the \`frontend-design\` skill for high-quality UI work:
\`\`\`
/skill frontend-design
\`\`\`

### 3. Iterate Visually
- Make changes
- Take screenshots or describe the result
- Get feedback
- Refine

### 4. When Satisfied
- Commit the final design
- Update PROGRESS.md with what was accomplished
- Optionally: create a sprint file to track remaining polish items

---

## Design Principles

- **Consistency** — Colors, spacing, typography should feel unified
- **Hierarchy** — Important things should be visually prominent
- **Breathing room** — Don't crowd elements; whitespace is good
- **Feedback** — Interactive elements should respond (hover, active states)
- **Polish** — Transitions, shadows, and micro-interactions matter

---

## Quick Commands

\`\`\`bash
npm run dev                    # Start dev server for live preview
git diff --stat                # See what changed
git add -p                     # Stage changes selectively
\`\`\`

---

**Key principle:** For design work, visual iteration beats checklists. Make it look good first, then document.
`;
}

// V2: Session end hook script
function getSessionEndHookSh(): string {
  return `#!/bin/bash
# Session End Hook - Captures metadata for cross-session continuity
# This script runs automatically when a Claude Code session ends

# Don't fail on errors - we want this to be non-blocking
set +e

# Check required tools - exit silently if missing
command -v jq >/dev/null 2>&1 || exit 0

# Read hook input from stdin
input=$(cat)

# Extract session data
transcript_path=$(echo "$input" | jq -r '.transcript_path // ""')
cwd=$(echo "$input" | jq -r '.cwd // ""')
reason=$(echo "$input" | jq -r '.reason // "unknown"')

# Only proceed if we have a working directory
if [ -z "$cwd" ] || [ ! -d "$cwd" ]; then
  exit 0
fi

cd "$cwd" || exit 0

# Create metadata directory if needed
mkdir -p .claude

# Get git info (empty arrays if git not available or not a repo)
if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
  files_changed=$(git diff --name-only 2>/dev/null | head -10 | jq -R -s -c 'split("\\n") | map(select(length > 0))')
  recent_commits=$(git log --oneline -5 2>/dev/null | jq -R -s -c 'split("\\n") | map(select(length > 0))')
else
  files_changed="[]"
  recent_commits="[]"
fi

# Build and append single-line JSON (proper JSONL format)
jq -n -c \\
  --arg ts "$(date -Iseconds)" \\
  --arg r "$reason" \\
  --arg tp "$transcript_path" \\
  --argjson fc "\${files_changed:-[]}" \\
  --argjson rc "\${recent_commits:-[]}" \\
  '{timestamp: $ts, reason: $r, files_changed: $fc, recent_commits: $rc, transcript: $tp}' \\
  >> .claude/session-metadata.jsonl

exit 0
`;
}

function getSessionStartHookSh(): string {
  return `#!/bin/bash
# Session Start Hook - Displays previous session metadata for continuity
# This script runs automatically when a Claude Code session starts

set +e

cwd="$CLAUDE_PROJECT_DIR"

# Only proceed if we have a working directory
if [ -z "$cwd" ] || [ ! -d "$cwd" ]; then
  exit 0
fi

metadata_file="$cwd/.claude/session-metadata.jsonl"

# Check if metadata file exists
if [ ! -f "$metadata_file" ]; then
  echo "📋 First session - no previous session data"
  exit 0
fi

# Get the last session entry
last_entry=$(tail -1 "$metadata_file" 2>/dev/null)

if [ -z "$last_entry" ]; then
  echo "📋 No previous session data found"
  exit 0
fi

# Check if jq is available for pretty printing
if command -v jq >/dev/null 2>&1; then
  echo "📋 Previous session summary:"
  echo "$last_entry" | jq -r '
    "  Ended: \\(.timestamp // \"unknown\")",
    "  Reason: \\(.reason // \"unknown\")",
    "  Files changed: \\((.files_changed // []) | length)",
    "  Recent commits: \\((.recent_commits // []) | length)"
  ' 2>/dev/null || echo "  (Could not parse session data)"
else
  echo "📋 Previous session: $last_entry"
fi

exit 0
`;
}

// Autonomy hook scripts (dormant until .shiplog/autonomy-active exists)
function getAutonomyStopHookSh(): string {
  return `#!/bin/bash
# Shiplog Autonomy Stop Hook
# Blocks Claude from stopping unless escape phrase is detected or max iterations reached.
# This hook is dormant unless .shiplog/autonomy-active exists.

set +e  # Don't exit on error - we need to handle gracefully

ACTIVATION_FILE=".shiplog/autonomy-active"

# Not in autonomy mode? Pass through silently
if [ ! -f "$ACTIVATION_FILE" ]; then
  exit 0
fi

# Read activation state
if ! STATE=$(cat "$ACTIVATION_FILE" 2>/dev/null); then
  # Can't read file - allow stop
  exit 0
fi

# Parse state (with defaults if jq unavailable or fields missing)
if command -v jq &> /dev/null; then
  ITERATION=$(echo "$STATE" | jq -r '.iteration // 0')
  MAX_ITER=$(echo "$STATE" | jq -r '.maxIterations // 20')
else
  # Fallback: simple grep for iteration count
  ITERATION=$(echo "$STATE" | grep -o '"iteration":[0-9]*' | grep -o '[0-9]*' || echo "0")
  MAX_ITER=$(echo "$STATE" | grep -o '"maxIterations":[0-9]*' | grep -o '[0-9]*' || echo "20")
fi

# Read stdin (Claude's output before stopping)
INPUT=$(cat)

# Check for escape phrases
if echo "$INPUT" | grep -qE "SHIPLOG_DONE|SHIPLOG_NEED_USER"; then
  # Escape phrase detected - allow stop
  exit 0
fi

# Check max iterations (safety valve)
if [ "$ITERATION" -ge "$MAX_ITER" ]; then
  echo "Autonomy: Max iterations reached ($MAX_ITER). Stopping."
  exit 0
fi

# Increment iteration counter
NEW_ITER=$((ITERATION + 1))
if command -v jq &> /dev/null; then
  echo "$STATE" | jq ".iteration = $NEW_ITER" > "$ACTIVATION_FILE"
else
  # Fallback: sed replacement
  sed -i.bak "s/\\"iteration\\":[0-9]*/\\"iteration\\":$NEW_ITER/" "$ACTIVATION_FILE" 2>/dev/null || true
fi

# Block stop - tell Claude to keep going
# Output JSON that Claude Code understands
cat << 'EOF'
{"decision": "block", "reason": "Keep working! You're in autonomy mode. Say SHIPLOG_DONE when the task is complete, or SHIPLOG_NEED_USER if you need human input."}
EOF
`;
}

function getAutonomySessionStartHookSh(): string {
  return `#!/bin/bash
# Shiplog Autonomy Session Start Hook
# Shows autonomy status when active. Dormant unless .shiplog/autonomy-active exists.

set +e  # Don't exit on error

ACTIVATION_FILE=".shiplog/autonomy-active"

# Not in autonomy mode? Silent pass through
if [ ! -f "$ACTIVATION_FILE" ]; then
  exit 0
fi

# Read activation state
if ! STATE=$(cat "$ACTIVATION_FILE" 2>/dev/null); then
  exit 0
fi

# Parse state
if command -v jq &> /dev/null; then
  ITERATION=$(echo "$STATE" | jq -r '.iteration // 0')
  MAX_ITER=$(echo "$STATE" | jq -r '.maxIterations // 20')
else
  ITERATION=$(echo "$STATE" | grep -o '"iteration":[0-9]*' | grep -o '[0-9]*' || echo "0")
  MAX_ITER=$(echo "$STATE" | grep -o '"maxIterations":[0-9]*' | grep -o '[0-9]*' || echo "20")
fi

# Display autonomy status
echo ""
echo "AUTONOMY MODE ACTIVE (iteration $ITERATION/$MAX_ITER)"
echo "  Say SHIPLOG_DONE when the task is complete"
echo "  Say SHIPLOG_NEED_USER if you need human input"
echo ""
`;
}

// Export template functions for upgrade command
export {
  getSHIPmd,
  getSTATUSmd,
  getSessionEndHookSh,
  getSessionStartHookSh,
  getSETTINGSjson,
  getAutonomyStopHookSh,
  getAutonomySessionStartHookSh,
};
