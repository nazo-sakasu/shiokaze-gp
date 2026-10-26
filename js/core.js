/* 汐風GP — core: helpers, input, synthesized audio */
(function () {
  'use strict';
  const G = (window.G = {});
  THREE.ColorManagement.legacyMode = false;

  G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  G.rand = (a, b) => a + Math.random() * (b - a);
  G.wrapAng = (a) => {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  G.fmt = (t) => {
    if (!isFinite(t)) return '-:--.---';
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
  };
  G.store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(k);
        return v == null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch (e) {}
    },
  };
  G.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  /* ------------------------------------------------------------ Input */
  const keys = new Set();
  const touch = { left: false, right: false, drift: false, item: false, brake: false };
  const Input = (G.Input = {
    steer: 0, accel: 0, brake: 0, drift: false,
    itemHit: false, pauseHit: false, anyHit: false,
    _prevItem: false, _prevPause: false, _prevAny: false,
    autoAccel: false,
    poll() {
      const k = (c) => keys.has(c);
      let steer = (k('ArrowRight') || k('KeyD') ? 1 : 0) - (k('ArrowLeft') || k('KeyA') ? 1 : 0);
      let accel = k('ArrowUp') || k('KeyW') ? 1 : 0;
      let brake = k('ArrowDown') || k('KeyS') ? 1 : 0;
      let drift = k('Space') || k('ShiftLeft') || k('ShiftRight') || k('KeyC');
      let item = k('KeyE') || k('KeyX') || k('KeyQ');
      let pause = k('Escape') || k('KeyP');

      if (touch.left || touch.right) steer = (touch.right ? 1 : 0) - (touch.left ? 1 : 0);
      if (touch.drift) drift = true;
      if (touch.item) item = true;
      if (touch.brake) brake = 1;
      if (this.autoAccel && !brake) accel = 1;

      let pads = [];
      if (!this.noPads) {
        try { pads = (navigator.getGamepads && navigator.getGamepads()) || []; } catch (e) { this.noPads = true; }
      }
      let padA = false, padStart = false;
      for (const p of pads) {
        if (!p || !p.connected) continue;
        const ax = p.axes[0] || 0;
        if (Math.abs(ax) > 0.18) steer = G.clamp((ax - Math.sign(ax) * 0.18) / 0.82, -1, 1);
        const b = (i) => p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.4);
        if (b(14)) steer = -1;
        if (b(15)) steer = 1;
        if (b(0) || b(7)) accel = Math.max(accel, p.buttons[7] ? Math.max(p.buttons[7].value, b(0) ? 1 : 0) : 1);
        if (b(1) || b(6)) brake = 1;
        if (b(5) || b(4)) drift = true;
        if (b(2) || b(3)) item = true;
        if (b(9)) pause = true;
        if (b(0)) padA = true;
        if (b(9)) padStart = true;
      }
      this.padAHit = padA && !this._prevPadA;
      this.padStartHit = padStart && !this._prevPadStart;
      this._prevPadA = padA;
      this._prevPadStart = padStart;
      this.steer = steer;
      this.accel = accel;
      this.brake = brake;
      this.drift = !!drift;
      this.itemHit = item && !this._prevItem;
      this.pauseHit = pause && !this._prevPause;
      const any = keys.size > 0 || item || pause;
      this.anyHit = any && !this._prevAny;
      this._prevItem = item;
      this._prevPause = pause;
      this._prevAny = any;
    },
    bindTouch(id, field) {
      const el = document.getElementById(id);
      if (!el) return;
      const on = (e) => {
        e.preventDefault();
        touch[field] = true;
        el.classList.add('held');
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        G.Audio.unlock();
      };
      const off = (e) => {
        touch[field] = false;
        el.classList.remove('held');
      };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('lostpointercapture', off);
    },
    clearTouch() {
      for (const k in touch) touch[k] = false;
      document.querySelectorAll('.tbtn.held').forEach((b) => b.classList.remove('held'));
    },
  });
  const gameKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    keys.add(e.code);
    if (gameKeys.has(e.code) && G.state && G.state.mode === 'race') e.preventDefault();
    G.Audio.unlock();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); Input.clearTouch(); });

  /* ------------------------------------------------------------ Audio */
  const A = (G.Audio = {
    ctx: null, master: null, sfx: null, music: null, muted: G.store.get('shiokaze.muted', false),
    noiseBuf: null, engine: null, seq: null,
    unlock() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch (e) {
        return;
      }
      const c = this.ctx;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain();
      this.sfx.gain.value = 0.8;
      this.sfx.connect(this.master);
      this.music = c.createGain();
      this.music.gain.value = 0.32;
      this.music.connect(this.master);
      const len = c.sampleRate * 1.0;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      if (this._wantMusic) this.startMusic(this._wantMusic);
    },
    setMuted(m) {
      this.muted = m;
      G.store.set('shiokaze.muted', m);
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
    },
    now() { return this.ctx ? this.ctx.currentTime : 0; },
    tone(o) {
      const c = this.ctx;
      if (!c) return;
      const t = o.when != null ? o.when : c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(o.f0, t);
      if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + (o.glide || o.dur));
      const v = o.vol == null ? 0.2 : o.vol;
      const at = o.attack || 0.005;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + at);
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
      let node = osc;
      if (o.lp) {
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = o.lp;
        node.connect(f);
        node = f;
      }
      node.connect(g).connect(o.bus || this.sfx);
      osc.start(t);
      osc.stop(t + o.dur + 0.05);
    },
    noise(o) {
      const c = this.ctx;
      if (!c) return;
      const t = o.when != null ? o.when : c.currentTime;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = o.ftype || 'bandpass';
      f.frequency.setValueAtTime(o.f0 || 1000, t);
      if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
      f.Q.value = o.q || 1;
      const g = c.createGain();
      const v = o.vol == null ? 0.2 : o.vol;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + (o.attack || 0.004));
      g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
      src.connect(f).connect(g).connect(o.bus || this.sfx);
      src.start(t, Math.random() * 0.5);
      src.stop(t + o.dur + 0.05);
    },
    play(name, arg) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      switch (name) {
        case 'count': this.tone({ type: 'square', f0: 523, dur: 0.32, vol: 0.16, lp: 3000 }); break;
        case 'go':
          this.tone({ type: 'square', f0: 1047, dur: 0.7, vol: 0.18, lp: 4000 });
          this.tone({ type: 'triangle', f0: 523, dur: 0.7, vol: 0.2 });
          break;
        case 'tick': this.tone({ type: 'square', f0: 1400 + Math.random() * 600, dur: 0.04, vol: 0.05, lp: 5000 }); break;
        case 'box':
          [988, 1319, 1568, 1976].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.18, vol: 0.12, when: t + i * 0.045 }));
          break;
        case 'gotItem': this.tone({ type: 'square', f0: 784, f1: 1568, dur: 0.16, vol: 0.1, lp: 4000 }); break;
        case 'boost':
          this.noise({ f0: 400, f1: 3200, dur: 0.6, vol: 0.3, q: 0.8 });
          this.tone({ type: 'sawtooth', f0: 180, f1: 620, dur: 0.5, vol: 0.12, lp: 2200 });
          break;
        case 'mini':
          this.noise({ f0: 600, f1: 2600, dur: 0.35, vol: 0.18 + (arg || 0) * 0.05, q: 1 });
          this.tone({ type: 'square', f0: 330 + (arg || 0) * 110, f1: 900, dur: 0.25, vol: 0.07, lp: 2500 });
          break;
        case 'charge': this.tone({ type: 'triangle', f0: [0, 880, 1175, 1568][arg || 1], dur: 0.12, vol: 0.09 }); break;
        case 'hop': this.tone({ type: 'square', f0: 260, f1: 420, dur: 0.09, vol: 0.06, lp: 1800 }); break;
        case 'hit':
          this.tone({ type: 'square', f0: 620, f1: 90, dur: 0.6, vol: 0.14, lp: 2000 });
          this.noise({ f0: 1800, f1: 300, dur: 0.4, vol: 0.2 });
          break;
        case 'splash': this.noise({ f0: 2400, f1: 500, dur: 0.5, vol: 0.28, q: 0.6 }); break;
        case 'throw': this.noise({ f0: 900, f1: 2400, dur: 0.22, vol: 0.14, q: 2 }); break;
        case 'drop': this.tone({ type: 'sine', f0: 300, f1: 120, dur: 0.25, vol: 0.18 }); break;
        case 'shield':
          [660, 990, 1320].forEach((f, i) => this.tone({ type: 'sine', f0: f, f1: f * 1.5, dur: 0.4, vol: 0.08, when: t + i * 0.05 }));
          break;
        case 'block': this.tone({ type: 'sine', f0: 1500, f1: 400, dur: 0.3, vol: 0.14 }); break;
        case 'bump': this.noise({ f0: 220, dur: 0.12, vol: 0.25, q: 1.5, ftype: 'lowpass' }); break;
        case 'wall':
          this.noise({ f0: 160, dur: 0.18, vol: 0.32, ftype: 'lowpass' });
          this.tone({ type: 'square', f0: 110, f1: 60, dur: 0.15, vol: 0.08, lp: 600 });
          break;
        case 'lap':
          [784, 988, 1175].forEach((f, i) => this.tone({ type: 'square', f0: f, dur: 0.16, vol: 0.09, lp: 3500, when: t + i * 0.09 }));
          break;
        case 'final':
          [659, 784, 988, 1319, 1319].forEach((f, i) => this.tone({ type: 'square', f0: f, dur: i === 4 ? 0.5 : 0.12, vol: 0.1, lp: 3500, when: t + i * 0.1 }));
          break;
        case 'finish': {
          const n = [523, 659, 784, 1047, 988, 1047, 1319];
          const d = [0.12, 0.12, 0.12, 0.3, 0.12, 0.12, 0.9];
          let w = t;
          n.forEach((f, i) => {
            this.tone({ type: 'square', f0: f, dur: d[i] * 1.1, vol: 0.12, lp: 3800, when: w });
            this.tone({ type: 'triangle', f0: f / 2, dur: d[i] * 1.1, vol: 0.14, when: w });
            w += d[i];
          });
          break;
        }
        case 'pop': this.noise({ f0: 900 + Math.random() * 600, f1: 200, dur: 0.6, vol: 0.12, ftype: 'lowpass' }); break;
        case 'ui': this.tone({ type: 'triangle', f0: 880, f1: 1320, dur: 0.08, vol: 0.08 }); break;
        case 'uchiwa':
          this.noise({ f0: 600, f1: 3200, dur: 0.4, vol: 0.22, q: 0.8 });
          [1568, 2093, 2637].forEach((f, i) => this.tone({ type: 'triangle', f0: f, dur: 0.18, vol: 0.06, when: t + i * 0.04 }));
          break;
        case 'puff':
          this.noise({ f0: 1400, f1: 300, dur: 0.35, vol: 0.2, ftype: 'lowpass' });
          this.tone({ type: 'sine', f0: 520, f1: 260, dur: 0.25, vol: 0.1 });
          break;
        case 'launch':
          this.noise({ f0: 500, f1: 4200, dur: 0.6, vol: 0.18, q: 3 });
          this.tone({ type: 'sine', f0: 700, f1: 2200, dur: 0.55, vol: 0.06 });
          break;
        case 'boom':
          this.noise({ f0: 1200, f1: 80, dur: 1.0, vol: 0.4, ftype: 'lowpass' });
          this.tone({ type: 'sine', f0: 110, f1: 40, dur: 0.6, vol: 0.25 });
          for (let i = 0; i < 6; i++) this.noise({ f0: 5000, dur: 0.05, vol: 0.06, ftype: 'highpass', when: t + 0.25 + Math.random() * 0.5 });
          break;
        case 'boing':
          this.tone({ type: 'sine', f0: 180, f1: 520, glide: 0.12, dur: 0.3, vol: 0.18 });
          this.tone({ type: 'triangle', f0: 360, f1: 900, glide: 0.1, dur: 0.2, vol: 0.06 });
          break;
        case 'bomb':
          this.noise({ f0: 1800, f1: 50, dur: 1.5, vol: 0.55, ftype: 'lowpass' });
          this.tone({ type: 'square', f0: 80, f1: 28, dur: 0.8, vol: 0.18, lp: 400 });
          break;
        case 'wave':
          this.noise({ f0: 200, f1: 900, dur: 1.6, vol: 0.32, ftype: 'lowpass', attack: 0.4 });
          this.noise({ f0: 1200, f1: 3000, dur: 1.2, vol: 0.1, q: 0.6, attack: 0.5 });
          break;
        case 'crash':
          this.noise({ f0: 2600, f1: 260, dur: 1.2, vol: 0.45, q: 0.5 });
          this.noise({ f0: 400, f1: 60, dur: 1.0, vol: 0.4, ftype: 'lowpass' });
          break;
        case 'ink':
          this.noise({ f0: 700, f1: 200, dur: 0.25, vol: 0.3, q: 1.2 });
          this.tone({ type: 'sine', f0: 420, f1: 110, dur: 0.35, vol: 0.16 });
          break;
        case 'happi': {
          const n = [784, 880, 1047, 1175, 1319, 1568, 1760, 2093];
          n.forEach((f, i) => {
            this.tone({ type: 'square', f0: f, dur: 0.1, vol: 0.06, lp: 4000, when: t + i * 0.055 });
            this.noise({ f0: 7000, dur: 0.04, vol: 0.05, ftype: 'highpass', when: t + i * 0.055 });
          });
          break;
        }
        case 'trick':
          this.tone({ type: 'square', f0: 784, dur: 0.08, vol: 0.08, lp: 3500 });
          this.tone({ type: 'square', f0: 1175, dur: 0.16, vol: 0.08, lp: 3500, when: t + 0.08 });
          break;
        case 'jump': this.tone({ type: 'sine', f0: 220, f1: 620, dur: 0.22, vol: 0.12 }); break;
        case 'warn':
          [0, 1, 2].forEach((i) => {
            this.tone({ type: 'square', f0: 988, dur: 0.1, vol: 0.06, lp: 3000, when: t + i * 0.24 });
            this.tone({ type: 'square', f0: 740, dur: 0.1, vol: 0.06, lp: 3000, when: t + i * 0.24 + 0.12 });
          });
          break;
        case 'cheer':
          this.noise({ f0: 1100, dur: 2.6, vol: 0.22, q: 0.4, attack: 0.35 });
          this.noise({ f0: 2600, dur: 2.2, vol: 0.08, q: 0.8, attack: 0.3 });
          break;
      }
    },

    /* --- tyre squeal while drifting --- */
    setSkid(level) {
      const c = this.ctx;
      if (!c) return;
      if (!this.skid) {
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        const f = c.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 3;
        const g = c.createGain();
        g.gain.value = 0;
        src.connect(f).connect(g).connect(this.sfx);
        src.start();
        this.skid = { src, f, g };
      }
      const t = c.currentTime;
      this.skid.g.gain.setTargetAtTime(level > 0 ? 0.035 + level * 0.012 : 0, t, 0.06);
      this.skid.f.frequency.setTargetAtTime(2000 + level * 450, t, 0.1);
    },

    /* --- engine drone for the player kart --- */
    startEngine() {
      const c = this.ctx;
      if (!c || this.engine) return;
      const o1 = c.createOscillator();
      const o2 = c.createOscillator();
      o1.type = 'sawtooth';
      o2.type = 'square';
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 500;
      f.Q.value = 3;
      const g = c.createGain();
      g.gain.value = 0;
      const g2 = c.createGain();
      g2.gain.value = 0.5;
      o1.connect(f);
      o2.connect(g2).connect(f);
      f.connect(g).connect(this.sfx);
      o1.start();
      o2.start();
      this.engine = { o1, o2, f, g };
    },
    setEngine(speed01, throttle, boost, on) {
      const e = this.engine;
      if (!e) return;
      const t = this.ctx.currentTime;
      const base = 46 + speed01 * 120 + throttle * 10 + (boost ? 30 : 0);
      e.o1.frequency.setTargetAtTime(base, t, 0.06);
      e.o2.frequency.setTargetAtTime(base * 0.5 + 1.5, t, 0.06);
      e.f.frequency.setTargetAtTime(380 + speed01 * 1500 + throttle * 300 + (boost ? 900 : 0), t, 0.08);
      e.g.gain.setTargetAtTime(on ? 0.045 + throttle * 0.02 + (boost ? 0.02 : 0) : 0, t, 0.1);
    },
    stopEngine() {
      const e = this.engine;
      if (!e) return;
      const t = this.ctx.currentTime;
      e.g.gain.setTargetAtTime(0, t, 0.05);
      e.o1.stop(t + 0.3);
      e.o2.stop(t + 0.3);
      this.engine = null;
    },

    /* --- procedural seaside pop loop --- */
    style: { transpose: 0, tempo: 150, lead: 'square', taiko: false, soft: false },
    setStyle(st) { this.style = Object.assign({ transpose: 0, tempo: 150, lead: 'square', taiko: false, soft: false }, st || {}); },
    startMusic(kind) {
      this._wantMusic = kind;
      if (!this.ctx) return;
      this.stopMusic(true);
      this._wantMusic = kind;
      const self = this;
      const seq = (this.seq = {
        kind, step: 0, next: this.ctx.currentTime + 0.08, tempo: kind === 'menu' ? Math.round(this.style.tempo * 0.79) : this.style.tempo, gain: this.ctx.createGain(),
      });
      seq.gain.gain.value = 1;
      seq.gain.connect(this.music);
      seq.timer = setInterval(() => self._schedule(), 25);
    },
    stopMusic(immediate) {
      this._wantMusic = null;
      const s = this.seq;
      if (!s) return;
      clearInterval(s.timer);
      if (this.ctx) {
        const t = this.ctx.currentTime;
        s.gain.gain.setTargetAtTime(0, t, immediate ? 0.02 : 0.3);
        setTimeout(() => { try { s.gain.disconnect(); } catch (e) {} }, 1500);
      }
      this.seq = null;
    },
    setTempo(bpm) { if (this.seq) this.seq.tempo = bpm; },
    _schedule() {
      const s = this.seq;
      if (!s || !this.ctx) return;
      const ahead = this.ctx.currentTime + 0.14;
      while (s.next < ahead) {
        this._playStep(s, s.step, s.next);
        s.next += 60 / s.tempo / 4;
        s.step = (s.step + 1) % 128;
      }
    },
    _playStep(s, step, t) {
      const bus = s.gain;
      const bar = Math.floor(step / 16) % 8;
      const st = step % 16;
      const chords = [[62, 66, 69], [59, 62, 66], [59, 62, 67], [61, 64, 69], [62, 66, 69], [61, 66, 69], [59, 62, 67], [61, 64, 69]];
      const roots = [38, 47, 43, 45, 38, 42, 43, 45];
      const mel = [
        69, -1, 74, -1, 73, 74, 76, -1, 74, -1, 71, -1, -1, 69, 71, -1,
        67, -1, 71, 74, -1, 76, 74, 71, 73, -1, -1, 69, -1, -1, -1, -1,
        69, -1, 74, -1, 76, 78, -1, 76, 73, -1, 69, -1, 73, 76, -1, -1,
        74, -1, 71, -1, 74, 76, 78, -1, 81, -1, -1, 78, 76, -1, 73, -1,
      ];
      const sty = this.style;
      const mtof = (m) => 440 * Math.pow(2, (m + sty.transpose - 69) / 12);
      const sixteenth = 60 / s.tempo / 4;
      const menu = s.kind === 'menu';
      // drums
      if (st % 4 === 0) {
        this.tone({ type: 'sine', f0: 150, f1: 42, glide: 0.12, dur: 0.22, vol: menu ? 0.32 : 0.5, when: t, bus });
      }
      if (!menu && (st === 4 || st === 12)) this.noise({ f0: sty.soft ? 1200 : 1900, dur: 0.16, vol: sty.soft ? 0.12 : 0.22, q: 0.7, when: t, bus });
      if (sty.taiko && !menu && (st === 0 || st === 3 || st === 10)) this.tone({ type: 'sine', f0: 92, f1: 58, glide: 0.18, dur: 0.32, vol: 0.32, when: t, bus });
      if (sty.taiko && (st === 6 || st === 14)) this.noise({ f0: 3200, dur: 0.05, vol: 0.09, q: 2.5, when: t, bus });
      if (sty.soft && st % 4 === 2) this.tone({ type: 'sine', f0: mtof(93 + (step % 3) * 4), dur: 0.5, vol: 0.02, when: t, bus });
      if (menu && st === 12) this.noise({ f0: 2400, dur: 0.1, vol: 0.12, q: 0.9, when: t, bus });
      if (st % 2 === 1) this.noise({ f0: 8000, dur: 0.035, vol: (menu ? 0.05 : 0.08) * (sty.soft ? 0.45 : 1), q: 0.5, ftype: 'highpass', when: t, bus });
      // bass: syncopated root / octave
      const bpat = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0];
      if (bpat[st]) {
        const oct = st === 6 || st === 13 ? 12 : 0;
        this.tone({ type: 'square', f0: mtof(roots[bar] + oct), dur: sixteenth * 1.6, vol: 0.14, lp: 700, when: t, bus });
      }
      // arpeggio
      const ch = chords[bar];
      const arp = ch[st % 3] + (st % 6 >= 3 ? 12 : 0);
      this.tone({ type: 'triangle', f0: mtof(arp), dur: sixteenth * 0.9, vol: menu ? 0.05 : 0.045, when: t, bus });
      // melody on eighths
      if (st % 2 === 0 && !(menu && bar < 2 && Math.floor(step / 64) === 0)) {
        const idx = (bar * 8 + st / 2) % 64;
        const n = mel[idx];
        if (n > 0) {
          const nx = mel[(idx + 1) % 64];
          const len = (nx < 0 ? 2 : 1) * sixteenth * 2 * 0.92;
          this.tone({ type: sty.lead, f0: mtof(n), dur: len, vol: (menu ? 0.06 : 0.075) * (sty.lead === 'square' ? 1 : 1.6), lp: sty.lead === 'square' ? 2600 : 3400, when: t, bus, attack: sty.soft ? 0.03 : 0.01 });
          this.tone({ type: 'triangle', f0: mtof(n + 12), dur: len * 0.8, vol: 0.025, when: t + 0.012, bus });
        }
      }
    },
  });
})();
