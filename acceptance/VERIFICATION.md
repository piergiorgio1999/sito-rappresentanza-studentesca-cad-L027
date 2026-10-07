# V1.2 Acceptance Verification

Verification baseline: `origin/main` after V1 release. Local scripts are under
`acceptance/scripts/`; they do not write to GitHub and use temporary fixture
repositories where applicable.

| ID | Local executable | Result | Notes |
|---|---|---|---|
| ACC-01 | Yes | PASS | Public disposable `agent-template-acc01-e2e-20260811`: bootstrap created and pushed `main`; Ruleset `20682734` active; CI run `31471525814` and Label Sync run `31471525825` passed; auto-delete enabled; Copier metadata present. |
| ACC-02 | Yes | PASS | Disposable PR #6 merged with squash; CI run `31405030012` passed without self-approval or Code Owner deadlock. |
| ACC-03 | Yes | PASS | `run-scope-guard.sh`: unclassified file returns failure. |
| ACC-04 | Yes | PASS | `run-scope-guard.sh`: two functional scopes return failure. |
| ACC-05 | Yes | PASS | `run-scope-guard.sh`: one functional scope returns success. |
| ACC-06 | Yes | PASS | `run-scope-guard.sh`: functional scope plus unclassified shared path returns failure. |
| ACC-07 | Yes | PASS | `scope-guard` accepts multiple functional scopes when `scope:exception` is present; covered by merged ACC-07 fix. |
| ACC-08 | Yes | PASS | `tools/project-status/test.sh` and real digest run verify issue/PR linking state. |
| ACC-09 | Yes | PASS | `tools/project-status/test.sh` verifies blockedBy and `status:blocked` handling without crashes. |
| ACC-10 | Yes | PASS | `tools/project-status/test.sh` verifies deterministic priority and issue-number ordering. |
| ACC-11 | Yes | PASS | `tools/project-status/test.sh` verifies failed checks, conflicts, and `status:attention` precedence. |
| ACC-12 | Yes | PASS | Disposable PRs #12, #13, #14, and #16 exercised Go, Python, Rust, and TypeScript; SwiftPM and Shell baseline checks also passed in the same runs. |
| ACC-13 | Yes | PASS | Disposable CI runs `31405030012`, `31405763029`, and `31409386680` cover SwiftPM, Xcode skip, and configured Xcode execution. |
| ACC-14 | Yes | PASS | Disposable runs `31406282666`, `31405763029`, and `31405762379` verify failure, legitimate skip, and cancellation gate behavior. |
| ACC-15 | Yes | PASS | Public disposable probes: Actionlint runtime fixture run `31469552557` failed on `.github/workflows/runtime-invalid.yml` with `fail_level: error`; Zizmor runtime fixture run `31469605974` passed Actionlint and failed on `unpinned-uses`; both Gates failed. Evidence recorded in PR #93. |
| ACC-16 | Yes | PASS | Public disposable `agent-template-acc16-clean-probe`, run `31470594493`: history scan reported no leaks; runtime-only untracked fixture was found by `gitleaks dir` (exit 2); Gate failed. Evidence recorded in PR #94. |
| ACC-17 | Yes | PASS | `run-anti-rot.sh`: invalid scope map and missing DECISIONS.md are rejected. Missing script/stub detection is not implemented by the current checker. |
| ACC-18 | Yes | PASS | `run-digest.sh`: fixture suite plus real digest; 279 bytes and 20 lines in Markdown output. |
| ACC-19 | Yes | PASS | Copier 9.17.1 with `--vcs-ref=HEAD` generated standalone without MCP files and MCP with server, package files, and rendered integration mode. |
| ACC-20 | Yes | PASS | Controlled fake `gh` rejected `closingIssuesReferences`; project-status emitted its explicit fallback warning and produced the digest successfully. |
| ACC-21 | Yes | PASS | Bootstrap rerun against the initialized disposable repository refused safely because `.git` already existed. |
| ACC-22 | Yes | PASS | Disposable private-repository bootstrap returned the expected GitHub Free Ruleset 403 and failed closed without bypassing protection. |
| ACC-23 | Yes | PASS | Disposable PR #11 merged with squash; CI run `31430060761` passed, post-merge `label-sync` run `31430296006` passed, and canonical labels plus `acceptance:extra` were present. |
| ACC-24 | No | NOT RUN | Implementation and evidence pending; no claim. |
| ACC-25 | No | NOT RUN | Implementation and evidence pending; no claim. |
| ACC-26 | No | NOT RUN | Implementation and evidence pending; no claim. |
| ACC-27 | No | NOT RUN | Implementation and evidence pending; no claim. |
| ACC-28 | No | NOT RUN | Implementation and evidence pending; no claim. |
| ACC-29 | No | NOT RUN | Implementation and Copier evidence pending; no claim. |

## Local Commands

```bash
acceptance/scripts/run-all.sh
acceptance/scripts/run-scope-guard.sh
acceptance/scripts/run-anti-rot.sh
acceptance/scripts/run-digest.sh
acceptance/scripts/run-ci-tests.sh
```

`run-all.sh` executes all currently automatable local acceptance cases and
prints the remaining GitHub/disposable-repository cases as `NOT RUN`.
`run-scope-guard.sh` is expected to pass all local scope cases.
`run-anti-rot.sh` restores all temporary fixtures automatically through its
trap. `run-digest.sh` performs read-only GitHub access for the real repository.

## CI Verification Instructions

Use a disposable branch/repository derived from the current `main` and record
the commit SHA, workflow URL, expected result, actual result, and cleanup in
this report. Do not claim a GitHub acceptance case passed from a local mock.

- ACC-01: run bootstrap against a disposable repository where the required
  Ruleset capability is available; use a public repository on GitHub Free and
  verify labels, Ruleset, CI, branch auto-delete, and Copier metadata.
- ACC-02: create and merge a PR under the configured single-owner Ruleset;
  verify that Code Owner self-approval is not required.
- ACC-12: create separate branches with each supported language manifest and
  verify only the matching checker runs while other checkers skip.
- ACC-13: run SwiftPM and Xcode fixture branches; verify the configured Swift
  path runs and unsupported Xcode configuration skips legitimately.
- ACC-14: create CI runs with a required failure, legitimate detection skip,
  and cancellation; verify only success/skipped pass the gate.
- ACC-15: use temporary workflow mutations for an unpinned action and invalid
  syntax; verify zizmor/actionlint block the gate, then remove the mutation.
- ACC-16: create a fake secret only during the runner job; verify Gitleaks
  fails and confirm no secret is committed.
- ACC-19: generate disposable standalone and MCP repositories with Copier;
  verify MCP files are absent/present respectively, update the template, and
  verify infrastructure changes do not overwrite project-specific code.
- ACC-21: rerun bootstrap in the initialized repository; verify no duplicate
  or destructive operation occurs.
- ACC-22: run against a repository/API capability where Ruleset support is
  unavailable; verify the bootstrap fails closed without skipping protection.
- ACC-23: after FASE 3 is merged, push a controlled `.github/labels.yml`
  change to `main`; verify canonical labels synchronize and an extra label is
  retained.

## Post-V1 CI Testing

These cases require a disposable repository derived from the released
template. Do not run destructive bootstrap operations against this repository.
Use a GitHub account with repository administration rights, an authenticated
`gh`, Copier, and the local tools required by the generated repository.

Common setup:

```bash
export TEST_REPO="owner/agent-template-acceptance-$(date +%Y%m%d%H%M%S)"
copier copy gh:piergiorgio1999/agent-template "/tmp/${TEST_REPO##*/}"
cd "/tmp/${TEST_REPO##*/}"
git config user.name "Acceptance Runner"
git config user.email "acceptance@example.invalid"
```

After each test, record the repository, commit SHA, workflow URL, expected and
actual result, then delete the disposable repository through the GitHub UI or
`gh repo delete "$TEST_REPO" --yes` only after preserving the evidence.

### ACC-01 Bootstrap end-to-end

Run `./tools/bootstrap/bootstrap` in the generated directory. Verify the
repository with the required Ruleset capability, initial `main` push,
canonical labels, Ruleset, first CI run, branch auto-delete setting, and
Copier metadata. Record the first CI URL
from `gh run list --repo "$TEST_REPO" --branch main --limit 1 --json url`.

### ACC-02 Single-owner workflow

Create a one-scope change, open a PR, and verify the Ruleset does not require
Code Owner self-approval. Merge it only in the disposable repository and
record the merge and resulting CI run.

### ACC-12 Language detection

Create six independent branches, each containing exactly one of `go.mod`,
`pyproject.toml`, `Cargo.toml`, `package.json`/`tsconfig.json`,
`Package.swift`, or a shell script. Push each branch and verify the matching
checker runs while unrelated language steps are explicitly skipped.

### ACC-13 Swift/Xcode

Use one SwiftPM fixture and two Xcode fixtures: no Xcode configuration and a
valid configuration. Verify `swift test` runs for SwiftPM, the unsupported
configuration skips legitimately, and the valid configuration runs.

### ACC-14 CI Gate

Use temporary disposable branches to produce one required failure, one
legitimate detection skip, and one cancellation. Verify `gate` passes only for
success/legitimate skip and fails for failure/cancellation.

### ACC-15 Actions security

On disposable branches, introduce one mutable action reference and one invalid
workflow syntax error. Verify zizmor and actionlint fail respectively, then
remove both temporary changes.

### ACC-16 Runtime secret detection

Create a fake secret only during a runner step, never in a commit. Verify
Gitleaks fails and the gate fails; confirm `git log` and the pushed tree contain
no secret.

### ACC-19 Copier update

Generate a disposable project with Copier, add project-specific code, run
`copier update` against the released template, and verify infrastructure
updates without overwriting that code. Record the before/after diff.

### ACC-21 Bootstrap re-run

Run bootstrap once successfully, then run it again against the same generated
directory and repository. Verify it fails safely with an existing-state message
and performs no deletion, duplicate repository creation, or destructive reset.

### ACC-22 Ruleset degradation

Run against a disposable repository/API capability where Rulesets are
unsupported. Verify the tool reports `WARNING` and skips only that optional
operation; if an indispensable Ruleset property is unavailable, verify a clear
failure instead.

## Gaps

- `agent-config-check` validates core files and JSON/version consistency but
  does not detect every missing script or TODO stub listed by ACC-17.
- CI-only cases still need real GitHub evidence; local fixtures are not a
  substitute for Ruleset, Actions, Gitleaks, Copier, or workflow behavior.

## Proposals

PROPOSTA: extend `scope-guard` with a deterministic, CI-provided
`scope:exception` signal / label input and add acceptance coverage for it;
cost and exact interface should be reviewed in FASE 5 before implementation.

PROPOSTA: expand `agent-config-check` anti-rot assertions to cover required
script existence and rejection of known TODO stubs; defer until the FASE 5
audit confirms the canonical file set.

## Post-V1 Proposals

This section is a non-operative idea registry for possible future versions.
It is NOT a roadmap, does NOT authorize work, and does NOT represent project
state. A proposal becomes actionable only after owner approval and creation of
a dedicated GitHub Issue. Until then agents MUST NOT implement these entries.

- **P-01 — Checker self-test:** evaluate the saved
  `/tmp/checker-selftest-wip.patch` and implement it in a dedicated PR only if
  the audit confirms a concrete reliability benefit.
- **P-02 — Dependabot grouping:** evaluate weekly grouped rules by ecosystem
  before changing Dependabot configuration.
- **P-03 — Retire duplicate validators:** decide whether the audited
  placeholder validators should be removed or consolidated into one canonical
  validation command.
- **P-04 — `.template/` role:** decide whether `.template/` is distributed
  metadata or historical scaffolding before changing Copier output.
- **P-05 — Live acceptance harness:** consider a controlled disposable-repo
  harness for repeatable CI-only acceptance evidence; do not run it against
  production repositories.
- **P-06 — Ephemeral Project Status cache:** evaluate a short-lived,
  gitignored, non-authoritative cache for `project-status` to reduce GitHub API
  calls and startup latency. Cache hit/miss MUST NOT change digest semantics;
  provide an explicit fresh/bypass path if implemented.
- **P-07 — Dependency-change governance:** evaluate deterministic detection of
  dependency-manifest changes plus explicit PR declaration/justification of new
  direct dependencies. Avoid a global `allowed-deps.txt` that duplicates
  project manifests or becomes a second source of truth.
- **P-08 — Risk-based human approval gate:** investigate risk classes for
  architectural/security/destructive changes and require a valid approval for
  the current PR head when policy demands it. Do not rely on mutable labels or
  historical/stale approvals as the sole authorization signal.
- **P-09 — YAML parser policy:** retain no-parser simplicity while YAML parsing
  is unnecessary; if a future requirement genuinely needs structural YAML
  parsing, prefer a mature standard parser over ad-hoc Bash parsing and review
  the SPEC prohibition explicitly before implementation.
- **P-10 — GitHub CLI compatibility diagnostics:** improve fail-fast messages
  for required `gh` capabilities with detected/tested version information and
  platform-appropriate upgrade guidance; do not add a semantic fallback for
  missing `closingIssuesReferences` support.
- **P-11 — Renovate alternative dependency bot (PRIORITY: MINIMAL):** evaluate
  Renovate only in a future version if its richer package rules, grouping,
  scheduling, automerge controls, or ecosystem coverage provide a concrete
  advantage over the GitHub-native Dependabot configuration. Keep Dependabot as
  the default; do not run both bots against the same dependency ecosystems.
