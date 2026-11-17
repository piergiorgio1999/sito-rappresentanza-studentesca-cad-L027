# API dei parametri della mappa 3D (`/api/mappa-3d`)

Questa API permette di modificare i parametri geometrici della scena 3D del campus
(`site/campus-3d/`) **senza push su git**: il sito pubblico li legge a ogni caricamento
tramite `overrides.js` e li applica ai moduli 3D.

- Endpoint: `https://orari-chimica.pages.dev/api/mappa-3d`
- Editor umano equivalente: `https://orari-chimica.pages.dev/campus-3d/editor.html`

**Il token di scrittura va chiesto al proprietario del sito e non va mai scritto in
questo file, né in un repository, né in un'URL.** Viaggia solo nell'header
`Authorization` di una richiesta HTTPS.

## Metodi

| Metodo | Autenticazione | Effetto |
| --- | --- | --- |
| `GET` | nessuna (pubblico) | restituisce `{"overrides": {...}, "updated_at": N}`; `N` è l'epoch in secondi dell'ultimo salvataggio, `0` se non è mai stato salvato nulla. Risposta con `Cache-Control: public, max-age=30`. |
| `PUT` | `Authorization: Bearer <token>` | sostituisce **tutto** lo stato con il corpo `{"overrides": {...}}` e restituisce il nuovo stato. Non è una modifica parziale: chi scrive deve prima fare `GET`, modificare l'oggetto e rimandarlo intero. |
| `OPTIONS` | nessuna | preflight CORS (`Access-Control-Allow-Origin: *`, header `Authorization` e `Content-Type` ammessi). |
| altri | — | `405` con `{"error": "..."}`. |

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

## Note per chi scrive via API

- `PUT` sostituisce tutto: fai sempre `GET` prima, modifica e rimanda l'oggetto intero.
- Valori fuori scala non vengono rifiutati dall'API (la validazione è solo sul tipo):
  controlla l'effetto nell'anteprima `/campus-3d/?standalone=1` o nell'editor.
- Se l'API non risponde, il sito costruisce comunque la scena con i valori di default
  dopo al massimo 2,5 secondi.
