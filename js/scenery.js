/* 汐風GP — scenery: palms, lanterns, grandstand, gantry, lighthouse, ferris wheel, boats */
(function () {
  'use strict';
  const G = window.G;
  const T = THREE;
  const { EDGE } = G.TRACK_DIMS;
  const Track = G.Track;

  // merge simple geometries into one non-indexed geometry with vertex colors
  function merge(parts) {
    const pos = [], nor = [], col = [];
    const m3 = new T.Matrix3();
    const v = new T.Vector3();
    for (const p of parts) {
      let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      if (p.matrix) g.applyMatrix4(p.matrix);
      if (!g.attributes.normal) g.computeVertexNormals();
      const c = new T.Color(p.color);
      const P = g.attributes.position, Nn = g.attributes.normal;
      for (let i = 0; i < P.count; i++) {
        pos.push(P.getX(i), P.getY(i), P.getZ(i));
        nor.push(Nn.getX(i), Nn.getY(i), Nn.getZ(i));
        const k = p.shade ? p.shade(P.getX(i), P.getY(i), P.getZ(i)) : 1;
        col.push(c.r * k, c.g * k, c.b * k);
      }
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return out;
  }
  G.mergeGeos = merge;
  const M = (o) => {
    const m = new T.Matrix4();
    const q = new T.Quaternion().setFromEuler(new T.Euler(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'XYZ'));
    m.compose(new T.Vector3(o.x || 0, o.y || 0, o.z || 0), q, new T.Vector3(o.sx || o.s || 1, o.sy || o.s || 1, o.sz || o.s || 1));
    return m;
  };
  G.M = M;

  const loc = {};
  function trackDist(x, z) {
    Track.locate(x, z, null, loc);
    return Math.abs(loc.d);
  }

  /* ---------------- Palm */
  function palmGeo() {
    const parts = [];
    let x = 0, y = 0;
    const segs = 7;
    for (let i = 0; i < segs; i++) {
      const r0 = 0.42 - i * 0.03, r1 = 0.42 - (i + 1) * 0.03;
      const h = 1.35;
      const lean = 0.06 * i * i * 0.18;
      parts.push({ geo: new T.CylinderGeometry(r1, r0, h, 7, 1), matrix: M({ x: x, y: y + h / 2, z: 0, rz: -lean }), color: i % 2 ? '#8b5e43' : '#a5734f' });
      x += Math.sin(lean) * h;
      y += Math.cos(lean) * h * 0.98;
    }
    const topX = x, topY = y;
    parts.push({ geo: new T.SphereGeometry(0.55, 7, 5), matrix: M({ x: topX, y: topY, s: 1 }), color: '#6d4a33' });
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      parts.push({ geo: new T.SphereGeometry(0.28, 6, 5), matrix: M({ x: topX + Math.cos(a) * 0.45, y: topY - 0.45, z: Math.sin(a) * 0.45 }), color: '#5a3b26' });
    }
    const fronds = 9;
    for (let f = 0; f < fronds; f++) {
      const g = new T.PlaneGeometry(1.7, 5.6, 2, 7);
      const P = g.attributes.position;
      for (let i = 0; i < P.count; i++) {
        const t = (P.getY(i) + 2.8) / 5.6; // 0 base -> 1 tip
        const w = Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.06)) * (1 - t * 0.25);
        const px = P.getX(i) * w;
        const droop = -2.4 * t * t;
        const fold = -Math.abs(px) * 0.35;
        P.setXYZ(i, px, t * 5.2, droop + fold);
      }
      g.rotateX(-Math.PI / 2 + 0.35);
      g.computeVertexNormals();
      const a = (f / fronds) * Math.PI * 2 + (f % 2) * 0.2;
      const m = new T.Matrix4().makeRotationY(a);
      m.premultiply(new T.Matrix4().makeTranslation(topX, topY + 0.1, 0));
      m.multiply(new T.Matrix4().makeRotationX(-0.25 + (f % 3) * 0.12));
      parts.push({ geo: g, matrix: m, color: f % 2 ? '#3f9a5f' : '#57b46b', shade: (px, py, pz) => 0.85 + 0.15 * Math.random() });
    }
    return merge(parts);
  }

  /* ---------------- Text banner texture */
  function bannerTex(text, sub, bg, fg, accent) {
    return G.canvasTex(1024, 160, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = fg;
      g.font = (text.length > 9 ? 70 : 86) + 'px "Dela Gothic One", "Hiragino Sans", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h * 0.44);
      if (sub) {
        g.font = '700 26px "Chakra Petch", sans-serif';
        g.fillStyle = '#ffb54a';
        g.fillText(sub.split('').join(' '), w / 2, h * 0.84);
      }
      g.fillStyle = accent || '#ff5a6e';
      g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    }, { wrapT: T.ClampToEdgeWrapping });
  }

  const S = (G.Scenery = {});
  S.bannerTex = (a, b, c, d, e) => bannerTex(a, b, c, d, e);
  S.build = function (scene, w, o) {
    o = o || {};
    const vcMat = new T.MeshLambertMaterial({ vertexColors: true });
    const vcMat2 = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide });
    const addGlow = w.addGlow;

    if (o.palms) {
    /* palms */
    const pg = palmGeo();
    const palmSpots = [];
    const tryPalm = (x, z) => {
      if (G.landDist(x, z) < 4) return;
      if (G.Deco && G.Deco.blocked(x, z)) return;
      if (trackDist(x, z) < EDGE + 7) return;
      for (const p of palmSpots) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < 49) return;
      palmSpots.push([x, z]);
    };
    for (let x = -330; x < 330; x += 13) tryPalm(x + G.rand(-4, 4), G.rand(28, 58) - Math.sin(x * 0.012) * 6);
    for (let z = -260; z < 50; z += 14) tryPalm(G.rand(-325, -300), z + G.rand(-4, 4));
    for (let i = 0; i < 70; i++) tryPalm(G.rand(-250, 230), G.rand(-190, -20));
    for (let i = 0; i < 40; i++) tryPalm(G.rand(-300, 320), G.rand(-290, -225));
    const palmMat = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide });
    S.wind = { value: 0 };
    palmMat.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = S.wind;
      sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'float hh = max(transformed.y - 3.0, 0.0);',
        'float ph = 0.0;',
        '#ifdef USE_INSTANCING',
        '  ph = instanceMatrix[3].x * 0.07 + instanceMatrix[3].z * 0.05;',
        '#endif',
        'float sw = sin(uWind * 1.3 + ph) * 0.5 + sin(uWind * 2.9 + ph * 1.7) * 0.22;',
        'transformed.x += sw * hh * hh * 0.012;',
        'transformed.z += cos(uWind * 1.1 + ph) * hh * hh * 0.007;',
      ].join('\n'));
    };
    const palms = new T.InstancedMesh(pg, palmMat, palmSpots.length);
    palmSpots.forEach((p, i) => {
      const y = G.groundHeight(p[0], p[1]);
      palms.setMatrixAt(i, M({ x: p[0], y: y - 0.2, z: p[1], ry: Math.random() * 6.28, rz: G.rand(-0.08, 0.08), s: G.rand(0.85, 1.3) }));
    });
    palms.castShadow = true;
    palms.receiveShadow = false;
    scene.add(palms);
    }

    if (o.bushes) {
    /* bushes & flowers */
    const bushGeo = merge([
      { geo: new T.IcosahedronGeometry(1.2, 0), matrix: M({ y: 0.6, sy: 0.75 }), color: '#4f9a5c' },
      { geo: new T.IcosahedronGeometry(0.9, 0), matrix: M({ x: 0.9, y: 0.45, z: 0.3, sy: 0.75 }), color: '#5fae66' },
      { geo: new T.IcosahedronGeometry(0.8, 0), matrix: M({ x: -0.8, y: 0.4, z: -0.2, sy: 0.75 }), color: '#468c55' },
    ]);
    const flowerGeo = merge([
      { geo: new T.IcosahedronGeometry(0.9, 0), matrix: M({ y: 0.45, sy: 0.6 }), color: '#5aa265' },
      { geo: new T.IcosahedronGeometry(0.28, 0), matrix: M({ x: 0.3, y: 0.85, z: 0.2 }), color: '#ff7aa8' },
      { geo: new T.IcosahedronGeometry(0.25, 0), matrix: M({ x: -0.35, y: 0.8, z: -0.1 }), color: '#ffe08a' },
      { geo: new T.IcosahedronGeometry(0.26, 0), matrix: M({ x: 0.0, y: 0.9, z: -0.4 }), color: '#ff9a6b' },
    ]);
    const bushSpots = [];
    for (let i = 0; i < 260; i++) {
      const x = G.rand(-320, 300), z = G.rand(-300, 40);
      if (G.landDist(x, z) < 20) continue;
      if (trackDist(x, z) < EDGE + 3) continue;
      if (G.Deco && G.Deco.blocked(x, z)) continue;
      bushSpots.push([x, z, Math.random() < 0.4]);
    }
    const bushes = new T.InstancedMesh(bushGeo, vcMat, bushSpots.length);
    const flowers = new T.InstancedMesh(flowerGeo, vcMat, bushSpots.length);
    let nb = 0, nf = 0;
    for (const b of bushSpots) {
      const m = M({ x: b[0], y: G.groundHeight(b[0], b[1]) - 0.1, z: b[1], ry: Math.random() * 6, s: G.rand(0.7, 1.4) });
      if (b[2]) flowers.setMatrixAt(nf++, m); else bushes.setMatrixAt(nb++, m);
    }
    bushes.count = nb; flowers.count = nf;
    scene.add(bushes, flowers);
    }

    if (o.posts) {
    /* lantern posts along both walls */
    const postGeo = merge([
      { geo: new T.CylinderGeometry(0.09, 0.12, 3.6, 6), matrix: M({ y: 1.8 }), color: '#2a1e48' },
      { geo: new T.BoxGeometry(0.9, 0.08, 0.08), matrix: M({ y: 3.55 }), color: '#2a1e48' },
    ]);
    const lanternGeo = new T.SphereGeometry(0.42, 10, 8);
    lanternGeo.scale(1, 1.3, 1);
    const capGeo = new T.CylinderGeometry(0.26, 0.26, 0.12, 10);
    const tmp = {};
    const postM = [], lanM = [], lanC = [];
    const spacing = 17;
    const nPost = Math.floor(Track.L / spacing);
    for (let k = 0; k < nPost; k++) {
      const s = k * spacing;
      const side = k % 2 ? 1 : -1;
      const d = side * (EDGE + 1.0);
      Track.at(s, d, tmp);
      postM.push(M({ x: tmp.x, y: tmp.y, z: tmp.z, ry: tmp.heading }));
      const off = -side * 0.42;
      const lx = tmp.x - tmp.tz * off, lz = tmp.z + tmp.tx * off;
      lanM.push(M({ x: lx, y: tmp.y + 2.95, z: lz }));
      const c = k % 3 === 0 ? '#ffe2a6' : '#ff8466';
      lanC.push(c);
      addGlow(lx, tmp.y + 2.95, lz, c === '#ffe2a6' ? '#ffd28a' : '#ff8a5c', 1.1);
    }
    const posts = new T.InstancedMesh(postGeo, vcMat, postM.length);
    postM.forEach((m, i) => posts.setMatrixAt(i, m));
    posts.castShadow = true;
    const lanMat = new T.MeshBasicMaterial({ color: 0xffffff });
    const lanterns = new T.InstancedMesh(lanternGeo, lanMat, lanM.length);
    lanM.forEach((m, i) => { lanterns.setMatrixAt(i, m); lanterns.setColorAt(i, new T.Color(lanC[i])); });
    const caps = new T.InstancedMesh(capGeo, new T.MeshLambertMaterial({ color: 0x1c1330 }), lanM.length * 2);
    lanM.forEach((m, i) => {
      const p = new T.Vector3().setFromMatrixPosition(m);
      caps.setMatrixAt(i * 2, M({ x: p.x, y: p.y + 0.56, z: p.z }));
      caps.setMatrixAt(i * 2 + 1, M({ x: p.x, y: p.y - 0.56, z: p.z }));
    });
    scene.add(posts, lanterns, caps);
    }

    if (o.festoons) {
    /* festoon light strings over the road */
    const bulbM = [], bulbC = [];
    const poleM = [];
    const fo = o.festoons === true ? {} : o.festoons;
    const bulbCols = fo.colors || ['#ffd27a', '#ff6f8a', '#7fe6d8', '#b3a4ff', '#fff3d6'];
    const bulbSize = fo.bulb || 0.18;
    for (const f of fo.at || [0.07, 0.2, 0.34, 0.47, 0.58, 0.7, 0.82, 0.92].map((v) => v * Track.L)) {
      const s = f;
      const a = Track.at(s, -(EDGE + 1.6)), b = Track.at(s, EDGE + 1.6);
      poleM.push(M({ x: a.x, y: a.y, z: a.z }), M({ x: b.x, y: b.y, z: b.z }));
      const n = 22;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        const y = a.y + 7.6 - Math.sin(Math.PI * t) * 1.8;
        bulbM.push(M({ x, y, z }));
        const c = bulbCols[i % bulbCols.length];
        bulbC.push(c);
        addGlow(x, y, z, c, fo.glow || 0.55);
      }
    }
    const poleGeo = merge([{ geo: new T.CylinderGeometry(0.14, 0.18, 8, 6), matrix: M({ y: 4 }), color: '#2a1e48' }]);
    const poles = new T.InstancedMesh(poleGeo, vcMat, poleM.length);
    poleM.forEach((m, i) => poles.setMatrixAt(i, m));
    poles.castShadow = true;
    const bulbGeo = new T.SphereGeometry(bulbSize, 8, 6);
    if (fo.lantern) bulbGeo.scale(1, 1.35, 1);
    const bulbs = new T.InstancedMesh(bulbGeo, new T.MeshBasicMaterial({ color: 0xffffff }), bulbM.length);
    bulbM.forEach((m, i) => { bulbs.setMatrixAt(i, m); bulbs.setColorAt(i, new T.Color(bulbC[i])); });
    scene.add(poles, bulbs);
    // wires
    const wirePts = [];
    for (let i = 0; i < bulbM.length - 1; i++) {
      if ((i + 1) % 23 === 0) continue;
      const p0 = new T.Vector3().setFromMatrixPosition(bulbM[i]);
      const p1 = new T.Vector3().setFromMatrixPosition(bulbM[i + 1]);
      wirePts.push(p0.x, p0.y + 0.15, p0.z, p1.x, p1.y + 0.15, p1.z);
    }
    const wireGeo = new T.BufferGeometry();
    wireGeo.setAttribute('position', new T.Float32BufferAttribute(wirePts, 3));
    scene.add(new T.LineSegments(wireGeo, new T.LineBasicMaterial({ color: 0x2a1e48 })));
    }

    /* gantry over the start line */
    {
      const g = new T.Group();
      const p = Track.at(0, 0);
      const H = 8.6, half = EDGE + 2;
      const dark = new T.MeshLambertMaterial({ color: (o.gantry && o.gantry.frame) || 0x2a1e48 });
      const pillarGeo = new T.BoxGeometry(1.2, H + 1.6, 1.2);
      for (const sgn of [-1, 1]) {
        const pl = new T.Mesh(pillarGeo, dark);
        pl.position.set(sgn * half, (H + 1.6) / 2, 0);
        pl.castShadow = true;
        g.add(pl);
      }
      const beam = new T.Mesh(new T.BoxGeometry(half * 2 + 1.2, 2.6, 1.0), dark);
      beam.position.y = H + 0.6;
      beam.castShadow = true;
      g.add(beam);
      const go = o.gantry || {};
      const tex = bannerTex(go.title || '汐風グランプリ', go.sub || 'SHIOKAZE GRAND PRIX', go.bg || '#1c1330', go.fg || '#fff6ea', go.accent);
      const bm = new T.MeshBasicMaterial({ map: tex });
      for (const sgn of [-1, 1]) {
        const b = new T.Mesh(new T.PlaneGeometry(22, 3.4), bm);
        b.position.set(0, H + 0.6, sgn * 0.52);
        if (sgn < 0) b.rotation.y = Math.PI;
        g.add(b);
      }
      // countdown lamps
      const lamps = [];
      for (let i = 0; i < 3; i++) {
        const lm = new T.Mesh(new T.SphereGeometry(0.55, 16, 12), new T.MeshBasicMaterial({ color: 0x3b2c63 }));
        lm.position.set((i - 1) * 1.7, H - 1.4, 0.55);
        g.add(lm);
        const hood = new T.Mesh(new T.CylinderGeometry(0.75, 0.75, 0.5, 16, 1, true), dark);
        hood.rotation.x = Math.PI / 2;
        hood.position.copy(lm.position);
        g.add(hood);
        lamps.push(lm);
      }
      const lampGlow = new T.Sprite(new T.SpriteMaterial({ map: G.Tex.glow, color: 0xff5a6e, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      lampGlow.scale.set(9, 5, 1);
      lampGlow.position.set(0, H - 1.4, 1.2);
      g.add(lampGlow);
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = p.heading;
      // the beam was built along x: rotate so it spans the road (road's right axis)
      g.rotation.y = p.heading + Math.PI;
      scene.add(g);
      w.startLamps = lamps;
      w.lampGlow = lampGlow;
    }

    if (o.grandstand) {
    /* grandstand on the infield side of the main straight */
    {
      const gs = new T.Group();
      const s0 = -85, s1 = -15; // along the straight (wraps)
      const mid = Track.at((s0 + s1) / 2, -(EDGE + 4));
      const len = s1 - s0;
      const steps = 7;
      const gso = o.grandstand === true ? {} : o.grandstand;
      const standMat = new T.MeshLambertMaterial({ color: 0xd9cfe6 });
      const seatMat = new T.MeshLambertMaterial({ color: gso.seat || 0x35d3c3 });
      for (let i = 0; i < steps; i++) {
        const st = new T.Mesh(new T.BoxGeometry(len, 0.8 + i * 0.8, 1.6), i % 2 ? standMat : seatMat);
        st.position.set(0, (0.8 + i * 0.8) / 2, -i * 1.6);
        st.castShadow = true; st.receiveShadow = true;
        gs.add(st);
      }
      // roof
      const roof = new T.Mesh(new T.BoxGeometry(len + 2, 0.4, 13), new T.MeshLambertMaterial({ color: gso.roof || 0xff5a6e }));
      roof.position.set(0, 10.5, -4.6);
      roof.rotation.x = -0.12;
      roof.castShadow = true;
      gs.add(roof);
      for (let i = 0; i <= 6; i++) {
        const c = new T.Mesh(new T.CylinderGeometry(0.2, 0.2, 10.5, 6), new T.MeshLambertMaterial({ color: 0x2a1e48 }));
        c.position.set(-len / 2 + (i / 6) * len, 5.25, -10.5);
        gs.add(c);
      }
      const tex = bannerTex(gso.text || '潮風に のれ！', gso.sub || 'WELCOME TO THE SEASIDE CIRCUIT', gso.bg || '#ff5a6e', '#fff6ea', gso.accent || (gso.bg ? '#35d3c3' : '#ff5a6e'));
      const ban = new T.Mesh(new T.PlaneGeometry(len * 0.6, len * 0.6 * 0.156), new T.MeshBasicMaterial({ map: tex }));
      ban.position.set(0, 9.2, 1.4);
      gs.add(ban);
      // crowd
      const personGeo = merge([
        { geo: new T.CylinderGeometry(0.28, 0.34, 0.9, 6), matrix: M({ y: 0.45 }), color: '#ffffff' },
        { geo: new T.SphereGeometry(0.24, 8, 6), matrix: M({ y: 1.12 }), color: '#ffd9b8' },
      ]);
      const crowdMat = new T.MeshLambertMaterial({ vertexColors: true });
      const people = [];
      const shirt = ['#ff5a6e', '#ffb54a', '#35d3c3', '#a493ff', '#fff6ea', '#5ab8ff', '#ff7aa8', '#7cd67a'];
      for (let i = 1; i < steps; i++) {
        for (let x = -len / 2 + 1; x < len / 2 - 1; x += 1.0) {
          if (Math.random() < 0.28) continue;
          people.push({ x: x + G.rand(-0.2, 0.2), y: 0.8 + i * 0.8, z: -i * 1.6 + 0.2, ph: Math.random() * 6.28, sp: G.rand(5, 9), c: shirt[(Math.random() * shirt.length) | 0] });
        }
      }
      const crowd = new T.InstancedMesh(personGeo, crowdMat, people.length);
      people.forEach((p, i) => { crowd.setColorAt(i, new T.Color(p.c)); crowd.setMatrixAt(i, M({ x: p.x, y: p.y, z: p.z })); });
      crowd.instanceMatrix.setUsage(T.DynamicDrawUsage);
      gs.add(crowd);
      gs.position.set(mid.x, G.groundHeight(mid.x, mid.z) + 0.2, mid.z);
      gs.rotation.y = mid.heading - Math.PI / 2;
      scene.add(gs);
      w.crowd = { mesh: crowd, people, cheer: 0 };
    }
    }

    if (o.flags) {
    /* flags on the sea side of the straight */
    {
      const flagGeo = new T.PlaneGeometry(2.2, 1.3, 6, 2);
      flagGeo.translate(1.1, 0, 0);
      const cols = ['#ff5a6e', '#ffb54a', '#35d3c3', '#a493ff'];
      const flagMat = new T.MeshLambertMaterial({ side: T.DoubleSide });
      w.flags = [];
      for (let k = 0; k < 10; k++) {
        const p = Track.at(-90 + k * 22, EDGE + 4.5);
        const pole = new T.Mesh(new T.CylinderGeometry(0.07, 0.09, 7, 5), new T.MeshLambertMaterial({ color: 0xfff6ea }));
        pole.position.set(p.x, p.y + 3.5, p.z);
        scene.add(pole);
        const fl = new T.Mesh(flagGeo.clone(), flagMat.clone());
        fl.material.color.set(cols[k % 4]);
        fl.position.set(p.x, p.y + 6.2, p.z);
        fl.rotation.y = -Math.PI / 2 + 0.6;
        scene.add(fl);
        w.flags.push(fl);
      }
    }
    }

    if (o.lighthouse) {
    /* lighthouse on the western point */
    {
      const lh = new T.Group();
      const rock = new T.Mesh(new T.DodecahedronGeometry(14, 1), new T.MeshLambertMaterial({ color: 0x8b7f9f, flatShading: true }));
      rock.scale.set(1, 0.42, 1);
      rock.position.y = -2.5;
      lh.add(rock);
      const white = new T.MeshLambertMaterial({ color: 0xfff6ea }), red = new T.MeshLambertMaterial({ color: 0xff5a6e });
      for (let i = 0; i < 5; i++) {
        const r0 = 3.0 - i * 0.3, r1 = 3.0 - (i + 1) * 0.3;
        const seg = new T.Mesh(new T.CylinderGeometry(r1, r0, 4.4, 20), i % 2 ? red : white);
        seg.position.y = 2.2 + i * 4.4 + 2;
        seg.castShadow = true;
        lh.add(seg);
      }
      const deck = new T.Mesh(new T.CylinderGeometry(2.6, 2.6, 0.4, 20), new T.MeshLambertMaterial({ color: 0x2a1e48 }));
      deck.position.y = 26.4;
      lh.add(deck);
      const glass = new T.Mesh(new T.CylinderGeometry(1.4, 1.4, 2.4, 16), new T.MeshBasicMaterial({ color: 0xfff1c0 }));
      glass.position.y = 27.8;
      lh.add(glass);
      const roof = new T.Mesh(new T.ConeGeometry(2.0, 2.2, 16), red);
      roof.position.y = 30.1;
      lh.add(roof);
      const beamGeo = new T.ConeGeometry(3.2, 70, 24, 1, true);
      beamGeo.translate(0, -35, 0);
      beamGeo.rotateZ(Math.PI / 2);
      const beamMat = new T.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.07, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false });
      const beam = new T.Group();
      const b1 = new T.Mesh(beamGeo, beamMat), b2 = new T.Mesh(beamGeo, beamMat);
      b2.rotation.y = Math.PI;
      beam.add(b1, b2);
      beam.position.y = 27.8;
      lh.add(beam);
      addGlow(-372, 27.8, 46, '#fff0c0', 6);
      lh.position.set(-372, 0, 46);
      scene.add(lh);
      w.beam = beam;
    }
    }

    if (o.ferris) {
    /* ferris wheel inland */
    {
      const fw = new T.Group();
      const R = 32, C = 40;
      const frame = new T.MeshLambertMaterial({ color: 0xfff6ea });
      for (const z of [-1.6, 1.6]) {
        const rim = new T.Mesh(new T.TorusGeometry(R, 0.45, 6, 64), frame);
        rim.position.z = z;
        fw.add(rim);
      }
      const wheel = new T.Group();
      fw.add(wheel);
      const nG = 16;
      const gondCols = ['#ff5a6e', '#ffb54a', '#35d3c3', '#a493ff'];
      const gondolas = [];
      for (let i = 0; i < nG; i++) {
        const a = (i / nG) * Math.PI * 2;
        const sp = new T.Mesh(new T.BoxGeometry(0.3, R, 0.3), frame);
        sp.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0);
        sp.rotation.z = a - Math.PI / 2;
        wheel.add(sp);
        const gd = new T.Mesh(new T.BoxGeometry(2.6, 2.8, 2.6), new T.MeshLambertMaterial({ color: gondCols[i % 4] }));
        gd.userData.a = a;
        fw.add(gd);
        gondolas.push(gd);
      }
      // rims spin as part of wheel visually: move them into wheel group
      fw.children.slice(0, 2).forEach((r) => wheel.add(r));
      const hub = new T.Mesh(new T.CylinderGeometry(2, 2, 4.4, 16), new T.MeshLambertMaterial({ color: 0x2a1e48 }));
      hub.rotation.x = Math.PI / 2;
      fw.add(hub);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const leg = new T.Mesh(new T.CylinderGeometry(0.5, 0.8, C * 1.08, 8), new T.MeshLambertMaterial({ color: 0x2a1e48 }));
        leg.position.set(sx * 10, -C / 2, sz * 3.2);
        leg.rotation.z = sx * 0.26;
        leg.rotation.x = -sz * 0.06;
        fw.add(leg);
      }
      // rim bulbs (animated via points color)
      const nb = 72;
      const bp = new Float32Array(nb * 3), bc = new Float32Array(nb * 3);
      for (let i = 0; i < nb; i++) {
        const a = (i / nb) * Math.PI * 2;
        bp[i * 3] = Math.cos(a) * R; bp[i * 3 + 1] = Math.sin(a) * R; bp[i * 3 + 2] = 2.2;
      }
      const bg = new T.BufferGeometry();
      bg.setAttribute('position', new T.BufferAttribute(bp, 3));
      bg.setAttribute('color', new T.BufferAttribute(bc, 3));
      const bpts = new T.Points(bg, new T.PointsMaterial({ size: 5, map: G.Tex.glow, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
      wheel.add(bpts);
      const gx = -40, gz = -300;
      fw.position.set(gx, G.groundHeight(gx, gz) + C, gz);
      fw.rotation.y = 0.35;
      scene.add(fw);
      w.wheel = { wheel, gondolas, R, bulbs: bg };
    }
    }

    if (o.boats) {
    /* sailboats and islands */
    {
      w.boats = [];
      const hullGeo = merge([
        { geo: new T.BoxGeometry(2.4, 1.2, 7), matrix: M({ y: 0.4 }), color: '#fff6ea' },
        { geo: new T.BoxGeometry(2.5, 0.25, 7.1), matrix: M({ y: 1.0 }), color: '#2a1e48' },
        { geo: new T.CylinderGeometry(0.1, 0.12, 9, 5), matrix: M({ y: 5.4 }), color: '#2a1e48' },
      ]);
      const sailCols = ['#ff5a6e', '#fff6ea', '#ffb54a', '#35d3c3', '#a493ff'];
      for (let i = 0; i < 7; i++) {
        const b = new T.Group();
        b.add(new T.Mesh(hullGeo, vcMat));
        const sg = new T.BufferGeometry();
        sg.setAttribute('position', new T.Float32BufferAttribute([0, 1.4, -2.6, 0, 9.6, -0.2, 0, 1.4, 2.2], 3));
        sg.computeVertexNormals();
        b.add(new T.Mesh(sg, new T.MeshLambertMaterial({ color: sailCols[i % 5], side: T.DoubleSide })));
        const a = G.rand(-0.4, 2.2);
        const r = G.rand(170, 420);
        b.position.set(-60 + Math.cos(a) * r * 1.6, -0.9, 110 + Math.sin(a) * r * 0.5 + G.rand(0, 120));
        if (b.position.x < -330) b.position.z = G.rand(-200, 300);
        b.rotation.y = Math.random() * 6.28;
        b.userData.ph = Math.random() * 6;
        scene.add(b);
        w.boats.push(b);
      }
      const islandMat = new T.MeshLambertMaterial({ color: 0x6c8f73, flatShading: true });
      for (const [x, z, r, h] of [[-700, 520, 90, 46], [380, 700, 140, 70], [-160, 900, 120, 40], [900, 300, 160, 90], [-1000, -40, 120, 60]]) {
        const is = new T.Mesh(new T.ConeGeometry(r, h, 9, 2), islandMat);
        is.position.set(x, h / 2 - 2, z);
        is.rotation.y = Math.random() * 3;
        scene.add(is);
      }
    }
    }

  };

  const _c = new T.Color();
  S.update = function (w, dt, t) {
    if (S.wind) S.wind.value = t;
    if (w.beam) w.beam.rotation.y = t * 0.6;
    if (w.wheel) {
      const a0 = t * 0.05;
      w.wheel.wheel.rotation.z = a0;
      for (const gd of w.wheel.gondolas) {
        const a = gd.userData.a + a0;
        gd.position.set(Math.cos(a) * w.wheel.R, Math.sin(a) * w.wheel.R - 1.6, 0);
      }
      const col = w.wheel.bulbs.attributes.color;
      for (let i = 0; i < col.count; i++) {
        const k = 0.5 + 0.5 * Math.sin(i * 0.7 - t * 4);
        _c.setHSL(((i / col.count) + t * 0.05) % 1, 0.9, 0.55 + 0.2 * k);
        col.setXYZ(i, _c.r * (0.4 + k), _c.g * (0.4 + k), _c.b * (0.4 + k));
      }
      col.needsUpdate = true;
    }
    if (w.boats) for (const b of w.boats) {
      b.position.y = -0.9 + Math.sin(t * 1.2 + b.userData.ph) * 0.25;
      b.rotation.z = Math.sin(t * 0.9 + b.userData.ph) * 0.06;
    }
    if (w.flags) w.flags.forEach((f, i) => {
      const P = f.geometry.attributes.position;
      for (let v = 0; v < P.count; v++) {
        const x = P.getX(v);
        P.setZ(v, Math.sin(x * 2.2 - t * 6 + i) * 0.18 * (x / 2.2));
      }
      P.needsUpdate = true;
    });
    for (const c of [w.crowd, w.crowd2]) {
      if (!c) continue;
      c.cheer = Math.max(0, c.cheer - dt * 0.3);
      const m = new T.Matrix4();
      const amp = 0.08 + c.cheer * 0.35;
      c.people.forEach((p, i) => {
        const j = Math.max(0, Math.sin(t * p.sp + p.ph)) * amp;
        m.makeTranslation(p.x, p.y + j, p.z);
        c.mesh.setMatrixAt(i, m);
      });
      c.mesh.instanceMatrix.needsUpdate = true;
    }
  };
})();
