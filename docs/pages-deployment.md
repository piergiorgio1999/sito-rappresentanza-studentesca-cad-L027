# Pubblicazione Cloudflare Pages

Il sito statico versionato in `site/` viene distribuito al progetto esistente `orari-chimica` quando un push arriva su `main`. Le PR non pubblicano sul dominio di produzione.

## Secrets richiesti

In GitHub apri **Settings → Secrets and variables → Actions** e aggiungi:

- `CLOUDFLARE_ACCOUNT_ID`: ID dell'account Cloudflare che contiene il progetto Pages.
- `CLOUDFLARE_API_TOKEN`: token API con permesso **Account → Cloudflare Pages → Edit**, limitato a questo account e con scadenza compatibile con la manutenzione del deploy.

Non inserire i valori nei file del repository, nei commit o nei log. Dopo aver salvato entrambi i secrets, avvia la prima pubblicazione da **Actions → Deploy Orari Chimica to Cloudflare Pages → Run workflow**. In seguito ogni push che modifica `site/` o il workflow avvia il deploy.

## Flusso di aggiornamento

1. Codex e Claude lavorano sul repository GitHub seguendo `AGENTS.md`, ciascuno su branch dedicati.
2. Le modifiche passano da Issue e PR; non modificare la copia interna di Sites come fonte alternativa.
3. Dopo il merge su `main`, GitHub Actions carica `site/` sul progetto `orari-chimica`.

Cloudflare non permette di convertire un progetto Pages esistente da Direct Upload a Git integration. Il workflow usa quindi Wrangler per il deploy da GitHub Actions.
