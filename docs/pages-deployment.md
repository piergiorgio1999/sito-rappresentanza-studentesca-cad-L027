# Pubblicazione Cloudflare Pages

Il sito versionato in `site/` e le Pages Functions in `functions/` vengono distribuiti al progetto esistente `orari-chimica` quando un push arriva su `main`. Le PR non pubblicano sul dominio di produzione. Prima del deploy GitHub Actions applica le migrazioni D1.

## Secrets richiesti

In GitHub apri **Settings → Secrets and variables → Actions** e aggiungi:

- `CLOUDFLARE_ACCOUNT_ID`: ID dell'account Cloudflare che contiene il progetto Pages.
- `CLOUDFLARE_API_TOKEN`: token API con permesso **Account → Cloudflare Pages → Edit**, limitato a questo account e con scadenza compatibile con la manutenzione del deploy.

Non inserire i valori nei file del repository, nei commit o nei log. Dopo aver salvato entrambi i secrets, avvia la prima pubblicazione da **Actions → Deploy Orari Chimica to Cloudflare Pages → Run workflow**. In seguito ogni push che modifica sito, funzioni, migrazioni o configurazione avvia il deploy.

## Flusso di aggiornamento

1. Codex e Claude lavorano sul repository GitHub seguendo `AGENTS.md`, ciascuno su branch dedicati.
2. Le modifiche passano da Issue e PR; non modificare la copia interna di Sites come fonte alternativa.
3. Dopo il merge su `main`, GitHub Actions carica `site/` sul progetto `orari-chimica`.

Cloudflare non permette di convertire un progetto Pages esistente da Direct Upload a Git integration. Il workflow usa quindi Wrangler per il deploy da GitHub Actions.

## Area amministratore

Configura questi valori in **Cloudflare Dashboard → Workers & Pages → orari-chimica → Settings → Variables and Secrets → Production**. I tre valori seguenti sono secrets e non devono essere salvati in Git:

- `ADMIN_PASSWORD`: scegli una password nuova. Non riutilizzare password inviate in chat o già divulgate.
- `ADMIN_SESSION_SECRET`: genera un valore casuale distinto (ad esempio `openssl rand -base64 32`).
- `GITHUB_ISSUES_TOKEN`: token fine-grained per questo repository, con permesso **Issues: Read and write**. GitHub riceve le annotazioni come Issues pubbliche.

L'email amministratore è impostata nel codice del sito. La sessione usa un cookie sicuro HttpOnly e ogni endpoint amministrativo verifica la sessione sul server. Le annotazioni sono visibili pubblicamente su GitHub; il sito mostra e crea annotazioni solo attraverso l'API autenticata. Orari e appelli salvati dall'admin sono persistiti nella D1 `orari-chimica-db` e forniti a tutti i visitatori.

Le modifiche puntuali agli orari si salvano dal dialogo della lezione spuntando **Salva questa modifica per tutti gli utenti**. La scheda admin contiene anche editor JSON per le modifiche orario e la tabella degli appelli. Le modifiche locali dello studente restano nel browser.
