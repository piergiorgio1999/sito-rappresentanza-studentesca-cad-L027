#!/usr/bin/env bash
set -Eeuo pipefail

die() {
    echo "ERROR: $*" >&2
    exit 1
}

need_cmd() {
    command -v "$1" >/dev/null 2>&1 || die "Missing dependency: $1"
}

require_jq() {
    need_cmd jq
}

require_gh() {
    need_cmd gh
}

require_git() {
    need_cmd git
}

json_pretty() {
    jq .
}

# Classify one repository path against scope-map.json.
#
# scope-map.json is the single source of path classification (SPEC-V1.md
# constraint 5). Scopes are evaluated in key order and the first matching
# pattern wins; a path matching nothing is "unclassified".
#
# Usage: classify_path <scope-map.json> <path>
#
# Kept here rather than inlined by each caller so that scope-guard and the
# repository map derive classification from one implementation: two copies
# would be free to disagree.
classify_path() {
    local scope_map="$1" file="$2" name pattern
    while IFS= read -r name; do
        [[ -z "$name" ]] && continue
        while IFS= read -r pattern; do
            [[ -z "$pattern" ]] && continue
            # shellcheck disable=SC2053
            [[ "$file" == $pattern ]] && { echo "$name"; return 0; }
        done <<< "$(jq -r --arg n "$name" '.scopes[] | select(.name==$n) | .paths[]' "$scope_map")"
    done <<< "$(jq -r '.scopes[].name' "$scope_map")"
    echo "unclassified"
}

timestamp() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}
