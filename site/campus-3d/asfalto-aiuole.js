/* Asfalto e aiuole di tutto il campus dalla mappa colorata a mano dal proprietario (issue #98):
   giallo = asfalto, verde = aiuola. I poligoni stanno in asfalto-aiuole.json, in coordinate della
   pagina PDF della planimetria ufficiale, generati da strumenti/asfalto-aiuole-build.mjs, e si
   convertono con campus3d.pdfToWorld, lo stesso allineamento dei volumi della planimetria.
   Quote: il terreno è a -0,12 e tutte le superfici già modellate (piazzali, stradone, raccordo,
   prati, marciapiedi) partono da +0,004. Asfalto a -0,05 e aiuole a -0,03 restano quindi SOTTO
   ogni superficie di dettaglio: riempiono i vuoti senza doppioni né compenetrazioni, e sotto gli
   edifici sono nascosti. Un solo mesh per strato. Visibile solo in 3D, come l'ingresso Aldo Moro. */
(function () {
  'use strict';
  const Y_ASFALTO = -0.05, Y_AIUOLE = -0.03;

  function whenReady(fn) {
    const c = window.campus3d;
    if (window.MAPPA3D_READY === true && typeof THREE !== 'undefined' && c && c.scene && typeof c.pdfToWorld === 'function' && c.scene.getObjectByName('edifici')) fn(c);
    else setTimeout(() => whenReady(fn), 500);
  }

  function layer(c, multi, y, color, name) {
    const shapes = [];
    for (const poly of multi) {
      const pts = (ring) => ring.map(([x, yy]) => { const p = c.pdfToWorld(x, yy); return new THREE.Vector2(p.x, -p.z); });
      const shape = new THREE.Shape(pts(poly[0]));
      for (const hole of poly.slice(1)) shape.holes.push(new THREE.Path(pts(hole)));
      shapes.push(shape);
    }
    const geometry = new THREE.ShapeGeometry(shapes, 1);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name; mesh.position.y = y; mesh.receiveShadow = true;
    return mesh;
  }

  function build(c) {
    fetch('asfalto-aiuole.json?v=1').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).then((data) => {
      const group = new THREE.Group(); group.name = 'asfalto-aiuole';
      if (Array.isArray(data.asfalto)) group.add(layer(c, data.asfalto, Y_ASFALTO, 0x4a4d50, 'asfalto-campus'));
      if (Array.isArray(data.aiuole)) group.add(layer(c, data.aiuole, Y_AIUOLE, 0x5f8a3e, 'aiuole-campus'));
      c.scene.add(group);
      const sync = () => {
        const ex = c.scene.getObjectByName('minerva'), ed = c.scene.getObjectByName('edifici');
        group.visible = (ex ? ex.visible : true) && (ed ? ed.visible : true);
      };
      sync(); setInterval(sync, 250);
      c.asfaltoAiuole = group;
    }).catch((e) => console.warn('asfalto-aiuole: non caricato', e));
  }

  whenReady(build);
})();
