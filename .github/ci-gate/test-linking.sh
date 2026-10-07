#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
checker="$ROOT/.github/ci-gate/check-linking"

expect_pass() {
    PR_AUTHOR_LOGIN="$1" PR_CLOSING_REFERENCES_JSON="$2" PR_BODY="${3:-}" "$checker" >/dev/null
}

expect_fail() {
    local output
    if output="$(PR_AUTHOR_LOGIN="$1" PR_CLOSING_REFERENCES_JSON="$2" PR_BODY="${3:-}" "$checker" 2>&1)"; then
        echo "expected linking failure" >&2
        exit 1
    fi
    printf '%s\n' "$output"
}

expect_pass 'human' '[{"number":103}]' 'Fixes #103'
output="$(expect_fail 'human' '[]' 'Fixes #103')"
grep -Fq 'declared in PR body: #103' <<<"$output"
grep -Fq 'recognized by GitHub: none' <<<"$output"
grep -Fq 'ACTION use a standalone canonical closing clause, for example: Fixes #103' <<<"$output"
output="$(expect_fail 'human' '[{"number":103},{"number":104}]' $'Fixes #103\nFixes #104')"
grep -Fq 'recognized by GitHub: #103,#104' <<<"$output"
expect_pass 'dependabot[bot]' '[]' ''
output="$(expect_fail 'renovate[bot]' '[]' '')"
grep -Fq 'ACTION add exactly one standalone canonical closing clause: Fixes #ISSUE' <<<"$output"

echo "linking matrix: PASS"
