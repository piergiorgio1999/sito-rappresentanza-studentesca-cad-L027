#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ! -f Cargo.toml ]]; then
    echo "no Cargo.toml found, skipping"
    exit 0
fi

if ! command -v cargo >/dev/null 2>&1; then
    echo "cargo not installed, skipping"
    exit 0
fi

if ! clippy_output="$(cargo clippy --all-targets --all-features -- -D warnings 2>&1)"; then
    printf '%s\n' 'severity: error' 'invariant: Clippy passes with warnings denied' 'reason: Clippy reported diagnostics' "evidence: $clippy_output" 'remediation: fix the reported Rust diagnostics' >&2
    exit 1
fi
