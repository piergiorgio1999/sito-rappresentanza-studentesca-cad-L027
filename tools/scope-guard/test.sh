#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCOPE_GUARD="$SCRIPT_DIR/scope-guard"

pass=0
fail=0

last_output=""
assert_exit() {
    local desc="$1" expected="$2"
    shift 2
    local actual=0
    "$@" >/tmp/scope-guard-test-out.$$ 2>&1 || actual=$?
    last_output="$(cat /tmp/scope-guard-test-out.$$)"
    if [[ "$actual" -eq "$expected" ]]; then
        echo "ok - $desc"
        pass=$((pass + 1))
    else
        echo "FAIL - $desc (expected exit $expected, got $actual)"
        cat /tmp/scope-guard-test-out.$$
        fail=$((fail + 1))
    fi
    rm -f /tmp/scope-guard-test-out.$$
}

make_repo() {
    local dir
    dir="$(mktemp -d)"
    git -C "$dir" init -q -b main
    git -C "$dir" config user.email "test@example.com"
    git -C "$dir" config user.name "test"
    cp "$SCRIPT_DIR/../../scope-map.json" "$dir/scope-map.json"
    mkdir -p "$dir/tools/lib" "$dir/tools/scope-guard"
    cp "$SCRIPT_DIR/../lib/common.sh" "$dir/tools/lib/common.sh"
    cp "$SCOPE_GUARD" "$dir/tools/scope-guard/scope-guard"
    printf '# Architectural Decisions\n\n## entry one\n\nfirst decision.\n' > "$dir/DECISIONS.md"
    git -C "$dir" add -A
    git -C "$dir" commit -q -m base
    git -C "$dir" checkout -q -b feature
    echo "$dir"
}

run_guard() {
    local dir="$1"
    (cd "$dir" && ./tools/scope-guard/scope-guard main)
}

run_guard_with_exception() {
    local dir="$1"
    (cd "$dir" && SCOPE_EXCEPTION_LABELS="scope:exception" ./tools/scope-guard/scope-guard main)
}

run_guard_with_event() {
    local dir="$1" event="$2" fake_bin="${3:-}"
    (cd "$dir" && GITHUB_EVENT_PATH="$event" SCOPE_GUARD_PR_NUMBER="${SCOPE_GUARD_PR_NUMBER:-}" GH_TOKEN="${GH_TOKEN:-}" PATH="${fake_bin:+$fake_bin:}$PATH" ./tools/scope-guard/scope-guard main)
}

write_generated_index() {
    local dir="$1"
    mkdir -p "$dir/.template/index"
    : > "$dir/.template/index/files.txt"
    git -C "$dir" add .template/index/files.txt
    git -C "$dir" ls-files | grep -v '^\.template-only/' | sed 's|^|./|' | LC_ALL=C sort > "$dir/.template/index/files.txt"
    git -C "$dir" add .template/index/files.txt
}

# Case 1: single functional scope only -> pass
repo="$(make_repo)"
mkdir -p "$repo/tools/scope-guard"
echo "x" > "$repo/tools/scope-guard/thing"
git -C "$repo" add -A
git -C "$repo" commit -q -m "single scope"
assert_exit "single functional scope passes" 0 run_guard "$repo"
rm -rf "$repo"

# Case 8: pull_request event without label -> fail
repo="$(make_repo)"
mkdir -p "$repo/tools/scope-guard" "$repo/checks/python"
echo "x" > "$repo/tools/scope-guard/thing"
echo "y" > "$repo/checks/python/thing"
git -C "$repo" add -A
git -C "$repo" commit -q -m "event without exception"
event="$(mktemp)"
printf '%s\n' '{"pull_request":{"number":123,"labels":[]}}' > "$event"
GITHUB_EVENT_PATH="$event" GH_TOKEN="" assert_exit "pull_request without scope:exception fails" 1 run_guard_with_event "$repo" "$event"
rm -f "$event"
rm -rf "$repo"

# Case 9: pull_request event with label -> pass
repo="$(make_repo)"
mkdir -p "$repo/tools/scope-guard" "$repo/checks/python"
echo "x" > "$repo/tools/scope-guard/thing"
echo "y" > "$repo/checks/python/thing"
git -C "$repo" add -A
git -C "$repo" commit -q -m "event with exception"
event="$(mktemp)"
printf '%s\n' '{"pull_request":{"number":123,"labels":[{"name":"scope:exception"}]}}' > "$event"
GITHUB_EVENT_PATH="$event" GH_TOKEN="" assert_exit "pull_request with scope:exception passes" 0 run_guard_with_event "$repo" "$event"
rm -f "$event"
rm -rf "$repo"

# Case 10: pull_request event uses the explicit PR number for label fallback
repo="$(make_repo)"
mkdir -p "$repo/tools/scope-guard" "$repo/checks/python"
echo "x" > "$repo/tools/scope-guard/thing"
echo "y" > "$repo/checks/python/thing"
git -C "$repo" add -A
git -C "$repo" commit -q -m "event label fallback"
event="$(mktemp)"
fake_bin="$(mktemp -d)"
printf '%s\n' '{"pull_request":{"number":123,"labels":[]}}' > "$event"
printf '%s\n' '#!/usr/bin/env bash' 'printf "%s\n" "scope:exception"' > "$fake_bin/gh"
chmod +x "$fake_bin/gh"
GITHUB_EVENT_PATH="$event" SCOPE_GUARD_PR_NUMBER=123 GH_TOKEN=test assert_exit "explicit PR number drives label fallback" 0 run_guard_with_event "$repo" "$event" "$fake_bin"
rm -rf "$fake_bin" "$repo"

# Case 11: push event has no PR lookup path
repo="$(make_repo)"
mkdir -p "$repo/tools/scope-guard" "$repo/checks/python"
echo "x" > "$repo/tools/scope-guard/thing"
echo "y" > "$repo/checks/python/thing"
git -C "$repo" add -A
git -C "$repo" commit -q -m "push event"
event="$(mktemp)"
fake_bin="$(mktemp -d)"
printf '%s\n' '{"ref":"refs/heads/main"}' > "$event"
printf '%s\n' '#!/usr/bin/env bash' 'exit 99' > "$fake_bin/gh"
chmod +x "$fake_bin/gh"
GITHUB_EVENT_PATH="$event" GH_TOKEN=test assert_exit "push event does not query a PR" 1 run_guard_with_event "$repo" "$event" "$fake_bin"
rm -rf "$fake_bin" "$repo"

# Case 12: template paths are classified before broad documentation patterns
repo="$(make_repo)"
mkdir -p "$repo/.template/contracts" "$repo/template-only"
printf '%s\n' 'contract' > "$repo/.template/contracts/custom-tools.md"
printf '%s\n' 'template' > "$repo/.gitignore"
touch "$repo/template-only/.keep"
git -C "$repo" add -A
git -C "$repo" commit -q -m "template paths"
assert_exit "template paths use the template scope" 0 run_guard "$repo"
rm -rf "$repo"

# Case 2: two functional scopes (no DECISIONS.md) -> fail
repo="$(make_repo)"
mkdir -p "$repo/tools/scope-guard" "$repo/checks/python"
echo "x" > "$repo/tools/scope-guard/thing"
echo "y" > "$repo/checks/python/thing"
git -C "$repo" add -A
git -C "$repo" commit -q -m "two scopes"
assert_exit "two functional scopes fails" 1 run_guard "$repo"
grep -Fq 'ACTION split the PR by scope or link one Issue authorized with scope:exception' <<<"$last_output"
rm -rf "$repo"

# Case 3: two functional scopes with scope:exception -> pass
repo="$(make_repo)"
mkdir -p "$repo/tools/scope-guard" "$repo/checks/python"
echo "x" > "$repo/tools/scope-guard/thing"
echo "y" > "$repo/checks/python/thing"
git -C "$repo" add -A
git -C "$repo" commit -q -m "two scopes with exception"
assert_exit "two functional scopes with scope:exception pass" 0 run_guard_with_exception "$repo"
rm -rf "$repo"

# Case 4: DECISIONS.md alone (no functional scope) -> pass, edits allowed
repo="$(make_repo)"
printf '# Architectural Decisions\n\n## entry one (edited)\n\nchanged.\n' > "$repo/DECISIONS.md"
git -C "$repo" add -A
git -C "$repo" commit -q -m "decisions only, edited"
assert_exit "DECISIONS.md-only edit passes (dedicated PR path)" 0 run_guard "$repo"
rm -rf "$repo"

# Case 5: DECISIONS.md excluded from scope count -> single functional scope + appended decision -> pass
repo="$(make_repo)"
mkdir -p "$repo/tools/scope-guard"
echo "x" > "$repo/tools/scope-guard/thing"
printf '# Architectural Decisions\n\n## entry one\n\nfirst decision.\n\n## entry two\n\nnew decision.\n' > "$repo/DECISIONS.md"
git -C "$repo" add -A
git -C "$repo" commit -q -m "single scope + appended decision"
assert_exit "single scope + DECISIONS.md append passes" 0 run_guard "$repo"
rm -rf "$repo"

# Case 6: single functional scope + DECISIONS.md edit of existing entry -> fail
repo="$(make_repo)"
mkdir -p "$repo/tools/scope-guard"
echo "x" > "$repo/tools/scope-guard/thing"
printf '# Architectural Decisions\n\n## entry one (edited)\n\nchanged.\n' > "$repo/DECISIONS.md"
git -C "$repo" add -A
git -C "$repo" commit -q -m "single scope + edited decision"
assert_exit "single scope + DECISIONS.md edit fails" 1 run_guard "$repo"
rm -rf "$repo"

# Case 7: single functional scope + DECISIONS.md deletion of existing entry -> fail
repo="$(make_repo)"
mkdir -p "$repo/tools/scope-guard"
echo "x" > "$repo/tools/scope-guard/thing"
printf '# Architectural Decisions\n' > "$repo/DECISIONS.md"
git -C "$repo" add -A
git -C "$repo" commit -q -m "single scope + truncated decisions"
assert_exit "single scope + DECISIONS.md deletion fails" 1 run_guard "$repo"
rm -rf "$repo"

# Case 13: a canonical generated index is metadata alongside one functional scope
repo="$(make_repo)"
mkdir -p "$repo/checks/python"
echo "x" > "$repo/checks/python/thing"
git -C "$repo" add checks/python/thing
write_generated_index "$repo"
git -C "$repo" commit -q -m "single scope with generated index"
assert_exit "valid generated index is excluded from the scope count" 0 run_guard "$repo"
grep -Fq '.template/index/files.txt -> template (classified; valid generated metadata excluded from scope count)' <<<"$last_output"
rm -rf "$repo"

# Case 14: a stale or duplicated index fails closed
repo="$(make_repo)"
mkdir -p "$repo/checks/python"
echo "x" > "$repo/checks/python/thing"
git -C "$repo" add checks/python/thing
write_generated_index "$repo"
printf '%s\n' './DECISIONS.md' >> "$repo/.template/index/files.txt"
git -C "$repo" add .template/index/files.txt
git -C "$repo" commit -q -m "single scope with invalid generated index"
# An uncommitted repair must not mask the invalid blob at HEAD.
git -C "$repo" ls-tree -r --name-only HEAD | grep -v '^\.template-only/' | sed 's|^|./|' | LC_ALL=C sort > "$repo/.template/index/files.txt"
assert_exit "invalid generated index fails" 1 run_guard "$repo"
grep -Fq 'generated metadata is stale or invalid' <<<"$last_output"
rm -rf "$repo"

# Case 15: an ordinary template file still counts as a functional scope
repo="$(make_repo)"
mkdir -p "$repo/checks/python" "$repo/.template/contracts"
echo "x" > "$repo/checks/python/thing"
echo "contract" > "$repo/.template/contracts/thing.md"
git -C "$repo" add checks/python/thing .template/contracts/thing.md
write_generated_index "$repo"
git -C "$repo" commit -q -m "cross-scope change with generated index"
assert_exit "ordinary template file remains in the scope count" 1 run_guard "$repo"
grep -Fq 'multiple scopes touched' <<<"$last_output"
rm -rf "$repo"

echo
echo "scope-guard test.sh: $pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
