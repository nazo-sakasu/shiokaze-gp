/* 汐風GP — online rooms over WebRTC (PeerJS), no account or server of our own.
 *
 * The player who opens a room becomes its hub: it registers the peer id
 * "shiokazegp-v1-<room number>" on the public PeerJS broker, and everyone else
 * connects straight to it. The hub checks the key (hashed in the browser),
 * keeps every player's small "presence" object and forwards changes to the rest.
 * If the hub leaves, the next player in join order takes over the same id and
 * the others reconnect to it, so a race can carry on.
 *
 * Exposes the room shape the game's net layer expects:
 * presence(patch), peers(), onPeers(fn), onConnection(fn), connected(), leave().
 */
(function () {
  'use strict';
  const G = window.G;
  const PREFIX = 'shiokazegp-v1-';
  const MAX_PEERS = 8;
  const MAX_BYTES = 4096;
  const SEND_MS = 33;
  const GRACE_MS = 30000;   // a dropped player keeps their seat this long
  const QUIET_MS = 9000;    // nothing heard for this long = the link is dead
  const KEEP_MS = 2000;
  const DIAL_MS = 9000;     // how long one connection attempt may take

  const dbg = (...a) => { if (window.__relayDebug) console.log('[relay]', ...a); };
  const now = () => performance.now();
  const err = (code) => Object.assign(new Error(code), { code });
  const rid = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
  const peerOpts = () => Object.assign({ debug: 0 }, window.SHIOKAZE_PEER || {});

  async function hashKey(code, key) {
    if (!key) return '';
    const data = new TextEncoder().encode('shiokaze-gp:' + code + ':' + key);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // open a PeerJS endpoint; resolves once the broker has registered it
  function openPeer(id) {
    return new Promise((resolve, reject) => {
      let done = false;
      let p;
      try { p = id ? new window.Peer(id, peerOpts()) : new window.Peer(peerOpts()); } catch (e) { reject(err('upstream_error')); return; }
      const t = setTimeout(() => finish(err('upstream_error')), 12000);
      function finish(e) {
        if (done) return;
        done = true;
        clearTimeout(t);
        if (e) { try { p.destroy(); } catch (x) {} reject(e); } else resolve(p);
      }
      p.on('open', () => finish(null));
      p.on('error', (e) => finish(err(e && e.type === 'unavailable-id' ? 'taken' : e && e.type === 'browser-incompatible' ? 'unsupported' : 'upstream_error')));
    });
  }

  const Relay = (G.Relay = {
    async available() {
      return typeof window.Peer === 'function' && typeof window.RTCPeerConnection === 'function' && !!(window.crypto && crypto.subtle);
    },
    async join(code, opt) {
      const kh = await hashKey(code, (opt && opt.key) || '');
      return openRoom(code, kh, !!(opt && opt.create));
    },
  });

  function openRoom(code, keyHash, create) {
    return new Promise((resolve, reject) => {
      const hubId = PREFIX + code;
      const me = rid(10);
      let myJo = 0, myP = {}, out = null;
      let settled = false, closed = false, connectedNow = false;
      let handlers = [], connHandlers = [], errHandlers = [];
      const peers = new Map();                 // pid -> frozen Peer
      let pend = { j: new Map(), l: new Map(), u: new Map() };
      let snap = Object.freeze([]);
      let flushT = 0, tickT = 0;

      // hub side
      let hubPeer = null;                      // PeerJS endpoint holding hubId
      const conns = new Map();                 // pid -> { c, rx, tx }
      const away = new Map();                  // pid -> since (seat kept for GRACE_MS)
      let relayQ = [];                         // [pid, patch, full]
      let tries = new Map();                   // remote peer id -> wrong keys
      // guest side
      let guestPeer = null, link = null, linkRx = 0, linkTx = 0, redial = null;

      /* ---------------- local peer list ---------------- */
      const freezePeer = (id, jo, presence) => Object.freeze({
        peer: id, by: null, isMe: id === me, sameTab: id === me, guest: false, kind: 'human', jo,
        presence: Object.freeze(presence), updatedAt: Date.now(),
      });
      function schedule() { if (!flushT) flushT = setTimeout(flushPeers, 16); }
      function flushPeers() {
        flushT = 0;
        snap = Object.freeze(Array.from(peers.values()).sort((a, b) => a.jo - b.jo));
        const ch = Object.freeze({ peers: snap, joined: Object.freeze([...pend.j.values()]), left: Object.freeze([...pend.l.values()]), updated: Object.freeze([...pend.u.values()]) });
        pend = { j: new Map(), l: new Map(), u: new Map() };
        for (const h of handlers.slice()) { try { h(ch); } catch (e) { console.error(e); } }
      }
      function upsert(id, jo, presence) {
        const had = peers.has(id);
        const p = freezePeer(id, jo, presence);
        peers.set(id, p);
        if (!had || pend.j.has(id)) pend.j.set(id, p); else pend.u.set(id, p);
        pend.l.delete(id);
        schedule();
      }
      function remove(id) {
        const p = peers.get(id);
        if (!p) return;
        peers.delete(id);
        pend.j.delete(id); pend.u.delete(id); pend.l.set(id, p);
        schedule();
      }
      function patchOf(prev, d, full) {
        const next = full || !prev ? {} : Object.assign({}, prev.presence);
        for (const k of Object.keys(d || {})) { if (k === '__proto__') continue; if (d[k] === null) delete next[k]; else next[k] = d[k]; }
        return next;
      }
      const setMe = () => upsert(me, myJo, JSON.parse(JSON.stringify(myP)));
      function setConn(c) {
        if (connectedNow === c) return;
        connectedNow = c;
        for (const h of connHandlers.slice()) { try { h(c); } catch (e) {} }
      }
      function fail(codeName) {
        if (closed) return;
        dbg('fail', codeName);
        shutdown();
        const e = err(codeName);
        for (const h of errHandlers.slice()) { try { h && h(e); } catch (x) {} }
      }
      function shutdown() {
        closed = true;
        clearInterval(tickT);
        setConn(false);
        try { link && link.close(); } catch (e) {}
        for (const [, s] of conns) { try { s.c.close(); } catch (e) {} }
        conns.clear();
        const ps = [hubPeer, guestPeer];
        hubPeer = guestPeer = link = null;
        setTimeout(() => ps.forEach((p) => { try { p && p.destroy(); } catch (e) {} }), 250);
      }
      const isHub = () => !!hubPeer;
      const send = (c, m) => { try { if (c && c.open) { c.send(m); return true; } } catch (e) {} return false; };

      /* ---------------- hub ---------------- */
      function becomeHub(p, keepOthers) {
        hubPeer = p;
        dbg('hub up', hubId);
        p.on('connection', onIncoming);
        p.on('disconnected', () => { if (hubPeer === p && !closed) setTimeout(() => { if (hubPeer === p && !closed && p.disconnected && !p.destroyed) try { p.reconnect(); } catch (e) {} }, 1500); });
        p.on('error', (e) => {
          dbg('hub error', e && e.type);
          // someone else holds the room id now: this hub is orphaned
          if (e && e.type === 'unavailable-id') fail('upstream_error');
        });
        if (!keepOthers) return;
        // after a takeover the others are reconnecting: hold their seats
        const t = Date.now();
        for (const id of peers.keys()) if (id !== me) away.set(id, t);
      }
      function onIncoming(c) {
        let pid = null;
        c.on('data', (m) => {
          if (!m || typeof m !== 'object' || closed) return;
          if (!pid) {
            if (m.t !== 'hello' || typeof m.pid !== 'string' || m.pid.length > 24) return;
            const resume = peers.has(m.pid) && m.pid !== me;
            if ((m.kh || '') !== keyHash) {
              const n = (tries.get(c.peer) || 0) + 1;
              tries.set(c.peer, n);
              send(c, { t: 'deny', code: 'bad_key' });
              setTimeout(() => { try { c.close(); } catch (e) {} }, n > 3 ? 50 : 400);
              return;
            }
            if (!resume && peers.size >= MAX_PEERS) { send(c, { t: 'deny', code: 'full' }); setTimeout(() => { try { c.close(); } catch (e) {} }, 400); return; }
            pid = m.pid;
            const old = conns.get(pid);
            if (old && old.c !== c) { try { old.c.close(); } catch (e) {} }
            const jo = resume ? peers.get(pid).jo : Math.max(myJo, ...Array.from(peers.values(), (x) => x.jo)) + 1;
            const pr = m.p && typeof m.p === 'object' ? m.p : {};
            conns.set(pid, { c, rx: now(), tx: now() });
            away.delete(pid);
            upsert(pid, jo, pr);
            send(c, { t: 'hi', you: pid, jo, peers: Array.from(peers.values(), (x) => ({ peer: x.peer, jo: x.jo, p: x.presence })) });
            const j = { t: 'j', peer: pid, jo, p: pr };
            for (const [id, s] of conns) if (id !== pid) send(s.c, j);
            dbg('seat', pid, jo, resume ? 'resume' : 'new');
            return;
          }
          const s = conns.get(pid);
          if (!s || s.c !== c) return;
          s.rx = now();
          if (m.t === 'p' && m.d && typeof m.d === 'object') {
            const prev = peers.get(pid);
            const next = patchOf(prev, m.d, m.full);
            if (JSON.stringify(next).length > MAX_BYTES * 2) return;
            upsert(pid, prev ? prev.jo : 0, next);
            relayQ.push([pid, m.d, m.full ? 1 : 0]);
          } else if (m.t === 'bye') {
            conns.delete(pid);
            away.delete(pid);
            dropSeat(pid);
            try { c.close(); } catch (e) {}
          }
        });
        const gone = () => {
          if (!pid) return;
          const s = conns.get(pid);
          if (!s || s.c !== c) return;
          conns.delete(pid);
          if (peers.has(pid)) away.set(pid, Date.now());
          dbg('lost guest', pid);
        };
        c.on('close', gone);
        c.on('error', gone);
      }
      function dropSeat(pid) {
        if (!peers.has(pid)) return;
        remove(pid);
        const l = { t: 'l', peer: pid };
        for (const [, s] of conns) send(s.c, l);
      }
      function hubTick() {
        const t = now();
        if (relayQ.length) {
          const q = relayQ;
          relayQ = [];
          for (const [id, s] of conns) {
            const mine = q.filter((e) => e[0] !== id);
            if (mine.length && send(s.c, { t: 'U', l: mine })) s.tx = t;
          }
        }
        for (const [id, s] of conns) {
          if (t - s.tx > KEEP_MS && send(s.c, { t: 'k' })) s.tx = t;
          if (t - s.rx > QUIET_MS && document.visibilityState !== 'hidden') { dbg('quiet guest', id); conns.delete(id); away.set(id, Date.now()); try { s.c.close(); } catch (e) {} }
        }
        const d = Date.now();
        for (const [id, since] of away) if (d - since > GRACE_MS) { away.delete(id); dropSeat(id); }
      }

      /* ---------------- guest ---------------- */
      function dial(resuming) {
        return new Promise((res) => {
          if (closed || !guestPeer) { res('closed'); return; }
          let done = false;
          const c = guestPeer.connect(hubId, { reliable: true, serialization: 'json' });
          const t = setTimeout(() => finish('timeout'), DIAL_MS);
          const onErr = (e) => { if (e && e.type === 'peer-unavailable') finish('no_room'); };
          guestPeer.on('error', onErr);
          function finish(r, m) {
            if (done) return;
            done = true;
            clearTimeout(t);
            guestPeer && guestPeer.off('error', onErr);
            if (r !== 'ok') { try { c.close(); } catch (e) {} }
            res(r, m);
          }
          c.on('open', () => send(c, { t: 'hello', pid: me, kh: keyHash, p: myP, jo: myJo, resume: !!resuming }));
          c.on('data', (m) => {
            if (!m || typeof m !== 'object') return;
            if (!done) {
              if (m.t === 'hi') { adoptLink(c, m); finish('ok'); }
              else if (m.t === 'deny') finish(m.code === 'full' ? 'full' : 'bad_key');
              return;
            }
            if (link !== c) return;
            linkRx = now();
            onHubMsg(m);
          });
          const lostIt = () => { if (!done) finish('closed'); else if (link === c) linkLost(); };
          c.on('close', lostIt);
          c.on('error', lostIt);
        });
      }
      function adoptLink(c, m) {
        link = c;
        linkRx = now();
        linkTx = now();
        myJo = m.jo | 0;
        const seen = new Set([me]);
        for (const p of m.peers || []) {
          if (!p || typeof p.peer !== 'string') continue;
          seen.add(p.peer);
          if (p.peer !== me) upsert(p.peer, p.jo | 0, p.p && typeof p.p === 'object' ? p.p : {});
        }
        for (const id of Array.from(peers.keys())) if (!seen.has(id)) remove(id);
        setMe();
        setConn(true);
        if (settled) { out = null; send(c, { t: 'p', d: myP, full: 1 }); }
      }
      function onHubMsg(m) {
        if (m.t === 'U' && Array.isArray(m.l)) {
          for (const e of m.l) {
            if (!Array.isArray(e) || typeof e[0] !== 'string' || e[0] === me || !e[1] || typeof e[1] !== 'object') continue;
            const prev = peers.get(e[0]);
            upsert(e[0], prev ? prev.jo : 0, patchOf(prev, e[1], e[2]));
          }
        } else if (m.t === 'j' && typeof m.peer === 'string' && m.peer !== me) upsert(m.peer, m.jo | 0, m.p && typeof m.p === 'object' ? m.p : {});
        else if (m.t === 'l' && typeof m.peer === 'string' && m.peer !== me) remove(m.peer);
        else if (m.t === 'bye') linkLost(true);
      }
      // the hub went quiet: reconnect, or take over if it is gone and we are next in line
      function linkLost(handover) {
        if (closed || redial) return;
        const old = link;
        link = null;
        try { old && old.close(); } catch (e) {}
        setConn(false);
        dbg('link lost');
        const first = snap[0];
        const hubPid = first && first.peer !== me ? first.peer : null;
        const started = Date.now();
        redial = (async () => {
          let n = 0;
          // a hub that said goodbye needs a moment to free its id on the broker
          if (handover) await new Promise((ok) => setTimeout(ok, 700));
          while (!closed && Date.now() - started < 75000) {
            const r = await dial(true);
            if (r === 'ok') { redial = null; return; }
            if (closed) break;
            if (r === 'no_room') {
              // the hub is gone from the broker: whoever joined earliest after it takes over
              const rest = Array.from(peers.values()).filter((p) => p.peer !== hubPid).sort((a, b) => a.jo - b.jo);
              if (rest.length && rest[0].peer === me) {
                try {
                  const hp = await openPeer(hubId);
                  if (closed) { try { hp.destroy(); } catch (e) {} break; }
                  if (hubPid) remove(hubPid);
                  becomeHub(hp, true);
                  setConn(true);
                  redial = null;
                  return;
                } catch (e) { dbg('takeover failed', e.code); }
              }
            } else if (r === 'bad_key' || r === 'full') break;
            await new Promise((ok) => setTimeout(ok, Math.min(2500, 600 + 400 * n++)));
          }
          redial = null;
          if (!closed) fail('upstream_error');
        })();
      }
      function guestTick() {
        const t = now();
        if (!link) return;
        if (out && send(link, { t: 'p', d: out })) { out = null; linkTx = t; }
        else if (t - linkTx > KEEP_MS && send(link, { t: 'k' })) linkTx = t;
        if (t - linkRx > QUIET_MS && document.visibilityState !== 'hidden') linkLost();
      }

      /* ---------------- shared ---------------- */
      let lastTick = 0;
      function tick() {
        if (closed) return;
        const t = now();
        // the page itself was frozen (loading a course, a background tab): don't blame the network
        if (lastTick && t - lastTick > 1500) {
          const gap = t - lastTick;
          linkRx += gap;
          for (const [, s] of conns) s.rx += gap;
        }
        lastTick = t;
        if (isHub()) {
          if (out) { relayQ.push([me, out, 0]); out = null; }
          hubTick();
        } else guestTick();
      }

      const api = Object.freeze({
        name: 'gp-' + code,
        presence(patch) {
          if (closed) return Promise.reject(err('invalid_argument'));
          const next = Object.assign({}, myP);
          for (const k of Object.keys(patch || {})) { if (patch[k] === null) delete next[k]; else next[k] = JSON.parse(JSON.stringify(patch[k])); }
          if (new TextEncoder().encode(JSON.stringify(next)).length > MAX_BYTES) return Promise.reject(err('invalid_argument'));
          myP = next;
          out = Object.assign(out || {}, JSON.parse(JSON.stringify(patch || {})));
          if (myJo) setMe();
          return Promise.resolve();
        },
        peers: () => snap,
        onPeers(h, onErr) {
          handlers.push(h);
          if (onErr) errHandlers.push(onErr);
          for (const [id, p] of peers) { pend.j.set(id, p); pend.u.delete(id); }
          schedule();
          return () => { handlers = handlers.filter((x) => x !== h); errHandlers = errHandlers.filter((x) => x !== onErr); };
        },
        connected: () => connectedNow,
        onConnection(h, onErr) {
          connHandlers.push(h);
          if (onErr) errHandlers.push(onErr);
          setTimeout(() => h(connectedNow), 0);
          return () => { connHandlers = connHandlers.filter((x) => x !== h); errHandlers = errHandlers.filter((x) => x !== onErr); };
        },
        // test hooks
        _drop() { if (link) linkLost(); },
        _stats: () => ({ hub: isHub(), connected: connectedNow, guests: conns.size, away: away.size }),
        leave() {
          if (!closed) {
            // a leaving hub hands the room over: the next player in line takes its id
            if (isHub()) for (const [, s] of conns) send(s.c, { t: 'bye' });
            else send(link, { t: 'bye' });
            shutdown();
          }
          handlers = []; connHandlers = []; errHandlers = [];
          return Promise.resolve();
        },
      });

      // a closing tab tells the room right away instead of waiting for the timeout
      const onHide = () => { if (!closed) api.leave(); };
      window.addEventListener('pagehide', onHide);

      (async () => {
        try {
          if (create) {
            const p = await openPeer(hubId);
            myJo = 1;
            becomeHub(p, false);
            setMe();
            setConn(true);
          } else {
            guestPeer = await openPeer(null);
            guestPeer.on('disconnected', () => { if (guestPeer && !closed) setTimeout(() => { if (guestPeer && !closed && guestPeer.disconnected && !guestPeer.destroyed) try { guestPeer.reconnect(); } catch (e) {} }, 1500); });
            const r = await dial(false);
            if (r !== 'ok') throw err(r === 'timeout' || r === 'closed' ? 'unreachable' : r);
          }
          tickT = setInterval(tick, SEND_MS);
          settled = true;
          resolve(api);
        } catch (e) {
          window.removeEventListener('pagehide', onHide);
          shutdown();
          reject(e && e.code ? e : err('upstream_error'));
        }
      })();
    });
  }
})();
