#!/bin/bash
# Session Start Hook - Displays previous session metadata for continuity
# This script runs automatically when a Claude Code session starts

set +e

cwd="$CLAUDE_PROJECT_DIR"

# Only proceed if we have a working directory
if [ -z "$cwd" ] || [ ! -d "$cwd" ]; then
  exit 0
fi

metadata_file="$cwd/.claude/session-metadata.jsonl"

# Check if metadata file exists
if [ ! -f "$metadata_file" ]; then
  echo "📋 First session - no previous session data"
  exit 0
fi

# Get the last session entry
last_entry=$(tail -1 "$metadata_file" 2>/dev/null)

if [ -z "$last_entry" ]; then
  echo "📋 No previous session data found"
  exit 0
fi

# Check if jq is available for pretty printing
if command -v jq >/dev/null 2>&1; then
  echo "📋 Previous session summary:"
  echo "$last_entry" | jq -r '
    "  Ended: \(.timestamp // "unknown")",
    "  Reason: \(.reason // "unknown")",
    "  Files changed: \((.files_changed // []) | length)",
    "  Recent commits: \((.recent_commits // []) | length)"
  ' 2>/dev/null || echo "  (Could not parse session data)"
else
  echo "📋 Previous session: $last_entry"
fi

exit 0
