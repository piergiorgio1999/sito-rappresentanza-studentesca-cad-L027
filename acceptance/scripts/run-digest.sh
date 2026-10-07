#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
"$ROOT/tools/project-status/test.sh"

output="$(mktemp)"
trap 'rm -f "$output"' EXIT
"$ROOT/tools/project-status/project-status" json --repo piergiorgio1999/agent-template > "$output"
jq -e 'type == "object" and has("progress") and has("next") and has("blocked") and has("attention")' "$output" >/dev/null

text="$("$ROOT"/tools/project-status/project-status md --repo piergiorgio1999/agent-template)"
bytes="$(printf '%s' "$text" | wc -c | tr -d ' ')"
lines="$(printf '%s\n' "$text" | wc -l | tr -d ' ')"
(( bytes <= 8192 ))
(( lines <= 100 ))
echo "PASS ACC-18: real digest verified (${bytes} bytes, ${lines} lines)"
