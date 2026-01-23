#!/bin/bash
# ralph.sh - Run Ralph in AFK (autonomous) mode with streaming output
# Usage: ./ralph.sh [iterations]
# Default: 10 iterations

set -e

ITERATIONS=${1:-10}
PROMPT_FILE="PROMPT.md"
TEMP_OUTPUT="/tmp/ralph_output_$$.txt"

# Cleanup on exit
trap "rm -f $TEMP_OUTPUT" EXIT

# Check required files exist
if [ ! -f "$PROMPT_FILE" ]; then
  echo "❌ Missing $PROMPT_FILE - create it first"
  exit 1
fi

if [ ! -f "prd.json" ]; then
  echo "❌ Missing prd.json - create your PRD first"
  exit 1
fi

# Create progress.txt if it doesn't exist
if [ ! -f "progress.txt" ]; then
  echo "# Ralph Progress Log" > progress.txt
  echo "Created: $(date -Iseconds)" >> progress.txt
  echo "" >> progress.txt
fi

echo "🚀 Starting Ralph with $ITERATIONS max iterations"
echo "   Prompt: $PROMPT_FILE"
echo "   PRD: prd.json"
echo ""

for ((i=1; i<=$ITERATIONS; i++)); do
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📍 Iteration $i of $ITERATIONS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  # Use script to preserve TTY while capturing output
  script -q "$TEMP_OUTPUT" claude --dangerously-skip-permissions -p "$(cat $PROMPT_FILE)" || true
  
  # Read the captured output to check for completion signals
  result=$(cat "$TEMP_OUTPUT")
  
  # Check for completion
  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo ""
    echo "✅ All PRD items complete!"
    echo "   Total iterations: $i"
    exit 0
  fi
  
  # Check for blocked state
  if [[ "$result" == *"<promise>BLOCKED</promise>"* ]]; then
    echo ""
    echo "🛑 Ralph is blocked. Check progress.txt for details."
    exit 1
  fi
  
  echo ""
  echo "⏳ Iteration $i complete. Starting next..."
  echo ""
done

echo "⚠️  Max iterations ($ITERATIONS) reached. PRD may not be complete."
echo "   Run again or check progress.txt for status."
exit 0


# #!/bin/bash
# # ralph.sh - Run Ralph in AFK (autonomous) mode with streaming output
# # Usage: ./ralph.sh [iterations]
# # Default: 10 iterations

# set -e

# ITERATIONS=${1:-10}
# PROMPT_FILE="PROMPT.md"
# TEMP_OUTPUT="/tmp/ralph_output_$$.txt"

# # Cleanup on exit
# trap "rm -f $TEMP_OUTPUT" EXIT

# # Check required files exist
# if [ ! -f "$PROMPT_FILE" ]; then
#   echo "❌ Missing $PROMPT_FILE - create it first"
#   exit 1
# fi

# if [ ! -f "prd.json" ]; then
#   echo "❌ Missing prd.json - create your PRD first"
#   exit 1
# fi

# # Create progress.txt if it doesn't exist
# if [ ! -f "progress.txt" ]; then
#   echo "# Ralph Progress Log" > progress.txt
#   echo "Created: $(date -Iseconds)" >> progress.txt
#   echo "" >> progress.txt
# fi

# echo "🚀 Starting Ralph with $ITERATIONS max iterations"
# echo "   Prompt: $PROMPT_FILE"
# echo "   PRD: prd.json"
# echo ""

# for ((i=1; i<=$ITERATIONS; i++)); do
#   echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
#   echo "📍 Iteration $i of $ITERATIONS"
#   echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
#   echo ""
  
#   # Run Claude and stream output while also capturing it
#   # Using tee to both display AND save to file
#   # --dangerously-skip-permissions: allows file writes without prompts
#   # Remove this flag if you want to approve each action manually
#   claude --verbose --dangerously-skip-permissions -p "$(cat $PROMPT_FILE)" 2>&1 | tee "$TEMP_OUTPUT" || true
  
#   # Read the captured output to check for completion signals
#   result=$(cat "$TEMP_OUTPUT")
  
#   # Check for completion
#   if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
#     echo ""
#     echo "✅ All PRD items complete!"
#     echo "   Total iterations: $i"
#     exit 0
#   fi
  
#   # Check for blocked state
#   if [[ "$result" == *"<promise>BLOCKED</promise>"* ]]; then
#     echo ""
#     echo "🛑 Ralph is blocked. Check progress.txt for details."
#     exit 1
#   fi
  
#   echo ""
#   echo "⏳ Iteration $i complete. Starting next..."
#   echo ""
# done

# echo "⚠️  Max iterations ($ITERATIONS) reached. PRD may not be complete."
# echo "   Run again or check progress.txt for status."
# exit 0