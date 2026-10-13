# Città Universitaria · esplorazione 3D locale

Prototipo statico senza chiavi, API a pagamento o installazione di dipendenze. La scena 3D usa Three.js r128 e OrbitControls distribuiti localmente con licenza MIT, l’ortofoto AGEA 2020 e le geometrie OpenStreetMap. La volumetria è schematica: non è fotogrammetria e non rappresenta un rilievo degli edifici.

## Avvio e controlli

Servire questa cartella con un server HTTP statico e aprire `index.html`. Le risorse JavaScript, i dati e le immagini sono locali; i collegamenti esterni sono usati solo per aprire le fonti OSM e la planimetria ufficiale.

- Trascina per orbitare, trascina con il tasto destro o due dita per spostarti, usa rotella o pinch per zoom.
- `Vista ortofoto` alterna la scena 3D con l’ortofoto e le sagome CU selezionabili.
- `Ortofoto` e `Edifici` mostrano o nascondono rispettivamente la base aerea e gli edifici estrusi.
- `Tour manuale` avvia per pochi secondi una rotazione manuale; resta disattivato con `prefers-reduced-motion` e non parte automaticamente.
- Cerca per codice o nome, filtra Chimica (CU014, CU032, CU035), oppure seleziona un edificio dalla lista, dalla mappa o dalla planimetria. La selezione apre i dettagli e mantiene il collegamento alle aule e lezioni.

La scena si ferma quando la scheda del browser è nascosta. Se WebGL non è disponibile o viene perso, resta disponibile l’ortofoto con le impronte vettoriali.

## Dati, provenienza e limiti

- `campus-buildings.json` contiene 38 schede per 41 impronte OSM selezionate, con codici CU, centroidi e attributi pubblicati. Le quattro impronte CU029 sono aggregate in una scheda; i rispettivi ID OSM restano collegati. CU014, CU032 e CU035 sono presenti.
- `campus-context.geojson` conserva l’estratto OSM campus di 530 impronte. I 38 edifici con codice CU sono collegati alle schede del campus; le altre geometrie contestuali non sono selezionabili. Attribuzione: © OpenStreetMap contributors, [ODbL 1.0 e termini](https://www.openstreetmap.org/copyright). Fonte dati: [API OpenStreetMap, area campus](https://api.openstreetmap.org/api/0.6/map?bbox=12.505,41.898,12.519,41.906).
- Altezza usata per l’estrusione: tag OSM `height` valido; altrimenti `building:levels × 3 m`; altrimenti stima dichiarata di 9 m. Il dettaglio riporta il dato o la regola applicata. Tutti i volumi sono indicativi.
- `campus-agea-2020.png` è il ritaglio dell’ortofoto Regione Lazio, mosaico AGEA 2020, WMS `geonode:2020_AGEA_25833_COG`; sidecar `.pgw` e `.prj`, CRS:84, bbox `[12.505, 41.898, 12.519, 41.906]`, 1200 × 923 px. Licenza dichiarata nei metadati: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Attribuzione: Regione Lazio, Geoportale, Ortofoto AGEA v. 2020. [Metadati](https://geoportale.regione.lazio.it/catalogue/csw_to_extra_format/r_lazio%3A92b0f7e3-3b75-4feb-ac5e-2382/ortofoto-agea-v-2020.html).
- Three.js r128 e OrbitControls sono forniti in `vendor/` dalla distribuzione npm jsDelivr fissata alla versione `0.128.0`. `vendor/PROVENANCE.txt` registra gli URL e gli hash SHA-256; `vendor/LICENSE.three` contiene l’avviso MIT, da conservare con le copie ridistribuite.

La base e le coperture usano l’ortofoto AGEA; pareti, altezze e geometrie non descrivono con precisione costruttiva gli edifici. La scena non fornisce né scarica mesh fotogrammetriche.

La scena usa coordinate destrorse: +X verso est, +Y verso l’alto e +Z verso sud, quindi il nord geografico corrisponde a −Z.

## Planimetria vettoriale incorporata

Quando il sito principale apre questa pagina con `?embedded=1`, l’iframe riceve via `postMessage` same-origin la planimetria originale: immagine, viewBox, percorsi SVG assoluti e codici CU. L’immagine ufficiale viene proiettata come piano della scena e i percorsi originali vengono estrusi schematicamente; il livello si può attenuare o nascondere. In vista ortofoto resta disponibile la stessa planimetria con selezione dei codici. La sidebar e i dettagli restano di proprietà della pagina principale. Il protocollo accetta solo messaggi inviati dalla finestra parent sullo stesso origin.

La registrazione è affine e approssimata: fit OLS su 38 codici condivisi tra planimetria Sapienza e centroidi OSM, con residuo RMS 10,61 m, mediana 3,17 m e massimo 37,09 m (CU023; CU035 32,37 m). I percorsi vettoriali non vengono deformati edificio per edificio e non vanno interpretati come un rilievo geodetico. I dati e i coefficienti usati sono in `vector-alignment.json`; l’ortofoto AGEA e i dati OSM mantengono le attribuzioni sopra indicate.

## Collegamenti

- Vista autonoma: torna a `../index.html#mappa/CU...` sullo stesso hosting.
- In iframe same-origin, `Mappa del sito` invia `postMessage({type: 'campus-return', code})`; la selezione invia `campus-select`. I messaggi in ingresso sono accettati solo dall’origine e dalla finestra parent previste.
- L’apertura standalone torna alla planimetria Sapienza con il codice CU selezionato.
