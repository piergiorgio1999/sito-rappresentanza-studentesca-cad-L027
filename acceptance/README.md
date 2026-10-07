# Acceptance Tests

This directory contains the end-to-end validation suite.

Execution order:

1. Bootstrap
2. CI
3. Scope Guard
4. Language Detection
5. Security
6. Digest
7. Template Update

Every acceptance test must be deterministic.

## Disposable test isolation

Choose the smallest isolated test surface that proves the requirement:

1. Prefer a disposable branch when code or configuration isolation is enough,
   no clean Git history is required, and repository-level behavior is not under
   test.
2. Use a disposable repository when the test creates a repository, needs a new
   Git history, exercises Rulesets or repository settings, proves absence from
   history, or needs strong GitHub Actions isolation.
3. Each disposable repository belongs to one acceptance scope only.
4. After cleanup is requested or attempted, mark the repository `DEAD` and do
   not reuse it. If deletion is unavailable, make it private and report
   cleanup as pending.
5. Prefer public disposable repositories when privacy is not required, to avoid
   consuming private GitHub Actions minutes.
