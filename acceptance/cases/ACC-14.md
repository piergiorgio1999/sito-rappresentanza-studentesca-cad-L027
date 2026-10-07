# ACC-14

Status: PASS

Purpose: CI Gate

Expected Result: fail rilevante → FAIL; skip legittimo → PASS; cancelled → FAIL

Evidence: disposable runs `31406282666` (required failure and CI Gate
failure), `31405763029` (legitimate Xcode skip and CI Gate success), and
`31405762379` (cancelled run and CI Gate failure).
