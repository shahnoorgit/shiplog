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
      "  - .claude/ directory with /status, /ramp, /plan commands\n" +
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
    "Only create essential files (PROGRESS, DECISIONS, HANDOFF, /ramp)",
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
    const dirs = [".claude/commands", ".claude/hooks", "docs", "docs/sprints"];
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
        path: ".claude/commands/ramp.md",
        content: getRAMPmd(projectName),
        minimalInclude: true,
      },
      {
        path: ".claude/commands/plan.md",
        content: getPLANmd(projectName),
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

      // V2: New unified commands
      {
        path: ".claude/commands/ship.md",
        content: getSHIPmd(projectName),
        minimalInclude: true,
      },
      {
        path: ".claude/commands/ship-design.md",
        content: getSHIPDESIGNmd(projectName),
        minimalInclude: true,
      },
      {
        path: ".claude/hooks/session-end.sh",
        content: getSessionEndHookSh(),
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

      fs.writeFileSync(filePath, file.content);
      console.log(`  ✅ Created ${file.path}`);
      created++;
    }

    // Summary
    console.log(`\n✨ Done! Created ${created} files${skipped > 0 ? `, skipped ${skipped}` : ""}.\n`);
    console.log("Next steps:");
    console.log("  1. Review and customize CLAUDE.md for your project");
    console.log("  2. Add your project's commands and patterns");
    console.log("  3. Use /ship to start working (auto-detects plan vs continue mode)");
    console.log("  4. Use /ship design for aesthetic/creative work\n");
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
.claude/commands/ramp.md
.claude/session-start.md
.claude/settings.local.json
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
1. Start with /status or /ramp — understand where we are
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

- **All clear** → "✅ Ready to continue. Run /ramp to pick up where you left off."
- **Minor issues** → "⚠️ Minor issues found. Review above, then /ramp."
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
  },
  "hooks": {
    "SessionEnd": [
      {
        "hooks": [{
          "type": "command",
          "command": "bash $CLAUDE_PROJECT_DIR/.claude/hooks/session-end.sh"
        }]
      }
    ]
  }
}
`;
}

// V2: Unified /ship command with smart mode detection
function getSHIPmd(projectName: string): string {
  return `You are working on **${projectName}**.

${getDriverSeatPersona()}

---

## Quick Mode Detection

Check what mode to use:

1. Run \`ls docs/sprints/*.json 2>/dev/null | head -1\` to find active sprints
2. If a sprint exists with incomplete features → **Continue Mode**
3. If no sprint exists or all features pass → **Planning Mode**
4. If user provides a new goal/task → **Planning Mode**

---

## Continue Mode (Sprint In Progress)

### Get Bearings (2 min max)
1. Read \`docs/PROGRESS.md\` — What's done? What's next?
2. Read \`docs/HANDOFF.md\` — Last session's state
3. Read the active sprint file in \`docs/sprints/\`
4. Run \`git status\` — Any uncommitted changes?

### Verify Environment
\`\`\`bash
git status              # Clean state?
npm test                # Tests passing?
npm run dev             # Dev server starts?
\`\`\`

### Execute
1. Pick next incomplete feature from sprint file
2. Work on **ONE feature at a time**
3. Commit frequently with descriptive messages
4. Mark feature as \`passes: true\` when tested end-to-end
5. Update PROGRESS.md as items complete

### Before Ending
1. Update \`docs/HANDOFF.md\` with current state
2. Commit all work
3. Leave codebase in clean, working state

---

## Planning Mode (New Initiative)

If starting new work:

1. **Ask**: "What are we building? Describe the goal."
2. **Explore**: Read codebase for relevant patterns
3. **Clarify**: Ask questions about scope, approach, constraints
4. **Design**: Create implementation plan
5. **Create Sprint**: Save to \`docs/sprints/YYYY-MM-DD-<slug>.json\`
6. **Update PROGRESS.md**: Add new initiative
7. **Begin**: Start on first feature

### Sprint File Format
\`\`\`json
{
  "initiative": "Initiative Name",
  "created": "YYYY-MM-DD",
  "status": "in_progress",
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

**CRITICAL**: Feature descriptions are IMMUTABLE. You can only update \`passes\` to \`true\`.

---

## Post-Compaction Recovery

If you've just resumed after context compaction:

1. **Re-read** the current sprint file immediately
2. **Check alignment**: "Is what I'm about to do aligned with the sprint?"
3. **If drifted**: Stop and re-orient before continuing
4. **If aligned**: Continue with renewed focus

This prevents drift after context loss.

---

## Quick Status Check

Run \`/ship status\` or \`/status\` to see:
- Current sprint progress
- Recent commits
- Any uncommitted changes
- Test status

---

**Key principle:** One feature at a time. Leave code working. Update HANDOFF.md before ending.
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

set -e

# Read hook input from stdin
input=$(cat)

# Extract session data
transcript_path=$(echo "$input" | jq -r '.transcript_path // empty')
cwd=$(echo "$input" | jq -r '.cwd // empty')
reason=$(echo "$input" | jq -r '.reason // "unknown"')

# Only proceed if we have a working directory
if [ -z "$cwd" ] || [ ! -d "$cwd" ]; then
  exit 0
fi

cd "$cwd"

# Create metadata directory if needed
mkdir -p .claude

# Capture session metadata
{
  echo "{"
  echo "  \\"timestamp\\": \\"$(date -Iseconds)\\","
  echo "  \\"reason\\": \\"$reason\\","
  echo "  \\"files_changed\\": ["
  git diff --name-only HEAD 2>/dev/null | head -10 | sed 's/.*/"&"/' | paste -sd, - || echo ""
  echo "  ],"
  echo "  \\"recent_commits\\": ["
  git log --oneline -5 2>/dev/null | sed 's/.*/"&"/' | paste -sd, - || echo ""
  echo "  ],"
  echo "  \\"transcript\\": \\"$transcript_path\\""
  echo "}"
} >> .claude/session-metadata.jsonl

exit 0
`;
}
