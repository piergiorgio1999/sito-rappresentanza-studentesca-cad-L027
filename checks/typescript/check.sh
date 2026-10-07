#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ! -f package.json ]]; then
    echo "no package.json found, skipping"
    exit 0
fi

if [[ -f tsconfig.json ]]; then
    if ! tsc_output="$(${TSC_BIN:-tsc} --noEmit 2>&1)"; then
        printf '%s\n' 'severity: error' 'invariant: TypeScript compilation passes' 'reason: TypeScript compiler reported diagnostics' "evidence: $tsc_output" 'remediation: fix the reported TypeScript errors' >&2
        exit 1
    fi
fi

if [[ -f .eslintrc.json || -f .eslintrc.js || -f eslint.config.js || -f eslint.config.mjs ]]; then
    if ! eslint_output="$(npx --yes eslint . 2>&1)"; then
        printf '%s\n' 'severity: error' 'invariant: ESLint reports no violations' 'reason: ESLint found violations' "evidence: $eslint_output" 'remediation: fix the reported lint violations' >&2
        exit 1
    fi
fi
