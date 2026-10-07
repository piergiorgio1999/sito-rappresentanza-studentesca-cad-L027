# Architectural Decisions

Le decisioni permanenti vivono qui.

Le Issue devono referenziare le decisioni.

Non duplicare la rationale nelle Issue.

## 2026-08-09 — Attivazione anticipata dei checker per linguaggio

I checker in `checks/*/check.sh` erano dichiarati "Dormant" /
"Implementation is intentionally deferred". Decisione: attivarli ora
invece di aspettare, cablando tool OSS standard per linguaggio
(shellcheck, go vet + gofmt, ruff, cargo clippy, tsc + eslint, swift
build) e rendendo reali i job `detect` (rilevamento manifest) e
`security` (gitleaks, actionlint, zizmor) in `.github/workflows/ci.yml`.

Ogni check resta un no-op (exit 0) se il manifest del linguaggio non
è presente, quindi è sicuro anche su repository generati che non
usano tutti i linguaggi.

## 2026-08-09 — zizmor advisory temporaneo durante la remediation del debito

L'attivazione di zizmor (decisione precedente) ha reso rosso `main`:
43 finding preesistenti nei workflow GitHub esistenti (15 high, 10
medium, 4 low — es. action non pinnate a hash, permessi troppo ampi,
`persist-credentials` non disattivato), non causati dal lavoro che ha
attivato il check ma debito preesistente rivelato per la prima volta.

Decisione: portare `main` verde con una modifica minima e temporanea
allo step `Zizmor` in `.github/workflows/ci.yml` — aggiunta di
`continue-on-error: true` solo su quello step. zizmor resta attivo e
visibile nei log (nessun finding viene ignorato, filtrato o
soppresso); diventa temporaneamente advisory (non blocca il job
`security` né il gate) fino al completamento della remediation dei 43
finding preesistenti, tracciata in issue di follow-up. I workflow che
generano i finding non vengono modificati in questa decisione — la
remediation è un lavoro separato, a scope singolo (`github`).

Al termine della remediation, rimuovere `continue-on-error: true` dallo
step `Zizmor` e ripristinare zizmor come blocking.

## 2026-08-09 — Remediation completata, zizmor torna blocking

Remediation dei 43 finding preesistenti (issue #8) completata in tutti
i workflow (`.github/workflows/ci.yml`, `label-sync.yml`,
`checker-selftest.yml`) e in `.github/dependabot.yml`: azioni pinnate
a hash di commit (con commento `# vX`), `permissions` minimi espliciti
per job, `persist-credentials: false` su ogni `actions/checkout`,
rimossa l'interpolazione diretta di `github.base_ref` in uno `run:`
(passata via `env:`), aggiunto `cooldown.default-days: 7` alle regole
Dependabot. `zizmor .` risulta pulito (0 finding).

Rimosso `continue-on-error: true` dallo step `Zizmor`: torna blocking
come da piano di rientro della decisione precedente.

## 2026-08-10 — Metodo di merge scelto dal Merge Advisor

Gli agenti usano il metodo indicato dal commento aggiornabile di `PR
Verification` per l'head SHA corrente: squash, rebase oppure merge commit.
`WAIT` impedisce il merge fino alla risoluzione del blocco. La scelta resta
diagnostica e non introduce un secondo required check: `CI Gate` rimane
l'unico check obbligatorio previsto da SPEC-V1.

## 2026-08-10 — Profilo MCP opzionale incluso nella V1.1

La V1.1 include un profilo Copier opzionale `mcp`, mentre `standalone` resta il
default. La scelta avviene alla generazione, senza autodetection runtime. Il
profilo MCP usa un server locale stdio e può soltanto esporre i checker e gli
orchestratori deterministici già autorevoli; non introduce una seconda source
of truth, comandi arbitrari, webhook, servizi remoti o pubblicazione automatica.

La decisione riallinea la specifica al core MCP approvato e già integrato in
`main`. Il server MCP è un adapter e non modifica il contratto dei quattro tool
custom definiti dalla SPEC.

## 2026-08-10 — Esecuzione SwiftPM e Xcode separata su macOS

Il percorso Swift della CI usa un job macOS con timeout di 30 minuti. Un
package Swift esegue `swift test`. La presenza di un container Xcode attiva il
controllo Xcode, che produce uno skip esplicito e legittimo se la variabile
repository `XCODE_SCHEME` non è configurata.

Quando `XCODE_SCHEME` è presente, il checker esegue `xcodebuild test`. Le
variabili repository opzionali `XCODE_PROJECT`, `XCODE_WORKSPACE` (mutuamente
esclusive) e `XCODE_DESTINATION` selezionano il container e la destinazione;
senza container esplicito è ammesso un package Swift. Configurazioni presenti
ma invalide falliscono chiuso e propagano il fallimento a `CI Gate`.

## 2026-08-10 — Ruleset non disponibile: fail-closed

Il bootstrap non degrada silenziosamente quando l'API Ruleset non è
disponibile per il repository/account. Un errore di capability o permesso
termina il bootstrap; non vengono emessi warning+skip e non si prosegue come
se la protezione fosse stata applicata. Questo preserva il contratto di
protezione del branch anche su GitHub Free privato.

## 2026-08-11 — Project Status capability fallback

Se la CLI GitHub non espone `closingIssuesReferences`, Project Status non
ricostruisce una versione diversa del digest e non si interrompe senza
diagnosi: emette un warning esplicito e usa il fallback deterministico basato
su label e stato della PR. Il comportamento resta read-only.

## 2026-08-11 — Diagnosi CI opt-in in Project Status

`project-status diagnose` estende il digest read-only con errori CI compatti
solo per le PR aperte che hanno check falliti sull'head corrente. Il comando
deriva automaticamente i run, legge soltanto i job falliti e non richiede un
run ID. La modalità standard resta invariata; non nasce un quinto tool né una
nuova source of truth.

## 2026-08-11 — Escalation minima dell'evidenza diagnostica

Le diagnosi agentiche seguono livelli deterministici L0–L3 e si fermano al
primo livello che determina `WAIT`, `FIX` o `PASS`. Stato locale e digest
precedono i campi GitHub strutturati; metadati mirati del fallimento precedono
log, commenti e cronologia. Questo riduce chiamate API e contesto senza creare
nuovi tool o source of truth e senza modificare la semantica della CI.

## 2026-08-11 — CI Gate come macchina a stati deterministica

La topologia dei checker è dichiarata una volta nel `needs` di `CI Gate`; il
Gate legge nativamente `needs` e la mappa di applicabilità prodotta da
`detect`, senza lista duplicata né parsing del workflow. Per ciascun checker:
PASS equivale esclusivamente a `applicable=true,result=success` oppure
`applicable=false,result=skipped`. Stati mancanti, ignoti, cancellati o
incoerenti falliscono chiuso.

Il linking nativo Issue/PR è un checker a monte del Gate: per PR umane richiede
una sola `closingIssuesReferences`; solo `dependabot[bot]` è nell'allowlist
statica. Il job `pr-verification` resta reporting post-Gate e non sostituisce
`CI Gate` come unico required check.

## 2026-08-11 — Override: detection Swift/Xcode deterministica

Questa decisione sostituisce soltanto la semantica di detection/toolchain della
decisione "Esecuzione SwiftPM e Xcode separata su macOS": `Package.swift`
abilita SwiftPM; `*.xcodeproj` o `*.xcworkspace` abilita Xcode; `*.swift` da
solo non abilita un checker Swift. Un container Xcode rilevato senza
`XCODE_SCHEME` è applicabile ma incompleto e fallisce chiuso, non è uno skip.

## 2026-08-12 — Mappe derivate statiche e live del repository

La V1.2 introduce tre viste gerarchiche read-only: dipendenze dichiarate,
flusso operativo/CI verificabile e stato lavori GitHub.

Le viste dipendenze e CI sono statiche rispetto all'HEAD, possono comparire
soltanto in blocchi generati del README e sono protette da un controllo
deterministico di freschezza. La vista dello stato è live, deriva dalle stesse
fonti e semantiche di Project Status e non viene mai committata: il README
rimanda al comando e al job summary corrente.

Le mappe sono esposte da `project-status` nei formati testuali `outline` e
`mermaid`; `agent-config-check` controlla i blocchi statici. Restano quindi
esattamente quattro tool custom. Non vengono introdotti generatori LLM,
servizi remoti, webhook, write-back o nuove fonti di verità.

Questa separazione conserva GitHub come unica source of truth persistente e
permette ai repository generati da Copier di ottenere le stesse viste senza
riferimenti cablati al template. Sono escluse dalla V1.2 l'inferenza automatica
del significato del codice, i call graph presunti e la topologia non
dimostrabile con le fonti supportate. In particolare, la mappa CI rappresenta
la sequenza contrattuale della SPEC e non pretende di estrarre la DAG YAML. La
mappa dipendenze analizza soltanto manifest JSON esplicitamente supportati e
segnala gli altri manifest riconosciuti come non disponibili.
