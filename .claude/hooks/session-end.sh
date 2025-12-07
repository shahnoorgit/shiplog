#!/bin/bash
# Session End Hook - Captures metadata for cross-session continuity
# This script runs automatically when a Claude Code session ends

# Don't fail on errors - we want this to be non-blocking
set +e

# Check required tools - exit silently if missing
command -v jq >/dev/null 2>&1 || exit 0

# Read hook input from stdin
input=$(cat)

# Extract session data
transcript_path=$(echo "$input" | jq -r '.transcript_path // ""')
cwd=$(echo "$input" | jq -r '.cwd // ""')
reason=$(echo "$input" | jq -r '.reason // "unknown"')

# Only proceed if we have a working directory
if [ -z "$cwd" ] || [ ! -d "$cwd" ]; then
  exit 0
fi

cd "$cwd" || exit 0

# Create metadata directory if needed
mkdir -p .claude

# Get git info (empty arrays if git not available or not a repo)
if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
  files_changed=$(git diff --name-only 2>/dev/null | head -10 | jq -R -s -c 'split("\n") | map(select(length > 0))')
  recent_commits=$(git log --oneline -5 2>/dev/null | jq -R -s -c 'split("\n") | map(select(length > 0))')
else
  files_changed="[]"
  recent_commits="[]"
fi

# Build and append single-line JSON (proper JSONL format)
jq -n -c \
  --arg ts "$(date -Iseconds)" \
  --arg r "$reason" \
  --arg tp "$transcript_path" \
  --argjson fc "${files_changed:-[]}" \
  --argjson rc "${recent_commits:-[]}" \
  '{timestamp: $ts, reason: $r, files_changed: $fc, recent_commits: $rc, transcript: $tp}' \
  >> .claude/session-metadata.jsonl

exit 0
