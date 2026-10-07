#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

usage() {
    echo "Usage: $0 VERSION" >&2
    echo "Runs local checks, the release gate, then asks before tag/release publication." >&2
}

if [[ "$#" -ne 1 || ! "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    usage
    exit 2
fi

VERSION="$1"
REPOSITORY="${REPOSITORY:-}"
BASE_REF="${BASE_REF:-main}"

step() { printf '\n==> %s\n' "$1"; }
die() { printf '❌ %s\n' "$1" >&2; exit 1; }

confirm() {
    local answer
    [[ -t 0 ]] || die "interactive confirmation required; run this wizard from a terminal"
    read -r -p "$1 [y/N] " answer
    [[ "$answer" == "y" || "$answer" == "Y" ]]
}

[[ -x scripts/release/prepare-release.sh ]] || die "release gate missing"
[[ -x tools/validate/validate.sh ]] || die "template preflight missing"
command -v git >/dev/null 2>&1 || die "git is required"
command -v gh >/dev/null 2>&1 || die "gh is required"

step "Repository safety"
if ! git diff --quiet || ! git diff --cached --quiet; then
    die "working tree is not clean"
fi
current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$BASE_REF" ]] || die "run from $BASE_REF (current: $current_branch)"

step "Release gate"
# prepare-release.sh is the single release preflight orchestrator. Keep all
# version, acceptance, repository, and CI policy there to avoid drift.
if ! REPOSITORY="$REPOSITORY" BASE_REF="$BASE_REF" ./scripts/release/prepare-release.sh "$VERSION"; then
    die "release gate blocked publication; no tag or release was created"
fi

step "Publication confirmation"
confirm "Create and push tag v$VERSION, then create the GitHub release?" || die "publication cancelled"

git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin "v$VERSION"

if [[ -z "$REPOSITORY" ]]; then
    REPOSITORY="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
fi
gh release create "v$VERSION" --repo "$REPOSITORY" --title "v$VERSION" --generate-notes
printf '✅ release v%s published\n' "$VERSION"
