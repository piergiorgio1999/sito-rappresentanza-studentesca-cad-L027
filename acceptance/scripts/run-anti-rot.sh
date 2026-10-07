#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/tools/lib" "$WORK/tools/agent-config-check" \
    "$WORK/config/template/comment-locales" "$WORK/.template/index" "$WORK/acceptance"
cp "$ROOT/AGENTS.md" "$ROOT/CLAUDE.md" "$ROOT/DECISIONS.md" "$ROOT/TEMPLATE_VERSION" "$WORK/"
cp "$ROOT/SPEC-V1.md" "$WORK/"
cp "$ROOT/.template/template-manifest.json" "$WORK/.template/"
cp "$ROOT/.template/index/files.txt" "$WORK/.template/index/"
cp "$ROOT/acceptance/VERIFICATION.md" "$WORK/acceptance/"
cp "$ROOT/scope-map.json" "$WORK/scope-map.json"
cp "$ROOT/config/template/version.json" "$WORK/config/template/version.json"
cp "$ROOT/config/template/comment-locales/"*.json \
    "$WORK/config/template/comment-locales/"
cp "$ROOT/tools/lib/common.sh" "$WORK/tools/lib/common.sh"
cp "$ROOT/tools/agent-config-check/agent-config-check" "$WORK/tools/agent-config-check/agent-config-check"

(cd "$WORK" && ./tools/agent-config-check/agent-config-check)

cp "$WORK/scope-map.json" "$WORK/scope-map.invalid.json"
printf '%s\n' '{ invalid json' > "$WORK/scope-map.json"
if (cd "$WORK" && ./tools/agent-config-check/agent-config-check) >/dev/null 2>&1; then
    echo 'FAIL ACC-17: invalid scope-map was accepted'
    exit 1
fi
mv "$WORK/scope-map.invalid.json" "$WORK/scope-map.json"

rm "$WORK/DECISIONS.md"
if (cd "$WORK" && ./tools/agent-config-check/agent-config-check) >/dev/null 2>&1; then
    echo 'FAIL ACC-17: missing DECISIONS.md was accepted'
    exit 1
fi

echo 'PASS ACC-17: anti-rot checks reject invalid scope-map and missing DECISIONS.md'
