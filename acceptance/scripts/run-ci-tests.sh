#!/usr/bin/env bash
set -Eeuo pipefail

cat <<'EOF'
CI-only acceptance cases: ACC-01 ACC-02 ACC-12 ACC-13 ACC-14 ACC-15 ACC-16 ACC-19 ACC-21 ACC-22 ACC-23

Run each case on a disposable branch or repository derived from origin/main.
Do not simulate GitHub results locally. Record the workflow run URL, commit,
expected result, actual result, and cleanup action in acceptance/VERIFICATION.md.

ACC-23: push a controlled .github/labels.yml change to main and verify the
label-sync workflow updates canonical labels while retaining an extra label.
EOF
