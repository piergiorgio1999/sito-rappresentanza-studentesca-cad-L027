# ACC-09

Status: PASS

Purpose: Blocker

Expected Result: blockedBy → BLOCKED; API assente + status:blocked → BLOCKED; nessun crash

Evidence: `tools/project-status/test.sh` verifies blockedBy and
`status:blocked` without crashes; real digest run completed.
