/* 汐風GP — kart physics, drifting, tricks, status effects and CPU drivers */
(function () {
  'use strict';
  const G = window.G;
  const Track = G.Track;
  const { ROAD, CURB, EDGE } = G.TRACK_DIMS;
  const WALL = EDGE - 1.05;
  const DRIFT_LV = [0, 0.9, 1.9, 3.0];
  G.DRIFT_COLORS = [0xffffff, 0x5ab8ff, 0xffb54a, 0xff6be0];
  const HIT = { oil: [1.0, 4.5], balloon: [1.25, 4.5], ball: [1.15, 5.5], hanabi: [1.35, 6.5], bomb: [1.6, 10], wave: [1.9, 11], bump: [0.85, 3.5] };

  class Kart {
    constructor(char, index, isPlayer, opts) {
      this.c = char;
      this.index = index;
      this.isPlayer = isPlayer;
      this.model = opts.model || G.buildKartModel(char);
      const st = char.stats;
      this.vmaxBase = opts.vmax * (0.94 + st.speed * 0.026);
      this.acc = 8 + st.accel * 2.0;
      this.turn = 1.42 + st.handling * 0.1;
      this.mass = 0.75 + st.weight * 0.13;
      this.skill = opts.skill || 1;
      this.loc = {};
      this.ai = isPlayer ? null : {
        line: G.rand(-3.5, 3.5), lineT: 0, itemWait: 0, driftHold: false, aggr: Math.random(), boxSeek: Math.random() < 0.6,
      };
    }
    place(s, d) {
      const p = Track.at(s, d);
      this.x = p.x; this.z = p.z; this.y = p.y;
      this.h = p.heading;
      this.vx = 0; this.vz = 0; this.speed = 0; this.lat = 0;
      this.hopY = 0; this.vy = 0; this.air = false; this.onRamp = false; this.rampAir = false; this.trick = false; this.trickT = 0;
      this.drift = { on: false, dir: 0, charge: 0, level: 0, visual: 0 };
      this.boostT = 0; this.boostPow = 1; this.spinT = 0; this.spinVis = 0; this.invT = 0; this.stallT = 0;
      this.shieldT = 0; this.item = null; this.itemCount = 0; this.rollT = 0; this.orbit = 0;
      this.happiT = 0; this.uchiwaT = 0; this.stickT = 0; this.inkT = 0;
      this.offroad = false; this.wallT = 0;
      this.steerVis = 0; this.squash = 0; this.pitch = 0; this.roll = 0; this.age = 0;
      Track.locate(this.x, this.z, null, this.loc);
      this.prevS = this.loc.s;
      this.lap = 0; this.lapStart = 0; this.lapTimes = [];
      this.progress = this.loc.s - Track.L;
      this.finished = false; this.finishTime = Infinity; this.place_ = 0; this.estTime = undefined;
      this.driftPrev = false;
      this.startCharge = -1;
      this.wrongT = 0;
      this.model.root.visible = true;
      this.model.root.position.set(this.x, this.y, this.z);
      this.model.root.rotation.set(0, this.h, 0);
    }
    get vmax() { return this.vmaxBase * (this.vmaxScale || 1); }

    boost(time, pow) {
      if (this.boostT <= 0) this.boostPow = pow;
      else this.boostPow = Math.max(this.boostPow, pow);
      this.boostT = Math.max(this.boostT, time);
    }

    hit(kind) {
      if (this.remote) return false;
      if (this.finished && !this.isPlayer) return false;
      if (this.happiT > 0) return false;
      const loud = this.isPlayer || G.near(this);
      if (this.shieldT > 0) {
        this.shieldT = 0;
        G.FX.burst(this.x, this.y + 1, this.z, 0xb9a9ff, 26, 9);
        if (loud) G.Audio.play('block');
        return false;
      }
      if (this.orbit > 0 && kind !== 'wave' && kind !== 'bomb' && kind !== 'bump') {
        this.orbit--;
        this.itemCount--;
        if (this.itemCount <= 0) { this.item = null; this.itemCount = 0; this.orbit = 0; }
        G.FX.burst(this.x, this.y + 1, this.z, 0x7fe6ff, 24, 8);
        if (loud) G.Audio.play('splash');
        return false;
      }
      if (this.invT > 0) return false;
      if (kind === 'sticky') {
        this.stickT = 1.6;
        this.invT = 0.5;
        this.vx *= 0.6; this.vz *= 0.6;
        this.drift.on = false; this.drift.charge = 0; this.drift.level = 0;
        if (loud) G.Audio.play('puff');
        if (this.isPlayer) G.shake(0.2);
        return true;
      }
      const P = HIT[kind] || HIT.oil;
      this.spinT = P[0];
      this.invT = P[0] + 0.9;
      const keep = kind === 'wave' || kind === 'bomb' ? 0.12 : 0.28;
      this.vx *= keep; this.vz *= keep;
      this.lat *= 0.3;
      this.vy = P[1]; this.air = true; this.rampAir = false; this.trick = false;
      this.drift.on = false; this.drift.charge = 0; this.drift.level = 0;
      this.boostT = 0;
      if (this.isPlayer) { G.Audio.play('hit'); G.shake(kind === 'bomb' || kind === 'wave' ? 0.9 : 0.6); G.UI.flash(); }
      else if (G.near(this)) G.Audio.play('hit');
      if (kind === 'balloon') G.FX.burst(this.x, this.y + 1.2, this.z, 0x7fe6ff, 40, 10);
      return true;
    }

    rampHeight(loc) {
      const ramps = G.World.ramps;
      if (!ramps || Math.abs(loc.d) > ROAD - 0.2) return 0;
      for (const r of ramps) {
        const ds = loc.s - r.s;
        if (ds >= 0 && ds <= r.len) return (ds / r.len) * r.h;
      }
      return 0;
    }

    /* ctl: steer [-1,1], accel 0..1, brake 0..1, drift bool, item edge bool */
    update(dt, ctl, race) {
      this.age += dt;
      const loc = Track.locate(this.x, this.z, this.loc.i, this.loc);
      const fx = Math.sin(this.h), fz = Math.cos(this.h);
      const rx = -fz, rz = fx;
      let speed = this.vx * fx + this.vz * fz;
      let lat = this.vx * rx + this.vz * rz;
      const absD = Math.abs(loc.d);
      const happi = this.happiT > 0;
      this.offroad = absD > CURB + 0.3 && !happi;
      const onPad = G.World.pads && !this.air && G.World.pads.some((p) => {
        let ds = loc.s - p.s;
        if (ds < -Track.L / 2) ds += Track.L;
        return Math.abs(ds) < p.len && Math.abs(loc.d - p.d) < p.half + 0.4;
      });
      if (onPad) {
        if (this.boostT < 0.9 && this.isPlayer) { G.Audio.play('boost'); G.shake(0.15); }
        this.boost(1.1, 1.38);
      }

      let vmax = this.vmax;
      if (this.offroad && this.boostT <= 0) vmax *= 0.52;
      if (this.boostT > 0) vmax *= this.boostPow;
      if (happi) vmax *= this.boostT > 0 ? 1.04 : 1.27;
      if (this.stickT > 0) vmax *= 0.42;
      const spinning = this.spinT > 0;
      let accel = spinning || this.stallT > 0 ? 0 : ctl.accel;
      let brake = spinning ? 0 : ctl.brake;
      const holding = race.mode === 'count' || race.mode === 'wait';
      if (holding) { accel = 0; brake = 0; }

      // longitudinal
      if (holding) {
        speed = G.damp(speed, 0, 6, dt);
      } else if ((this.boostT > 0 || happi) && !spinning) {
        speed += (happi ? 26 : 36) * dt;
        if (speed > vmax) speed = G.damp(speed, vmax, 3, dt);
      } else if (accel > 0 && speed >= -0.5) {
        if (speed < vmax) speed += this.acc * accel * (1.15 - 0.75 * Math.max(0, speed) / vmax) * dt;
        else speed = G.damp(speed, vmax, this.offroad || this.stickT > 0 ? 2.6 : 1.1, dt);
      } else if (brake > 0) {
        if (speed > 0.6) speed -= 32 * dt;
        else speed = Math.max(-9, speed - 10 * dt);
      } else {
        const drag = spinning ? 16 : 5.5;
        speed = speed > 0 ? Math.max(0, speed - drag * dt) : Math.min(0, speed + drag * dt);
        if (speed > vmax) speed = G.damp(speed, vmax, 1.4, dt);
      }
      if ((this.offroad || this.stickT > 0) && speed > vmax) speed = G.damp(speed, vmax, 2.8, dt);

      // hop / drift / tricks
      const dHeld = ctl.drift && !spinning;
      const dEdge = dHeld && !this.driftPrev;
      if (this.rampAir && dEdge && !this.trick) {
        this.trick = true; this.trickT = 0;
        if (this.isPlayer) G.Audio.play('trick');
      }
      if (dEdge && !this.air && !this.onRamp && speed > 6) {
        this.vy = 4.6; this.air = true;
        if (this.isPlayer) G.Audio.play('hop');
      }
      const d = this.drift;
      if (dHeld && !d.on && !this.rampAir && Math.abs(ctl.steer) > 0.3 && speed > 11) {
        d.on = true; d.dir = Math.sign(ctl.steer); d.charge = 0; d.level = 0;
      }
      if (d.on) {
        if (!dHeld || speed < 8 || spinning || this.stickT > 0) {
          if (d.level > 0 && !spinning && !dHeld && speed > 6) {
            const t = [0, 0.7, 1.15, 1.7][d.level];
            const p = [1, 1.26, 1.32, 1.4][d.level];
            this.boost(t, p);
            if (this.isPlayer) { G.Audio.play('mini', d.level); G.shake(0.12 * d.level); }
            G.FX.burst(this.x - fx * 1.6, this.y + 0.6, this.z - fz * 1.6, G.DRIFT_COLORS[d.level], 14 + d.level * 6, 6);
          }
          d.on = false; d.charge = 0; d.level = 0;
        } else {
          const tight = ctl.steer * d.dir;
          const rate = this.offroad ? 0.35 : 1 + Math.max(0, tight) * 0.85;
          d.charge += rate * dt;
          const lv = d.charge > DRIFT_LV[3] ? 3 : d.charge > DRIFT_LV[2] ? 2 : d.charge > DRIFT_LV[1] ? 1 : 0;
          if (lv > d.level) {
            d.level = lv;
            if (this.isPlayer) G.Audio.play('charge', lv);
          }
        }
      }
      this.driftPrev = dHeld;

      // steering
      let steerIn = ctl.steer;
      if (this.inkT > 0 && !this.isPlayer) steerIn = G.clamp(steerIn + Math.sin(this.age * 7 + this.index) * 0.55, -1, 1);
      const sp01 = G.clamp(Math.abs(speed) / 10, 0, 1);
      const hiSpeedDamp = 1 - 0.22 * G.clamp(speed / this.vmaxBase, 0, 1.3);
      if (spinning) {
        this.spinVis += dt * 13;
      } else if (d.on) {
        const tight = steerIn * d.dir;
        const f = 0.56 + 0.5 * tight;
        this.h -= d.dir * this.turn * 1.12 * f * dt;
      } else {
        const st = steerIn * this.turn * sp01 * hiSpeedDamp * (speed < 0 ? -1 : 1) * (this.air ? 0.6 : 1);
        this.h -= st * dt;
      }
      this.steerVis = G.damp(this.steerVis, spinning ? 0 : steerIn, 10, dt);
      d.visual = G.damp(d.visual, d.on ? d.dir : 0, 7, dt);

      // lateral grip
      const grip = d.on ? 2.4 : this.offroad ? 5 : 8.5;
      lat *= Math.exp(-grip * dt);
      if (d.on) lat += d.dir * -speed * 0.25 * dt;
      const nfx = Math.sin(this.h), nfz = Math.cos(this.h);
      const nrx = -nfz, nrz = nfx;
      this.vx = nfx * speed + nrx * lat;
      this.vz = nfz * speed + nrz * lat;
      this.speed = speed;
      this.lat = lat;

      this.x += this.vx * dt;
      this.z += this.vz * dt;

      // vertical: hops, ramps, landings
      if (this.air) {
        this.vy -= 24 * dt;
        this.hopY += this.vy * dt;
        if (this.trick) this.trickT += dt;
        if (this.hopY <= 0) {
          this.hopY = 0; this.air = false;
          this.squash = Math.min(1, Math.abs(this.vy) / 10);
          if (this.rampAir) {
            if (this.trick && !spinning) {
              this.boost(0.95, 1.36);
              if (this.isPlayer) { G.Audio.play('mini', 2); G.shake(0.2); G.UI.toast('トリック！'); }
              G.FX.burst(this.x, this.y + 0.8, this.z, 0xffd75e, 26, 7);
            }
            this.rampAir = false; this.trick = false;
            if (this.isPlayer) G.shake(0.25);
          }
          this.vy = 0;
        }
      } else {
        const rh = this.rampHeight(loc);
        if (rh > 0) { this.hopY = rh; this.onRamp = true; }
        else if (this.onRamp) {
          this.onRamp = false;
          if (speed > 10 && !spinning) {
            this.air = true; this.rampAir = true; this.trick = false;
            this.vy = 5.5 + speed * 0.13;
            if (this.isPlayer) G.Audio.play('jump');
          } else this.hopY = 0;
        }
      }

      // walls
      Track.locate(this.x, this.z, loc.i, loc);
      if (Math.abs(loc.d) > WALL) {
        const sgn = Math.sign(loc.d);
        const push = Math.abs(loc.d) - WALL;
        const trx = -loc.tz, trz = loc.tx;
        this.x -= trx * sgn * push;
        this.z -= trz * sgn * push;
        const vn = (this.vx * trx + this.vz * trz) * sgn;
        if (vn > 0) {
          this.vx -= trx * sgn * vn * 1.5;
          this.vz -= trz * sgn * vn * 1.5;
          const loss = G.clamp(vn / 25, 0.02, 0.4);
          this.vx *= 1 - loss; this.vz *= 1 - loss;
          const dh = G.wrapAng(loc.heading - this.h);
          if (Math.abs(dh) < 1.4) this.h += dh * Math.min(1, 0.25 + vn * 0.03);
          if (vn > 4 && this.wallT <= 0) {
            this.wallT = 0.25;
            if (this.isPlayer) { G.Audio.play('wall'); G.shake(Math.min(0.5, vn * 0.04)); }
            G.FX.burst(this.x + trx * sgn * 1, this.y + 0.6, this.z + trz * sgn * 1, 0xffd27a, 10, 5);
          }
          if (d.on && vn > 2.5) { d.on = false; d.charge = 0; d.level = 0; }
        }
      }
      this.y = loc.y;

      // timers
      this.boostT = Math.max(0, this.boostT - dt);
      if (this.boostT <= 0) this.boostPow = 1;
      if (this.spinT > 0) { this.spinT -= dt; if (this.spinT <= 0) this.spinVis = 0; }
      this.invT = Math.max(0, this.invT - dt);
      this.stallT = Math.max(0, this.stallT - dt);
      this.shieldT = Math.max(0, this.shieldT - dt);
      this.happiT = Math.max(0, this.happiT - dt);
      this.stickT = Math.max(0, this.stickT - dt);
      this.inkT = Math.max(0, this.inkT - dt);
      this.wallT -= dt;

      // wrong way detection
      const along = Math.cos(G.wrapAng(this.h - loc.heading));
      this.wrongT = along < -0.35 && Math.abs(speed) > 3 ? this.wrongT + dt : 0;

      // lap progress
      const ds = loc.s - this.prevS;
      if (ds < -Track.L / 2) { this.lap++; race.onLap(this); }
      else if (ds > Track.L / 2) this.lap--;
      this.prevS = loc.s;
      this.progress = (this.lap - 1) * Track.L + loc.s;

      // items
      if (this.rollT > 0) {
        this.rollT -= dt;
        if (this.rollT <= 0) G.Items.settle(this, race);
      }
      if (ctl.item && this.item && this.rollT <= 0 && !spinning) G.Items.use(this, race);
    }

    visual(dt, t) {
      const m = this.model;
      m.root.position.set(this.x, this.y + 0.02, this.z);
      const dv = this.drift.visual;
      m.root.rotation.y = this.h - dv * 0.42 + (this.spinT > 0 ? this.spinVis : 0);
      const ahead = Track.at(this.loc.s + 3, 0);
      const behind = Track.at(this.loc.s - 3, 0);
      const slope = Math.atan2(ahead.y - behind.y, 6);
      const along = Math.cos(G.wrapAng(this.h - this.loc.heading));
      let pitchGoal = -slope * along;
      if (this.onRamp) pitchGoal -= 0.16;
      if (this.rampAir) pitchGoal += G.clamp(-this.vy * 0.02, -0.15, 0.2);
      this.pitch = G.damp(this.pitch, pitchGoal, 8, dt);
      const latAcc = this.speed * (this.steerVis * this.turn) * 0.02;
      this.roll = G.damp(this.roll, G.clamp(latAcc, -0.12, 0.12) + dv * 0.07, 6, dt);
      m.tilt.position.y = this.hopY;
      let trickRoll = 0;
      if (this.trick) {
        const e = G.clamp(this.trickT / 0.5, 0, 1);
        trickRoll = (1 - Math.pow(1 - e, 3)) * Math.PI * 2 * (this.index % 2 ? 1 : -1);
        if (Math.random() < 0.6) G.FX.glow(this.x + G.rand(-1, 1), this.y + this.hopY + G.rand(0.5, 1.8), this.z + G.rand(-1, 1), 0, 1, 0, 0xffe7a3, 0.35, 0.5);
      }
      m.tilt.rotation.set(this.pitch, 0, this.roll + trickRoll);
      this.squash = Math.max(0, this.squash - dt * 4);
      const sq = Math.sin(this.squash * Math.PI) * 0.12;
      m.tilt.scale.set(1 + sq, 1 - sq, 1 + sq);
      m.driver.rotation.z = -this.steerVis * 0.12 - dv * 0.08;
      m.driver.position.y = this.finished ? Math.abs(Math.sin(t * 7 + this.index)) * 0.12 : 0;
      m.headPivot.rotation.y = this.spinT > 0 ? Math.sin(t * 20) * 0.4 : -this.steerVis * 0.25;
      m.headPivot.rotation.x = Math.sin(t * 9 + this.index) * 0.03 * G.clamp(this.speed / 20, 0, 1);
      for (const w of m.wheels) {
        w.spin.rotation.x += (this.speed / w.r) * dt;
        if (w.front) w.pivot.rotation.y = -this.steerVis * 0.45;
      }
      // flames
      const boosting = this.boostT > 0 || this.happiT > 0;
      const gold = this.uchiwaT > 0;
      for (const f of m.flames) {
        f.visible = boosting || this.drift.level > 0;
        if (!f.visible) continue;
        const k = boosting ? 1 : 0.35;
        f.scale.set(1 + Math.random() * 0.2, 1 + Math.random() * 0.2, k * (0.9 + Math.random() * 0.6) * (boosting ? 1.3 + (this.boostPow - 1) * 2 : 1));
        let col = boosting ? (gold ? 0xffe066 : 0xffb347) : G.DRIFT_COLORS[this.drift.level];
        if (this.happiT > 0) col = new THREE.Color().setHSL((t * 1.5) % 1, 1, 0.6).getHex();
        f.material.color.setHex(col);
      }
      m.shield.visible = this.shieldT > 0;
      if (m.shield.visible) {
        m.shield.material.opacity = 0.16 + 0.08 * Math.sin(t * 10) + (this.shieldT < 1.2 ? 0.1 * Math.sin(t * 40) : 0);
        m.shield.scale.setScalar(1 + Math.sin(t * 6) * 0.03);
      }
      // orbiting balloons
      for (let i = 0; i < m.orbit.children.length; i++) m.orbit.children[i].visible = i < this.orbit;
      m.orbit.visible = this.orbit > 0;
      if (this.orbit > 0) m.orbit.rotation.y = t * 4.2 - m.root.rotation.y + this.h;
      // dizzy stars
      const dizzy = this.spinT > 0 || this.stickT > 0;
      m.stars.visible = dizzy;
      if (dizzy) { m.stars.rotation.y = t * 6; m.stars.position.y = 2.75 + Math.sin(t * 8) * 0.06; }
      // party aura
      m.aura.visible = this.happiT > 0;
      if (m.aura.visible) {
        m.aura.material.color.setHSL((t * 0.9) % 1, 0.95, 0.62);
        const pulse = 1 + Math.sin(t * 14) * 0.08;
        m.aura.scale.set(7 * pulse, 6 * pulse, 1);
        m.aura.material.opacity = this.happiT < 1.2 ? 0.35 + 0.35 * Math.abs(Math.sin(t * 20)) : 0.7;
      }
      m.ink.visible = this.inkT > 0 && !this.isPlayer;
      m.blob.position.y = 0.06 - this.hopY;
      m.root.visible = !(this.invT > 0 && this.spinT <= 0 && this.stickT <= 0 && Math.floor(t * 18) % 2 === 0);

      // particles + skid marks
      const fx = Math.sin(this.h), fz = Math.cos(this.h);
      const rx = -fz, rz = fx;
      const near = this.isPlayer || G.near(this);
      const marking = !this.air && (this.drift.on || (this.spinT > 0 && Math.abs(this.speed) > 3) || (Math.abs(this.lat) > 3.5 && Math.abs(this.speed) > 8));
      for (const s of [-1, 1]) {
        const px = this.x - fx * 0.86 + rx * s * 0.9, pz = this.z - fz * 0.86 + rz * s * 0.9;
        G.FX.skids.add(this.index * 2 + (s > 0 ? 1 : 0), px, this.y, pz, marking && !this.offroad);
      }
      if (this.drift.on && this.drift.level > 0 && !this.air) {
        const col = G.DRIFT_COLORS[this.drift.level];
        for (const s of [-1, 1]) {
          const px = this.x - fx * 0.9 + rx * s * 0.9, pz = this.z - fz * 0.9 + rz * s * 0.9;
          for (let n = 0; n < (near ? 2 : 1); n++) G.FX.spark(px, this.y + 0.15, pz, -fx * 3 + rx * s * G.rand(1, 4) + G.rand(-1, 1), G.rand(1.5, 5), -fz * 3 + rz * s * G.rand(1, 4) + G.rand(-1, 1), col, G.rand(0.16, 0.34), G.rand(0.18, 0.36));
        }
      } else if (this.drift.on && !this.air && Math.random() < 0.6) {
        G.FX.dust(this.x - fx * 1.0 + rx * this.drift.dir * -0.8, this.y + 0.2, this.z - fz * 1.0 + rz * this.drift.dir * -0.8, 0xe8dcf0, 0.7);
      }
      if (this.offroad && Math.abs(this.speed) > 6 && Math.random() < 0.7) {
        G.FX.dust(this.x - fx * 1.2 + rx * G.rand(-0.8, 0.8), this.y + 0.2, this.z - fz * 1.2 + rz * G.rand(-0.8, 0.8), 0xf2d6ab, 1.1);
      }
      if (boosting && Math.random() < 0.9) {
        for (const s of [-1, 1]) G.FX.spark(this.x - fx * 1.75 + rx * s * 0.28, this.y + 0.8 + this.hopY, this.z - fz * 1.75 + rz * s * 0.28, -fx * 6 + G.rand(-1, 1), G.rand(0, 2), -fz * 6 + G.rand(-1, 1), gold ? 0xffe066 : 0xffb347, 0.45, 0.22);
      }
      if (this.happiT > 0 && near) {
        const c = new THREE.Color().setHSL(Math.random(), 1, 0.65).getHex();
        G.FX.glow(this.x - fx * 1.4 + G.rand(-1, 1), this.y + G.rand(0.3, 2), this.z - fz * 1.4 + G.rand(-1, 1), -fx * 3, G.rand(0, 1), -fz * 3, c, G.rand(0.22, 0.42), 0.6);
      }
      if (this.stickT > 0 && Math.random() < 0.5) G.FX.dust(this.x + G.rand(-1, 1), this.y + 0.6, this.z + G.rand(-1, 1), 0xffc7de, 1.2);
      if (near && !boosting && this.speed > 1 && this.speed < 14 && Math.random() < 0.15) {
        for (const s of [-1, 1]) G.FX.dust(this.x - fx * 1.8 + rx * s * 0.28, this.y + 0.9, this.z - fz * 1.8 + rz * s * 0.28, 0xd9cfe6, 0.6);
      }
    }

    /* ---------------- network: compact state, interpolated remote copies ---------------- */
    netFlags() {
      const d = this.drift;
      let f = 0;
      if (d.on) f |= 1;
      if (d.dir > 0) f |= 2;
      f |= (d.level & 3) << 2;
      if (this.boostT > 0) f |= 16;
      if (this.spinT > 0) f |= 32;
      if (this.air) f |= 64;
      if (this.happiT > 0) f |= 128;
      if (this.shieldT > 0) f |= 256;
      if (this.stickT > 0) f |= 512;
      if (this.uchiwaT > 0) f |= 1024;
      if (this.finished) f |= 2048;
      f |= (Math.min(3, this.orbit || 0) & 3) << 12;
      if (this.trick) f |= 16384;
      return f;
    }
    serialize() {
      const r = (v, n) => Math.round(v * n) / n;
      return [r(this.x, 10), r(this.y, 10), r(this.z, 10), r(this.h, 1000), r(this.speed, 10), r(this.hopY, 100), this.netFlags(), this.lap, r(this.loc.s, 10), this.finished ? r(this.finishTime, 1000) : 0];
    }
    // st = serialize() output, sent = sender clock (ms), now = local clock (ms)
    netPush(st, sent, now) {
      if (!Array.isArray(st) || st.length < 9) return;
      const nb = this.net || (this.net = { buf: [], off: Infinity });
      nb.rxAt = now;
      // one-way offset between the sender's clock and ours: track the fastest delivery, drift up slowly
      const o = now - sent;
      if (nb.off === Infinity || o < nb.off) nb.off = o;
      else nb.off += (o - nb.off) * 0.01;
      const last = nb.buf[nb.buf.length - 1];
      if (last && sent <= last.t) return;
      nb.buf.push({ t: sent, st });
      if (nb.buf.length > 24) nb.buf.shift();
    }
    netStep(dt, race, now) {
      const nb = this.net;
      if (!nb || !nb.buf.length) return;
      // a player we have not heard from for a while fades off the track until they are back
      const away = this.human && now - nb.rxAt > 6000;
      if (away !== !!this.away) { this.away = away; this.model.root.visible = !away; }
      if (away) return;
      const target = now - nb.off - 110;
      const buf = nb.buf;
      let a = buf[0], b = null;
      for (let i = buf.length - 1; i >= 0; i--) { if (buf[i].t <= target) { a = buf[i]; b = buf[i + 1] || null; break; } }
      let st = a.st;
      let x = st[0], y = st[1], z = st[2], h = st[3];
      if (b) {
        const k = G.clamp((target - a.t) / Math.max(1, b.t - a.t), 0, 1);
        x += (b.st[0] - x) * k; y += (b.st[1] - y) * k; z += (b.st[2] - z) * k;
        h += G.wrapAng(b.st[3] - h) * k;
        st = k > 0.5 ? b.st : a.st;
      } else {
        // extrapolate a little past the newest sample
        const ex = G.clamp((target - a.t) / 1000, 0, 0.3);
        x += Math.sin(h) * st[4] * ex; z += Math.cos(h) * st[4] * ex;
      }
      const dh = G.wrapAng(h - this.h);
      this.steerVis = G.damp(this.steerVis, G.clamp(-dh / Math.max(dt, 1e-3) / (this.turn * 1.2), -1, 1), 8, dt);
      this.x = x; this.y = y; this.z = z; this.h = h;
      this.speed = st[4];
      this.hopY = st[5];
      const f = st[6] | 0;
      const d = this.drift;
      d.on = !!(f & 1); d.dir = f & 2 ? 1 : -1; d.level = (f >> 2) & 3;
      d.visual = G.damp(d.visual, d.on ? d.dir : 0, 7, dt);
      this.boostT = f & 16 ? 0.3 : 0; this.boostPow = 1.35;
      if (f & 32) { this.spinT = 0.5; this.spinVis += dt * 13; } else { this.spinT = 0; this.spinVis = 0; }
      this.air = !!(f & 64);
      this.happiT = f & 128 ? 1 : 0;
      this.shieldT = f & 256 ? 1 : 0;
      this.stickT = f & 512 ? 1 : 0;
      this.uchiwaT = f & 1024 ? 1 : 0;
      this.orbit = (f >> 12) & 3;
      if (f & 16384) { if (!this.trick) this.trickT = 0; this.trick = true; this.trickT += dt; } else this.trick = false;
      this.lap = st[7];
      Track.locate(this.x, this.z, this.loc.i, this.loc);
      this.offroad = Math.abs(this.loc.d) > CURB + 0.3 && !(f & 128);
      this.lat = 0;
      this.progress = (this.lap - 1) * Track.L + this.loc.s;
      if ((f & 2048) && !this.finished) {
        this.finished = true;
        this.finishTime = st[9] || race.t;
        race.finishOrder.push(this);
      }
      this.age += dt;
    }

    /* ---------------- CPU driver ---------------- */
    think(dt, race) {
      const ai = this.ai;
      const loc = this.loc;
      const sp = Math.max(8, this.speed);
      const look = 9 + sp * 0.5;
      let curv = 0;
      for (let k = 0; k < 6; k++) curv += Track.curv[Track.idx(loc.s + 6 + k * 6)];
      curv /= 6;
      let curvNear = 0;
      for (let k = 0; k < 3; k++) curvNear += Track.curv[Track.idx(loc.s + 2 + k * 4)];
      curvNear /= 3;
      ai.lineT -= dt;
      if (ai.lineT <= 0) { ai.line = G.rand(-4, 4); ai.lineT = G.rand(2, 5); }
      let target = G.clamp(curv * 330, -6, 6) * 0.9 + ai.line * 0.5;
      if (ai.boxSeek && !this.item && this.rollT <= 0) {
        for (const rs of G.World.itemRows) {
          let ds = rs - loc.s;
          if (ds < 0) ds += Track.L;
          if (ds > 6 && ds < 45) { target = [-6, -2, 2, 6][this.index % 4]; break; }
        }
      }
      for (const o of race.karts) {
        if (o === this) continue;
        let ds = o.loc.s - loc.s;
        if (ds < -Track.L / 2) ds += Track.L;
        if (ds > 0 && ds < 10 && Math.abs(o.loc.d - target) < 2.6) target += o.loc.d > loc.d ? -2.8 : 2.8;
      }
      for (const h of G.Items.hazards) {
        let ds = h.s - loc.s;
        if (ds < -Track.L / 2) ds += Track.L;
        if (ds > 0 && ds < 28 && Math.abs(h.d - target) < 2.6) target += h.d > target ? -3.2 : 3.2;
      }
      target = G.clamp(target, -ROAD + 1.6, ROAD - 1.6);
      const p = Track.at(loc.s + look, target);
      const desired = Math.atan2(p.x - this.x, p.z - this.z);
      const err = G.wrapAng(desired - this.h);
      const steer = G.clamp(-err * 2.6, -1, 1);
      const ctl = { steer, accel: 1, brake: 0, drift: false, item: false };
      if (Math.abs(err) > 0.75 && this.speed > 16) ctl.brake = 1;
      if (this.speed < 3 && Math.abs(err) > 1.2) { ctl.accel = 0; ctl.brake = 1; ctl.steer = -steer; }
      // drifting
      const turnDir = Math.sign(curvNear);
      if (!ai.driftHold && !this.rampAir && Math.abs(curvNear) > 0.012 && Math.abs(curv) > 0.011 && Math.sign(curv) === turnDir && this.speed > 15 && Math.random() < dt * (2 + this.skill * 3)) {
        ai.driftHold = true;
        ai.driftDir = turnDir;
      }
      if (ai.driftHold) {
        ctl.drift = true;
        if (!this.drift.on) ctl.steer = ai.driftDir;
        else ctl.steer = G.clamp(steer * 1.2, -1, 1);
        const wantLv = this.skill > 0.98 ? 2 : 1;
        const insideD = loc.d * (this.drift.on ? this.drift.dir : ai.driftDir);
        const ending = Math.abs(curv) < 0.007 || (this.drift.on && this.drift.dir !== Math.sign(curv) && Math.abs(curv) > 0.004);
        const tooInside = insideD > ROAD - 1.5;
        const cashIn = this.drift.level >= wantLv && Math.abs(curvNear) < 0.01;
        if (ending || tooInside || cashIn || (this.drift.on && this.offroad)) { ai.driftHold = false; ctl.drift = false; }
      }
      // tricks off ramps
      if (this.rampAir && !this.trick && Math.random() < dt * 5 * this.skill) ctl.drift = !this.driftPrev;
      // items
      if (this.item && this.rollT <= 0) {
        ai.itemWait -= dt;
        if (ai.itemWait <= 0) {
          const it = this.item;
          const ahead = (maxGap, lane) => race.karts.some((o) => {
            if (o === this || o.finished) return false;
            const g = o.progress - this.progress;
            return g > 0 && g < maxGap && (lane == null || Math.abs(o.loc.d - loc.d) < lane);
          });
          const behind = (maxGap) => race.karts.some((o) => {
            if (o === this) return false;
            const g = this.progress - o.progress;
            return g > 0 && g < maxGap;
          });
          let use = false;
          switch (it) {
            case 'turbo': case 'triple': case 'uchiwa': use = Math.abs(curv) < 0.006 || this.offroad; break;
            case 'happi': use = Math.abs(curv) < 0.008 || ai.itemWait < -3; break;
            case 'shield': use = true; break;
            case 'oil': case 'wataame': use = behind(30) || ai.itemWait < -8; break;
            case 'balloon': use = ahead(45, 3.5) || ai.itemWait < -10; break;
            case 'beachball': use = ahead(60, 7) || ai.itemWait < -6; break;
            case 'balloon3': use = !this.orbit || ahead(35, 3.5); break;
            case 'hanabi': use = ahead(220) || ai.itemWait < -6; break;
            case 'takoyaki': use = ahead(45) || ai.itemWait < -8; break;
            case 'ink': use = ahead(220) || ai.itemWait < -10; break;
            case 'wave': use = this.place_ > 1; break;
          }
          if (use) { ctl.item = true; ai.itemWait = it === 'uchiwa' ? G.rand(0.5, 0.9) : G.rand(0.6, 2); }
        }
      } else ai.itemWait = G.rand(1, 3.5);
      return ctl;
    }
  }
  G.Kart = Kart;

  // kart-to-kart bumps
  G.collideKarts = function (karts) {
    const R = 1.25;
    for (let i = 0; i < karts.length; i++) {
      for (let j = i + 1; j < karts.length; j++) {
        const a = karts[i], b = karts[j];
        const dx = b.x - a.x, dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > 4 * R * R || d2 < 1e-6) continue;
        if (Math.abs((a.y + a.hopY) - (b.y + b.hopY)) > 1.4) continue;
        if ((a.remote && b.remote) || a.away || b.away) continue;
        if (a.happiT > 0 && !(b.happiT > 0)) { b.hit('bump'); }
        else if (b.happiT > 0 && !(a.happiT > 0)) { a.hit('bump'); }
        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;
        const overlap = 2 * R - d;
        let ma = a.mass * (a.happiT > 0 ? 4 : 1), mb = b.mass * (b.happiT > 0 ? 4 : 1);
        if (a.remote) ma = 1e6;
        if (b.remote) mb = 1e6;
        const tot = ma + mb;
        a.x -= nx * overlap * (mb / tot); a.z -= nz * overlap * (mb / tot);
        b.x += nx * overlap * (ma / tot); b.z += nz * overlap * (ma / tot);
        const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rv < 0) {
          const jimp = (-(1 + 0.6) * rv) / (1 / ma + 1 / mb);
          a.vx -= (jimp / ma) * nx; a.vz -= (jimp / ma) * nz;
          b.vx += (jimp / mb) * nx; b.vz += (jimp / mb) * nz;
          if (-rv > 3) {
            if (a.isPlayer || b.isPlayer) { G.Audio.play('bump'); G.shake(0.2); }
            G.FX.burst((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.7, (a.z + b.z) / 2, 0xfff6ea, 8, 4);
          }
        }
      }
    }
  };
})();
