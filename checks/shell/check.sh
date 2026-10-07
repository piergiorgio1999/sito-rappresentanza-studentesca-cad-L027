#!/usr/bin/env bash
set -Eeuo pipefail

if ! command -v shellcheck >/dev/null 2>&1; then
    echo "shellcheck not installed, skipping"
    exit 0
fi

files=""
while IFS= read -r f; do
    files="$files
$f"
done < <(find . -type f -name "*.sh" -not -path "./.git/*")
files="$(echo "$files" | sed '/^$/d')"

if [[ -z "$files" ]]; then
    echo "no shell scripts found"
    exit 0
fi

if ! shellcheck_output="$(echo "$files" | xargs shellcheck 2>&1)"; then
    printf '%s\n' 'severity: error' 'invariant: ShellCheck passes' 'reason: ShellCheck reported diagnostics' "evidence: $shellcheck_output" 'remediation: fix the reported shell diagnostics' >&2
    exit 1
fi
