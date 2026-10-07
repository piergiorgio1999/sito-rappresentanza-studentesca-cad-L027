# ACC-10

Status: PASS

Purpose: Priorità NEXT

Expected Result: ordine esatto P0→P1→P2→none, poi issue number

Evidence: `tools/project-status/test.sh` verifies deterministic P0→P1→P2→none
ordering and issue-number tie-break; real digest run completed.
