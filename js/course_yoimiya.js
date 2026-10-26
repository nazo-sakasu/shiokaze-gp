/* 汐風GP — course 2: 宵宮参道 (night shrine festival on a hill) */
(function () {
  'use strict';
  const G = window.G;
  const T = THREE;
  const K = G.CourseKit;
  const M = G.M;
  const { ROAD, EDGE } = G.TRACK_DIMS;
  const Track = G.Track;

  const VERMILION = '#e0402f', INK = '#1c1330', STONE = '#8e8a99', STONE_D = '#6e6a7c';
  const HILL = { x: 135, z: -305 };
  const SHRINE = { x: 168, z: -312 };
  const PAGODA = { x: 95, z: -445 };
  const TORII = { s0: 832, s1: 992, step: 5.5 };

  const NIGHT_STALLS = [
    { t: 'お面', c: '#ff5a6e' }, { t: '射的', c: '#35d3c3' }, { t: 'ヨーヨー釣り', c: '#5ab8ff' }, { t: 'たこ焼き', c: '#ffb54a' },
    { t: 'わたあめ', c: '#ff8fc0' }, { t: '焼きとうもろこし', c: '#ffd23f' }, { t: '金魚すくい', c: '#5ab8ff' }, { t: 'りんご飴', c: '#ff5a6e' },
    { t: 'かき氷', c: '#35d3c3' }, { t: 'くじ引き', c: '#a493ff' }, { t: 'ラムネ', c: '#a493ff' },
  ];

  const cMoss = new T.Color('#34503f'), cMoss2 = new T.Color('#2b4436'), cEarth = new T.Color('#5f4f55');
  const cMount = new T.Color('#232843'), cPath = new T.Color('#55505e');

  function hillH(x, z) {
    const r = Math.hypot(x - HILL.x, z - HILL.z);
    return 17 * (1 - K.smooth(105, 235, r));
  }

  /* -------------------------------------------------------- geometry kits */
  function cedarGeo() {
    const P = [{ geo: new T.CylinderGeometry(0.35, 0.55, 5, 7), matrix: M({ y: 2.5 }), color: '#4a3530' }];
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const r = 3.4 - i * 0.55, h = 4.4 - i * 0.35;
      P.push({ geo: new T.ConeGeometry(r, h, 8), matrix: M({ y: 4 + i * 2.6 + h / 2, ry: i * 0.4 }), color: i % 2 ? '#24453a' : '#2d5444' });
    }
    return G.mergeGeos(P);
  }
  function toriiGeo(half, H, scale) {
    const v = VERMILION, k = INK;
    const W = half * 2;
    const P = [];
    for (const s of [-1, 1]) {
      P.push({ geo: new T.CylinderGeometry(0.5, 0.62, H, 12), matrix: M({ x: s * half, y: H / 2 }), color: v });
      P.push({ geo: new T.CylinderGeometry(0.7, 0.7, 0.9, 12), matrix: M({ x: s * half, y: 0.45 }), color: k });
    }
    P.push({ geo: new T.BoxGeometry(W + 2.2, 0.7, 0.7), matrix: M({ y: H * 0.78 }), color: v });
    P.push({ geo: new T.BoxGeometry(W + 3.6, 0.8, 1.15), matrix: M({ y: H + 0.2 }), color: v });
    // kasagi: black top beam with upturned ends
    const n = 16, top = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n * 2 - 1;
      top.push(new T.Vector2(t * (W / 2 + 2.6), Math.pow(Math.abs(t), 3) * 1.0));
    }
    const shape = new T.Shape();
    shape.moveTo(top[0].x, top[0].y);
    top.forEach((p) => shape.lineTo(p.x, p.y + 0.9));
    for (let i = n; i >= 0; i--) shape.lineTo(top[i].x, top[i].y);
    const kas = new T.ExtrudeGeometry(shape, { depth: 1.5, bevelEnabled: false });
    kas.translate(0, 0, -0.75);
    P.push({ geo: kas, matrix: M({ y: H + 0.6 }), color: k });
    P.push({ geo: new T.BoxGeometry(1.2, 1.6, 0.3), matrix: M({ y: H * 0.78 + 1.05, z: 0.2 }), color: k });
    const g = G.mergeGeos(P);
    if (scale) g.scale(scale, scale, scale);
    return g;
  }
  function stoneLanternGeo() {
    return G.mergeGeos([
      { geo: new T.CylinderGeometry(0.9, 1.05, 0.5, 6), matrix: M({ y: 0.25 }), color: STONE_D },
      { geo: new T.CylinderGeometry(0.3, 0.4, 1.8, 8), matrix: M({ y: 1.4 }), color: STONE },
      { geo: new T.CylinderGeometry(0.8, 0.6, 0.35, 6), matrix: M({ y: 2.45 }), color: STONE },
      { geo: new T.BoxGeometry(0.95, 0.85, 0.95), matrix: M({ y: 3.05 }), color: STONE_D },
      { geo: new T.ConeGeometry(1.15, 0.85, 6), matrix: M({ y: 3.9 }), color: STONE },
      { geo: new T.SphereGeometry(0.2, 8, 6), matrix: M({ y: 4.45 }), color: STONE },
    ]);
  }

  function roofGeo(len, span, rise, color) {
    // irimoya-style curved roof: concave slopes, swept eaves
    const sh = new T.Shape();
    const pts = [];
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = -span / 2 + t * span;
      const y = rise * (1 - Math.pow(Math.abs(t * 2 - 1), 0.55)) - (Math.abs(t * 2 - 1) > 0.86 ? (Math.abs(t * 2 - 1) - 0.86) * -2.5 : 0);
      pts.push([x, y]);
    }
    sh.moveTo(pts[0][0], pts[0][1]);
    pts.forEach((p) => sh.lineTo(p[0], p[1] + 0.7));
    for (let i = n; i >= 0; i--) sh.lineTo(pts[i][0], pts[i][1]);
    const g = new T.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false });
    g.translate(0, 0, -len / 2);
    g.rotateY(Math.PI / 2);
    return { geo: g, color };
  }

  /* -------------------------------------------------------- builders */
  function buildForest(root, w) {
    const geo = cedarGeo();
    const area = K.area(260);
    const spots = K.scatter(420, area, {
      minTrack: EDGE + 6, gap: 6,
      reject: (x, z) => (x - SHRINE.x) ** 2 + (z - SHRINE.z) ** 2 < 32 * 32 || (x - PAGODA.x) ** 2 + (z - PAGODA.z) ** 2 < 20 * 20,
    });
    const mesh = new T.InstancedMesh(geo, new T.MeshLambertMaterial({ vertexColors: true }), spots.length);
    spots.forEach((p, i) => mesh.setMatrixAt(i, M({ x: p[0], y: G.groundHeight(p[0], p[1]) - 0.3, z: p[1], ry: Math.random() * 6, s: G.rand(0.8, 1.45) })));
    mesh.castShadow = true;
    root.add(mesh);
  }

  function buildToriiTunnel(root, w) {
    const half = EDGE + 0.45, H = 11;
    const geo = toriiGeo(half, H);
    const list = [];
    for (let s = TORII.s0; s <= TORII.s1; s += TORII.step) list.push(s);
    const mesh = new T.InstancedMesh(geo, new T.MeshLambertMaterial({ vertexColors: true }), list.length);
    const lantern = new T.InstancedMesh(new T.SphereGeometry(0.38, 12, 10).scale(1, 1.35, 1), new T.MeshBasicMaterial({ color: 0xffb56a }), list.length * 2);
    const p = {};
    let nl = 0;
    list.forEach((s, i) => {
      Track.at(s, 0, p);
      mesh.setMatrixAt(i, M({ x: p.x, y: p.y - 0.1, z: p.z, ry: p.heading }));
      if (i % 2) return;
      for (const side of [-1, 1]) {
        const q = Track.at(s, side * 9.5);
        lantern.setMatrixAt(nl++, M({ x: q.x, y: q.y + H * 0.78 - 1.0, z: q.z }));
        w.addGlow(q.x, q.y + H * 0.78 - 1.0, q.z, '#ffab5c', 0.9);
      }
    });
    lantern.count = nl;
    mesh.castShadow = true;
    root.add(mesh, lantern);
  }

  function buildStoneLanterns(root, w) {
    const geo = stoneLanternGeo();
    const spots = [];
    K.alongTrack(0, Track.L, 26, 0, (p, s) => {
      if (s > TORII.s0 - 8 && s < TORII.s1 + 8) return;
      for (const side of [-1, 1]) {
        const d = side * (EDGE + 2.4);
        const q = Track.at(s + (side > 0 ? 13 : 0), d);
        spots.push([q.x, q.y, q.z, q.heading]);
      }
    });
    const mesh = new T.InstancedMesh(geo, new T.MeshLambertMaterial({ vertexColors: true }), spots.length);
    const fire = new T.InstancedMesh(new T.BoxGeometry(0.62, 0.5, 0.62), new T.MeshBasicMaterial({ color: 0xffc276 }), spots.length);
    spots.forEach((q, i) => {
      mesh.setMatrixAt(i, M({ x: q[0], y: q[1], z: q[2], ry: q[3] }));
      fire.setMatrixAt(i, M({ x: q[0], y: q[1] + 3.05, z: q[2], ry: q[3] }));
      w.addGlow(q[0], q[1] + 3.1, q[2], '#ffb066', 1.1);
    });
    mesh.castShadow = true;
    root.add(mesh, fire);
  }

  function buildShrine(root, w) {
    const g = new T.Group();
    const y0 = G.groundHeight(SHRINE.x, SHRINE.z);
    // stone platform and steps
    g.add(new T.Mesh(new T.BoxGeometry(30, 1.6, 22), new T.MeshLambertMaterial({ color: STONE_D })));
    g.children[0].position.y = 0.8;
    for (let i = 0; i < 4; i++) {
      const st = new T.Mesh(new T.BoxGeometry(8, 0.4, 1.2), new T.MeshLambertMaterial({ color: STONE }));
      st.position.set(0, 0.2 + i * 0.4, 11.6 + (3 - i) * 1.1);
      g.add(st);
    }
    const P = [];
    // hall body
    P.push({ geo: new T.BoxGeometry(20, 6, 13), matrix: M({ y: 4.6 }), color: '#efe2cf' });
    // vermilion columns and beams
    for (const x of [-9.6, -4.8, 0, 4.8, 9.6]) for (const z of [-6.2, 6.2]) P.push({ geo: new T.CylinderGeometry(0.45, 0.45, 6.4, 10), matrix: M({ x, y: 4.8, z }), color: VERMILION });
    for (const z of [-6.4, 6.4]) P.push({ geo: new T.BoxGeometry(21, 0.7, 0.7), matrix: M({ y: 7.6, z }), color: VERMILION });
    P.push({ geo: new T.BoxGeometry(6, 4.4, 0.3), matrix: M({ y: 4.0, z: 6.6 }), color: '#3b1f22' });
    const roof = roofGeo(26, 21, 7.5, '#3f7d6b');
    P.push({ geo: roof.geo, matrix: M({ y: 8.0 }), color: roof.color });
    P.push({ geo: new T.BoxGeometry(27, 0.8, 0.9), matrix: M({ y: 15.6 }), color: INK });
    for (const x of [-13.4, 13.4]) P.push({ geo: new T.SphereGeometry(0.75, 10, 8), matrix: M({ x, y: 15.8 }), color: '#e8b44a' });
    // offering box
    P.push({ geo: new T.BoxGeometry(3.4, 1.4, 1.6), matrix: M({ y: 2.3, z: 9 }), color: '#6b3a2a' });
    const hall = new T.Mesh(G.mergeGeos(P), new T.MeshLambertMaterial({ vertexColors: true }));
    hall.castShadow = true; hall.receiveShadow = true;
    g.add(hall);
    // sacred rope and paper streamers
    const rope = new T.Mesh(new T.TorusGeometry(4.2, 0.45, 8, 24, Math.PI), new T.MeshLambertMaterial({ color: 0xd9c08c }));
    rope.rotation.z = Math.PI;
    rope.scale.set(1.2, 0.35, 1);
    rope.position.set(0, 8.2, 6.9);
    g.add(rope);
    for (const x of [-3, 0, 3]) {
      const sd = new T.Mesh(new T.PlaneGeometry(0.5, 1.5), new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide }));
      sd.position.set(x, 6.4, 7.0);
      g.add(sd);
    }
    // big lanterns either side of the steps
    const lm = new T.MeshBasicMaterial({ color: 0xffa35a });
    for (const x of [-6.5, 6.5]) {
      const l = new T.Mesh(new T.SphereGeometry(1.0, 14, 10).scale(1, 1.4, 1), lm);
      l.position.set(x, 4.6, 12.5);
      g.add(l);
      const cap = new T.Mesh(new T.CylinderGeometry(0.6, 0.6, 0.25, 12), new T.MeshLambertMaterial({ color: 0x1c1330 }));
      cap.position.set(x, 6.1, 12.5);
      g.add(cap);
    }
    // face the hall towards the torii tunnel exit (west-south-west)
    const face = Math.atan2(80 - SHRINE.x, -350 - SHRINE.z);
    g.position.set(SHRINE.x, y0, SHRINE.z);
    g.rotation.y = face;
    root.add(g);
    root.updateMatrixWorld(true);
    const v = new T.Vector3();
    for (const x of [-6.5, 6.5]) { v.set(x, 4.6, 12.5); g.localToWorld(v); w.addGlow(v.x, v.y, v.z, '#ffa35a', 3.2); }
  }

  function buildPagoda(root, w) {
    const g = new T.Group();
    const P = [];
    P.push({ geo: new T.BoxGeometry(10, 1.4, 10), matrix: M({ y: 0.7 }), color: STONE_D });
    let y = 1.4;
    const glows = [];
    for (let i = 0; i < 5; i++) {
      const bw = 6.6 - i * 0.7, bh = 3.2 - i * 0.12;
      P.push({ geo: new T.BoxGeometry(bw, bh, bw), matrix: M({ y: y + bh / 2 }), color: VERMILION });
      P.push({ geo: new T.BoxGeometry(bw + 0.3, 0.5, bw + 0.3), matrix: M({ y: y + bh - 0.2 }), color: '#efe2cf' });
      const rr = (bw + 4.2) * 0.72;
      P.push({ geo: new T.ConeGeometry(rr, 1.9, 4, 1), matrix: M({ y: y + bh + 0.7, ry: Math.PI / 4, sy: 1 }), color: '#2b2a3a' });
      glows.push([0, y + bh * 0.45, bw / 2 + 0.05]);
      y += bh + 1.2;
    }
    P.push({ geo: new T.CylinderGeometry(0.18, 0.25, 9, 8), matrix: M({ y: y + 4.5 }), color: '#c9a24a' });
    for (let i = 0; i < 9; i++) P.push({ geo: new T.TorusGeometry(0.55, 0.12, 6, 14), matrix: M({ y: y + 1.2 + i * 0.7, rx: Math.PI / 2 }), color: '#c9a24a' });
    const mesh = new T.Mesh(G.mergeGeos(P), new T.MeshLambertMaterial({ vertexColors: true }));
    mesh.castShadow = true;
    g.add(mesh);
    const winMat = new T.MeshBasicMaterial({ color: 0xffc276 });
    for (const [x, gy, z] of glows) for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const win = new T.Mesh(new T.PlaneGeometry(1.5, 1.2), winMat);
      win.position.set(Math.sin(r) * z, gy, Math.cos(r) * z);
      win.rotation.y = r;
      g.add(win);
    }
    g.position.set(PAGODA.x, G.groundHeight(PAGODA.x, PAGODA.z) - 0.4, PAGODA.z);
    g.rotation.y = 0.3;
    g.scale.setScalar(1.25);
    root.add(g);
    root.updateMatrixWorld(true);
    const v = new T.Vector3();
    for (const [x, gy, z] of glows) { v.set(0, gy, 0); g.localToWorld(v); w.addGlow(v.x, v.y, v.z, '#ffb066', 4.5); }
  }

  // giant torii over the start line, on top of the countdown gantry
  function dressGantry(root, w) {
    const p = Track.at(0, 0);
    const geo = toriiGeo(EDGE + 2.6, 13.5);
    const mesh = new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true }));
    mesh.position.set(p.x, p.y - 0.1, p.z);
    mesh.rotation.y = p.heading;
    mesh.castShadow = true;
    root.add(mesh);
  }

  function buildMoonHalo(root, w) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: G.Tex.glow, color: 0xa9b8ff, blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.35, fog: false }));
    s.scale.set(520, 520, 1);
    s.position.copy(G.SUN_DIR).multiplyScalar(2150);
    s.renderOrder = -9;
    root.add(s);
    w.moonHalo = s;
  }

  G.COURSES.push({
    id: 'yoimiya', name: '宵宮参道', en: 'NIGHT SHRINE ROAD', tag: '夜の縁日と千本鳥居', color: '#ff8a4a',
    ctrl: [
      [-70, 0, 0], [40, 0, 0], [125, 0, 0], [180, 0, -25], [195, 1, -80], [165, 4, -125], [100, 8, -135], [60, 11, -175],
      [80, 14, -228], [140, 16, -250], [200, 16, -268], [228, 16, -315], [195, 16, -358], [120, 16, -365], [40, 15, -350],
      [-25, 12, -322], [-70, 8, -275], [-85, 5, -215], [-125, 2, -165], [-185, 0, -122], [-205, 0, -60], [-160, 0, -8],
    ],
    sky: { top: '#090b26', mid: '#1d1b4b', horizon: '#47305f', sun: '#c9d4ff', mode: 1 },
    fog: { color: '#3b2a58', near: 170, far: 1150 },
    light: { dir: [0.35, 0.42, -0.84], sky: 0x8f97e6, ground: 0x6a4060, hemi: 1.0, color: 0xb9c6ff, intensity: 0.62 },
    clouds: false, sea: false, glowOpacity: 0.85,
    theme: {
      road: {
        base: '#5d5a6b', line: '#ddd6e6',
        draw(g, w, h, speckle) {
          const rows = 16, cols = 4;
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const off = r % 2 ? w / cols / 2 : 0;
            const l = 52 + Math.random() * 14;
            g.fillStyle = `hsl(255, 7%, ${l * 0.68}%)`;
            g.fillRect(c * (w / cols) + off + 2, r * (h / rows) + 2, w / cols - 4, h / rows - 4);
            if (off) g.fillRect(-w / cols / 2 + 2, r * (h / rows) + 2, w / cols - 4, h / rows - 4);
          }
          speckle(g, w, h, 4000, ['#6c6878', '#4f4b5c', '#7a7586'], 1, 2);
        },
      },
      shoulder: { base: '#8c879b', speck: ['#a7a2b6', '#77738a', '#b8b3c4', '#6b6780'] },
      wall: { a: VERMILION, b: '#2a1e2e', dark: INK },
      curb: [VERMILION, '#f3ead8'],
    },
    height(x, z) {
      let h = hillH(x, z) + 0.6 * Math.sin(x * 0.045) * Math.cos(z * 0.05);
      const r = Math.hypot(x - G.terrainCenter.x, z - G.terrainCenter.z);
      if (r > 330) {
        const k = K.smooth(330, 560, r);
        const ridge = 0.6 + 0.4 * Math.sin(Math.atan2(z, x) * 5 + 1) * Math.cos(Math.atan2(z, x) * 3);
        h += k * (40 + 90 * ridge);
      }
      return h;
    },
    ground(x, z, h, dist, tmp) {
      if (h > 24) return tmp.copy(cMount).lerp(cMoss2, G.clamp((80 - h) / 80, 0, 0.5));
      const n = 0.5 + 0.5 * Math.sin(x * 0.08 + Math.sin(z * 0.06) * 2) * Math.cos(z * 0.07);
      tmp.copy(cMoss).lerp(cMoss2, n);
      if (dist < 34) tmp.lerp(cEarth, 0.55 * (1 - dist / 34));
      if ((x - SHRINE.x) ** 2 + (z - SHRINE.z) ** 2 < 30 * 30) tmp.lerp(cPath, 0.6);
      return tmp;
    },
    pads: [[588, 0], [870, -3], [1225, 3], [1470, -2]],
    itemRows: [205, 520, 1012, 1300],
    ramps: [{ s: 612, h: 1.4 }, { s: 1108, h: 1.55 }],
    stalls: { count: 11, s0: -120, spacing: 21, sides: [1, -1], list: NIGHT_STALLS },
    scenery: {
      festoons: { at: [62, 255, 450, 705, 1035, 1200, 1390], colors: ['#ff6b4a', '#fff1d0', '#ff9a3c', '#ff6b4a'], bulb: 0.36, lantern: true, glow: 0.9 },
      gantry: { title: '宵宮参道', sub: 'NIGHT SHRINE ROAD', bg: '#1c1330', accent: VERMILION, frame: 0xc8372b },
    },
    fireworks: { x: [-320, 320], y: [95, 150], z: [-560, -460], every: [2.5, 5] },
    music: { transpose: -2, tempo: 142, lead: 'square', taiko: true },
    build(root, w) {
      buildForest(root, w);
      buildToriiTunnel(root, w);
      buildStoneLanterns(root, w);
      buildShrine(root, w);
      buildPagoda(root, w);
      dressGantry(root, w);
      buildMoonHalo(root, w);
    },
    update(w, dt, t, focus) {
      // fireflies drifting near the player in the low woods
      if (!focus) return;
      w.ffT = (w.ffT || 0) - dt;
      if (w.ffT <= 0) {
        w.ffT = 0.08;
        const a = Math.random() * Math.PI * 2, r = G.rand(20, 55);
        const x = focus.x + Math.cos(a) * r, z = focus.z + Math.sin(a) * r;
        if (K.trackDist(x, z) > EDGE + 3) {
          const y = G.groundHeight(x, z) + G.rand(0.8, 4);
          G.FX.emit(G.FX.add, x, y, z, G.rand(-0.6, 0.6), G.rand(-0.2, 0.4), G.rand(-0.6, 0.6), 0xd8ff7a, G.rand(0.35, 0.6), G.rand(2, 3.5), 0, 0.2, 0, 0.9);
        }
      }
    },
  });
})();
