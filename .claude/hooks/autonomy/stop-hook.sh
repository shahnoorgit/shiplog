#!/bin/bash
# Shiplog Autonomy Stop Hook
# Blocks Claude from stopping unless escape phrase is detected or max iterations reached.
# This hook is dormant unless .shiplog/autonomy-active exists.

set +e  # Don't exit on error - we need to handle gracefully

ACTIVATION_FILE=".shiplog/autonomy-active"

# Not in autonomy mode? Pass through silently
if [ ! -f "$ACTIVATION_FILE" ]; then
  exit 0
fi

# Read activation state
if ! STATE=$(cat "$ACTIVATION_FILE" 2>/dev/null); then
  # Can't read file - allow stop
  exit 0
fi

# Parse state (with defaults if jq unavailable or fields missing)
if command -v jq &> /dev/null; then
  ITERATION=$(echo "$STATE" | jq -r '.iteration // 0')
  MAX_ITER=$(echo "$STATE" | jq -r '.maxIterations // 20')
else
  # Fallback: simple grep for iteration count
  ITERATION=$(echo "$STATE" | grep -o '"iteration":[0-9]*' | grep -o '[0-9]*' || echo "0")
  MAX_ITER=$(echo "$STATE" | grep -o '"maxIterations":[0-9]*' | grep -o '[0-9]*' || echo "20")
fi

# Read stdin (Claude's output before stopping)
INPUT=$(cat)

# Check for escape phrases
if echo "$INPUT" | grep -qE "SHIPLOG_DONE|SHIPLOG_NEED_USER"; then
  # Escape phrase detected - allow stop
  exit 0
fi

# Check max iterations (safety valve)
if [ "$ITERATION" -ge "$MAX_ITER" ]; then
  echo "Autonomy: Max iterations reached ($MAX_ITER). Stopping."
  exit 0
fi

# Increment iteration counter
NEW_ITER=$((ITERATION + 1))
if command -v jq &> /dev/null; then
  echo "$STATE" | jq ".iteration = $NEW_ITER" > "$ACTIVATION_FILE"
else
  # Fallback: sed replacement
  sed -i.bak "s/\"iteration\":[0-9]*/\"iteration\":$NEW_ITER/" "$ACTIVATION_FILE" 2>/dev/null || true
fi

# Block stop - tell Claude to keep going
# Output JSON that Claude Code understands
cat << 'EOF'
{"decision": "block", "reason": "Keep working! You're in autonomy mode. Say SHIPLOG_DONE when the task is complete, or SHIPLOG_NEED_USER if you need human input."}
EOF
