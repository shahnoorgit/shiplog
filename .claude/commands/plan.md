> **Note:** Consider using `/ship` instead — it auto-detects whether to plan or continue.

You are starting a **new initiative** on **shiplog**.

## Step 1: Understand the Goal

Ask the user: **"What are we building? Describe the goal and I'll help plan it."**

Wait for their response before proceeding.

## Step 2: Gather Context

Once you understand the goal:
1. Read `docs/PROGRESS.md` — What's the current project state?
2. Read `docs/HANDOFF.md` — Any recent context?
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
```
docs/sprints/YYYY-MM-DD-<initiative-slug>.json
```

Format:
```json
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
```

**Important:** Once created, feature descriptions are IMMUTABLE. You can only update `passes` to `true`.

## Step 5: Update PROGRESS.md

Add the initiative to PROGRESS.md:
```markdown
## In Progress

### [Initiative Name] (sprint: YYYY-MM-DD-slug)
- [ ] Feature 1
- [ ] Feature 2
```

## Step 6: Begin Work

Use `/ramp` to continue working on the initiative, or start immediately:
1. Pick the first feature from the sprint file
2. Implement it
3. Test it end-to-end
4. Mark `passes: true` in the sprint file
5. Commit with descriptive message
6. Continue to next feature

---

**Key principle:** Break big goals into verifiable features. Each feature should be testable end-to-end.
