/* 汐風GP — menus, HUD, minimap, speed lines, boot */
(function () {
  'use strict';
  const G = window.G;
  const Track = G.Track;
  const $ = (id) => document.getElementById(id);
  const Game = G.Game;
  const STAT_LABEL = { speed: 'スピード', accel: '加速', handling: 'ハンドル', weight: '重さ' };
  const ORD = (n) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

  const UI = (G.UI = { portraits: {}, lastPos: 0, lastItem: '', lastLaps: -1 });

  /* ------------------------------------------------ title */
  UI.buildTitle = function () {
    const roster = $('roster');
    roster.innerHTML = '';
    for (const c of G.CHARS) {
      const b = document.createElement('button');
      b.className = 'racer';
      b.dataset.id = c.id;
      b.style.setProperty('--chip', c.kart);
      b.setAttribute('aria-pressed', String(c.id === Game.settings.char));
      const src = UI.portraits[c.id];
      b.innerHTML = (src ? '<img alt="" src="' + src + '">' : '<span class="ph"></span>') + '<b>' + c.name + '</b><span class="kind">' + c.kind + '</span>';
      b.addEventListener('click', () => UI.selectChar(c.id));
      roster.appendChild(b);
    }
    document.querySelectorAll('#seg button').forEach((b) => {
      b.setAttribute('aria-pressed', String(+b.dataset.d === Game.settings.cls));
      b.onclick = () => {
        if (UI.isGuest()) return;
        Game.settings.cls = +b.dataset.d;
        G.store.set('shiokaze.cls', Game.settings.cls);
        document.querySelectorAll('#seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        G.Audio.play('ui');
        UI.showBest();
        if (G.Net.isHost) G.Net.hostSync();
      };
    });
    UI.selectChar(Game.settings.char, true);
    UI.showBest();
  };
  UI.selectChar = function (id, silent) {
    Game.settings.char = id;
    if (!silent && G.Game.focusChar) G.Game.focusChar(id);
    G.store.set('shiokaze.char', id);
    if (G.Net && G.Net.inRoom()) { G.Net.setChar(id); UI.renderLobby(); }
    document.querySelectorAll('.racer').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    const c = G.CHARS.find((x) => x.id === id);
    let html = '<div class="nm"><b>' + c.name + '</b><span>' + c.kind + '｜' + c.line + '</span></div>';
    for (const k of ['speed', 'accel', 'handling', 'weight']) {
      html += '<label>' + STAT_LABEL[k] + '</label><div class="bar" aria-label="' + STAT_LABEL[k] + ' ' + c.stats[k] + '/5">';
      for (let i = 1; i <= 5; i++) html += '<i class="' + (i <= c.stats[k] ? 'on' : '') + '"></i>';
      html += '</div>';
    }
    $('detail').innerHTML = html;
    if (!silent) G.Audio.play('ui');
  };
  UI.showBest = function () {
    const best = G.store.get('shiokaze.best', {});
    let v = best[Game.bestKey()];
    if (v == null && Game.settings.course === 'shiokaze') v = best[String(Game.settings.cls)];
    const cls = G.CLASSES[Game.settings.cls];
    $('best').textContent = 'ベスト（' + cls.cc + '） ' + (v ? G.fmt(v) : '―');
  };

  /* ------------------------------------------------ course picker */
  function drawCourseMap(cv, course) {
    const curve = new THREE.CatmullRomCurve3(course.ctrl.map((p) => new THREE.Vector3(p[0], p[1], p[2])), true, 'centripetal');
    const pts = curve.getSpacedPoints(180);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 16;
    const sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
    const ox = W / 2 - ((minX + maxX) / 2) * sc, oz = H / 2 - ((minZ + maxZ) / 2) * sc;
    g.clearRect(0, 0, W, H);
    g.lineJoin = 'round'; g.lineCap = 'round';
    const path = () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(ox + p.x * sc, oz + p.z * sc) : g.moveTo(ox + p.x * sc, oz + p.z * sc))); g.closePath(); };
    path(); g.strokeStyle = 'rgba(12,8,24,.85)'; g.lineWidth = 13; g.stroke();
    // colour by elevation: low = course colour, high = paper
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const k = maxY - minY > 1 ? (a.y - minY) / (maxY - minY) : 0;
      g.strokeStyle = k > 0.5 ? '#fff6ea' : course.color;
      g.globalAlpha = 0.55 + 0.45 * Math.abs(k - 0.5) * 2;
      g.lineWidth = 6;
      g.beginPath(); g.moveTo(ox + a.x * sc, oz + a.z * sc); g.lineTo(ox + b.x * sc, oz + b.z * sc); g.stroke();
    }
    g.globalAlpha = 1;
    const s0 = pts[0], s1 = pts[1];
    const nx = -(s1.z - s0.z), nz = s1.x - s0.x, nl = Math.hypot(nx, nz) || 1;
    g.strokeStyle = '#fff6ea'; g.lineWidth = 4;
    g.beginPath();
    g.moveTo(ox + s0.x * sc + (nx / nl) * 8, oz + s0.z * sc + (nz / nl) * 8);
    g.lineTo(ox + s0.x * sc - (nx / nl) * 8, oz + s0.z * sc - (nz / nl) * 8);
    g.stroke();
  }
  UI.buildCourses = function () {
    const box = $('courses');
    box.innerHTML = '';
    for (const c of G.COURSES) {
      const b = document.createElement('button');
      b.className = 'course';
      b.dataset.id = c.id;
      b.style.setProperty('--cc', c.color);
      b.setAttribute('aria-pressed', String(c.id === Game.settings.course));
      b.innerHTML = '<canvas width="240" height="150" aria-hidden="true"></canvas><b>' + c.name + '</b><span>' + c.tag + '</span>';
      drawCourseMap(b.querySelector('canvas'), c);
      b.addEventListener('click', () => UI.selectCourse(c.id));
      box.appendChild(b);
    }
  };
  UI.selectCourse = function (id) {
    if (UI.switching || id === Game.settings.course || UI.isGuest()) return;
    UI.switching = true;
    G.Audio.play('ui');
    document.querySelectorAll('.course').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.id === id)));
    const ld = $('loading');
    ld.hidden = false;
    ld.classList.remove('done');
    ld.querySelector('span').textContent = (G.COURSES.find((c) => c.id === id) || {}).name || '';
    // let the veil paint before the heavy rebuild
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try {
        Game.setCourse(id);
        UI.initMap();
        Game.newRace(true);
        G.Audio.startMusic('menu');
        UI.showBest();
        if (G.Net.isHost) G.Net.hostSync();
      } finally {
        ld.classList.add('done');
        setTimeout(() => { ld.hidden = true; UI.switching = false; }, 450);
      }
    }));
  };
  UI.updateMute = function () {
    const m = G.Audio.muted;
    $('mute').innerHTML = '<svg><use href="#' + (m ? 'i-mute' : 'i-sound') + '"/></svg><span>サウンド ' + (m ? 'OFF' : 'ON') + '</span>';
  };

  UI.showTitle = function () {
    if (Game.race && Game.race.online) G.Net.backToLobby();
    $('waitPill').hidden = true;
    $('title').hidden = false;
    $('pause').hidden = true;
    $('results').hidden = true;
    $('hud').classList.remove('on');
    $('touch').classList.remove('on');
    G.Audio.stopEngine();
    Game.newRace(true);
    G.Audio.startMusic('menu');
    UI.showBest();
    UI.renderLobby();
    setTimeout(() => { const s = $('start'); if (s && !$('title').hidden && !s.disabled) s.focus({ preventScroll: true }); }, 50);
  };

  UI.startRace = function () {
    G.Audio.unlock();
    G.Audio.play('ui');
    $('title').hidden = true;
    $('results').hidden = true;
    $('pause').hidden = true;
    G.Audio.stopMusic(true);
    Game.newRace(false);
    UI.toast(Game.course().name);
    G.Audio.startEngine();
    hudOn();
  };
  function hudOn() {
    $('hud').classList.add('on');
    if (G.isTouch) $('touch').classList.add('on');
    G.Input.autoAccel = G.isTouch;
    $('itemKey').textContent = G.isTouch ? 'ITEM' : 'E / X';
    UI.lastLaps = -1;
    UI.lastPos = 0;
    UI.lastItem = '';
    UI.warns = [];
    UI.inkT = 0;
    $('ink').hidden = true;
    $('warn').hidden = true;
    $('wrong').hidden = true;
    $('itemTimer').hidden = true;
    UI.buildRanks(Game.race);
    $('lapList').innerHTML = '';
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
  }

  function setupPause(online) {
    $('pauseTitle').textContent = online ? 'メニュー' : 'ポーズ';
    $('pauseLead').hidden = !online;
    $('restart').hidden = online;
    $('leaveRoom').hidden = !online;
    $('quit').textContent = online ? (G.Net.isHost ? 'レースを終えてロビーへ' : 'リタイアしてロビーへ') : 'タイトルへ';
    $('quit').classList.toggle('wide', !online);
    $('resume').classList.toggle('wide', online);
  }
  UI.pause = function (on) {
    const race = Game.race;
    if (!race || race.attract) return;
    if (race.online) {
      // the race keeps running for everyone else: this is only a menu
      const open = !$('pause').hidden;
      if (!on || open) { $('pause').hidden = true; return; }
      setupPause(true);
      $('pause').hidden = false;
      G.Input.clearTouch();
      setTimeout(() => $('resume').focus({ preventScroll: true }), 30);
      return;
    }
    setupPause(false);
    if (on) {
      if (race.mode === 'paused') return;
      race.prevMode = race.mode;
      race.mode = 'paused';
      $('pause').hidden = false;
      G.Audio.setEngine(0, 0, false, false);
      if (G.Audio.music) G.Audio.music.gain.setTargetAtTime(0.08, G.Audio.now(), 0.1);
      G.Input.clearTouch();
      setTimeout(() => $('resume').focus({ preventScroll: true }), 30);
    } else {
      if (race.mode !== 'paused') return;
      race.mode = race.prevMode;
      $('pause').hidden = true;
      if (G.Audio.music) G.Audio.music.gain.setTargetAtTime(0.32, G.Audio.now(), 0.1);
      Game.acc = 0;
    }
  };

  /* ------------------------------------------------ banner / toast */
  let bannerTimer = 0;
  UI.banner = function (text, cls) {
    const b = $('banner');
    b.className = 'banner';
    void b.offsetWidth;
    b.textContent = text;
    b.className = 'banner show ' + (cls || '').split(' ').filter(Boolean).map((c) => 'b-' + c).join(' ');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { b.className = 'banner'; }, 1100);
  };
  let toastTimer = 0;
  UI.toast = function (text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  };

  /* ------------------------------------------------ results */
  UI.results = function (race, refresh) {
    $('again').parentElement.hidden = !!race.online;
    $('resOnline').hidden = !race.online;
    if (race.online) return onlineResults(race, refresh);
    const p = race.player;
    const all = race.karts.slice().sort((a, b) => (a.finished ? a.finishTime : a.estTime) - (b.finished ? b.finishTime : b.estTime));
    const rank = all.indexOf(p) + 1;
    $('resTitle').innerHTML = rank + '<small>' + ORD(rank) + '</small>';
    const lead = rank === 1 ? '優勝！ ' + Game.course().name + 'をいちばんに駆け抜けました。' : rank <= 3 ? rank + '位で表彰台！ あと少しで頂点です。' : rank + '位。ドリフトのミニターボで差を詰めよう。';
    $('resLead').textContent = lead + (race.newBest ? '　ベストタイム更新！' : '');
    const body = $('resBody');
    body.innerHTML = '';
    all.forEach((k, i) => {
      const tr = document.createElement('tr');
      if (k === p) tr.className = 'me';
      const t = k.finished ? k.finishTime : k.estTime;
      const src = UI.portraits[k.c.id];
      tr.innerHTML = '<td class="rk r' + (i + 1) + '">' + (i + 1) + '</td>' +
        '<td class="who">' + (src ? '<img alt="" src="' + src + '">' : '') + '<span>' + k.c.name + '</span>' + (k === p ? '<span class="you">YOU</span>' : '') + '</td>' +
        '<td class="tm">' + G.fmt(t) + '</td>';
      body.appendChild(tr);
    });
    $('results').hidden = false;
    $('ink').hidden = true;
    UI.inkT = 0;
    $('hud').classList.remove('on');
    $('touch').classList.remove('on');
    setTimeout(() => $('again').focus({ preventScroll: true }), 50);
  };

  /* ------------------------------------------------ online results */
  function onlineResults(race, refresh) {
    const Net = G.Net;
    const p = race.player;
    const fin = race.karts.filter((k) => k.finished).sort((a, b) => a.finishTime - b.finishTime);
    const run = race.karts.filter((k) => !k.finished).sort((a, b) => b.progress - a.progress);
    const all = fin.concat(run);
    const rank = all.indexOf(p) + 1;
    const left = run.filter((k) => k.human).length;
    if (!refresh) race.resAt = performance.now();
    const waitS = Math.max(0, Math.ceil(20 - (performance.now() - (race.resAt || 0)) / 1000));
    const hostWait = Net.isHost && left > 0 && waitS > 0;
    const sig = all.map((k) => k.key + ':' + (k.finished ? k.finishTime : k.lap)).join('|') + '/' + left + '/' + (hostWait ? waitS : -1) + '/' + Net.isHost;
    if (refresh && sig === UI.resSig) return;
    UI.resSig = sig;
    $('resTitle').innerHTML = rank + '<small>' + ORD(rank) + '</small>';
    const humans = race.karts.filter((k) => k.human).length;
    let lead = rank === 1 ? (humans > 1 ? '優勝！ みんなの中でいちばん速かった！' : '優勝！ ' + Game.course().name + 'を制覇しました。') : rank <= 3 ? rank + '位で表彰台！' : rank + '位。ミニターボで差を詰めよう。';
    if (left) lead += '　まだ' + left + '人が走っています…';
    $('resLead').textContent = lead;
    const body = $('resBody');
    body.innerHTML = '';
    all.forEach((k, i) => {
      const tr = document.createElement('tr');
      if (k === p) tr.className = 'me';
      const src = UI.portraits[k.c.id];
      const nm = k.human ? k.netName || Net.nameOf(k.key, k.c.name) : k.c.name;
      const lap = G.clamp(k.lap, 1, race.laps);
      tr.innerHTML = '<td class="rk r' + (i + 1) + '">' + (i + 1) + '</td>' +
        '<td class="who">' + (src ? '<img alt="" src="' + src + '">' : '') + '<span></span>' + (k === p ? '<span class="you">YOU</span>' : k.human ? '' : '<span class="tag">CPU</span>') + '</td>' +
        (k.finished ? '<td class="tm">' + G.fmt(k.finishTime) + '</td>' : '<td class="tm run">LAP ' + lap + '/' + race.laps + '</td>');
      tr.querySelector('.who span').textContent = nm;
      body.appendChild(tr);
    });
    const tl = $('toLobby');
    tl.disabled = hostWait;
    tl.textContent = hostWait ? 'みんなのゴール待ち… ' + waitS : 'ロビーへもどる';
    if (!refresh) {
      $('results').hidden = false;
      $('ink').hidden = true;
      UI.inkT = 0;
      $('hud').classList.remove('on');
      $('touch').classList.remove('on');
      if (!tl.disabled) setTimeout(() => tl.focus({ preventScroll: true }), 50);
    } else if (!hostWait && UI.resHostWait) setTimeout(() => { if (!$('results').hidden) tl.focus({ preventScroll: true }); }, 30);
    UI.resHostWait = hostWait;
  }
  UI.resultsPrimary = function () {
    const race = Game.race;
    if (race && race.online) { if (!$('toLobby').disabled) UI.toLobby(); }
    else UI.startRace();
  };
  UI.toLobby = function () {
    G.Audio.play('ui');
    if (G.Net.isHost) G.Net.hostLobby();
    UI.showTitle();
  };
  UI.leaveRoom = function () {
    G.Net.leave();
    UI.toast('部屋を出ました');
    UI.showTitle();
  };

  /* ------------------------------------------------ online lobby */
  UI.mode = () => (Game.settings.mode === 'online' ? 'online' : 'solo');
  UI.isGuest = () => UI.mode() === 'online' && G.Net.inRoom() && !G.Net.isHost;
  UI.setMode = function (m) {
    if (m === UI.mode()) return;
    if (m === 'solo' && G.Net.inRoom()) { G.Net.leave(); UI.toast('部屋を出ました'); }
    Game.settings.mode = m;
    G.Audio.play('ui');
    UI.renderLobby();
    if (m === 'online' && G.Net.available && !G.Net.inRoom()) setTimeout(() => { const b = $('lbMake'); if (b) b.focus({ preventScroll: true }); }, 30);
  };
  UI.primary = function () {
    if (UI.mode() !== 'online') return UI.startRace();
    const Net = G.Net;
    if (Net.inRoom() && Net.isHost && myIndex() < 8) { G.Audio.unlock(); G.Audio.play('ui'); Net.hostStart(); }
  };
  function myIndex() {
    return G.Net.members().findIndex((p) => p.sameTab);
  }
  function racing(hs) { return hs && (hs.ph === 'prep' || hs.ph === 'count' || hs.ph === 'race'); }

  const face = (id) => UI.portraits[id] || '';
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function renderStart(online) {
    const Net = G.Net;
    const b = $('start');
    let label = 'レーススタート', dis = false, wait = false, n = '';
    if (online) {
      if (Net.available === false) { label = 'オンラインは使えません'; dis = true; }
      else if (!Net.inRoom()) { label = '部屋に入るとスタートできます'; dis = true; }
      else if (myIndex() >= 8) { label = '満員です（8人まで）'; dis = true; }
      else if (!Net.isHost) { label = racing(Net.hs) ? 'レース中…次から参加できます' : 'ホストのスタートを待っています'; dis = true; wait = true; }
      else { label = 'みんなでスタート'; n = Math.min(8, Net.members().length) + '人'; }
    }
    const sig = label + dis + wait + n;
    if (b.dataset.sig === sig) return;
    b.dataset.sig = sig;
    b.disabled = dis;
    b.classList.toggle('wait', wait);
    b.innerHTML = '<svg><use href="#i-play"/></svg><span>' + label + '</span>' + (n ? '<span class="n">' + n + '</span>' : '');
  }

  UI.renderLobby = function () {
    const box = $('lobby');
    if (!box || !G.Net) return;
    const Net = G.Net;
    const online = UI.mode() === 'online';
    const inRoom = online && Net.inRoom();
    const guest = inRoom && !Net.isHost;
    const hs = Net.hs;
    $('panel').classList.toggle('online', online);
    document.querySelectorAll('#modes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === (online ? 'online' : 'solo'))));
    box.hidden = !online;
    // guests see the host's course and class
    const co = guest && hs && hs.co ? hs.co : Game.settings.course;
    const cl = guest && hs && hs.cl != null ? hs.cl : Game.settings.cls;
    document.querySelectorAll('.course').forEach((b) => { b.disabled = guest; b.setAttribute('aria-pressed', String(b.dataset.id === co)); });
    document.querySelectorAll('#seg button').forEach((b) => { b.disabled = guest; b.setAttribute('aria-pressed', String(+b.dataset.d === cl)); });
    $('seg').classList.toggle('locked', guest);
    $('cnote').hidden = !guest;
    $('clsNote').textContent = guest ? 'ホストが決めます' : 'DIFFICULTY';
    renderStart(online);
    if (!online) { box.dataset.sig = ''; return; }

    const mem = inRoom ? Net.members() : [];
    const cpuOn = inRoom ? (guest ? !!(hs && hs.cpu) : !!Game.settings.cpu) : true;
    const sig = JSON.stringify([Net.available, inRoom, Net.code, Net.isHost, Net.status, UI.netBusy, Net.connected !== false, cpuOn, racing(hs),
      Net.key, Game.settings.lock, !!UI.invited,
      mem.map((p) => [p.peer, p.presence.ch, p.presence.nm || '', p.sameTab ? 1 : 0, p.peer === Net.hostPeer ? 1 : 0])]);
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;

    const st = '<p class="lb-status" role="status">' + esc(Net.status || '') + '</p>';
    if (Net.available === null) { box.innerHTML = '<p class="lb-msg">オンラインに接続できるか確認しています…</p>'; return; }
    if (Net.available === false) {
      box.innerHTML = '<p class="lb-msg"><b>このブラウザではオンライン対戦を使えません。</b><br>Chrome・Safari・Edge の最新版で開いてください。</p>';
      return;
    }
    if (!inRoom) {
      const val = (id, fb) => { const el = $(id); return el ? el.value : fb; };
      const pf = UI.prefill || {};
      const prev = { code: val('lbCode', pf.code || ''), key: val('lbKey', pf.key || ''), name: val('lbName', Game.settings.nick || '') };
      UI.prefill = null;
      const focusId = document.activeElement && ['lbCode', 'lbKey', 'lbName'].includes(document.activeElement.id) ? document.activeElement.id : '';
      const dis = UI.netBusy ? ' disabled' : '';
      const ch = G.CHARS.find((c) => c.id === Game.settings.char) || G.CHARS[0];
      const lock = !!Game.settings.lock;
      box.innerHTML =
        '<div class="lb-name"><label for="lbName">なまえ</label><input id="lbName" maxlength="10" autocomplete="off" enterkeyhint="done" placeholder="' + esc(ch.name) + '"' + dis + '></div>' +
        '<div class="lb-join' + (UI.invited ? ' invited' : '') + '">' +
          '<div class="lb-new">' +
            '<button class="lb-make" id="lbMake"' + dis + '><svg><use href="#i-plus"/></svg><b>部屋をつくる</b><small>' + (lock ? '番号と鍵ができます' : '番号ができます') + '</small></button>' +
            '<button class="switch" id="lbLock" role="switch" aria-checked="' + lock + '"' + dis + '><i></i>' + (lock ? '鍵をかける' : '鍵なし（だれでも参加）') + '</button>' +
          '</div>' +
          '<span class="lb-or">または</span>' +
          '<form class="lb-code" id="lbForm" autocomplete="off">' +
            '<label><small>部屋番号</small><input id="lbCode" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="0000"' + dis + '></label>' +
            '<label><small>鍵</small><input id="lbKey" inputmode="numeric" pattern="[0-9]*" maxlength="4" placeholder="----"' + dis + '></label>' +
            '<button id="lbJoin"' + (UI.invited ? ' class="hot"' : '') + dis + '>参加</button>' +
          '</form>' +
        '</div>' + st +
        (UI.invited ? '<p class="lb-msg lb-invite"><b>招待された部屋です。</b>なまえとキャラをえらんで「参加」を押してね。<button class="lb-alt" id="lbNoInvite">自分で部屋をつくる</button></p>'
          : '<p class="lb-msg">部屋番号と鍵を伝えるか、招待リンクを送って最大8人で走ろう。</p>');
      $('lbCode').value = prev.code;
      $('lbKey').value = prev.key;
      $('lbName').value = prev.name;
      if (focusId) $(focusId).focus({ preventScroll: true });
      return;
    }
    let li = '';
    mem.slice(0, 8).forEach((p) => {
      const ch = G.CHARS.find((c) => c.id === p.presence.ch) || G.CHARS[0];
      const me = p.sameTab;
      const host = p.peer === Net.hostPeer;
      const name = Net.nameOf(p.peer, me ? 'あなた' : ch.name);
      const role = me ? 'あなた' : host ? 'ホスト' : ch.name;
      li += '<li class="' + (me ? 'me' : '') + '" style="--c:' + ch.kart + '">' + (host ? '<svg class="cr" aria-label="ホスト"><use href="#i-crown"/></svg>' : '') +
        '<img class="fc" alt="" src="' + face(ch.id) + '"><span><b>' + esc(name) + '</b><em>' + esc(role) + '</em></span></li>';
    });
    for (let i = Math.min(8, mem.length); i < 8; i++) li += cpuOn ? '<li class="slot cpu"><svg><use href="#i-cpu"/></svg><span>CPU</span></li>' : '<li class="slot"><span>あき</span></li>';
    let hint;
    if (myIndex() >= 8) hint = '満員です。だれかが抜けると走れます';
    else if (guest) hint = racing(hs) ? 'いまレース中。次のレースから参加できます' : 'ホストのスタートを待っています';
    else hint = mem.length < 2 ? (Net.key ? '招待リンクか、番号と鍵を伝えよう' : '招待リンクか、番号を伝えよう') : '準備ができたらスタート！';
    box.innerHTML = '<div class="lb-head"><span class="lb-dot' + (Net.connected === false ? ' off' : '') + '" title="' + (Net.connected === false ? '再接続中' : '接続中') + '"></span>' +
      '<div class="lb-room"><small>ROOM</small><b>' + esc(Net.code) + '</b>' +
        (Net.key ? '<span class="lb-keyb" title="鍵"><svg><use href="#i-lock"/></svg>' + esc(Net.key) + '</span>' : '<span class="lb-keyb open"><svg><use href="#i-unlock"/></svg>鍵なし</span>') + '</div>' +
      '<button class="ghost" id="lbCopy"><svg><use href="#i-link"/></svg>招待</button>' +
      '<button class="ghost" id="lbLeave"><svg><use href="#i-door"/></svg>退出</button></div>' +
      '<ul class="lb-mem" aria-label="参加者">' + li + '</ul>' +
      '<div class="lb-foot"><span>' + esc(hint) + '</span>' +
      '<button class="switch" id="lbCpu" role="switch" aria-checked="' + cpuOn + '"' + (guest ? ' disabled' : '') + '><i></i>CPU</button></div>' + st;
  };

  async function lobbyJoin(create) {
    if (UI.netBusy) return;
    const code = $('lbCode') ? $('lbCode').value : '';
    const key = $('lbKey') ? $('lbKey').value : '';
    G.Audio.unlock();
    G.Audio.play('ui');
    UI.netBusy = true;
    UI.renderLobby();
    const ok = create ? await G.Net.create(!!Game.settings.lock) : (await G.Net.join(code, false, key)) === true;
    UI.netBusy = false;
    if (ok) {
      UI.invited = false;
      UI.toast(create ? '部屋 ' + G.Net.code + ' をつくりました' : '部屋 ' + G.Net.code + ' に入りました');
    }
    UI.renderLobby();
  }
  function shareInvite() {
    const Net = G.Net;
    const url = Net.inviteUrl();
    const text = '汐風GPで一緒に走ろう！ 部屋 ' + Net.code + (Net.key ? '・鍵 ' + Net.key : '');
    const ok = () => UI.toast('招待リンクをコピーしました');
    const ng = () => UI.toast('部屋 ' + Net.code + (Net.key ? '・鍵 ' + Net.key : '') + ' を伝えてね');
    if (G.isTouch && navigator.share) {
      navigator.share({ title: '汐風GP', text, url }).catch(() => {});
      return;
    }
    try { navigator.clipboard.writeText(text + '\n' + url).then(ok, ng); } catch (err) { ng(); }
  }
  // links like …#room=1234&key=5678 open straight into the online lobby
  UI.readInvite = function () {
    try {
      const h = new URLSearchParams(location.hash.replace(/^#/, ''));
      const code = (h.get('room') || '').replace(/\D/g, '').slice(0, 4);
      if (code.length !== 4) return;
      UI.prefill = { code, key: (h.get('key') || '').replace(/\D/g, '').slice(0, 4) };
      UI.invited = true;
      if (G.Net) G.Net.status = '';
      Game.settings.mode = 'online';
    } catch (e) {}
  };
  // an invite link opened while the game is already up
  window.addEventListener('hashchange', () => {
    if (G.Net.inRoom()) return;
    UI.readInvite();
    if (!UI.prefill) return;
    const pf = UI.prefill;
    if ($('lbCode')) { $('lbCode').value = pf.code; $('lbKey').value = pf.key; UI.prefill = null; }
    if ($('title').hidden === false) UI.renderLobby();
  });
  function wireLobby() {
    document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => UI.setMode(b.dataset.m)));
    const box = $('lobby');
    box.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t || t.disabled) return;
      if (t.id === 'lbMake') { e.preventDefault(); lobbyJoin(true); }
      else if (t.id === 'lbLeave') { G.Net.leave(); G.Audio.play('ui'); UI.toast('部屋を出ました'); }
      else if (t.id === 'lbCopy') shareInvite();
      else if (t.id === 'lbNoInvite') { UI.invited = false; G.Net.status = ''; G.Audio.play('ui'); UI.renderLobby(); }
      else if (t.id === 'lbLock') {
        Game.settings.lock = !Game.settings.lock;
        G.store.set('shiokaze.lock', Game.settings.lock);
        G.Audio.play('ui');
        UI.renderLobby();
      } else if (t.id === 'lbCpu') {
        Game.settings.cpu = !Game.settings.cpu;
        G.store.set('shiokaze.cpu', Game.settings.cpu);
        G.Audio.play('ui');
        G.Net.hostSync();
        UI.renderLobby();
      }
    });
    box.addEventListener('submit', (e) => { e.preventDefault(); lobbyJoin(false); });
    box.addEventListener('input', (e) => {
      const id = e.target.id;
      if (id === 'lbCode' || id === 'lbKey') {
        const v = e.target.value.replace(/\D/g, '').slice(0, 4);
        if (v !== e.target.value) e.target.value = v;
      } else if (id === 'lbName') {
        Game.settings.nick = G.Net.cleanName(e.target.value);
        G.store.set('shiokaze.nick', Game.settings.nick);
      }
    });
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.id === 'lbName') { e.preventDefault(); e.target.blur(); }
    });
  }

  /* ------------------------------------------------ online race hooks */
  UI.withVeil = function (fn, label) {
    const ld = $('loading');
    ld.hidden = false;
    ld.classList.remove('done');
    ld.querySelector('span').textContent = label || '';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { fn(); } finally {
        ld.classList.add('done');
        setTimeout(() => { if (ld.classList.contains('done')) ld.hidden = true; }, 450);
      }
    }));
  };
  UI.enterOnlineRace = function () {
    G.Audio.unlock();
    $('title').hidden = true;
    $('results').hidden = true;
    $('pause').hidden = true;
    G.Audio.stopMusic(true);
    G.Audio.startEngine();
    hudOn();
    UI.toast(Game.course().name);
    $('waitPill').hidden = false;
    UI.resSig = '';
  };
  UI.onHostLobby = function () {
    const race = Game.race;
    if (!race || !race.online || !$('title').hidden) return;
    const p = race.player;
    UI.toast(p && !p.finished ? 'ホストがレースを終了しました' : 'ロビーにもどりました');
    UI.showTitle();
  };

  /* ------------------------------------------------ name tags over other players */
  G.makeNameTag = function (text, color) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 128;
    const g = cv.getContext('2d');
    g.font = '800 52px "M PLUS Rounded 1c","Hiragino Maru Gothic ProN","Hiragino Sans",sans-serif';
    let label = String(text || '');
    while (label.length > 1 && g.measureText(label).width > 400) label = label.slice(0, -2) + '…';
    const tw = g.measureText(label).width;
    const w = Math.max(120, tw + 60), h = 80, x = (512 - w) / 2, y = 8;
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, h / 2); else g.rect(x, y, w, h);
    g.fillStyle = 'rgba(28,19,48,.88)';
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = color;
    g.stroke();
    g.beginPath(); g.moveTo(256 - 15, y + h + 2); g.lineTo(256, y + h + 26); g.lineTo(256 + 15, y + h + 2); g.closePath();
    g.fillStyle = color; g.fill();
    g.fillStyle = '#fff6ea';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, 256, y + h / 2 + 3);
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 4;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
    sp.scale.set(3.4, 0.85, 1);
    sp.position.set(0, 3.7, 0);
    sp.renderOrder = 6;
    return sp;
  };

  /* ------------------------------------------------ minimap */
  const map = { ctx: null, path: null, scale: 1, ox: 0, oz: 0 };
  UI.initMap = function () {
    const c = $('map');
    map.ctx = c.getContext('2d');
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < Track.N; i++) {
      minX = Math.min(minX, Track.px[i]); maxX = Math.max(maxX, Track.px[i]);
      minZ = Math.min(minZ, Track.pz[i]); maxZ = Math.max(maxZ, Track.pz[i]);
    }
    const W = c.width, pad = 34;
    map.scale = (W - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    map.ox = W / 2 - ((minX + maxX) / 2) * map.scale;
    map.oz = W / 2 - ((minZ + maxZ) / 2) * map.scale;
  };
  const mx = (x) => map.ox + x * map.scale;
  const mz = (z) => map.oz + z * map.scale;
  function drawMap(race) {
    const g = map.ctx, W = g.canvas.width;
    g.clearRect(0, 0, W, W);
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath();
    for (let i = 0; i <= Track.N; i += 2) {
      const k = i % Track.N;
      i ? g.lineTo(mx(Track.px[k]), mz(Track.pz[k])) : g.moveTo(mx(Track.px[k]), mz(Track.pz[k]));
    }
    g.closePath();
    g.strokeStyle = 'rgba(28,19,48,.85)'; g.lineWidth = 26; g.stroke();
    g.strokeStyle = '#fff6ea'; g.lineWidth = 14; g.stroke();
    g.strokeStyle = 'rgba(164,147,255,.55)'; g.lineWidth = 4; g.stroke();
    // start line
    const s0 = Track.at(0, -10), s1 = Track.at(0, 10);
    g.strokeStyle = '#1c1330'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(mx(s0.x), mz(s0.z)); g.lineTo(mx(s1.x), mz(s1.z)); g.stroke();
    // karts (player last so it sits on top)
    const ks = race.karts.slice().sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    for (const k of ks) {
      const x = mx(k.x), y = mz(k.z);
      if (k.isPlayer) {
        g.save();
        g.translate(x, y);
        g.rotate(-k.h + Math.PI);
        g.beginPath(); g.moveTo(0, 17); g.lineTo(12, -11); g.lineTo(0, -5); g.lineTo(-12, -11); g.closePath();
        g.fillStyle = k.c.kart; g.fill();
        g.lineWidth = 5; g.strokeStyle = '#1c1330'; g.stroke();
        g.restore();
      } else {
        const hu = race.online && k.human;
        g.beginPath(); g.arc(x, y, hu ? 11 : 9, 0, Math.PI * 2);
        g.fillStyle = k.c.kart; g.fill();
        g.lineWidth = 4; g.strokeStyle = '#1c1330'; g.stroke();
        if (hu) { g.beginPath(); g.arc(x, y, 15, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = '#fff6ea'; g.stroke(); }
      }
    }
  }

  /* ------------------------------------------------ speed lines */
  const lines = [];
  for (let i = 0; i < 46; i++) lines.push({ a: Math.random() * Math.PI * 2, r: Math.random(), l: Math.random(), w: Math.random() });
  let fxDirty = false;
  function drawSpeedLines(k, dt) {
    const c = $('fx'), g = c.getContext('2d');
    const boost = k.boostT > 0 ? 1 : 0;
    const fast = G.clamp((Math.abs(k.speed) / k.vmaxBase - 0.9) * 4, 0, 1);
    const amt = Math.max(boost, fast * 0.45);
    if (amt <= 0.01) {
      if (fxDirty) { g.clearRect(0, 0, c.width, c.height); fxDirty = false; }
      return;
    }
    fxDirty = true;
    g.clearRect(0, 0, c.width, c.height);
    const cx = c.width / 2, cy = c.height * 0.48, R = Math.hypot(cx, cy);
    g.lineCap = 'round';
    for (const L of lines) {
      L.r += dt * (1.8 + L.w * 1.5);
      if (L.r > 1) { L.r = 0.45 + Math.random() * 0.1; L.a = Math.random() * Math.PI * 2; L.l = Math.random(); }
      const r0 = R * L.r, r1 = r0 + R * (0.08 + L.l * 0.14);
      const ca = Math.cos(L.a), sa = Math.sin(L.a);
      g.strokeStyle = boost ? 'rgba(255,214,150,' + (0.16 + L.w * 0.25) * amt + ')' : 'rgba(255,246,234,' + (0.1 + L.w * 0.18) * amt + ')';
      g.lineWidth = (1.5 + L.w * 3) * (c.width / 1400);
      g.beginPath(); g.moveTo(cx + ca * r0, cy + sa * r0 * 0.75); g.lineTo(cx + ca * r1, cy + sa * r1 * 0.75); g.stroke();
    }
  }

  /* ------------------------------------------------ per-frame HUD */
  UI.frame = function (dt) {
    const race = Game.race;
    if (!race || race.attract) return;
    const k = race.player;
    if (!k) return;
    if (race.mode === 'paused') return;
    if (race.online) {
      const wp = $('waitPill');
      if (wp.hidden !== (race.mode !== 'wait')) wp.hidden = race.mode !== 'wait';
      if (race.resultsShown && !$('results').hidden) {
        UI._resT = (UI._resT || 0) + dt;
        if (UI._resT > 0.25) { UI._resT = 0; onlineResults(race, true); }
      }
    }
    if (race.mode !== 'done') {
      const lapNow = G.clamp(k.lap, 1, race.laps);
      $('lapNow').textContent = lapNow;
      $('clock').textContent = G.fmt(race.t);
      if (k.lapTimes.length !== UI.lastLaps) {
        UI.lastLaps = k.lapTimes.length;
        $('lapList').innerHTML = k.lapTimes.map((t, i) => '<span><b>L' + (i + 1) + '</b>' + G.fmt(t) + '</span>').join('');
      }
      const pos = k.place_;
      if (pos !== UI.lastPos) {
        const el = $('pos');
        el.innerHTML = pos + '<sup>' + ORD(pos) + '</sup>';
        el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
        UI.lastPos = pos;
      }
      $('spd').textContent = Math.round(Math.abs(k.speed) * 3.6);
      const ch = $('charge').children;
      for (let i = 0; i < 3; i++) ch[i].className = k.drift.on && k.drift.level > i ? 'c' + k.drift.level : '';
      // item slot
      const box = $('itemBox');
      let icon = 'i-none';
      if (k.rollT > 0) {
        const keys = G.Items.KEYS;
        const rate = k.rollT < 0.4 ? 7 : 16;
        const f = Math.floor(Game.t * rate);
        icon = G.Items.ICON[keys[(f * 5) % keys.length]];
        if (f !== UI._tick) { UI._tick = f; G.Audio.play('tick'); }
      } else if (k.item) icon = G.Items.ICON[k.item];
      const cnt = k.item === 'uchiwa' ? '' : k.itemCount;
      const key = icon + (k.rollT > 0) + cnt + (k.orbit > 0);
      if (key !== UI.lastItem) {
        const settled = UI.wasRolling && k.rollT <= 0 && k.item;
        UI.lastItem = key;
        box.querySelector('use').setAttribute('href', '#' + icon);
        box.classList.toggle('rolling', k.rollT > 0);
        box.classList.toggle('ready', !!k.item && k.rollT <= 0);
        if (settled) { box.classList.remove('got'); void box.offsetWidth; box.classList.add('got'); }
        $('itemCnt').textContent = k.item && k.itemCount > 1 && k.item !== 'uchiwa' && k.rollT <= 0 ? '×' + k.itemCount : '';
        $('itemKey').textContent = k.item && k.rollT <= 0 ? G.Items.NAME[k.item] + (k.item === 'balloon3' && k.orbit ? '（投げる）' : '') : (G.isTouch ? 'ITEM' : 'E / X');
        const tu = $('tItem').querySelector('use');
        if (tu) tu.setAttribute('href', '#' + (k.item && k.rollT <= 0 ? icon : 'i-none'));
      }
      UI.wasRolling = k.rollT > 0;
      const tmr = $('itemTimer');
      const fanLeft = k.item === 'uchiwa' && k.uchiwaT > 0 ? k.uchiwaT / 7.5 : 0;
      tmr.firstElementChild.style.width = (fanLeft * 100).toFixed(1) + '%';
      tmr.hidden = !fanLeft;
      UI.updateRanks(race);
      $('wrong').hidden = !(k.wrongT > 1);
      UI.updateWarn();
    }
    UI.updateInk(dt);
    drawMap(race);
    drawSpeedLines(k, dt);
  };

  /* ------------------------------------------------ ranking strip */
  UI.buildRanks = function (race) {
    const box = $('ranks');
    box.innerHTML = '';
    UI.rankEls = new Map();
    for (const k of race.karts) {
      const el = document.createElement('div');
      el.className = 'rchip' + (k.isPlayer ? ' me' : race.online && k.human ? ' hu' : '');
      el.style.setProperty('--c', k.c.kart);
      const src = UI.portraits[k.c.id];
      el.innerHTML = '<b></b>' + (src ? '<img alt="" src="' + src + '">' : '<i></i>');
      box.appendChild(el);
      UI.rankEls.set(k, el);
    }
    UI.rankSig = '';
  };
  UI.updateRanks = function (race) {
    if (!UI.rankEls || !race.order) return;
    const sig = race.order.map((k) => k.index).join(',');
    if (sig === UI.rankSig) return;
    UI.rankSig = sig;
    race.order.forEach((k, i) => {
      const el = UI.rankEls.get(k);
      if (!el) return;
      el.style.transform = 'translateY(' + i * 100 + '%)';
      el.querySelector('b').textContent = i + 1;
    });
  };

  /* ------------------------------------------------ hit flash, ink, warnings */
  UI.flash = function (color) {
    const f = $('flash');
    f.style.setProperty('--fc', color || '#ff5a6e');
    f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  };
  UI.inkT = 0;
  UI.ink = function (t) {
    const box = $('ink');
    box.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const b = document.createElement('i');
      const sz = 18 + Math.random() * 26;
      b.style.cssText = 'left:' + (8 + Math.random() * 74) + '%;top:' + (8 + Math.random() * 60) + '%;width:' + sz + 'vmin;height:' + sz * (0.8 + Math.random() * 0.4) + 'vmin;transform:translate(-50%,-50%) rotate(' + Math.random() * 360 + 'deg)';
      box.appendChild(b);
    }
    UI.inkT = t;
    UI.inkMax = t;
    box.style.opacity = 1;
    box.hidden = false;
  };
  UI.updateInk = function (dt) {
    if (UI.inkT <= 0) return;
    UI.inkT -= dt;
    const box = $('ink');
    box.style.opacity = G.clamp(UI.inkT / 1.6, 0, 1);
    if (UI.inkT <= 0) box.hidden = true;
  };
  UI.warns = [];
  UI.warn = function (kind, ent) {
    UI.warns.push({ kind, ent });
    G.Audio.play('warn');
  };
  UI.updateWarn = function () {
    UI.warns = UI.warns.filter((w) => G.Items.ents.includes(w.ent));
    const el = $('warn');
    const w = UI.warns[0];
    el.hidden = !w;
    if (w && el.dataset.k !== w.kind) {
      el.dataset.k = w.kind;
      el.querySelector('use').setAttribute('href', '#' + G.Items.ICON[w.kind]);
      el.querySelector('span').textContent = w.kind === 'wave' ? '大波が来る！' : '花火が来る！';
    }
  };
  UI.syncQuality = function () {
    const on = G.Post.enabled;
    $('quality').innerHTML = '<svg><use href="#i-spark"/></svg><span>高画質 ' + (on ? 'ON' : 'OFF') + '</span>';
  };

  /* ------------------------------------------------ wiring + boot */
  function wire() {
    $('start').addEventListener('click', UI.primary);
    $('resume').addEventListener('click', () => UI.pause(false));
    $('restart').addEventListener('click', () => { $('pause').hidden = true; UI.startRace(); });
    $('quit').addEventListener('click', () => { if (Game.race && Game.race.online) UI.toLobby(); else UI.showTitle(); });
    $('leaveRoom').addEventListener('click', UI.leaveRoom);
    $('toLobby').addEventListener('click', UI.toLobby);
    $('resLeave').addEventListener('click', UI.leaveRoom);
    wireLobby();
    $('again').addEventListener('click', UI.startRace);
    $('toTitle').addEventListener('click', () => UI.showTitle());
    $('mute').addEventListener('click', () => { G.Audio.unlock(); G.Audio.setMuted(!G.Audio.muted); UI.updateMute(); });
    $('quality').addEventListener('click', () => { G.Post.enabled = !G.Post.enabled; G.store.set('shiokaze.hq', G.Post.enabled); Game.slowStrikes = -99; UI.syncQuality(); G.Audio.play('ui'); });
    $('tPause').addEventListener('click', () => UI.pause(true));
    G.Input.bindTouch('tLeft', 'left');
    G.Input.bindTouch('tRight', 'right');
    G.Input.bindTouch('tDrift', 'drift');
    G.Input.bindTouch('tItem', 'item');
    G.Input.bindTouch('tBrake', 'brake');
    window.addEventListener('pointerdown', () => G.Audio.unlock(), { once: false });
    window.addEventListener('keydown', (e) => {
      const race = Game.race;
      if (race && race.mode === 'paused' && (e.code === 'Escape' || e.code === 'KeyP')) { e.preventDefault(); UI.pause(false); return; }
      if (!$('title').hidden && !(e.target && e.target.tagName === 'INPUT')) {
        const ids = G.CHARS.map((c) => c.id);
        const i = ids.indexOf(Game.settings.char);
        if (e.code === 'ArrowRight' || e.code === 'KeyD') { UI.selectChar(ids[(i + 1) % ids.length]); e.preventDefault(); }
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') { UI.selectChar(ids[(i + ids.length - 1) % ids.length]); e.preventDefault(); }
        if (e.code === 'ArrowDown' && i < 4) { UI.selectChar(ids[i + 4]); e.preventDefault(); }
        if (e.code === 'ArrowUp' && i >= 4) { UI.selectChar(ids[i - 4]); e.preventDefault(); }
      }
    });
    if (G.isTouch) document.body.classList.add('touch');
    UI.updateMute();
    UI.syncQuality();
  }

  function boot() {
    try {
      Game.init();
    } catch (e) {
      const el = $('err');
      el.hidden = false;
      el.textContent = '3D表示を開始できませんでした（' + e.message + '）。WebGLが使えるブラウザで開いてください。';
      $('loading').classList.add('done');
      return;
    }
    UI.portraits = {};
    for (const c of G.CHARS) UI.portraits[c.id] = 'img/face_' + c.id + '.webp';
    UI.initMap();
    wire();
    UI.buildTitle();
    UI.buildCourses();
    UI.readInvite();
    // an invite opened on a phone: bring the room form into view
    if (UI.invited) setTimeout(() => { const lb = $('lobby'); if (lb && lb.getBoundingClientRect().top > innerHeight * 0.6) lb.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 600);
    UI.showTitle();
    G.Net.init();
    requestAnimationFrame(Game.frame);
    setTimeout(() => $('loading').classList.add('done'), 150);
    setTimeout(() => { $('loading').hidden = true; }, 900);
  }

  function whenFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const loads = Promise.all([
      document.fonts.load('86px "Dela Gothic One"', '汐風グランプリ?'),
      document.fonts.load('700 26px "Chakra Petch"', 'SHIOKAZE'),
    ]).catch(() => {});
    return Promise.race([loads, new Promise((r) => setTimeout(r, 2500))]);
  }
  whenFonts().then(boot);
})();
