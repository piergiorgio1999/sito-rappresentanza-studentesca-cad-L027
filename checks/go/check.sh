#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ! -f go.mod ]]; then
    echo "no go.mod found, skipping"
    exit 0
fi

if ! vet_output="$(go vet ./... 2>&1)"; then
    printf '%s\n' 'severity: error' 'invariant: go vet passes' 'reason: go vet reported diagnostics' "evidence: $vet_output" 'remediation: fix the reported Go diagnostics' >&2
    exit 1
fi

unformatted="$(gofmt -l .)"
if [[ -n "$unformatted" ]]; then
    printf '%s\n' 'severity: error' 'invariant: Go files are gofmt formatted' 'reason: gofmt reported unformatted files' "evidence: $unformatted" 'remediation: run gofmt on the listed files' >&2
    exit 1
fi
