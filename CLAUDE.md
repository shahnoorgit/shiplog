# shiplog

> Project instructions for Claude Code. This file is automatically loaded at the start of each session.

## Terminology (Pirate Edition 🏴‍☠️)

- **Captain** = The planning/architect agent (sets the course)
- **Crew** = The implementing agent (does the work)
- **Navigator** = Explore/research sub-agents
- **Quartermaster** = Budget tracking features

## Commands

**IMPORTANT: Use pnpm, not npm!**

```bash
pnpm install      # Install dependencies
pnpm run dev      # Start development server
pnpm test         # Run tests
pnpm run build    # Build the project
```

## Architecture

<!-- Describe your project's architecture, key directories, and patterns -->

### Key Directories

- `src/` — Source code
- `docs/` — Documentation and agent artifacts

### Patterns

<!-- Document patterns the agent should follow -->

## Environment Variables

<!-- List required environment variables -->

```
# .env.local
API_KEY=xxx
```

---

## Agent Session Protocol

For long-running sessions across multiple contexts, follow this workflow:

### Session Start
1. Read `docs/PROGRESS.md` — What's done? What's next?
2. Read `docs/HANDOFF.md` — Current session state
3. Read `docs/DECISIONS.md` — Recent decisions and reasoning
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
