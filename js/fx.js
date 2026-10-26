/* 汐風GP — particles, shockwaves, skid marks */
(function () {
  'use strict';
  const G = window.G;
  const T = THREE;

  function makePool(n, additive, tex) {
    const geo = new T.BufferGeometry();
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
    geo.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('color', new T.BufferAttribute(col, 3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('size', new T.BufferAttribute(size, 1).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('alpha', new T.BufferAttribute(alpha, 1).setUsage(T.DynamicDrawUsage));
    const mat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending,
      uniforms: { map: { value: tex || G.Tex.glow }, scale: { value: 600 } },
      vertexShader: [
        'attribute float size; attribute float alpha; attribute vec3 color; uniform float scale;',
        'varying vec3 vC; varying float vA;',
        'void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix*vec4(position,1.0);',
        '  gl_PointSize = min(size * scale / max(0.5, -mv.z), 420.0); gl_Position = projectionMatrix*mv; }',
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D map; varying vec3 vC; varying float vA;',
        'void main(){ vec4 t = texture2D(map, gl_PointCoord); float a = t.a * vA; if (a < 0.01) discard;',
        '  gl_FragColor = vec4(vC * mix(vec3(1.0), t.rgb, 0.0), a);',
        '  #include <encodings_fragment>',
        '}',
      ].join('\n'),
    });
    const pts = new T.Points(geo, mat);
    pts.frustumCulled = false;
    const P = [];
    for (let i = 0; i < n; i++) P.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, r: 1, g: 1, b: 1, grav: 0, drag: 0, grow: 0, a0: 1, flip: 0 });
    return { pts, P, geo, n, head: 0, additive, live: 0 };
  }

  const FX = (G.FX = {});
  const _c = new T.Color();
  FX.init = function (scene) {
    const confTex = (function () {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.beginPath();
      g.roundRect ? g.roundRect(7, 3, 18, 26, 4) : g.rect(7, 3, 18, 26);
      g.fill();
      return new T.CanvasTexture(c);
    })();
    FX.add = makePool(3200, true);
    FX.norm = makePool(1800, false);
    FX.conf = makePool(700, false, confTex);
    scene.add(FX.norm.pts, FX.conf.pts, FX.add.pts);
    FX.norm.pts.renderOrder = 5;
    FX.conf.pts.renderOrder = 5;
    FX.add.pts.renderOrder = 6;
    // shockwave rings
    FX.rings = [];
    const rg = new T.RingGeometry(0.8, 1, 48);
    rg.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const m = new T.Mesh(rg, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
      m.visible = false;
      scene.add(m);
      FX.rings.push({ m, t: 0, max: 0.5, r: 8 });
    }
    FX.skids = makeSkids(scene);
    FX.scene = scene;
  };
  function emit(pool, x, y, z, vx, vy, vz, color, size, life, grav, drag, grow, a0, flip) {
    const p = pool.P[pool.head];
    pool.head = (pool.head + 1) % pool.n;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    _c.setHex(color);
    p.r = _c.r; p.g = _c.g; p.b = _c.b;
    p.s = size; p.life = life; p.max = life; p.grav = grav; p.drag = drag; p.grow = grow; p.a0 = a0 == null ? 1 : a0; p.flip = flip || 0;
  }
  FX.emit = emit;
  FX.spark = (x, y, z, vx, vy, vz, color, size, life) => emit(FX.add, x, y, z, vx, vy, vz, color, size, life, -14, 2, 0, 1);
  FX.glow = (x, y, z, vx, vy, vz, color, size, life) => emit(FX.add, x, y, z, vx, vy, vz, color, size, life, 0, 1.5, -size / life * 0.6, 0.8);
  FX.dust = (x, y, z, color, size) => emit(FX.norm, x, y, z, G.rand(-1, 1), G.rand(0.8, 2.2), G.rand(-1, 1), color, size || 1, G.rand(0.45, 0.8), 0.5, 1.5, 1.5, 0.45);
  FX.smoke = (x, y, z, color, size) => emit(FX.norm, x, y, z, G.rand(-2, 2), G.rand(1, 4), G.rand(-2, 2), color, size || 2, G.rand(0.9, 1.6), 1.2, 1.4, 2.4, 0.75);
  FX.spray = (x, y, z, vx, vy, vz) => emit(FX.norm, x, y, z, vx + G.rand(-2, 2), vy, vz + G.rand(-2, 2), Math.random() < 0.5 ? 0xffffff : 0xa8f0ea, G.rand(0.3, 0.75), G.rand(0.5, 1.0), -18, 0.6, 0.8, 0.9);
  FX.burst = (x, y, z, color, n, spd) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = G.rand(-0.2, 1);
      const v = G.rand(0.4, 1) * spd;
      emit(FX.add, x, y, z, Math.cos(a) * v * Math.cos(e), Math.abs(Math.sin(e)) * v + 1, Math.sin(a) * v * Math.cos(e), color, G.rand(0.4, 0.9), G.rand(0.35, 0.7), -10, 2, 0, 1);
    }
  };
  FX.bubbles = (x, y, z, n, spread) => {
    for (let i = 0; i < n; i++) {
      emit(FX.add, x + G.rand(-spread, spread), y + G.rand(0, spread), z + G.rand(-spread, spread), G.rand(-0.4, 0.4), G.rand(1.5, 3.5), G.rand(-0.4, 0.4), 0xd8fbff, G.rand(0.14, 0.38), G.rand(1.6, 3.2), 3.2, 1.0, 0.04, 0.6);
    }
  };
  FX.flash = (x, y, z, color, size) => emit(FX.add, x, y, z, 0, 0, 0, color, size, 0.3, 0, 0, -size * 2, 1);
  FX.firework = (x, y, z, scale) => {
    const sc = scale || 1;
    const hue = Math.random();
    const n = sc < 0.6 ? 50 : 90;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const v = G.rand(16, 22) * sc;
      _c.setHSL((hue + (i % 3) * 0.08) % 1, 0.9, 0.65);
      emit(FX.add, x, y, z, r * Math.cos(th) * v, u * v, r * Math.sin(th) * v, _c.getHex(), G.rand(2.6, 4.2) * Math.max(0.3, sc), G.rand(1.2, 1.9) * Math.max(0.5, sc), -6 * sc, 1.6, 0, 1);
    }
    emit(FX.add, x, y, z, 0, 0, 0, 0xffffff, 26 * sc, 0.35, 0, 0, -40 * sc, 1);
  };
  FX.confetti = (x, y, z, n, spread) => {
    const cols = [0xff5a6e, 0xffb54a, 0x35d3c3, 0xa493ff, 0xfff6ea, 0x5ab8ff, 0xff7aa8];
    for (let i = 0; i < n; i++) {
      emit(FX.conf, x + G.rand(-spread, spread), y + G.rand(0, 3), z + G.rand(-spread, spread), G.rand(-3, 3), G.rand(2, 8), G.rand(-3, 3), cols[(Math.random() * cols.length) | 0], G.rand(0.35, 0.6), G.rand(2.5, 4.5), -3.2, 1.6, 0, 1, G.rand(6, 14));
    }
  };
  FX.shock = (x, y, z, color, r) => {
    const ring = FX.rings.find((q) => q.t <= 0) || FX.rings[0];
    ring.t = ring.max = 0.55;
    ring.r = r;
    ring.m.position.set(x, y, z);
    ring.m.material.color.setHex(color);
    ring.m.visible = true;
  };

  FX.update = function (dt, camera, renderer) {
    const h = renderer.getDrawingBufferSize ? renderer.getDrawingBufferSize(new T.Vector2()).y : renderer.domElement.height;
    const scale = h / (2 * Math.tan((camera.fov * Math.PI) / 360));
    for (const pool of [FX.add, FX.norm, FX.conf]) {
      pool.pts.material.uniforms.scale.value = scale;
      const pos = pool.geo.attributes.position.array, col = pool.geo.attributes.color.array, sz = pool.geo.attributes.size.array, al = pool.geo.attributes.alpha.array;
      let live = 0;
      for (let i = 0; i < pool.n; i++) {
        const p = pool.P[i];
        if (p.life > 0) {
          live++;
          p.life -= dt;
          const k = Math.exp(-p.drag * dt);
          p.vx *= k; p.vy = p.vy * k + p.grav * dt; p.vz *= k;
          p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
          p.s += p.grow * dt;
          const t = Math.max(0, p.life / p.max);
          pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
          col[i * 3] = p.r; col[i * 3 + 1] = p.g; col[i * 3 + 2] = p.b;
          let s = Math.max(0, p.s);
          if (p.flip) s *= 0.35 + 0.65 * Math.abs(Math.sin(p.life * p.flip));
          sz[i] = s;
          al[i] = (pool.additive ? Math.min(1, t * 2) : pool === FX.conf ? Math.min(1, t * 3) : t * t) * p.a0;
        } else if (al[i] !== 0) {
          al[i] = 0; sz[i] = 0;
        }
      }
      pool.live = live;
      pool.geo.attributes.position.needsUpdate = true;
      pool.geo.attributes.color.needsUpdate = true;
      pool.geo.attributes.size.needsUpdate = true;
      pool.geo.attributes.alpha.needsUpdate = true;
    }
    for (const r of FX.rings) {
      if (r.t <= 0) continue;
      r.t -= dt;
      const k = 1 - Math.max(0, r.t) / r.max;
      const sc = 0.5 + k * r.r;
      r.m.scale.set(sc, 1, sc);
      r.m.material.opacity = (1 - k) * 0.9;
      if (r.t <= 0) r.m.visible = false;
    }
    FX.skids.time += dt;
    FX.skids.update();
  };
  FX.clear = function () {
    for (const pool of [FX.add, FX.norm, FX.conf]) for (const p of pool.P) p.life = 0;
    FX.skids.clear();
  };

  /* ---------------------------------------------------------- skid marks */
  function makeSkids(scene) {
    const N = 1400;
    const pos = new Float32Array(N * 6 * 3);
    const born = new Float32Array(N * 6);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('born', new T.BufferAttribute(born, 1).setUsage(T.DynamicDrawUsage));
    born.fill(-999);
    const mat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { time: { value: 0 } },
      vertexShader: 'attribute float born; uniform float time; varying float vA; void main(){ vA = 0.42 * (1.0 - clamp((time - born) / 14.0, 0.0, 1.0)); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(0.13,0.09,0.2,vA); }',
    });
    const mesh = new T.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    scene.add(mesh);
    const prev = new Map();
    let head = 0, dirty = false, lo = Infinity, hi = -1;
    return {
      time: 0,
      add(key, x, y, z, on) {
        const p = prev.get(key);
        if (!on) { if (p) prev.delete(key); return; }
        if (!p) { prev.set(key, { x, y, z }); return; }
        const dx = x - p.x, dz = z - p.z, l = Math.hypot(dx, dz);
        if (l < 0.35) return;
        if (l > 4) { prev.set(key, { x, y, z }); return; }
        const w = 0.16, nx = (-dz / l) * w, nz = (dx / l) * w;
        const v = [p.x - nx, p.y + 0.04, p.z - nz, p.x + nx, p.y + 0.04, p.z + nz, x + nx, y + 0.04, z + nz,
          p.x - nx, p.y + 0.04, p.z - nz, x + nx, y + 0.04, z + nz, x - nx, y + 0.04, z - nz];
        pos.set(v, head * 18);
        for (let i = 0; i < 6; i++) born[head * 6 + i] = this.time;
        lo = Math.min(lo, head); hi = Math.max(hi, head);
        head = (head + 1) % N;
        dirty = true;
        prev.set(key, { x, y, z });
      },
      update() {
        mat.uniforms.time.value = this.time;
        if (!dirty) return;
        geo.attributes.position.needsUpdate = true;
        geo.attributes.born.needsUpdate = true;
        dirty = false; lo = Infinity; hi = -1;
      },
      clear() { born.fill(-999); prev.clear(); geo.attributes.born.needsUpdate = true; },
    };
  }
})();
