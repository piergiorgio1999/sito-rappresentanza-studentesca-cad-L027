#!/usr/bin/env bash
set -Eeuo pipefail

fixture='[
  {"number":147,"statusCheckRollup":[
    {"name":"scope-guard","workflowName":"CI","conclusion":"FAILURE","startedAt":"2026-08-13T01:00:00Z","detailsUrl":"https://github.com/x/actions/runs/100/job/1"},
    {"name":"scope-guard","workflowName":"CI","conclusion":"SUCCESS","startedAt":"2026-08-13T02:00:00Z","detailsUrl":"https://github.com/x/actions/runs/101/job/2"},
    {"name":"CI Gate","workflowName":"CI","conclusion":"FAILURE","startedAt":"2026-08-13T02:00:00Z","detailsUrl":"https://github.com/x/actions/runs/101/job/3"}
  ]},
  {"number":148,"statusCheckRollup":[
    {"name":"linking","workflowName":"CI","conclusion":"FAILURE","startedAt":"2026-08-13T03:00:00Z","detailsUrl":"https://github.com/x/actions/runs/200/job/4"}
  ]},
  {"number":149,"statusCheckRollup":[
    {"name":"refresh","workflowName":"Project Status Refresh","conclusion":"SUCCESS","startedAt":"2026-08-13T03:00:00Z","detailsUrl":"https://github.com/x/actions/runs/300/job/5"}
  ]}
]'

targets="$(jq -r '
  def check_key: [(.workflowName // ""), (.name // .context // "unnamed")];
  def current_checks: group_by(check_key) | map(sort_by(.startedAt // .completedAt // "") | last);
  .[] as $pr |
  (($pr.statusCheckRollup // []) | current_checks[]) |
  select((((.conclusion // .state // "") | ascii_upcase) | IN("FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED"))) |
  (try ((.detailsUrl // "" | capture("/actions/runs/(?<id>[0-9]+)") | .id)) catch null) as $run_id |
  select($run_id != null) |
  [$run_id, ($pr.number | tostring), (.name // .context // "unnamed")] | @tsv
' <<<"$fixture" | sort -t $'\t' -k1,1 -u)"

expected=$'101\t147\tCI Gate\n200\t148\tlinking'
[[ "$targets" == "$expected" ]]
printf 'rerun-failed-pr-ci selector: PASS\n'
