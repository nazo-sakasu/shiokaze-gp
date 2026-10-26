/* 汐風GP — race flow, camera, podium, main loop */
(function () {
  'use strict';
  const G = window.G;
  const T = THREE;
  const Track = G.Track;

  const CLASSES = [
    { name: 'のんびり', cc: '50cc', vmax: 23, cpu: 0.9 },
    { name: 'ふつう', cc: '100cc', vmax: 27.5, cpu: 0.965 },
    { name: 'ガチ', cc: '150cc', vmax: 31.5, cpu: 1.0 },
  ];
  G.CLASSES = CLASSES;
  const LAPS = 3;
  const STEP = 1 / 120;

  const Game = (G.Game = {
    renderer: null, scene: null, camera: null, world: null, models: {},
    race: null, settings: { char: G.store.get('shiokaze.char', 'koro'), cls: G.store.get('shiokaze.cls', 1), course: G.store.get('shiokaze.course', 'shiokaze'), cpu: G.store.get('shiokaze.cpu', true), lock: G.store.get('shiokaze.lock', true), nick: G.store.get('shiokaze.nick', ''), mode: 'solo' },
    extraModels: {},
    trauma: 0, camState: null, acc: 0, t: 0, pixelRatio: 1, frameTimes: [], slowStrikes: 0,
  });

  G.shake = (a) => { Game.trauma = Math.min(1, Game.trauma + a); };
  G.near = (k) => {
    const p = Game.race && Game.race.player;
    if (!p || p === k) return false;
    return (p.x - k.x) ** 2 + (p.z - k.z) ** 2 < 45 * 45;
  };

  Game.init = function () {
    const canvas = document.getElementById('gl');
    const r = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.outputEncoding = T.sRGBEncoding;
    r.toneMapping = T.NoToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = T.PCFSoftShadowMap;
    Game.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    r.setPixelRatio(Game.pixelRatio);
    Game.renderer = r;
    const scene = (Game.scene = new T.Scene());
    Game.camera = new T.PerspectiveCamera(64, 1, 0.3, 3200);
    if (!G.COURSES.some((c) => c.id === Game.settings.course)) Game.settings.course = G.COURSES[0].id;
    Game.world = G.World.build(scene, Game.course());
    G.FX.init(scene);
    G.Items.init(scene);
    G.Items.setRows(Game.world.root, Game.world.itemRows);
    G.Audio.setStyle(Game.course().music);
    G.Post.init(r);
    for (const c of G.CHARS) Game.models[c.id] = G.buildKartModel(c);
    Game.resize();
    window.addEventListener('resize', Game.resize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && Game.race && !Game.race.online && (Game.race.mode === 'race' || Game.race.mode === 'count') && !Game.race.attract) G.UI.pause(true);
    });
    r.compile(scene, Game.camera);
  };

  Game.course = () => G.COURSES.find((c) => c.id === Game.settings.course) || G.COURSES[0];
  Game.bestKey = () => Game.settings.course + ':' + Game.settings.cls;
  // tear the current course down and build another one in its place
  Game.setCourse = function (id) {
    if (id === Game.settings.course && Game.world) return false;
    Game.settings.course = id;
    G.store.set('shiokaze.course', id);
    if (Game.race) for (const k of Game.race.karts) Game.scene.remove(k.model.root);
    G.Items.reset();
    G.FX.clear();
    G.World.dispose(Game.scene, Game.world);
    Game.world = G.World.build(Game.scene, Game.course());
    G.Items.setRows(Game.world.root, Game.world.itemRows);
    G.Audio.setStyle(Game.course().music);
    Game.race = null;
    try { Game.renderer.compile(Game.scene, Game.camera); } catch (e) {}
    return true;
  };
  Game.cheer = (v) => { for (const c of [Game.world.crowd, Game.world.crowd2]) if (c) c.cheer = v; };

  Game.resize = function () {
    const w = window.innerWidth, h = window.innerHeight;
    Game.renderer.setSize(w, h, false);
    Game.camera.aspect = w / h;
    Game.camera.fov = w / h < 1 ? 78 : 64;
    Game.baseFov = Game.camera.fov;
    Game.camera.updateProjectionMatrix();
    const v = Game.renderer.getDrawingBufferSize(new T.Vector2());
    G.Post.setSize(v.x, v.y);
    const fx = document.getElementById('fx');
    fx.width = Math.round(w * Math.min(1.5, window.devicePixelRatio || 1));
    fx.height = Math.round(h * Math.min(1.5, window.devicePixelRatio || 1));
  };

  /* ------------------------------------------------------------ race setup */
  function dropTag(k) {
    k.model.root.remove(k.tag);
    k.tag.material.map.dispose();
    k.tag.material.dispose();
    k.tag = null;
  }
  Game.newRace = function (attract) {
    const scene = Game.scene;
    if (Game.race) for (const k of Game.race.karts) { scene.remove(k.model.root); if (k.tag) dropTag(k); }
    G.Items.reset();
    G.FX.clear();
    Game.world.podium.grp.visible = false;
    const cls = CLASSES[Game.settings.cls];
    const chars = G.CHARS.slice();
    const playerChar = attract ? null : chars.find((c) => c.id === Game.settings.char);
    const others = chars.filter((c) => c !== playerChar).sort(() => Math.random() - 0.5);
    const order = [];
    const playerSlot = 5;
    let oi = 0;
    for (let slot = 0; slot < 8; slot++) {
      if (!attract && slot === playerSlot) order.push(playerChar);
      else order.push(others[oi++]);
    }
    const race = {
      mode: attract ? 'race' : 'count', attract, karts: [], player: null, t: 0, count: 0,
      laps: LAPS, cls, finishOrder: [], doneT: 0, fireworkT: 0, skyT: 4, podium: false,
      onLap: (k) => Game.onLap(k),
    };
    order.forEach((c, slot) => {
      const isP = c === playerChar;
      const k = new G.Kart(c, slot, isP, { vmax: cls.vmax, skill: 1, model: Game.models[c.id] });
      k.place(-9 - slot * 6.8, slot % 2 ? 3.9 : -3.9);
      k.baseSkill = isP ? 1 : cls.cpu + G.rand(-0.025, 0.02) + (attract ? 0.02 : 0);
      k.skill = k.baseSkill;
      scene.add(k.model.root);
      race.karts.push(k);
      if (isP) race.player = k;
    });
    if (attract) {
      race.karts.forEach((k, i) => { k.place(i * 37 + 40, ((i % 3) - 1) * 4); k.lap = 1; k.progress = k.loc.s; k.speed = 20; k.vx = Math.sin(k.h) * 20; k.vz = Math.cos(k.h) * 20; });
    }
    Game.race = race;
    Game.camState = null;
    const sel = race.karts.findIndex((k) => k.c.id === Game.settings.char);
    Game.attractCam = { k: attract && sel >= 0 ? sel : 0, t: 0, style: 0, lock: attract };
    for (const l of Game.world.startLamps) l.material.color.setHex(0x3b2c63);
    Game.world.lampGlow.material.opacity = 0;
    G.Audio.setSkid(0);
    return race;
  };

  // a model for this character that no other kart in the race is using
  Game.modelFor = function (id, used) {
    const list = [Game.models[id]].concat(Game.extraModels[id] || []);
    for (const m of list) if (!used.has(m)) { used.add(m); return m; }
    const c = G.CHARS.find((x) => x.id === id);
    const m = G.buildKartModel(c);
    (Game.extraModels[id] = Game.extraModels[id] || []).push(m);
    used.add(m);
    return m;
  };

  // online race: slots come from the host, [key, character, human]
  Game.newOnlineRace = function (h) {
    const scene = Game.scene;
    if (Game.race) for (const k of Game.race.karts) { scene.remove(k.model.root); if (k.tag) dropTag(k); }
    G.Items.reset();
    G.FX.clear();
    Game.world.podium.grp.visible = false;
    const cls = CLASSES[Game.settings.cls];
    const race = {
      mode: 'wait', online: true, attract: false, karts: [], player: null, t: 0, count: 0,
      laps: LAPS, cls, finishOrder: [], doneT: 0, fireworkT: 0, skyT: 4, podium: false,
      onLap: (k) => Game.onLap(k),
    };
    const used = new Set();
    h.sl.forEach((sl, slot) => {
      const [key, ch, human] = sl;
      const c = G.CHARS.find((x) => x.id === ch) || G.CHARS[0];
      const isMe = key === G.Net.myPeer;
      const k = new G.Kart(c, slot, isMe, { vmax: cls.vmax, skill: 1, model: Game.modelFor(c.id, used) });
      k.key = key;
      k.human = !!human;
      k.remote = human ? !isMe : !G.Net.isHost;
      k.place(-9 - slot * 6.8, slot % 2 ? 3.9 : -3.9);
      k.baseSkill = k.human ? 1 : cls.cpu + G.rand(-0.025, 0.02);
      k.skill = k.baseSkill;
      if (k.human) k.netName = G.Net.nameOf(key, c.name);
      if (k.human && !isMe) {
        k.tag = G.makeNameTag(k.netName, c.kart);
        k.model.root.add(k.tag);
      }
      scene.add(k.model.root);
      race.karts.push(k);
      if (isMe) race.player = k;
    });
    Game.race = race;
    Game.camState = null;
    Game.attractCam = { k: 0, t: 0, style: 0, lock: false };
    for (const l of Game.world.startLamps) l.material.color.setHex(0x3b2c63);
    Game.world.lampGlow.material.opacity = 0;
    G.Audio.setSkid(0);
    return race;
  };

  Game.focusChar = function (id) {
    const race = Game.race;
    if (!race || !race.attract) return;
    const i = race.karts.findIndex((k) => k.c.id === id);
    if (i < 0) return;
    Game.attractCam = { k: i, t: 0, style: 0, lock: true };
    Game.camState = null;
  };

  Game.onLap = function (k) {
    const race = Game.race;
    if (race.attract) return;
    if (k.lap >= 2) k.lapTimes.push(race.t - k.lapStart);
    k.lapStart = race.t;
    if (k.lap > race.laps && !k.finished) {
      k.finished = true;
      k.finishTime = race.t;
      race.finishOrder.push(k);
      if (k.isPlayer) Game.playerFinish();
      return;
    }
    if (k.isPlayer && k.lap >= 2) {
      if (k.lap === race.laps) {
        G.UI.banner('FINAL LAP', 'small final');
        G.Audio.play('final');
        G.Audio.setTempo(Math.round(G.Audio.style.tempo * 1.12));
      } else {
        G.UI.banner('LAP ' + k.lap, 'small');
        G.Audio.play('lap');
      }
    }
  };

  Game.playerFinish = function () {
    const race = Game.race;
    race.mode = 'done';
    race.doneT = 0;
    const p = race.player;
    G.UI.banner('GOAL!', 'go');
    G.Audio.play('finish');
    G.Audio.play('cheer');
    G.Audio.stopMusic();
    G.Audio.setEngine(0, 0, false, false);
    G.Audio.setSkid(0);
    Game.cheer(1);
    G.FX.confetti(p.x, p.y + 6, p.z, 160, 8);
    for (const k of race.karts) {
      if (k.finished) continue;
      const remain = race.laps * Track.L - k.progress;
      const avg = Math.max(12, k.progress / Math.max(1, race.t));
      k.estTime = race.t + remain / (avg * 1.02);
    }
    const best = G.store.get('shiokaze.best', {});
    const key = Game.bestKey();
    race.newBest = !best[key] || p.finishTime < best[key];
    if (race.newBest) { best[key] = p.finishTime; G.store.set('shiokaze.best', best); }
  };

  /* ------------------------------------------------------------ podium */
  Game.finalOrder = function (race) {
    return race.karts.slice().sort((a, b) => (a.finished ? a.finishTime : a.estTime) - (b.finished ? b.finishTime : b.estTime));
  };
  Game.startPodium = function (race) {
    const pod = Game.world.podium;
    race.podium = true;
    race.podiumT = 0;
    G.Items.reset();
    const order = Game.finalOrder(race);
    pod.grp.visible = true;
    pod.grp.updateMatrixWorld(true);
    race.karts.forEach((k) => { k.model.root.visible = false; });
    order.slice(0, 3).forEach((k, i) => {
      const m = k.model;
      const wp = pod.grp.localToWorld(pod.slots[i].clone());
      m.root.visible = true;
      m.root.position.copy(wp);
      m.root.rotation.set(0, pod.grp.rotation.y, 0);
      m.tilt.position.y = 0; m.tilt.rotation.set(0, 0, 0); m.tilt.scale.set(1, 1, 1);
      m.flames.forEach((f) => { f.visible = false; });
      m.shield.visible = false; m.orbit.visible = false; m.stars.visible = false; m.aura.visible = false; m.ink.visible = false;
      m.blob.position.y = 0.06;
      race.podiumKarts = race.podiumKarts || [];
      race.podiumKarts.push(k);
    });
    Game.camState = null;
  };
  function animatePodium(race, dt, t) {
    race.podiumT += dt;
    (race.podiumKarts || []).forEach((k, i) => {
      const m = k.model;
      const hop = Math.max(0, Math.sin(t * (i === 0 ? 7 : 5) + i)) * (i === 0 ? 0.35 : 0.18);
      m.tilt.position.y = hop;
      m.driver.rotation.z = Math.sin(t * 3 + i) * 0.15;
      m.headPivot.rotation.y = Math.sin(t * 1.6 + i * 2) * 0.5;
      m.headPivot.rotation.x = -0.15 + Math.sin(t * 6 + i) * 0.05;
      if (i === 0 && Math.random() < 0.5) G.FX.glow(m.root.position.x + G.rand(-2, 2), m.root.position.y + G.rand(1, 3), m.root.position.z + G.rand(-2, 2), 0, 1.5, 0, 0xffe7a3, 0.5, 0.8);
    });
    race.confT = (race.confT || 0) - dt;
    if (race.confT <= 0) {
      race.confT = 0.7;
      const c = Game.world.podium.grp.position;
      G.FX.confetti(c.x, c.y + 9, c.z, 40, 7);
    }
  }

  /* ------------------------------------------------------------ update */
  function ranking(race) {
    const arr = race.karts.slice();
    arr.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    arr.forEach((k, i) => { k.place_ = i + 1; });
    race.order = arr;
    return arr;
  }

  const noCtl = { steer: 0, accel: 0, brake: 0, drift: false, item: false };
  function step(dt) {
    const race = Game.race;
    const p = race.player;
    if (race.mode === 'count') {
      race.count += dt;
      if (p && G.Input.accel > 0 && !G.Input.autoAccel && p.startCharge < 0) p.startCharge = race.count;
    }
    if (race.mode === 'race' || race.mode === 'done') race.t += dt;
    ranking(race);
    let lead = p ? p.progress : 0;
    if (race.online) for (const k of race.karts) if (k.human && k.progress > lead) lead = k.progress;
    for (const k of race.karts) {
      if (k.remote) continue;
      let ctl;
      if (k.isPlayer && race.mode !== 'done') {
        ctl = { steer: G.Input.steer, accel: G.Input.accel, brake: G.Input.brake, drift: G.Input.drift, item: G.Input.itemHit };
      } else if (race.mode === 'count') ctl = noCtl;
      else {
        if (!k.ai) k.ai = { line: 0, lineT: 0, itemWait: 1, driftHold: false, aggr: 0.5, boxSeek: false };
        ctl = k.think(dt, race);
        if (k.isPlayer) ctl.item = false;
      }
      if (!k.isPlayer) {
        let rb = 0;
        if (p && race.mode === 'race') {
          const diff = lead - k.progress;
          rb = G.clamp(diff / 260, -0.09, 0.1);
        }
        k.vmaxScale = k.baseSkill * (1 + rb) * (race.mode === 'done' && k.finished ? 0.75 : 1) * (k.inkT > 0 ? 0.93 : 1);
      } else k.vmaxScale = race.mode === 'done' ? 0.7 : 1;
      k.update(dt, ctl, race);
    }
    G.Input.itemHit = false;
    G.collideKarts(race.karts);
    G.Items.update(dt, Game.t, race);
  }

  Game.update = function (dt) {
    const race = Game.race;
    G.Input.poll();
    if (!race) return;
    if (G.Input.padAHit || G.Input.padStartHit) {
      const vis = (id) => !document.getElementById(id).hidden;
      if (vis('title')) { G.UI.primary(); return; }
      if (vis('results')) { G.UI.resultsPrimary(); return; }
      if (vis('pause')) { G.UI.pause(false); return; }
    }
    if (race.mode === 'paused') return;
    if (G.Input.pauseHit && !race.attract && (race.mode === 'race' || race.mode === 'count' || (race.online && race.mode !== 'done'))) { G.UI.pause(true); if (!race.online) return; }

    if (race.mode === 'count') {
      const c0 = race.count, c1 = c0 + dt;
      [0.6, 1.6, 2.6].forEach((m, i) => {
        if (c0 < m && c1 >= m) {
          G.UI.banner(String(3 - i), '');
          G.Audio.play('count');
          Game.world.startLamps[i].material.color.setHex(0xff5a6e);
          Game.world.lampGlow.material.color.setHex(0xff5a6e);
          Game.world.lampGlow.material.opacity = 0.35 + i * 0.2;
        }
      });
      if (c0 < 3.6 && c1 >= 3.6) {
        race.mode = 'race';
        G.UI.banner('GO!', 'go');
        G.Audio.play('go');
        G.Audio.play('cheer');
        G.Audio.startMusic('race');
        Game.cheer(0.8);
        for (const l of Game.world.startLamps) l.material.color.setHex(0x35d3c3);
        Game.world.lampGlow.material.color.setHex(0x35d3c3);
        const p = race.player;
        if (p) {
          if (p.startCharge >= 2.75 && p.startCharge <= 3.55) {
            p.boost(1.3, 1.4);
            G.Audio.play('boost');
            G.UI.toast('ロケットスタート！');
          } else if (p.startCharge >= 0 && p.startCharge < 1.8) {
            p.stallT = 0.7;
            for (let i = 0; i < 14; i++) G.FX.dust(p.x - Math.sin(p.h) * 1.6, p.y + 0.8, p.z - Math.cos(p.h) * 1.6, 0x6b6380, 1.6);
          }
        }
        for (const k of race.karts) if (!k.isPlayer && !k.remote && Math.random() < 0.5 * k.baseSkill) k.boost(0.8, 1.3);
      }
    }

    if (race.online) { const tnow = performance.now(); for (const k of race.karts) if (k.remote) k.netStep(dt, race, tnow); }
    if (!race.podium) {
      Game.acc += dt;
      let n = 0;
      while (Game.acc >= STEP && n < 12) { step(STEP); Game.acc -= STEP; n++; }
      if (n >= 12) Game.acc = 0;
      for (const k of race.karts) k.visual(dt, Game.t);
    } else animatePodium(race, dt, Game.t);

    // festival fireworks over the sea
    const fw = Game.course().fireworks;
    race.skyT -= dt;
    if (fw && race.skyT <= 0) {
      race.skyT = race.mode === 'done' ? G.rand(0.6, 1.2) : G.rand(fw.every[0], fw.every[1]);
      for (let i = 0, n = race.mode === 'done' ? 2 : 1; i < n; i++) G.FX.firework(G.rand(fw.x[0], fw.x[1]), G.rand(fw.y[0], fw.y[1]), G.rand(fw.z[0], fw.z[1]), G.rand(2.2, 3));
    }

    if (race.mode === 'done') {
      race.doneT += dt;
      race.fireworkT -= dt;
      if (race.fireworkT <= 0 && race.doneT > 0.6) {
        race.fireworkT = G.rand(0.35, 0.8);
        const pnt = Track.at(G.rand(-40, 60), G.rand(-30, 30));
        if (Game.course().fireworks) G.FX.firework(pnt.x, pnt.y + G.rand(34, 55), pnt.z);
        else G.FX.bubbles(pnt.x, pnt.y + G.rand(2, 6), pnt.z, 40, 6);
        if (Math.random() < 0.7 && Game.course().fireworks) setTimeout(() => G.Audio.play('pop'), 500);
      }
      if (race.doneT > 3 && !race.resultsShown) {
        race.resultsShown = true;
        if (!race.online) Game.startPodium(race);
        G.UI.results(race);
        G.Audio.startMusic('menu');
      }
    }

    // player audio + screen effects
    const p = race.player;
    if (p && !race.attract) {
      G.Audio.setEngine(G.clamp(Math.abs(p.speed) / p.vmaxBase, 0, 1.4), G.Input.accel, p.boostT > 0, race.mode !== 'done');
      G.Audio.setSkid(race.mode === 'race' && p.drift.on && !p.air ? Math.max(1, p.drift.level) : 0);
      const boosting = p.boostT > 0 || p.happiT > 0;
      G.Post.radial = G.damp(G.Post.radial, race.mode === 'race' && boosting ? 1 : 0, 6, dt);
      G.Post.aberr = G.damp(G.Post.aberr, race.mode === 'race' && (boosting || p.spinT > 0) ? 1 : 0, 5, dt);
    } else { G.Post.radial = 0; G.Post.aberr = 0; }
  };

  /* ------------------------------------------------------------ camera */
  const _v = new T.Vector3(), _look = new T.Vector3();
  Game.updateCamera = function (dt) {
    const race = Game.race;
    const cam = Game.camera;
    if (!race) return;
    if (race.podium) return Game.podiumCamera(dt);
    const k = race.player;
    if (race.attract || !k) return Game.attractCamera(dt);
    const st = Game.camState || (Game.camState = { h: k.h, x: 0, y: 0, z: 0, fov: Game.baseFov, init: false });
    const travel = Math.hypot(k.vx, k.vz) > 3 ? Math.atan2(k.vx, k.vz) : k.h;
    const goalH = k.spinT > 0 ? st.h : G.wrapAng(travel - st.h) * 0.35 + G.wrapAng(k.h - st.h) * 0.65 + st.h;
    st.h += G.wrapAng(goalH - st.h) * (1 - Math.exp(-5 * dt));
    const spd = Math.abs(k.speed);
    const dist = 4.6 + G.clamp(spd / 30, 0, 1.2) * 1.0 + (k.boostT > 0 ? 0.5 : 0) + (k.rampAir ? 1.2 : 0);
    const hgt = 2.15 + G.clamp(spd / 30, 0, 1) * 0.3 + (k.rampAir ? 0.8 : 0);
    let gx = k.x - Math.sin(st.h) * dist, gz = k.z - Math.cos(st.h) * dist, gy = k.y + hgt + k.hopY * 0.55;

    if (race.mode === 'count' || race.mode === 'wait') {
      const e = G.clamp((race.count - 0.2) / 3.2, 0, 1);
      const ease = 1 - Math.pow(1 - e, 3);
      const ang = k.h + Math.PI * 0.82 * (1 - ease);
      const dd = G.lerp(7.5, dist, ease);
      gx = k.x - Math.sin(ang) * dd; gz = k.z - Math.cos(ang) * dd; gy = k.y + G.lerp(1.8, hgt, ease);
      st.x = gx; st.y = gy; st.z = gz; st.init = true;
    } else if (race.mode === 'done') {
      race.orbit = (race.orbit == null ? st.h : race.orbit) + dt * 0.35;
      gx = k.x - Math.sin(race.orbit) * 9; gz = k.z - Math.cos(race.orbit) * 9; gy = k.y + 3.4;
    }
    if (!st.init) { st.x = gx; st.y = gy; st.z = gz; st.init = true; }
    const lag = race.mode === 'done' ? 3 : 12;
    st.x = G.damp(st.x, gx, lag, dt);
    st.z = G.damp(st.z, gz, lag, dt);
    st.y = G.damp(st.y, gy, 8, dt);
    const gh = G.groundHeight(st.x, st.z) + 1.2;
    if (st.y < gh) st.y = gh;
    cam.position.set(st.x, st.y, st.z);
    Game.trauma = Math.max(0, Game.trauma - dt * 1.6);
    const sh = Game.trauma * Game.trauma;
    if (sh > 0) cam.position.add(_v.set(G.rand(-1, 1), G.rand(-1, 1), G.rand(-1, 1)).multiplyScalar(sh * 0.45));
    _look.set(k.x + Math.sin(st.h) * 3.0, k.y + 1.15 + k.hopY * 0.45, k.z + Math.cos(st.h) * 3.0);
    if (race.mode === 'count' || race.mode === 'wait' || race.mode === 'done') _look.set(k.x, k.y + 1.2, k.z);
    cam.lookAt(_look);
    const fovGoal = Game.baseFov + G.clamp(spd / k.vmaxBase, 0, 1.3) * 6 + (k.boostT > 0 || k.happiT > 0 ? 9 : 0);
    st.fov = G.damp(st.fov, fovGoal, 4, dt);
    cam.fov = st.fov;
    cam.updateProjectionMatrix();
  };

  Game.attractCamera = function (dt) {
    const race = Game.race, cam = Game.camera;
    const ac = Game.attractCam;
    ac.t += dt;
    if (ac.t > 7) {
      ac.t = 0;
      if (!ac.lock) ac.k = (ac.k + 3) % race.karts.length;
      ac.style = (ac.style + 1) % 3;
    }
    const k = race.karts[ac.k];
    let pos;
    if (ac.style === 0) {
      const a = k.h + Math.PI * 0.7 - ac.t * 0.1;
      pos = _v.set(k.x - Math.sin(a) * 9, k.y + 2.6, k.z - Math.cos(a) * 9);
    } else if (ac.style === 1) {
      pos = _v.set(k.x - Math.sin(k.h) * 9 + Math.cos(k.h) * 4, k.y + 3.4, k.z - Math.cos(k.h) * 9 - Math.sin(k.h) * 4);
    } else {
      const a = ac.t * 0.18;
      pos = _v.set(k.x + Math.cos(a) * 24, k.y + 13, k.z + Math.sin(a) * 24);
    }
    if (ac.t < 0.05 || !Game.camState) Game.camState = { x: pos.x, y: pos.y, z: pos.z };
    const st = Game.camState;
    st.x = G.damp(st.x, pos.x, 6, dt); st.y = G.damp(st.y, pos.y, 6, dt); st.z = G.damp(st.z, pos.z, 6, dt);
    cam.position.set(st.x, Math.max(st.y, G.groundHeight(st.x, st.z) + 1.2), st.z);
    cam.lookAt(k.x, k.y + 1.1, k.z);
    cam.fov = Game.baseFov;
    cam.updateProjectionMatrix();
  };

  Game.podiumCamera = function (dt) {
    const race = Game.race, cam = Game.camera;
    const g = Game.world.podium.grp;
    const t = race.podiumT;
    const a = g.rotation.y + Math.sin(t * 0.25) * 0.45;
    const wide = window.innerWidth > window.innerHeight * 1.2;
    const dist = 15 - Math.min(t, 3) * 0.8;
    const side = wide ? 3.6 : 0;
    const cx = g.position.x + Math.sin(a) * dist + Math.cos(g.rotation.y) * side;
    const cz = g.position.z + Math.cos(a) * dist - Math.sin(g.rotation.y) * side;
    cam.position.set(cx, g.position.y + 4.6, cz);
    cam.lookAt(g.position.x + Math.cos(g.rotation.y) * side, g.position.y + 2.4, g.position.z - Math.sin(g.rotation.y) * side);
    cam.fov = Game.baseFov;
    cam.updateProjectionMatrix();
  };

  /* ------------------------------------------------------------ loop */
  let last = 0;
  Game.frame = function (now) {
    requestAnimationFrame(Game.frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    Game.t += dt;
    try {
      Game.update(dt);
      Game.updateCamera(dt);
      const race = Game.race;
      const focus = race && (race.podium ? Game.world.podium.grp.position : race.player || race.karts[Game.attractCam ? Game.attractCam.k : 0]);
      G.World.update(Game.world, dt, Game.t, focus);
      G.FX.update(dt, Game.camera, Game.renderer);
      G.Post.render(Game.scene, Game.camera, dt);
      G.UI.frame(dt);
      Game.adapt(dt);
    } catch (e) {
      if (!Game._errShown) {
        Game._errShown = true;
        console.error(e);
        const el = document.getElementById('err');
        el.hidden = false;
        el.textContent = '描画中にエラーが出ました：' + e.message;
      }
    }
  };

  // keep frame rate smooth: lower resolution first, then drop the glow pass
  Game.adapt = function (dt) {
    const ft = Game.frameTimes;
    ft.push(dt);
    if (ft.length < 90) return;
    const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
    ft.length = 0;
    const max = Math.min(window.devicePixelRatio || 1, 1.75);
    let pr = Game.pixelRatio;
    if (avg > 1 / 45) {
      if (pr > 0.85) pr = Math.max(0.85, pr - 0.15);
      else if (G.Post.enabled && ++Game.slowStrikes >= 2) { G.Post.enabled = false; G.UI.syncQuality && G.UI.syncQuality(); }
    } else if (avg < 1 / 57 && pr < max) pr = Math.min(max, pr + 0.1);
    if (pr !== Game.pixelRatio) {
      Game.pixelRatio = pr;
      Game.renderer.setPixelRatio(pr);
      Game.resize();
    }
  };
})();
