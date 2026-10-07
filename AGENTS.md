# AGENTS.md

## Source of truth

GitHub è la sola fonte autorevole dello stato del progetto.

Non creare file di stato locali.

Non aggiornare manualmente roadmap, task list o status.

## Prima di lavorare

Prima di qualsiasi modifica, leggi `SPEC-V1.md`.

Leggi nell'ordine:

1. Project Status Digest
2. Issue assegnata
3. PR collegata (se presente)
4. DECISIONS.md
5. File realmente coinvolti

Non effettuare scansioni massive del repository salvo richiesta esplicita.

## Decisioni

Le decisioni permanenti vivono esclusivamente in DECISIONS.md.

Le Issue devono referenziare le decisioni.

Mai duplicare la rationale.

## Scope

Una PR modifica un solo functional scope.

shared/core è consentito solo se dichiarato.

File non classificati:

FAIL.

Prima del push di una PR, esegui `tools/scope-guard/scope-guard origin/main`
sul commit di branch. Se fallisce, non inviare la PR alla CI.

## Stato progetto

Usa sempre Project Status Digest.

Mai ricostruire manualmente lo stato leggendo commit, branch o cronologia.

## Digest

Il digest è READ ONLY.

Non modificarlo.

Non salvarlo come stato permanente.

## Tool

Usare prima i controlli deterministici.

Ricorrere al modello LLM solo quando i controlli automatici non sono sufficienti.

Ogni bug concreto osservato durante il lavoro deve essere registrato come
GitHub Issue con riproduzione ed evidenza minima. Non creare registri locali,
file di bug o task list parallele.

## Disciplina di osservazione

Usare sempre il livello minimo che consente di determinare `WAIT`, `FIX` o
`PASS`; fermarsi appena la diagnosi è determinata:

- L0 — stato deterministico locale: Project Status Digest e repository locale.
- L1 — stato GitHub strutturato compatto: numero PR, `statusCheckRollup` e stato merge.
- L2 — evidenza di esecuzione mirata: metadati del job fallito e step fallito.
- L3 — evidenza grezza: log completi, commenti e cronologia.

Iniziare da L0 e passare al livello successivo solo se quello corrente non è
sufficiente. Preferire campi strutturati ai commenti. Non usare i commenti PR
come source of truth, non leggere la cronologia completa per una diagnosi e non
caricare log completi senza avere prima identificato un check fallito.

Se a L1 un check è `IN_PROGRESS`, terminare con
`WAIT: external check incomplete` senza leggere commenti, commit o log.

## Merge delle PR

Prima di effettuare il merge, un agente legge il commento aggiornabile di
`PR Verification` riferito all'head SHA corrente della PR.

- `SQUASH MERGE` → usa Squash and merge.
- `REBASE MERGE` → usa Rebase and merge.
- `MERGE COMMIT` → usa Create a merge commit.
- `WAIT` → non effettuare il merge; risolvi prima il blocco riportato.

Un agente non sostituisce questa scelta con una propria preferenza. Il merge
richiede inoltre `PR Verification` e `CI Gate` verdi sull'head SHA corrente.

Dopo un merge riuscito, l'agente non si ferma a un report di stato: aggiorna
`main`, rilegge il Project Status Digest e prosegue con il prossimo task
autorizzato, salvo blocco reale o richiesta esplicita di pausa.

Quando l'agente si ferma, deve dichiarare esplicitamente il motivo e indicare
che cosa serve all'utente, distinguendo tra azione richiesta, decisione
richiesta, informazione mancante o nessun intervento necessario.
