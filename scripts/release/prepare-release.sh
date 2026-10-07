#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

usage() {
    echo "Usage: $0 VERSION" >&2
    echo "Example: $0 1.1.0" >&2
}

if [[ "$#" -ne 1 || ! "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    usage
    exit 2
fi

VERSION="$1"
BASE_REF="${BASE_REF:-main}"
REPOSITORY="${REPOSITORY:-}"
status=0

pass() {
    echo "✅ $1"
}

fail() {
    echo "❌ $1"
    status=1
}

check_command() {
    local command="$1"
    if command -v "$command" >/dev/null 2>&1; then
        pass "$command available"
    else
        fail "$command missing"
    fi
}

check_command jq
check_command gh
check_command git

if [[ "$status" -eq 0 ]]; then
    if [[ -z "$REPOSITORY" ]]; then
        if ! REPOSITORY="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"; then
            fail "cannot determine GitHub repository"
        fi
    fi
    if [[ -n "$REPOSITORY" ]]; then
        pass "repository resolved: $REPOSITORY"
    fi
fi

if [[ -n "$REPOSITORY" ]]; then
    if gh auth status >/dev/null 2>&1; then
        pass "gh authenticated"
    else
        fail "gh is not authenticated"
    fi
fi

if [[ -f TEMPLATE_VERSION ]]; then
    template_version="$(tr -d '[:space:]' < TEMPLATE_VERSION)"
    if [[ "$template_version" == "$VERSION" ]]; then
        pass "TEMPLATE_VERSION is $VERSION"
    else
        fail "TEMPLATE_VERSION is $template_version; expected $VERSION"
    fi
else
    fail "TEMPLATE_VERSION missing"
fi

if [[ -f config/template/version.json ]]; then
    if jq -e --arg version "$VERSION" \
        '.templateVersion == $version' config/template/version.json >/dev/null 2>&1; then
        pass "config/template/version.json is $VERSION"
    else
        fail "config/template/version.json does not declare $VERSION"
    fi
else
    fail "config/template/version.json missing"
fi

if [[ -f .template/template-manifest.json ]]; then
    if jq -e --arg version "$VERSION" \
        '.version == $version' .template/template-manifest.json >/dev/null 2>&1; then
        pass ".template/template-manifest.json is $VERSION"
    else
        fail ".template/template-manifest.json does not declare $VERSION"
    fi
else
    fail ".template/template-manifest.json missing"
fi

acceptance_status=0
while IFS= read -r case_file; do
    case_status="$(sed -n 's/^Status:[[:space:]]*//p' "$case_file")"
    if [[ "$case_status" == "PASS" ]]; then
        continue
    fi
    echo "  $case_file: ${case_status:-missing status}" >&2
    acceptance_status=1
done < <(git ls-files 'acceptance/cases/ACC-*.md' | LC_ALL=C sort)

if [[ "$acceptance_status" -eq 0 ]]; then
    pass "all acceptance cases are PASS"
else
    fail "acceptance contains non-PASS cases"
fi

if grep -Eq '^\| ACC-[0-9]{2} \|.*\| (TODO|NOT RUN|DEFERRED) \|' acceptance/VERIFICATION.md; then
    fail "acceptance/VERIFICATION.md contains deferred cases"
else
    pass "acceptance/VERIFICATION.md has no deferred cases"
fi

if [[ -x tools/validate/validate.sh ]]; then
    if tools/validate/validate.sh; then
        pass "template preflight passed"
    else
        fail "template preflight failed"
    fi
else
    fail "template preflight missing"
fi

if git diff --quiet && git diff --cached --quiet; then
    pass "working tree is clean"
else
    fail "working tree is not clean"
fi

if [[ -n "$REPOSITORY" ]] && gh auth status >/dev/null 2>&1; then
    if run_json="$(gh run list --repo "$REPOSITORY" --workflow ci.yml \
        --branch "$BASE_REF" --limit 1 --json status,conclusion,headSha,url)"; then
        if jq -e 'length == 1 and .[0].status == "completed" and .[0].conclusion == "success"' \
            >/dev/null 2>&1 <<< "$run_json"; then
            pass "latest CI run on $BASE_REF succeeded"
        else
            jq -r 'if length == 0 then "  no CI run found" else .[0] | "  status=" + (.status // "unknown") + " conclusion=" + (.conclusion // "unknown") + " url=" + (.url // "unknown") end' \
                >&2 <<< "$run_json"
            fail "latest CI run on $BASE_REF is not successful"
        fi
    else
        fail "cannot query CI runs"
    fi
else
    fail "cannot verify CI without authenticated gh"
fi

echo
if [[ "$status" -eq 0 ]]; then
    pass "release $VERSION is ready"
else
    fail "release $VERSION is not ready"
fi

exit "$status"
