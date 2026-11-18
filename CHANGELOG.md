# Changelog

## Unreleased

- Hook di riassunto CI sulla PR (`pr-ci-report.yml`): commento unico e aggiornabile
  con esito dei gate, estratto dei log falliti e file toccati.
- Auto-merge in opt-in (`auto-merge-when-green.yml`): squash merge via API REST
  solo sulle PR con etichetta `automerge` e tutti i gate verdi.
- Deploy Cloudflare Pages parametrico: domande copier `is_website`, `site_dir` e
  `cloudflare_project`; i workflow Pages esistono solo per i progetti con sito.
- Initial template
