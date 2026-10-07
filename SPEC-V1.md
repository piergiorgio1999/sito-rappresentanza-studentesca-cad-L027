# SPEC-V1.2 — Agent-Ready Template (CONGELATA)

Questo file è IL CONTRATTO vincolante.
In caso di divergenza con qualsiasi altro file del repo (docs, config/,
acceptance/cases/, .template/), SPEC-V1.md PREVALE.
Non modificare senza approvazione esplicita dell'architetto.

## 1. VINCOLI ASSOLUTI
1. GitHub = unica source of truth persistente
2. Profilo MCP opzionale = adapter locale stdio selezionato da Copier; `standalone` resta il default. Nessun servizio remoto, webhook o pubblicazione automatica.
3. Project Status Digest = funzione read-only derivata; MAI committato, MAI editabile, MAI source of truth
4. Runtime tool custom = Bash + jq + gh. Il solo adapter MCP opzionale usa Node.js e l'SDK MCP ufficiale pinnato. VIETATI: yq, PyYAML, parser YAML custom, Python per parsing
5. scope-map.json = UNICA fonte classificazione path; overlap: first-match-wins (ordine chiavi); OGNI file classificato (nessun unclassified)
6. dorny/paths-filter = SOLO changed-files detection e language/checker activation; NON duplica la scope map; niente YAML intermedi
7. Gitleaks = CI scanner segreti universale; .gitleaks.toml esclude template-fixtures/**; scanning nativo = strato opzionale; secret di test = runtime-only, MAI committati
8. single_owner = default true → CODEOWNERS esiste ma il Ruleset NON richiede Code Owner approval (anti-deadlock)
9. Digest text ≤ 8 KiB AND ≤ 100 righe (indipendente da tokenizer)
10. Third-party actions = full commit SHA con commento "# vX.Y.Z"; mai tag mutabili
11. CI Gate = unico required check; if: always(); accetta success + skipped legittimi (da detection outputs espliciti); fallisce su failure/cancelled/unexpected skip
12. Bootstrap = fail-safe (fail if exists; zero operazioni distruttive); capability check concreto sui permessi (NO admin:org preventivo); gh version check su closingIssuesReferences con FAIL chiaro se incompatibile

## 2. FILE VIETATI
Mai creare: PROJECT_STATE.json, ROADMAP.md, STATUS.md, TASKS.md, PLAN.md

## 3. FUORI DALLA V1
NON implementare: Projects v2, Harden Runner, CodeQL obbligatorio, commit signing, GitHub App, composite actions/reusable workflows, cache CI universale, custom log framework, GraphQL custom, widget write-back. Dependency Review = modulo opzionale solo se il piano lo supporta, mai required.

## 4. STRUTTURA TARGET V1
README AGENTS CLAUDE DECISIONS SECURITY | copier.yml scope-map.json |
.github/(CODEOWNERS dependabot.yml labels.yml pull_request_template.md ruleset.json ISSUE_TEMPLATE/ workflows/) |
tools/(scope-guard agent-config-check project-status bootstrap) | checks/ | template-fixtures/
Profilo MCP opzionale: mcp/(server.mjs package.json package-lock.json README.md).

NOTA AUDIT: le directory extra ereditate (config/, schemas/, scripts/, .template/, release/, tools/validate/) NON vanno cancellate ora. Audit DOPO che ACC-01..29 sono verdi; rimuovere/consolidare solo ciò che resta inutilizzato.

## 5. SOURCE OF TRUTH
istruzioni agenti→AGENTS.md | decisioni→DECISIONS.md | task→Issues | scomposizione→sub-issues | blocker→dependencies | fase→Milestone | priorità→labels priority:* | in progress→Issue open+PR open | completamento→closed/merged | verifica→Checks | cronologia→Git | stato sintetico→Digest derivato

## 6. TOOL CUSTOM (esattamente 4)
scope-guard | agent-config-check | project-status (digestor REALE: gh --json, feature detection con fallback label, read-only) | bootstrap

L'adapter MCP non introduce un quinto tool autorevole: espone esclusivamente i
quattro tool/checker esistenti e gli orchestratori di preflight/release, senza
comandi arbitrari e con propagazione fail-closed degli exit status.

## 7. SEMANTICA DIGEST
DONE=closed | IN PROGRESS=open+PR open collegata | BLOCKED=blockedBy OR status:blocked | NEXT=open senza PR non blocked, ordine P0→P1→P2→none poi issue number | ATTENTION=check fallito OR conflitto OR status:attention | Progress=milestone closed/total; feature=sub-issues closed/total. Cache eventuale .cache/ gitignorata, non autorevole.

## 8. CONVENZIONI
Labels canoniche (.github/labels.yml): priority:P0/P1/P2, status:blocked, status:attention, type:feature/bug/task, scope:exception. VIETATE status:done/in-progress.
label-sync: action OSS pinnata SHA; sincronizza canoniche; NON elimina extra.
Dependabot: core, weekly grouped, ecosistemi solo se presenti.
Copier: `integration_mode=standalone|mcp`; default `standalone`; nessuna autodetection runtime.
Linking Issue↔PR: solo closing keyword nativa.
Issue Forms: Goal/Scope/Acceptance/Verify/Decision references.
PR template: Linked Issue/Primary Scope/Cross-scope/Justification/Verification.
Branching: 1 issue=1 branch=1 PR; da main aggiornato.

## 9. CI
Ordine: checkout→anti-rot→actionlint→zizmor→Gitleaks→paths detection→scope guard→language detection→static checks→test→build→test reporter→CI Gate.
Concurrency: PR cancel-in-progress true; main false.
Timeout: Linux static 10m, Linux test/build 20m, macOS Swift 30m, self-test 30m.
GITHUB_TOKEN default contents:read; elevazioni solo per-job.

## 10. ACCEPTANCE
ACC-01..29 = contratto eseguibile. ACC-19 verifica anche che Copier escluda i file MCP in modalità `standalone` e li includa in modalità `mcp`. acceptance/cases/ è la trascrizione eseguibile di questa SPEC, compilata SOLO da questa SPEC, commitata CONTESTUALMENTE a questo file. In caso di divergenza, SPEC-V1.md prevale.

## 11. REGOLE AGENTI
Leggi SPEC-V1.md prima di ogni modifica | non reimplementare esistente | no custom framework | tool prima della CI | test locali prima dell'integrazione | Bash set -euo pipefail ShellCheck-clean | YAML actionlint-clean | JSON jq-validabile | non conforme→STOP e segnala.

## 12. GOVERNANCE DELLA SPEC
- La SPEC è congelata. L'agente NON la modifica mai autonomamente.
- Miglioria individuata → NON implementata; scritta nel report di fase
  (cosa/perché/costo/valore/V1 o post-V1); esecuzione prosegue come da SPEC.
- Modifiche approvate solo dall'architetto (owner), in commit/PR dedicato,
  con version bump SPEC + ADR in DECISIONS.md.
- Deroghe senza nuova decisione ammesse SOLO per: errore tecnico concreto,
  incompatibilità GitHub reale, deadlock operativo, violazione single source
  of truth, alternativa plug-and-play chiaramente superiore.
  Anche in questi casi: l'agente segnala e attende istruzione.

## 13. MAPPE DERIVATE DEL REPOSITORY

⚠️ **NOTA IMPLEMENTAZIONE**: Questa sezione descrive il contratto delle mappe derivate
per V1.2. Le funzionalità specificate non sono ancora implementate. Lo stato attuale
è registrato in `acceptance/cases/ACC-24.md` attraverso `acceptance/cases/ACC-29.md`.
I comandi e le interfacce descritti qui sono vincolanti dal punto di vista del contratto,
ma non disponibili per l'uso fino al completamento della loro implementazione e verifica
dell'acceptance.

1. Il template espone tre alberi gerarchici read-only, percorsi dalla radice
   fino a ogni foglia disponibile senza profondità fissa:
   - `dependencies`: componenti e dipendenze dichiarate;
   - `ci`: flusso operativo contrattuale della sezione 9;
   - `status`: stato lavori secondo le semantiche della sezione 7.
   Quando la fonte contiene dati sufficienti, la gerarchia minima è
   radice→categoria→elemento→dettaglio. Nodi ripetuti sono riferimenti stabili;
   un ciclo è chiuso da un riferimento esplicito, mai attraversato di nuovo.
2. Ogni nodo e relazione deriva da una fonte Git-tracciata o GitHub esplicita:
   - `dependencies`: `scope-map.json` classifica i componenti; i `package.json`
     Git-tracciati espongono le chiavi dirette `dependencies`,
     `devDependencies`, `optionalDependencies`, `peerDependencies`; i
     `Package.resolved` Git-tracciati espongono i pin. `Package.swift`,
     `pyproject.toml`, `requirements*.txt`, `Cargo.toml` e `go.mod` sono
     riconosciuti come manifest ma, nella V1.2, mostrano esplicitamente
     `details unavailable` invece di essere analizzati;
   - `ci`: la sequenza normativa della sezione 9. È una vista del contratto,
     NON una DAG estratta dal workflow e NON ne dichiara la completezza;
   - `status`: gli stessi dati normalizzati, categorie, precedenze e limiti del
     Project Status Digest per Issue, PR, milestone, label e check GitHub.
   VIETATO inferire con un LLM dipendenze, comportamento semantico o relazioni
   non dimostrate. Una fonte riconosciuta ma non supportata è sempre indicata
   come non disponibile; l'omissione silenziosa è vietata.
3. `dependencies` e `ci` sono viste statiche derivate dall'HEAD. Possono essere
   committate solo nei blocchi generati delimitati del README; non sono source
   of truth. `status` è live e derivata da GitHub: mai committata, mai cache
   autorevole, mai contenuto persistente del README. Il README espone soltanto
   il comando e il collegamento alla vista di GitHub Actions. `live` significa
   snapshot read-only al momento del run, non sincronizzazione continua.
4. Restano esattamente quattro tool custom. Le mappe sono modalità di
   `project-status`; `agent-config-check` verifica la freschezza delle viste
   statiche. Vietati un quinto tool, servizi remoti, webhook, write-back e
   generatori LLM.
5. L'interfaccia è `project-status map TYPE FORMAT [--full] [--repo OWNER/REPO]`,
   con `TYPE=dependencies|ci|status` e `FORMAT=outline|mermaid`; `--repo` è
   ammesso solo per `status`. `outline` usa la radice letterale `repository` e
   due spazi UTF-8 per livello. `mermaid` usa `flowchart TD`, ID sequenziali
   `n0001...` e label
   tra doppi apici con escaping HTML di `&`, `"`, `<` e `>`; deriva dallo stesso
   albero ordinato ed è semanticamente equivalente. JSON non è un formato
   pubblico delle mappe. Le sostituzioni di label, in quest'ordine, sono
   `&`→`&amp;`, `"`→`&quot;`, `<`→`&lt;`, `>`→`&gt;`.
6. L'ordinamento è `LC_ALL=C`: scope, path, gruppo e nome per `dependencies`;
   sequenza della sezione 9 per `ci`; semantica della sezione 7, priorità,
   numero Issue e nome check per `status`. La visita è depth-first pre-order.
   A parità di input, ogni formato produce output byte-identico tra esecuzioni.
   Timestamp, path assoluti e dati ambientali sono vietati.
7. Le preview predefinite sono ≤ 8 KiB e ≤ 100 righe. Prima del rendering viene
   selezionato lo stesso prefisso di nodi per entrambi i formati e aggiunta una
   foglia `omitted N`; l'omissione silenziosa è vietata. `--full` conserva lo
   stesso ordine senza il limite preview ed è vietato nel README e nei job
   summary.
8. Il README usa esattamente le coppie di marker
   `<!-- repository-map:dependencies:start -->` /
   `<!-- repository-map:dependencies:end -->` e
   `<!-- repository-map:ci:start -->` / `<!-- repository-map:ci:end -->`;
   ciascun blocco contiene Mermaid e outline generati dallo stesso albero. Su
   ogni PR,
   `agent-config-check` rigenera le viste in area temporanea e le confronta
   byte-per-byte. Marker mancanti, duplicati, malformati o contenuto obsoleto
   causano FAIL; nessun file viene modificato. `CI Gate` resta l'unico required
   check.
9. Project Status Refresh pubblica le preview correnti di tutte e tre le mappe
   nel job summary per `push`, create/delete di branch, dispatch manuale, PR
   opened/synchronize/reopened/closed/ready-for-review/converted-to-draft/
   edited/labeled/unlabeled, Issue opened/reopened/closed/labeled/unlabeled/
   milestoned/demilestoned e completamento del workflow `CI`. `status` resta
   soltanto nel job summary. Workflow e tool operano con permessi read-only e
   non eseguono auto-commit o write-back.
10. Copier trasferisce generatori, controlli, workflow e blocchi README in
   modalità `standalone` e `mcp`. Ogni repository figlio deriva le mappe solo
   dal proprio HEAD e stato GitHub; vietati riferimenti cablati al template e
   persistenza dello stato live durante `copier update`.
11. Le mappe non sostituiscono codice, manifest, workflow, Issue, PR, Checks,
    DECISIONS.md o Project Status Digest. Nessuna mappa è fonte autorevole e
    nessun file vietato dalla sezione 2 viene introdotto.
