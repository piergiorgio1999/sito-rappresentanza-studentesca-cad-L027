/* Edificio di Fisica «Guglielmo Marconi» (CU013 della Città Universitaria, Giuseppe Pagano,
   progetto 1932-35, realizzazione 1936): modello procedurale degli esterni. Caricato dopo
   campus-3d.js; aspetta window.campus3d e window.MAPPA3D_READY, poi aggiunge alla scena il
   gruppo «fisica-marconi» e nasconde l'estrusione OSM di CU013, come fa matematica-castelnuovo.js
   con CU006.

   REGOLA SEGUITA. La stilizzazione semplifica superfici e tessiture, non inventa geometrie:
   ogni quota qui sotto ha la sua fonte nel commento, e quello che le fonti non dicono non è
   stato modellato (l'elenco è in fondo a questa intestazione).

   IMPRONTA E TERNA LOCALE (fonte 1). Relazione OSM 5457573 in campus-buildings.json
   (© OpenStreetMap contributors, ODbL): anello esterno di 12 vertici più due anelli interni,
   la corte centrale (434 m²) e un pozzo di luce nel settore est (49 m²). Area netta 4.221 m².
   La direzione della maglia, 69,645° da nord, è il fit pesato sulle lunghezze di tutti i lati
   dell'anello esterno modulo 90°: nella terna locale l'impronta risulta ortogonale entro ±0,4 m,
   quindi la maglia è quella e non una media di lati storti.
     x = lungo 69,645° (verso est-nord-est, cioè verso il piazzale della Minerva);
     z = lungo 159,645° (verso sud-sud-est, cioè verso lo stradone Chimica-Fisica).
   Origine: centroide OSM. L'impronta è usata tale e quale, vertice per vertice.

   RISCONTRO CON LA PLANIMETRIA UFFICIALE (fonte 2). ACU013.pdf (scheda Sapienza di CU013) e la
   stessa sagoma presente in site/index.html (MAPD.shapes, planimetria ufficiale in coordinate
   PDF). Registrata sull'immagine della scheda, l'impronta OSM coincide con quella disegnata:
   stessa corte, stesso pozzo di luce, stessa rientranza a ovest, stesso intaglio a est. Due
   differenze note: la planimetria ufficiale dà il fabbricato più corto di ~6 m a ovest e ha una
   rientranza di 7 m sul fronte nord-nord-ovest che OSM non ha. Non sono state recepite: la
   registrazione della planimetria ufficiale nel mondo ha residuo mediano 3,2 m
   (vector-alignment.json) e l'impronta OSM è il riferimento di posizione, orientamento e scala.

   INGRESSO PRINCIPALE (fonte 2). La scheda ACU013.pdf segna l'ingresso con una freccia. Posta
   la scheda in registro con l'impronta (rotazione, scala e traslazione ai minimi quadrati sul
   poligono disegnato), la freccia cade a x ≈ 22, z ≈ 52 e punta verso nord-nord-ovest: indica
   quindi il fronte interno all'intaglio sud-est, il muro z = 13,84 fra x 13,6 e 48,1, e non il
   fronte lungo. L'intaglio stesso (35 × 20 m, vuoto nell'impronta) è il piazzale d'ingresso di
   cui parlano le schede. La posizione lungo il muro è ±5 m: X_ENTR è un parametro.

   QUOTE (fonte 3). Il piano di emergenza Sapienza/INFN del novembre 2012 documenta per CU013
   «cinque piani fuori terra e un piano seminterrato». L'altezza di sommità 21 m è quella della
   tabella QUOTE_CORRETTE di campus-3d.js (il tag OSM «3 piani» è errato); il context pack non
   dà altezze, quindi 21 m resta l'unico dato disponibile. La scansione dei piani è quella
   misurata sull'edificio coevo CU014 (nota height_note in campus-buildings.json: «piano terra e
   quattro piani, primo piano a 5,25 m e interpiano 3,95 m»). Da quei due numeri discende anche
   la quota del piano terra: 5,25 - 3,95 = 1,30 m, cioè il piano terra è rialzato di 1,30 m sul
   terreno, quanto lo zoccolo in travertino. I cinque livelli stanno quindi a 1,30 / 5,25 / 9,20
   / 13,15 / 17,10 e l'ultimo solaio chiude a 21,05: le due fonti coincidono entro 5 cm, quindi
   i cinque piani documentati stanno esattamente nei 21 m del repository.

   ALTEZZE DIFFERENZIATE: PERCHÉ NON CI SONO. Le schede chiedono quote diverse per corpo
   (sopraelevazione di un piano sul fronte ovest 1959-61; settore est con parti a due livelli),
   ma nessuna fonte del pacchetto dice dove comincia e dove finisce ciascun corpo. L'unica
   misura indipendente disponibile è l'ortofoto AGEA 2020 del repository: l'ombra portata a
   nord-nord-ovest del fronte lungo è larga 6-7 m uniformemente da x = -35 a x = +40, cioè il
   fronte lungo non ha gradini di quota. Per il lato sud non c'è segnale (quel fronte è
   controsole). Perciò la massa è a quota unica e i corpi differenziati NON sono modellati;
   i parametri H_OVEST / X_OVEST e H_EST / X_EST esistono e valgono 0 (= disattivati) perché
   bastino un rilievo o una foto quotata per accenderli senza toccare il codice.

   MATERIALI (fonte 4). Rivestimento continuo a listelli di litoceramica giallo-arancio (non
   laterizio a vista) e zoccolo, pavimentazioni e dettagli in travertino romano: ArchiDiAP,
   Museo di Fisica e la relazione «Solarizzazione della Sapienza». I toni usati sono quelli che
   campus-3d.js assegna già a CU013 nella palette «giallo» di facciate.json (muro #d6a66b /
   #c7955c, giunti chiari, bande #e2dccf), che coincidono con la palette proxy del context pack
   (#C99451 / #D7A466 / #BE8140). La scena è molto luminosa: come in matematica-castelnuovo.js
   la texture porta i colori veri e il materiale li modula con un colore più basso, altrimenti
   listelli e giunti spariscono al sole.

   SCALA DEI COMPONENTI (fonte 5). Studio accademico Arts 2019, §3.2: molte finestre originali
   di 150 × 200 cm, lastre quadrate del piazzale d'ingresso di 60 cm di lato. Il passo
   orizzontale delle finestre non è documentato da nessuna fonte: si usa 3,60 m, lo stesso che
   campus-3d.js adopera per le facciate di CU014, edificio coevo dello stesso campus.

   RIENTRANZA D'INGRESSO E BALCONATA (fonte 6). Le due assonometrie di progetto mostrano, nel
   punto dove le due ali si incontrano, un intaglio verticale che arriva a terra con l'ingresso
   in fondo e una lastra quasi quadrata che lo attraversa alla quota del primo piano. Misure e
   metodo (scala grafica, proiezione planometrica) sono nel commento di readParams() accanto a
   REC_X0 / REC_W / REC_D / BALC_Y: 7,05 × 7,95 m di pianta, a partire dal vertice OSM
   [13,61 / 13,83]. Il resto dell'articolazione che le assonometrie mostrano (corpi a quote
   diverse, corpi bassi, altri cortili, passerella su pilotis, corpo curvo d'angolo, volumi in
   copertura, finestre raggruppate) NON è stato recepito: quella pianta non combacia con
   l'impronta OSM, che qui resta il riferimento, e tradurla richiederebbe di inventare dove
   comincia e dove finisce ciascun corpo.

   NON MODELLATO, PER MANCANZA DI FONTI (dichiarato invece che immaginato):
   - articolazione delle masse delle assonometrie (vedi fonte 6): corpi a quote diverse, cortili
     ulteriori, passerella su pilotis, corpo curvo d'angolo, volumi tecnici in copertura;
   - mensole o pilastri sotto la balconata: i disegni non ne mostrano, la lastra è appoggiata
     sui tre muri del rientro;
   - quota esatta della balconata: non misurabile sul raster, si usa il primo piano già
     documentato (5,25 m);
   - gruppo scultoreo di Corrado Vigni nella corte e bassorilievi presso la scalinata: esistenza
     documentata, ubicazione e ingombro no;
   - volumi tecnici e gabbiotti metallici in copertura, impianto fotovoltaico (progetto 2018):
     presenza nel 2026 non accertata;
   - passerella «en plein air» al secondo livello sul lato nord e le sue chiusure successive;
   - sopraelevazione ovest 1959-61 e ala bassa est, per i motivi detti sopra;
   - seminterrato e dislivelli del terreno attorno all'edificio.

   Parametri sovrascrivibili senza push su git: window.MAPPA3D_OVERRIDES.marconi (vedi
   MAPPA-3D-API.md). Si leggono in readParams(), chiamata da build(): overrides.js riempie
   l'oggetto in modo asincrono. Con overrides vuoti il render è quello originale. */
(function () {
  'use strict';

  /* Centroide dell'impronta OSM di CU013 e direzione della maglia (est, nord). */
  const REF = { lon: 12.513346268489101, lat: 41.9031694828702 };
  const U = [0.937553, 0.347843];     // bearing 69,645°: lungo x locale
  const NOUT = [-0.347843, 0.937553]; // bearing 339,645°: il verso -z locale

  /* Anelli dell'impronta OSM nella terna locale, in metri [x, z]. Anello 0 esterno,
     anello 1 corte centrale, anello 2 pozzo di luce del settore est. */
  const RING_OUT = [[48.66, -26.95], [-42.40, -26.81], [-42.53, -3.97], [-29.43, -3.69],
    [-29.78, 1.57], [-41.77, 1.97], [-41.69, 25.70], [-39.52, 25.06], [-39.23, 34.23],
    [12.96, 33.67], [13.61, 13.83], [48.09, 13.84]];
  const RING_CORTE = [[-16.93, 4.89], [-16.11, 4.86], [4.06, 4.27], [4.99, 4.24],
    [5.02, 23.96], [-17.63, 24.15]];
  const RING_POZZO = [[37.08, -8.39], [29.43, -8.54], [29.47, -1.90], [36.80, -1.87]];

  /* ---------------- quote dei corpi, contate sulle planimetrie ufficiali ----------------
     Fonte: Sapienza, Ufficio Speciale Prevenzione e Protezione, «Piano di emergenza ed
     evacuazione - Parte specifica, Edificio CU013 "Fisica Guglielmo Marconi"», rev. 00,
     novembre 2012, allegato 3: planimetrie di seminterrato, terra, primo, secondo, terzo e
     quarto piano. Le piante sono state registrate sull'impronta OSM (scala 11,88 px/m,
     origine sul vertice nord-ovest dell'anello) e il numero di livelli di ogni punto è stato
     contato su una griglia di 2 m, verificando a quali piani quel punto risulta edificato.
     Due controprove: il piano terra così misurato dà 3064 m², contro i 3400 m² che la fonte
     storica di Piacentini attribuisce all'edificio, e il piano quarto dà 72 m², cioè la sola
     torretta a sud-ovest, che è esattamente ciò che mostra la tavola del quarto piano.
     Il documento dichiara cinque piani fuori terra e avverte che non tutte le ali li
     raggiungono: queste quote differenziate sono la traduzione di quell'avvertenza.
     CORPI[k] = rettangoli che arrivano ALMENO al livello k (cumulativi, per la massa).
     CORPI_TOP[k] = rettangoli che si FERMANO al livello k (per coperture e coronamenti).
     ATTENZIONE - questi rettangoli NON sono usati per costruire la massa, e il motivo va
     letto prima di riaccenderli. Estrudendoli si ottiene un volume di 40 400 m3, mentre la
     fonte storica di Piacentini riportata dal Museo di Fisica dichiara 72 500 m3: il modello
     a gradoni starebbe al vero come 1 a 1,8. La causa e' il metodo di conteggio: nelle
     planimetrie di emergenza sono colorati solo gli ambienti con una destinazione assegnata,
     mentre corridoi, scale, laboratori senza etichetta e locali tecnici restano bianchi e
     non vengono contati. Il conteggio quindi sottostima i piani alti, e il volume dichiarato
     implica un'altezza media di 21,3 m su tutta l'impronta, cioe' cinque livelli quasi
     ovunque. Finche' non si ricava la sagoma dai prospetti o da un rilievo, la massa resta
     uniforme a 21 m: e' l'ipotesi che rispetta il volume documentato.
     Restano validi, e utili quando si tornera' sul tema: la differenza RELATIVA fra i corpi
     (quali parti sono piu' basse) e la torretta a sud-ovest, unico punto che la tavola del
     quarto piano mostra abitato.

     Tre metodi hanno provato a ricavare le quote dei singoli corpi dalle assonometrie, e
     tutti e tre hanno fallito in modo misurabile. Primo: estrazione automatica dei segmenti,
     che per la stessa ala dava altezze fra 16,2 e 20,3 m secondo quale retta si prendesse
     per base. Secondo: il conteggio dei piani qui sopra, smentito dal volume. Terzo: fissata
     la pianta sull'anello OSM, si e' cercata per ogni muro del perimetro l'altezza che porta
     la sua gronda a cadere sull'inchiostro del disegno raddrizzato, scandendo h da 0 a 30 m;
     i massimi non sono netti (il secondo picco vale quasi quanto il primo) e danno valori
     impossibili, 26,75 m e 29,00 m su due muri e 0 m su altri. La causa e' strutturale: in
     una planometrica lo scorrimento di quota avviene lungo una direzione fissa, e l'edificio
     ha molte linee parallele a quella direzione, quindi le corrispondenze false sono tante
     quante quelle vere. Con un raster di 723x1024 e tratto di un pixel non si risolve.
     I prospetti sono poi arrivati, ed e' da quelli che vengono le quote usate: vedi sotto. */

  /* ---------------- quote dai prospetti originali di Pagano ----------------
     Fonte: ArchiDiAP, scheda «Istituto di Fisica», tavole dei quattro prospetti (nord, sud,
     est, ovest), ridisegni dei disegni che Pagano pubblico' su Casabella nel 1936. Sono
     proiezioni ortogonali con barra di scala: la quota si legge diretta, senza lo
     scorrimento che rende ambigue le assonometrie.
     Scala ricavata dalla barra: 10,0 px/m (0-20 m su 200 px). La larghezza del fronte nord
     misurata cosi' da 88,6 m contro i 91,1 m dell'impronta OSM, il 2,7% di scarto.
     I quattro prospetti danno gli stessi tre valori di gronda, ed e' la loro concordanza a
     renderli affidabili:
       14,7 m  le testate est e ovest
       19,3 m  il corpo principale, il piu' esteso su tutti e quattro i fronti
       23,3 m  un solo corpo alto, largo 14,5 m sui fronti nord e sud e 13,4 m su est e ovest
     Il corpo alto cade a sud-ovest, e li' lo colloca anche il piano di emergenza 2012: la
     tavola del quarto piano mostra abitato solo quell'angolo. Due fonti indipendenti, stesso
     punto: e' la verifica piu' solida che abbiamo su questo edificio. */
  const H_TESTATE = 14.7, H_TORRE = 23.3;
  const TORRE = [-36.0, 17.0, -21.5, 30.4];   // x0, z0, x1, z1: corpo alto, dai fronti incrociati
  const TESTATA_E = 38.0;                      // oltre questa x il fronte scende a 14,7 m
  const TESTATA_O = -36.0;                     // sotto questa x idem
  const CORPI = {
    2: [[-42.0,-26.0,-18.0,-10.0],[-4.0,-26.0,20.0,-8.0],[38.0,-26.0,48.0,-22.0],[20.0,-22.0,26.0,-4.0],[42.0,-22.0,48.0,14.0],[26.0,-20.0,28.0,-4.0],[28.0,-18.0,30.0,-6.0],[-18.0,-12.0,-4.0,-4.0],[-36.0,-10.0,-18.0,-8.0],[-32.0,-8.0,-18.0,-4.0],[-4.0,-8.0,0.0,-4.0],[4.0,-8.0,20.0,-4.0],[-26.0,-4.0,-20.0,36.0],[4.0,-4.0,12.0,36.0],[-42.0,2.0,-26.0,24.0],[22.0,6.0,42.0,12.0],[24.0,12.0,42.0,14.0],[12.0,20.0,14.0,36.0],[-28.0,24.0,-26.0,36.0],[-20.0,26.0,4.0,36.0],[14.0,30.0,16.0,34.0]],
    3: [[-42.0,-26.0,-20.0,-12.0],[-2.0,-26.0,20.0,-10.0],[38.0,-26.0,48.0,-22.0],[20.0,-22.0,26.0,-4.0],[42.0,-22.0,48.0,2.0],[26.0,-18.0,30.0,-6.0],[-40.0,-12.0,-18.0,-10.0],[-34.0,-10.0,-6.0,-8.0],[6.0,-10.0,20.0,-8.0],[-32.0,-8.0,-26.0,-6.0],[-18.0,-8.0,-6.0,-6.0],[6.0,-8.0,14.0,-4.0],[26.0,-6.0,28.0,-4.0],[4.0,-4.0,10.0,22.0],[-24.0,-2.0,-20.0,20.0],[-40.0,2.0,-24.0,6.0],[44.0,2.0,48.0,12.0],[-42.0,4.0,-40.0,20.0],[-40.0,6.0,-30.0,22.0],[-26.0,6.0,-24.0,20.0],[24.0,8.0,32.0,12.0],[42.0,8.0,44.0,12.0],[10.0,20.0,12.0,26.0],[6.0,22.0,10.0,26.0],[-18.0,26.0,2.0,34.0],[-28.0,30.0,-18.0,34.0],[2.0,30.0,14.0,34.0]],
    4: [[-40.0,-26.0,-20.0,-12.0],[-34.0,-12.0,-28.0,-8.0],[6.0,-4.0,10.0,22.0],[-40.0,4.0,-32.0,20.0],[-24.0,4.0,-20.0,20.0],[-26.0,30.0,-24.0,32.0]],
    5: [[-30.1,21.0,-25.4,33.7]]
  };
  const CORPI_TOP = {
    1: [[-42.0,-28.0,-20.0,-26.0],[-4.0,-28.0,20.0,-26.0],[38.0,-28.0,48.0,-26.0],[-18.0,-26.0,-4.0,-12.0],[20.0,-26.0,28.0,-22.0],[30.0,-26.0,38.0,-22.0],[26.0,-22.0,28.0,-20.0],[38.0,-22.0,42.0,2.0],[-42.0,-10.0,-36.0,-8.0],[-34.0,-8.0,-32.0,-4.0],[0.0,-8.0,4.0,-4.0],[28.0,-6.0,30.0,-4.0],[12.0,-4.0,20.0,8.0],[-40.0,-2.0,-38.0,2.0],[-34.0,-2.0,-26.0,2.0],[-20.0,-2.0,-18.0,24.0],[30.0,-2.0,38.0,6.0],[-42.0,0.0,-40.0,2.0],[-38.0,0.0,-34.0,2.0],[-16.0,0.0,0.0,4.0],[20.0,0.0,22.0,8.0],[-18.0,2.0,-16.0,6.0],[0.0,2.0,2.0,4.0],[26.0,2.0,30.0,6.0],[40.0,2.0,42.0,6.0],[-16.0,4.0,-4.0,6.0],[22.0,4.0,26.0,6.0],[-44.0,8.0,-42.0,24.0],[22.0,12.0,24.0,14.0],[28.0,14.0,36.0,16.0],[14.0,22.0,16.0,30.0],[-30.0,24.0,-28.0,34.0],[14.0,34.0,16.0,36.0]],
    2: [[-20.0,-26.0,-18.0,-12.0],[-4.0,-26.0,-2.0,-4.0],[26.0,-20.0,28.0,-18.0],[-42.0,-12.0,-40.0,-10.0],[-18.0,-12.0,-4.0,-10.0],[-36.0,-10.0,-34.0,-8.0],[-6.0,-10.0,-4.0,-4.0],[-2.0,-10.0,6.0,-8.0],[-26.0,-8.0,-18.0,-4.0],[-2.0,-8.0,0.0,-4.0],[4.0,-8.0,6.0,-4.0],[14.0,-8.0,20.0,-4.0],[-32.0,-6.0,-26.0,-4.0],[-18.0,-6.0,-6.0,-4.0],[-26.0,-4.0,-20.0,-2.0],[10.0,-4.0,12.0,20.0],[-26.0,-2.0,-24.0,2.0],[-42.0,2.0,-40.0,4.0],[42.0,2.0,44.0,8.0],[-30.0,6.0,-26.0,24.0],[22.0,6.0,42.0,8.0],[22.0,8.0,24.0,12.0],[32.0,8.0,42.0,14.0],[24.0,12.0,32.0,14.0],[42.0,12.0,48.0,14.0],[-42.0,20.0,-40.0,24.0],[-26.0,20.0,-20.0,30.0],[12.0,20.0,14.0,30.0],[-40.0,22.0,-30.0,24.0],[4.0,22.0,6.0,30.0],[-28.0,24.0,-26.0,30.0],[-20.0,26.0,-18.0,30.0],[2.0,26.0,4.0,30.0],[6.0,26.0,12.0,30.0],[14.0,30.0,16.0,34.0],[-28.0,34.0,14.0,36.0]],
    3: [[-42.0,-26.0,-40.0,-12.0],[-2.0,-26.0,20.0,-10.0],[38.0,-26.0,48.0,-22.0],[20.0,-22.0,26.0,-4.0],[42.0,-22.0,48.0,2.0],[26.0,-18.0,30.0,-6.0],[-40.0,-12.0,-34.0,-10.0],[-28.0,-12.0,-18.0,-8.0],[-18.0,-10.0,-6.0,-6.0],[6.0,-10.0,20.0,-8.0],[-32.0,-8.0,-26.0,-6.0],[6.0,-8.0,14.0,-4.0],[26.0,-6.0,28.0,-4.0],[4.0,-4.0,6.0,22.0],[-24.0,-2.0,-20.0,4.0],[-40.0,2.0,-24.0,4.0],[44.0,2.0,48.0,12.0],[-42.0,4.0,-40.0,20.0],[-32.0,4.0,-24.0,6.0],[-32.0,6.0,-30.0,22.0],[-26.0,6.0,-24.0,20.0],[24.0,8.0,32.0,12.0],[42.0,8.0,44.0,12.0],[-40.0,20.0,-32.0,22.0],[10.0,20.0,12.0,26.0],[6.0,22.0,10.0,26.0],[-18.0,26.0,2.0,34.0],[-28.0,30.0,-26.0,34.0],[-24.0,30.0,-18.0,34.0],[2.0,30.0,14.0,34.0],[-26.0,32.0,-24.0,34.0]],
    4: [[-40.0,-26.0,-20.0,-12.0],[-34.0,-12.0,-28.0,-8.0],[6.0,-4.0,10.0,22.0],[-40.0,4.0,-32.0,20.0],[-24.0,4.0,-20.0,20.0]],
    5: [[-30.1,21.0,-25.4,33.7]]
  };

  let P = {};
  let X_MID, Z_MID,                       // ritocco dell'intero gruppo nella terna locale
    H, H_CORN, CORN_OUT, H_ZOCC, ZOCC_OUT, // sommità, fascia di coronamento, zoccolo
    PIANI, WIN_W, WIN_H, WIN_PITCH, WIN_DEP, SILLS, // scansione dei piani e delle finestre
    X_ENTR, DOOR_W, DOOR_H, PENS_W, PENS_D, PENS_Y, PENS_T, // ingresso e pensilina
    REC_X0, REC_W, REC_D, BALC_Y, BALC_T, PAR_H, PAR_T, // rientranza d'ingresso e balconata
    SED_ON, SED_X0, SED_X1, SED_Z0, SED_Z1, SED_H, SED_IN, SED_STEP, // piano di sedime
    PLAT_Z, PLAT_H, STEPS, LASTRA,        // piazzale rialzato, scalinata, lato delle lastre
    H_OVEST, X_OVEST, H_EST, X_EST;       // corpi a quota diversa: spenti, vedi intestazione

  function readParams() {
    P = (window.MAPPA3D_OVERRIDES && window.MAPPA3D_OVERRIDES.marconi) || {};
    X_MID = P.X_MID ?? 0; Z_MID = P.Z_MID ?? 0;
    // 21 m: QUOTE_CORRETTE di campus-3d.js; coincide con i 5 livelli del piano di emergenza 2012
    H = P.H ?? 19.3;   // gronda del corpo principale, misurata sui quattro prospetti di Pagano
    // fascia di coronamento: 0,9 m è la quota d'attico che campus-3d.js usa su tutto il campus
    H_CORN = P.H_CORN ?? 0.9; CORN_OUT = P.CORN_OUT ?? 0.34;
    /* Zoccolo in travertino documentato; l'altezza no, ma la scansione misurata su CU014 la
       determina: con il primo piano a 5,25 m e interpiano 3,95 m, il piano terra comincia a
       5,25 - 3,95 = 1,30 m sopra il terreno, cioè l'edificio ha il piano terra rialzato e lo
       zoccolo è alto quanto quel rialzo (nel repository interno-aldo-moro.js usa 1,20 m per il
       piano rialzato di CU015 e CU016, due edifici dello stesso campus). */
    H_ZOCC = P.H_ZOCC ?? 1.3; ZOCC_OUT = P.ZOCC_OUT ?? 0.12;
    PIANI = P.PIANI ?? 5;
    // 150 × 200 cm: finestre originali documentate (Arts 2019 §3.2); orientamento largh./alt.
    WIN_W = P.WIN_W ?? 1.5; WIN_H = P.WIN_H ?? 2.0; WIN_DEP = P.WIN_DEP ?? 0.32;
    // passo non documentato: 3,60 m, lo stesso delle facciate di CU014 in campus-3d.js
    WIN_PITCH = P.WIN_PITCH ?? 3.6;
    /* Davanzali: i cinque piani fuori terra stanno a 1,30 / 5,25 / 9,20 / 13,15 / 17,10
       (piano terra rialzato e interpiano 3,95 m misurati su CU014), più 0,95 m di parapetto
       interno. L'ultima fila chiude a 20,05 m, appena sotto la fascia di coronamento. */
    /* I davanzali si distribuiscono sull'altezza vera del corpo principale: scritti a mano
       restavano tarati sui 21 m di prima e l'ultima fila sfondava il coronamento. */
    SILLS = Array.isArray(P.SILLS) && P.SILLS.length ? P.SILLS.slice()
      : (() => {
        const utile = H - H_CORN - WIN_H - 1.2, passo = utile / Math.max(1, PIANI - 1);
        return Array.from({ length: PIANI }, (_, i) => +(0.9 + i * passo).toFixed(2));
      })();
    /* RIENTRANZA DELL'INGRESSO E BALCONATA (fonte 6: le due assonometrie di progetto).
       Le due assonometrie sono proiezioni planometriche (assi di pianta a 30° e 60°
       sull'orizzontale, pianta in vera forma, verticali verticali). La scala grafica in basso
       misura 0-50 m fra i pixel 35 e 337 dell'immagine, cioè 6,04 px/m; con quel fattore il
       passo verticale fra due file di finestre, 26 px, dà un interpiano di 4,30 m, coerente
       con i cinque livelli dentro i 21 m di sommità: la scala è quella.
       All'angolo rientrante dove le due ali si incontrano (nell'impronta OSM il vertice
       [13,61 / 13,83], cioè l'angolo interno dell'intaglio sud-est) il fronte non è continuo:
       c'è un intaglio verticale che arriva a terra, e in fondo a quel rientro sta l'ingresso.
       Misurati sull'assonometria 1 i due lati orizzontali del piano che chiude il rientro
       (spigolo vicino a 401/517 px, lato lungo l'asse A fino a 437/538 px e lato lungo l'asse B
       fino a 424/470 px), risolti sui versori di pianta A=(0,866 / 0,500) e B=(0,500 / -0,866):
       7,05 m di larghezza e 7,95 m di profondità, cioè la balconata «quasi quadrata». Il
       rientro ha la stessa pianta e parte dal filo del muro z = 13,84 verso nord. */
    REC_X0 = P.REC_X0 ?? 13.61; REC_W = P.REC_W ?? 7.05; REC_D = P.REC_D ?? 7.95;
    /* Quota della balconata: il disegno la dice «del primo piano» ma non è misurabile con
       sicurezza sul raster (manca uno spigolo verticale di riferimento nel rientro), quindi si
       usa il primo piano già documentato nel modulo, 5,25 m (scansione misurata su CU014).
       Spessore della lastra e parapetto non sono documentati: valori minimi dichiarati. */
    BALC_Y = P.BALC_Y ?? 5.25; BALC_T = P.BALC_T ?? 0.45;
    PAR_H = P.PAR_H ?? 1.05; PAR_T = P.PAR_T ?? 0.3;
    /* ingresso: ora sta in fondo al rientro, quindi l'asse è il mezzo del rientro (17,14) e non
       più il 22,5 letto sulla freccia della scheda ACU013; i due valori distano 5,4 m, cioè
       quanto l'incertezza ±5 m dichiarata per quella lettura. Luce e altezza restano stilizzate
       e la luce è ridotta perché deve stare dentro i 7,05 m del rientro. */
    X_ENTR = P.X_ENTR ?? (REC_X0 + REC_W / 2); DOOR_W = P.DOOR_W ?? 4.8; DOOR_H = P.DOOR_H ?? 4.0;
    /* pensilina: documentata la presenza, non le dimensioni. Con il rientro, è la lastra della
       balconata a coprire l'ingresso, quindi la pensilina separata è spenta (PENS_W = 0) invece
       di raddoppiare un riparo che il disegno non mostra; i parametri restano per riaccenderla. */
    PENS_W = P.PENS_W ?? 0; PENS_D = P.PENS_D ?? 2.4; PENS_Y = P.PENS_Y ?? 4.5; PENS_T = P.PENS_T ?? 0.38;
    /* Piazzale rialzato in travertino dentro l'intaglio sud-est: profondità e numero di alzate
       non documentati; la quota è quella dello zoccolo, le lastre sono i 60 cm documentati. */
    PLAT_Z = P.PLAT_Z ?? 37.1; PLAT_H = P.PLAT_H ?? H_ZOCC; STEPS = P.STEPS ?? 5; LASTRA = P.LASTRA ?? 0.6;
    /* PIANO DI SEDIME (fonte 6). Le due assonometrie poggiano il complesso su una piastra
       disegnata con il bordo a gradino. Misurata rettificando l'assonometria 1 nel piano della
       pianta (vedi fonte 6 per il metodo) e leggendo i bordi come rette di quota 0:
         bordo esterno  a da -5,8 a 88,5 e b da -0,5 a 81,8  -> 94,3 x 82,3 m
         gradino interno a da -1,3 a 83,3 e b da  2,7 a 80,6
       Le coordinate di pianta del disegno (a, b) entrano nella terna locale del modulo con
       x = a - 38,28 e z = 44,29 - b: la traslazione fa coincidere il centro della piastra con
       il centro dell'ingombro dell'anello OSM di CU013, che resta il riferimento di posizione
       e orientamento nel mondo. Lo spessore della piastra e l'alzata del gradino si leggono
       sul disegno come coppie di rette parallele distanti 0,5-1,2 m in b, cioè 0,6-1,4 m di
       altezza: valori troppo incerti per essere dichiarati misurati, qui 0,9 e 0,5 m. */
    SED_ON = P.SED_ON ?? true;
    SED_X0 = P.SED_X0 ?? -44.1; SED_X1 = P.SED_X1 ?? 50.2;
    SED_Z0 = P.SED_Z0 ?? -37.5; SED_Z1 = P.SED_Z1 ?? 44.8;
    SED_H = P.SED_H ?? 0.9; SED_IN = P.SED_IN ?? 4.5; SED_STEP = P.SED_STEP ?? 0.5;
    // corpi a quota diversa: 0 = non modellati, vedi intestazione
    H_OVEST = P.H_OVEST ?? 0; X_OVEST = P.X_OVEST ?? -29.6;
    H_EST = P.H_EST ?? 0; X_EST = P.X_EST ?? 13.6;
  }

  function whenReady(fn) {
    const c = window.campus3d;
    if (window.MAPPA3D_READY === true && typeof THREE !== 'undefined' && c && c.scene
      && typeof c.project === 'function' && c.scene.getObjectByName('edifici')) fn(c);
    else setTimeout(() => whenReady(fn), 500);
  }

  /* Litoceramica: listelli rettangolari posati a corsi orizzontali sfalsati, giunti chiari
     sottili. Il riquadro disegnato vale TILE_L metri di lato, così il repeat si calcola in metri. */
  const TILE_L = 3.0;
  function litoceramicaTexture() {
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d');
    const rows = 24, rh = S / rows, cols = 6, cw = S / cols; // corsi di 12,5 cm, listelli di 50 cm
    g.fillStyle = '#e6d8c0'; g.fillRect(0, 0, S, S); // fondo = colore dei giunti
    for (let r = 0; r < rows; r += 1) {
      const off = (r % 2) * cw * 0.5;
      for (let i = -1; i <= cols; i += 1) {
        const x = i * cw + off, t = 0.9 + Math.random() * 0.2;
        const base = (r + i) % 3 === 0 ? [199, 149, 92] : [214, 166, 107]; // #c7955c e #d6a66b
        g.fillStyle = `rgb(${Math.round(base[0] * t)},${Math.round(base[1] * t)},${Math.round(base[2] * t)})`;
        g.fillRect(x + 0.9, r * rh + 0.9, cw - 1.8, rh - 1.8);
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
    return tex;
  }

  /* Travertino a corsi regolari per zoccolo, coronamento e pavimentazioni. */
  function travertinoTexture(rows, cols, tile) {
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d');
    const rh = S / rows, cw = S / cols;
    g.fillStyle = '#b3a890'; g.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r += 1) {
      for (let i = 0; i < cols; i += 1) {
        const t = 0.93 + Math.random() * 0.12;
        g.fillStyle = `rgb(${Math.round(222 * t)},${Math.round(212 * t)},${Math.round(192 * t)})`;
        g.fillRect(i * cw + 1.1, r * rh + 1.1, cw - 2.2, rh - 2.2);
        for (let k = 0; k < 14; k += 1) { // pori e venature, appena accennati
          const vx = i * cw + 2 + Math.random() * (cw - 6), vy = r * rh + 2 + Math.random() * (rh - 6);
          g.fillStyle = `rgba(150,138,116,${0.05 + Math.random() * 0.1})`;
          g.fillRect(vx, vy, 2 + Math.random() * 7, 1 + Math.random() * 2);
        }
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
    tex.userData = { tile: tile };
    return tex;
  }

  /* --- geometria di servizio sugli anelli dell'impronta --- */
  function inRing(ring, x, z) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [xi, zi] = ring[i], [xj, zj] = ring[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
    }
    return hit;
  }
  /* Normale unitaria del lato i verso lo spazio aperto: fuori dall'anello esterno,
     dentro l'anello di una corte. */
  function openNormal(ring, i, hole) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    let nx = -dz / L, nz = dx / L;
    const inside = inRing(ring, (a[0] + b[0]) / 2 + nx * 0.4, (a[1] + b[1]) / 2 + nz * 0.4);
    if (inside !== !!hole) { nx = -nx; nz = -nz; }
    return [nx, nz];
  }

  function build(c) {
    readParams();
    const scene = c.scene;
    const std = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.95, metalness: 0 }, extra));

    /* Colori: la scena è molto luminosa, quindi i materiali modulano le texture verso il basso.
       0xbe9058 sul giallo della palette «giallo» di campus-3d restituisce la litoceramica senza
       bruciare i giunti; 0xcbc0a8 è lo stesso travertino di matematica-castelnuovo.js. */
    const baseLito = litoceramicaTexture();
    const LITO_COL = P.LITO_COL ?? 0xbe9058;
    const lito = (wM, hM) => {
      const t = baseLito.clone(); t.needsUpdate = true;
      t.repeat.set(Math.max(0.2, wM / TILE_L), Math.max(0.2, hM / TILE_L));
      return std(LITO_COL, { map: t, roughness: 0.88 });
    };
    /* Facce verticali dell'estrusione: ExtrudeGeometry genera le UV dei fianchi già in metri
       (WorldUVGenerator), quindi il repeat è 1/TILE_L e non il rapporto usato sui box. */
    const litoExtr = baseLito.clone(); litoExtr.needsUpdate = true;
    litoExtr.repeat.set(1 / TILE_L, 1 / TILE_L);
    const litoWall = std(LITO_COL, { map: litoExtr, roughness: 0.88 });
    const baseTrav = travertinoTexture(6, 4, 3.0);
    const TRAV_COL = P.TRAV_COL ?? 0xcbc0a8;
    const trav = (wM, hM, tex, tile) => {
      const t = (tex || baseTrav).clone(); t.needsUpdate = true;
      const s = tile || 3.0;
      t.repeat.set(Math.max(0.2, wM / s), Math.max(0.2, hM / s));
      return std(TRAV_COL, { map: t, roughness: 0.9 });
    };
    const travPlain = std(P.TRAV_PLAIN ?? 0xc8bda6, { roughness: 0.92 });
    const travDark = std(P.TRAV_DARK ?? 0x9c9280, { roughness: 0.95 });
    const shadow = std(0x2d2b27, { roughness: 1 });
    const glassDark = std(P.VETRO ?? 0x2a373d, { roughness: 0.2, metalness: 0.2 });
    const metal = std(0x8e918d, { roughness: 0.5, metalness: 0.25 });
    const roofMat = std(P.ROOF ?? 0x8d877c, { roughness: 1 }); // guaina chiara: al sole della scena un grigio piu' alto esce bianco
    const corteMat = std(P.CORTE ?? 0x51603a, { roughness: 1 }); // corte piantumata (ortofoto AGEA 2020): verde basso, al sole della scena un verde piu' alto esce slavato
    const lastre = trav(1, 1, travertinoTexture(Math.round(3 / LASTRA), Math.round(3 / LASTRA), 3), 3);

    const group = new THREE.Group(); group.name = 'fisica-marconi';
    const dE = U[0] * X_MID - NOUT[0] * Z_MID;
    const dN = U[1] * X_MID - NOUT[1] * Z_MID;
    const origin = c.project([REF.lon + dE / (111320 * Math.cos(REF.lat * Math.PI / 180)),
      REF.lat + dN / 111320]);
    group.position.set(origin.x, 0, origin.z);
    group.rotation.y = Math.atan2(U[1], U[0]);

    const box = (x0, x1, y0, y1, z0, z1, mat, name) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      if (name) m.name = name;
      group.add(m); return m;
    };
    /* flat(pts, y, mat, h, name, holes) — poligono orizzontale in pianta, eventualmente estruso.
       pts e holes sono elenchi di coppie [x, z] nel riferimento locale. */
    const flat = (pts, y, mat, h, name, holes) => {
      const mk = (list) => {
        const p = new THREE.Path();
        list.forEach(([x, z], i) => (i ? p.lineTo(x, -z) : p.moveTo(x, -z)));
        p.closePath(); return p;
      };
      const s = new THREE.Shape();
      pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
      s.closePath();
      if (holes) holes.forEach((hl) => s.holes.push(mk(hl)));
      const geo = h ? new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }) : new THREE.ShapeGeometry(s);
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2; m.position.y = y;
      if (name) m.name = name;
      group.add(m); return m;
    };
    /* banda(ring, y0, y1, out, mat) — fascia continua di pietra lungo tutti i lati dell'anello,
       sporgente di «out» dal filo del muro: serve per zoccolo e coronamento, che su una pianta
       così articolata non si possono ottenere con un semplice offset del poligono. */
    const banda = (ring, y0, y1, out, mat, hole, name) => {
      for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
        if (L < 0.2) continue;
        const [nx, nz] = openNormal(ring, i, hole);
        const dep = out + 0.7, off = out - dep / 2;
        const m = new THREE.Mesh(new THREE.BoxGeometry(L + out * 2, y1 - y0, dep), mat);
        m.position.set((a[0] + b[0]) / 2 + nx * off, (y0 + y1) / 2, (a[1] + b[1]) / 2 + nz * off);
        m.rotation.y = Math.atan2(-dz / L, dx / L);
        m.name = name || 'fascia'; m.raycast = () => {};
        group.add(m);
      }
    };

    /* ---------------- impronta con la rientranza dell'ingresso ----------------
       L'impronta OSM resta il riferimento di pianta; l'unica modifica è l'intaglio verticale
       letto sulle assonometrie all'angolo rientrante [13,61 / 13,83], inserito fra quel vertice
       e il successivo. L'intaglio va a terra e attraversa tutta l'altezza: la balconata lo
       chiude solo al primo piano, non lo tampona. Le due ali che lo abbracciano sono quelle
       dell'impronta: a ovest il corpo che scende verso z = 33,67, a est il muro z = 13,84. */
    const REC_X1 = REC_X0 + REC_W, REC_Z0 = 13.84 - REC_D, REC_Z1 = 13.84;
    const RING_REC = [];
    RING_OUT.forEach((v) => {
      RING_REC.push(v);
      if (Math.abs(v[0] - 13.61) < 0.01 && Math.abs(v[1] - 13.83) < 0.01) {
        RING_REC.push([REC_X0, REC_Z0], [REC_X1, REC_Z0], [REC_X1, REC_Z1]);
      }
    });

    /* ---------------- massa muraria ----------------
       Estrusione dell'impronta OSM, corte e pozzo di luce compresi, fino all'imposta della
       fascia di coronamento. Le facce verticali prendono la litoceramica con UV in metri. */
    const H_MURO = H - H_CORN;
    /* Ritaglio del contorno fra due piani verticali (Sutherland-Hodgman): serve a far
       salire solo il corpo principale sopra la quota delle testate. */
    const clipX = (ring, xmin, xmax) => {
      let out = ring.slice();
      [[1, xmin], [-1, -xmax]].forEach(([sgn, lim]) => {
        const src = out; out = [];
        for (let i = 0; i < src.length; i += 1) {
          const a = src[i], b = src[(i + 1) % src.length];
          const da = sgn * a[0] - lim, db = sgn * b[0] - lim;
          if (da >= 0) out.push(a);
          if ((da >= 0) !== (db >= 0)) {
            const t = da / (da - db);
            out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
          }
        }
      });
      return out;
    };
    /* Zoccolo comune fino alla gronda delle testate, poi il corpo principale, poi il corpo alto. */
    const massa = flat(RING_REC, 0, [roofMat, litoWall], H_TESTATE - H_CORN, 'massa-testate',
      [RING_CORTE, RING_POZZO]);
    massa.castShadow = true; massa.receiveShadow = true;
    const RING_PRINC = clipX(RING_REC, TESTATA_O, TESTATA_E);
    const principale = flat(RING_PRINC, H_TESTATE - H_CORN, [roofMat, litoWall],
      H_MURO - (H_TESTATE - H_CORN), 'massa-muraria', [RING_CORTE, RING_POZZO]);
    principale.castShadow = true; principale.receiveShadow = true;
    box(TORRE[0], TORRE[2], H_MURO, H_TORRE - H_CORN, TORRE[1], TORRE[3],
      [litoWall, litoWall, roofMat, roofMat, litoWall, litoWall], 'corpo-alto');
    box(TORRE[0] - CORN_OUT, TORRE[2] + CORN_OUT, H_TORRE - H_CORN, H_TORRE,
      TORRE[1] - CORN_OUT, TORRE[3] + CORN_OUT, travPlain, 'coronamento-corpo-alto');
    /* Coronamento e copertura delle due testate, alla loro quota. */
    [clipX(RING_REC, -99, TESTATA_O), clipX(RING_REC, TESTATA_E, 99)].forEach((r, i) => {
      if (r.length > 2) {
        banda(r, H_TESTATE - H_CORN, H_TESTATE, CORN_OUT, travPlain, false, 'coronamento-testata-' + i);
        flat(r, H_TESTATE - H_CORN + 0.05, roofMat, 0, 'copertura-testata-' + i).receiveShadow = true;
      }
    });

    /* Zoccolo in travertino e fascia di coronamento, su tutti e tre gli anelli. */
    banda(RING_REC, 0, H_ZOCC, ZOCC_OUT, travDark, false, 'zoccolo');
    banda(RING_CORTE, 0, H_ZOCC, ZOCC_OUT, travDark, true, 'zoccolo-corte');
    banda(RING_REC, H_MURO, H, CORN_OUT, travPlain, false, 'coronamento');
    banda(RING_CORTE, H_MURO, H, CORN_OUT * 0.6, travPlain, true, 'coronamento-corte');
    banda(RING_POZZO, H_MURO, H, CORN_OUT * 0.6, travPlain, true, 'coronamento-pozzo');

    /* Copertura piana praticabile dentro il parapetto formato dal coronamento. */
    flat(RING_REC, H_MURO + 0.05, roofMat, 0, 'copertura', [RING_CORTE, RING_POZZO]).receiveShadow = true;

    /* Corte centrale e pozzo di luce: la corte è piantumata (ortofoto AGEA 2020), con una
       fascia lastricata lungo i muri; il pozzo resta un fondo in pietra. */
    flat(RING_CORTE, 0.05, corteMat, 0, 'corte-verde');
    flat(RING_POZZO, 0.05, travDark, 0, 'fondo-pozzo');

    /* ---------------- finestre ----------------
       Un'apertura per campata e per piano, passo WIN_PITCH, centrate sul lato. Ogni finestra è
       un unico volume scuro incassato nel muro: lo sguancio che ne nasce è ciò che fa leggere
       l'apertura, senza cornici in rilievo che le fonti non documentano. */
    const winGeo = new THREE.BoxGeometry(WIN_W, WIN_H, WIN_DEP);
    const sills = SILLS.slice(0, PIANI);
    let nwin = 0;
    const fileDiFinestre = (ring, hole) => {
      for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
        if (L < WIN_PITCH * 1.5) continue; // i risvolti corti non prendono la fila
        const ux = dx / L, uz = dz / L;
        const [nx, nz] = openNormal(ring, i, hole);
        const n = Math.floor(L / WIN_PITCH);
        const start = (L - (n - 1) * WIN_PITCH) / 2;
        const ang = Math.atan2(-uz, ux);
        // il fronte dell'ingresso è ora il fondo del rientro (z = REC_Z0), non più z = 13,84
        const fronteIngresso = !hole && Math.abs(nz - 1) < 0.01 && Math.abs(a[1] - REC_Z0) < 0.4;
        for (let k = 0; k < n; k += 1) {
          const t = start + k * WIN_PITCH;
          const cx = a[0] + ux * t, cz = a[1] + uz * t;
          if (fronteIngresso && Math.abs(cx - X_ENTR) < (DOOR_W + WIN_W) / 2 + 0.3) continue;
          sills.forEach((y0) => {
            const m = new THREE.Mesh(winGeo, glassDark);
            // lo scasso sta dentro il muro e affiora di 2 cm: e' lo spessore del rivestimento
            // a far leggere l'apertura, senza cornici in rilievo che le fonti non documentano
            const off = 0.02 - WIN_DEP / 2;
            m.position.set(cx + nx * off, y0 + WIN_H / 2, cz + nz * off);
            m.rotation.y = ang; m.name = 'finestra'; m.raycast = () => {};
            group.add(m); nwin += 1;
          });
        }
      }
    };
    fileDiFinestre(RING_REC, false);
    fileDiFinestre(RING_CORTE, true);

    /* ---------------- piazzale rialzato, scalinata e ingresso ----------------
       Stanno nell'intaglio sud-est dell'impronta, davanti al muro z = 13,84. Il piazzale è
       lastricato in travertino con lastre quadrate di 60 cm (misura documentata); la scalinata
       scende verso il piazzale della Minerva. */
    const PX0 = 13.61, PX1 = 48.09, PZ0 = 13.84;
    /* Il piazzale entra anche dentro il rientro, fino al fondo: l'ingresso sta in fondo al
       rientro e ci si arriva camminando sul lastricato, non su un gradino intermedio. */
    flat([[REC_X0, REC_Z0], [REC_X1, REC_Z0], [REC_X1, PZ0], [PX1, PZ0], [PX1, PLAT_Z], [PX0, PLAT_Z]],
      0, lastre, PLAT_H, 'piazzale-travertino').receiveShadow = true;
    /* Scalinata: NON corre per tutti i 34,5 m del fronte, come stava qui prima.
       La pianta del piano terreno di Pagano (ArchiDiAP, stessa serie dei prospetti, barra di
       scala 10,15 px/m) e il disegno assonometrico mostrano un piazzale rialzato molto piu'
       profondo di quanto fosse modellato, con i gradini sui TRE lati liberi - ovest, sud ed
       est - e non una gradinata unica contro l'edificio. Il bordo sud misurato cade a
       z = 37,1, da cui PLAT_Z. */
    const SH = PLAT_H / STEPS;
    for (let k = 0; k < STEPS; k += 1) {
      const d = (STEPS - k) * 0.36, y0 = k * SH, y1 = (k + 1) * SH;
      box(PX0 - d, PX1 + d, y0, y1, PLAT_Z - 0.01, PLAT_Z + d, travPlain, 'gradino-sud');
      box(PX0 - d, PX0 + 0.01, y0, y1, PZ0, PLAT_Z, travPlain, 'gradino-ovest');
      box(PX1 - 0.01, PX1 + d, y0, y1, PZ0, PLAT_Z, travPlain, 'gradino-est');
    }

    /* Aiuola al centro del piazzale, con il cordolo in travertino, e le panchine di pietra
       che le corrono accanto: il rettangolo interno del disegno assonometrico e le sagome
       tonde allineate lungo il suo lato. Sette panchine, come indicato. Misure del cordolo
       lette sulla pianta: x 25,7-43,5 e z 21,8-28,2. */
    const AI = [25.7, 21.8, 43.5, 28.2], CORD = 0.35, AI_H = 0.45;
    box(AI[0], AI[2], 0, PLAT_H + AI_H, AI[1], AI[3], travPlain, 'aiuola-cordolo');
    flat([[AI[0] + CORD, AI[1] + CORD], [AI[2] - CORD, AI[1] + CORD],
      [AI[2] - CORD, AI[3] - CORD], [AI[0] + CORD, AI[3] - CORD]],
      PLAT_H + AI_H - 0.06, corteMat, 0, 'aiuola-verde');
    const PAN_N = 7, PAN_L = 1.8, PAN_P = 0.55, PAN_H = 0.45, PAN_Z = AI[1] - 1.5;
    for (let k = 0; k < PAN_N; k += 1) {
      const cx = AI[0] + (AI[2] - AI[0]) * (k + 0.5) / PAN_N;
      box(cx - PAN_L / 2, cx + PAN_L / 2, PLAT_H, PLAT_H + PAN_H,
        PAN_Z - PAN_P / 2, PAN_Z + PAN_P / 2, travPlain, 'panchina');
    }

    // vano d'ingresso: fondo scuro, porte vetrate partite da montanti, pensilina piatta sopra
    /* La massa e' un'estrusione piena: la profondita' dell'incasso si legge solo dal fronte,
       quindi il vano e' una campitura scura a filo e porte e montanti stanno appena davanti. */
    /* Porta e soglia stanno sul fondo del rientro, z = REC_Z0, non più sul filo z = 13,84. */
    box(X_ENTR - DOOR_W / 2, X_ENTR + DOOR_W / 2, PLAT_H, PLAT_H + DOOR_H,
      REC_Z0 - 0.3, REC_Z0 + 0.02, shadow, 'vano-ingresso');
    const porta = box(X_ENTR - DOOR_W / 2 + 0.3, X_ENTR + DOOR_W / 2 - 0.3, PLAT_H + 0.02, PLAT_H + DOOR_H - 0.5,
      REC_Z0 + 0.02, REC_Z0 + 0.06, glassDark, 'porta');
    porta.raycast = () => {};
    for (let k = 0; k <= 6; k += 1) {
      const x = X_ENTR - DOOR_W / 2 + 0.3 + (DOOR_W - 0.6) * (k / 6);
      box(x - 0.05, x + 0.05, PLAT_H + 0.02, PLAT_H + DOOR_H - 0.5, REC_Z0 + 0.04, REC_Z0 + 0.1, metal, 'montante-porta');
    }
    // soglia in travertino sotto la porta, a filo del piazzale
    box(X_ENTR - DOOR_W / 2 - 0.3, X_ENTR + DOOR_W / 2 + 0.3, PLAT_H - 0.06, PLAT_H + 0.02,
      REC_Z0 - 1.1, REC_Z0 + 0.9, travPlain, 'soglia');
    if (PENS_W > 0) {
      box(X_ENTR - PENS_W / 2, X_ENTR + PENS_W / 2, PENS_Y, PENS_Y + PENS_T,
        REC_Z0 - 0.1, REC_Z0 + PENS_D, travPlain, 'pensilina');
    }

    /* ---------------- portico su pilotis attorno alla corte ----------------
       La pianta del piano terreno di Pagano mostra i quattro lati della corte scanditi da
       pilastri quadrati ravvicinati: è il porticato che le fonti chiamano «collegamento su
       pilotis». Sezione e passo sono letti sul disegno, 0,5 m di lato e circa 4 m di passo;
       l'altezza è quella del primo solaio. Dove il passo non entra intero nel lato, i
       pilastri si distribuiscono in modo uniforme invece di lasciare un vuoto in fondo. */
    const PIL_L = 0.5, PIL_PASSO = 4.0, PIL_H = SILLS.length > 1 ? SILLS[1] - 0.3 : 3.6;
    for (let i = 0; i < RING_CORTE.length; i += 1) {
      const a = RING_CORTE[i], b = RING_CORTE[(i + 1) % RING_CORTE.length];
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      if (L < PIL_PASSO) continue;
      const n = Math.max(2, Math.round(L / PIL_PASSO));
      for (let k = 0; k <= n; k += 1) {
        const t = k / n;
        const cx = a[0] + dx * t, cz = a[1] + dz * t;
        box(cx - PIL_L / 2, cx + PIL_L / 2, 0, PIL_H, cz - PIL_L / 2, cz + PIL_L / 2,
          travPlain, 'pilastro-corte');
      }
    }

    /* ---------------- balconata del primo piano dentro il rientro ----------------
       Lastra orizzontale che chiude il rientro alla quota del primo piano, quasi quadrata
       (REC_W × REC_D, misurati sull'assonometria 1) e appoggiata sui tre muri del rientro:
       il disegno non mostra mensole né pilastri sotto, e non ne vengono inventati. Il
       parapetto corre sul solo lato aperto, verso il piazzale. */
    /* Materiali letti sulla foto dell'ingresso (ArchiDiAP, Vista-ingresso_3): il parapetto
       è rivestito della stessa litoceramica del muro, con coronamento e fascia della lastra
       in travertino chiaro; il sottobalcone è liscio e chiaro, e le pareti del rientro sono
       lastre di travertino, non litoceramica. Prima erano tutti travertino piatto. */
    const soffitto = std(P.SOFFITTO ?? 0xd8d3c9, { roughness: 0.95 });
    const travBalc = trav(REC_W, REC_D, travertinoTexture(120, 120, 2), 2);
    //            +x        -x        +y         -y         +z        -z
    box(REC_X0, REC_X1, BALC_Y - BALC_T, BALC_Y, REC_Z0, REC_Z1,
      [travBalc, travBalc, travPlain, soffitto, travBalc, travBalc], 'balconata');
    box(REC_X0, REC_X1, BALC_Y, BALC_Y + PAR_H, REC_Z1 - PAR_T, REC_Z1,
      [litoWall, litoWall, travPlain, travPlain, litoWall, soffitto], 'parapetto-balconata');
    /* Rivestimento in travertino delle tre pareti del rientro, fino alla quota della lastra. */
    const SP = 0.06;
    box(REC_X0, REC_X0 + SP, 0, BALC_Y - BALC_T, REC_Z0, REC_Z1, travBalc, 'rientro-parete-ovest');
    box(REC_X1 - SP, REC_X1, 0, BALC_Y - BALC_T, REC_Z0, REC_Z1, travBalc, 'rientro-parete-est');
    box(REC_X0, REC_X1, 0, BALC_Y - BALC_T, REC_Z0, REC_Z0 + SP, travBalc, 'rientro-fondo');

    /* ---------------- piano di sedime ----------------
       Piastra su cui poggia il complesso, con il bordo a gradino, come nei due disegni.
       Sta sotto l'edificio e non lo interseca: il suo estradosso è la quota 0 del modulo. */
    if (SED_ON) {
      flat([[SED_X0, SED_Z0], [SED_X1, SED_Z0], [SED_X1, SED_Z1], [SED_X0, SED_Z1]],
        -SED_H - SED_STEP, trav(SED_X1 - SED_X0, SED_Z1 - SED_Z0), SED_H, 'sedime').receiveShadow = true;
      flat([[SED_X0 + SED_IN, SED_Z0 + SED_IN], [SED_X1 - SED_IN, SED_Z0 + SED_IN],
        [SED_X1 - SED_IN, SED_Z1 - SED_IN], [SED_X0 + SED_IN, SED_Z1 - SED_IN]],
        -SED_STEP, travPlain, SED_STEP, 'sedime-gradino').receiveShadow = true;
    }

    group.traverse((o) => {
      if (o.isMesh && o.name !== 'finestra') { o.castShadow = true; o.receiveShadow = true; }
    });
    group.renderOrder = 2;
    scene.add(group);

    /* ---------------- visibilità e sostituzione dell'estrusione OSM ----------------
       Come matematica-castelnuovo.js con CU006: questo modulo prende il posto dell'estrusione
       OSM di CU013 senza toccare campus-3d.js, nascondendo le sole Mesh dell'edificio (non le
       LineSegments del contorno, che servono all'evidenziazione quando l'utente lo seleziona) e
       ripristinandole appena il gruppo si spegne. Si ricontrolla a intervalli perché campus-3d
       ricostruisce il gruppo «edifici» al cambio di vista, editor o palette delle facciate. */
    const CODE = 'CU013';
    const sync = () => {
      const ex = scene.getObjectByName('minerva'), ed = scene.getObjectByName('edifici');
      const on = !group.userData.force && (ex ? ex.visible : true) && (ed ? ed.visible : true);
      group.visible = on;
      if (!ed) return;
      ed.traverse((o) => {
        if (!o.isMesh) return;
        const u = o.userData || {};
        if (u.code === CODE || u.facadeCode === CODE) {
          if (on) { if (o.visible) { o.userData.marconiHidden = true; o.visible = false; } }
          else if (o.userData.marconiHidden) { o.userData.marconiHidden = false; o.visible = true; }
        }
      });
    };
    sync(); setInterval(sync, 250);
    group.userData.finestre = nwin;
    window.campus3d.fisicaMarconi = group;
  }

  whenReady(build);
})();
