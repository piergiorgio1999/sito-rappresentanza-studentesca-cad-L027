# Sito orari Scienze Chimiche — handoff

Deploy: Cloudflare Pages `orari-chimica.pages.dev`. Output directory: `site/`. Function: `functions/api/avvisi.js` (D1 binding, send_email, `ADMIN_SECRET`).

- `index.html`: the site, a single self-contained file.
- `artifact.html`: the copy published as the Claude artifact. Keep the two files aligned.

## Rules
- Use the Sapienza red `#822433`. Use the light theme only.
- The official Sapienza manuals are the source of truth. Do not invent tokens or fonts.
- The "WhatsApp" style applies only to the timetable canvas.
- Navigation:
  - The tabs are in the `TABS` array and are handled by `showTab(t,push)`.
  - Sidebar buttons go in `#sideNav` with `data-tab`.
  - Panels use `<section class="panel" id="tab-X" ... hidden>`.
- Watch out for TDZ errors: `draw()` runs at startup, so it must not reference `const` values declared later in the file.

## Pagine informative (in lavorazione su Issue #7)
Sono state aggiunte tre schede alla sidebar dopo "Lost media (Pelican story)": Safe Zone, DSA/ADHD/disabilità e Organigramma. Ogni scheda contiene riferimenti istituzionali; `index.html` e `artifact.html` devono restare allineati.

### Research already collected
**Safe Zone**
- It is part of the GEP, Area 5, Obiettivo 1: preventing gender-based harassment and violence.
- A Safe Zone is a listening point for sexual and gender minorities. "Ogni persona formata è una safe zone".
- Trained teaching staff, PTA staff and students display a Safe Zone sticker.
- A Safe Zone is not a guarantor, a counsellor or an adviser.
- Training is 2 modules of about 2 hours each:
  - Module 1: terminology and inclusive communication.
  - Module 2: sexism, toxic masculinity, prejudice, microaggressions.
- Target: at least 30 Safe Zones across the 11 Facoltà.
- Sources:
  - https://www.chem.uniroma1.it/sites/default/files/allegati/progetto%20SAFE%20ZONE%20Sapienza.pdf
  - https://server-v1.phys.uniroma1.it/sites/default/files/allegati/gep/Safe_zone-info.pdf
  - https://diap.web.uniroma1.it/sites/default/files/allegati/2025-02/01_Slides_Safe_Zone_Sapienza.pdf

**SMFN Facoltà — figure di garanzia** (https://smfn.web.uniroma1.it/it/figure-di-garanzia)
- Consigliera di fiducia: Dott.ssa Giorgia Ortu La Barbera, consiglierafiducia.sapienza@uniroma1.it
- Garante studenti di Facoltà: Prof.ssa Raffaella Schneider, garantesmfn@uniroma1.it
- Referente DSA e disabilità: Prof.ssa Grazia Daniela Raffa, referentedis.smfn@uniroma1.it, 06 4991 2842
- Progetto GENERACT: progetto.generact@gmail.com
- Centro Antiviolenza Sapienza (Telefono Rosa): cavsapienza@uniroma1.it, 366 5479783

**DSA** (https://www.uniroma1.it/it/pagina/i-servizi-gli-studenti-con-dsa)
- Office: Settore studenti con disabilità e DSA, servizio.dsa@uniroma1.it.
  - Address: CU002 Giurisprudenza, ground floor, rear entrance.
  - Head of office: Fabio Mollicone.
- How to register:
  - Send an email from your institutional address, with the certification and the signed GDPR form attached.
  - Declare the DSA on Infostud.
- Services:
  - Mediazione didattica: write to the Facoltà's Tutor per l'inclusione 10–15 days before the exam.
  - Appelli straordinari (Delibera SA 12/06/2018).
  - Peer tutoring: forms.gle/nGKHHE6seGBzEVDV8
  - Accessible books through the CSB.
  - Potenziamento cognitivo: dsapotenziamento.psicologia@uniroma1.it
  - Psychological support: dsasupporto.psicologia@uniroma1.it
  - Fee exemption: only the €16 revenue stamp and the regional tax are due. Refunds go through Infostud from 1/12/2025.
- Regulation: D.R. 1644 of 04/06/2025.

**ADHD / other BES** (https://www.uniroma1.it/it/pagina/i-servizi-studentesse-e-studenti-con-altri-bes)
- ADHD falls under neurodevelopmental disorders. This group also covers autism and other conditions, as well as diagnosed psychiatric disorders and invalidating medical conditions.
- The only service is mediation with teachers for exams. It provides methodological, instrumental or organisational flexibility.
- To request it, email the Facoltà's inclusion tutor. Legal basis: art. 6 of the regulation.

**Disabilità**
- Overview pages:
  - https://www.uniroma1.it/it/pagina/disabilita-e-dsa
  - https://www.uniroma1.it/it/pagina/settore-studenti-con-disabilita-e-dsa
- Services:
  - Orientation and support for admission tests.
  - Teacher mediation and peer tutoring.
  - Grants for monetary contributions, taxi vouchers and study aids.
  - Ausilioteca.
- Soglie confermate dalla pagina Sapienza sulle esenzioni: con riconoscimento ex art. 3, comma 1 o 3, Legge 104/1992 si paga solo il bollo da €16 e non la tassa regionale; con invalidità riconosciuta (anche inferiore al 66%) si è esonerati dai contributi universitari, ma si pagano bollo e tassa regionale. Con DSA certificato sono dovuti bollo e tassa regionale. Fonte: https://www.uniroma1.it/it/node/136590.

**Organi di Ateneo** (https://www.uniroma1.it/it/pagina/governo)
- Rettrice in carica: Antonella Polimeni. The election for 2026–2032 is in progress; the second ballot is scheduled for 13–16 October 2026. Do not publish a successor before official proclamation. Maria Sabrina Sarto withdrew on 12 October. Sources: https://www.uniroma1.it/it/node/539034 and https://www.uniroma1.it/it/node/550955.
- Prorettore vicario: Giuseppe Ciccarone.
- Senato Accademico: 35 members. Sets direction and planning, and checks teaching and research.
- CdA: 10 members. Handles financial and staff planning.
- Nucleo di valutazione: 9 members, including 2 students. Also acts as OIV. Coordinator for 2026–2029: Prof.ssa Giovanna Iannantuoni.
- Team Qualità (presidio AQ): coordinator Ersilia Barbato.
- Also: Collegio direttori di dipartimento, Collegio revisori dei conti, CUG (https://www.uniroma1.it/it/pagina/comitato-unico-di-garanzia), Prorettori e delegati.
- Direttrice generale: Loredana Segreto (dal 1 novembre 2024). Source: https://www.uniroma1.it/it/pagina/direttrice-generale.

**CAD Scienze Chimiche** (https://corsidilaurea.uniroma1.it/it/course/33605/organization)
- Presidente: Federico Marini.
- Docenti di riferimento: Scipioni, Di Stefano, Bodo, Bella, Bovino, D'Angelo.
- Tutor: Scipioni, Cavaliere, D'Abramo.
- Didactic contact: Dott.ssa Giulia Vollono, Segreteria didattica Chimica.

### Figure verificate per la scheda organigramma
- Preside SMFN: Gabriele Favero; Vicepreside vicaria: Marta Della Seta. https://smfn.web.uniroma1.it/it/preside
- Direttore Dipartimento di Chimica: Osvaldo Lanzalunga. https://chimica.web.uniroma1.it/it/node/6
- Referente accademica Erasmus Chimica: Ilaria Fratoddi; referente amministrativo di Facoltà: Francesco Serranò. https://chimica.web.uniroma1.it/it/erasmus
- CAD Scienze Chimiche: Federico Marini (presidente), Giulia Vollono (referente didattica). https://corsidilaurea.uniroma1.it/it/course/33605/organization
- Restano da approfondire con pagine/fonti dedicate: composizione attuale della Commissione paritetica del corso, Consiglio degli studenti e Comitato pari opportunità.
