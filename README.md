# shiplog

[![npm version](https://img.shields.io/npm/v/shiplog.svg)](https://www.npmjs.com/package/shiplog)
[![npm downloads](https://img.shields.io/npm/dm/shiplog.svg)](https://www.npmjs.com/package/shiplog)
[![CI](https://github.com/danielgwilson/shiplog/actions/workflows/ci.yml/badge.svg)](https://github.com/danielgwilson/shiplog/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Put Claude in the driver's seat.**

shiplog is infrastructure for long-running AI agent sessions. It gives Claude the context and structure to *drive* your projects autonomously — planning work, tracking progress, and picking up exactly where it left off across sessions.

```bash
npx shiplog init
```

---

## The Problem

AI agents forget everything between sessions. Without structure, they:

- **One-shot complex projects** — running out of context mid-implementation
- **Declare victory prematurely** — seeing some progress and assuming done
- **Leave broken states** — no clean handoffs between sessions
- **Re-litigate decisions** — forgetting why things were done

You end up babysitting instead of shipping.

## The Solution: Let Claude Drive

shiplog creates a simple file-based harness that puts Claude in control:

```
/ship "Add user authentication"
```

Claude takes it from there:
1. **Plans the work** — breaks it into features, creates a sprint file
2. **Tracks progress** — knows what's done, what's next
3. **Handles handoffs** — captures state at session end, restores at session start
4. **Remembers decisions** — logs the *why*, not just the *what*

You review, approve, and steer. Claude executes.

---

## Quick Start

```bash
# Initialize in your project
npx shiplog init

# Then in Claude Code, just run:
/ship
```

That's it. Claude auto-detects whether to plan new work or continue existing work.

---

## See It In Action

### Starting a New Feature

```
You: /ship "Add user authentication"

Claude: I'll plan the authentication feature for you.

📋 Creating sprint: 2025-01-08-user-auth.json

Features:
1. ◻️ User can sign up with email/password
2. ◻️ User can log in and receive JWT token
3. ◻️ Protected routes check authentication
4. ◻️ User can reset password via email

Starting work on feature 1...
```

### Autopilot Running Autonomously

```
============================================================
  🚁 Shiplog Autopilot
============================================================

📋 Initiative: Add user authentication
📌 Current task: User can sign up with email/password
🔄 Max iterations: 20
⏸️  Stall threshold: 3 iterations

------------------------------------------------------------
  SESSION 1/20
------------------------------------------------------------
🚀 Starting Claude session...

[Claude works autonomously - you can watch or walk away]

📊 Session 1 Results:
   Duration: 4m 32s
   Commits made: 3
   Cost: $0.0847
   Features: 1/4 complete ✓

⏳ Starting next iteration in 3 seconds...
```

### Session Continuity

```
Day 1: /ship "Add auth"     → Creates sprint, builds features 1-2
Day 2: /ship                → Continues automatically, builds features 3-4
Day 3: /ship                → Sprint complete! Ready for next initiative
```

---

## How It Works

### One Command: `/ship`

| Command | What It Does |
|---------|--------------|
| `/ship` | Auto-detects: plans new work OR continues existing sprint |
| `/ship "feature name"` | Starts planning a specific feature |
| `/ship design` | Lighter mode for creative/UI work |
| `/ship status` | Quick health check |

### Example Workflow

```
Day 1: /ship "Add referral system"
       └── Claude plans → creates sprint file → starts building

Day 2: /ship
       └── Claude continues → picks up where Day 1 left off

Day 3: /ship
       └── Claude finishes → all features pass → ready for next thing

Day 4: /ship "Notification system"
       └── New sprint begins
```

### What It Creates

```
your-project/
├── .claude/
│   ├── commands/
│   │   └── ship.md           # The magic — driver's seat prompt
│   ├── hooks/
│   │   ├── session-start.sh  # Auto-restores context
│   │   └── session-end.sh    # Auto-captures state
│   └── settings.local.json   # Permissions + hooks config
│
├── docs/
│   ├── sprints/              # Per-initiative tracking
│   ├── PROGRESS.md           # What's done, what's next
│   ├── DECISIONS.md          # Why things were done
│   └── HANDOFF.md            # Session state
│
└── CLAUDE.md                 # Project instructions
```

---

## The "Driver's Seat" Philosophy

Most agent setups treat AI as a tool you direct. shiplog flips this:

> **You're the passenger. Claude is driving.**

This means:
- Claude proposes the plan, you approve it
- Claude decides task order and implementation details
- Claude asks *you* questions when blocked
- You intervene when needed, not continuously

The result? Less babysitting, more shipping.

---

## Key Features

### Session Continuity
Hooks automatically capture context at session end and restore it at session start. No more "where were we?"

### Sprint-Based Planning
Work is organized into sprints with explicit feature tracking. Claude knows exactly what's done and what's left.

### Decision Logging
The *why* matters as much as the *what*. Decisions are logged so future sessions don't re-litigate past choices.

### Graceful Upgrades
Already using shiplog v1? Just run:
```bash
npx shiplog upgrade
```
Your content is preserved. Only templates are updated.

---

## Autopilot Mode

> **The dream: Walk away. Come back to finished work.**

Autopilot runs Claude in a loop. Each session works on your sprint until context fills up. Then it extracts learnings, restarts Claude with fresh context + accumulated knowledge, and continues. Repeat until done.

```bash
shiplog autopilot
```

### How It Works

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. START    → Claude reads sprint, picks next feature, works on it │
│  2. WORK     → Claude commits frequently, updates sprint progress   │
│  3. EXIT     → Context fills up or feature done, Claude exits       │
│  4. LEARN    → Autopilot extracts learnings from commit history     │
│  5. RESTART  → Fresh Claude session with learnings injected         │
│  6. REPEAT   → Until sprint complete or stall detected              │
└─────────────────────────────────────────────────────────────────────┘
```

### The Key Insight

Claude doesn't run infinitely in ONE session. It runs **multiple sessions with learning injected between them**.

Each session:
- Gets the current sprint context (what's done, what's next)
- Gets accumulated learnings from previous sessions (what worked, what failed)
- Works autonomously until context is exhausted
- Exits cleanly, letting autopilot extract new learnings

This is inspired by the [ACE (Agentic Context Engine) framework](https://github.com/kayba-ai/agentic-context-engine) which achieved 119 commits over 4 hours on a single initiative.

### What You'll See

```
============================================================
  🚁 Shiplog Autopilot
============================================================

📋 Initiative: Add user authentication
📌 Current task: Implement login form validation
🔄 Max iterations: 20
⏸️  Stall threshold: 3 iterations

------------------------------------------------------------
  SESSION 1/20
------------------------------------------------------------
🚀 Starting Claude session...

[Claude's output appears here — you can watch or walk away]

📊 Session 1 Results:
   Commits made: 7
   Cost: $0.0847
   Tokens: 12,345 in / 2,456 out
   Total commits: 7
📚 Updated SKILLBOOK.md with 2 learnings

⏳ Starting next iteration in 3 seconds...

------------------------------------------------------------
  SESSION 2/20
------------------------------------------------------------
...
```

### Safety & Guardrails

| Guardrail | What It Does |
|-----------|--------------|
| **Stall Detection** | Stops if no commits for N sessions (default: 3) |
| **Max Iterations** | Hard limit on total sessions (default: 20) |
| **Git-Based Progress** | Only real commits count — no fake progress |
| **Interruptible** | Ctrl+C stops cleanly, state is saved |
| **Dry-Run Mode** | Preview everything without running Claude |
| **Budget Limits** | Cap spending per session (default: $5) |
| **Cost Tracking** | See cost and token usage per session |

### Prerequisites

1. **Active sprint** — Create one with `/ship "your feature"` first
2. **Incomplete features** — At least one feature with `passes: false`
3. **Git repository** — Commits are how progress is measured

### Files Created

```
.shiplog/                      # Session data (gitignored automatically)
├── autopilot-state.json       # Current run state
├── sessions/                  # Individual session logs
└── current-prompt.md          # Last prompt sent to Claude

docs/SKILLBOOK.md              # Accumulated learnings (persists across runs)
```

### The Skillbook

As autopilot runs, it builds a **skillbook** — a living document of what works and what doesn't in your codebase:

```markdown
# Skillbook

## What Works
- Tests added/updated: "add validation tests for login form"
- Tests added/updated: "add e2e tests for auth flow"

## What To Avoid
- Needed fix: "fix: handle null user in session check"
- Needed fix: "fix: missing await on async validation"
```

This gets injected into every new session, so Claude learns from past mistakes without you having to explain them.

### Usage Examples

```bash
# Start with sensible defaults (20 iterations, 3 stall threshold)
shiplog autopilot

# Preview what would happen without running Claude
shiplog autopilot --dry-run

# Allow up to 50 sessions (for big initiatives)
shiplog autopilot -n 50

# More patience before stall detection (5 sessions without commits)
shiplog autopilot -s 5

# Quick run, fail fast on stalls
shiplog autopilot -n 10 -s 2

# Set session timeout (default: 30 minutes)
shiplog autopilot -t 3600    # 1 hour per session

# Set budget limit per session (default: $5)
shiplog autopilot --max-budget 10.0
```

### Typical Workflow

```bash
# 1. Create a sprint in Claude
claude
> /ship "Add payment processing"
# Claude creates sprint file, you approve

# 2. Exit Claude, start autopilot
exit
shiplog autopilot

# 3. Walk away. Check back later.
# Autopilot shows progress, commits pile up.

# 4. Sprint completes or stalls
# Review the work, merge to main, start next sprint
```

### When It Stops

Autopilot stops when:

| Condition | What Happens |
|-----------|--------------|
| **Sprint Complete** | All features have `passes: true` |
| **Stall Detected** | N sessions with no commits |
| **Max Iterations** | Hit the `-n` limit |
| **Ctrl+C** | Manual interruption (state saved) |
| **Error** | Claude fails to start |

### FAQ

**Q: What if Claude goes off the rails?**

A: Stall detection catches this. If Claude stops making commits (real progress), autopilot stops. You can also Ctrl+C anytime.

**Q: Does it push to git?**

A: No. Claude commits locally. You review and push when ready.

**Q: Can I resume after stopping?**

A: Yes. State is saved in `.shiplog/autopilot-state.json`. Just run `shiplog autopilot` again.

**Q: How is this different from ACE?**

A: ACE requires Python and external API calls for the learning loop. Shiplog autopilot is pure Node.js, simpler, and integrated with the shiplog sprint system. Same core idea, lighter implementation.

**Q: What if I don't have a sprint?**

A: Autopilot requires a sprint. Run `claude` and use `/ship "your feature"` to create one first.

---

## CLI Reference

```bash
# Initialize new project
npx shiplog init
npx shiplog init --name "my-project"
npx shiplog init --minimal        # Essential files only
npx shiplog init --force          # Overwrite existing

# Upgrade existing v1 project to v2
npx shiplog upgrade
npx shiplog upgrade --force       # Re-apply even if already v2

# Run autonomous loop (see Autopilot Mode above)
shiplog autopilot
shiplog autopilot --dry-run       # Preview without running
shiplog autopilot -n 50 -s 5      # Custom iterations/threshold
shiplog autopilot -t 3600         # 1 hour timeout per session
shiplog autopilot --max-budget 10 # $10 budget per session

# Check installation health
shiplog doctor
shiplog doctor --fix              # Auto-fix issues

# Show sprint status
shiplog status
shiplog status --json             # Output as JSON
shiplog status -s my-sprint       # Show specific sprint
```

---

## Based On Research

Built on insights from:

- [Anthropic — Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Anthropic — Context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [LangChain — Context Engineering for Agents](https://blog.langchain.com/context-engineering-for-agents/)

See [`docs/RESEARCH.md`](docs/RESEARCH.md) for a deep dive.

---

## Why Plain Files?

> "Simple structures beat complex automation for long-running agents."

- **Git-trackable** — full history of progress and decisions
- **Human-readable** — easy to review and edit
- **No dependencies** — works with any project
- **Agent-friendly** — LLMs handle text better than databases

---

## Contributing

Contributions welcome! Please read [`docs/RESEARCH.md`](docs/RESEARCH.md) first to understand the design principles.

---

## License

MIT

---

## Author

**Daniel G Wilson**

- [@the_danny_g](https://x.com/the_danny_g)
- [LinkedIn](https://linkedin.com/in/danielgwilson)
- [GitHub](https://github.com/danielgwilson)

---

<p align="center">
  <i>Stop babysitting. Start shipping.</i>
</p>
