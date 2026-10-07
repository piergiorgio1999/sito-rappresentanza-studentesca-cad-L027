#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

status=0

pass() {
    echo "✅ $1"
}

fail() {
    echo "❌ $1"
    status=1
}

run_check() {
    local description="$1"
    shift
    if "$@"; then
        pass "$description"
    else
        fail "$description"
    fi
}

# Invoked by run_check.
# shellcheck disable=SC2317,SC2329
validate_json() {
    jq empty "$1" >/dev/null 2>&1
}

validate_index() {
    git ls-files | sed 's#^#./#' | LC_ALL=C sort > "$work_dir/expected-files.txt"
    cmp -s .template/index/files.txt "$work_dir/expected-files.txt"
}

# Invoked by run_check.
# shellcheck disable=SC2317,SC2329
validate_scope_coverage() {
    local file name pattern scope

    jq -r '.scopes[] | .name as $name | .paths[] | [$name, .] | @tsv' \
        scope-map.json > "$work_dir/scope-rules.tsv"
    : > "$work_dir/unclassified-files.txt"

    while IFS= read -r file; do
        scope=""
        while IFS=$'\t' read -r name pattern; do
            # Match paths exactly as scope-guard does; rule order is authoritative.
            # shellcheck disable=SC2053
            if [[ "$file" == $pattern ]]; then
                scope="$name"
                break
            fi
        done < "$work_dir/scope-rules.tsv"

        if [[ -z "$scope" ]]; then
            printf '%s\n' "$file" >> "$work_dir/unclassified-files.txt"
        fi
    done < <(git ls-files)

    if [[ -s "$work_dir/unclassified-files.txt" ]]; then
        sed 's/^/  unclassified: /' "$work_dir/unclassified-files.txt" >&2
        return 1
    fi
}

echo "Template preflight"

required=(
git
gh
jq
shellcheck
actionlint
copier
)

for tool in "${required[@]}"; do
    if command -v "$tool" >/dev/null 2>&1; then
        pass "$tool available"
    else
        fail "$tool missing"
    fi
done

echo
echo "Repository checks"

required_files=(
    copier.yml
    AGENTS.md
    README.md
    scope-map.json
    .template/template-manifest.json
    .template/index/files.txt
    config/template/version.json
)

for file in "${required_files[@]}"; do
    if [[ -f "$file" ]]; then
        pass "$file exists"
    else
        fail "$file missing"
    fi
done

if command -v jq >/dev/null 2>&1; then
    run_check "scope-map.json is valid JSON" validate_json scope-map.json
    run_check ".template/template-manifest.json is valid JSON" \
        validate_json .template/template-manifest.json
    run_check "config/template/version.json is valid JSON" \
        validate_json config/template/version.json

    if [[ -f scope-map.json ]] && command -v git >/dev/null 2>&1; then
        run_check "all tracked files are classified" validate_scope_coverage
    fi
fi

if command -v git >/dev/null 2>&1 && [[ -f .template/index/files.txt ]]; then
    if validate_index; then
        pass ".template/index/files.txt matches tracked files"
    else
        fail ".template/index/files.txt is stale"
        diff -u .template/index/files.txt "$work_dir/expected-files.txt" || true
    fi
fi

if [[ -x tools/agent-config-check/agent-config-check ]] && command -v jq >/dev/null 2>&1; then
    run_check "agent configuration is consistent" \
        tools/agent-config-check/agent-config-check
fi

if [[ -x checks/shell/check.sh ]] && command -v shellcheck >/dev/null 2>&1; then
    run_check "ShellCheck passes" checks/shell/check.sh
fi

if command -v actionlint >/dev/null 2>&1; then
    run_check "actionlint passes" actionlint
fi

echo
if [[ "$status" -eq 0 ]]; then
    pass "preflight passed"
else
    fail "preflight failed"
fi

exit "$status"
