/* 汐風GP — item boxes and the 14 festival items */
(function () {
  'use strict';
  const G = window.G;
  const T = THREE;
  const Track = G.Track;
  const { ROAD, EDGE } = G.TRACK_DIMS;
  const WALLD = EDGE - 1.3;

  const Items = (G.Items = { boxes: [], ents: [], hazards: [], scene: null, waveActive: false });

  Items.LIST = {
    turbo: { name: 'ターボ', icon: 'i-turbo' },
    triple: { name: 'トリプルターボ', icon: 'i-triple', count: 3 },
    uchiwa: { name: '金のうちわ', icon: 'i-uchiwa' },
    oil: { name: 'オイル', icon: 'i-oil' },
    wataame: { name: 'わたあめ', icon: 'i-wataame' },
    balloon: { name: '水風船', icon: 'i-balloon' },
    balloon3: { name: 'トリプル水風船', icon: 'i-balloon3', count: 3 },
    beachball: { name: 'ビーチボール', icon: 'i-beachball' },
    hanabi: { name: '打ち上げ花火', icon: 'i-hanabi' },
    takoyaki: { name: 'たこ焼きボム', icon: 'i-takoyaki' },
    ink: { name: 'タコスミ', icon: 'i-ink' },
    wave: { name: '大波', icon: 'i-wave' },
    shield: { name: 'シールド', icon: 'i-shield' },
    happi: { name: 'ハッピタイム', icon: 'i-happi' },
  };
  Items.ICON = {};
  Items.NAME = {};
  for (const k in Items.LIST) { Items.ICON[k] = Items.LIST[k].icon; Items.NAME[k] = Items.LIST[k].name; }
  Items.KEYS = Object.keys(Items.LIST);

  // weights per finishing place (index 1..8)
  const TABLE = [
    null,
    { oil: 20, wataame: 16, balloon: 22, balloon3: 8, beachball: 12, shield: 14, turbo: 8 },
    { balloon: 14, balloon3: 12, beachball: 12, oil: 10, wataame: 8, hanabi: 12, takoyaki: 10, turbo: 10, shield: 10, ink: 2 },
    { balloon: 8, balloon3: 12, beachball: 10, hanabi: 14, takoyaki: 12, turbo: 12, triple: 8, shield: 8, ink: 6, oil: 4, wataame: 4, uchiwa: 2 },
    { hanabi: 14, takoyaki: 12, balloon3: 10, beachball: 6, turbo: 14, triple: 12, ink: 8, shield: 8, wave: 4, uchiwa: 6, happi: 2, balloon: 4 },
    { hanabi: 14, takoyaki: 10, triple: 16, turbo: 10, uchiwa: 10, ink: 10, wave: 7, happi: 6, balloon3: 8, shield: 6, beachball: 3 },
    { triple: 16, hanabi: 13, takoyaki: 9, uchiwa: 13, ink: 10, wave: 10, happi: 11, turbo: 9, balloon3: 6, shield: 3 },
    { triple: 17, uchiwa: 16, happi: 16, wave: 12, hanabi: 12, ink: 9, takoyaki: 8, turbo: 10 },
    { triple: 16, uchiwa: 18, happi: 20, wave: 13, hanabi: 12, ink: 8, takoyaki: 6, turbo: 7 },
  ];

  /* ------------------------------------------------------------ assets */
  let M = {};
  function toon(c, extra) { return new T.MeshToonMaterial(Object.assign({ color: c, gradientMap: G.Tex.toon }, extra || {})); }
  function qTex() {
    return G.canvasTex(128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.font = '84px "Dela Gothic One", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = 'rgba(28,19,48,1)';
      g.strokeText('?', w / 2, h / 2 + 6);
      g.fillStyle = '#fff';
      g.fillText('?', w / 2, h / 2 + 6);
    }, { wrapT: T.ClampToEdgeWrapping });
  }
  function buildAssets() {
    M.box = new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide,
      uniforms: { time: { value: 0 }, qmap: { value: qTex() } },
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
      fragmentShader: [
        'uniform float time; uniform sampler2D qmap; varying vec2 vUv; varying vec3 vW;',
        'void main(){',
        '  vec2 p = abs(vUv-0.5)*2.0; float edge = max(p.x,p.y);',
        '  float hue = fract(time*0.3 + (vW.x+vW.y+vW.z)*0.05 + edge*0.25);',
        '  vec3 rb = 0.55+0.45*cos(6.2831*(hue+vec3(0.0,0.33,0.67)));',
        '  float border = smoothstep(0.7,0.84,edge);',
        '  vec4 q = texture2D(qmap, vUv);',
        '  vec3 col = mix(vec3(1.0,0.95,0.92)*0.9 + rb*0.15, rb*1.25, border);',
        '  float a = mix(0.3, 0.95, border);',
        '  col = mix(col, q.rgb, q.a); a = max(a, q.a*0.98);',
        '  gl_FragColor = vec4(col, a);',
        '  #include <encodings_fragment>',
        '}',
      ].join('\n'),
    });
    M.oil = new T.MeshBasicMaterial({
      map: G.canvasTex(128, 128, (g) => {
        g.fillStyle = '#231a38';
        g.beginPath();
        for (let i = 0; i <= 24; i++) {
          const a = (i / 24) * Math.PI * 2, r = 46 + Math.sin(i * 2.7) * 9 + Math.cos(i * 1.3) * 6;
          const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.fill();
        const gr = g.createLinearGradient(30, 30, 100, 100);
        gr.addColorStop(0, 'rgba(160,140,255,.7)'); gr.addColorStop(0.5, 'rgba(53,211,195,.5)'); gr.addColorStop(1, 'rgba(255,90,110,.5)');
        g.strokeStyle = gr; g.lineWidth = 6;
        g.beginPath(); g.arc(58, 58, 24, 3.6, 5.6); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.75)';
        g.beginPath(); g.ellipse(50, 46, 9, 5, -0.6, 0, Math.PI * 2); g.fill();
      }, { wrapT: T.ClampToEdgeWrapping }),
      transparent: true, depthWrite: false,
    });
    M.balloon = toon(0x4fd8e8, { transparent: true, opacity: 0.93 });
    M.white = new T.MeshBasicMaterial({ color: 0xffffff });
    M.ink = new T.MeshBasicMaterial({ color: 0x1c1330 });
    M.pink = toon(0xffb6d5);
    M.pink2 = toon(0xfff0f6);
    M.stick = toon(0xf3e3cc);
    M.tako = toon(0xc9803f);
    M.sauce = toon(0x5a2a17);
    M.mayo = toon(0xfff6ea);
    M.nori = toon(0x3f8f4a);
    M.rocketR = toon(0xff5a6e);
    M.rocketW = toon(0xfff6ea);
    M.rocketN = toon(0xffb54a);
    M.ball = new T.MeshToonMaterial({
      gradientMap: G.Tex.toon,
      map: G.canvasTex(256, 128, (g, w, h) => {
        const cols = ['#ff5a6e', '#fff6ea', '#35d3c3', '#fff6ea', '#ffb54a', '#fff6ea'];
        cols.forEach((c, i) => { g.fillStyle = c; g.fillRect((i * w) / 6, 0, w / 6 + 1, h); });
        g.fillStyle = '#fff6ea'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
      }, { wrapS: T.RepeatWrapping, wrapT: T.ClampToEdgeWrapping }),
    });
    M.ring = new T.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    M.wave = new T.ShaderMaterial({
      transparent: true, depthWrite: false, side: T.DoubleSide,
      uniforms: { time: { value: 0 } },
      vertexShader: [
        'uniform float time; varying vec2 vUv; varying vec3 vN; varying vec3 vW;',
        'void main(){ vUv = uv; vec3 p = position;',
        '  p.z += sin(p.x*0.6 + time*6.0)*0.25*uv.y; p.y += sin(p.x*0.9 - time*5.0)*0.18*uv.y;',
        '  vec4 w = modelMatrix*vec4(p,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal);',
        '  gl_Position = projectionMatrix*viewMatrix*w; }',
      ].join('\n'),
      fragmentShader: [
        'uniform float time; varying vec2 vUv; varying vec3 vN; varying vec3 vW;',
        'void main(){',
        '  vec3 deep = vec3(0.04,0.42,0.55), mid = vec3(0.2,0.82,0.78), foam = vec3(1.0,0.98,0.95);',
        '  float t = vUv.y;',
        '  vec3 c = mix(deep, mid, smoothstep(0.0,0.65,t));',
        '  float f = smoothstep(0.78,0.92,t + sin(vUv.x*40.0+time*8.0)*0.03);',
        '  c = mix(c, foam, f);',
        '  float streak = smoothstep(0.92,1.0,sin(vUv.x*26.0 - t*9.0 + time*3.0));',
        '  c = mix(c, foam, streak*0.25*(1.0-f));',
        '  float edge = smoothstep(0.0,0.06,vUv.x)*smoothstep(1.0,0.94,vUv.x);',
        '  gl_FragColor = vec4(c*1.15, (0.78 + f*0.2)*edge);',
        '  #include <encodings_fragment>',
        '}',
      ].join('\n'),
    });
    // wave geometry: a curling sheet across the road
    const wg = new T.PlaneGeometry(32, 1, 32, 14);
    const P = wg.attributes.position, uv = wg.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i);
      const t = uv.getY(i);
      const y = 8.5 * Math.sin(t * Math.PI * 0.62);
      const z = -7 * (1 - t) * (1 - t) + 3.2 * t * t * t;
      const taper = 1 - Math.pow(Math.abs(x) / 16, 6) * 0.6;
      P.setXYZ(i, x, y * taper, z);
    }
    wg.computeVertexNormals();
    M.waveGeo = wg;
  }

  /* ------------------------------------------------------------ init */
  Items.init = function (scene) {
    Items.scene = scene;
    buildAssets();
    M.box.userData.keep = true;
    M.boxGeo = new T.BoxGeometry(1.7, 1.7, 1.7);
    M.boxGeo.userData.keep = true;
    M.boxGlow = new T.SpriteMaterial({ map: G.Tex.glow, color: 0xfff1d6, transparent: true, opacity: 0.45, blending: T.AdditiveBlending, depthWrite: false });
    M.boxGlow.userData.keep = true;
  };
  // item box rows live inside the course root so they go away with the course
  Items.setRows = function (root, rows) {
    const geo = M.boxGeo;
    for (const b of Items.boxes) if (b.mesh.parent) b.mesh.parent.remove(b.mesh);
    Items.boxes = [];
    for (const s of rows) {
      for (const d of [-6, -2, 2, 6]) {
        const p = Track.at(s, d);
        const m = new T.Mesh(geo, M.box);
        m.position.set(p.x, p.y + 1.35, p.z);
        m.renderOrder = 3;
        root.add(m);
        const glow = new T.Sprite(M.boxGlow);
        glow.scale.set(4.2, 4.2, 1);
        m.add(glow);
        Items.boxes.push({ mesh: m, x: p.x, y: p.y, z: p.z, s, d, off: 0, ph: Math.random() * 6 });
      }
    }
  };
  Items.reset = function () {
    for (const e of Items.ents) if (e.mesh) Items.scene.remove(e.mesh);
    Items.ents = [];
    Items.hazards = [];
    Items.waveActive = false;
    for (const b of Items.boxes) { b.off = 0; b.mesh.visible = true; b.mesh.scale.setScalar(1); }
  };

  /* ------------------------------------------------------------ roulette */
  Items.settle = function (k, race) {
    const t = TABLE[G.clamp(k.place_ || 4, 1, 8)];
    const pool = Object.assign({}, t);
    if (Items.waveActive || (race && race.attract)) delete pool.wave;
    if (race && race.karts && k.place_ === 1) delete pool.ink;
    let total = 0;
    for (const n in pool) total += pool[n];
    let r = Math.random() * total;
    let pick = 'turbo';
    for (const n in pool) { if ((r -= pool[n]) <= 0) { pick = n; break; } }
    k.item = pick;
    k.itemCount = Items.LIST[pick].count || 1;
    k.orbit = 0;
    if (k.isPlayer) G.Audio.play('gotItem');
  };

  function consume(k) {
    k.itemCount--;
    if (k.itemCount <= 0) { k.item = null; k.itemCount = 0; k.orbit = 0; }
  }
  const sfx = (k, name) => { if (k.isPlayer || G.near(k)) G.Audio.play(name); };

  Items.use = function (k, race) {
    const it = k.item;
    if (!it) return;
    const send = (type, prm) => { if (prm && race.online && G.Net) G.Net.itemEvent(k, type, prm); };
    const fx = Math.sin(k.h), fz = Math.cos(k.h);
    switch (it) {
      case 'turbo':
      case 'triple':
        k.boost(1.45, 1.46);
        if (k.isPlayer) { G.Audio.play('boost'); G.shake(0.3); }
        G.FX.burst(k.x - fx * 1.8, k.y + 0.8, k.z - fz * 1.8, 0xffb347, 18, 6);
        consume(k);
        break;
      case 'uchiwa':
        if (!(k.uchiwaT > 0)) k.uchiwaT = 7.5;
        k.boost(1.05, 1.44);
        if (k.isPlayer) { G.Audio.play('uchiwa'); G.shake(0.2); }
        G.FX.burst(k.x - fx * 1.6, k.y + 1.0, k.z - fz * 1.6, 0xffd75e, 22, 7);
        break;
      case 'oil': send('oil', spawnGround(k, 'oil')); sfx(k, 'drop'); consume(k); break;
      case 'wataame': send('wataame', spawnGround(k, 'wataame')); sfx(k, 'puff'); consume(k); break;
      case 'balloon': send('balloon', spawnBalloon(k)); sfx(k, 'throw'); consume(k); break;
      case 'balloon3':
        if (!k.orbit) { k.orbit = k.itemCount; sfx(k, 'shield'); }
        else { send('balloon', spawnBalloon(k)); sfx(k, 'throw'); k.orbit--; consume(k); }
        break;
      case 'beachball': send('beachball', spawnBall(k)); sfx(k, 'throw'); consume(k); break;
      case 'hanabi': send('hanabi', spawnHanabi(k, race)); sfx(k, 'launch'); consume(k); break;
      case 'takoyaki': send('takoyaki', spawnTakoyaki(k)); sfx(k, 'throw'); consume(k); break;
      case 'ink': doInk(k, race); send('ink', []); consume(k); break;
      case 'wave': send('wave', spawnWave(k, race)); consume(k); break;
      case 'shield': k.shieldT = 8; sfx(k, 'shield'); consume(k); break;
      case 'happi':
        k.happiT = 6.5;
        if (k.isPlayer) { G.Audio.play('happi'); G.shake(0.25); }
        else if (G.near(k)) G.Audio.play('happi');
        consume(k);
        break;
    }
  };

  /* ------------------------------------------------------------ entities */
  function add(e) { Items.ents.push(e); if (e.mesh) Items.scene.add(e.mesh); return e; }
  function aheadDiff(a, b) { // track distance from a forward to b (0..L)
    let ds = b - a;
    if (ds < 0) ds += Track.L;
    return ds;
  }
  function kartNear(x, z, r, skip) {
    const out = [];
    for (const k of G.Game.race.karts) {
      if (k === skip) continue;
      const dx = k.x - x, dz = k.z - z;
      if (dx * dx + dz * dz < r * r) out.push(k);
    }
    return out;
  }

  // ground hazards dropped behind: oil (spin) and cotton candy (sticky)
  function spawnGround(k, kind, prm) {
    prm = prm || [Math.round((k.loc.s - 3.4) * 10) / 10, Math.round(k.loc.d * 10) / 10];
    const s = prm[0];
    const p = Track.at(s, prm[1]);
    let mesh;
    if (kind === 'oil') {
      mesh = new T.Mesh(new T.PlaneGeometry(3.4, 3.4), M.oil);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = Math.random() * 6;
      mesh.position.set(p.x, p.y + 0.07, p.z);
      mesh.renderOrder = 2;
    } else {
      mesh = new T.Group();
      const puffs = [[0, 0.7, 0, 0.95], [0.8, 0.55, 0.3, 0.7], [-0.75, 0.5, -0.2, 0.72], [0.2, 0.5, -0.8, 0.66], [-0.2, 1.25, 0.2, 0.62], [0.3, 0.5, 0.85, 0.6]];
      puffs.forEach(([x, y, z, r], i) => {
        const m = new T.Mesh(new T.IcosahedronGeometry(r, 1), i % 2 ? M.pink2 : M.pink);
        m.position.set(x, y, z);
        mesh.add(m);
      });
      const st = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 1.4, 6), M.stick);
      st.position.set(0.1, 0.2, 0.1);
      st.rotation.z = 1.2;
      mesh.add(st);
      mesh.position.set(p.x, p.y, p.z);
    }
    mesh.scale.setScalar(0.2);
    const e = add({
      kind, ground: true, mesh, x: p.x, y: p.y, z: p.z, s: ((s % Track.L) + Track.L) % Track.L, d: prm[1], age: 0, owner: k, uses: kind === 'wataame' ? 2 : 1,
      update(dt, race, t) {
        this.age += dt;
        const sc = Math.min(1, 0.2 + this.age * 4) * (this.kind === 'wataame' ? 0.75 + this.uses * 0.15 : 1);
        this.mesh.scale.setScalar(sc);
        if (this.kind === 'wataame') this.mesh.rotation.y += dt * 0.6;
        for (const kk of race.karts) {
          if (kk.hopY > 0.7) continue;
          if (kk === this.owner && this.age < 0.7) continue;
          const dx = kk.x - this.x, dz = kk.z - this.z;
          if (dx * dx + dz * dz < (this.kind === 'wataame' ? 5.2 : 3.6)) {
            if (this.kind === 'oil') {
              kk.hit('oil');
              G.FX.burst(this.x, this.y + 0.4, this.z, 0xa493ff, 12, 4);
              return false;
            }
            if (kk.stickT > 0.6) continue;
            kk.hit('sticky');
            G.FX.burst(this.x, this.y + 0.9, this.z, 0xffb6d5, 16, 5);
            this.uses--;
            if (this.uses <= 0) return false;
          }
        }
        return this.age < 40;
      },
    });
    Items.hazards.push(e);
    if (Items.hazards.length > 16) {
      const old = Items.hazards.shift();
      old.dead = true;
    }
    return prm;
  }

  // water balloon: hugs its lane and follows the track
  function spawnBalloon(k, prm) {
    prm = prm || [Math.round((k.loc.s + 2.5) * 10) / 10, Math.round(k.loc.d * 10) / 10, Math.round(Math.max(k.speed + 16, 38))];
    const grp = new T.Group();
    const b = new T.Mesh(new T.SphereGeometry(0.6, 16, 12), M.balloon);
    b.scale.set(1, 1.15, 1);
    const knot = new T.Mesh(new T.ConeGeometry(0.14, 0.24, 8), M.balloon);
    knot.position.y = -0.72; knot.rotation.x = Math.PI;
    const hl = new T.Mesh(new T.SphereGeometry(0.16, 8, 6), M.white);
    hl.position.set(-0.22, 0.3, 0.38);
    grp.add(b, knot, hl);
    add({
      kind: 'balloon', mesh: grp, s: prm[0], d: prm[1], v: prm[2], owner: k, age: 0,
      update(dt, race) {
        this.age += dt;
        this.s += this.v * dt;
        this.d *= 1 - Math.min(1, dt * 0.15);
        const p = Track.at(this.s, this.d);
        this.mesh.position.set(p.x, p.y + 1.0 + Math.abs(Math.sin(this.age * 9)) * 0.5, p.z);
        this.mesh.rotation.y = p.heading;
        this.mesh.scale.set(1 + Math.sin(this.age * 18) * 0.06, 1 - Math.sin(this.age * 18) * 0.06, 1);
        for (const kk of race.karts) {
          if (kk === this.owner && this.age < 0.5) continue;
          const dx = kk.x - p.x, dz = kk.z - p.z;
          if (dx * dx + dz * dz < 3.8) {
            kk.hit('balloon');
            if (kk.isPlayer || G.near(kk)) G.Audio.play('splash');
            G.FX.burst(p.x, p.y + 1.2, p.z, 0x7fe6ff, 30, 9);
            return false;
          }
        }
        if (popAgainstHazards(p)) return false;
        if (this.age > 5) { G.FX.burst(p.x, p.y + 1, p.z, 0x7fe6ff, 16, 5); return false; }
        return true;
      },
    });
    return prm;
  }
  function popAgainstHazards(p) {
    for (const h of Items.hazards) {
      if (h.dead) continue;
      const dx = h.x - p.x, dz = h.z - p.z;
      if (dx * dx + dz * dz < 3) { h.dead = true; G.FX.burst(p.x, p.y + 0.8, p.z, 0x7fe6ff, 20, 6); return true; }
    }
    return false;
  }

  // beach ball: bounces between the walls, can hit up to three karts
  function spawnBall(k, prm) {
    prm = prm || [Math.round((k.loc.s + 3) * 10) / 10, Math.round(k.loc.d * 10) / 10, Math.round(G.rand(-6, 6) * 10) / 10 || 3, Math.round(Math.max(k.speed + 10, 34))];
    const m = new T.Mesh(new T.SphereGeometry(1.15, 24, 16), M.ball);
    m.castShadow = true;
    add({
      kind: 'ball', mesh: m, s: prm[0], d: prm[1], vd: prm[2], v: prm[3], owner: k, age: 0, hits: 3, cool: new Map(),
      update(dt, race) {
        this.age += dt;
        this.s += this.v * dt;
        this.d += this.vd * dt;
        if (Math.abs(this.d) > WALLD) {
          this.d = Math.sign(this.d) * WALLD;
          this.vd = -this.vd;
          if (G.near(this.owner) || this.owner.isPlayer) G.Audio.play('boing');
        }
        const p = Track.at(this.s, this.d);
        const bounce = Math.abs(Math.sin(this.age * 5.2)) * 1.6;
        this.mesh.position.set(p.x, p.y + 1.15 + bounce, p.z);
        this.mesh.rotation.x += this.v * dt / 1.15;
        this.mesh.rotation.y = p.heading;
        for (const kk of race.karts) {
          if (kk === this.owner && this.age < 0.9) continue;
          if ((this.cool.get(kk) || 0) > this.age) continue;
          const dx = kk.x - p.x, dz = kk.z - p.z;
          if (dx * dx + dz * dz < 5.2 && bounce < 1.6) {
            this.cool.set(kk, this.age + 1.2);
            kk.hit('ball');
            if (kk.isPlayer || G.near(kk)) G.Audio.play('boing');
            G.FX.burst(p.x, p.y + 1.2, p.z, 0xffffff, 14, 6);
            this.vd = this.d > kk.loc.d ? 7 : -7;
            this.v *= 0.9;
            if (--this.hits <= 0) return false;
          }
        }
        if (this.age > 9) { G.FX.burst(p.x, p.y + 1.2, p.z, 0xff5a6e, 18, 6); return false; }
        return true;
      },
    });
    return prm;
  }

  // homing firework: rises, then chases the kart directly ahead
  function spawnHanabi(k, race, prm) {
    let target = null, best = 260;
    if (prm) target = race.karts.find((o) => o.key && o.key === prm[2]) || null;
    else {
      for (const o of race.karts) {
        if (o === k || o.finished) continue;
        const gap = o.progress - k.progress;
        if (gap > 0 && gap < best) { best = gap; target = o; }
      }
      prm = [Math.round((k.progress + 2) * 10) / 10, Math.round(k.loc.d * 10) / 10, target && target.key ? target.key : ''];
    }
    const g = new T.Group();
    const body = new T.Mesh(new T.CylinderGeometry(0.22, 0.22, 1.3, 10), M.rocketR);
    body.rotation.x = Math.PI / 2;
    const band = new T.Mesh(new T.CylinderGeometry(0.23, 0.23, 0.3, 10), M.rocketW);
    band.rotation.x = Math.PI / 2;
    const nose = new T.Mesh(new T.ConeGeometry(0.22, 0.5, 10), M.rocketN);
    nose.rotation.x = Math.PI / 2; nose.position.z = 0.9;
    g.add(body, band, nose);
    for (let i = 0; i < 3; i++) {
      const fin = new T.Mesh(new T.BoxGeometry(0.05, 0.4, 0.4), M.rocketW);
      fin.position.set(Math.cos(i * 2.09) * 0.25, Math.sin(i * 2.09) * 0.25, -0.55);
      fin.rotation.z = i * 2.09;
      g.add(fin);
    }
    const e = add({
      kind: 'hanabi', mesh: g, prog: prm[0], d: prm[1], target, owner: k, age: 0, h: 1.2,
      update(dt, race) {
        this.age += dt;
        const tg = this.target;
        const v = this.age < 0.35 ? 30 : 58;
        this.prog += v * dt;
        this.h = G.damp(this.h, this.age < 0.5 ? 5 : 2.4, 4, dt);
        if (tg) this.d = G.damp(this.d, tg.loc.d, 3, dt);
        const p = Track.at(this.prog, this.d);
        const q = Track.at(this.prog + 2, this.d);
        this.mesh.position.set(p.x, p.y + this.h, p.z);
        this.mesh.lookAt(q.x, q.y + this.h, q.z);
        this.mesh.rotateZ(this.age * 12);
        const bx = Math.sin(p.heading), bz = Math.cos(p.heading);
        for (let n = 0; n < 2; n++) G.FX.spark(p.x - bx * 0.9, p.y + this.h, p.z - bz * 0.9, -bx * 4 + G.rand(-1.5, 1.5), G.rand(-1, 2), -bz * 4 + G.rand(-1.5, 1.5), n ? 0xffd27a : 0xff8a5c, 0.35, 0.35);
        let boom = null;
        if (tg && !tg.finished && this.prog >= tg.progress - 1.2) boom = tg;
        if (!boom) for (const kk of race.karts) {
          if (kk === this.owner || this.age < 0.6) continue;
          const dx = kk.x - p.x, dz = kk.z - p.z;
          if (dx * dx + dz * dz < 3.5 && this.h < 3) { boom = kk; break; }
        }
        if (boom) {
          boom.hit('hanabi');
          G.FX.firework(boom.x, boom.y + 2.5, boom.z, 0.5);
          G.FX.burst(boom.x, boom.y + 1.5, boom.z, 0xffd27a, 30, 10);
          if (boom.isPlayer || G.near(boom)) { G.Audio.play('boom'); }
          if (boom.isPlayer) G.UI.flash();
          return false;
        }
        if (this.age > (tg ? 7 : 3.2) || (tg && tg.finished)) {
          G.FX.firework(p.x, p.y + this.h + 1, p.z, 0.35);
          if (G.near(this.owner) || this.owner.isPlayer) G.Audio.play('boom');
          return false;
        }
        return true;
      },
    });
    if (target && target.isPlayer) G.UI.warn('hanabi', e);
    return prm;
  }

  // takoyaki bomb: lobbed forward, sizzles, then blasts everything nearby
  function spawnTakoyaki(k, prm) {
    const g = new T.Group();
    const ball = new T.Mesh(new T.SphereGeometry(0.85, 18, 14), M.tako);
    const sauce = new T.Mesh(new T.SphereGeometry(0.87, 18, 10, 0, Math.PI * 2, 0, 1.0), M.sauce);
    g.add(ball, sauce);
    for (let i = 0; i < 3; i++) {
      const m = new T.Mesh(new T.TorusGeometry(0.42 - i * 0.12, 0.04, 5, 18), M.mayo);
      m.rotation.x = Math.PI / 2;
      m.position.y = 0.7 + i * 0.05;
      g.add(m);
    }
    for (let i = 0; i < 9; i++) {
      const f = new T.Mesh(new T.SphereGeometry(0.06, 5, 4), M.nori);
      const a = i * 2.4, r = 0.25 + (i % 3) * 0.15;
      f.position.set(Math.cos(a) * r, 0.78 + (0.1 - r * 0.2), Math.sin(a) * r);
      g.add(f);
    }
    const fuse = new T.Sprite(new T.SpriteMaterial({ map: G.Tex.glow, color: 0xffb347, blending: T.AdditiveBlending, transparent: true, depthWrite: false }));
    fuse.scale.set(1.2, 1.2, 1);
    fuse.position.y = 1.0;
    g.add(fuse);
    if (!prm) {
      const fx = Math.sin(k.h), fz = Math.cos(k.h);
      const sp = Math.max(k.speed, 10) + 14;
      const r = (v) => Math.round(v * 10) / 10;
      prm = [r(k.x + fx * 2.5), r(k.y + 1.6 + k.hopY), r(k.z + fz * 2.5), r(fx * sp), 7.5, r(fz * sp)];
    }
    add({
      kind: 'takoyaki', mesh: g, x: prm[0], y: prm[1], z: prm[2], vx: prm[3], vy: prm[4], vz: prm[5],
      owner: k, age: 0, state: 'fly', fuseT: 1.1, loc: {}, ground: false, s: 0, d: 0,
      update(dt, race) {
        this.age += dt;
        if (this.state === 'fly') {
          this.vy -= 22 * dt;
          this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
          Track.locate(this.x, this.z, this.loc.i, this.loc);
          if (Math.abs(this.loc.d) > WALLD) {
            const sg = Math.sign(this.loc.d), rx = -this.loc.tz, rz = this.loc.tx;
            const push = Math.abs(this.loc.d) - WALLD;
            this.x -= rx * sg * push; this.z -= rz * sg * push;
            const vn = (this.vx * rx + this.vz * rz) * sg;
            if (vn > 0) { this.vx -= rx * sg * vn * 2; this.vz -= rz * sg * vn * 2; }
          }
          const gy = this.loc.y + 0.85;
          if (this.y <= gy && this.vy < 0) {
            this.y = gy;
            if (Math.abs(this.vy) > 5) { this.vy = -this.vy * 0.35; this.vx *= 0.5; this.vz *= 0.5; }
            else { this.state = 'fuse'; this.ground = true; this.s = this.loc.s; this.d = this.loc.d; Items.hazards.push(this); }
          }
          this.mesh.rotation.x += dt * 8;
        } else {
          this.fuseT -= dt;
          const blink = Math.sin(this.age * (14 + (1.1 - this.fuseT) * 30)) > 0;
          this.mesh.scale.setScalar(1 + (blink ? 0.12 : 0) + (1.1 - this.fuseT) * 0.15);
          this.mesh.rotation.x = G.damp(this.mesh.rotation.x, 0, 6, dt);
        }
        this.mesh.position.set(this.x, this.y - 0.1, this.z);
        if (Math.random() < 0.6) G.FX.spark(this.x, this.y + 1.0, this.z, G.rand(-2, 2), G.rand(2, 4), G.rand(-2, 2), 0xffd27a, 0.2, 0.25);
        let touch = false;
        for (const kk of race.karts) {
          if (kk === this.owner && this.age < 0.7) continue;
          const dx = kk.x - this.x, dz = kk.z - this.z;
          if (dx * dx + dz * dz < 4.4 && Math.abs(kk.y + kk.hopY + 0.8 - this.y) < 2.5) { touch = true; break; }
        }
        if (touch || this.fuseT <= 0 || this.age > 6) { explode(this.x, this.y, this.z, this.owner); return false; }
        return true;
      },
    });
    return prm;
  }
  function explode(x, y, z, owner) {
    for (const kk of kartNear(x, z, 8.5)) kk.hit('bomb');
    G.FX.burst(x, y + 0.5, z, 0xffb347, 60, 16);
    G.FX.burst(x, y + 0.5, z, 0xff5a6e, 30, 10);
    for (let i = 0; i < 26; i++) G.FX.smoke(x + G.rand(-2, 2), y + G.rand(0, 2), z + G.rand(-2, 2), 0x5d5070, G.rand(2, 3.4));
    G.FX.flash(x, y + 1, z, 0xffd9a0, 22);
    G.FX.shock(x, y + 0.3, z, 0xffb347, 9);
    const p = G.Game.race.player;
    if (p) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < 60) { G.Audio.play('bomb'); G.shake(G.clamp(1 - d / 40, 0.15, 0.8)); }
    }
  }
  Items.explode = explode;

  // giant wave: rides the track until it crashes on the leader
  function spawnWave(k, race, prm) {
    let target;
    if (prm) target = race.karts.find((o) => o.key && o.key === prm[2]);
    else {
      const order = race.karts.filter((o) => !o.finished).sort((a, b) => b.progress - a.progress);
      target = order[0];
      if (target === k) target = order[1];
    }
    if (!target) return null;
    prm = prm || [Math.round((k.progress - 4) * 10) / 10, Math.round(k.loc.d * 10) / 10, target.key || ''];
    Items.waveActive = true;
    const mesh = new T.Mesh(M.waveGeo, M.wave);
    mesh.frustumCulled = false;
    const e = add({
      kind: 'wave', mesh, prog: prm[0], d: prm[1], target, owner: k, age: 0,
      update(dt, race, t) {
        this.age += dt;
        const tg = this.target;
        const gap = tg.progress - this.prog;
        const v = gap > 120 ? 95 : 64;
        this.prog += v * dt;
        this.d = G.damp(this.d, tg.loc.d * 0.6, 2, dt);
        const p = Track.at(this.prog, this.d);
        this.mesh.position.set(p.x, p.y - 0.4, p.z);
        this.mesh.rotation.y = p.heading;
        const sc = Math.min(1, this.age * 2.5);
        this.mesh.scale.set(sc, sc, 1);
        if (Math.random() < 0.9) {
          const rx = -Math.cos(p.heading), rz = Math.sin(p.heading);
          const off = G.rand(-13, 13);
          G.FX.spray(p.x + rx * off, p.y + 7, p.z + rz * off, Math.sin(p.heading) * 10, G.rand(2, 6), Math.cos(p.heading) * 10);
        }
        if (this.prog >= tg.progress - 1 || tg.finished) {
          for (const kk of kartNear(tg.x, tg.z, 7)) kk.hit('wave');
          if (!tg.finished) tg.hit('wave');
          for (let i = 0; i < 70; i++) G.FX.spray(tg.x + G.rand(-4, 4), tg.y + G.rand(0, 3), tg.z + G.rand(-4, 4), G.rand(-8, 8), G.rand(6, 16), G.rand(-8, 8));
          G.FX.shock(tg.x, tg.y + 0.3, tg.z, 0x7fe6ff, 11);
          if (tg.isPlayer || G.near(tg)) G.Audio.play('crash');
          if (tg.isPlayer) { G.shake(0.9); G.UI.flash('#35d3c3'); }
          Items.waveActive = false;
          return false;
        }
        if (this.age > 16) { Items.waveActive = false; return false; }
        return true;
      },
    });
    if (k.isPlayer || G.near(k)) G.Audio.play('wave');
    if (target.isPlayer) G.UI.warn('wave', e);
    return prm;
  }

  // octopus ink: blinds everyone ahead
  function doInk(k, race) {
    let any = false;
    for (const o of race.karts) {
      if (o === k || o.progress <= k.progress) continue;
      if (o.happiT > 0) continue;
      o.inkT = 4.2;
      any = true;
      if (o.isPlayer) G.UI.ink(4.2);
      G.FX.burst(o.x, o.y + 2, o.z, 0x2a1e48, 14, 4);
    }
    if (k.isPlayer || G.near(k) || any) G.Audio.play('ink');
  }

  // another player's item, re-created here from the parameters they sent
  Items.replay = function (owner, type, prm, race) {
    switch (type) {
      case 'oil': spawnGround(owner, 'oil', prm); sfx(owner, 'drop'); break;
      case 'wataame': spawnGround(owner, 'wataame', prm); sfx(owner, 'puff'); break;
      case 'balloon': spawnBalloon(owner, prm); sfx(owner, 'throw'); break;
      case 'beachball': spawnBall(owner, prm); sfx(owner, 'throw'); break;
      case 'hanabi': spawnHanabi(owner, race, prm); sfx(owner, 'launch'); break;
      case 'takoyaki': spawnTakoyaki(owner, prm); sfx(owner, 'throw'); break;
      case 'ink': doInk(owner, race); break;
      case 'wave': spawnWave(owner, race, prm); break;
    }
  };

  /* ------------------------------------------------------------ update */
  Items.update = function (dt, t, race) {
    M.box.uniforms.time.value = t;
    M.wave.uniforms.time.value = t;
    for (const b of Items.boxes) {
      if (b.off > 0) {
        b.off -= dt;
        b.mesh.visible = b.off <= 0.6;
        if (b.mesh.visible) b.mesh.scale.setScalar(G.clamp(1 - b.off / 0.6, 0.01, 1));
        continue;
      }
      b.mesh.rotation.set(t * 0.9 + b.ph, t * 1.3 + b.ph, 0.4);
      b.mesh.position.y = b.y + 1.35 + Math.sin(t * 2.4 + b.ph) * 0.2;
      for (const k of race.karts) {
        const dx = k.x - b.x, dz = k.z - b.z;
        if (dx * dx + dz * dz < 4.0) {
          b.off = 2.6;
          b.mesh.visible = false;
          G.FX.burst(b.x, b.y + 1.3, b.z, 0xfff1d6, 18, 7);
          if (!k.item && k.rollT <= 0) {
            k.rollT = k.isPlayer ? 1.4 : 0.8;
            if (k.isPlayer) G.Audio.play('box');
          }
          break;
        }
      }
    }
    // golden fan timer, orbiting balloons hitting neighbours
    for (const k of race.karts) {
      if (k.uchiwaT > 0) {
        k.uchiwaT -= dt;
        if (k.uchiwaT <= 0 && k.item === 'uchiwa') { k.item = null; k.itemCount = 0; }
      }
      if (k.orbit > 0) {
        for (const o of race.karts) {
          if (o === k) continue;
          const dx = o.x - k.x, dz = o.z - k.z;
          // a remote kart decides its own hit, so assume it lands unless it is protected
          if (dx * dx + dz * dz < 7.3 && (o.hit('balloon') || (o.remote && !k.remote && o.shieldT <= 0 && o.spinT <= 0 && o.happiT <= 0))) {
            G.FX.burst((k.x + o.x) / 2, k.y + 1, (k.z + o.z) / 2, 0x7fe6ff, 24, 7);
            if (k.isPlayer || o.isPlayer || G.near(o)) G.Audio.play('splash');
            k.orbit--; consume(k);
            if (k.orbit <= 0) break;
          }
        }
      }
    }
    for (let i = Items.ents.length - 1; i >= 0; i--) {
      const e = Items.ents[i];
      let alive = !e.dead && e.update(dt, race, t);
      if (!alive) {
        if (e.mesh) Items.scene.remove(e.mesh);
        Items.ents.splice(i, 1);
        const hi = Items.hazards.indexOf(e);
        if (hi >= 0) Items.hazards.splice(hi, 1);
        if (e.kind === 'wave') Items.waveActive = false;
      }
    }
  };
})();
