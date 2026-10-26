/* 汐風GP — post processing: bloom, speed blur, chromatic fringe */
(function () {
  'use strict';
  const G = window.G;
  const T = THREE;
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const mat = (fs, uniforms) => new T.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });

  const Post = (G.Post = { enabled: G.store.get('shiokaze.hq', true), ok: false, radial: 0, aberr: 0, levels: [] });

  Post.init = function (renderer) {
    try {
      Post.r = renderer;
      const gl2 = renderer.capabilities.isWebGL2;
      const hdr = gl2 && renderer.extensions.has('EXT_color_buffer_float');
      Post.hdr = hdr;
      const type = hdr ? T.HalfFloatType : T.UnsignedByteType;
      Post.scene = new T.Scene();
      Post.cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      Post.quad = new T.Mesh(new T.PlaneGeometry(2, 2));
      Post.quad.frustumCulled = false;
      Post.scene.add(Post.quad);
      Post.rtScene = new T.WebGLRenderTarget(4, 4, { type, samples: gl2 ? 4 : 0 });
      for (let i = 0; i < 5; i++) {
        const o = { type, depthBuffer: false };
        Post.levels.push({ down: new T.WebGLRenderTarget(4, 4, o), up: new T.WebGLRenderTarget(4, 4, o) });
      }
      Post.bright = mat([
        'uniform sampler2D tDiffuse; uniform float threshold; varying vec2 vUv;',
        'void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(c.r, max(c.g, c.b));',
        '  float k = 0.3; float soft = clamp(l - threshold + k, 0.0, 2.0*k); soft = soft*soft/(4.0*k + 1e-4);',
        '  float w = max(soft, l - threshold) / max(l, 1e-4);',
        '  gl_FragColor = vec4(min(c * w, vec3(12.0)), 1.0); }',
      ].join('\n'), { tDiffuse: { value: null }, threshold: { value: 1 } });
      Post.down = mat([
        'uniform sampler2D tDiffuse; uniform vec2 texel; varying vec2 vUv;',
        'void main(){ vec4 s = texture2D(tDiffuse, vUv) * 4.0;',
        '  s += texture2D(tDiffuse, vUv - texel); s += texture2D(tDiffuse, vUv + texel);',
        '  s += texture2D(tDiffuse, vUv + vec2(texel.x, -texel.y)); s += texture2D(tDiffuse, vUv - vec2(texel.x, -texel.y));',
        '  gl_FragColor = s / 8.0; }',
      ].join('\n'), { tDiffuse: { value: null }, texel: { value: new T.Vector2() } });
      Post.up = mat([
        'uniform sampler2D tDiffuse; uniform sampler2D tBase; uniform vec2 texel; varying vec2 vUv;',
        'void main(){ vec2 h = texel;',
        '  vec4 s = texture2D(tDiffuse, vUv + vec2(-h.x*2.0, 0.0));',
        '  s += texture2D(tDiffuse, vUv + vec2(-h.x, h.y)) * 2.0;',
        '  s += texture2D(tDiffuse, vUv + vec2(0.0, h.y*2.0));',
        '  s += texture2D(tDiffuse, vUv + vec2(h.x, h.y)) * 2.0;',
        '  s += texture2D(tDiffuse, vUv + vec2(h.x*2.0, 0.0));',
        '  s += texture2D(tDiffuse, vUv + vec2(h.x, -h.y)) * 2.0;',
        '  s += texture2D(tDiffuse, vUv + vec2(0.0, -h.y*2.0));',
        '  s += texture2D(tDiffuse, vUv + vec2(-h.x, -h.y)) * 2.0;',
        '  gl_FragColor = s / 12.0 + texture2D(tBase, vUv); }',
      ].join('\n'), { tDiffuse: { value: null }, tBase: { value: null }, texel: { value: new T.Vector2() } });
      Post.comp = mat([
        'uniform sampler2D tScene; uniform sampler2D tBloom; uniform float strength, radial, aberr, sat; varying vec2 vUv;',
        'vec3 shoulder(vec3 c){ vec3 t = max(c - 0.82, 0.0); return min(c, vec3(0.82)) + 0.18 * (1.0 - exp(-t / 0.18)); }',
        'vec3 toSRGB(vec3 c){ c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }',
        'void main(){',
        '  vec2 uv = vUv; vec2 dir = uv - vec2(0.5, 0.47); float dist = length(dir);',
        '  vec3 col;',
        '  if (radial > 0.001) {',
        '    vec3 acc = vec3(0.0); float ws = 0.0; float amt = radial * 0.07 * smoothstep(0.12, 0.75, dist);',
        '    for (int i = 0; i < 8; i++) { float f = float(i) / 7.0; float w = 1.0 - f * 0.55; acc += texture2D(tScene, uv - dir * amt * f).rgb * w; ws += w; }',
        '    col = acc / ws;',
        '  } else col = texture2D(tScene, uv).rgb;',
        '  if (aberr > 0.001) { vec2 o = dir * aberr * 0.008 * dist; col.r = texture2D(tScene, uv + o).r; col.b = texture2D(tScene, uv - o).b; }',
        '  col += texture2D(tBloom, uv).rgb * strength;',
        '  col = shoulder(col);',
        '  float l = dot(col, vec3(0.2126, 0.7152, 0.0722)); col = mix(vec3(l), col, sat);',
        '  gl_FragColor = vec4(toSRGB(col), 1.0);',
        '}',
      ].join('\n'), { tScene: { value: null }, tBloom: { value: null }, strength: { value: 0.6 }, radial: { value: 0 }, aberr: { value: 0 }, sat: { value: 1.06 } });
      Post.ok = true;
    } catch (e) {
      console.warn('post disabled', e);
      Post.ok = false;
    }
  };

  Post.setSize = function (w, h) {
    if (!Post.ok) return;
    Post.rtScene.setSize(w, h);
    let lw = Math.max(2, Math.floor(w / 2)), lh = Math.max(2, Math.floor(h / 2));
    for (const lv of Post.levels) {
      lv.down.setSize(lw, lh);
      lv.up.setSize(lw, lh);
      lv.w = lw; lv.h = lh;
      lw = Math.max(2, Math.floor(lw / 2)); lh = Math.max(2, Math.floor(lh / 2));
    }
  };

  function pass(material, target) {
    Post.quad.material = material;
    Post.r.setRenderTarget(target);
    Post.r.render(Post.scene, Post.cam);
  }

  Post.render = function (scene, camera, dt) {
    const r = Post.r;
    if (!Post.enabled || !Post.ok) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    try {
      r.setRenderTarget(Post.rtScene);
      r.render(scene, camera);
      const L = Post.levels;
      Post.bright.uniforms.tDiffuse.value = Post.rtScene.texture;
      Post.bright.uniforms.threshold.value = Post.hdr ? 1.75 : 0.93;
      pass(Post.bright, L[0].down);
      for (let i = 1; i < L.length; i++) {
        Post.down.uniforms.tDiffuse.value = L[i - 1].down.texture;
        Post.down.uniforms.texel.value.set(1 / L[i - 1].w, 1 / L[i - 1].h);
        pass(Post.down, L[i].down);
      }
      for (let i = L.length - 2; i >= 0; i--) {
        const src = i === L.length - 2 ? L[i + 1].down : L[i + 1].up;
        Post.up.uniforms.tDiffuse.value = src.texture;
        Post.up.uniforms.tBase.value = L[i].down.texture;
        Post.up.uniforms.texel.value.set(1 / L[i + 1].w, 1 / L[i + 1].h);
        pass(Post.up, L[i].up);
      }
      const c = Post.comp.uniforms;
      c.tScene.value = Post.rtScene.texture;
      c.tBloom.value = L[0].up.texture;
      c.strength.value = Post.hdr ? 0.13 : 0.1;
      c.radial.value = Post.radial;
      c.aberr.value = Post.aberr;
      pass(Post.comp, null);
    } catch (e) {
      console.warn('post failed, falling back', e);
      Post.ok = false;
      r.setRenderTarget(null);
      r.render(scene, camera);
    }
  };
})();
