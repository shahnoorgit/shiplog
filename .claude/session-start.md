# Session Start Checklist

Use this checklist at the start of each agent session.

## Phase 1: Orient (2 min)

- [ ] Read `docs/PROGRESS.md` — What's done? What's next?
- [ ] Read `docs/HANDOFF.md` — What was the last session working on?
- [ ] Read recent entries in `docs/DECISIONS.md`
- [ ] Check `git log --oneline -10` for recent commits

## Phase 2: Verify (3 min)

- [ ] Run `npm test` (or equivalent) — all passing?
- [ ] Run `npm run dev` (or equivalent) — starts without errors?
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
