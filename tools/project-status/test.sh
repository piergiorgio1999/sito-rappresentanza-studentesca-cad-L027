#!/usr/bin/env bash
set -Eeuo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
FIXTURES="$DIR/tests/fixtures"

bash -n "$DIR/project-status"
jq empty "$FIXTURES/issues.json" "$FIXTURES/prs.json"

json="$(PROJECT_STATUS_MOCK_DIR="$FIXTURES" PROJECT_STATUS_MOCK_REPOSITORY="fixture/repository" "$DIR/project-status" json)"

jq -e '
  .repository == "fixture/repository" and
  (.done | index("#1 Closed work")) and
  (.current | index("#2 In progress")) and
  (.current_prs[0].pr == "#10") and
  (.current_prs[0].diagnosis == "PASS: checks complete") and
  ([.current_prs[] | select(.pr == "#20") | .diagnosis] | .[0] == "WAIT: external check incomplete") and
  ([.current_prs[] | select(.pr == "#21") | .diagnosis] | .[0] == "WAIT: structured dependency is still open") and
  ([.current_prs[] | select(.pr == "#21") | .issue] | .[0] == "#21") and
  ([.current_prs[] | select(.pr == "#21") | .dependencies[0].number] | .[0] == 10) and
  ([.current_prs[] | select(.pr == "#21") | .dependencies[0].source] | .[0] == "Issue #21 blocked by Issue #2") and
  ([.current_prs[] | select(.pr == "#22") | .diagnosis] | .[0] == "WAIT: no checks visible") and
  ([.current_prs[] | select(.pr == "#22") | .issue] | .[0] == null) and
  ([.current_prs[] | .pr] | length == (unique | length)) and
  ((.current | index("#6 Blocked issue")) | not) and
  ((.current | index("#7 Needs attention")) | not) and
  (.blocked | index("#3 Blocked work")) and
  (.blocked | index("#6 Blocked issue")) and
  (.next[0] == "#4 Next P2") and
  ((.next | index("#7 Needs attention")) | not) and
  (.attention | index("#7 Needs attention")) and
  (.attention | index("PR #11 Conflicting issue 5")) and
  (.attention | index("PR #13 Attention issue 2")) and
  (.attention | index("PR #14 Action required")) and
  ((.attention | index("PR #12 Blocked issue 6")) | not) and
  (.progress.features[0].closed == 1) and
  (.progress.features[0].total == 2)
' <<<"$json" >/dev/null

diagnose_json="$(PROJECT_STATUS_MOCK_DIR="$FIXTURES" "$DIR/project-status" diagnose --all json)"
jq -e '
  (.ci_diagnostics | length) == 2 and
  .ci_diagnostics[0].pr == 11 and
  .ci_diagnostics[0].job == "security" and
  .ci_diagnostics[0].step == "Zizmor" and
  .ci_diagnostics[0].location == "src/workflow.yml:42:7" and
  .ci_diagnostics[1].location == null
' <<<"$diagnose_json" >/dev/null

live_json="$(PATH="$DIR/tests/fake-bin:$PATH" "$DIR/project-status" diagnose --all json)"
live_text="$(PATH="$DIR/tests/fake-bin:$PATH" "$DIR/project-status" diagnose --all md)"
jq -e '
  ([.current_prs[] | select(.pr == "#130") | .diagnosis][0] == "PASS: checks complete") and
  ([.current_prs[] | select(.pr == "#130") | .checks[]] == ["CI Gate 🟢 success"]) and
  ([.ci_diagnostics[] | select(.pr == 130)] | length == 0) and
  ([.ci_diagnostics[] | select(.pr == 131)] | length == 1) and
  ([.ci_diagnostics[] | select(.pr == 131)][0].error | contains("error[dangerous-triggers]")) and
  ([.ci_diagnostics[] | select(.pr == 131)][0].error | contains("pull_request_target")) and
  ([.ci_diagnostics[] | select(.pr == 131)][0].error | contains("Process completed with exit code") | not) and
  ([.ci_diagnostics[] | select(.pr == 131)][0].evidence | length > 1) and
  ([.ci_diagnostics[] | select(.pr == 131)][0].affected_paths == [".github/workflows/example.yml"]) and
  ([.ci_diagnostics[] | select(.pr == 131)][0].location == "./.github/workflows/example.yml:3:1") and
  ([.ci_diagnostics[] | select(.pr == 131)][0].escalation | startswith("INSUFFICIENT:")) and
  ([.current_prs[] | select(.pr == "#131")][0].dependencies[0].number == 130) and
  ([.current_prs[] | select(.pr == "#131")][0].dependencies[0].source == "Issue #31 blocked by Issue #30") and
  ([.current_prs[] | select(.pr == "#131")][0].related[0].target == 130) and
  ([.current_prs[] | select(.pr == "#131")][0].diagnosis == "WAIT: structured dependency is still open") and
  ([.current_prs[] | select(.pr == "#132")][0].issue == null) and
  ([.current_prs[] | select(.pr == "#132")][0].declared_closing_refs == [999]) and
  ([.current_prs[] | select(.pr == "#132")][0].recognized_closing_refs == []) and
  ([.current_prs[] | select(.pr == "#132")][0].related == []) and
  ([.ci_diagnostics[] | select(.pr == 132)] | length == 1) and
  ([.ci_diagnostics[] | select(.pr == 132)][0].error == "linking: exactly one closing issue reference is required") and
  ([.ci_diagnostics[] | select(.pr == 132)][0].escalation == "FIX: address the reported failure")
' <<<"$live_json" >/dev/null

text="$(PROJECT_STATUS_MOCK_DIR="$FIXTURES" "$DIR/project-status" md)"
diagnose_text="$(PROJECT_STATUS_MOCK_DIR="$FIXTURES" "$DIR/project-status" diagnose --all md)"
targeted_text="$(PROJECT_STATUS_MOCK_DIR="$FIXTURES" "$DIR/project-status" diagnose --pr 11 md)"
grep -Fq '## CI Diagnostics' <<<"$diagnose_text"
grep -Fq 'src/workflow.yml:42:7' <<<"$diagnose_text"
grep -Fq '#11 Conflicting issue 5' <<<"$targeted_text"
if grep -Fq '#10 Implements issue 2' <<<"$targeted_text"; then
  echo "targeted digest unexpectedly included an unselected PR" >&2
  exit 1
fi
grep -Fq 'DEPENDS-ON: PR #10 [OPEN] — Issue #21 blocked by Issue #2' <<<"$text"
grep -Fq '#22 Unlinked PR (no closing Issue)' <<<"$text"
grep -Fq 'RELATED: PR #130 [OPEN] — modifies failure path .github/workflows/example.yml' <<<"$live_text"
bytes="$(printf '%s' "$text" | wc -c | tr -d ' ')"
lines="$(printf '%s\n' "$text" | wc -l | tr -d ' ')"
(( bytes <= 8192 ))
(( lines <= 100 ))

long_fixture="$(mktemp -d)"
jq -n '[range(1;141) | {number: ., title: ("é issue " + tostring), state: "OPEN", labels: [], milestone: null, subIssues: [], blockedBy: [], blocking: []}]' > "$long_fixture/issues.json"
printf '%s\n' '[]' > "$long_fixture/prs.json"
long_text="$(PROJECT_STATUS_MOCK_DIR="$long_fixture" "$DIR/project-status" md)"
long_bytes="$(printf '%s' "$long_text" | wc -c | tr -d ' ')"
long_lines="$(printf '%s\n' "$long_text" | wc -l | tr -d ' ')"
(( long_bytes <= 8192 ))
(( long_lines <= 100 ))
grep -Fq '… truncated' <<<"$long_text"
grep -Fq '## Current PR' <<<"$text"
printf '%s' "$long_text" | iconv -f UTF-8 -t UTF-8 >/dev/null
rm -rf "$long_fixture"

# ---------------------------------------------------------------------------
# Repository map views (SPEC-V1.md section 13) — ACC-24, ACC-25.
#
# The map tool resolves its repository root from its own location, so the
# fixtures are exercised by materialising a disposable repository around a
# copy of the tool, the same way run-anti-rot.sh sandboxes agent-config-check.
# ---------------------------------------------------------------------------

bash -n "$DIR/map"

map_repo="$(mktemp -d)"
trap 'rm -rf "$map_repo"' EXIT

mkdir -p "$map_repo/tools/lib" "$map_repo/tools/project-status" "$map_repo/pkg" "$map_repo/deep"
cp "$DIR/../lib/common.sh" "$map_repo/tools/lib/common.sh"
cp "$DIR/map" "$map_repo/tools/project-status/map"
cp "$DIR/../../scope-map.json" "$map_repo/scope-map.json"

# All four supported package.json groups, plus labels carrying every character
# the contract requires to be escaped.
cat > "$map_repo/pkg/package.json" <<'JSON'
{
  "dependencies": { "alpha": "1.0.0", "a&b": "<1.0>", "quoted\"name": "2.0" },
  "devDependencies": { "beta": "2.0.0" },
  "optionalDependencies": { "gamma": "3.0.0" },
  "peerDependencies": { "delta": "4.0.0" }
}
JSON

# A supported manifest that declares nothing must still say so.
printf '%s\n' '{}' > "$map_repo/deep/package.json"

# Every recognized-but-unsupported manifest must be reported, never omitted.
printf '%s\n' '// swift' > "$map_repo/Package.swift"
printf '%s\n' '[project]' > "$map_repo/pyproject.toml"
printf '%s\n' 'requests' > "$map_repo/requirements.txt"
printf '%s\n' '[package]' > "$map_repo/Cargo.toml"
printf '%s\n' 'module x' > "$map_repo/go.mod"

git -C "$map_repo" init -q
git -C "$map_repo" add -A
map() { (cd "$map_repo" && ./tools/project-status/map "$@"); }

dep_outline="$(map dependencies outline)"

# Recognized but unsupported sources are explicit, never silently dropped.
for manifest in Package.swift pyproject.toml requirements.txt Cargo.toml go.mod; do
    grep -Fq "$manifest" <<<"$dep_outline"
done
(( $(grep -c 'details unavailable' <<<"$dep_outline") == 5 ))
grep -Fq 'no declared dependencies' <<<"$dep_outline"

# All four dependency groups of a package.json are exposed.
for group in dependencies devDependencies optionalDependencies peerDependencies; do
    grep -Eq "^ +$group\$" <<<"$dep_outline"
done

# Root literal and two-space indentation.
[[ "$(head -n1 <<<"$dep_outline")" == "repository" ]]
grep -Eq '^    pkg/package\.json$' <<<"$dep_outline"

# At least four levels below the root (ACC-24).
grep -Eq '^        alpha 1\.0\.0$' <<<"$dep_outline"

# Label escaping, in contract order, only in mermaid.
dep_mermaid="$(map dependencies mermaid)"
[[ "$(head -n1 <<<"$dep_mermaid")" == "flowchart TD" ]]
grep -Fq 'n0001["repository"]' <<<"$dep_mermaid"
grep -Fq 'a&amp;b &lt;1.0&gt;' <<<"$dep_mermaid"
grep -Fq 'quoted&quot;name 2.0' <<<"$dep_mermaid"
# & is escaped first: no entity is double-escaped.
if grep -Fq '&amp;amp;' <<<"$dep_mermaid"; then
    echo "map: & was double-escaped" >&2; exit 1
fi

# Both formats derive from the same ordered tree: equal node counts.
for map_type in dependencies ci; do
    outline_nodes="$(map "$map_type" outline | tail -n +2 | wc -l | tr -d ' ')"
    mermaid_nodes="$(map "$map_type" mermaid | grep -c '^  n[0-9]\{4\}\["')"
    (( outline_nodes == mermaid_nodes - 1 ))
done

# Byte-identical across runs, in every combination.
for map_type in dependencies ci; do
    for map_format in outline mermaid; do
        [[ "$(map "$map_type" "$map_format")" == "$(map "$map_type" "$map_format")" ]]
    done
done

# The CI view declares itself a contract view, not an extracted DAG.
ci_outline="$(map ci outline)"
grep -Fq 'contract view of SPEC section 9 (not an extracted workflow DAG)' <<<"$ci_outline"

# No timestamp, absolute path or environmental value leaks into the output.
for map_type in dependencies ci; do
    for map_format in outline mermaid; do
        rendered="$(map "$map_type" "$map_format")"
        if grep -Eq '/(Users|home|tmp|private)/' <<<"$rendered"; then
            echo "map: absolute path leaked into $map_type/$map_format" >&2; exit 1
        fi
        if grep -Eq '[0-9]{4}-[0-9]{2}-[0-9]{2}T' <<<"$rendered"; then
            echo "map: timestamp leaked into $map_type/$map_format" >&2; exit 1
        fi
    done
done

# Preview limits and the explicit omitted leaf (SPEC section 13 point 7).
{
    printf '{ "dependencies": {'
    for i in $(seq 1 400); do
        (( i > 1 )) && printf ','
        printf '"package-with-a-long-name-%03d": "1.0.0"' "$i"
    done
    printf '} }\n'
} > "$map_repo/pkg/package.json"
git -C "$map_repo" add -A

for map_format in outline mermaid; do
    preview="$(map dependencies "$map_format")"
    (( $(printf '%s\n' "$preview" | wc -c | tr -d ' ') <= 8192 ))
    (( $(printf '%s\n' "$preview" | wc -l | tr -d ' ') <= 100 ))
    grep -Eq 'omitted [0-9]+' <<<"$preview"
done

# The same node prefix is selected for both formats.
preview_outline_nodes="$(map dependencies outline | tail -n +2 | wc -l | tr -d ' ')"
preview_mermaid_nodes="$(map dependencies mermaid | grep -c '^  n[0-9]\{4\}\["')"
(( preview_outline_nodes == preview_mermaid_nodes - 1 ))

# --full keeps the same order without the preview limit and without the leaf.
full_outline="$(map dependencies outline --full)"
(( $(printf '%s\n' "$full_outline" | wc -l | tr -d ' ') > 100 ))
if grep -Eq 'omitted [0-9]+' <<<"$full_outline"; then
    echo "map: --full must not truncate" >&2; exit 1
fi
preview_outline="$(map dependencies outline)"
[[ "$(printf '%s\n' "$full_outline" | head -n 5)" == "$(printf '%s\n' "$preview_outline" | head -n 5)" ]]

# CLI grammar: invalid combinations are rejected.
for bad_args in "dependencies" "outline" "bogus outline" "dependencies bogus" \
                "dependencies outline mermaid" "dependencies outline --repo o/r" \
                "ci outline --repo o/r" "--repo o/r dependencies outline" \
                "status" "status bogus" "status outline --repo"; do
    # shellcheck disable=SC2086
    if map $bad_args >/dev/null 2>&1; then
        echo "map: accepted invalid arguments: $bad_args" >&2
        exit 1
    fi
done

rm -rf "$map_repo"

# ---------------------------------------------------------------------------
# Live status view (SPEC-V1.md section 13, TYPE=status) — ACC-24, ACC-25.
#
# `status` is derived from the digest, so it runs against the real tool tree
# with the digest's own GitHub access mocked out. No fixture below reaches
# GitHub and none of them writes anything back.
# ---------------------------------------------------------------------------

status_map() {
    local fixtures="$1"
    shift
    PROJECT_STATUS_MOCK_DIR="$fixtures" "$DIR/map" status "$@"
}

# Shipped fixtures: issues in progress with their pull requests, blocked work,
# attention, and open pull requests that no current issue reaches.
status_outline="$(status_map "$FIXTURES" outline --full)"

[[ "$(head -n1 <<<"$status_outline")" == "repository" ]]
for status_category in progress current next blocked attention "done" \
                       "pull requests without a current issue"; do
    grep -Fxq "  $status_category" <<<"$status_outline"
done

# Digest categories and semantics, not a second interpretation of GitHub.
grep -Fxq '    #2 In progress' <<<"$status_outline"
grep -Fxq '      pr #10 Implements issue 2' <<<"$status_outline"
grep -Fxq '        diagnosis PASS: checks complete' <<<"$status_outline"
grep -Fxq '    #6 Blocked issue' <<<"$status_outline"
grep -Fxq '    PR #14 Action required' <<<"$status_outline"
grep -Fxq '    #1 Closed work' <<<"$status_outline"

# A pull request no current issue reaches is listed, never dropped.
grep -Fxq '    pr #22 Unlinked PR' <<<"$status_outline"
grep -Fxq '      no linked issue' <<<"$status_outline"
grep -Fxq '      no visible check' <<<"$status_outline"

# Issues are ordered by number, not by rendered text: #5 precedes #20.
[[ "$(grep -n '^    #5 Feature$' <<<"$status_outline" | cut -d: -f1)" \
   -lt "$(grep -n '^    #20 Pending PR$' <<<"$status_outline" | cut -d: -f1)" ]]

# At least four levels below the root.
grep -Eq '^        (unnamed|review|security) ' <<<"$status_outline"

# The live snapshot never leaks the digest timestamp or an absolute path.
for map_format in outline mermaid; do
    rendered="$(status_map "$FIXTURES" "$map_format")"
    if grep -Eq '[0-9]{4}-[0-9]{2}-[0-9]{2}T' <<<"$rendered"; then
        echo "map: digest timestamp leaked into status/$map_format" >&2; exit 1
    fi
    if grep -Eq '/(Users|home|tmp|private)/' <<<"$rendered"; then
        echo "map: absolute path leaked into status/$map_format" >&2; exit 1
    fi
    [[ "$rendered" == "$(status_map "$FIXTURES" "$map_format")" ]]
done

# Both formats derive from the same ordered tree, preview included.
status_outline_nodes="$(status_map "$FIXTURES" outline | tail -n +2 | wc -l | tr -d ' ')"
status_mermaid_nodes="$(status_map "$FIXTURES" mermaid | grep -c '^  n[0-9]\{4\}\["')"
(( status_outline_nodes == status_mermaid_nodes - 1 ))

# Preview limits and the explicit omitted leaf; --full keeps the same prefix.
status_preview="$(status_map "$FIXTURES" outline)"
(( $(printf '%s\n' "$status_preview" | wc -c | tr -d ' ') <= 8192 ))
(( $(printf '%s\n' "$status_preview" | wc -l | tr -d ' ') <= 100 ))
grep -Eq 'omitted [0-9]+' <<<"$status_preview"
if grep -Eq 'omitted [0-9]+' <<<"$status_outline"; then
    echo "map: --full must not truncate status" >&2; exit 1
fi
[[ "$(printf '%s\n' "$status_outline" | head -n 5)" == "$(printf '%s\n' "$status_preview" | head -n 5)" ]]

# Empty state: every category is stated explicitly.
status_empty="$(mktemp -d)"
printf '%s\n' '[]' > "$status_empty/issues.json"
printf '%s\n' '[]' > "$status_empty/prs.json"
empty_outline="$(status_map "$status_empty" outline --full)"
(( $(grep -c '^    none$' <<<"$empty_outline") >= 5 ))
grep -Fxq '      none' <<<"$empty_outline"
if grep -Eq 'omitted [0-9]+' <<<"$(status_map "$status_empty" outline)"; then
    echo "map: empty status must not be truncated" >&2; exit 1
fi
rm -rf "$status_empty"

# Blocked state: a label-blocked issue stays out of current and inside blocked.
status_blocked="$(mktemp -d)"
jq -n '[{number: 3, title: "Halted", state: "OPEN",
         labels: [{name: "status:blocked"}], milestone: null,
         subIssues: [], blockedBy: [], blocking: []}]' > "$status_blocked/issues.json"
printf '%s\n' '[]' > "$status_blocked/prs.json"
blocked_outline="$(status_map "$status_blocked" outline --full)"
grep -Fxq '    #3 Halted' <<<"$blocked_outline"
[[ "$(grep -n '^  blocked$' <<<"$blocked_outline" | cut -d: -f1)" \
   -lt "$(grep -n '^    #3 Halted$' <<<"$blocked_outline" | cut -d: -f1)" ]]
rm -rf "$status_blocked"

# A pull request reachable from two current issues is expanded once and then
# closed by an explicit stable reference (SPEC section 13 point 1).
status_shared="$(mktemp -d)"
jq -n '[{number: 1, title: "Alpha", state: "OPEN", labels: [], milestone: null,
         subIssues: [], blockedBy: [], blocking: []},
        {number: 2, title: "Beta", state: "OPEN", labels: [], milestone: null,
         subIssues: [], blockedBy: [], blocking: []}]' > "$status_shared/issues.json"
# Two failing checks, declared in reverse name order: the map orders checks by
# name (SPEC section 13 point 6), the API order is not authoritative.
jq -n '[{number: 9, title: "Shared", state: "OPEN", labels: [],
         closingIssuesReferences: [{number: 1}, {number: 2}],
         statusCheckRollup: [{name: "zeta check", conclusion: "FAILURE", status: "COMPLETED"},
                             {name: "alpha check", conclusion: "FAILURE", status: "COMPLETED"}],
         mergeStateStatus: "CLEAN", headRefOid: "0000000"}]' > "$status_shared/prs.json"
shared_outline="$(status_map "$status_shared" outline --full)"
grep -Fxq '      pr #9 Shared' <<<"$shared_outline"
grep -Fxq '      ref pr #9' <<<"$shared_outline"
(( $(grep -c 'diagnosis ' <<<"$shared_outline") == 1 ))
[[ "$(grep -n 'alpha check' <<<"$shared_outline" | cut -d: -f1)" \
   -lt "$(grep -n 'zeta check' <<<"$shared_outline" | cut -d: -f1)" ]]
# --repo is admitted for status.
status_map "$status_shared" outline --repo owner/repo >/dev/null
rm -rf "$status_shared"


# ---------------------------------------------------------------------------
# README generated blocks and fail-closed freshness (SPEC-V1.md section 13
# points 3 and 8) — ACC-26, ACC-27.
# ---------------------------------------------------------------------------

bash -n "$DIR/readme-maps"

readme_repo="$(mktemp -d)"
mkdir -p "$readme_repo/tools/lib" "$readme_repo/tools/project-status" "$readme_repo/pkg"
cp "$DIR/../lib/common.sh" "$readme_repo/tools/lib/common.sh"
cp "$DIR/map" "$DIR/readme-maps" "$readme_repo/tools/project-status/"
cp "$DIR/../../scope-map.json" "$readme_repo/scope-map.json"
printf '%s\n' '{ "dependencies": { "left-pad": "1.0.0" } }' > "$readme_repo/pkg/package.json"
{
    printf '# Demo\n\n'
    printf '<!-- repository-map:dependencies:start -->\n'
    printf '<!-- repository-map:dependencies:end -->\n\n'
    printf '<!-- repository-map:ci:start -->\n'
    printf '<!-- repository-map:ci:end -->\n'
} > "$readme_repo/README.md"
git -C "$readme_repo" init -q
git -C "$readme_repo" add -A
readme_maps() { (cd "$readme_repo" && ./tools/project-status/readme-maps "$@"); }

# Empty blocks are stale: the check fails before anything is generated.
if readme_maps check >/dev/null 2>&1; then
    echo "readme-maps: empty blocks were accepted as fresh" >&2; exit 1
fi

readme_maps update
readme_maps check

# Each block carries both renderings of the same tree.
(( $(grep -c '^```mermaid$' "$readme_repo/README.md") == 2 ))
(( $(grep -c '^```text$' "$readme_repo/README.md") == 2 ))
grep -Fq 'left-pad 1.0.0' "$readme_repo/README.md"
grep -Fq 'flowchart TD' "$readme_repo/README.md"

# The live view is never persisted (SPEC section 13 point 3).
if grep -Fq 'repository-map:status' "$readme_repo/README.md"; then
    echo "readme-maps: the live status view was written into README.md" >&2; exit 1
fi

# Regeneration is idempotent: no churn in the diff on an unchanged tree.
readme_before="$(cat "$readme_repo/README.md")"
readme_maps update
[[ "$readme_before" == "$(cat "$readme_repo/README.md")" ]]

# A change in a tracked manifest makes the committed block stale.
printf '%s\n' '{ "dependencies": { "left-pad": "1.0.0", "right-pad": "2.0.0" } }' \
    > "$readme_repo/pkg/package.json"
git -C "$readme_repo" add -A
if readme_maps check >/dev/null 2>&1; then
    echo "readme-maps: a stale block passed the freshness check" >&2; exit 1
fi
# The check never writes: the stale README is left exactly as it was.
[[ "$readme_before" == "$(cat "$readme_repo/README.md")" ]]
readme_maps update
readme_maps check
grep -Fq 'right-pad 2.0.0' "$readme_repo/README.md"

# Missing, duplicated and inverted markers all fail.
cp "$readme_repo/README.md" "$readme_repo/README.good"
for marker_case in delete duplicate invert; do
    case "$marker_case" in
        delete) grep -v 'repository-map:ci:end' "$readme_repo/README.good" > "$readme_repo/README.md" ;;
        duplicate) { cat "$readme_repo/README.good"; printf '<!-- repository-map:ci:start -->\n'; } > "$readme_repo/README.md" ;;
        invert) sed -e 's|<!-- repository-map:ci:start -->|MARK_A|' \
                    -e 's|<!-- repository-map:ci:end -->|<!-- repository-map:ci:start -->|' \
                    -e 's|MARK_A|<!-- repository-map:ci:end -->|' \
                    "$readme_repo/README.good" > "$readme_repo/README.md" ;;
    esac
    if readme_maps check >/dev/null 2>&1; then
        echo "readme-maps: malformed markers accepted ($marker_case)" >&2; exit 1
    fi
    if readme_maps update >/dev/null 2>&1; then
        echo "readme-maps: update repaired malformed markers instead of failing ($marker_case)" >&2; exit 1
    fi
done
cp "$readme_repo/README.good" "$readme_repo/README.md"
readme_maps check

# The pre-commit hook regenerates and stages the blocks on every commit.
git -C "$readme_repo" add -A
readme_maps install-hook >/dev/null
printf '%s\n' '{ "dependencies": { "left-pad": "1.0.0", "zeta": "9.9.9" } }' \
    > "$readme_repo/pkg/package.json"
git -C "$readme_repo" add pkg/package.json
git -C "$readme_repo" -c user.email=t@example.invalid -c user.name=t commit -qm "add zeta" >/dev/null 2>&1
git -C "$readme_repo" show --stat --format= HEAD | grep -Fq 'README.md'
readme_maps check

# Unstaged README edits are never swept into the commit: the hook stops.
printf '%s\n' '{ "dependencies": { "left-pad": "1.0.0", "omega": "1.1.1" } }' \
    > "$readme_repo/pkg/package.json"
printf '\nprose edit\n' >> "$readme_repo/README.md"
git -C "$readme_repo" add pkg/package.json
if git -C "$readme_repo" -c user.email=t@example.invalid -c user.name=t \
        commit -qm "should stop" >/dev/null 2>&1; then
    echo "readme-maps: hook swept unstaged README edits into a commit" >&2; exit 1
fi
git -C "$readme_repo" add -A
git -C "$readme_repo" -c user.email=t@example.invalid -c user.name=t commit -qm "add omega" >/dev/null 2>&1
readme_maps check


# A README that is already fresh commits even with unrelated unstaged edits:
# the hook asks whether regeneration changed anything, not whether the file
# differs from the index.
printf '\nunrelated prose\n' >> "$readme_repo/README.md"
printf '%s\n' 'unrelated' > "$readme_repo/pkg/other.txt"
git -C "$readme_repo" add pkg/other.txt
git -C "$readme_repo" -c user.email=t@example.invalid -c user.name=t \
    commit -qm "unrelated change" >/dev/null 2>&1
git -C "$readme_repo" checkout -q -- README.md 2>/dev/null || true
git -C "$readme_repo" add -A

# An existing hook is preserved, never overwritten.
readme_maps install-hook | grep -Fq 'preserving existing pre-commit hook'

# CLI grammar.
for bad_args in "" "render" "render status" "render bogus" "bogus"; do
    # shellcheck disable=SC2086
    if readme_maps $bad_args >/dev/null 2>&1; then
        echo "readme-maps: accepted invalid arguments: $bad_args" >&2
        exit 1
    fi
done

rm -rf "$readme_repo"

echo "project-status tests: PASS"
