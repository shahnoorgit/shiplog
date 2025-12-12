# Skillbook

> Learnings accumulated across autopilot sessions. Updated automatically.

## What Works

- Tests added/updated: "test: SDK integration test passed"
- Tests added/updated: "test: add SDK verification sprint + pirate terminology"
- Tests added/updated: "test: add SDK verification sprint + pirate terminology"
- **Streaming JSON for real-time output**: Use `claude -p --verbose --output-format stream-json --include-partial-messages` to get chunked output instead of buffered
- **Parsing stream events**: Look for `event.type === "stream_event"` then `event.event.type === "content_block_delta"` with `event.event.delta.text`
- **Graceful interrupt handling**: SIGINT handler can save state before exit
- **Exponential backoff on retries**: 5s, 10s, 20s... gives Claude time to recover
- **Track file changes as soft progress**: `git diff --name-only HEAD` shows work even without commits

## What To Avoid

- **Don't use `--print` mode default text output for streaming**: It buffers the entire response (~8+ seconds of silence)
- **Don't assume `stdio: 'inherit'` streams through npm link**: It doesn't always work through the bin wrapper
- **Don't retry on timeouts**: If Claude timed out, retrying immediately won't help

## Patterns

- Commander.js for CLI commands with options
- ESM modules (import, not require)
- JSON sprint files in docs/sprints/ for tracking features
- State persistence in .shiplog/ directory (gitignored)

---

*Last updated: 2025-12-12T00:57:11.826Z*
