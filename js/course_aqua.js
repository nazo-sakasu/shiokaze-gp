/* 汐風GP — course 3: サンゴ礁アクアリウム (reef floor of a giant aquarium tank) */
(function () {
  'use strict';
  const G = window.G;
  const T = THREE;
  const K = G.CourseKit;
  const M = G.M;
  const { EDGE } = G.TRACK_DIMS;
  const Track = G.Track;

  const TUNNEL = { s0: 1045, s1: 1185 };
  const ARCH_S = 432;
  const SHIP = { x: 270, z: -335 };
  const CLAM = { x: -40, z: -105 };
  const TRENCH = { x: 105, z: -138 };
  const REEF = ['#ff6f86', '#ff9f5a', '#ffd166', '#c58bff', '#5ad1ff', '#ff8fc0', '#7cf0b4'];

  const cSand = new T.Color('#e3d6aa'), cSand2 = new T.Color('#cfc196'), cRock = new T.Color('#6c6a8c');
  const cTrench = new T.Color('#9aa59a'), cDeep = new T.Color('#55657e');

  const sway = { value: 0 };
  const _m4 = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(), _v = new T.Vector3(), _sv = new T.Vector3();
  function compose(x, y, z, yaw, sc) {
    _e.set(0, yaw, 0);
    _q.setFromEuler(_e);
    return _m4.compose(_v.set(x, y, z), _q, _sv.set(sc, sc, sc));
  }

  /* -------------------------------------------------------- geometry kits */
  function branchCoral() {
    const P = [{ geo: new T.CapsuleGeometry(0.28, 1.4, 4, 8), matrix: M({ y: 0.9 }), color: '#ffffff' }];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, tilt = 0.5 + (i % 3) * 0.18, len = 1.1 + (i % 2) * 0.6;
      const bx = Math.sin(tilt) * Math.cos(a) * len * 0.5, bz = Math.sin(tilt) * Math.sin(a) * len * 0.5;
      P.push({ geo: new T.CapsuleGeometry(0.17, len, 4, 6), matrix: M({ x: bx, y: 1.5 + Math.cos(tilt) * len * 0.5, z: bz, rx: Math.sin(a) * tilt, rz: -Math.cos(a) * tilt }), color: '#ffffff' });
      P.push({ geo: new T.SphereGeometry(0.22, 6, 5), matrix: M({ x: bx * 2, y: 1.5 + Math.cos(tilt) * len, z: bz * 2 }), color: '#ffffff' });
    }
    return G.mergeGeos(P);
  }
  function brainCoral() {
    const g = new T.IcosahedronGeometry(1.5, 3);
    const P = g.attributes.position;
    const v = new T.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      const n = 1 + 0.08 * Math.sin(v.x * 6 + Math.sin(v.z * 5) * 2) * Math.cos(v.z * 6);
      v.multiplyScalar(n);
      v.y = Math.max(v.y, -0.2) * 0.62;
      P.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return G.mergeGeos([{ geo: g, matrix: M({ y: 0.1 }), color: '#ffffff' }]);
  }
  function tubeSponge() {
    const P = [];
    [[0, 0, 2.6, 0.42], [0.8, 0.3, 1.9, 0.34], [-0.6, 0.6, 1.6, 0.3], [0.2, -0.8, 2.2, 0.36], [-0.7, -0.5, 1.2, 0.28]].forEach(([x, z, h, r]) => {
      P.push({ geo: new T.CylinderGeometry(r, r * 0.8, h, 12, 1, true), matrix: M({ x, y: h / 2, z }), color: '#ffffff' });
      P.push({ geo: new T.TorusGeometry(r, 0.07, 5, 12), matrix: M({ x, y: h, z, rx: Math.PI / 2 }), color: '#ffffff' });
    });
    return G.mergeGeos(P);
  }
  function seaFan() {
    const fan = new T.CircleGeometry(2.0, 18, 0, Math.PI);
    return G.mergeGeos([
      { geo: fan, matrix: M({ y: 0.6 }), color: '#ffffff' },
      { geo: new T.CylinderGeometry(0.1, 0.14, 0.8, 6), matrix: M({ y: 0.4 }), color: '#ffffff' },
    ]);
  }
  function anemone() {
    const P = [{ geo: new T.SphereGeometry(0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), matrix: M({ sy: 0.8 }), color: '#ffffff' }];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r = 0.25 + (i % 3) * 0.15, tilt = 0.25 + (i % 3) * 0.25;
      P.push({ geo: new T.CapsuleGeometry(0.07, 0.9, 3, 5), matrix: M({ x: Math.cos(a) * r, y: 0.9, z: Math.sin(a) * r, rx: Math.sin(a) * tilt, rz: -Math.cos(a) * tilt }), color: '#ffffff' });
    }
    return G.mergeGeos(P);
  }
  function kelpGeo() {
    const g = new T.PlaneGeometry(0.9, 15, 1, 16);
    g.translate(0, 7.5, 0);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i);
      const t = y / 15;
      P.setX(i, P.getX(i) * (1 - t * 0.55) + Math.sin(t * 9) * 0.25);
    }
    const g2 = g.clone();
    g2.rotateY(Math.PI / 2);
    return G.mergeGeos([{ geo: g, color: '#ffffff' }, { geo: g2, color: '#e8ffe0' }]);
  }
  function fishGeo() {
    const tail = new T.BufferGeometry();
    tail.setAttribute('position', new T.Float32BufferAttribute([0, 0, -0.5, 0, 0.42, -1.05, 0, -0.42, -1.05], 3));
    tail.computeVertexNormals();
    const fin = new T.BufferGeometry();
    fin.setAttribute('position', new T.Float32BufferAttribute([0, 0.3, 0.2, 0, 0.62, -0.25, 0, 0.3, -0.35], 3));
    fin.computeVertexNormals();
    return G.mergeGeos([
      { geo: new T.SphereGeometry(0.5, 10, 8), matrix: M({ sx: 0.42, sy: 0.7, sz: 1.15 }), color: '#ffffff' },
      { geo: tail, color: '#ffffff' },
      { geo: fin, color: '#ffffff' },
      { geo: new T.SphereGeometry(0.07, 6, 5), matrix: M({ x: 0.18, y: 0.1, z: 0.4 }), color: '#1c1330' },
      { geo: new T.SphereGeometry(0.07, 6, 5), matrix: M({ x: -0.18, y: 0.1, z: 0.4 }), color: '#1c1330' },
    ]);
  }
  function shaftTex() {
    return G.canvasTex(64, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(255,255,255,.9)');
      gr.addColorStop(0.6, 'rgba(255,255,255,.35)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-in';
      const gx = g.createLinearGradient(0, 0, w, 0);
      gx.addColorStop(0, 'rgba(0,0,0,0)');
      gx.addColorStop(0.5, 'rgba(0,0,0,1)');
      gx.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gx;
      g.fillRect(0, 0, w, h);
    }, { wrapT: T.ClampToEdgeWrapping });
  }

  const reefMat = () => K.addCaustics(new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }), 0.45);

  /* -------------------------------------------------------- builders */
  function buildReef(root, w) {
    const area = K.area(200);
    const kits = [
      { geo: branchCoral(), n: 120, s: [0.8, 1.7] },
      { geo: brainCoral(), n: 80, s: [0.7, 1.6] },
      { geo: tubeSponge(), n: 70, s: [0.7, 1.4] },
      { geo: seaFan(), n: 70, s: [0.8, 1.6] },
      { geo: anemone(), n: 90, s: [0.8, 1.5] },
    ];
    const mat = reefMat();
    const col = new T.Color();
    for (const kit of kits) {
      const near = K.scatter(Math.round(kit.n * 0.65), area, { minTrack: EDGE + 1.5, maxTrack: EDGE + 16, gap: 2.2 });
      const far = K.scatter(Math.round(kit.n * 0.35), area, { minTrack: EDGE + 16, maxTrack: 140, gap: 5 });
      const spots = near.concat(far);
      const mesh = new T.InstancedMesh(kit.geo, mat, spots.length);
      spots.forEach((p, i) => {
        mesh.setMatrixAt(i, M({ x: p[0], y: G.groundHeight(p[0], p[1]) - 0.15, z: p[1], ry: Math.random() * 6.28, s: G.rand(kit.s[0], kit.s[1]) }));
        mesh.setColorAt(i, col.set(REEF[(Math.random() * REEF.length) | 0]).offsetHSL(G.rand(-0.02, 0.02), 0, G.rand(-0.05, 0.05)));
      });
      root.add(mesh);
    }
    // rocks
    const rockGeo = new T.DodecahedronGeometry(1, 1);
    const rp = rockGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const x = rp.getX(i), y = rp.getY(i), z = rp.getZ(i);
      const n = 1 + 0.18 * Math.sin(x * 4.1 + z * 3.3) * Math.cos(y * 3.7);
      rp.setXYZ(i, x * n, y * n, z * n);
    }
    rockGeo.computeVertexNormals();
    const rockMat = K.addCaustics(new T.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), 0.4);
    const rocks = K.scatter(110, area, { minTrack: EDGE + 3, gap: 7 });
    const rm = new T.InstancedMesh(rockGeo, rockMat, rocks.length);
    rocks.forEach((p, i) => {
      const s = G.rand(1.2, 4.2);
      rm.setMatrixAt(i, M({ x: p[0], y: G.groundHeight(p[0], p[1]) - s * 0.3, z: p[1], rx: Math.random(), ry: Math.random() * 6, sx: s * G.rand(0.8, 1.4), sy: s * G.rand(0.5, 0.9), sz: s }));
      rm.setColorAt(i, col.set(Math.random() < 0.5 ? '#6c6a8c' : '#5b6f8c'));
    });
    rm.castShadow = true;
    root.add(rm);
  }

  function buildKelp(root, w) {
    const geo = kelpGeo();
    const mat = K.addSway(new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide }), sway, 0.016, 0);
    const area = K.area(160);
    // dense forest along the western sweepers, scattered elsewhere
    const forest = [];
    K.alongTrack(1190, 1530, 3.2, 0, (p, s) => {
      for (const side of [-1, 1]) {
        const d = side * (EDGE + G.rand(1.5, 30));
        const q = Track.at(s + G.rand(-1.5, 1.5), d);
        if (K.trackDist(q.x, q.z) > EDGE + 1) forest.push([q.x, q.z]);
      }
    });
    const scattered = K.scatter(180, area, { minTrack: EDGE + 4, gap: 4 });
    const spots = forest.concat(scattered);
    const mesh = new T.InstancedMesh(geo, mat, spots.length);
    const col = new T.Color();
    spots.forEach((p, i) => {
      mesh.setMatrixAt(i, M({ x: p[0], y: G.groundHeight(p[0], p[1]) - 0.2, z: p[1], ry: Math.random() * 6.28, sy: G.rand(0.7, 1.35), sx: G.rand(0.8, 1.2) }));
      mesh.setColorAt(i, col.set(Math.random() < 0.5 ? '#6f9a3a' : '#4e8c55').offsetHSL(G.rand(-0.03, 0.03), 0, G.rand(-0.06, 0.06)));
    });
    root.add(mesh);
  }

  function buildArch(root, w) {
    const p = Track.at(ARCH_S, 0);
    const R = EDGE + 4;
    const geo = new T.TorusGeometry(R, 4.2, 10, 40, Math.PI);
    const P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const n = 1 + 0.12 * Math.sin(x * 0.7 + z * 1.3) * Math.cos(y * 0.9);
      P.setXYZ(i, x * (1 + (n - 1) * 0.4), y * n, z * n);
    }
    geo.computeVertexNormals();
    const mesh = new T.Mesh(geo, K.addCaustics(new T.MeshLambertMaterial({ color: 0x6f6a90, flatShading: true }), 0.5));
    mesh.position.set(p.x, p.y - 3, p.z);
    mesh.rotation.y = p.heading;
    mesh.scale.set(1, 0.72, 1);
    mesh.castShadow = true;
    root.add(mesh);
    // coral crusting the arch
    const crust = new T.InstancedMesh(brainCoral(), reefMat(), 14);
    const col = new T.Color();
    for (let i = 0; i < 14; i++) {
      const a = (i / 13) * Math.PI;
      const lx = Math.cos(a) * (R + 2.8), ly = Math.sin(a) * (R + 2.8) * 0.72;
      const rx = -Math.cos(p.heading), rz = Math.sin(p.heading);
      crust.setMatrixAt(i, M({ x: p.x + rx * lx, y: p.y - 3 + ly, z: p.z + rz * lx, rz: a - Math.PI / 2, s: G.rand(0.6, 1.1) }));
      crust.setColorAt(i, col.set(REEF[i % REEF.length]));
    }
    root.add(crust);
  }

  function buildTunnel(root, w) {
    const R = EDGE + 0.7, SY = 0.74, segs = 18;
    const pos = [], nor = [], uv = [], idx = [];
    const step = 2;
    let rows = 0;
    for (let s = TUNNEL.s0; s <= TUNNEL.s1; s += step) {
      const p = Track.at(s, 0);
      const rx = -p.tz, rz = p.tx;
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * Math.PI;
        const lx = Math.cos(a) * R, ly = Math.sin(a) * R * SY;
        pos.push(p.x + rx * lx, p.y + ly, p.z + rz * lx);
        nor.push(-rx * Math.cos(a), -Math.sin(a), -rz * Math.cos(a));
        uv.push(j / segs, (s - TUNNEL.s0) / 20);
      }
      rows++;
    }
    for (let r = 0; r < rows - 1; r++) for (let j = 0; j < segs; j++) {
      const a = r * (segs + 1) + j, b = a + segs + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const glass = new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide,
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: [
        'uniform float time; varying vec3 vN; varying vec3 vW; varying vec2 vUv;',
        'void main(){',
        '  vec3 v = normalize(cameraPosition - vW);',
        '  float fres = pow(1.0 - abs(dot(normalize(vN), v)), 2.2);',
        '  float streak = smoothstep(0.985, 1.0, sin(vUv.x * 9.0 + vUv.y * 1.3 - time * 0.7));',
        '  float edge = smoothstep(0.0, 0.04, vUv.x) * smoothstep(1.0, 0.96, vUv.x);',
        '  vec3 c = mix(vec3(0.55, 0.95, 1.0), vec3(1.0), fres);',
        '  float a = (0.05 + fres * 0.42 + streak * 0.22) * edge;',
        '  gl_FragColor = vec4(c, a);',
        '  #include <encodings_fragment>',
        '}',
      ].join('\n'),
    });
    const tube = new T.Mesh(geo, glass);
    tube.renderOrder = 4;
    root.add(tube);
    w.tunnelGlass = glass;
    // ribs and glowing portal rings
    const ribGeo = new T.TorusGeometry(R, 0.38, 8, 40, Math.PI);
    ribGeo.scale(1, SY, 1);
    const n = Math.floor((TUNNEL.s1 - TUNNEL.s0) / 10) + 1;
    const ribs = new T.InstancedMesh(ribGeo, K.addCaustics(new T.MeshLambertMaterial({ color: 0xd8f3ff }), 0.4), n);
    for (let i = 0; i < n; i++) {
      const p = Track.at(TUNNEL.s0 + i * 10, 0);
      ribs.setMatrixAt(i, M({ x: p.x, y: p.y, z: p.z, ry: p.heading }));
    }
    root.add(ribs);
    const ringMat = new T.MeshBasicMaterial({ color: 0x7ff6ff });
    for (const s of [TUNNEL.s0, TUNNEL.s1]) {
      const p = Track.at(s, 0);
      const ring = new T.Mesh(new T.TorusGeometry(R + 0.2, 0.3, 8, 48, Math.PI).scale(1, SY, 1), ringMat);
      ring.position.set(p.x, p.y + 0.02, p.z);
      ring.rotation.y = p.heading;
      root.add(ring);
      for (let j = 0; j <= 12; j++) {
        const a = (j / 12) * Math.PI;
        const rx = -p.tz, rz = p.tx;
        w.addGlow(p.x + rx * Math.cos(a) * R, p.y + Math.sin(a) * R * SY, p.z + rz * Math.cos(a) * R, '#7ff6ff', 0.9);
      }
    }
  }

  function buildShip(root, w) {
    const g = new T.Group();
    const sh = new T.Shape();
    sh.moveTo(-11, 0.8); sh.quadraticCurveTo(-10, -0.4, -6, -0.6); sh.lineTo(7, -0.6); sh.quadraticCurveTo(11, -0.2, 13, 3.8);
    sh.lineTo(-12, 4.2); sh.lineTo(-11, 0.8);
    const hull = new T.ExtrudeGeometry(sh, { depth: 6, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3, bevelSegments: 1 });
    hull.translate(0, 0, -3);
    const P = [
      { geo: hull, color: '#6b4b3a' },
      { geo: new T.BoxGeometry(23, 0.35, 5.4), matrix: M({ y: 4.1, x: 0.3 }), color: '#8a6a4a' },
      { geo: new T.BoxGeometry(5.5, 3, 4.2), matrix: M({ x: -6.5, y: 5.8 }), color: '#7a5a42' },
      { geo: new T.CylinderGeometry(0.35, 0.42, 8, 8), matrix: M({ x: 2, y: 7.5, rz: 0.45 }), color: '#5a3d2e' },
      { geo: new T.CylinderGeometry(0.3, 0.35, 4, 8), matrix: M({ x: 8, y: 5.5, rz: -0.9 }), color: '#5a3d2e' },
      { geo: new T.SphereGeometry(1.4, 8, 6), matrix: M({ x: -2, y: 4.4, z: 1.6, sy: 0.35 }), color: '#4e8c55' },
      { geo: new T.SphereGeometry(1.1, 8, 6), matrix: M({ x: 6, y: 3.6, z: -2.9, sy: 0.4 }), color: '#4e8c55' },
    ];
    const mesh = new T.Mesh(G.mergeGeos(P), K.addCaustics(new T.MeshLambertMaterial({ vertexColors: true }), 0.4));
    mesh.castShadow = true;
    g.add(mesh);
    const win = new T.MeshBasicMaterial({ color: 0x7ff6ff });
    for (const x of [-7.8, -6.5, -5.2]) {
      const m = new T.Mesh(new T.CircleGeometry(0.35, 12), win);
      m.position.set(x, 6.1, 2.12);
      g.add(m);
    }
    // treasure chest spilling gold
    const chest = new T.Group();
    const box = new T.Mesh(new T.BoxGeometry(2.2, 1.2, 1.4), new T.MeshLambertMaterial({ color: 0x7a4a2a }));
    box.position.y = 0.6;
    const lid = new T.Mesh(new T.CylinderGeometry(0.7, 0.7, 2.2, 12, 1, false, 0, Math.PI), new T.MeshLambertMaterial({ color: 0x8a5a32 }));
    lid.rotation.z = Math.PI / 2;
    lid.rotation.x = -0.9;
    lid.position.set(0, 1.25, -0.5);
    chest.add(box, lid);
    const gold = new T.MeshBasicMaterial({ color: 0xffd35a });
    for (let i = 0; i < 14; i++) {
      const c = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 0.06, 10), gold);
      c.position.set(G.rand(-1.6, 1.6), 0.05 + Math.random() * 0.2, G.rand(0.6, 1.8));
      c.rotation.set(Math.random(), 0, Math.random());
      chest.add(c);
    }
    chest.position.set(-2, 0, 7.5);
    g.add(chest);
    const y0 = G.groundHeight(SHIP.x, SHIP.z);
    g.position.set(SHIP.x, y0 - 1.2, SHIP.z);
    g.rotation.set(0.12, 2.2, 0.22);
    root.add(g);
    root.updateMatrixWorld(true);
    const v = new T.Vector3(-2, 1.4, 7.5);
    g.localToWorld(v);
    w.addGlow(v.x, v.y, v.z, '#ffd35a', 3.5);
  }

  function buildClam(root, w) {
    const g = new T.Group();
    const shellMat = K.addCaustics(new T.MeshLambertMaterial({ color: 0xc7b6e6 }), 0.4);
    const bottom = new T.Mesh(new T.SphereGeometry(3.2, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shellMat);
    bottom.scale.set(1.25, 0.5, 1);
    const top = new T.Mesh(new T.SphereGeometry(3.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), shellMat);
    top.scale.set(1.25, 0.5, 1);
    top.position.set(0, 0, -2.2);
    top.rotation.x = -0.75;
    top.position.y = 0.4;
    const pearl = new T.Mesh(new T.SphereGeometry(0.9, 20, 14), new T.MeshBasicMaterial({ color: 0xfff0fb }));
    pearl.position.set(0, 0.6, 0.3);
    g.add(bottom, top, pearl);
    g.position.set(CLAM.x, G.groundHeight(CLAM.x, CLAM.z) + 1.4, CLAM.z);
    g.rotation.y = 0.8;
    root.add(g);
    w.addGlow(CLAM.x, G.groundHeight(CLAM.x, CLAM.z) + 2.1, CLAM.z, '#ffd9f4', 5);
    w.clamTop = top;
  }

  function buildShafts(root, w) {
    const tex = shaftTex();
    const shafts = [];
    const area = K.area(120);
    for (let i = 0; i < 18; i++) {
      const x = G.rand(area[0], area[1]), z = G.rand(area[2], area[3]);
      const g = new T.Group();
      const mat = new T.MeshBasicMaterial({ map: tex, color: 0xc8fbff, transparent: true, opacity: 0.12, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false });
      const wdt = G.rand(10, 22);
      for (const r of [0, Math.PI / 2]) {
        const m = new T.Mesh(new T.PlaneGeometry(wdt, 130), mat);
        m.rotation.y = r;
        g.add(m);
      }
      g.position.set(x, 52, z);
      g.rotation.set(G.rand(-0.12, 0.12), Math.random() * 3, 0.18);
      root.add(g);
      shafts.push({ mat, ph: Math.random() * 6.28, base: G.rand(0.07, 0.15) });
    }
    w.shafts = shafts;
  }

  function buildFish(root, w) {
    const geo = fishGeo();
    const mat = new T.MeshLambertMaterial({ vertexColors: true, side: T.DoubleSide });
    const schools = [];
    const palette = [['#ffd23f', '#ffe27a'], ['#4aa8ff', '#7cc4ff'], ['#ff8a3d', '#ffb07a'], ['#7cf0b4', '#c2ffd9'], ['#ff6f86', '#ffb3c2'], ['#c58bff', '#e0c4ff']];
    const area = K.area(40);
    let total = 0;
    for (let i = 0; i < 9; i++) {
      const n = 14 + (i % 3) * 4;
      const cx = G.rand(area[0], area[1]), cz = G.rand(area[2], area[3]);
      schools.push({ cx, cz, cy: G.groundHeight(cx, cz) + G.rand(5, 14), r: G.rand(14, 32), w: G.rand(0.12, 0.24) * (Math.random() < 0.5 ? -1 : 1), n, start: total, col: palette[i % palette.length], fish: [] });
      total += n;
    }
    const mesh = new T.InstancedMesh(geo, mat, total);
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.frustumCulled = false;
    const col = new T.Color();
    for (const sc of schools) for (let k = 0; k < sc.n; k++) {
      sc.fish.push({ ph: Math.random() * 0.9, rj: G.rand(-3, 3), yj: G.rand(-2, 2), s: G.rand(0.7, 1.15) });
      mesh.setColorAt(sc.start + k, col.set(sc.col[k % 2]));
    }
    root.add(mesh);
    w.fish = { mesh, schools };
  }

  function buildWhaleShark(root, w) {
    const g = new T.Group();
    const bodyMat = K.addCaustics(new T.MeshLambertMaterial({ color: 0x3e5d7e }), 0.5);
    const bellyMat = new T.MeshLambertMaterial({ color: 0xe8f2f6 });
    const body = new T.Mesh(new T.CapsuleGeometry(2.4, 10, 8, 16), bodyMat);
    body.rotation.x = Math.PI / 2;
    body.scale.set(1.25, 1, 0.85);
    const belly = new T.Mesh(new T.CapsuleGeometry(2.2, 9.5, 6, 14), bellyMat);
    belly.rotation.x = Math.PI / 2;
    belly.scale.set(1.1, 1, 0.7);
    belly.position.y = -0.55;
    g.add(belly, body);
    const spots = new T.InstancedMesh(new T.SphereGeometry(0.22, 6, 5), new T.MeshBasicMaterial({ color: 0xf3f8ff }), 60);
    for (let i = 0; i < 60; i++) {
      const z = G.rand(-6, 6.5), a = G.rand(-1.1, 1.1);
      spots.setMatrixAt(i, M({ x: Math.sin(a) * 2.85, y: Math.cos(a) * 1.95 + 0.05, z, sy: 0.5 }));
    }
    g.add(spots);
    const finMat = bodyMat;
    const dorsal = new T.Mesh(new T.ConeGeometry(1.1, 3.2, 4), finMat);
    dorsal.position.set(0, 2.6, -1.5);
    dorsal.rotation.x = -0.5;
    dorsal.scale.set(0.3, 1, 1);
    g.add(dorsal);
    for (const s of [-1, 1]) {
      const pec = new T.Mesh(new T.ConeGeometry(1.2, 4.5, 4), finMat);
      pec.position.set(s * 3.3, -0.9, 2.2);
      pec.rotation.set(0.3, 0, s * 1.3);
      pec.scale.set(1, 1, 0.25);
      g.add(pec);
    }
    const tail = new T.Group();
    tail.position.z = -7.2;
    const fluke = new T.Shape();
    fluke.moveTo(0, 0); fluke.quadraticCurveTo(-1.5, 3.5, -3.6, 5.6); fluke.quadraticCurveTo(-1.2, 1.4, -1.2, 0);
    fluke.quadraticCurveTo(-1.6, -1.5, -2.8, -3.2); fluke.quadraticCurveTo(-0.6, -1.2, 0, 0);
    const fl = new T.Mesh(new T.ShapeGeometry(fluke), new T.MeshLambertMaterial({ color: 0x3e5d7e, side: T.DoubleSide }));
    fl.rotation.y = Math.PI / 2;
    tail.add(fl);
    const stalk = new T.Mesh(new T.ConeGeometry(1.4, 3.2, 10), bodyMat);
    stalk.rotation.x = -Math.PI / 2;
    stalk.position.z = 0.6;
    tail.add(stalk);
    g.add(tail);
    const mouth = new T.Mesh(new T.BoxGeometry(3.6, 0.25, 0.6), new T.MeshBasicMaterial({ color: 0x1c1330 }));
    mouth.position.set(0, -0.4, 7.1);
    g.add(mouth);
    for (const s of [-1, 1]) {
      const eye = new T.Mesh(new T.SphereGeometry(0.22, 8, 6), new T.MeshBasicMaterial({ color: 0x1c1330 }));
      eye.position.set(s * 2.6, 0.3, 5.6);
      g.add(eye);
    }
    root.add(g);
    w.shark = { g, tail, cx: G.terrainCenter.x, cz: G.terrainCenter.z, r: 165, y: 32 };
  }

  function buildJellies(root, w) {
    const jellies = [];
    const bellGeo = new T.SphereGeometry(1.3, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const tentGeo = new T.CylinderGeometry(0.05, 0.02, 3.2, 4);
    tentGeo.translate(0, -1.6, 0);
    const cols = [0xff9ad5, 0x9fd8ff, 0xc8a4ff];
    for (let i = 0; i < 16; i++) {
      const s = 360 + i * 16 + G.rand(-4, 4);
      const side = i % 2 ? 1 : -1;
      const p = Track.at(s, side * (EDGE + G.rand(3, 22)));
      const g = new T.Group();
      const mat = new T.MeshBasicMaterial({ color: cols[i % 3], transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
      const bell = new T.Mesh(bellGeo, mat);
      g.add(bell);
      const core = new T.Mesh(new T.SphereGeometry(0.45, 10, 8), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false }));
      core.position.y = 0.35;
      g.add(core);
      const tents = [];
      for (let k = 0; k < 6; k++) {
        const t = new T.Mesh(tentGeo, mat);
        const a = (k / 6) * Math.PI * 2;
        t.position.set(Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8);
        g.add(t);
        tents.push(t);
      }
      const y = G.groundHeight(p.x, p.z) + G.rand(4, 10);
      g.position.set(p.x, y, p.z);
      root.add(g);
      jellies.push({ g, bell, tents, y, ph: Math.random() * 6.28 });
    }
    w.jellies = jellies;
  }

  function vents(w) {
    const out = [];
    for (const [s, d] of [[120, 1], [330, -1], [560, 1], [800, -1], [980, 1], [1260, -1], [1420, 1], [1560, -1]]) {
      const p = Track.at(s, d * (EDGE + 5));
      out.push([p.x, G.groundHeight(p.x, p.z), p.z]);
    }
    w.vents = out;
  }

  G.COURSES.push({
    id: 'aqua', name: 'サンゴ礁アクアリウム', en: 'CORAL REEF AQUARIUM', tag: '巨大水槽の海の底', color: '#5ad1ff',
    ctrl: [
      [-60, 0, 0], [60, 0, 0], [150, -1, -10], [200, -3, -60], [190, -7, -125], [130, -10, -150], [75, -10, -118], [20, -8, -140],
      [-5, -5, -200], [40, -2, -245], [125, 0, -250], [200, 0, -272], [214, 0, -325], [160, 0, -357], [50, 0, -345],
      [-65, -2, -320], [-125, -4, -250], [-148, -4, -160], [-142, -2, -75], [-105, 0, -12],
    ],
    sky: { top: '#86eef5', mid: '#1f8fb3', horizon: '#145f80', sun: '#d8fbff', mode: 2 },
    fog: { color: '#145f80', near: 40, far: 340 },
    light: { dir: [0.15, 1.0, 0.25], sky: 0xa8f4ff, ground: 0x2a6d8c, hemi: 1.0, color: 0xd8fbff, intensity: 0.85 },
    clouds: false, sea: false, glowOpacity: 0.8,
    theme: {
      road: { base: '#3f6276', speck: ['#4a6f84', '#33566a', '#557a8f', '#3a5d71'], line: '#effcff' },
      shoulder: { base: '#d3c497', speck: ['#dfd2a8', '#c4b588', '#dacda2', '#bcad80'] },
      wall: { a: '#ff8a6b', b: '#f2fbff', dark: '#123a55' },
      curb: ['#ffd35a', '#f2fbff'],
    },
    groundMat(mat, kind) { K.addCaustics(mat, kind === 'road' ? 0.38 : 0.55); },
    height(x, z) {
      let h = 0.5 * Math.sin(x * 0.06 + Math.sin(z * 0.04) * 2) * Math.cos(z * 0.05) + 0.3 * Math.sin(x * 0.17 + z * 0.11);
      h -= 7 * Math.exp(-((x - TRENCH.x) ** 2 + (z - TRENCH.z) ** 2) / (95 * 95));
      const r = Math.hypot(x - G.terrainCenter.x, z - G.terrainCenter.z);
      if (r > 300) {
        const k = K.smooth(300, 520, r);
        const a = Math.atan2(z - G.terrainCenter.z, x - G.terrainCenter.x);
        h += k * (45 + 60 * (0.5 + 0.5 * Math.sin(a * 7) * Math.cos(a * 3 + 1)));
      }
      return h;
    },
    ground(x, z, h, dist, tmp, roadY) {
      if (h > 10) return tmp.copy(cRock).lerp(cDeep, G.clamp((h - 10) / 60, 0, 0.6));
      const rip = 0.5 + 0.5 * Math.sin(x * 0.35 + Math.sin(z * 0.06) * 3 + z * 0.1);
      tmp.copy(cSand).lerp(cSand2, rip * 0.6);
      if (h < -3) tmp.lerp(cTrench, G.clamp((-h - 3) / 6, 0, 0.6));
      return tmp;
    },
    pads: [[150, -3], [745, 3], [1050, 0], [1360, -3]],
    itemRows: [240, 620, 960, 1460],
    ramps: [{ s: 722, h: 1.5 }, { s: 1290, h: 1.4 }],
    stalls: null,
    scenery: {
      festoons: { at: [60, 300, 520, 860, 1240, 1400], colors: ['#7ff6ff', '#ff9ad5', '#c8a4ff', '#fff7c2'], bulb: 0.32, glow: 0.85 },
      grandstand: { text: 'うみのそこへ、ようこそ！', sub: 'WELCOME TO THE REEF', roof: 0x35d3c3, seat: 0xff8a6b, bg: '#0d3550' },
      gantry: { title: 'サンゴ礁アクアリウム', sub: 'CORAL REEF AQUARIUM', bg: '#0d3550', accent: '#35d3c3', frame: 0x123a55 },
    },
    fireworks: null,
    music: { transpose: 3, tempo: 132, lead: 'triangle', soft: true },
    build(root, w) {
      buildReef(root, w);
      buildKelp(root, w);
      buildArch(root, w);
      buildTunnel(root, w);
      buildShip(root, w);
      buildClam(root, w);
      buildShafts(root, w);
      buildFish(root, w);
      buildWhaleShark(root, w);
      buildJellies(root, w);
      vents(w);
    },
    update(w, dt, t, focus) {
      K.caustic.value = t;
      sway.value = t;
      if (w.tunnelGlass) w.tunnelGlass.uniforms.time.value = t;
      if (w.shafts) for (const s of w.shafts) s.mat.opacity = s.base * (0.65 + 0.35 * Math.sin(t * 0.5 + s.ph));
      if (w.clamTop) w.clamTop.rotation.x = -0.75 + Math.sin(t * 0.6) * 0.12;
      // fish schools circling
      if (w.fish) {
        const m = w.fish.mesh;
        for (const sc of w.fish.schools) {
          sc.fish.forEach((f, k) => {
            const a = sc.w * t + f.ph * Math.sign(sc.w) * 0.9 + k * 0.05;
            const R = sc.r + f.rj;
            const x = sc.cx + Math.cos(a) * R, z = sc.cz + Math.sin(a) * R;
            const y = sc.cy + f.yj + Math.sin(t * 1.3 + k) * 0.4;
            const yaw = Math.atan2(-Math.sin(a) * Math.sign(sc.w), Math.cos(a) * Math.sign(sc.w)) + Math.sin(t * 9 + k) * 0.18;
            m.setMatrixAt(sc.start + k, compose(x, y, z, yaw, f.s));
          });
        }
        m.instanceMatrix.needsUpdate = true;
      }
      if (w.shark) {
        const s = w.shark, a = t * 0.045;
        s.g.position.set(s.cx + Math.cos(a) * s.r, s.y + Math.sin(t * 0.3) * 2, s.cz + Math.sin(a) * s.r);
        s.g.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a));
        s.g.rotation.z = Math.sin(t * 0.5) * 0.06;
        s.tail.rotation.y = Math.sin(t * 1.6) * 0.32;
      }
      if (w.jellies) for (const j of w.jellies) {
        const pulse = Math.sin(t * 1.6 + j.ph);
        j.g.position.y = j.y + Math.sin(t * 0.7 + j.ph) * 1.4;
        j.bell.scale.set(1 - pulse * 0.08, 0.8 + pulse * 0.12, 1 - pulse * 0.08);
        j.tents.forEach((tt, k) => { tt.rotation.x = Math.sin(t * 2 + k + j.ph) * 0.25; tt.rotation.z = Math.cos(t * 1.7 + k) * 0.25; });
      }
      // rising bubbles: vents near the camera focus and each kart's exhaust
      if (focus) {
        w.bubT = (w.bubT || 0) - dt;
        if (w.bubT <= 0) {
          w.bubT = 0.09;
          for (const v of w.vents) {
            if ((v[0] - focus.x) ** 2 + (v[2] - focus.z) ** 2 > 160 * 160) continue;
            G.FX.bubbles(v[0], v[1] + 0.3, v[2], 2, 0.6);
          }
          const race = G.Game.race;
          if (race) for (const k of race.karts) {
            if ((k.x - focus.x) ** 2 + (k.z - focus.z) ** 2 > 70 * 70 || Math.abs(k.speed) < 4) continue;
            if (Math.random() < 0.5) G.FX.bubbles(k.x - Math.sin(k.h) * 1.8, k.y + 1.0 + k.hopY, k.z - Math.cos(k.h) * 1.8, 1, 0.3);
          }
        }
      }
    },
  });
})();
