/* 汐風GP — course registry and shared helpers; course 1: 汐風サーキット */
(function () {
  'use strict';
  const G = window.G;
  const T = THREE;
  const { EDGE } = G.TRACK_DIMS;

  G.COURSES = [];
  const C = (G.CourseKit = {});

  C.smooth = (a, b, x) => {
    const t = G.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  // nearest distance from a point to the current track's centreline
  const _l = {};
  C.trackDist = (x, z) => Math.abs(G.Track.locate(x, z, null, _l).d);
  // random scatter in a rectangle, keeping clear of the track and of other picks
  C.scatter = function (n, area, opt) {
    const out = [];
    const minTrack = opt.minTrack || EDGE + 4;
    const maxTrack = opt.maxTrack || Infinity;
    const gap2 = (opt.gap || 4) ** 2;
    let tries = 0;
    while (out.length < n && tries++ < n * 20) {
      const x = G.rand(area[0], area[1]), z = G.rand(area[2], area[3]);
      const d = C.trackDist(x, z);
      if (d < minTrack || d > maxTrack) continue;
      if (opt.reject && opt.reject(x, z)) continue;
      if (G.Deco && G.Deco.blocked(x, z)) continue;
      let ok = true;
      for (const p of out) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < gap2) { ok = false; break; }
      if (ok) out.push([x, z]);
    }
    return out;
  };
  // positions along the track at both walls
  C.alongTrack = function (s0, s1, step, d, fn) {
    const p = {};
    for (let s = s0; s < s1; s += step) { G.Track.at(s, d, p); fn(p, s); }
  };
  C.area = (pad) => {
    const b = G.Track.bounds;
    return [b.minX - pad, b.maxX + pad, b.minZ - pad, b.maxZ + pad];
  };
  // underwater light ripples, injected into Lambert materials
  C.caustic = { value: 0 };
  C.addCaustics = function (mat, strength) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uCaust = C.caustic;
      sh.vertexShader = 'varying vec3 vCW;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'vec4 cw = vec4(transformed, 1.0);',
        '#ifdef USE_INSTANCING',
        '  cw = instanceMatrix * cw;',
        '#endif',
        'vCW = (modelMatrix * cw).xyz;',
      ].join('\n'));
      sh.fragmentShader = [
        'uniform float uCaust; varying vec3 vCW;',
        'float caust(vec2 p){',
        '  p *= 0.09; float t = uCaust * 0.55; vec2 i = p; float c = 1.0; float inten = 0.005;',
        '  for (int n = 0; n < 4; n++) {',
        '    float tt = t * (1.0 - (3.5 / float(n + 1)));',
        '    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));',
        '    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));',
        '  }',
        '  c /= 4.0; c = 1.17 - pow(c, 1.4);',
        '  return clamp(pow(abs(c), 8.0), 0.0, 1.0);',
        '}',
      ].join('\n') + '\n' + sh.fragmentShader.replace('#include <output_fragment>', [
        'outgoingLight += diffuseColor.rgb * caust(vCW.xz) * ' + (strength || 0.55).toFixed(2) + ';',
        '#include <output_fragment>',
      ].join('\n'));
    };
    mat.customProgramCacheKey = () => 'caustics' + (strength || 0.55);
    return mat;
  };
  // gentle sway for tall plants (kelp, palms) — height above `base` bends
  C.addSway = function (mat, uniform, amp, base) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = uniform;
      sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'float hh = max(transformed.y - ' + (base || 0).toFixed(2) + ', 0.0);',
        'float ph = 0.0;',
        '#ifdef USE_INSTANCING',
        '  ph = instanceMatrix[3].x * 0.07 + instanceMatrix[3].z * 0.05;',
        '#endif',
        'float sw = sin(uWind * 1.1 + ph + hh * 0.25) * 0.6 + sin(uWind * 2.3 + ph * 1.7) * 0.25;',
        'transformed.x += sw * hh * ' + (amp || 0.02).toFixed(3) + ' * hh;',
        'transformed.z += cos(uWind * 0.9 + ph + hh * 0.2) * hh * hh * ' + ((amp || 0.02) * 0.6).toFixed(3) + ';',
      ].join('\n'));
    };
    mat.customProgramCacheKey = () => 'sway' + amp + base;
    return mat;
  };

  /* ---------------------------------------------------------------- course 1 */
  function coastZ(x) { return 64 + 10 * Math.sin(x * 0.012) + 6 * Math.sin(x * 0.031 + 1.3); }
  function coastX(z) { return -338 + 9 * Math.sin(z * 0.021 + 0.4); }
  const landDist = (x, z) => Math.min(coastZ(x) - z, x - coastX(z));
  const cSand = new T.Color('#efd2a2'), cWet = new T.Color('#c9a77e'), cFoam = new T.Color('#fff4e6');
  const cGrass = new T.Color('#79b56f'), cGrass2 = new T.Color('#5c9a63'), cRock = new T.Color('#8a7d9c');
  const cTrackSide = new T.Color('#6aa86a');

  G.COURSES.push({
    id: 'shiokaze', name: '汐風サーキット', en: 'SEASIDE CIRCUIT', tag: '夕暮れの海辺', color: '#35d3c3',
    ctrl: [
      [-50, 0, 0], [60, 0, 0], [150, 0, 0], [228, 0, -30], [258, 1.5, -115], [222, 4, -192],
      [150, 6, -205], [96, 6.5, -158], [40, 4.5, -118], [-30, 2, -150], [-100, 0.5, -205],
      [-190, 0, -200], [-262, 0, -140], [-280, 0, -60], [-245, 0, -8], [-160, 0, 0],
    ],
    sky: { top: '#4b4da6', mid: '#de97b8', horizon: '#f7c2a4', sun: '#fff1c9', mode: 0 },
    fog: { color: '#f7c2a4', near: 220, far: 1500 },
    light: { dir: [-0.55, 0.36, 0.75], sky: 0xc4bdff, ground: 0xe6a57d, hemi: 0.78, color: 0xffd9b4, intensity: 1.25 },
    clouds: true, sea: true,
    theme: {
      road: { base: '#4b4459', speck: ['#57506a', '#3f394c', '#5f586f', '#463f53'], line: '#f4ece4' },
      shoulder: { base: '#e9c99a', speck: ['#f2d6ab', '#dcb784', '#e3bf8e', '#f6e0bb'] },
      wall: { a: '#35d3c3', b: '#fff3e6', dark: '#2a1e48' },
      curb: ['#ff5a6e', '#fff3e6'],
    },
    prepare() { G.landDist = landDist; },
    height(x, z) {
      const ld = landDist(x, z);
      let h;
      if (ld < 0) h = -0.7 + ld * 0.14;
      else h = Math.min(ld * 0.04, 0.35) + 0.25 * Math.sin(x * 0.05) * Math.cos(z * 0.043) * Math.min(1, ld / 40);
      h += 5.2 * Math.exp(-((x - 150) ** 2 + (z + 190) ** 2) / (75 * 75));
      h += 2.0 * Math.exp(-((x - 30) ** 2 + (z + 60) ** 2) / (50 * 50));
      if (z < -300) {
        const k = G.clamp((-300 - z) / 260, 0, 1);
        const ridge = 0.5 + 0.5 * Math.sin(x * 0.011) * Math.cos(x * 0.004 + 1) + 0.25 * Math.sin(x * 0.037 + z * 0.02);
        h += k * k * (30 + 70 * ridge);
      }
      return h;
    },
    ground(x, z, h, dist, tmp) {
      const ld = landDist(x, z);
      if (h > 22) return tmp.copy(cRock).lerp(cGrass2, G.clamp((60 - h) / 60, 0, 0.6));
      if (ld < -2) return tmp.copy(cWet);
      if (ld < 3) return tmp.copy(cFoam).lerp(cWet, G.clamp((ld + 2) / 5, 0, 1) * 0.3);
      if (ld < 46) return tmp.copy(cSand).lerp(cGrass, G.clamp((ld - 30) / 16, 0, 1));
      const n = 0.5 + 0.5 * Math.sin(x * 0.07 + Math.sin(z * 0.05) * 2) * Math.cos(z * 0.06);
      tmp.copy(cGrass).lerp(cGrass2, n * 0.7);
      if (dist < 30) tmp.lerp(cTrackSide, 0.4);
      return tmp;
    },
    pads: [[373, 3.5], [697, -3], [1015, 3], [1319, -2.5]],
    itemRows: [180, 552, 856, 1187],
    ramps: [{ s: 736, h: 1.45 }, { s: 1238, h: 1.35 }],
    stalls: { count: 7, s0: 18, spacing: 19, sides: [1] },
    parasols: true, gulls: true,
    scenery: {
      palms: true, bushes: true, posts: true, festoons: true, grandstand: true, flags: true, lighthouse: true, ferris: true, boats: true,
      gantry: { title: '汐風グランプリ', sub: 'SHIOKAZE GRAND PRIX' },
    },
    fireworks: { x: [-300, 260], y: [80, 130], z: [150, 280], every: [4, 8] },
    music: { transpose: 0, tempo: 150, lead: 'square' },
  });
})();
