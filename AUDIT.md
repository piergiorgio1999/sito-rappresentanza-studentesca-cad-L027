# Extra Directory Audit

Audit baseline: `origin/main` after FASE 4. No file was removed or
consolidated. References below are repository references found by static
search and direct inspection of the consumers.

| Directory | Files | Referenced by | Recommended action |
|---|---|---|---|
| `config/` | `github/features.json`, `languages/checkers.json`, `security/security-stack.json` | No executable tool or workflow reference found. `scope-map.json` only classifies the path. | **Consolidate or remove after approval**. These are declarative duplicates of behavior already encoded in `.github/workflows/ci.yml` and the checker scripts. |
| `config/` | `template/project-status.json` | No direct consumer found. `tools/project-status/project-status` does not read it; limits are enforced by acceptance scripts/reporting rather than this file. | **Consolidate or remove after approval**. Keep only if it becomes the canonical digest configuration in a later approved change. |
| `config/` | `template/version.json` | `tools/agent-config-check/agent-config-check` compares it with `TEMPLATE_VERSION`. | **Keep** until version governance is redesigned; removing it breaks the active anti-rot check. |
| `schemas/` | `project-status.schema.json`, `scope-map.schema.json` | No runtime validator or workflow reference found. `scope-map.json` classifies the directory, but does not consume these schemas. | **Consolidate or remove after approval**. The current schemas are permissive stubs and do not enforce the SPEC contract. |
| `scripts/` | `git/status-summary.sh` | No caller found; manual status/log convenience only. | **Remove or consolidate** into documented local tooling after approval. No CI dependency identified. |
| `scripts/` | `release/prepare-release.sh` | No caller found; prints a placeholder and exits successfully. | **Remove** after approval. It can report a false release readiness because it performs no validation. |
| `scripts/` | `verify-template.sh` | No caller found. It duplicates a subset of `tools/agent-config-check` and bootstrap validation. | **Consolidate or remove after approval**. Preserve only if assigned a distinct acceptance role. |
| `.template/` | `contracts/custom-tools.md`, `index/*`, `manifests/todo.md`, `template-manifest.json` | No direct `copier.yml` or tool consumer found. `scope-map.json` classifies `.template/**`; files are metadata/index artifacts. | **Audit for consolidation**. Keep only if these are intentionally distributed as template metadata; otherwise remove the layer after confirming Copier output expectations. |
| `release/` | `CHECKLIST.md`, `RELEASE_NOTES_TEMPLATE.md` | No workflow or release tool reference found. `CHANGELOG.md` is separate. | **Keep temporarily or consolidate** into the release documentation. They are harmless documentation but not executable V1 infrastructure. |
| `tools/validate/` | `validate.sh` | No caller found. Checks local command availability and a small file subset; overlaps bootstrap prerequisite checks and `agent-config-check`. | **Consolidate or remove after approval**. A single canonical validation entry point would reduce drift. |
| `tools/validate/` | `validate-ci.sh` | No caller found. Placeholder only; exits 0 without running the named checks. | **Remove** after approval, or replace in a dedicated scope if a real validation entry point is required. |

## Dependencies

- `tools/agent-config-check/agent-config-check` depends on
  `config/template/version.json`; this is the only active runtime dependency
  found inside the audited directories.
- `scope-map.json` classifies `config/**`, `schemas/**`, `scripts/**`,
  `.template/**`, and `tools/**`, but classification is not functional usage.
- `copier.yml` defines the template variables and root subdirectory but does
  not explicitly reference `.template/`, `config/`, `schemas/`, `release/`, or
  `tools/validate/`.
- `.template/index/files.txt` is a static inventory and is not automatically
  regenerated or checked by a repository tool.
- `config/`, `schemas/`, `scripts/`, `.template/`, `release/`, and
  `tools/validate/` contain `.DS_Store` or placeholder/documentation artifacts
  where present; these have no identified runtime dependency.

## Findings

The extra directories are not uniformly useless. Version configuration is an
active dependency, while most other files are inherited scaffolding, manual
utilities, or placeholders. The highest-confidence cleanup candidates are
`scripts/release/prepare-release.sh` and `tools/validate/validate-ci.sh` because
both are placeholders that can falsely suggest completed functionality.

No cleanup is executed in this phase. Any removal or consolidation requires a
separate approved scope and updated acceptance evidence.

## Proposals

PROPOSTA: make one approved canonical validation command consume the currently
active checks, then remove duplicate placeholder validators.

PROPOSTA: decide whether `.template/` is intended as distributed metadata or
only historical scaffolding; make that decision before changing Copier output.
