#!/bin/bash
# Shiplog Autonomy Session Start Hook
# Shows autonomy status when active. Dormant unless .shiplog/autonomy-active exists.

set +e  # Don't exit on error

ACTIVATION_FILE=".shiplog/autonomy-active"

# Not in autonomy mode? Silent pass through
if [ ! -f "$ACTIVATION_FILE" ]; then
  exit 0
fi

# Read activation state
if ! STATE=$(cat "$ACTIVATION_FILE" 2>/dev/null); then
  exit 0
fi

# Parse state
if command -v jq &> /dev/null; then
  ITERATION=$(echo "$STATE" | jq -r '.iteration // 0')
  MAX_ITER=$(echo "$STATE" | jq -r '.maxIterations // 20')
else
  ITERATION=$(echo "$STATE" | grep -o '"iteration":[0-9]*' | grep -o '[0-9]*' || echo "0")
  MAX_ITER=$(echo "$STATE" | grep -o '"maxIterations":[0-9]*' | grep -o '[0-9]*' || echo "20")
fi

# Display autonomy status
echo ""
echo "AUTONOMY MODE ACTIVE (iteration $ITERATION/$MAX_ITER)"
echo "  Say SHIPLOG_DONE when the task is complete"
echo "  Say SHIPLOG_NEED_USER if you need human input"
echo ""
