# Decision Log

> Document significant decisions with reasoning, so future sessions understand *why* things were done.

---

## 2025-12-07: Initialize Shiplog

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

```markdown
## YYYY-MM-DD: [Decision Title]

**Decision:** What was decided

**Alternatives Considered:**
1. [Option A] — Why not chosen
2. [Option B] — Why not chosen

**Reasoning:** Why this decision makes sense

**Owner:** Claude / Human / Both
```
