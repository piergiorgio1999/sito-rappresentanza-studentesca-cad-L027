/* Modello esterno del fondale monumentale: CU001 Rettorato, CU002 Giurisprudenza,
   CU003 Lettere. Le impronte e gli orientamenti vengono da campus-buildings.json (OSM);
   le facciate seguono le tavole e le schede ArchiDiAP citate nel README. Le quote verticali
   non quotate nelle fonti sono stime dichiarate nei parametri qui sotto. */
(function () {
  'use strict';

  const PLAZA_PDF = [292.5, 536.6]; // Minerva, coordinata della planimetria già usata dalla scena
  const BUILDINGS = [
    { code: 'CU001', name: 'rettorato', ref: [12.515402902979984, 41.90313092487172],
      ring: [[12.5155725,41.9034723],[12.5156215,41.903377],[12.5156952,41.9032992],
        [12.5157384,41.9032377],[12.5157631,41.9031768],[12.5157866,41.9030556],
        [12.5158359,41.9029596],[12.5153753,41.9028285],[12.5153578,41.9028624],
        [12.5152189,41.9028227],[12.5151626,41.9029322],[12.5151221,41.9029207],
        [12.5150908,41.9029815],[12.5150463,41.9029689],[12.5150192,41.9030216],
        [12.5149906,41.9030773],[12.5150321,41.9030892],[12.5150003,41.903151],
        [12.5150425,41.903163],[12.5149867,41.9032716],[12.5151361,41.9033141],
        [12.5151209,41.9033437]],
      base: 1.5, floors: 5, floorH: 3.25, bay: 3.1, winW: 1.2, winH: 1.65, frontSkip: 10 },
    { code: 'CU002', name: 'giurisprudenza', ref: [12.514977668128887, 41.904112954864935],
      ring: [[12.5151471,41.9048493],[12.5144726,41.9046619],[12.5146022,41.9044036],
        [12.5147199,41.904169],[12.5150683,41.9042659],[12.5151082,41.9041864],
        [12.5151212,41.9041604],[12.5151859,41.9040316],[12.5148403,41.9039355],
        [12.5148837,41.9038491],[12.5145289,41.9037505],[12.5146133,41.9035823],
        [12.5146928,41.9034238],[12.5147013,41.9034069],[12.5148979,41.9034615],
        [12.5150403,41.9035011],[12.5155946,41.9036551],[12.5155221,41.9037995],
        [12.5150775,41.9036759],[12.5150474,41.9037358],[12.5150184,41.9037936],
        [12.5154545,41.9039148],[12.5153946,41.9040268],[12.5150807,41.9046599],
        [12.5152224,41.9046993]],
      base: 0.8, floors: 3, floorH: 3.5, bay: 4.6, winW: 1.55, winH: 1.8, frontSkip: 3.1 },
    { code: 'CU003', name: 'lettere', ref: [12.515785765081205, 41.90236890720733],
      ring: [[12.5151266,41.9025731],[12.5153207,41.9026258],[12.5154628,41.9026658],
        [12.5160127,41.902819],[12.5161208,41.9026033],[12.5163751,41.9020956],
        [12.5155821,41.9018755],[12.5155166,41.9020062],[12.5157895,41.9020819],
        [12.5157575,41.9021458],[12.5156769,41.9023066],[12.5153109,41.902205],
        [12.5152859,41.9022538]],
      base: 0.8, floors: 3, floorH: 3.5, bay: 4.6, winW: 1.55, winH: 1.8, frontSkip: 3.1 }
  ];

  function whenReady(fn) {
    const c = window.campus3d;
    if (window.MAPPA3D_READY === true && typeof THREE !== 'undefined' && c && c.scene
      && typeof c.project === 'function' && c.scene.getObjectByName('edifici')) fn(c);
    else setTimeout(() => whenReady(fn), 500);
  }

  function build(c, courtyardData) {
    const scene = c.scene;
    const mat = (color, extra) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.92, metalness: 0 }, extra));
    const stoneFront = mat(0xd3c8b5), trim = mat(0xa99a83);
    const sideFinish = mat(0xb8aca0), roof = mat(0x77736d), glass = mat(0x344047, { roughness: 0.22, metalness: 0.12 });
    const group = new THREE.Group(); group.name = 'fondale-monumentale';
    const plaza = c.pdfToWorld(PLAZA_PDF[0], PLAZA_PDF[1]);

    const flat = (g, pts, y, material, height, name, cutouts = []) => {
      const s = new THREE.Shape();
      pts.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
      s.holes = cutouts.map((ring) => {
        const hole = new THREE.Path();
        ring.forEach(([x, z], i) => (i ? hole.lineTo(x, -z) : hole.moveTo(x, -z)));
        return hole;
      });
      const geo = height ? new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false }) : new THREE.ShapeGeometry(s);
      const mesh = new THREE.Mesh(geo, material);
      mesh.rotation.x = -Math.PI / 2; mesh.position.y = y; mesh.name = name; g.add(mesh); return mesh;
    };
    const slab = (g, px, pz, dx, dz, nx, nz, len, thick, y0, y1, offset, material, name) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, y1 - y0, thick), material);
      mesh.position.set(px + nx * offset, (y0 + y1) / 2, pz + nz * offset);
      mesh.rotation.y = Math.atan2(-dz, dx); mesh.name = name; g.add(mesh); return mesh;
    };

    BUILDINGS.forEach((cfg) => {
      const origin = c.project(cfg.ref), points = cfg.ring.map((ll) => {
        const p = c.project(ll); return [p.x - origin.x, p.z - origin.z];
      });
      const holes = (courtyardData?.courtyards?.[cfg.code] || []).map((ring) => ring.map((ll) => {
        const p = c.project(ll); return [p.x - origin.x, p.z - origin.z];
      }));
      const localPlaza = [plaza.x - origin.x, plaza.z - origin.z];
      const building = new THREE.Group(); building.name = cfg.name;
      building.position.set(origin.x, 0, origin.z); group.add(building);
      const inside = (x, z) => {
        let hit = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
          const a = points[i], b = points[j];
          if ((a[1] > z) !== (b[1] > z) && x < a[0] + ((z - a[1]) / (b[1] - a[1])) * (b[0] - a[0])) hit = !hit;
        }
        return hit;
      };
      const edgeData = points.map((a, i) => {
        const b = points[(i + 1) % points.length], dx0 = b[0] - a[0], dz0 = b[1] - a[1];
        const len = Math.hypot(dx0, dz0) || 1, dx = dx0 / len, dz = dz0 / len;
        let nx = -dz, nz = dx;
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        if (inside(mx + nx * 0.4, mz + nz * 0.4)) { nx = -nx; nz = -nz; }
        const t = Math.max(0, Math.min(len, (localPlaza[0] - a[0]) * dx + (localPlaza[1] - a[1]) * dz));
        const dist = Math.hypot(a[0] + dx * t - localPlaza[0], a[1] + dz * t - localPlaza[1]);
        return { a, b, dx, dz, nx, nz, len, t, dist };
      });
      const frontIndex = edgeData.reduce((best, e, i) => e.dist < edgeData[best].dist ? i : best, 0);
      const front = edgeData[frontIndex], top = cfg.base + cfg.floors * cfg.floorH + 0.5;

      // Copertura sulla sagoma OSM: le corti restano aperte e gli edifici non diventano blocchi pieni.
      flat(building, points, top + 0.04, roof, 0.08, cfg.code + '-copertura', holes);

      edgeData.forEach((edge, i) => {
        if (edge.len < 2.4) return;
        const { a, dx, dz, nx, nz, len, t } = edge;
        // Fasce marcapiano e lesene: più fitte sul fronte monumentale.
        const isFront = i === frontIndex;
        const facadeMat = isFront ? stoneFront : sideFinish;
        [0, cfg.base, ...Array.from({ length: cfg.floors - 1 }, (_, n) => cfg.base + (n + 1) * cfg.floorH), top - 0.42].forEach((y) => {
          slab(building, a[0] + dx * len / 2, a[1] + dz * len / 2, dx, dz, nx, nz,
            len, 0.09, y, y + 0.09, 0.06, trim, 'fascia-marcapiano');
        });
        // Basamento e pareti sono costruiti per campate: gli intervalli finestrati sono vuoti,
        // non lastre scure applicate davanti a un solido. In questo modo il portico resta passante.
        slab(building, a[0] + dx * len / 2, a[1] + dz * len / 2, dx, dz, nx, nz,
          len, 0.10, 0, cfg.base, 0.04, isFront ? stoneFront : sideFinish, 'basamento-' + cfg.code);
        const bays = Math.max(1, Math.floor(len / cfg.bay));
        for (let b = 0; b < bays; b += 1) {
          const along = len * ((b + 0.5) / bays), cx = a[0] + dx * along, cz = a[1] + dz * along;
          const bayW = len / bays, width = Math.min(cfg.winW, bayW * 0.52);
          const isEntranceBay = isFront && Math.abs(along - t) < cfg.frontSkip;
          for (let f = 0; f < cfg.floors; f += 1) {
            const floorY = cfg.base + f * cfg.floorH;
            const hasOpening = !(isEntranceBay && f === 0);
            if (hasOpening) {
              const winBottom = floorY + 0.85, winTop = Math.min(floorY + cfg.floorH - 0.38, winBottom + cfg.winH);
              const pierW = Math.max(0.16, (bayW - width) / 2);
              [-1, 1].forEach((side) => slab(building, cx + dx * side * (width + pierW) / 2,
                cz + dz * side * (width + pierW) / 2, dx, dz, nx, nz, pierW, 0.10,
                floorY, floorY + cfg.floorH, 0.04, isFront ? stoneFront : sideFinish, 'pilastro-' + cfg.code));
              slab(building, cx, cz, dx, dz, nx, nz, width, 0.10, floorY, winBottom, 0.04,
                isFront ? stoneFront : sideFinish, 'davanzale-' + cfg.code);
              slab(building, cx, cz, dx, dz, nx, nz, width, 0.10, winTop, floorY + cfg.floorH, 0.04,
                isFront ? stoneFront : sideFinish, 'architrave-' + cfg.code);
              slab(building, cx, cz, dx, dz, nx, nz, width, 0.035, winBottom, winTop, 0.03,
                glass, 'finestra-' + cfg.code);
            } else if (isEntranceBay) {
              // Il fronte di CU001 rimane libero: pronao e scale sono già nella scena Minerva.
              // CU002/003 hanno un ingresso ricostruito nel blocco di portale sottostante.
              const keepPronaoOpen = cfg.code === 'CU001';
              if (keepPronaoOpen) continue;
              slab(building, cx - dx * bayW * 0.34, cz - dz * bayW * 0.34, dx, dz, nx, nz,
                bayW * 0.32, 0.10, floorY, floorY + cfg.floorH, 0.04, stoneFront, 'spalla-ingresso-' + cfg.code);
              slab(building, cx + dx * bayW * 0.34, cz + dz * bayW * 0.34, dx, dz, nx, nz,
                bayW * 0.32, 0.10, floorY, floorY + cfg.floorH, 0.04, stoneFront, 'spalla-ingresso-' + cfg.code);
            }
          }
          if (isFront && b > 0 && b < bays - 1 && b % 2 === 0 && cfg.code !== 'CU001') {
            slab(building, cx, cz, dx, dz, nx, nz, 0.28, 0.34, cfg.base,
              top - 0.35, 0.08, stoneFront, 'lesena-' + cfg.code);
          }
        }
      });

      const px = front.a[0] + front.dx * front.t, pz = front.a[1] + front.dz * front.t;
      const doorW = Math.max(3.2, cfg.frontSkip * 1.35);
      if (cfg.code !== 'CU001') {
        const doorH = 3.0;
        const door = slab(building, px, pz, front.dx, front.dz, front.nx, front.nz,
          doorW * 0.72, 0.035, cfg.base, cfg.base + doorH, 0.07, glass, 'ingresso-' + cfg.code);
        // Pronao e due corpi laterali del portale, coerenti con la facciata di Rapisardi.
        [-1, 1].forEach((side) => {
          slab(building, px + front.dx * side * (doorW * 0.66), pz + front.dz * side * (doorW * 0.66),
            front.dx, front.dz, front.nx, front.nz, 0.42, 0.5, cfg.base, cfg.base + 4.8,
            0.24, stoneFront, 'pilastro-portale-' + cfg.code);
        });
        slab(building, px, pz, front.dx, front.dz, front.nx, front.nz,
          doorW + 1.5, 0.55, cfg.base + 4.5, cfg.base + 5.05, 0.22, trim, 'trabeazione-' + cfg.code);

        // Scalinata anteriore: gradini ortogonali al fronte, con larghezza progressiva.
        const steps = 6, stepH = Math.min(0.18, cfg.base / (steps + 1)), depth = 0.46;
        for (let k = 0; k < steps; k += 1) {
          const outward = 0.28 + k * depth, yTop = cfg.base - (k + 1) * stepH;
          slab(building, px, pz, front.dx, front.dz, front.nx, front.nz,
            doorW + 2 + k * 0.55, depth, Math.max(0, yTop - stepH), yTop,
            outward + depth / 2, stoneFront, 'gradino-' + cfg.code);
        }
        // Bassorilievo di facciata: volume piatto e chiaro, senza inventare una figura scultorea.
        const relief = slab(building, px, pz, front.dx, front.dz, front.nx, front.nz,
          2.6, 0.12, cfg.base + 5.6, cfg.base + 7.8, 0.10, trim, 'bassorilievo-' + cfg.code);
        relief.raycast = () => {};
      } else {
        // Quattro sostegni e architrave del pronao; il vuoto centrale si allinea alla scalinata Minerva già modellata.
        [-0.43, -0.15, 0.15, 0.43].forEach((ratio) => {
          slab(building, px + front.dx * doorW * ratio, pz + front.dz * doorW * ratio,
            front.dx, front.dz, front.nx, front.nz, 0.72, 1.05, cfg.base, cfg.base + 5.4,
            0.22, stoneFront, 'pilastro-pronao-CU001');
        });
        slab(building, px, pz, front.dx, front.dz, front.nx, front.nz,
          doorW + 1.1, 0.75, cfg.base + 5.4, cfg.base + 6.05, 0.22, trim, 'architrave-pronao-CU001');
      }
    });

    group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.renderOrder = 2; scene.add(group);

    const sync = () => {
      const minerva = scene.getObjectByName('minerva'), edifici = scene.getObjectByName('edifici');
      const on = minerva ? minerva.visible : true;
      group.visible = on;
      if (!edifici) return;
      edifici.traverse((o) => {
        if (!o.isMesh) return;
        const code = String(o.userData?.code || o.userData?.facadeCode || '').toUpperCase();
        if (!['CU001', 'CU002', 'CU003'].includes(code)) return;
        if (on) { if (o.visible) { o.userData.monumentaleHidden = true; o.visible = false; } }
        else if (o.userData.monumentaleHidden) { o.userData.monumentaleHidden = false; o.visible = true; }
      });
    };
    sync(); setInterval(sync, 250);
    window.campus3d.fondaleMonumentale = group;
  }

  whenReady((c) => fetch('courtyards.json').then((response) => response.ok ? response.json() : null)
    .catch(() => null).then((data) => build(c, data)));
})();
