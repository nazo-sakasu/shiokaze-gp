/* 汐風GP — world: track spline, road meshes, terrain, sky and sea */
(function () {
  'use strict';
  const G = window.G;
  const T = THREE;

  const ROAD = 9.0;      // half width of asphalt
  const CURB = 10.6;     // outer edge of curb
  const EDGE = 15.5;     // wall line
  G.TRACK_DIMS = { ROAD, CURB, EDGE };

  /* -------------------------------------------------------- Track data */
  const Track = (G.Track = {});
  Track.load = function (ctrl) {
    const curve = new T.CatmullRomCurve3(ctrl.map((p) => new T.Vector3(p[0], p[1], p[2])), true, 'centripetal');
    const L = curve.getLength();
    const N = Math.round(L / 2);
    const pts = curve.getSpacedPoints(N);
    pts.pop();
    const step = L / N;
    const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
    const tx = new Float32Array(N), tz = new Float32Array(N), curv = new Float32Array(N);
    for (let i = 0; i < N; i++) { px[i] = pts[i].x; py[i] = pts[i].y; pz[i] = pts[i].z; }
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      const dx = px[b] - px[a], dz = pz[b] - pz[a];
      const l = Math.hypot(dx, dz) || 1;
      tx[i] = dx / l; tz[i] = dz / l;
    }
    // signed curvature (positive = turning right)
    for (let i = 0; i < N; i++) {
      const a = (i - 4 + N) % N, b = (i + 4) % N;
      const h0 = Math.atan2(tx[a], tz[a]), h1 = Math.atan2(tx[b], tz[b]);
      curv[i] = -G.wrapAng(h1 - h0) / (8 * step);
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < N; i++) {
      minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]);
      minZ = Math.min(minZ, pz[i]); maxZ = Math.max(maxZ, pz[i]);
    }
    Object.assign(Track, { curve, L, N, step, px, py, pz, tx, tz, curv, bounds: { minX, maxX, minZ, maxZ } });
  };

  Track.idx = (s) => {
    const N = Track.N;
    let i = Math.floor(s / Track.step) % N;
    if (i < 0) i += N;
    return i;
  };
  // sample position at arc length s with lateral offset d (right positive)
  Track.at = (s, d, out) => {
    const { N, step, px, py, pz, tx, tz } = Track;
    s = ((s % Track.L) + Track.L) % Track.L;
    const f = s / step;
    const i = Math.floor(f) % N, j = (i + 1) % N, t = f - Math.floor(f);
    const x = px[i] + (px[j] - px[i]) * t, y = py[i] + (py[j] - py[i]) * t, z = pz[i] + (pz[j] - pz[i]) * t;
    let ax = tx[i] + (tx[j] - tx[i]) * t, az = tz[i] + (tz[j] - tz[i]) * t;
    const l = Math.hypot(ax, az) || 1;
    ax /= l; az /= l;
    out = out || {};
    out.x = x + -az * (d || 0);
    out.z = z + ax * (d || 0);
    out.y = y;
    out.tx = ax; out.tz = az;
    out.heading = Math.atan2(ax, az);
    return out;
  };
  // project a world position onto the track. hint = previous index (local search)
  const _loc = {};
  Track.locate = (x, z, hint, out) => {
    const { N, px, pz } = Track;
    let best = -1, bd = Infinity;
    if (hint == null || hint < 0) {
      for (let i = 0; i < N; i += 2) {
        const dx = x - px[i], dz = z - pz[i], d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
    } else best = hint;
    // hill-climb locally
    for (let iter = 0; iter < 60; iter++) {
      let moved = false;
      for (const k of [-1, 1]) {
        const j = (best + k + N) % N;
        const dx = x - px[j], dz = z - pz[j], d = dx * dx + dz * dz;
        const dx0 = x - px[best], dz0 = z - pz[best], d0 = dx0 * dx0 + dz0 * dz0;
        if (d < d0) { best = j; moved = true; break; }
      }
      if (!moved) break;
    }
    const i = best, j = (i + 1) % N, h = (i - 1 + N) % N;
    // choose segment (h->i) or (i->j) by projection
    let a = i, b = j;
    {
      const ex = px[j] - px[i], ez = pz[j] - pz[i];
      const t = ((x - px[i]) * ex + (z - pz[i]) * ez) / (ex * ex + ez * ez);
      if (t < 0) { a = h; b = i; }
    }
    const ex = px[b] - px[a], ez = pz[b] - pz[a];
    const len2 = ex * ex + ez * ez;
    let t = ((x - px[a]) * ex + (z - pz[a]) * ez) / len2;
    t = G.clamp(t, 0, 1);
    const cx = px[a] + ex * t, cz = pz[a] + ez * t;
    const l = Math.sqrt(len2) || 1;
    const ux = ex / l, uz = ez / l;
    // right = (-uz, ux)
    const d = (x - cx) * -uz + (z - cz) * ux;
    out = out || _loc;
    out.i = i;
    out.s = (a + t) * Track.step;
    if (out.s >= Track.L) out.s -= Track.L;
    out.d = d;
    out.y = Track.py[a] + (Track.py[b] - Track.py[a]) * t;
    out.tx = ux; out.tz = uz;
    out.heading = Math.atan2(ux, uz);
    out.curv = Track.curv[i];
    return out;
  };

  /* -------------------------------------------------------- Textures */
  const Tex = (G.Tex = {});
  function canvasTex(w, h, draw, opts) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const t = new T.CanvasTexture(c);
    t.encoding = T.sRGBEncoding;
    t.wrapS = (opts && opts.wrapS) || T.ClampToEdgeWrapping;
    t.wrapT = (opts && opts.wrapT) || T.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  }
  G.canvasTex = canvasTex;
  function speckle(g, w, h, n, cols, smin, smax) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      const s = smin + Math.random() * (smax - smin);
      g.fillRect(Math.random() * w, Math.random() * h, s, s);
    }
  }
  Tex.make = function () {
    if (Tex.glow) return;
    Tex.makeShared();
  };
  // per-course surfaces: road, shoulder, wall and curb in the course palette
  Tex.forCourse = function (th) {
    const r = th.road, sh = th.shoulder, wl = th.wall, cb = th.curb;
    Tex.road = canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = r.base;
      g.fillRect(0, 0, w, h);
      if (r.draw) r.draw(g, w, h, speckle);
      else speckle(g, w, h, 9000, r.speck, 1, 2.5);
      // tyre wear near racing line
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0.2, 'rgba(30,24,40,0)');
      gr.addColorStop(0.35, 'rgba(30,24,40,.18)');
      gr.addColorStop(0.5, 'rgba(30,24,40,0)');
      gr.addColorStop(0.65, 'rgba(30,24,40,.18)');
      gr.addColorStop(0.8, 'rgba(30,24,40,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      g.fillStyle = r.line;
      g.fillRect(w * 0.018, 0, w * 0.022, h);
      g.fillRect(w * 0.96, 0, w * 0.022, h);
      g.globalAlpha = 0.75;
      g.fillRect(w * 0.494, 0, w * 0.012, h * 0.42);
      g.globalAlpha = 1;
    });
    Tex.curb = canvasTex(32, 64, (g, w, h) => {
      g.fillStyle = cb[0]; g.fillRect(0, 0, w, h / 2);
      g.fillStyle = cb[1]; g.fillRect(0, h / 2, w, h / 2);
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, w * 0.15, h);
    });
    Tex.sand = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = sh.base;
      g.fillRect(0, 0, w, h);
      if (sh.draw) sh.draw(g, w, h, speckle);
      else speckle(g, w, h, 5000, sh.speck, 1, 3);
    }, { wrapS: T.RepeatWrapping });
    Tex.wall = canvasTex(64, 128, (g, w, h) => {
      if (wl.draw) return wl.draw(g, w, h);
      g.fillStyle = wl.b; g.fillRect(0, 0, w, h);
      g.fillStyle = wl.a; g.fillRect(0, 0, w, h / 2);
      g.fillStyle = wl.dark; g.fillRect(0, h * 0.0, w * 0.16, h);
      g.fillStyle = 'rgba(42,30,72,.25)'; g.fillRect(w * 0.84, 0, w * 0.16, h);
    });
  };
  Tex.makeShared = function () {
    Tex.checker = canvasTex(128, 32, (g, w, h) => {
      const n = 16, m = 4, cw = w / n, ch = h / m;
      for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
        g.fillStyle = (i + j) % 2 ? '#1c1330' : '#fff6ea';
        g.fillRect(i * cw, j * ch, cw, ch);
      }
    }, { wrapT: T.ClampToEdgeWrapping });
    Tex.glow = (function () {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, 'rgba(255,255,255,.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      const t = new T.CanvasTexture(c);
      return t;
    })();
    Tex.cloud = canvasTex(256, 128, (g, w, h) => {
      for (let i = 0; i < 26; i++) {
        const x = w * (0.18 + Math.random() * 0.64), y = h * (0.45 + Math.random() * 0.25);
        const r = 18 + Math.random() * 34;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,.55)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }, { wrapT: T.ClampToEdgeWrapping });
    Tex.toon = (function () {
      const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
      const t = new T.DataTexture(data, 3, 1, T.RGBAFormat);
      t.minFilter = t.magFilter = T.NearestFilter;
      t.needsUpdate = true;
      return t;
    })();
    for (const k of ['checker', 'glow', 'cloud', 'toon']) Tex[k].userData.keep = true;
  };

  /* -------------------------------------------------------- Ribbons */
  // Builds a strip along the track between lateral offsets d0..d1 (with optional height offsets)
  function ribbon(opts) {
    const { N, px, py, pz, tx, tz, step } = Track;
    const cols = opts.cols || 1;
    const pos = [], uv = [], nor = [], idx = [];
    const vScale = opts.vScale || 10;
    const ranges = opts.ranges || [[0, N]];
    let base = 0;
    for (const [r0, r1] of ranges) {
      const count = r1 - r0;
      for (let k = 0; k <= count; k++) {
        const i = (r0 + k) % N;
        const rx = -tz[i], rz = tx[i];
        const s = (r0 + k) * step;
        for (let c = 0; c <= cols; c++) {
          const f = c / cols;
          const d = opts.d0 + (opts.d1 - opts.d0) * f;
          const yo = opts.y0 + ((opts.y1 == null ? opts.y0 : opts.y1) - opts.y0) * f;
          const ww = opts.widthFn ? opts.widthFn(i) : 1;
          const dd = opts.widthFn ? Math.sign(d) * (Math.abs(opts.d0) + (Math.abs(d) - Math.abs(opts.d0)) * ww) : d;
          pos.push(px[i] + rx * dd, py[i] + yo, pz[i] + rz * dd);
          uv.push(opts.uFlip ? 1 - f : f, s / vScale);
          nor.push(0, 1, 0);
        }
      }
      for (let k = 0; k < count; k++) {
        for (let c = 0; c < cols; c++) {
          const a = base + k * (cols + 1) + c, b = a + cols + 1;
          if (opts.d1 >= opts.d0) idx.push(a, a + 1, b, b, a + 1, b + 1);
          else idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      base += (count + 1) * (cols + 1);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    geo.setIndex(idx);
    if (opts.computeNormals) geo.computeVertexNormals();
    return geo;
  }
  G.ribbon = ribbon;

  // contiguous index ranges where |curvature| is above threshold
  function curvyRanges(th, sign) {
    const { N, curv } = Track;
    const on = [];
    for (let i = 0; i < N; i++) {
      // curbs go on the inside of the turn, plus both sides on sharp turns
      const c = curv[i];
      on[i] = sign > 0 ? c > th || c < -th * 2.4 : c < -th || c > th * 2.4;
    }
    // dilate
    const on2 = on.slice();
    for (let i = 0; i < N; i++) if (on[i]) for (let k = -6; k <= 6; k++) on2[(i + k + N) % N] = true;
    const ranges = [];
    let start = -1;
    for (let i = 0; i <= N; i++) {
      const v = i < N && on2[i];
      if (v && start < 0) start = i;
      if (!v && start >= 0) { ranges.push([start, i]); start = -1; }
    }
    return ranges;
  }

  /* -------------------------------------------------------- Terrain */
  G.groundHeight = null; // filled after terrain build

  function buildTerrain(scene, course) {
    const b = Track.bounds;
    const W = Math.round((b.maxX - b.minX + 960) / 10) * 10, D = Math.round((b.maxZ - b.minZ + 860) / 10) * 10;
    const SX = Math.round(W / 6.25), SZ = Math.round(D / 6.25);
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    G.terrainCenter = { x: cx, z: cz };
    const geo = new T.PlaneGeometry(W, D, SX, SZ);
    geo.rotateX(-Math.PI / 2);
    geo.translate(cx, 0, cz);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const { N, px, py, pz } = Track;
    const hgrid = new Float32Array(pos.count);
    const tmp = new T.Color();
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), z = pos.getZ(v);
      let h = course.height(x, z);
      // nearest track sample (coarse then refine)
      let best = 0, bd = Infinity;
      for (let i = 0; i < N; i += 3) {
        const dx = x - px[i], dz = z - pz[i], d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      for (let k = -3; k <= 3; k++) {
        const i = (best + k + N) % N;
        const dx = x - px[i], dz = z - pz[i], d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      const dist = Math.sqrt(bd);
      const roadY = py[best] - 0.3;
      if (dist < EDGE + 3) h = roadY;
      else if (dist < 44) {
        const t = (dist - EDGE - 3) / (44 - EDGE - 3);
        const sm = t * t * (3 - 2 * t);
        h = roadY + (h - roadY) * sm;
      }
      pos.setY(v, h);
      hgrid[v] = h;
      const c = course.ground(x, z, h, dist, tmp, roadY);
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = new T.MeshLambertMaterial({ vertexColors: true });
    if (course.groundMat) course.groundMat(mat);
    const mesh = new T.Mesh(geo, mat);
    mesh.receiveShadow = true;
    scene.add(mesh);
    // height lookup for props
    G.groundHeight = (x, z) => {
      const fx = ((x - cx + W / 2) / W) * SX, fz = ((z - cz + D / 2) / D) * SZ;
      const ix = G.clamp(Math.floor(fx), 0, SX - 1), iz = G.clamp(Math.floor(fz), 0, SZ - 1);
      const tx = fx - ix, tz = fz - iz;
      const a = hgrid[iz * (SX + 1) + ix], b = hgrid[iz * (SX + 1) + ix + 1];
      const c = hgrid[(iz + 1) * (SX + 1) + ix], d = hgrid[(iz + 1) * (SX + 1) + ix + 1];
      return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
    };
    return mesh;
  }

  /* -------------------------------------------------------- Sky */
  const SKY = {
    top: new T.Color('#4b4da6'), mid: new T.Color('#de97b8'), horizon: new T.Color('#f7c2a4'),
    sun: new T.Color('#fff1c9'), fog: new T.Color('#f7c2a4'), mode: 0,
  };
  G.SKY = SKY;
  G.SUN_DIR = new T.Vector3(-0.55, 0.36, 0.75).normalize();

  function buildSky(scene, course) {
    const geo = new T.SphereGeometry(2200, 32, 20);
    const mat = new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: SKY.top }, mid: { value: SKY.mid }, horizon: { value: SKY.horizon },
        sunCol: { value: SKY.sun }, sunDir: { value: G.SUN_DIR }, mode: { value: SKY.mode }, time: { value: 0 },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w*0.9999; }',
      fragmentShader: [
        'uniform vec3 top, mid, horizon, sunCol, sunDir; uniform float mode, time; varying vec3 vDir;',
        'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
        'void main(){',
        '  vec3 d = normalize(vDir);',
        '  float h = clamp(d.y, -1.0, 1.0);',
        '  vec3 c = mix(horizon, mid, smoothstep(0.0, 0.3, h));',
        '  c = mix(c, top, smoothstep(0.25, 0.85, h));',
        '  float sd = max(dot(d, sunDir), 0.0);',
        '  if (mode < 0.5) {',
        '    c += sunCol * (pow(sd, 900.0) * 1.6 + pow(sd, 40.0) * 0.32 + pow(sd, 6.0) * 0.18);',
        '  } else if (mode < 1.5) {',
        '    vec2 g = vec2(atan(d.z, d.x) * 95.0, asin(d.y) * 95.0);',
        '    vec2 id = floor(g); vec2 f = fract(g) - 0.5;',
        '    float r = hash(id); vec2 o = vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5;',
        '    float star = step(0.972, r) * smoothstep(0.16, 0.0, length(f - o * 0.6));',
        '    star *= 0.55 + 0.45 * sin(time * (1.5 + r * 4.0) + r * 40.0);',
        '    c += vec3(0.95, 0.92, 1.0) * star * smoothstep(0.02, 0.25, h) * (0.6 + r);',
        '    float moon = smoothstep(0.99935, 0.99955, sd);',
        '    c = mix(c, vec3(1.0, 0.97, 0.86), moon);',
        '    c += sunCol * (pow(sd, 260.0) * 0.55 + pow(sd, 18.0) * 0.12);',
        '  } else {',
        '    vec2 q = d.xz / max(d.y, 0.06) * 6.0;',
        '    float w1 = sin(q.x * 1.3 + time * 1.2 + sin(q.y * 0.9 + time)) + sin(q.y * 1.7 - time * 0.9 + sin(q.x * 1.1));',
        '    float rip = smoothstep(1.2, 1.9, w1);',
        '    float up = smoothstep(0.25, 0.9, h);',
        '    c += vec3(0.75, 1.0, 1.0) * rip * up * 0.55;',
        '    c += sunCol * pow(max(d.y, 0.0), 6.0) * 0.7;',
        '  }',
        '  c = mix(c, horizon, smoothstep(0.0, -0.08, h));',
        '  gl_FragColor = vec4(c, 1.0);',
        '  #include <encodings_fragment>',
        '}',
      ].join('\n'),
    });
    const sky = new T.Mesh(geo, mat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    scene.add(sky);
    if (!course.clouds) return { sky, clouds: new T.Group() };

    // soft clouds
    const cloudMat = new T.SpriteMaterial({ map: Tex.cloud, color: 0xffd6cc, transparent: true, depthWrite: false, fog: false, opacity: 0.8 });
    const clouds = new T.Group();
    for (let i = 0; i < 22; i++) {
      const s = new T.Sprite(cloudMat.clone());
      const a = Math.random() * Math.PI * 2, r = 1200 + Math.random() * 600;
      s.position.set(Math.cos(a) * r, 140 + Math.random() * 300, Math.sin(a) * r - 100);
      const sc = 380 + Math.random() * 520;
      s.scale.set(sc, sc * 0.4, 1);
      const towardSun = Math.max(0, s.position.clone().normalize().dot(G.SUN_DIR));
      s.material.color.set(0xd9b9e6).lerp(new T.Color(0xffd9a8), towardSun);
      s.material.opacity = 0.55 + Math.random() * 0.35;
      clouds.add(s);
    }
    scene.add(clouds);
    return { sky, clouds };
  }

  /* -------------------------------------------------------- Sea */
  function buildSea(scene, course) {
    const geo = new T.PlaneGeometry(5000, 5000, 140, 140);
    geo.rotateX(-Math.PI / 2);
    const mat = new T.ShaderMaterial({
      fog: true,
      uniforms: T.UniformsUtils.merge([
        T.UniformsLib.fog,
        {
          time: { value: 0 }, sunDir: { value: G.SUN_DIR },
          deep: { value: new T.Color('#2a6fa3') }, shallow: { value: new T.Color('#39cfc4') },
          skyc: { value: SKY.horizon }, sunCol: { value: new T.Color('#ffe2b0') },
        },
      ]),
      vertexShader: [
        'uniform float time; varying vec3 vW; varying float vWave;',
        '#include <fog_pars_vertex>',
        'void main(){',
        '  vec3 p = position;',
        '  float w = sin(p.x*0.045+time*1.1)*0.22 + sin(p.z*0.06-time*1.4)*0.18 + sin((p.x+p.z)*0.11+time*2.0)*0.08;',
        '  p.y += w; vWave = w;',
        '  vec4 wp = modelMatrix*vec4(p,1.0); vW = wp.xyz;',
        '  vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition;',
        '  #include <fog_vertex>',
        '}',
      ].join('\n'),
      fragmentShader: [
        'uniform float time; uniform vec3 sunDir, deep, shallow, skyc, sunCol; varying vec3 vW; varying float vWave;',
        '#include <fog_pars_fragment>',
        'void main(){',
        '  vec2 q = vW.xz;',
        '  float t = time;',
        '  vec3 n = normalize(vec3(',
        '    cos(q.x*0.045+t*1.1)*0.4 + cos((q.x+q.y)*0.11+t*2.0)*0.3 + cos(q.x*0.6+q.y*0.31+t*3.1)*0.18 + cos(q.x*1.3-t*2.6)*0.08,',
        '    4.0,',
        '    -sin(q.y*0.06-t*1.4)*0.4 + cos((q.x+q.y)*0.11+t*2.0)*0.3 + cos(q.y*0.7-q.x*0.25+t*2.7)*0.18 + cos(q.y*1.1+t*2.2)*0.08));',
        '  vec3 v = normalize(cameraPosition - vW);',
        '  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);',
        '  float dist = length(vW.xz - vec2(-20.0, -90.0));',
        '  vec3 c = mix(shallow, deep, smoothstep(380.0, 900.0, dist) * 0.7 + 0.15);',
        '  c = mix(c, skyc, fres*0.75);',
        '  vec3 h = normalize(sunDir + v);',
        '  float spec = pow(max(dot(n, h), 0.0), 220.0);',
        '  c += sunCol * spec * 2.4;',
        '  c += vec3(1.0) * smoothstep(0.32, 0.46, vWave) * 0.12;',
        '  gl_FragColor = vec4(c, 1.0);',
        '  #include <encodings_fragment>',
        '  #include <fog_fragment>',
        '}',
      ].join('\n'),
    });
    const sea = new T.Mesh(geo, mat);
    sea.position.set(-20, -0.9, -90);
    scene.add(sea);
    return sea;
  }

  /* -------------------------------------------------------- Road meshes */
  function buildRoad(scene) {
    const g = new T.Group();
    const roadMat = new T.MeshLambertMaterial({ map: Tex.road });
    if (G.World.course && G.World.course.groundMat) G.World.course.groundMat(roadMat, 'road');
    Tex.road.repeat.set(1, 1);
    const road = new T.Mesh(ribbon({ d0: -ROAD, d1: ROAD, y0: 0.02, cols: 4, vScale: 16 }), roadMat);
    road.receiveShadow = true;
    g.add(road);

    const sandMat = new T.MeshLambertMaterial({ map: Tex.sand });
    if (G.World.course && G.World.course.groundMat) G.World.course.groundMat(sandMat, 'road');
    const skirtMat = new T.MeshLambertMaterial({ map: Tex.sand, side: T.DoubleSide });
    Tex.sand.repeat.set(1, 1);
    for (const sgn of [-1, 1]) {
      const sh = new T.Mesh(ribbon({ d0: sgn * ROAD, d1: sgn * EDGE, y0: 0.0, cols: 2, vScale: 8 }), sandMat);
      sh.receiveShadow = true;
      g.add(sh);
      // skirt to hide gap between shoulder and terrain
      const sk = new T.Mesh(ribbon({ d0: sgn * EDGE, d1: sgn * (EDGE + 0.6), y0: 0.0, y1: -1.2, cols: 1, vScale: 8 }), skirtMat);
      g.add(sk);
    }
    const curbMat = new T.MeshLambertMaterial({ map: Tex.curb });
    for (const sgn of [-1, 1]) {
      const ranges = curvyRanges(0.006, sgn);
      if (!ranges.length) continue;
      const geo = ribbon({ d0: sgn * (ROAD - 0.2), d1: sgn * CURB, y0: 0.06, y1: 0.12, cols: 1, vScale: 3, ranges });
      const cm = new T.Mesh(geo, curbMat);
      cm.receiveShadow = true;
      g.add(cm);
    }
    // walls (inner face, top cap, outer face)
    const wallMat = new T.MeshLambertMaterial({ map: Tex.wall, side: T.DoubleSide });
    const H = 1.05;
    for (const sgn of [-1, 1]) {
      const wallGeo = buildWall(sgn * EDGE, H);
      const w = new T.Mesh(wallGeo, wallMat);
      w.castShadow = true;
      w.receiveShadow = true;
      g.add(w);
    }
    // start / finish checker
    const fin = new T.Mesh(ribbon({ d0: -ROAD, d1: ROAD, y0: 0.045, cols: 1, vScale: 4, ranges: [[0, 2]] }),
      new T.MeshLambertMaterial({ map: Tex.checker, transparent: false }));
    const uvs = fin.geometry.attributes.uv;
    for (let i = 0; i < uvs.count; i++) uvs.setXY(i, i % 2, Math.floor(i / 2) / 2);
    uvs.needsUpdate = true;
    Tex.checker.wrapS = T.ClampToEdgeWrapping;
    g.add(fin);
    // grid boxes for the 8 start slots
    const slotMat = new T.MeshBasicMaterial({ color: 0xfff6ea, transparent: true, opacity: 0.85 });
    const tmp = {};
    for (let k = 0; k < 8; k++) {
      const s = -10 - k * 7;
      const d = k % 2 ? 4 : -4;
      Track.at(s, d, tmp);
      const m = new T.Mesh(new T.PlaneGeometry(3.6, 0.35), slotMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = tmp.heading;
      m.position.set(tmp.x + tmp.tx * 1.8, tmp.y + 0.05, tmp.z + tmp.tz * 1.8);
      g.add(m);
    }
    scene.add(g);
    return g;
  }

  function buildWall(d, H) {
    const { N, px, py, pz, tx, tz, step } = Track;
    const pos = [], uv = [], idx = [];
    const th = 0.5 * Math.sign(d);
    const prof = [[d, 0, 0], [d, H, 0.5], [d + th, H, 0.62], [d + th, -0.8, 1]];
    for (let i = 0; i <= N; i++) {
      const k = i % N;
      const rx = -tz[k], rz = tx[k];
      for (const [dd, hh, u] of prof) {
        pos.push(px[k] + rx * dd, py[k] + hh, pz[k] + rz * dd);
        uv.push(u, (i * step) / 4);
      }
    }
    for (let i = 0; i < N; i++) {
      for (let c = 0; c < prof.length - 1; c++) {
        const a = i * prof.length + c, b = a + prof.length;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  /* -------------------------------------------------------- Boost pads */
  const boostVS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }';
  const boostFS = [
    'uniform float time; varying vec2 vUv;',
    'void main(){',
    '  vec2 p = vUv; float x = abs(p.x-0.5)*2.0;',
    '  float ch = fract(p.y*3.0 + x*0.9 - time*2.2);',
    '  float band = smoothstep(0.0,0.08,ch)*smoothstep(0.5,0.42,ch);',
    '  vec3 base = mix(vec3(1.0,0.36,0.43), vec3(1.0,0.71,0.29), p.y);',
    '  vec3 c = mix(base*0.55, vec3(1.0,0.97,0.9), band);',
    '  float edge = smoothstep(0.98,0.9,x);',
    '  c = mix(vec3(0.11,0.075,0.19), c, edge);',
    '  gl_FragColor = vec4(c,1.0);',
    '  #include <encodings_fragment>',
    '}',
  ].join('\n');
  G.boostMat = new T.ShaderMaterial({ uniforms: { time: { value: 0 } }, vertexShader: boostVS, fragmentShader: boostFS });
  G.boostMat.userData.keep = true;

  function buildPads(scene, defs) {
    const pads = [];
    for (const [s, d] of defs) {
      const p = Track.at(s, d);
      const m = new T.Mesh(new T.PlaneGeometry(4.2, 6), G.boostMat);
      m.rotation.order = 'YXZ';
      m.rotation.y = p.heading;
      m.rotation.x = -Math.PI / 2;
      m.position.set(p.x, p.y + 0.05, p.z);
      // align UV.y with travel direction (plane's +y maps forward after rotation)
      m.rotation.z = Math.PI;
      scene.add(m);
      pads.push({ s, d, len: 3, half: 2.1 });
    }
    return pads;
  }

  /* -------------------------------------------------------- Build */
  function disposeTree(root) {
    root.traverse((o) => {
      if (o.geometry && !(o.geometry.userData && o.geometry.userData.keep)) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        if (!m || (m.userData && m.userData.keep)) continue;
        for (const k in m) { const v = m[k]; if (v && v.isTexture && !v.userData.keep) v.dispose(); }
        if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k].value; if (v && v.isTexture && !v.userData.keep) v.dispose(); }
        m.dispose();
      }
    });
  }

  G.World = {
    course: null,
    build(scene, course) {
      Tex.make();
      G.World.course = course;
      Track.load(course.ctrl);
      const sk = course.sky;
      SKY.top.set(sk.top); SKY.mid.set(sk.mid); SKY.horizon.set(sk.horizon); SKY.sun.set(sk.sun); SKY.fog.set(course.fog.color);
      SKY.mode = sk.mode || 0;
      G.SUN_DIR.set(course.light.dir[0], course.light.dir[1], course.light.dir[2]).normalize();
      if (course.prepare) course.prepare();
      Tex.forCourse(course.theme);
      scene.fog = new T.Fog(SKY.fog, course.fog.near, course.fog.far);
      scene.background = SKY.horizon.clone();
      const root = new T.Group();
      scene.add(root);
      const out = { root, course };
      const glowSets = {};
      out.addGlow = (x, y, z, c, s) => {
        const key = String(s || 1);
        const set = glowSets[key] || (glowSets[key] = { pts: [], cols: [], size: s || 1 });
        set.pts.push(x, y, z);
        const cc = new T.Color(c);
        set.cols.push(cc.r, cc.g, cc.b);
      };
      Object.assign(out, buildSky(root, course));
      if (course.sea) out.sea = buildSea(root, course);
      out.terrain = buildTerrain(root, course);
      out.road = buildRoad(root);
      out.pads = buildPads(root, course.pads);

      const L = course.light;
      const hemi = new T.HemisphereLight(L.sky, L.ground, L.hemi);
      root.add(hemi);
      const sun = new T.DirectionalLight(L.color, L.intensity);
      sun.position.copy(G.SUN_DIR).multiplyScalar(160);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const sc = sun.shadow.camera;
      sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 420;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.04;
      root.add(sun);
      root.add(sun.target);
      out.sun = sun;
      out.hemi = hemi;

      out.itemRows = course.itemRows.slice();
      G.World.pads = out.pads;
      G.World.itemRows = out.itemRows;
      if (G.Deco) G.Deco.reserve(course);
      if (G.Scenery) G.Scenery.build(root, out, course.scenery || {});
      if (G.Deco) G.Deco.build(root, out, course);
      if (course.build) course.build(root, out);
      // all queued glow sprites (lanterns, bulbs, lamps)
      for (const key in glowSets) {
        const set = glowSets[key];
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(set.pts, 3));
        g.setAttribute('color', new T.Float32BufferAttribute(set.cols, 3));
        root.add(new T.Points(g, new T.PointsMaterial({ size: 2.4 * set.size, map: Tex.glow, vertexColors: true, transparent: true, opacity: course.glowOpacity || 0.7, depthWrite: false, blending: T.AdditiveBlending })));
      }
      return out;
    },
    dispose(scene, w) {
      if (!w) return;
      scene.remove(w.root);
      if (w.sun && w.sun.shadow && w.sun.shadow.map) { w.sun.shadow.map.dispose(); w.sun.shadow.map = null; }
      disposeTree(w.root);
      if (w.course && w.course.teardown) w.course.teardown(w);
    },
    update(w, dt, t, focus) {
      if (w.sea) w.sea.material.uniforms.time.value = t;
      w.sky.material.uniforms.time.value = t;
      G.boostMat.uniforms.time.value = t;
      if (focus) {
        w.sun.position.set(focus.x + G.SUN_DIR.x * 160, focus.y + G.SUN_DIR.y * 160, focus.z + G.SUN_DIR.z * 160);
        w.sun.target.position.set(focus.x, focus.y, focus.z);
      }
      w.clouds.children.forEach((c, i) => { c.position.x += Math.sin(i) * dt * 1.5; });
      if (G.Scenery) G.Scenery.update(w, dt, t);
      if (G.Deco) G.Deco.update(w, dt, t);
      if (w.course.update) w.course.update(w, dt, t, focus);
    },
  };
})();
