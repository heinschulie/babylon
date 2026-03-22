#!/bin/bash
# ralph-gh.sh - Run Ralph in AFK mode against GitHub issues
# Usage: ./ralph-gh.sh [--codex] [iterations]
# Default: 10 iterations, claude engine

set -e

# Parse flags
ENGINE="claude"
ITERATIONS=""

for arg in "$@"; do
  case "$arg" in
    --codex) ENGINE="codex" ;;
    *) ITERATIONS="$arg" ;;
  esac
done

ITERATIONS=${ITERATIONS:-10}
PROMPT_FILE="prompt-gh.md"
TEMP_OUTPUT="/tmp/ralph_gh_output_$$.txt"

# Cleanup on exit
trap "rm -f $TEMP_OUTPUT" EXIT

# Check required files exist
if [ ! -f "$PROMPT_FILE" ]; then
  echo "Missing $PROMPT_FILE - create it first"
  exit 1
fi

# Verify gh CLI is available
if ! command -v gh &> /dev/null; then
  echo "gh CLI not found - install it first"
  exit 1
fi

# Verify chosen engine is available
if ! command -v "$ENGINE" &> /dev/null; then
  echo "$ENGINE CLI not found - install it first"
  exit 1
fi

echo "Starting Ralph (GH Issues) with $ITERATIONS max iterations"
echo "   Prompt: $PROMPT_FILE"
echo "   Engine: $ENGINE"
echo "   Source: GitHub Issues"
echo ""

for ((i=1; i<=$ITERATIONS; i++)); do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Iteration $i of $ITERATIONS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  PROMPT_CONTENT="$(cat $PROMPT_FILE)"

  if [ "$ENGINE" = "claude" ]; then
    script -q "$TEMP_OUTPUT" claude --dangerously-skip-permissions -p "$PROMPT_CONTENT" || true
  else
    script -q "$TEMP_OUTPUT" codex exec --dangerously-bypass-approvals-and-sandbox "$PROMPT_CONTENT" || true
  fi

  # Strip ANSI escape sequences for reliable matching
  sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' "$TEMP_OUTPUT" > "${TEMP_OUTPUT}.clean"

  # Check for blocked state FIRST (takes priority over complete)
  if grep -q '<promise>BLOCKED</promise>' "${TEMP_OUTPUT}.clean"; then
    echo ""
    echo "Ralph is blocked. Check the issue comments for details."
    rm -f "${TEMP_OUTPUT}.clean"
    exit 1
  fi

  # Check for completion
  if grep -q '<promise>COMPLETE</promise>' "${TEMP_OUTPUT}.clean"; then
    echo ""
    echo "All open issues resolved!"
    echo "   Total iterations: $i"
    rm -f "${TEMP_OUTPUT}.clean"
    exit 0
  fi

  rm -f "${TEMP_OUTPUT}.clean"

  echo ""
  echo "Iteration $i complete. Starting next..."
  echo ""
done

echo "Max iterations ($ITERATIONS) reached. Issues may remain open."
echo "   Run again or check GitHub issues for status."
exit 0