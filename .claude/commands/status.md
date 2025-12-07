You are checking the **status** of **shiplog**.

## Quick Status Report

Generate a brief status report by examining these files:

### 1. Read Current State
- `docs/PROGRESS.md` — Current phase and recent completions
- `docs/HANDOFF.md` — Last session's state
- `docs/sprints/` — Any active sprint files
- `git log --oneline -5` — Recent commits

### 2. Report Format

Provide a summary like this:

```
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
```

---

## Health Checks

Run these validation checks and report any issues:

### ✓ Handoff Freshness
- When was HANDOFF.md last updated?
- If > 1 session old, flag: "⚠️ HANDOFF.md may be stale"

### ✓ Git State
- Run `git status`
- If uncommitted changes exist, flag: "⚠️ Uncommitted changes detected"
- If ahead of remote, flag: "📤 Unpushed commits"

### ✓ Sprint Integrity (if sprint exists)
- Read the active sprint file
- Count features: X passing / Y total
- If any feature marked `passes: true` but tests fail, flag: "❌ Sprint integrity issue"

### ✓ Progress Alignment
- Compare PROGRESS.md "In Progress" with HANDOFF.md "What's Next"
- If they don't match, flag: "⚠️ PROGRESS.md and HANDOFF.md out of sync"

### ✓ Environment
- Run `npm test` (or equivalent)
- If tests fail, flag: "❌ Tests failing"

---

## Output

End with a clear recommendation:

- **All clear** → "✅ Ready to continue. Run /ramp to pick up where you left off."
- **Minor issues** → "⚠️ Minor issues found. Review above, then /ramp."
- **Blocking issues** → "❌ Blocking issues. Fix before continuing."

---

**Tip:** Run /status at the start of any session to quickly understand state without diving into work.
