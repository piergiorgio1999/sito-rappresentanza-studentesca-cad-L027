# ACC-27

Status: NOT RUN

Purpose: Fail-closed map freshness

Expected Result: the exact dependency and CI marker pairs each occur once and
contain semantically equivalent Mermaid and outline renderings. On every PR,
`agent-config-check` regenerates both into temporary storage and compares them
byte-for-byte; stale blocks and missing, duplicated, or malformed markers fail,
while current blocks pass. CI does not modify the branch and `CI Gate` remains
the only required check

Implementation: NOT IMPLEMENTED — evidence pending; no claim.
