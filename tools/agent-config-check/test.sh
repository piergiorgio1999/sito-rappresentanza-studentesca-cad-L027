#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git clone -q --no-hardlinks "$ROOT" "$WORK"
cp "$ROOT/tools/agent-config-check/agent-config-check" "$WORK/tools/agent-config-check/agent-config-check"

index="$WORK/.template/index/files.txt"
grep -v '^\./AGENTS.md$' "$index" > "$index.tmp"
mv "$index.tmp" "$index"
printf '%s\n' './not-tracked.txt' >> "$index"

if output="$(cd "$WORK" && ./tools/agent-config-check/agent-config-check 2>&1)"; then
    echo 'expected stale index failure' >&2
    exit 1
fi

grep -Fq 'agent-config-check: MISSING_FROM_INDEX AGENTS.md' <<<"$output"
grep -Fq 'agent-config-check: EXTRA_IN_INDEX not-tracked.txt' <<<"$output"
grep -Fq 'agent-config-check: ACTION regenerate .template/index/files.txt from tracked template files' <<<"$output"

echo 'agent-config-check diagnostics: PASS'
