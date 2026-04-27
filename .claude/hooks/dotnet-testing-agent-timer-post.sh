#!/usr/bin/env bash
# dotnet-testing-agent-timer-post.sh
#
# PostToolUse hook for dotnet-testing orchestrator workflows.
# Reads the start time recorded by the PreToolUse hook, calculates
# elapsed duration, and injects the result into Claude's context
# via additionalContext.
#
# Triggered by: PostToolUse (matcher: "Agent")
# Input: JSON on stdin (tool_use_id, tool_input.subagent_type, ...)
# Output: JSON to stdout with additionalContext (or silent exit 0)
#
# Scope: matcher 設為 "Agent" 會攔截所有 Agent tool 呼叫，但腳本內部
#   只處理 subagent_type 以 "dotnet-testing-" 開頭的呼叫（如
#   dotnet-testing-orchestrator、dotnet-testing-analyzer 等），
#   其餘 agent 呼叫會直接 exit 0，不產生任何輸出或副作用。
#   這是因為 Claude Code hooks matcher 目前僅支援 tool name 層級過濾，
#   無法在 matcher 層級區分 subagent_type。
#
# Dependencies: node (preferred) or python3/python for JSON parsing

set -euo pipefail

# Read the full JSON payload from stdin
input=$(cat)

# --- JSON field extractor (portable: jq > node > python) ---
extract_json_field() {
  local json="$1"
  local field="$2"

  if command -v jq &>/dev/null; then
    echo "$json" | jq -r "$field // empty"
  elif command -v node &>/dev/null; then
    node -e "
      const d = JSON.parse(require('fs').readFileSync(0,'utf8'));
      const v = '$field'.replace(/^\./, '').split('.').reduce((o,k) => o?.[k], d);
      if (v != null) process.stdout.write(String(v));
    " <<< "$json"
  elif command -v python3 &>/dev/null; then
    python3 -c "
import sys, json, functools
d = json.loads(sys.stdin.read())
keys = '$field'.lstrip('.').split('.')
v = functools.reduce(lambda o, k: o.get(k) if isinstance(o, dict) else None, keys, d)
if v is not None: print(v, end='')
" <<< "$json"
  elif command -v python &>/dev/null; then
    python -c "
import sys, json, functools
d = json.loads(sys.stdin.read())
keys = '$field'.lstrip('.').split('.')
v = functools.reduce(lambda o, k: o.get(k) if isinstance(o, dict) else None, keys, d)
if v is not None: print(v, end='')
" <<< "$json"
  else
    return 1
  fi
}

# Extract subagent_type — exit silently if not a dotnet-testing agent
subagent_type=$(extract_json_field "$input" ".tool_input.subagent_type")
if [[ -z "$subagent_type" || "$subagent_type" != dotnet-testing-* ]]; then
  exit 0
fi

# Extract tool_use_id for correlation with PreToolUse
tool_use_id=$(extract_json_field "$input" ".tool_use_id")
if [[ -z "$tool_use_id" ]]; then
  exit 0
fi

# Read start time from temp file
timer_dir="/tmp/dotnet-testing-agent-timers"
timer_file="${timer_dir}/${tool_use_id}"

if [[ ! -f "$timer_file" ]]; then
  # No matching PreToolUse record — report completion time only
  end_display=$(date "+%H:%M:%S")
  cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"⏱ ${subagent_type} 完成：${end_display}（無法計算耗時，未找到開始紀錄）"}}
EOF
  exit 0
fi

# Parse stored data: epoch|display|subagent_type|description
IFS='|' read -r start_epoch start_display stored_type description < "$timer_file"

# Calculate elapsed time
end_epoch=$(date +%s)
end_display=$(date "+%H:%M:%S")
elapsed_seconds=$((end_epoch - start_epoch))
elapsed_min=$((elapsed_seconds / 60))
elapsed_sec=$((elapsed_seconds % 60))

# Format elapsed as "M 分 S 秒"
if [[ $elapsed_min -gt 0 ]]; then
  elapsed_formatted="${elapsed_min} 分 ${elapsed_sec} 秒"
else
  elapsed_formatted="${elapsed_sec} 秒"
fi

# Clean up temp file
rm -f "$timer_file"

# Inject context back to Claude
cat <<EOF
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"⏱ ${subagent_type} 完成：${end_display}（開始：${start_display}，耗時 ${elapsed_formatted}）"}}
EOF
