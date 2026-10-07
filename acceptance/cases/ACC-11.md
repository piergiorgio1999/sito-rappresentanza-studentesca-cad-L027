# ACC-11

Status: PASS

Purpose: Attention

Expected Result: check fallito OR conflitto OR status:attention → ATTENTION

Evidence: `tools/project-status/test.sh` verifies failed checks, conflicts,
and `status:attention`, excluding blocked work; real digest run completed.
