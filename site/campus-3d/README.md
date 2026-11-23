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

- `campus-buildings.json` contiene 39 schede per 41 impronte OSM selezionate, con codici CU, centroidi e attributi pubblicati. Le quattro impronte CU029 sono aggregate in una scheda; i rispettivi ID OSM restano collegati. CU013, CU014, CU032 e CU035 sono presenti.
- `campus-context.geojson` conserva l’estratto OSM di origine (530 impronte), ma il renderer include soltanto i codici CU già presenti nelle schede della planimetria. I palazzi del quartiere non vengono estrusi. Attribuzione: © OpenStreetMap contributors, [ODbL 1.0 e termini](https://www.openstreetmap.org/copyright). Fonte dati: [API OpenStreetMap, area campus](https://api.openstreetmap.org/api/0.6/map?bbox=12.505,41.898,12.519,41.906).
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

## Aggiornamento del 15/11/2026: Chimica di dettaglio nel sito, banchetto, Fisica

- Nella mappa incorporata nel sito, gli edifici dell’insieme modellato di `campus-3d.js` (CU014 e CU013) restano quelli di dettaglio su impronta OSM, al posto del volume estruso dalla planimetria ufficiale: prima CU014 compariva come blocco giallo.
- `cortile/facciate.json` è ora applicato anche dal sito (funzione `applyFacadeFile` di `campus-3d.js`, saltata se è presente `editor.js`): CU014 ha intonaco arancione come texture dell’edificio, 76 riquadri di muro con un’altra texture e 31 finestre tolte, presi dal documento `edificio:CU014` del db dell’artifact «Campus Sapienza 3D».
- Riportate nei file le modifiche «da applicare» del db dell’artifact lette il 15/11/2026: primitive di `cortile/chimica-esterni.json` (marciapiedi, aiuole, strada, condotte e UTA sul tetto, finestre a nastro, passaggio coperto, arredo dell’angolo sud-ovest), scala antincendio sud, secondo pergolato allungato a u 85,05, transenna del cortile (`cortile/modello.json`), un albero nuovo (`trees.json`).
- Non riportati: il pulsante antincendio (file 3D caricato solo nell’artifact, id `pmvqiyu0ors`), due solidi di asfalto aggiunti e poi eliminati, la modifica `prim:chimica-esterni.17.4.0.0.1` (percorso per indice, non più valido).
- Banchetto di Liberiamo Sapienza nel viale (primitiva `banchetto-liberiamo`, modello «banchetto» del catalogo): modelli degli studenti in `models/studenti.json` e `models/studenti/*.wasm`, immagini in `tex/banchetto/`.
- Edificio di Fisica (CU013): impronta dalla relazione OSM 5457573 (© OpenStreetMap contributors, ODbL), aggiunta a `campus-context.geojson` e a `campus-buildings.json` (39 schede); facciata «giallo» in `facciate.json` come prima versione, da verificare sul posto.
- Nuovo campo `riflesso` (metri) sugli elementi di `cortile/chimica-esterni.json`: l’elemento è costruito riflesso rispetto all’asse v = riflesso / 2 del lato 0 (v diventa riflesso − v). Con riflesso 60,6 (la facciata di Fisica sta a v 60,6) sono copiati sul lato di Fisica pavimento, vialetto, ingresso con prati, fiori, panchine, ringhiera, palma, totem «CU013» e quattro lampioni; i due pergolati specchiati usano lo stesso campo. Posizioni ricavate per simmetria, non rilevate; le scritte dell’ingresso e del totem vengono raddrizzate dal codice.

## Aggiornamento del 16/11/2026: vista d'apertura sullo stradone

- `?vista=chimica` (indirizzo breve `/3d`, regola in `site/_redirects`; vale ancora il vecchio `?focus=banchetto`) apre la scena a quota d'uomo sullo stradone tra Chimica e Fisica, senza barra laterale né pulsanti (resta «Esplora il campus»); dopo l'apertura il parametro viene tolto dall'indirizzo.
- Nella vista d'apertura i modelli pesanti non visibili da lì (statua, fontanelle, condotte, tubi: circa 16 MB) si scaricano alla prima interazione.
- Stradone: asfalto disegnato (u da −8 a 92, v da 20,75 a 39,85 del lato 0) con linee gialle di bordo e strisce pedonali; panchine di cemento colorato (sezione trapezoidale, fiore dipinto sul piano) solo a 0° o 90° rispetto all'asse, in gruppi nella fascia centrale. Posizioni e disegni indicativi, ricavati dalle foto.
- Alberi OSM (`trees.json`): nessuno sull'asfalto; lontano da Chimica/Fisica (140 m) e dalla Minerva (85 m) se ne disegna circa il 30%.

## Aggiornamento del 24/11/2026: ingresso di Fisica Marconi

- Integrato `fisica-marconi.js` nella scena: il modello CU013 comprende la piazzola rialzata con scalinata e la balconata sopra l'ingresso principale, con parapetto e uscita vetrata. La forma e le dimensioni dei dettagli sono schematiche dove le fonti non forniscono quote.
- La sagoma OSM di CU013 viene sottratta ai volumi circostanti prima dell'estrusione, così il modello di dettaglio non è attraversato dalla massa proxy.
