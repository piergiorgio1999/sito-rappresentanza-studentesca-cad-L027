# ACC-22

Status: PASS

Purpose: Ruleset degradation

Expected Result: capability Ruleset non disponibile → FAIL fail-closed; proprietà indispensabile assente → FAIL

Implementation:
Disposable repository `piergiorgio1999/agent-template-acceptance-v11-20260810a`.
Bootstrap against GitHub Free private-repository Rulesets returned HTTP 403
(`Upgrade to GitHub Pro or make this repository public`) and stopped without
skipping protection or continuing as if the Ruleset existed. No bypass was
used.
