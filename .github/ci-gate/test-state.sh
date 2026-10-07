#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
checker="$ROOT/.github/ci-gate/check-state"

expect_pass() {
    CI_GATE_NEEDS_JSON="$1" CI_GATE_APPLICABILITY_JSON="$2" "$checker" >/dev/null
}

expect_fail() {
    if CI_GATE_NEEDS_JSON="$1" CI_GATE_APPLICABILITY_JSON="$2" "$checker" >/dev/null 2>&1; then
        echo "expected CI Gate state failure" >&2
        exit 1
    fi
}

applicable='{"checker":true}'
not_applicable='{"checker":false}'

expect_pass '{"checker":{"result":"success"}}' "$applicable"
expect_pass '{"checker":{"result":"skipped"}}' "$not_applicable"
expect_fail '{"checker":{"result":"skipped"}}' "$applicable"
expect_fail '{"checker":{"result":"success"}}' "$not_applicable"
expect_fail '{"checker":{"result":"failure"}}' "$applicable"
expect_fail '{"checker":{"result":"cancelled"}}' "$applicable"
expect_fail '{"checker":{}}' "$applicable"
expect_fail '{}' "$applicable"
expect_fail '{"checker":{"result":"unknown"}}' "$applicable"

echo "CI Gate state matrix: PASS"
