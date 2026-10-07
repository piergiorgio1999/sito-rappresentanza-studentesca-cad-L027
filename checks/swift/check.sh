#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ! -f Package.swift ]]; then
    echo "no Package.swift found, skipping"
    exit 0
fi

if ! swift_output="$(swift test 2>&1)"; then
    printf '%s\n' 'severity: error' 'invariant: Swift tests pass' 'reason: Swift test execution failed' "evidence: $swift_output" 'remediation: fix the reported Swift test failures' >&2
    exit 1
fi

if command -v swiftlint >/dev/null 2>&1; then
    if ! swiftlint_output="$(swiftlint 2>&1)"; then
        printf '%s\n' 'severity: error' 'invariant: SwiftLint reports no violations' 'reason: SwiftLint found violations' "evidence: $swiftlint_output" 'remediation: fix the reported SwiftLint violations' >&2
        exit 1
    fi
fi
