# 🚢 shiplog

Infrastructure for long-running AI agents. Track progress, decisions, and handoffs across sessions.

Based on [Anthropic's research](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) on effective harnesses for agents that work across multiple context windows.

## The Problem

AI agents face a fundamental challenge: **they work in discrete sessions, and each new session starts with no memory of what came before.**

Without infrastructure, agents tend to:
- Try to one-shot complex projects (running out of context mid-implementation)
- Declare victory prematurely (seeing progress and assuming work is done)
- Leave code in broken states (no clean handoffs between sessions)
- Re-litigate past decisions (forgetting why things were done)

## The Solution

A **harness** — simple file-based infrastructure that enables:
- **Progress tracking** — Know what's done and what's next
- **Decision logging** — Remember why things were done
- **Clean handoffs** — Each session picks up where the last left off
- **Incremental progress** — One feature at a time, always working code

## Installation

```bash
npx shiplog init
```

Or install globally:

```bash
npm install -g shiplog
shiplog init
```

## Usage

### Initialize a project

```bash
# Full setup (recommended)
npx shiplog init

# With custom project name
npx shiplog init --name "my-project"

# Minimal setup (essential files only)
npx shiplog init --minimal

# Skip optional files
npx shiplog init --no-voice --no-features

# Overwrite existing files
npx shiplog init --force
```

### What it creates

```
your-project/
├── .claude/
│   ├── commands/
│   │   ├── status.md            # /status command — health check & overview
│   │   ├── ramp.md              # /ramp command — continue existing work
│   │   └── plan.md              # /plan command — start new initiatives
│   ├── session-start.md         # Detailed startup checklist
│   └── settings.local.json      # Tool permissions template
│
├── docs/
│   ├── sprints/                 # Per-initiative feature tracking
│   ├── PROGRESS.md              # Task tracking across sessions
│   ├── DECISIONS.md             # Decision log with reasoning
│   ├── HANDOFF.md               # Current session state
│   └── CLAUDE_VOICE.md          # Agent persona template
│
└── CLAUDE.md                    # Project instructions
```

With `--features` flag, also creates `docs/FEATURES.json` for global feature tracking.

## How It Works

### Primary Command: /ship

| Command | Use When | What It Does |
|---------|----------|--------------|
| `/ship` | **Any time** | Auto-detects mode: plans new work OR continues existing sprint |
| `/ship design` | **Creative work** | Lighter structure for aesthetic/UI work |
| `/ship status` | **Quick check** | Shows current state + health checks |

### Legacy Commands (still supported)

| Command | Notes |
|---------|-------|
| `/plan` | Use `/ship` instead — it auto-detects when to plan |
| `/ramp` | Use `/ship` instead — it auto-detects when to continue |
| `/status` | Still works, alias for `/ship status` |

**Example workflow:**

```
Day 1: /ship "Add referral system"
  └── Detects no sprint → enters planning mode
  └── Creates docs/sprints/2024-12-04-referral-system.json
  └── Starts working on first feature

Day 2: /ship
  └── Detects existing sprint → continues
  └── Picks up where Day 1 left off

Day 3: /ship design
  └── Working on UI polish
  └── Lighter structure, visual iteration

Day 5: /ship "Mobile redesign"
  └── All features passed → new planning mode
  └── Creates new sprint file
```

### Session Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                     SESSION START                            │
├─────────────────────────────────────────────────────────────┤
│  1. Run /ship (auto-detects plan vs continue mode)           │
│  2. Read PROGRESS.md, HANDOFF.md, sprint files              │
│  3. Verify tests pass and dev server starts                  │
│  4. Pick ONE task from sprint file                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     SESSION WORK                             │
├─────────────────────────────────────────────────────────────┤
│  • Work on ONE feature at a time                             │
│  • Commit frequently with descriptive messages               │
│  • Update PROGRESS.md as items complete                      │
│  • Log significant decisions in DECISIONS.md                 │
│  • Mark sprint features as passing when tested               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     SESSION END                              │
├─────────────────────────────────────────────────────────────┤
│  1. Update HANDOFF.md with current state                     │
│  2. Commit all work in progress                              │
│  3. List open questions for human                            │
│  4. Leave codebase in clean, working state                   │
└─────────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose | When to Update |
|------|---------|----------------|
| `PROGRESS.md` | Track what's done and what's next | After completing tasks |
| `DECISIONS.md` | Log significant decisions with reasoning | When making non-obvious choices |
| `HANDOFF.md` | Capture session state for next session | End of every session |
| `docs/sprints/*.json` | Per-initiative feature tracking | Created via /plan, updated as features pass |
| `CLAUDE.md` | Project-specific instructions | When project structure changes |

## CLI Reference

```
Usage: shiplog [command] [options]

Commands:
  init          Initialize shiplog in current directory

Options:
  -V, --version    Output version number
  -h, --help       Display help

Init Options:
  -n, --name <name>    Project name for CLAUDE.md header
  -m, --minimal        Only essential files (PROGRESS, DECISIONS, HANDOFF, /ramp, /plan)
  --no-voice           Skip CLAUDE_VOICE.md template
  --features           Include global FEATURES.json (use /plan for per-initiative instead)
  -f, --force          Overwrite existing files
  -h, --help           Display help for init command
```

## Research

This tool is based on research from:

- **Anthropic** — [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- **Anthropic** — [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- **LangChain** — [Context Engineering for Agents](https://blog.langchain.com/context-engineering-for-agents/)
- **JetBrains** — [Smarter Context Management](https://blog.jetbrains.com/research/2025/12/efficient-context-management/)

See [docs/RESEARCH.md](docs/RESEARCH.md) for a comprehensive synthesis of best practices.

## Why Simple Files?

> "Simple structures beat complex automation for long-running agents."
> — Anthropic Research

The harness uses plain markdown and JSON files because:

1. **Git-trackable** — Full history of progress and decisions
2. **Human-readable** — Easy to review and edit manually
3. **No dependencies** — Works with any project, any language
4. **Agent-friendly** — LLMs handle text better than databases

## License

MIT

## Contributing

Contributions welcome! Please read the research in `docs/RESEARCH.md` first to understand the design principles.
