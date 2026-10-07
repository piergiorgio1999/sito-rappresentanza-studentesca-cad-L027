#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ! -f pyproject.toml && ! -f setup.py && ! -f requirements.txt ]]; then
    echo "no python manifest found, skipping"
    exit 0
fi

if ! command -v ruff >/dev/null 2>&1; then
    echo "ruff not installed, skipping"
    exit 0
fi

if ! ruff_output="$(ruff check . 2>&1)"; then
    printf '%s\n' 'severity: error' 'invariant: Ruff reports no Python violations' 'reason: Ruff found violations' "evidence: $ruff_output" 'remediation: apply Ruff fixes or correct the reported code' >&2
    exit 1
fi
