/* 汐風GP — festival dressing: jump ramps, yatai stalls, parasols, seagulls, podium */
(function () {
  'use strict';
  const G = window.G;
  const T = THREE;
  const Track = G.Track;
  const { ROAD, EDGE } = G.TRACK_DIMS;
  const M = G.M;

  const STALLS = [
    { t: 'たこ焼き', c: '#ff5a6e' }, { t: 'わたあめ', c: '#ff8fc0' }, { t: 'かき氷', c: '#35d3c3' },
    { t: 'やきそば', c: '#ffb54a' }, { t: 'りんご飴', c: '#ff5a6e' }, { t: '金魚すくい', c: '#5ab8ff' }, { t: 'ラムネ', c: '#a493ff' },
  ];
  const Deco = (G.Deco = { spots: [] });

  // reserve stall footprints before palms are scattered
  Deco.reserve = function (course) {
    const cfg = course.stalls;
    Deco.spots = [];
    if (!cfg) return;
    const list = cfg.list || STALLS;
    for (let i = 0; i < cfg.count; i++) {
      const s = cfg.s0 + i * cfg.spacing;
      const side = cfg.sides[i % cfg.sides.length];
      const p = Track.at(s, side * (EDGE + 10.5));
      Deco.spots.push({ s, x: p.x, z: p.z, y: p.y, heading: p.heading + (side < 0 ? Math.PI : 0), st: list[i % list.length] });
    }
  };
  Deco.blocked = function (x, z) {
    for (const sp of Deco.spots) if ((sp.x - x) ** 2 + (sp.z - z) ** 2 < 12 * 12) return true;
    return false;
  };

  function label(text, bg) {
    return G.canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.12)';
      for (let i = 0; i < 4; i++) g.fillRect((i * w) / 4 + 1, 0, 2, h);
      g.fillStyle = '#fff6ea';
      const fs = text.length > 4 ? 46 : 58;
      g.font = fs + 'px "Dela Gothic One", "Hiragino Sans", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 4);
    }, { wrapT: T.ClampToEdgeWrapping });
  }
  function stripes(c) {
    return G.canvasTex(128, 32, (g, w, h) => {
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#fff6ea' : c; g.fillRect((i * w) / 8, 0, w / 8 + 1, h); }
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, h - 5, w, 5);
    }, { wrapS: T.RepeatWrapping, wrapT: T.ClampToEdgeWrapping });
  }

  Deco.build = function (scene, w, course) {
    buildRamps(scene, w, course.ramps || []);
    if (Deco.spots.length) buildStalls(scene, w);
    if (course.parasols) buildParasols(scene, w);
    if (course.gulls) buildGulls(scene, w);
    buildPodium(scene, w);
  };
  Deco.label = (t, bg) => label(t, bg);
  Deco.stripes = (c) => stripes(c);

  /* ------------------------------------------------ ramps */
  function buildRamps(scene, w, ramps) {
    const tex = G.canvasTex(128, 128, (g, cw, ch) => {
      g.fillStyle = '#ff5a6e'; g.fillRect(0, 0, cw, ch);
      g.fillStyle = '#fff6ea';
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        const y = i * 32;
        g.moveTo(0, y + 22); g.lineTo(cw / 2, y + 6); g.lineTo(cw, y + 22); g.lineTo(cw, y + 32); g.lineTo(cw / 2, y + 16); g.lineTo(0, y + 32);
        g.fill();
      }
    }, { wrapS: T.RepeatWrapping });
    const mat = new T.MeshLambertMaterial({ map: tex });
    const side = new T.MeshLambertMaterial({ color: 0x2a1e48 });
    const lipMat = new T.MeshBasicMaterial({ color: 0xffe2a6 });
    G.World.ramps = ramps.map((r) => ({ s: r.s, len: r.len || 8, h: r.h || 1.4 }));
    for (const r of G.World.ramps) {
      const pos = [], uv = [], idx = [];
      const n = 8;
      for (let k = 0; k <= n; k++) {
        const s = r.s + (k / n) * r.len;
        const hgt = (k / n) * r.h;
        for (const d of [-ROAD, ROAD]) {
          const p = Track.at(s, d);
          pos.push(p.x, p.y + hgt + 0.03, p.z);
          uv.push(d < 0 ? 0 : 2.5, k / n);
        }
      }
      for (let k = 0; k < n; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const top = new T.Mesh(g, mat);
      top.receiveShadow = true;
      scene.add(top);
      // lip face and side skirts
      const a = Track.at(r.s + r.len, -ROAD), b = Track.at(r.s + r.len, ROAD);
      const lip = new T.BufferGeometry();
      lip.setAttribute('position', new T.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, b.x, b.y + r.h + 0.03, b.z, a.x, a.y + r.h + 0.03, a.z], 3));
      lip.setIndex([0, 1, 2, 0, 2, 3]);
      lip.computeVertexNormals();
      scene.add(new T.Mesh(lip, new T.MeshLambertMaterial({ color: 0x2a1e48, side: T.DoubleSide })));
      for (const d of [-ROAD, ROAD]) {
        const sp = [];
        for (let k = 0; k < n; k++) {
          const p0 = Track.at(r.s + (k / n) * r.len, d), p1 = Track.at(r.s + ((k + 1) / n) * r.len, d);
          const h0 = (k / n) * r.h, h1 = ((k + 1) / n) * r.h;
          sp.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p1.x, p1.y + h1, p1.z, p0.x, p0.y, p0.z, p1.x, p1.y + h1, p1.z, p0.x, p0.y + h0, p0.z);
        }
        const sg = new T.BufferGeometry();
        sg.setAttribute('position', new T.Float32BufferAttribute(sp, 3));
        sg.computeVertexNormals();
        scene.add(new T.Mesh(sg, new T.MeshLambertMaterial({ color: 0x2a1e48, side: T.DoubleSide })));
      }
      // glowing lip strip
      const strip = new T.Mesh(new T.BoxGeometry(ROAD * 2, 0.12, 0.25), lipMat);
      const c = Track.at(r.s + r.len - 0.12, 0);
      strip.position.set(c.x, c.y + r.h + 0.06, c.z);
      strip.rotation.y = c.heading;
      scene.add(strip);
    }
  }

  /* ------------------------------------------------ yatai stalls */
  function buildStalls(scene, w) {
    const wood = new T.MeshLambertMaterial({ color: 0xb8875a });
    const dark = new T.MeshLambertMaterial({ color: 0x2a1e48 });
    const lanternMat = new T.MeshBasicMaterial({ color: 0xffd28a });
    const glow = [];
    for (const sp of Deco.spots) {
      const g = new T.Group();
      const counter = new T.Mesh(new T.BoxGeometry(6, 1.1, 1.6), wood);
      counter.position.set(0, 0.55, 0.8);
      counter.castShadow = true;
      g.add(counter);
      const back = new T.Mesh(new T.BoxGeometry(6, 2.8, 0.2), wood);
      back.position.set(0, 1.4, -1.4);
      g.add(back);
      for (const x of [-2.9, 2.9]) for (const z of [1.5, -1.4]) {
        const post = new T.Mesh(new T.BoxGeometry(0.16, 3.4, 0.16), dark);
        post.position.set(x, 1.7, z);
        g.add(post);
      }
      const awn = new T.Mesh(new T.PlaneGeometry(6.6, 3.8), new T.MeshLambertMaterial({ map: stripes(sp.st.c), side: T.DoubleSide }));
      awn.position.set(0, 3.55, 0.15);
      awn.rotation.x = -Math.PI / 2 + 0.32;
      awn.castShadow = true;
      g.add(awn);
      const noren = new T.Mesh(new T.PlaneGeometry(5.4, 1.1), new T.MeshBasicMaterial({ map: label(sp.st.t, '#1c1330'), side: T.DoubleSide }));
      noren.position.set(0, 2.95, 1.62);
      g.add(noren);
      // goods on the counter
      for (let i = 0; i < 6; i++) {
        const it = new T.Mesh(new T.SphereGeometry(0.22, 8, 6), new T.MeshLambertMaterial({ color: new T.Color(sp.st.c).offsetHSL(0, 0, (i % 3) * 0.08) }));
        it.position.set(-2.2 + i * 0.88, 1.28, 0.9);
        g.add(it);
      }
      for (const x of [-2.4, 2.4]) {
        const l = new T.Mesh(new T.SphereGeometry(0.32, 10, 8), lanternMat);
        l.scale.set(1, 1.3, 1);
        l.position.set(x, 2.5, 1.7);
        g.add(l);
        glow.push(l);
      }
      g.position.set(sp.x, G.groundHeight(sp.x, sp.z), sp.z);
      g.rotation.y = sp.heading + Math.PI / 2;
      scene.add(g);
    }
    scene.updateMatrixWorld(true);
    const pts = [];
    const v = new T.Vector3();
    for (const l of glow) { l.getWorldPosition(v); pts.push(v.x, v.y, v.z); }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    scene.add(new T.Points(geo, new T.PointsMaterial({ size: 2.6, map: G.Tex.glow, color: 0xffc47a, transparent: true, opacity: 0.75, depthWrite: false, blending: T.AdditiveBlending })));
    // a little crowd strolling in front of each stall
    const personGeo = G.mergeGeos([
      { geo: new T.CylinderGeometry(0.28, 0.34, 1.0, 6), matrix: M({ y: 0.5 }), color: '#ffffff' },
      { geo: new T.SphereGeometry(0.26, 8, 6), matrix: M({ y: 1.25 }), color: '#ffd9b8' },
    ]);
    const shirt = ['#ff5a6e', '#ffb54a', '#35d3c3', '#a493ff', '#fff6ea', '#5ab8ff', '#ff7aa8', '#7cd67a'];
    const people = [];
    for (const sp of Deco.spots) {
      const fx = Math.sin(sp.heading + Math.PI / 2), fz = Math.cos(sp.heading + Math.PI / 2);
      const rx = Math.cos(sp.heading + Math.PI / 2), rz = -Math.sin(sp.heading + Math.PI / 2);
      for (let k = 0; k < 4; k++) {
        const a = G.rand(-3, 3), b = G.rand(2.6, 5);
        const x = sp.x + rx * a + fx * b, z = sp.z + rz * a + fz * b;
        people.push({ x, y: G.groundHeight(x, z), z, ph: Math.random() * 6.28, sp: G.rand(5, 9), c: shirt[(Math.random() * shirt.length) | 0] });
      }
    }
    const crowd = new T.InstancedMesh(personGeo, new T.MeshLambertMaterial({ vertexColors: true }), people.length);
    people.forEach((p, i) => { crowd.setColorAt(i, new T.Color(p.c)); crowd.setMatrixAt(i, M({ x: p.x, y: p.y, z: p.z })); });
    crowd.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(crowd);
    if (!w.crowd) w.crowd = { mesh: crowd, people, cheer: 0 };
    else w.crowd2 = { mesh: crowd, people, cheer: 0 };
  }

  /* ------------------------------------------------ parasols & towels */
  function buildParasols(scene, w) {
    const variants = ['#ff5a6e', '#35d3c3', '#ffb54a', '#a493ff'];
    const spots = [];
    const loc = {};
    for (let i = 0; i < 160 && spots.length < 34; i++) {
      const x = G.rand(-320, 300), z = G.rand(30, 60) - Math.sin(x * 0.012) * 6;
      const ld = G.landDist(x, z);
      if (ld < 4 || ld > 28) continue;
      Track.locate(x, z, null, loc);
      if (Math.abs(loc.d) < EDGE + 9) continue;
      if (Deco.blocked(x, z)) continue;
      if (spots.some((s) => (s[0] - x) ** 2 + (s[1] - z) ** 2 < 36)) continue;
      spots.push([x, z]);
    }
    variants.forEach((col, vi) => {
      const canopy = new T.ConeGeometry(2.4, 0.9, 12, 1, true);
      const cg = canopy.toNonIndexed();
      const P = cg.attributes.position;
      const cols = [];
      const c1 = new T.Color(col), c2 = new T.Color('#fff6ea');
      for (let i = 0; i < P.count; i += 3) {
        const face = Math.floor(i / 3);
        const c = Math.floor(face / 2) % 2 ? c1 : c2;
        for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b);
      }
      cg.setAttribute('color', new T.Float32BufferAttribute(cols, 3));
      cg.translate(0, 2.55, 0);
      const geo = G.mergeGeos([
        { geo: new T.CylinderGeometry(0.05, 0.05, 2.6, 5), matrix: M({ y: 1.3 }), color: '#fff6ea' },
        { geo: new T.BoxGeometry(1.1, 0.04, 2), matrix: M({ x: 1.2, y: 0.03, z: 0.6, ry: 0.3 }), color: variants[(vi + 1) % 4] },
      ]);
      const pm = new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true }));
      const mine = spots.filter((_, i) => i % variants.length === vi);
      const inst = new T.InstancedMesh(geo, pm.material, mine.length);
      const instC = new T.InstancedMesh(cg, new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }), mine.length);
      mine.forEach((sp, i) => {
        const m = M({ x: sp[0], y: G.groundHeight(sp[0], sp[1]), z: sp[1], ry: Math.random() * 6, rz: G.rand(-0.12, 0.12) });
        inst.setMatrixAt(i, m);
        instC.setMatrixAt(i, m);
      });
      instC.castShadow = true;
      scene.add(inst, instC);
    });
  }

  /* ------------------------------------------------ seagulls */
  function buildGulls(scene, w) {
    const n = 16;
    const bodyGeo = new T.SphereGeometry(0.35, 8, 6);
    bodyGeo.scale(0.8, 0.7, 2.2);
    const wingGeo = new T.BufferGeometry();
    wingGeo.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0.45, 0, 0, -0.35, 2.0, 0.1, -0.1], 3));
    wingGeo.computeVertexNormals();
    const wm = new T.MeshLambertMaterial({ color: 0xffffff, side: T.DoubleSide });
    const body = new T.InstancedMesh(bodyGeo, wm, n);
    const wl = new T.InstancedMesh(wingGeo, wm, n);
    const wr = new T.InstancedMesh(wingGeo, wm, n);
    [body, wl, wr].forEach((m) => { m.instanceMatrix.setUsage(T.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); });
    const birds = [];
    for (let i = 0; i < n; i++) {
      const c = i < 8 ? [-120, 70] : [-360, -80];
      birds.push({ cx: c[0] + G.rand(-40, 40), cz: c[1] + G.rand(-30, 30), r: G.rand(25, 60), h: G.rand(22, 40), sp: G.rand(0.12, 0.22) * (Math.random() < 0.5 ? 1 : -1), ph: Math.random() * 6.28, fl: G.rand(5, 7) });
    }
    w.gulls = { birds, body, wl, wr };
  }
  const _m = new T.Matrix4(), _w = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _p = new T.Vector3(), _s = new T.Vector3(1, 1, 1);
  function updateGulls(g, t) {
    g.birds.forEach((b, i) => {
      const a = b.ph + t * b.sp;
      _p.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(t * 0.7 + i) * 2, b.cz + Math.sin(a) * b.r);
      const yaw = Math.atan2(-Math.sin(a) * Math.sign(b.sp), Math.cos(a) * Math.sign(b.sp));
      _e.set(0, yaw, -Math.sign(b.sp) * 0.25);
      _q.setFromEuler(_e);
      _m.compose(_p, _q, _s);
      g.body.setMatrixAt(i, _m);
      const flap = Math.sin(t * b.fl + i) * 0.55;
      _w.makeRotationZ(flap);
      g.wr.setMatrixAt(i, _w.premultiply(_m).clone());
      _w.makeRotationZ(Math.PI - flap);
      g.wl.setMatrixAt(i, _w.premultiply(_m).clone());
    });
    g.body.instanceMatrix.needsUpdate = true;
    g.wl.instanceMatrix.needsUpdate = true;
    g.wr.instanceMatrix.needsUpdate = true;
  }

  /* ------------------------------------------------ podium */
  function numTex(n, bg) {
    return G.canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1c1330';
      g.font = '88px "Dela Gothic One", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(n), w / 2, h / 2 + 6);
    }, { wrapT: T.ClampToEdgeWrapping });
  }
  function buildPodium(scene, w) {
    const grp = new T.Group();
    const defs = [[0, 2.4, '#ffb54a'], [-4.4, 1.6, '#d9cfe6'], [4.4, 1.0, '#e59a6a']];
    defs.forEach(([x, h, c], i) => {
      const mats = [];
      const side = new T.MeshLambertMaterial({ color: c });
      for (let f = 0; f < 6; f++) mats.push(f === 4 ? new T.MeshLambertMaterial({ map: numTex(i + 1, c) }) : side);
      const b = new T.Mesh(new T.BoxGeometry(4.2, h, 4), mats);
      b.position.set(x, h / 2, 0);
      b.castShadow = true; b.receiveShadow = true;
      grp.add(b);
    });
    const base = new T.Mesh(new T.CylinderGeometry(9, 9.4, 0.3, 40), new T.MeshLambertMaterial({ color: 0x2a1e48 }));
    base.position.y = 0.15;
    base.receiveShadow = true;
    grp.add(base);
    const p = Track.at(40, 0);
    grp.position.set(p.x, p.y + 0.02, p.z);
    grp.rotation.y = p.heading + Math.PI;
    grp.visible = false;
    scene.add(grp);
    w.podium = { grp, slots: defs.map(([x, h]) => new T.Vector3(x, h, 0)) };
  }

  Deco.update = function (w, dt, t) {
    if (w.gulls) updateGulls(w.gulls, t);
  };
})();
