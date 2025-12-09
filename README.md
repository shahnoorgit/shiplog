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
