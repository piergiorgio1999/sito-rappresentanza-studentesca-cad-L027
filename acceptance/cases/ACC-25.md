# ACC-25

Status: NOT RUN

Purpose: Deterministic map formats and limits

Expected Result: the documented CLI grammar rejects invalid combinations;
identical fixtures produce byte-identical repeated outputs in each format from
one ordered tree. `outline` is UTF-8 and two-space indented; `mermaid` is a
valid GitHub-renderable `flowchart TD`; identifiers, C-locale ordering, label
escaping, and depth-first traversal match the contract. No public JSON,
timestamp, absolute path, or environmental value is emitted. Preview and
`--full` fixtures verify the same complete ordering: only the preview enforces
8 KiB/100-line limits and an explicit `omitted N` leaf, while `--full` is
untruncated and is rejected from README blocks and job summaries

Implementation: NOT IMPLEMENTED — evidence pending; no claim.
