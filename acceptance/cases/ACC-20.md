# ACC-20

Status: PASS

Purpose: gh version

Expected Result: gh vecchio o `closingIssuesReferences` assente → warning esplicito e fallback deterministico

Implementation:
Controlled fake `gh` rejected `closingIssuesReferences`; `tools/project-status/project-status`
printed `project-status: closingIssuesReferences unavailable; using PR label fallback`
and produced the fixture digest successfully with stable blocked/attention output.
