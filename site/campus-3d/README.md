# Città Universitaria · esplorazione 3D

Prototipo statico separato dal sito. Con una chiave Google Maps JavaScript API browser valida mostra la vista satellitare/fotorealistica 3D e marker interattivi ancorati alla mesh. Senza chiave non invia richieste a Google: presenta la planimetria AGEA 2020 e le impronte cliccabili OpenStreetMap, con stato esplicito “Vista fotorealistica in preparazione”.

## Avvio locale

Per i moduli di dati statici usa un server HTTP dalla cartella di consegna (ad esempio `python3 -m http.server 8000`) e apri `http://localhost:8000`. Non serve installare dipendenze: il prototipo carica Maps JavaScript API dinamicamente solo quando `maps-config.js` contiene una chiave.

## Chiave Google opzionale

Aggiungi la tua chiave browser in `maps-config.js` (`window.MAPS_CONFIG.apiKey`). La chiave è usata dal browser e non va committata né condivisa in chat. Per la configurazione Google, abilita Maps JavaScript API e Maps 3D, limita la chiave ai referrer HTTP del dominio locale/di pubblicazione e verifica i requisiti di fatturazione del tuo account. Una chiave non configurata non causa chiamate Google. La pagina carica la versione `3.66` documentata al 13 ottobre 2026. La UI considera la scena pronta solo quando Maps segnala `gmp-steadychange` con `isSteady=true`; un errore `gmp-error` riporta alla planimetria.

## Controlli

- Cerca per codice CU o nome, filtra Chimica (CU014, CU032, CU035), seleziona dalla lista, da un’impronta sulla planimetria o da un marker Maps 3D.
- Il pannello dettaglio espone ID OSM, coordinate, tag presenti e link all’elemento sorgente.
- “Mappa del sito” torna alla planimetria ufficiale: in standalone apre `https://orari-chimica.pi-er-gi.chatgpt.site/#mappa/CU...`; in iframe same-origin invia `postMessage({type: 'campus-return', code})`. Le selezioni si sincronizzano con `campus-select` senza chiudere la vista 3D.
- Tour è solo manuale, ha durata limitata, si ferma alla selezione e resta disabilitato con preferenza `reduced motion`.

## Dati, licenze e limiti

- `campus-buildings.json`: 38 schede di edifici con 41 impronte OSM sull’area campus, con anelli multipli, codici CU, centroidi calcolati per area e attributi disponibili. Le quattro impronte CU029 sono aggregate in un’unica scheda e i quattro ID OSM sono conservati. Fonte OpenStreetMap contributors, ODbL 1.0; attribuzione e [termini](https://www.openstreetmap.org/copyright). Nessuna coordinata CU è stata sintetizzata. CU014, CU032 e CU035 sono presenti. Gli attributi di altezza e livelli sono quelli pubblicati in OSM; in loro assenza il dettaglio indica la stima convenzionale 9 m.
- `campus-agea-2020.png` e sidecar `.pgw`/`.prj`: ritaglio ortofoto Regione Lazio Geoportale, mosaico AGEA 2020, WMS `geonode:2020_AGEA_25833_COG`, CRS:84, bbox `[12.505, 41.898, 12.519, 41.906]`, 1200 × 923 px. Licenza dichiarata nei metadati del dataset: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribuzione: Regione Lazio, Geoportale, Ortofoto AGEA v. 2020. [Metadati dataset](https://geoportale.regione.lazio.it/catalogue/csw_to_extra_format/r_lazio%3A92b0f7e3-3b75-4feb-ac5e-2382/ortofoto-agea-v-2020.html).
- Le impronte e gli eventuali marker non sono fotogrammetria. Nessun mesh 3D di edifici viene finto o fornito. Le altezze mostrate sono solo dati OSM o stime schematiche dichiarate.
- Le mappe Google sono dati/servizi Google soggetti ai [termini Google Maps Platform](https://cloud.google.com/maps-platform/terms). Questa cartella non effettua download o cache di Google Photorealistic 3D Tiles: la visualizzazione avviene tramite Maps JavaScript API.

## Riferimenti API primari

- [Google Maps 3D: evento di click su marker](https://developers.google.com/maps/documentation/javascript/examples/3d/marker-click-event)
- [Animazione camera Maps 3D](https://developers.google.com/maps/documentation/javascript/3d/animate-camera)
- [Versioni Maps JavaScript API](https://developers.google.com/maps/documentation/javascript/versions)
- [Reference: disegno su mappa 3D e vincoli altitude/extruded](https://developers.google.com/maps/documentation/javascript/reference/3d-map-draw)

I marker usano `RELATIVE_TO_MESH` per rimanere aderenti al terreno/mesh. La reference Google limita `extruded=true` a `RELATIVE_TO_GROUND` o `ABSOLUTE`, quindi non viene impostato insieme a `RELATIVE_TO_MESH`.
