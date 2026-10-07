#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORKFLOW="$ROOT/.github/workflows/project-status-refresh.yml"

grep -Fq "github.event_name == 'pull_request'" "$WORKFLOW"
grep -Fq "format('pr-{0}', github.event.pull_request.number)" "$WORKFLOW"
grep -Fq "|| github.run_id" "$WORKFLOW"
grep -Fq "cancel-in-progress: \${{ github.event_name == 'pull_request' }}" "$WORKFLOW"
grep -Fq "for attempt in 1 2 3" "$WORKFLOW"
grep -Fq '(( attempt < 3 )) || exit 1' "$WORKFLOW"

echo "project-status-refresh concurrency test: PASS"
