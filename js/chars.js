/* 汐風GP — original racers: data, toon kart models, portraits */
(function () {
  'use strict';
  const G = window.G;
  const T = THREE;
  const M = G.M;

  G.CHARS = [
    { id: 'koro', name: 'コロ', kind: 'しばいぬ', kart: '#ff5a6e', accent: '#fff6ea', fur: '#eaa25a', sub: '#fff3e2', stats: { speed: 3, accel: 3, handling: 3, weight: 3 }, line: '何でもこなす、浜っ子の柴犬。' },
    { id: 'mimi', name: 'ミミ', kind: 'うさぎ', kart: '#ff8fc0', accent: '#fff6ea', fur: '#f7f2f6', sub: '#ffc3d8', stats: { speed: 2, accel: 5, handling: 4, weight: 1 }, line: 'スタートダッシュならおまかせ。' },
    { id: 'pon', name: 'ポン', kind: 'たぬき', kart: '#ffb54a', accent: '#2a1e48', fur: '#a77f5c', sub: '#f3e3cc', stats: { speed: 4, accel: 2, handling: 2, weight: 4 }, line: 'のんびり屋だけど直線は速い。' },
    { id: 'gin', name: 'ギン', kind: 'きつね', kart: '#35d3c3', accent: '#fff6ea', fur: '#f08a3c', sub: '#fff3e2', stats: { speed: 3, accel: 3, handling: 5, weight: 2 }, line: 'コーナーを舞う、ドリフトの名手。' },
    { id: 'penta', name: 'ペンタ', kind: 'ペンギン', kart: '#5ab8ff', accent: '#fff6ea', fur: '#2b2c44', sub: '#ffffff', stats: { speed: 3, accel: 4, handling: 3, weight: 2 }, line: '海風を読むのが得意な見習い。' },
    { id: 'gon', name: 'ゴン', kind: 'くま', kart: '#7cd67a', accent: '#2a1e48', fur: '#8b5e3c', sub: '#e7c9a3', stats: { speed: 5, accel: 1, handling: 2, weight: 5 }, line: '最高速はピカイチの力持ち。' },
    { id: 'mochi', name: 'モチ', kind: 'ねこ', kart: '#a493ff', accent: '#fff6ea', fur: '#fff0d8', sub: '#ffb3c4', stats: { speed: 3, accel: 4, handling: 4, weight: 2 }, line: '気まぐれだけど、器用な走り。' },
    { id: 'tako', name: 'タコ丸', kind: 'たこ', kart: '#ffd23f', accent: '#ff5a6e', fur: '#ff6b6b', sub: '#ffd1c4', stats: { speed: 4, accel: 3, handling: 3, weight: 3 }, line: '祭りのハチマキがトレードマーク。' },
  ];

  let toonMat = null, outlineMat = null;
  function mats() {
    if (!toonMat) {
      toonMat = new T.MeshToonMaterial({ vertexColors: true, gradientMap: G.Tex.toon });
      outlineMat = new T.MeshBasicMaterial({ color: 0x1c1330, side: T.BackSide });
    }
    return { toonMat, outlineMat };
  }

  // build both the colored mesh and an inverted-hull outline from a list of parts
  function build(parts, thick, cast) {
    const { toonMat, outlineMat } = mats();
    const mesh = new T.Mesh(G.mergeGeos(parts), toonMat);
    const oparts = parts.filter((p) => !p.noOutline).map((p) => {
      const g = p.geo.clone();
      g.computeBoundingSphere();
      const r = Math.max(0.05, g.boundingSphere.radius);
      const k = 1 + thick / r;
      g.scale(k, k, k);
      return { geo: g, matrix: p.matrix, color: '#000' };
    });
    const outline = new T.Mesh(G.mergeGeos(oparts), outlineMat);
    const grp = new T.Group();
    grp.add(mesh, outline);
    mesh.castShadow = !!cast;
    return grp;
  }

  function capsule(r, len) { return new T.CapsuleGeometry(r, len, 4, 10); }
  function sph(r, w, h) { return new T.SphereGeometry(r, w || 16, h || 12); }

  function headParts(c) {
    const P = [];
    const fur = c.fur, sub = c.sub, ink = '#1c1330';
    const eye = (x, y, z, s) => {
      P.push({ geo: sph(0.075 * (s || 1), 10, 8), matrix: M({ x, y, z, sz: 0.6 }), color: ink, noOutline: true });
      P.push({ geo: sph(0.026 * (s || 1), 6, 5), matrix: M({ x: x + 0.025, y: y + 0.03, z: z + 0.04 }), color: '#ffffff', noOutline: true });
    };
    switch (c.id) {
      case 'koro':
        P.push({ geo: sph(0.5), matrix: M({ sy: 0.92 }), color: fur });
        P.push({ geo: sph(0.3), matrix: M({ y: -0.14, z: 0.32, sx: 1.05, sy: 0.7, sz: 0.85 }), color: sub });
        for (const s of [-1, 1]) {
          P.push({ geo: new T.ConeGeometry(0.17, 0.32, 8), matrix: M({ x: s * 0.27, y: 0.45, z: -0.02, rz: -s * 0.35 }), color: fur });
          P.push({ geo: new T.ConeGeometry(0.09, 0.2, 8), matrix: M({ x: s * 0.265, y: 0.43, z: 0.05, rz: -s * 0.35, sz: 0.4 }), color: '#3b2a2a', noOutline: true });
          P.push({ geo: sph(0.07, 10, 8), matrix: M({ x: s * 0.15, y: 0.24, z: 0.43, sx: 1.25, sy: 0.75, sz: 0.4 }), color: sub, noOutline: true });
        }
        P.push({ geo: sph(0.065), matrix: M({ y: -0.04, z: 0.58 }), color: ink, noOutline: true });
        eye(-0.17, 0.08, 0.43); eye(0.17, 0.08, 0.43);
        break;
      case 'mimi':
        P.push({ geo: sph(0.5), matrix: M({ sy: 0.94 }), color: fur });
        for (const s of [-1, 1]) {
          P.push({ geo: capsule(0.11, 0.5), matrix: M({ x: s * 0.16, y: 0.76, z: -0.04, rz: -s * 0.18 }), color: fur });
          P.push({ geo: capsule(0.055, 0.42), matrix: M({ x: s * 0.17, y: 0.78, z: 0.05, rz: -s * 0.18 }), color: sub, noOutline: true });
        }
        P.push({ geo: sph(0.2), matrix: M({ y: -0.15, z: 0.36, sx: 1.2, sy: 0.75, sz: 0.7 }), color: '#ffffff' });
        P.push({ geo: sph(0.05), matrix: M({ y: -0.07, z: 0.5 }), color: '#ff7aa8', noOutline: true });
        eye(-0.18, 0.08, 0.42); eye(0.18, 0.08, 0.42);
        break;
      case 'pon':
        P.push({ geo: sph(0.52), matrix: M({ sy: 0.9, sx: 1.06 }), color: fur });
        for (const s of [-1, 1]) {
          P.push({ geo: sph(0.14), matrix: M({ x: s * 0.33, y: 0.38, sz: 0.6 }), color: '#5a4030' });
          P.push({ geo: sph(0.16), matrix: M({ x: s * 0.18, y: 0.06, z: 0.36, sx: 1.3, sy: 0.9, sz: 0.5, rz: s * 0.4 }), color: '#4a3a35', noOutline: true });
        }
        P.push({ geo: sph(0.26), matrix: M({ y: -0.16, z: 0.32, sx: 1.1, sy: 0.72, sz: 0.85 }), color: sub });
        P.push({ geo: sph(0.07), matrix: M({ y: -0.07, z: 0.56 }), color: ink, noOutline: true });
        eye(-0.18, 0.08, 0.46, 0.9); eye(0.18, 0.08, 0.46, 0.9);
        break;
      case 'gin':
        P.push({ geo: sph(0.48), matrix: M({ sy: 0.92 }), color: fur });
        for (const s of [-1, 1]) {
          P.push({ geo: new T.ConeGeometry(0.2, 0.44, 8), matrix: M({ x: s * 0.27, y: 0.5, rz: -s * 0.3 }), color: fur });
          P.push({ geo: new T.ConeGeometry(0.08, 0.16, 6), matrix: M({ x: s * 0.36, y: 0.68, rz: -s * 0.3 }), color: '#3b2a2a', noOutline: true });
        }
        P.push({ geo: sph(0.24), matrix: M({ y: -0.13, z: 0.36, sx: 1.0, sy: 0.65, sz: 1.2 }), color: sub });
        P.push({ geo: sph(0.06), matrix: M({ y: -0.08, z: 0.64 }), color: ink, noOutline: true });
        eye(-0.17, 0.08, 0.4); eye(0.17, 0.08, 0.4);
        break;
      case 'penta':
        P.push({ geo: sph(0.5), matrix: M({ sy: 0.96 }), color: fur });
        P.push({ geo: sph(0.36), matrix: M({ y: -0.04, z: 0.22, sx: 1.1, sy: 0.95, sz: 0.85 }), color: sub, noOutline: true });
        P.push({ geo: new T.ConeGeometry(0.1, 0.24, 8), matrix: M({ y: -0.08, z: 0.58, rx: Math.PI / 2 }), color: '#ffb54a' });
        [[-0.08, -0.35], [0.04, 0.05], [0.14, 0.4]].forEach(([x, rz]) => P.push({ geo: new T.ConeGeometry(0.07, 0.26, 6), matrix: M({ x, y: 0.55, z: -0.05, rz }), color: fur }));
        eye(-0.15, 0.1, 0.48); eye(0.15, 0.1, 0.48);
        break;
      case 'gon':
        P.push({ geo: sph(0.52), matrix: M({ sy: 0.92, sx: 1.04 }), color: fur });
        for (const s of [-1, 1]) {
          P.push({ geo: sph(0.15), matrix: M({ x: s * 0.36, y: 0.36, sz: 0.65 }), color: fur });
          P.push({ geo: sph(0.08), matrix: M({ x: s * 0.36, y: 0.36, z: 0.06, sz: 0.4 }), color: sub, noOutline: true });
        }
        P.push({ geo: sph(0.24), matrix: M({ y: -0.15, z: 0.36, sx: 1.15, sy: 0.75, sz: 0.85 }), color: sub });
        P.push({ geo: sph(0.08), matrix: M({ y: -0.06, z: 0.56, sy: 0.75 }), color: ink, noOutline: true });
        eye(-0.18, 0.1, 0.44, 0.85); eye(0.18, 0.1, 0.44, 0.85);
        break;
      case 'mochi':
        P.push({ geo: sph(0.5), matrix: M({ sy: 0.9, sx: 1.05 }), color: fur });
        for (const s of [-1, 1]) {
          P.push({ geo: new T.ConeGeometry(0.19, 0.3, 4), matrix: M({ x: s * 0.29, y: 0.44, rz: -s * 0.28, ry: Math.PI / 4 }), color: fur });
          P.push({ geo: new T.ConeGeometry(0.1, 0.18, 4), matrix: M({ x: s * 0.29, y: 0.45, z: 0.05, rz: -s * 0.28, ry: Math.PI / 4 }), color: sub, noOutline: true });
        }
        P.push({ geo: sph(0.05), matrix: M({ y: -0.06, z: 0.49, sy: 0.7 }), color: '#ff7aa8', noOutline: true });
        P.push({ geo: sph(0.22), matrix: M({ y: -0.14, z: 0.32, sx: 1.2, sy: 0.6, sz: 0.7 }), color: '#ffffff', noOutline: true });
        eye(-0.18, 0.07, 0.42); eye(0.18, 0.07, 0.42);
        break;
      case 'tako':
        P.push({ geo: sph(0.55), matrix: M({ y: 0.12, sy: 1.1 }), color: fur });
        P.push({ geo: new T.TorusGeometry(0.5, 0.07, 6, 24), matrix: M({ y: 0.2, rx: Math.PI / 2 + 0.12 }), color: '#fff6ea' });
        P.push({ geo: new T.ConeGeometry(0.08, 0.3, 6), matrix: M({ x: -0.3, y: 0.3, z: -0.45, rz: 0.9, rx: -0.4 }), color: '#fff6ea', noOutline: true });
        P.push({ geo: new T.CylinderGeometry(0.09, 0.12, 0.2, 10), matrix: M({ y: -0.12, z: 0.52, rx: Math.PI / 2 }), color: '#ff8f8f' });
        for (let i = 0; i < 5; i++) P.push({ geo: sph(0.06), matrix: M({ x: Math.cos(i * 1.3) * 0.38, y: 0.45 + (i % 2) * 0.1, z: Math.sin(i * 1.3) * 0.3, sz: 0.4 }), color: sub, noOutline: true });
        eye(-0.18, 0.1, 0.46, 1.05); eye(0.18, 0.1, 0.46, 1.05);
        break;
    }
    return P;
  }

  // kart body following the turnaround sheets: paw-badge nose, U bumper, striped pods, wing on posts, twin silver pipes
  function chassisParts(c) {
    const P = [];
    const k = c.kart, cream = '#fff6ea', dark = '#2a1e48', ink = '#1c1330', silver = '#d9dce6';
    const sh = new T.Shape();
    const w = 0.7, l = 1.22, r = 0.34;
    sh.moveTo(-w + r, -l); sh.lineTo(w - r, -l); sh.quadraticCurveTo(w, -l, w, -l + r);
    sh.lineTo(w, l - r); sh.quadraticCurveTo(w, l, w - r, l); sh.lineTo(-w + r, l); sh.quadraticCurveTo(-w, l, -w, l - r);
    sh.lineTo(-w, -l + r); sh.quadraticCurveTo(-w, -l, -w + r, -l);
    const pan = new T.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 6 });
    pan.rotateX(Math.PI / 2);
    pan.center();
    P.push({ geo: pan, matrix: M({ y: 0.3 }), color: dark });
    // tub and raised nose
    P.push({ geo: sph(0.5, 18, 12), matrix: M({ y: 0.5, z: 0.05, sx: 1.22, sy: 0.52, sz: 2.3 }), color: k });
    P.push({ geo: sph(0.5, 18, 12), matrix: M({ y: 0.62, z: 0.92, sx: 1.0, sy: 0.62, sz: 0.82 }), color: k });
    // U-shaped front bumper with a cream inner band
    P.push({ geo: capsule(0.13, 1.25), matrix: M({ y: 0.34, z: 1.36, rz: Math.PI / 2 }), color: k });
    P.push({ geo: new T.BoxGeometry(1.2, 0.05, 0.05), matrix: M({ y: 0.4, z: 1.48 }), color: cream, noOutline: true });
    for (const s of [-1, 1]) P.push({ geo: capsule(0.12, 0.42), matrix: M({ x: s * 0.74, y: 0.34, z: 1.16, rx: Math.PI / 2, rz: 0, ry: -s * 0.55 }), color: k });
    for (const s of [-1, 1]) {
      // side pods with a cream stripe
      P.push({ geo: sph(0.4, 14, 10), matrix: M({ x: s * 0.76, y: 0.48, z: -0.02, sx: 0.55, sy: 0.48, sz: 1.75 }), color: k });
      P.push({ geo: new T.BoxGeometry(0.05, 0.07, 1.05), matrix: M({ x: s * 0.92, y: 0.58, z: 0.02, rx: 0.12 }), color: cream, noOutline: true });
      // rear fenders over the big wheels
      P.push({ geo: new T.BoxGeometry(0.42, 0.14, 0.82), matrix: M({ x: s * 0.92, y: 0.92, z: -0.86 }), color: k });
      P.push({ geo: new T.BoxGeometry(0.43, 0.15, 0.12), matrix: M({ x: s * 0.92, y: 0.92, z: -0.62 }), color: cream, noOutline: true });
      // twin silver exhausts angled up and back, with dark tips
      P.push({ geo: new T.CylinderGeometry(0.11, 0.13, 0.72, 12), matrix: M({ x: s * 0.24, y: 0.9, z: -1.38, rx: -1.15 }), color: silver });
      P.push({ geo: new T.CylinderGeometry(0.08, 0.08, 0.06, 12), matrix: M({ x: s * 0.24, y: 1.05, z: -1.71, rx: -1.15 }), color: ink, noOutline: true });
      // wing end plates and posts
      P.push({ geo: new T.BoxGeometry(0.06, 0.24, 0.42), matrix: M({ x: s * 0.88, y: 1.3, z: -1.28 }), color: k });
      P.push({ geo: new T.BoxGeometry(0.08, 0.46, 0.1), matrix: M({ x: s * 0.42, y: 1.08, z: -1.25 }), color: dark });
    }
    P.push({ geo: new T.BoxGeometry(1.74, 0.08, 0.42), matrix: M({ y: 1.34, z: -1.28, rx: 0.12 }), color: k });
    P.push({ geo: new T.BoxGeometry(1.5, 0.03, 0.08), matrix: M({ y: 1.39, z: -1.16, rx: 0.12 }), color: cream, noOutline: true });
    // high-backed seat, engine, rear bumper with a small tail lamp
    P.push({ geo: new T.BoxGeometry(0.8, 1.0, 0.22), matrix: M({ y: 1.0, z: -0.62, rx: -0.12 }), color: ink });
    P.push({ geo: new T.BoxGeometry(0.82, 0.42, 0.5), matrix: M({ y: 0.66, z: -1.05 }), color: '#4b4459' });
    P.push({ geo: new T.BoxGeometry(1.2, 0.22, 0.16), matrix: M({ y: 0.42, z: -1.42 }), color: dark });
    P.push({ geo: new T.BoxGeometry(0.22, 0.1, 0.04), matrix: M({ y: 0.44, z: -1.51 }), color: k, noOutline: true });
    // steering
    P.push({ geo: new T.CylinderGeometry(0.045, 0.045, 0.6, 6), matrix: M({ y: 0.85, z: 0.75, rx: 0.9 }), color: dark, noOutline: true });
    P.push({ geo: new T.TorusGeometry(0.2, 0.045, 6, 18), matrix: M({ y: 1.04, z: 0.6, rx: 0.75 }), color: ink, noOutline: true });
    return P;
  }

  // racing suit with cream stripes, black collar and gloves
  function bodyParts(c) {
    const P = [];
    const suit = c.kart, cream = '#fff6ea', ink = '#1c1330';
    P.push({ geo: capsule(0.34, 0.32), matrix: M({ y: 1.12, z: -0.3, rx: 0.15 }), color: suit });
    for (const s of [-1, 1]) {
      P.push({ geo: new T.BoxGeometry(0.07, 0.5, 0.04), matrix: M({ x: s * 0.13, y: 1.13, z: 0.03, rx: 0.15 }), color: cream, noOutline: true });
      P.push({ geo: capsule(0.1, 0.45), matrix: M({ x: s * 0.3, y: 1.12, z: 0.15, rx: 1.15, rz: s * 0.25 }), color: suit });
      P.push({ geo: new T.BoxGeometry(0.03, 0.04, 0.32), matrix: M({ x: s * 0.4, y: 1.16, z: 0.16, rx: -0.42, ry: -s * 0.25 }), color: cream, noOutline: true });
      P.push({ geo: sph(0.12), matrix: M({ x: s * 0.2, y: 1.04, z: 0.55 }), color: ink });
    }
    P.push({ geo: new T.TorusGeometry(0.22, 0.075, 8, 20), matrix: M({ y: 1.44, z: -0.24, rx: Math.PI / 2 + 0.15 }), color: ink, noOutline: true });
    return P;
  }

  // tails and extras, attached behind the seat
  function tailParts(c) {
    const P = [];
    const fur = c.fur, sub = c.sub;
    switch (c.id) {
      case 'koro':
        P.push({ geo: new T.TorusGeometry(0.17, 0.085, 8, 18, Math.PI * 1.6), matrix: M({ y: 1.3, z: -0.84, ry: Math.PI / 2, rz: 0.4 }), color: fur });
        break;
      case 'mimi':
        P.push({ geo: sph(0.18), matrix: M({ y: 1.0, z: -0.82 }), color: '#ffffff' });
        break;
      case 'pon':
        for (let t = 0; t < 3; t++) P.push({ geo: sph(0.16 - t * 0.02), matrix: M({ x: 0.22 + t * 0.06, y: 0.95 + t * 0.1, z: -0.84 - t * 0.14, sz: 1.2 }), color: t % 2 ? '#5a4030' : fur });
        break;
      case 'gin':
        P.push({ geo: sph(0.2), matrix: M({ x: 0.3, y: 1.0, z: -0.95, sx: 0.8, sy: 0.8, sz: 1.7, rx: -0.35, ry: 0.5 }), color: fur });
        P.push({ geo: sph(0.14), matrix: M({ x: 0.46, y: 1.1, z: -1.2 }), color: '#fff3e2' });
        break;
      case 'gon':
        P.push({ geo: sph(0.13), matrix: M({ y: 0.98, z: -0.8 }), color: fur });
        break;
      case 'mochi':
        P.push({ geo: capsule(0.075, 0.42), matrix: M({ y: 1.12, z: -0.92, rx: -0.95 }), color: fur });
        P.push({ geo: capsule(0.075, 0.3), matrix: M({ y: 1.42, z: -1.14, rx: -0.15 }), color: fur });
        break;
      case 'tako':
        for (const s of [-1, 1]) for (const z of [0.25, -0.25]) {
          P.push({ geo: capsule(0.09, 0.42), matrix: M({ x: s * 0.62, y: 0.92, z, rz: s * 1.05 }), color: fur });
          for (let i = 0; i < 3; i++) P.push({ geo: sph(0.035, 6, 5), matrix: M({ x: s * (0.5 + i * 0.12), y: 0.98 - i * 0.07, z: z + 0.08 }), color: '#ffd1c4', noOutline: true });
        }
        break;
    }
    return P;
  }

  function wheelGeo(r, w, rim) {
    const tire = new T.CylinderGeometry(r, r, w, 20);
    tire.rotateZ(Math.PI / 2);
    return G.mergeGeos([
      { geo: tire, color: '#2a1e48' },
      { geo: new T.CylinderGeometry(r * 0.7, r * 0.7, w + 0.02, 16), matrix: M({ rz: Math.PI / 2 }), color: rim },
      { geo: new T.CylinderGeometry(r * 0.38, r * 0.38, w + 0.04, 12), matrix: M({ rz: Math.PI / 2 }), color: '#2a1e48' },
    ]);
  }

  // cream-framed badge with a white paw print for the nose
  const badgeCache = {};
  function badgeTex(color) {
    if (badgeCache[color]) return badgeCache[color];
    const t = G.canvasTex(256, 208, (g, w, h) => {
      const rr = (x, y, ww, hh, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + ww, y, x + ww, y + hh, r); g.arcTo(x + ww, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + ww, y, r); g.closePath(); };
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#1c1330'; rr(4, 4, w - 8, h - 8, 54); g.fill();
      g.fillStyle = '#fff6ea'; rr(14, 14, w - 28, h - 28, 46); g.fill();
      g.fillStyle = color; rr(40, 34, w - 80, h - 68, 26); g.fill();
      g.fillStyle = '#fff6ea';
      g.beginPath(); g.ellipse(w / 2, h / 2 + 18, 34, 27, 0, 0, Math.PI * 2); g.fill();
      [[-38, -14], [-14, -36], [14, -36], [38, -14]].forEach(([dx, dy]) => { g.beginPath(); g.ellipse(w / 2 + dx, h / 2 + dy, 12, 15, dx * 0.01, 0, Math.PI * 2); g.fill(); });
    }, { wrapT: T.ClampToEdgeWrapping });
    badgeCache[color] = t;
    return t;
  }

  G.buildKartModel = function (c) {
    const root = new T.Group();
    const tilt = new T.Group();
    root.add(tilt);
    const chassis = build(chassisParts(c), 0.05, true);
    tilt.add(chassis);
    const driver = new T.Group();
    tilt.add(driver);
    driver.add(build(bodyParts(c), 0.045, true));
    const tail = tailParts(c);
    if (tail.length) driver.add(build(tail, 0.04, true));
    const head = build(headParts(c), 0.045, true);
    head.scale.setScalar(1.12);
    const headPivot = new T.Group();
    headPivot.position.set(0, 1.82, -0.18);
    headPivot.add(head);
    driver.add(headPivot);
    const badge = new T.Mesh(new T.PlaneGeometry(0.66, 0.54), new T.MeshToonMaterial({ map: badgeTex(c.kart), gradientMap: G.Tex.toon, transparent: true, alphaTest: 0.5 }));
    badge.position.set(0, 0.86, 1.22);
    badge.rotation.x = -0.62;
    tilt.add(badge);
    const { toonMat, outlineMat } = mats();
    const wheels = [];
    const defs = [[-0.88, 0.37, 0.86, 0.37, 0.32], [0.88, 0.37, 0.86, 0.37, 0.32], [-0.92, 0.45, -0.86, 0.45, 0.44], [0.92, 0.45, -0.86, 0.45, 0.44]];
    defs.forEach(([x, y, z, r, w], i) => {
      const pivot = new T.Group();
      pivot.position.set(x, y, z);
      const g = wheelGeo(r, w, c.kart);
      const spin = new T.Group();
      const m = new T.Mesh(g, toonMat);
      m.castShadow = true;
      const og = g.clone();
      og.scale(1.08, 1.08, 1.08);
      spin.add(m, new T.Mesh(og, outlineMat));
      pivot.add(spin);
      tilt.add(pivot);
      wheels.push({ pivot, spin, r, front: i < 2 });
    });
    // boost flames
    const flameMat = new T.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false });
    const flameGeo = new T.ConeGeometry(0.16, 1, 10, 1, true);
    flameGeo.translate(0, -0.5, 0);
    flameGeo.rotateX(-Math.PI / 2);
    const flames = [];
    for (const s of [-1, 1]) {
      const f = new T.Mesh(flameGeo, flameMat.clone());
      f.position.set(s * 0.24, 1.07, -1.74);
      f.rotation.x = 0.42;
      f.visible = false;
      tilt.add(f);
      const inner = new T.Mesh(flameGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
      inner.scale.set(0.5, 0.5, 0.6);
      f.add(inner);
      flames.push(f);
    }
    // shield bubble
    const shield = new T.Mesh(new T.SphereGeometry(2.1, 24, 16), new T.MeshBasicMaterial({ color: 0xb9a9ff, transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false }));
    shield.position.y = 1.0;
    shield.visible = false;
    root.add(shield);
    // ground contact shadow (soft blob under kart)
    const blob = new T.Mesh(new T.PlaneGeometry(2.6, 3.4), new T.MeshBasicMaterial({ map: G.Tex.glow, color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.06;
    root.add(blob);
    // dizzy stars over the head
    const star = new T.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.09 : 0.22, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const starGeo = new T.ExtrudeGeometry(star, { depth: 0.07, bevelEnabled: false });
    starGeo.center();
    const starMat = new T.MeshBasicMaterial({ color: 0xffe066 });
    const stars = new T.Group();
    for (let i = 0; i < 3; i++) {
      const sm = new T.Mesh(starGeo, starMat);
      const a = (i / 3) * Math.PI * 2;
      sm.position.set(Math.cos(a) * 0.62, 0, Math.sin(a) * 0.62);
      sm.rotation.y = -a;
      stars.add(sm);
    }
    stars.position.set(0, 2.75, -0.18);
    stars.visible = false;
    root.add(stars);
    // orbiting water balloons
    const orbitMat = new T.MeshToonMaterial({ color: 0x4fd8e8, gradientMap: G.Tex.toon, transparent: true, opacity: 0.92 });
    const orbit = new T.Group();
    for (let i = 0; i < 3; i++) {
      const b = new T.Mesh(new T.SphereGeometry(0.42, 12, 10), orbitMat);
      b.scale.set(1, 1.15, 1);
      const a = (i / 3) * Math.PI * 2;
      b.position.set(Math.cos(a) * 2.15, 1.0, Math.sin(a) * 2.15);
      orbit.add(b);
    }
    orbit.visible = false;
    root.add(orbit);
    // festival aura
    const aura = new T.Sprite(new T.SpriteMaterial({ map: G.Tex.glow, color: 0xffffff, blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.7 }));
    aura.position.y = 1.1;
    aura.scale.set(7, 6, 1);
    aura.visible = false;
    root.add(aura);
    // ink splat on the face
    const ink = new T.Mesh(new T.CircleGeometry(0.5, 12), new T.MeshBasicMaterial({ color: 0x1c1330 }));
    ink.position.set(0.05, 0.02, 0.56);
    ink.scale.set(1.1, 0.8, 1);
    ink.visible = false;
    headPivot.add(ink);
    return { root, tilt, driver, headPivot, wheels, flames, shield, blob, stars, orbit, aura, ink };
  };

  /* portraits rendered once with a throwaway renderer */
  G.makePortraits = function () {
    const out = {};
    let r;
    try {
      r = new T.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch (e) {
      return out;
    }
    r.setPixelRatio(1);
    r.setSize(192, 192);
    r.outputEncoding = T.sRGBEncoding;
    const scene = new T.Scene();
    scene.add(new T.HemisphereLight(0xfff0f0, 0x8a7fb0, 0.9));
    const dl = new T.DirectionalLight(0xffffff, 0.9);
    dl.position.set(2, 3, 4);
    scene.add(dl);
    const cam = new T.PerspectiveCamera(30, 1, 0.1, 50);
    for (const c of G.CHARS) {
      const m = G.buildKartModel(c);
      m.root.rotation.y = 0.55;
      scene.add(m.root);
      cam.position.set(1.7, 2.5, 4.6);
      cam.lookAt(0.12, 1.55, 0);
      r.render(scene, cam);
      out[c.id] = r.domElement.toDataURL('image/png');
      scene.remove(m.root);
    }
    r.dispose();
    try { r.forceContextLoss(); } catch (e) {}
    return out;
  };
})();
