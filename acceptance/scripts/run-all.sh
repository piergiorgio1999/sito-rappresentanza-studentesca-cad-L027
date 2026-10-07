#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "Acceptance Suite"
echo "Registered cases: $(find acceptance/cases -name 'ACC-*.md' | wc -l | tr -d ' ')"

echo
echo "Executable local cases"
acceptance/scripts/run-scope-guard.sh
acceptance/scripts/run-anti-rot.sh
acceptance/scripts/run-digest.sh

echo
echo "PASS: local acceptance cases completed"
echo "NOT RUN: ACC-01, ACC-02, ACC-12, ACC-13, ACC-14, ACC-15, ACC-16, ACC-19, ACC-20, ACC-21, ACC-22, ACC-23 require disposable repositories, controlled workflow runs, or capability-specific GitHub evidence."
echo "NOT RUN: ACC-24, ACC-25, ACC-26, ACC-27, ACC-28, ACC-29 await V1.2 implementation and evidence."
