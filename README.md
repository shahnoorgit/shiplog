# agent-harness

Bootstrap infrastructure for long-running AI agents.

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
npx agent-harness init
```

Or install globally:

```bash
npm install -g agent-harness
agent-harness init
```

## Usage

### Initialize a project

```bash
# Full setup (recommended)
npx agent-harness init

# With custom project name
npx agent-harness init --name "my-project"

# Minimal setup (essential files only)
npx agent-harness init --minimal

# Skip optional files
npx agent-harness init --no-voice --no-features

# Overwrite existing files
npx agent-harness init --force
```

### What it creates

```
your-project/
├── .claude/
│   ├── commands/
│   │   └── ramp.md              # /ramp command for session startup
│   ├── session-start.md         # Detailed startup checklist
│   └── settings.local.json      # Tool permissions template
│
├── docs/
│   ├── PROGRESS.md              # Task tracking across sessions
│   ├── DECISIONS.md             # Decision log with reasoning
│   ├── HANDOFF.md               # Current session state
│   ├── FEATURES.json            # Feature list with pass/fail
│   └── CLAUDE_VOICE.md          # Agent persona template
│
└── CLAUDE.md                    # Project instructions
```

## How It Works

### Session Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                     SESSION START                            │
├─────────────────────────────────────────────────────────────┤
│  1. Run /ramp command                                        │
│  2. Read PROGRESS.md, HANDOFF.md, DECISIONS.md              │
│  3. Verify tests pass and dev server starts                  │
│  4. Pick ONE task from PROGRESS.md                          │
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
| `FEATURES.json` | Feature list with pass/fail status | After testing features |
| `CLAUDE.md` | Project-specific instructions | When project structure changes |

## CLI Reference

```
Usage: agent-harness [command] [options]

Commands:
  init          Initialize agent harness in current directory

Options:
  -V, --version    Output version number
  -h, --help       Display help

Init Options:
  -n, --name <name>    Project name for CLAUDE.md header
  -m, --minimal        Only essential files (PROGRESS, DECISIONS, HANDOFF, /ramp)
  --no-voice           Skip CLAUDE_VOICE.md template
  --no-features        Skip FEATURES.json template
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
