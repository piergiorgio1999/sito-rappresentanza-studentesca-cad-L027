# API dei parametri della mappa 3D (`/api/mappa-3d`)

Questa API permette di modificare i parametri geometrici della scena 3D del campus
(`site/campus-3d/`) **senza push su git**: il sito pubblico li legge a ogni caricamento
tramite `overrides.js` e li applica ai moduli 3D.

- Endpoint: `https://orari-chimica.pages.dev/api/mappa-3d`
- Editor umano equivalente: `https://orari-chimica.pages.dev/campus-3d/editor.html`

## Prima di tutto: il token è una credenziale

**Il token di scrittura va chiesto al proprietario del sito e non va mai scritto in
questo file, né in un repository, né in un'URL.** Viaggia solo nell'header
`Authorization` di una richiesta HTTPS.

Che cosa permette, in concreto, a chi lo possiede:

- **scrivere i parametri della mappa 3D** del sito pubblico (`PUT /api/mappa-3d`,
  `POST /api/mappa-3d/restore`): chiunque visiti il sito vede subito il risultato;
- **far scrivere il file `site/campus-3d/overrides.json` sul repository GitHub**
  (`POST /api/mappa-3d/publish`): un commit sul ramo `main`, a nome dell'account
  proprietario del token GitHub configurato sul server.

Quindi va trattato come una password, non come un parametro di configurazione:

- non incollarlo in pagine pubbliche, artifact condivisi, issue, chat di gruppo,
  screenshot o log; non committarlo in nessun repository;
- passalo solo da variabile d'ambiente (`$MAPPA3D_TOKEN`) e solo su HTTPS;
- se una IA lavora con questo token, il token resta nell'ambiente di chi la esegue:
  non va riportato nelle risposte, nei riepiloghi o nel codice che produce;
- **per revocarlo** basta cambiare il segreto `ADMIN_SECRET` nella dashboard
  Cloudflare Pages del progetto: il vecchio token smette di funzionare subito
  (e con esso decadono anche le sessioni dell'editor, che sono firmate con quel segreto).

Il token GitHub usato da `/publish` è un segreto **separato** (`GITHUB_TOKEN`), vive
solo sul server Cloudflare, non viene mai restituito da nessun endpoint e non è
raggiungibile dal browser. Si revoca da GitHub e si sostituisce nella dashboard Pages.

L'endpoint `/publish` può scrivere **un solo percorso**, `site/campus-3d/overrides.json`,
sul solo ramo `main`: percorso, repository e ramo sono costanti nel codice del server e
nessun parametro della richiesta può cambiarli.

## Metodi

| Metodo | Autenticazione | Effetto |
| --- | --- | --- |
| `GET` | nessuna (pubblico) | restituisce `{"overrides": {...}, "updated_at": N}`; `N` è l'epoch in secondi dell'ultimo salvataggio, `0` se non è mai stato salvato nulla. Risposta con `Cache-Control: public, max-age=30`. |
| `PUT` | `Authorization: Bearer <token>` | sostituisce **tutto** lo stato con il corpo `{"overrides": {...}}` e restituisce il nuovo stato. Non è una modifica parziale: chi scrive deve prima fare `GET`, modificare l'oggetto e rimandarlo intero. |
| `OPTIONS` | nessuna | preflight CORS (`Access-Control-Allow-Origin: *`, header `Authorization` e `Content-Type` ammessi). |
| altri | — | `405` con `{"error": "..."}`. |

Header facoltativo `X-Editor: <nome>` su tutte le scritture: firma la versione nello
storico (massimo 40 caratteri, ripulito dai caratteri di controllo). Se manca, l'autore
registrato è `sconosciuto`.

Le scritture accettano **o** `Authorization: Bearer <token>` (script e modelli) **o** il
cookie di sessione dell'editor (browser, dopo il login): vedi «Accesso all'editor».

### Storico delle versioni

Ogni salvataggio è una **riga nuova**: niente viene sovrascritto. Lo storico tiene le
ultime 500 versioni; le più vecchie vengono eliminate.

| Metodo e percorso | Autenticazione | Effetto |
| --- | --- | --- |
| `GET /api/mappa-3d/versions` | nessuna (pubblico) | `{"versions":[{"id":N,"created_at":N,"author":"...","bytes":N}, …],"limit":50}`, dalla più recente. **Senza** il corpo JSON delle versioni. |
| `GET /api/mappa-3d/versions/<id>` | nessuna (pubblico) | `{"id":N,"created_at":N,"author":"...","overrides":{...}}`; `404` se l'id non esiste. |
| `POST /api/mappa-3d/restore` | Bearer o sessione | corpo `{"id":N}`: rilegge la versione `N` e la riscrive come **nuova** versione in cima (ripristino per append, non si perde nulla). Risponde `{"overrides":{...},"restored_from":N,"id":M,"updated_at":N,"author":"..."}`. |
| `POST /api/mappa-3d/publish` | Bearer o sessione | fa un commit su `main` che scrive **solo** `site/campus-3d/overrides.json` con l'ultima versione salvata. Risponde `{"ok":true,"path":"…","branch":"main","bytes":N,"commit_sha":"…","commit_url":"https://github.com/…"}`; `503 {"error":"GITHUB_TOKEN non configurato"}` se il segreto manca. |

Tutte le scritture rifiutano corpi oltre 64 KB.

Gli errori sono sempre JSON: `{"error": "descrizione"}` con status `400` (JSON o valori non
validi, oltre 64 KB), `401` (token assente o sbagliato), `405`, `500`/`503`.

## Schema del JSON

```json
{
  "overrides": {
    "ingresso": { "H_PILLAR": 12.9, "BAYS": 7 },
    "interno":  { "U_MAX": 48, "BLOCKS": [-38.9, -10, 8, 2.4, -57.4, -9.5, 7, 2.6] }
  }
}
```

Regole:

- `overrides` è un oggetto; le sue chiavi sono i **moduli**: `ingresso`, `interno` e `raccordo`.
- ogni modulo è un oggetto `NOME_PARAMETRO → valore`.
- un valore può essere solo: numero, booleano, stringa (max 200 caratteri) o array di
  numeri (max 400 elementi). **Niente oggetti annidati, niente funzioni.**
- un parametro assente usa il valore di default: con `{"overrides": {}}` la scena è
  identica alla versione pubblicata su git.
- l'intero JSON serializzato deve stare sotto 64 KB.

Le unità sono metri nel sistema locale del modulo: `u` è la coordinata lungo l'asse del
colonnato, `v` la coordinata verso il piazzale (positiva davanti al colonnato, negativa
verso l'interno della Città Universitaria), le altezze sono da terra.

## Parametri del modulo `ingresso`

File: `site/campus-3d/ingresso-aldo-moro.js` (ingresso monumentale di Piazzale Aldo Moro,
i Propilei).

| Parametro | Significato | Default |
| --- | --- | --- |
| `U_MID` | scorrimento del modello lungo l'asse del colonnato | `2.1` |
| `V_MID` | scorrimento del modello perpendicolare all'asse | `-0.6` |
| `L` | lunghezza totale del colonnato lungo l'asse | `87.6` |
| `END` | lunghezza di ciascuno dei due corpi pieni in mattoni | `15` |
| `BAYS` | numero di campate aperte tra i due corpi | `7` |
| `H_PILLAR` | altezza dei pilastri | `12.4` |
| `H_TOT` | altezza totale con l'attico | `15.6` |
| `H_BLOCK` | altezza dei due corpi in mattoni | `15.6` |
| `V_FRONT` | filo anteriore di attico e pilastri | `5.1` |
| `V_BACK` | filo posteriore dell'attico | `-2.9` |
| `BLOCK_FRONT` | filo anteriore dei corpi in mattoni | `4.4` |
| `BLOCK_BACK` | filo posteriore dei corpi in mattoni | `-6.1` |
| `CU` | asse dell'isola centrale delle aiuole | `0` |
| `CC` | asse del colonnato per le aiuole laterali | `0` |
| `SL` | inizio delle aiuole davanti al filo dei pilastri | `V_FRONT + 0.6` (cioè `5.7`) |
| `PROF` | profondità dell'isola centrale verso il piazzale | `25` |
| `RIBBONS` | nastri di aiuola laterali, array piatto di **7 numeri per nastro**: `d, p1u, p1v, p2u, p2v, w0, w1` | `[12.34, 14.0, 13, 24.5, 22.8, 2.7, 2.2, 20.57, 22.0, 11, 37.0, 19.6, 2.7, 2.2]` |
| `DISC` | centro del tondo dell'aiuola centrale, array di 2 numeri `[u, v]` | `[CU, SL + 15]` (cioè `[0, 20.7]`) |
| `BAL_Y` | quota delle balconate nelle campate | `5.8` |
| `BAL_V` | posizione in `v` delle balconate | `V_FRONT - 0.35` (cioè `4.75`) |
| `BAL_H` | altezza del parapetto delle balconate | `1.05` |
| `DRAPPO_W` | larghezza dei drappi | `2.6` |
| `DRAPPO_H` | altezza dei drappi | `4.2` |
| `DRAPPO_TOP` | quota dell'asta dei drappi | `H_PILLAR - 0.8` (cioè `11.6`) |
| `DRAPPO_V` | posizione in `v` dei drappi | `V_FRONT - 2.3` (cioè `2.8`) |

`BAL`, `DRAPPO` e `RIBBONS` nel codice sono oggetti: qui sono esposti come parametri
scalari (`BAL_Y`…) o come array piatto di numeri, perché l'API non accetta oggetti annidati.

## Parametri del modulo `interno`

File: `site/campus-3d/interno-aldo-moro.js` (viale e parcheggi dietro il colonnato).

| Parametro | Significato | Default |
| --- | --- | --- |
| `U_MID` | scorrimento del modello lungo l'asse | `2.1` |
| `V_MID` | scorrimento del modello perpendicolare all'asse | `-0.6` |
| `V_NEAR` | inizio dell'area modellata, dal retro del colonnato | `-6.1` |
| `V_FAR` | fine dell'area modellata verso l'interno | `-78` |
| `U_MAX` | semilarghezza dell'area modellata | `46` |
| `ROAD_L` | cordolo sinistro della carreggiata centrale | `15.7` |
| `ROAD_R` | cordolo destro della carreggiata centrale | `-16` |
| `FACADE_L` | filo della facciata del palazzo di sinistra | `32.5` |
| `FACADE_R` | filo della facciata del palazzo di destra | `-30.5` |
| `BLD_V0` | inizio in `v` dei due palazzi | `-8.5` |
| `BLD_V1` | fine in `v` dei due palazzi | `-67` |
| `BLD_H` | altezza dei due palazzi | `23.4` |
| `ZOC` | altezza dello zoccolo dei palazzi | `1.2` |
| `STALL_D` | profondità di uno stallo di parcheggio | `5.2` |
| `BLOCKS` | blocchi di stalli, array piatto di **4 numeri per blocco**: `v` (inizio lato interno), `u0` (primo stallo), `n` (numero di stalli), `w` (larghezza) | `[-38.9, -10, 8, 2.4, -57.4, -9.5, 7, 2.6]` |
| `ROW3_U0` | inizio in `u` della fila di tre stalli sopra la prima aiuola | `-4.9` |
| `ROW3_U1` | fine in `u` della stessa fila | `4.9` |
| `ROW3_V0` | inizio in `v` della stessa fila | `-18.4` |
| `ROW3_V1` | fine in `v` della stessa fila | `-13.5` |

`BLOCKS` e `ROW3` nel codice sono oggetti: qui sono un array piatto di numeri e quattro
parametri scalari, perché l'API non accetta oggetti annidati.

## Parametri del modulo `raccordo`

File: `site/campus-3d/raccordo-asfalto.js` (asfalto che riempie i vuoti fra il piazzale
interno, lo stradone Chimica–Fisica e il piazzale della vasca della Minerva).

Stesso riferimento locale del modulo `interno`: `u` lungo l'asse del colonnato, `v`
negativa verso l'interno della Città Universitaria. Il piano sta sotto tutte le altre
superfici, quindi si vede solo dove non c'è già nulla: allargare un riquadro non copre
prati, marciapiedi, aiuole o vasca, ma può far comparire asfalto dove c'era il terreno.

| Parametro | Significato | Default |
| --- | --- | --- |
| `U_MID` | scorrimento del riferimento lungo l'asse (come nel modulo `interno`) | `2.1` |
| `V_MID` | scorrimento del riferimento perpendicolare all'asse | `-0.6` |
| `Y` | quota del piano, sotto le altre pavimentazioni | `0.004` |
| `V_A0` | inizio del riquadro di giunzione col piazzale interno (sotto il suo asfalto) | `-74` |
| `V_A1` | fine dello stesso riquadro, verso lo stradone | `-98` |
| `W_A` | semilarghezza dello stesso riquadro | `46` |
| `V_B1` | fine in `v` delle due fasce laterali lungo lo stradone | `-156` |
| `B_U0` | bordo interno delle due fasce (entra sotto i prati dello stradone) | `22` |
| `B_U1` | bordo esterno delle due fasce | `46` |
| `V_C1` | fronte della vasca della Minerva: fine del riquadro a tutta larghezza | `-188` |
| `V_C2` | fine delle due ali di fianco alla vasca | `-206` |
| `W_C` | semilarghezza del piazzale della Minerva | `42` |
| `C_USX` | bordo destro dell'ala sinistra: oltre c'è la vasca con l'acqua | `-19` |
| `C_UDX` | bordo sinistro dell'ala destra | `26` |
| `TILE` | lato in metri della piastrella di texture dell'asfalto | `32` |
| `COL_1` | colore di fondo dell'asfalto | `"#55565a"` |
| `COL_2` | colore dei granuli scuri | `"#45464a"` |

La zona di rispetto degli alberi OSM corrispondente è nei riquadri `RACCORDO` di
`buildTrees()` in `campus-3d.js`: se si spostano molto questi parametri va aggiornata
anche quella, altrimenti ricompaiono alberi sull'asfalto.

## Esempi

Lettura (pubblica):

```bash
curl -s https://orari-chimica.pages.dev/api/mappa-3d
```

Scrittura (il token va chiesto al proprietario e passato da variabile d'ambiente, mai
incollato in un file):

```bash
curl -s -X PUT https://orari-chimica.pages.dev/api/mappa-3d \
  -H "Authorization: Bearer $MAPPA3D_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"overrides":{"ingresso":{"H_PILLAR":12.9,"BAYS":7},"interno":{"U_MAX":48}}}'
```

Azzeramento di tutti i parametri (la scena torna ai default del repository):

```bash
curl -s -X PUT https://orari-chimica.pages.dev/api/mappa-3d \
  -H "Authorization: Bearer $MAPPA3D_TOKEN" \
  -H 'Content-Type: application/json' -d '{"overrides":{}}'
```


Elenco delle versioni e lettura di una versione (pubbliche):

```bash
curl -s https://orari-chimica.pages.dev/api/mappa-3d/versions
curl -s https://orari-chimica.pages.dev/api/mappa-3d/versions/42
```

Salvataggio firmato con il proprio nome:

```bash
curl -s -X PUT https://orari-chimica.pages.dev/api/mappa-3d \
  -H "Authorization: Bearer $MAPPA3D_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Editor: Piergiorgio' \
  -d '{"overrides":{"ingresso":{"H_PILLAR":12.9}}}'
```

Ripristino della versione 42 (diventa la versione più recente, la 42 resta nello storico):

```bash
curl -s -X POST https://orari-chimica.pages.dev/api/mappa-3d/restore \
  -H "Authorization: Bearer $MAPPA3D_TOKEN" \
  -H 'Content-Type: application/json' \
  -H 'X-Editor: Piergiorgio' -d '{"id":42}'
```

Pubblicazione su git dell'ultima versione salvata:

```bash
curl -s -X POST https://orari-chimica.pages.dev/api/mappa-3d/publish \
  -H "Authorization: Bearer $MAPPA3D_TOKEN" \
  -H 'X-Editor: Piergiorgio'
```

## Accesso all'editor (nome utente e password)

L'editor `/campus-3d/editor.html` non è raggiungibile liberamente: la pagina è uno
scheletro vuoto che all'avvio chiama `GET /api/editor-auth/me` e, senza sessione valida,
rimanda a `/campus-3d/login.html` senza mostrare nulla.

| Metodo e percorso | Effetto |
| --- | --- |
| `POST /api/editor-auth` | corpo `{"user":"...","password":"..."}`. In caso di successo imposta il cookie di sessione `mappa3d_sess` (`HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`, cioè 8 ore), firmato HMAC-SHA256 con `ADMIN_SECRET`. In caso di fallimento: `401 {"error":"nome utente o password non validi"}` — la risposta non dice mai quale dei due è sbagliato — con un ritardo fisso di circa 250 ms. |
| `GET /api/editor-auth/me` | `{"ok":true,"user":"..."}` se la sessione è valida, `401` altrimenti. |
| `POST /api/editor-auth/logout` | svuota il cookie. |

Variabili d'ambiente (dashboard Cloudflare Pages, **mai** nel repository):

- `EDITOR_USER` — nome utente ammesso; se non impostata vale `Piergiorgio`.
- `EDITOR_PASSWORD_HASH` — hash PBKDF2-SHA256 con sale, formato
  `pbkdf2$<iterazioni>$<sale_b64>$<hash_b64>`, almeno 100000 iterazioni.
  **Se non è impostata il login risponde `503 {"error":"login non configurato"}`:
  non esiste nessuna password predefinita, nessun fallback e nessun bypass.**
- `ADMIN_SECRET` — chiave con cui si firma il cookie (lo stesso segreto del Bearer).

### Come generare `EDITOR_PASSWORD_HASH`

**La password non va mai scritta nel repository, che è pubblico**, né in un file, né in
un commit, né in una issue, né in questo documento. Lo script qui sotto la chiede da
terminale (senza mostrarla a schermo) e stampa solo la stringa da incollare nel segreto
Cloudflare. Salva lo script fuori dal repository, per esempio in `/tmp/hash.js`, ed
eseguilo con `node /tmp/hash.js`:

```js
/* Genera EDITOR_PASSWORD_HASH per /api/editor-auth. Non salva nulla su disco. */
const crypto = require('node:crypto');
const readline = require('node:readline');

const ITERATIONS = 200000, KEYLEN = 32;

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const onData = (char) => {
      if (['\n', '\r', '\u0004'].includes(String(char))) process.stdin.removeListener('data', onData);
      else { readline.clearLine(process.stdout, 0); readline.cursorTo(process.stdout, 0); process.stdout.write(question); }
    };
    process.stdin.on('data', onData);
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

(async () => {
  const password = await askHidden('Password per l\'editor: ');
  if (!password) { console.error('Password vuota: niente da fare.'); process.exit(1); }
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, 'sha256');
  console.log(`pbkdf2$${ITERATIONS}$${salt.toString('base64')}$${hash.toString('base64')}`);
})();
```

Incolla la riga stampata (inizia con `pbkdf2$`) nella dashboard Cloudflare Pages come
**variabile segreta** `EDITOR_PASSWORD_HASH`. Per cambiare password basta rigenerarla e
sostituire il segreto; per chiudere tutte le sessioni aperte, cambia `ADMIN_SECRET`.

## Note per chi scrive via API

- `PUT` sostituisce tutto: fai sempre `GET` prima, modifica e rimanda l'oggetto intero.
- Valori fuori scala non vengono rifiutati dall'API (la validazione è solo sul tipo):
  controlla l'effetto nell'anteprima `/campus-3d/?standalone=1` o nell'editor.
- Se l'API non risponde, `overrides.js` prova il file `overrides.json` pubblicato su git
  accanto alla pagina; se non c'è nemmeno quello, il sito costruisce comunque la scena con
  i valori di default dopo al massimo 2,5 secondi.
- `overrides.json` lo aggiorna solo `POST /api/mappa-3d/publish` (o un push a mano): non si
  aggiorna da solo a ogni salvataggio su D1.
- `POST /api/mappa-3d/restore` non cancella mai niente: ripristinare la versione 3 crea la
  versione 51, e la 3 resta leggibile.
