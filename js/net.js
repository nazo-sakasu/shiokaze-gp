/* 汐風GP — online play through the room relay (every player shares a small presence object) */
(function () {
  'use strict';
  const G = window.G;
  const SEND_MS = 66;

  const Net = (G.Net = {
    available: null, rm: null, code: '', key: '', locked: false, myPeer: null,
    peers: [], hostPeer: null, isHost: false, hs: null, rid: 0, prepT: 0,
    lastSeq: {}, evOut: [], seq: 0, timer: 0, status: '', connected: true,
    listeners: [],
  });

  const now = () => performance.now();
  const Game = () => G.Game;
  const ERR_TEXT = {
    bad_key: '鍵がちがいます。部屋をつくった人に確認してください',
    no_room: 'その番号の部屋は見つかりませんでした',
    full: 'この部屋は満員です（8人まで）',
    taken: 'その番号は使われています',
    unreachable: '相手とつながりませんでした。Wi-Fiとモバイル回線を切り替えるか、別のネットワークでお試しください',
    unsupported: 'このブラウザはオンライン対戦に対応していません',
  };

  /* ------------------------------------------------------------ setup */
  Net.init = async function () {
    Net.available = G.Relay ? await G.Relay.available() : false;
    G.UI.renderLobby();
  };

  // nicknames are typed by players: keep them short and plain
  Net.cleanName = function (s) {
    return String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 10);
  };
  function myLobbyPresence() {
    const s = Game().settings;
    return { v: 1, ch: s.char, nm: Net.cleanName(s.nick) || null, jt: Net.joinedAt };
  }

  Net.newKey = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  Net.create = async function (locked) {
    const key = locked ? Net.newKey() : '';
    for (let i = 0; i < 6; i++) {
      const code = String(1000 + Math.floor(Math.random() * 9000));
      const r = await Net.join(code, true, key, i < 5);
      if (r !== 'taken') return r === true;
    }
    return false;
  };
  // resolves true, false, or 'taken' when creating on a code someone already uses
  Net.join = async function (code, creating, key, quietTaken) {
    if (!Net.available || Net.rm) return false;
    code = String(code || '').replace(/\D/g, '').slice(0, 4);
    key = String(key || '').trim().slice(0, 12);
    if (code.length !== 4) { Net.status = '4けたの部屋番号を入れてください'; G.UI.renderLobby(); return false; }
    Net.status = creating ? '部屋をつくっています…' : '参加しています…';
    G.UI.renderLobby();
    try {
      const rm = await G.Relay.join(code, { create: creating, key });
      Net.rm = rm;
      Net.code = code;
      Net.key = key;
      Net.locked = !!key;
      Net.joinedAt = Date.now();
      Net.status = '';
      Net.connected = true;
      Net.hs = null; Net.hostPeer = null; Net.isHost = false; Net.rid = 0;
      await rm.presence(myLobbyPresence());
      Net.listeners.push(rm.onPeers(onPeers, onRoomError));
      Net.listeners.push(rm.onConnection((c) => { Net.connected = c; G.UI.renderLobby(); }, onRoomError));
      clearInterval(Net.timer);
      Net.timer = setInterval(tick, SEND_MS);
      G.UI.renderLobby();
      return true;
    } catch (e) {
      Net.rm = null;
      const c = e && e.code;
      if (c === 'taken' && quietTaken) return 'taken';
      Net.status = ERR_TEXT[c] || '部屋に入れませんでした。通信状態を確かめて、もう一度どうぞ';
      G.UI.renderLobby();
      return c === 'taken' ? 'taken' : false;
    }
  };
  function onRoomError(e) {
    if (!Net.rm) return;
    const race = Game().race;
    const racing = race && race.online && race.mode !== 'done' && !race.attract;
    Net.status = '部屋との通信が切れました';
    Net.teardown();
    if (racing) {
      // finish the race alone: the computer karts drive themselves, other players leave the track
      if (race.mode === 'wait') { race.mode = 'count'; race.count = 0; }
      for (const k of race.karts.slice()) {
        if (!k.remote) continue;
        if (k.human) { dropPeer(k.key, ''); continue; }
        takeOverCpu(k, race);
      }
      G.UI.toast('通信が切れました。CPUとレースを続けます');
    } else G.UI.toast('部屋との通信が切れました');
    G.UI.renderLobby();
  }
  function takeOverCpu(k, race) {
    k.remote = false;
    k.vx = Math.sin(k.h) * k.speed; k.vz = Math.cos(k.h) * k.speed;
    k.ai = { line: 0, lineT: 0, itemWait: 1, driftHold: false, aggr: 0.5, boxSeek: true };
    k.baseSkill = race.cls.cpu;
    k.prevS = k.loc.s;
  }
  Net.teardown = function () {
    clearInterval(Net.timer);
    Net.listeners.forEach((u) => { try { u(); } catch (e) {} });
    Net.listeners = [];
    Net.rm = null; Net.code = ''; Net.key = ''; Net.locked = false; Net.peers = []; Net.hostPeer = null; Net.isHost = false; Net.hs = null; Net.rid = 0;
  };
  Net.leave = async function () {
    const rm = Net.rm;
    Net.teardown();
    if (rm) { try { await rm.leave(); } catch (e) {} }
    G.UI.renderLobby();
  };
  Net.inRoom = () => !!Net.rm;
  Net.inviteUrl = function () {
    const u = new URL(location.href);
    u.hash = 'room=' + Net.code + (Net.key ? '&key=' + encodeURIComponent(Net.key) : '');
    return u.toString();
  };

  /* ------------------------------------------------------------ peers */
  function members() {
    return Net.peers.filter((p) => p.presence && p.presence.v === 1).slice().sort((a, b) => ((a.jo || 0) - (b.jo || 0)) || ((a.presence.jt || 0) - (b.presence.jt || 0)) || (a.peer < b.peer ? -1 : 1));
  }
  Net.members = members;

  function onPeers(change) {
    Net.peers = change.peers.slice();
    const me = Net.peers.find((p) => p.sameTab);
    if (me) Net.myPeer = me.peer;
    const prevHost = Net.hostPeer;
    const m = members();
    Net.hostPeer = m.length ? m[0].peer : null;
    const wasHost = Net.isHost;
    Net.isHost = !!(Net.hostPeer && Net.hostPeer === Net.myPeer);
    if (Net.isHost && !wasHost) becomeHost();
    // host state
    const hp = Net.peers.find((p) => p.peer === Net.hostPeer);
    if (hp && !hp.sameTab && hp.presence.h) applyHost(hp.presence.h);
    // race traffic
    const race = Game().race;
    const t = now();
    for (const p of change.joined.concat(change.updated)) {
      if (p.sameTab || !p.presence) continue;
      if (race && race.online && p.presence.r === Net.rid) readRacer(p, race, t);
    }
    for (const p of change.left) dropPeer(p.peer, 'が退出しました');
    // someone who raced with us went back to the lobby
    if (race && race.online) {
      for (const p of change.updated) {
        if (p.sameTab || !p.presence || p.presence.r === Net.rid) continue;
        const k = race.karts.find((x) => x.key === p.peer && x.remote && x.human);
        if (k && k.net && !k.finished) dropPeer(p.peer, 'がリタイアしました');
      }
    }
    if (prevHost && prevHost !== Net.hostPeer && Net.isHost && race && race.online) G.UI.toast('あなたがホストになりました');
    G.UI.renderLobby();
  }

  function readRacer(p, race, t) {
    const pr = p.presence;
    if (Array.isArray(pr.k)) {
      const k = race.karts.find((x) => x.key === p.peer);
      if (k && k.remote) k.netPush(pr.k, pr.tm || 0, t);
    }
    if (p.peer === Net.hostPeer && Array.isArray(pr.c)) {
      for (const row of pr.c) {
        if (!Array.isArray(row)) continue;
        const k = race.karts.find((x) => x.key === row[0]);
        if (k && k.remote) k.netPush(row.slice(1), pr.tm || 0, t);
      }
    }
    if (pr.ev && pr.ev.r === Net.rid && Array.isArray(pr.ev.l)) {
      const last = Net.lastSeq[p.peer] || 0;
      let hi = last;
      for (const e of pr.ev.l) {
        if (!Array.isArray(e) || e[0] <= last) continue;
        hi = Math.max(hi, e[0]);
        const owner = race.karts.find((x) => x.key === e[1]);
        if (owner && typeof e[2] === 'string' && Array.isArray(e[3])) {
          try { G.Items.replay(owner, e[2], e[3], race); } catch (err) { /* malformed input from a peer: ignore */ }
        }
      }
      Net.lastSeq[p.peer] = hi;
    }
  }

  function dropPeer(peer, why) {
    const race = Game().race;
    if (!race || !race.online) return;
    const i = race.karts.findIndex((k) => k.key === peer && k.remote && k.human);
    if (i < 0) return;
    const k = race.karts[i];
    // someone who already crossed the line keeps their place in the results
    if (k.finished) { G.UI.toast((k.netName || k.c.name) + ' ' + (why || 'が退出しました')); return; }
    Game().scene.remove(k.model.root);
    race.karts.splice(i, 1);
    G.UI.buildRanks(race);
    G.UI.toast((k.netName || k.c.name) + ' ' + (why || 'が退出しました'));
  }

  /* ------------------------------------------------------------ names */
  Net.nameOf = function (peer, fallback) {
    const p = Net.peers.find((x) => x.peer === peer);
    return (p && p.presence && Net.cleanName(p.presence.nm)) || fallback || 'プレイヤー';
  };
  Net.setName = function () {
    if (Net.rm) Net.rm.presence({ nm: Net.cleanName(Game().settings.nick) || null }).catch(() => {});
  };

  /* ------------------------------------------------------------ host */
  function setHost(h) {
    Net.hs = h;
    if (Net.rm) Net.rm.presence({ h }).catch(() => {});
  }
  Net.hostSync = function () {
    if (!Net.isHost) return;
    const s = Game().settings;
    const base = Net.hs && Net.hs.ph !== 'lobby' ? Net.hs : { ph: 'lobby', rid: Net.rid || 0 };
    setHost(Object.assign({}, base, { co: s.course, cl: s.cls, cpu: s.cpu ? 1 : 0 }));
  };
  function becomeHost() {
    const race = Game().race;
    Net.hostSync();
    // take over driving the computer karts mid-race
    if (race && race.online) {
      for (const k of race.karts) {
        if (!k.human && k.remote) {
          k.remote = false;
          k.vx = Math.sin(k.h) * k.speed; k.vz = Math.cos(k.h) * k.speed;
          k.ai = { line: 0, lineT: 0, itemWait: 1, driftHold: false, aggr: 0.5, boxSeek: true };
          k.baseSkill = race.cls.cpu;
          k.prevS = k.loc.s;
        }
      }
    }
    G.UI.renderLobby();
  }

  Net.hostStart = function () {
    if (!Net.isHost) return;
    // one race at a time: ignore a second press while this one is loading or running
    const cur = Game().race;
    if (Net.hs && (Net.hs.ph === 'prep' || Net.hs.ph === 'count' || Net.hs.ph === 'race') && cur && cur.online && !cur.attract) return;
    const s = Game().settings;
    const humans = members().slice(0, 8).map((p) => [p.peer, String(p.presence.ch || 'koro')]);
    const slots = [];
    if (s.cpu) {
      // computer racers take the characters nobody picked first, in random order
      const taken = new Set(humans.map((h) => h[1]));
      const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
      const pool = shuffle(G.CHARS.filter((c) => !taken.has(c.id)).map((c) => c.id)).concat(shuffle(G.CHARS.filter((c) => taken.has(c.id)).map((c) => c.id)));
      const nCpu = Math.max(0, 8 - humans.length);
      for (let i = 0; i < nCpu; i++) slots.push(['c' + i, pool[i % pool.length], 0]);
    }
    humans.forEach((h) => slots.push([h[0], h[1], 1]));
    const h = { ph: 'prep', rid: 1 + Math.floor(Math.random() * 1e9), co: s.course, cl: s.cls, cpu: s.cpu ? 1 : 0, sl: slots };
    setHost(h);
    Net.prepare(h);
  };
  Net.hostLobby = function () {
    if (!Net.isHost) return;
    const s = Game().settings;
    setHost({ ph: 'lobby', rid: Net.rid, co: s.course, cl: s.cls, cpu: s.cpu ? 1 : 0 });
  };

  function applyHost(h) {
    if (!h || typeof h !== 'object') return;
    const prev = Net.hs;
    Net.hs = h;
    const race = Game().race;
    if (h.ph === 'prep' && h.rid !== Net.rid && Array.isArray(h.sl) && h.sl.some((s) => Array.isArray(s) && s[0] === Net.myPeer)) Net.prepare(h);
    else if ((h.ph === 'count' || h.ph === 'race') && h.rid === Net.rid && race && race.online && race.mode === 'wait') startCount(race);
    else if (h.ph === 'lobby' && prev && prev.ph !== 'lobby') G.UI.onHostLobby();
    if (!prev || prev.co !== h.co || prev.cl !== h.cl || prev.cpu !== h.cpu) G.UI.renderLobby();
  }

  /* ------------------------------------------------------------ race lifecycle */
  Net.prepare = function (h) {
    Net.rid = h.rid;
    Net.lastSeq = {};
    Net.evOut = [];
    Net.seq = 0;
    Net.prepT = now();
    const begin = () => {
      const g = Game();
      if (G.COURSES.some((c) => c.id === h.co) && h.co !== g.settings.course) { g.setCourse(h.co); G.UI.initMap(); }
      g.settings.cls = G.clamp(h.cl | 0, 0, 2);
      g.newOnlineRace(h);
      G.UI.enterOnlineRace();
      if (Net.rm) Net.rm.presence({ rdy: h.rid, r: h.rid, k: null, c: null, ev: null, fin: null }).catch(() => {});
      // the host may already have released the countdown while we were loading
      if (Net.hs && Net.hs.rid === h.rid && (Net.hs.ph === 'count' || Net.hs.ph === 'race') && !Net.isHost) startCount(g.race);
    };
    G.UI.withVeil(begin, (G.COURSES.find((c) => c.id === h.co) || {}).name);
  };
  function startCount(race) {
    race.mode = 'count';
    race.count = 0;
  }
  Net.itemEvent = function (k, type, prm) {
    if (!Net.rm || !k.key || k.remote) return;
    Net.evOut.push([++Net.seq, k.key, type, prm]);
    if (Net.evOut.length > 10) Net.evOut.shift();
  };

  /* ------------------------------------------------------------ send loop */
  function tick() {
    if (!Net.rm) return;
    const race = Game().race;
    // host: release the countdown once everyone has loaded (or after a timeout)
    if (Net.isHost && Net.hs && Net.hs.ph === 'prep' && race && race.online && race.mode === 'wait') {
      const humans = Net.hs.sl.filter((s) => s[2]);
      const present = new Set(Net.peers.map((p) => p.peer));
      const ready = humans.every((s) => {
        if (s[0] === Net.myPeer) return true;
        if (!present.has(s[0])) return true;
        const p = Net.peers.find((x) => x.peer === s[0]);
        return p && p.presence && p.presence.rdy === Net.rid;
      });
      if (ready || now() - Net.prepT > 12000) {
        setHost(Object.assign({}, Net.hs, { ph: 'count' }));
        startCount(race);
      }
    }
    if (Net.isHost && Net.hs && Net.hs.ph === 'count' && race && race.online && race.mode === 'race') setHost(Object.assign({}, Net.hs, { ph: 'race' }));
    if (!race || !race.online || !race.player) return;
    const p = race.player;
    const patch = { r: Net.rid, k: p.serialize(), tm: Math.round(now()), ev: { r: Net.rid, l: Net.evOut }, fin: p.finished ? Math.round(p.finishTime * 1000) / 1000 : 0 };
    if (Net.isHost) {
      const cpus = race.karts.filter((k) => !k.human && !k.remote);
      if (cpus.length) patch.c = cpus.map((k) => [k.key].concat(k.serialize()));
    }
    Net.rm.presence(patch).catch(() => {});
  }

  // keep the lobby presence in step with the title screen
  Net.setChar = function (id) {
    if (Net.rm) Net.rm.presence({ ch: id }).catch(() => {});
  };
  Net.backToLobby = function () {
    if (Net.rm) Net.rm.presence({ r: null, k: null, c: null, ev: null, fin: null, rdy: null }).catch(() => {});
  };
})();
