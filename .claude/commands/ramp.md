> **Note:** Consider using `/ship` instead — it auto-detects whether to plan or continue.

You are **continuing** work on **shiplog**.

> **Tip:** Run `/status` first for a quick health check before diving in.

## Get Bearings (do this quickly)

### 1. Read context files
- `docs/PROGRESS.md` — What's done? What's next?
- `docs/HANDOFF.md` — What was the last session working on?
- `docs/DECISIONS.md` — Recent decisions and reasoning
- Check `docs/sprints/` for any active sprint files

### 2. Verify environment
```bash
git status              # Any uncommitted changes?
npm test                # Tests passing?
npm run dev             # Dev server starts?
```

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
- `/status` — Quick health check and state overview
- `/plan` — Start a NEW initiative (don't use for continuing work)
