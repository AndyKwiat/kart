import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CURB_WIDTH } from './track.js';

export const CAR_RADIUS = 1.6;

const MAX_SPEED = 52;
const ACCEL = 30;
const BRAKE = 55;
const REVERSE_MAX = 14;
const COAST = 7;
const STEER_RATE = 2.3;
const BOOST_MULT = 1.32;
// Scales how hard a drift swings the car (turn rate, outward slide, visual angle).
const DRIFT_STRENGTH = 0.7;
// Tyre grip: the most sideways acceleration the tyres can provide. Plenty at
// low and medium speed (steering stays crisp), dropping toward GRIP_TOP near
// top speed, so a hard turn flat out makes the car skid wide. Shared by the
// player and the AI. Drifting uses its own handling and isn't limited.
const GRIP_TOP = 46;
const GRIP_LOW = 95;
export function gripLimit({ speed = 0, throttle = true, bank = 0, offroad = false } = {}) {
  const t = Math.min(1, Math.max(0, (Math.abs(speed) - 32) / 20));
  let a = GRIP_TOP + (GRIP_LOW - GRIP_TOP) * (1 - t * t * (3 - 2 * t));
  a *= 1 + 1.5 * Math.abs(bank);
  if (!throttle) a *= 1.1;
  if (offroad) a *= 0.8;
  return a;
}

// Fastest speed a bend of radius R can be taken at without skidding
// (memoised: the AI asks this a lot).
const cornerCache = new Map();
export function cornerSpeed(radius, opts = {}) {
  const key = `${Math.round(radius)}|${Math.round((opts.bank ?? 0) * 100)}`;
  let v = cornerCache.get(key);
  if (v === undefined) {
    v = solveCornerSpeed(Math.round(radius), opts);
    cornerCache.set(key, v);
  }
  return v;
}
function solveCornerSpeed(radius, opts) {
  let lo = 5, hi = 140;
  for (let n = 0; n < 14; n++) {
    const v = (lo + hi) / 2;
    if (v * v / radius > gripLimit({ ...opts, speed: v })) hi = v; else lo = v;
  }
  return lo;
}
const PUSH_MULT = 1.06; // gentle shove when rear-ended
const GRAVITY = 32;

const WHEEL_R = 0.55;

// Glossy "toy car" materials: clear-coated paint and chrome pick up the sky
// environment map for specular highlights; lights are over-bright so the bloom
// pass makes them glow.
const tireMat = new THREE.MeshStandardMaterial({ color: 0x1c1c20, roughness: 0.85 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 1, roughness: 0.18 });
const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x2a2c33, metalness: 0.6, roughness: 0.35 });
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0x1d2c4a, metalness: 0.1, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02,
});
const stripeMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.9, 2.4) });
const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.15, 0.1) });
const flameMat = new THREE.MeshBasicMaterial({
  color: new THREE.Color(3, 1.4, 0.3), transparent: true, opacity: 0.85,
  blending: THREE.AdditiveBlending, depthWrite: false,
});

const paintMat = (color) => new THREE.MeshPhysicalMaterial({
  color, metalness: 0.15, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.9,
});

const tireGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.56, 28);
tireGeo.rotateZ(Math.PI / 2);
const sidewallGeo = new THREE.TorusGeometry(WHEEL_R - 0.06, 0.07, 8, 28);
sidewallGeo.rotateY(Math.PI / 2);
const rimGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.6, 20);
rimGeo.rotateZ(Math.PI / 2);
const capGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.64, 12);
capGeo.rotateZ(Math.PI / 2);
const spokeGeo = new THREE.BoxGeometry(0.62, 0.07, 0.5);

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Collapse a group's child meshes into one mesh per material (keeping
// `keep` meshes separate). A car is ~40 parts; this cuts it to a handful of
// draw calls in both the main and shadow passes.
function mergeByMaterial(group, keep = []) {
  const buckets = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh || keep.includes(child)) continue;
    child.updateMatrix();
    const g = child.geometry.clone();
    g.applyMatrix4(child.matrix);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    const key = child.material;
    if (!buckets.has(key)) buckets.set(key, { geos: [], shadow: false });
    const b = buckets.get(key);
    b.geos.push(g);
    b.shadow ||= child.castShadow;
    group.remove(child);
  }
  for (const [material, { geos, shadow }] of buckets) {
    const indexed = geos.filter((g) => g.index);
    const plain = geos.filter((g) => !g.index);
    for (const list of [indexed, plain]) {
      if (!list.length) continue;
      const m = new THREE.Mesh(mergeGeometries(list), material);
      m.castShadow = shadow;
      group.add(m);
    }
  }
}

function buildMesh(color) {
  const root = new THREE.Group();
  const visual = new THREE.Group();
  const body = new THREE.Group();
  root.add(visual);
  visual.add(body);

  const paint = paintMat(color);
  const add = (parent, geo, mat, x, y, z, { shadow = true, rx = 0, ry = 0, rz = 0 } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = shadow;
    parent.add(m);
    return m;
  };
  const rbox = (w, h, d, r, seg = 4) => new RoundedBoxGeometry(w, h, d, seg, r);

  // Body: low tub, sloped nose, bulging fenders, bubble cabin.
  add(body, rbox(2.15, 0.5, 3.9, 0.22), paint, 0, 0.62, 0);
  add(body, rbox(1.9, 0.36, 1.55, 0.17), paint, 0, 0.92, 1.0, { rx: 0.13 });
  add(body, rbox(2.0, 0.42, 1.3, 0.2), paint, 0, 0.92, -1.25);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) add(body, rbox(0.72, 0.5, 1.3, 0.24), paint, sx * 1.16, 0.92, sz * 1.25);
  }
  add(body, rbox(1.56, 0.74, 1.7, 0.34, 5), glassMat, 0, 1.3, -0.3);
  add(body, rbox(1.62, 0.16, 1.35, 0.07), paint, 0, 1.68, -0.36);

  // Racing stripe over hood and roof.
  add(body, rbox(0.42, 0.04, 1.45, 0.02, 2), stripeMat, 0, 1.115, 1.0, { rx: 0.13, shadow: false });
  add(body, rbox(0.42, 0.04, 1.3, 0.02, 2), stripeMat, 0, 1.77, -0.36, { shadow: false });

  // Chrome bumper, dark grille, exhausts.
  add(body, rbox(2.0, 0.24, 0.26, 0.11), chromeMat, 0, 0.48, 1.98);
  add(body, rbox(1.2, 0.18, 0.08, 0.04, 2), darkMetalMat, 0, 0.74, 1.9, { shadow: false });
  add(body, rbox(1.9, 0.22, 0.24, 0.1), chromeMat, 0, 0.48, -1.98);
  for (const sx of [-1, 1]) {
    add(body, new THREE.CylinderGeometry(0.12, 0.14, 0.34, 14), chromeMat, sx * 0.5, 0.56, -2.04, { rx: Math.PI / 2, shadow: false });
    add(body, new THREE.CylinderGeometry(0.19, 0.19, 0.08, 18), headMat, sx * 0.62, 0.86, 1.82, { rx: Math.PI / 2 - 0.13, shadow: false });
    add(body, rbox(0.42, 0.16, 0.06, 0.03, 2), tailMat, sx * 0.65, 0.9, -1.92, { shadow: false });
  }

  // Wing on chrome struts.
  add(body, rbox(2.45, 0.1, 0.62, 0.05, 2), paint, 0, 1.48, -1.75);
  for (const sx of [-1, 1]) {
    add(body, rbox(0.1, 0.26, 0.5, 0.04, 2), paint, sx * 1.2, 1.44, -1.78);
    add(body, new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8), chromeMat, sx * 0.6, 1.24, -1.7);
  }

  const flame = add(body, new THREE.ConeGeometry(0.26, 1.3, 10), flameMat, 0, 0.48, -2.85, { rx: -Math.PI / 2, shadow: false });
  flame.visible = false;

  const wheels = [];
  const frontPivots = [];
  for (const [x, z, front] of [[-1.25, 1.25, true], [1.25, 1.25, true], [-1.25, -1.25, false], [1.25, -1.25, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, WHEEL_R, z);
    const spin = new THREE.Group();
    pivot.add(spin);
    add(spin, tireGeo, tireMat, 0, 0, 0);
    add(spin, sidewallGeo, tireMat, Math.sign(x) * 0.28, 0, 0, { shadow: false });
    add(spin, rimGeo, chromeMat, 0, 0, 0, { shadow: false });
    add(spin, capGeo, darkMetalMat, 0, 0, 0, { shadow: false });
    for (let k = 0; k < 3; k++) add(spin, spokeGeo, darkMetalMat, 0, 0, 0, { rx: (k / 3) * Math.PI, shadow: false });
    visual.add(pivot);
    wheels.push(spin);
    if (front) frontPivots.push(pivot);
  }

  mergeByMaterial(body, [flame]);
  for (const spin of wheels) mergeByMaterial(spin);

  return { root, visual, body, wheels, frontPivots, flame };
}

export class Car {
  constructor(color, name) {
    this.color = color;
    this.name = name;
    this.parts = buildMesh(color);
    this.mesh = this.parts.root;
    this.mesh.rotation.order = 'YXZ';
    this.impacts = []; // wall/car hits this frame, drained by the effects code
    this.maxSpeed = MAX_SPEED;
    this.respawnAfter = 2; // seconds off the track before being put back
  }

  reset(x, z, heading, idx, progress) {
    this.x = x; this.z = z;
    this.y = 0;
    this.slope = 0;
    this.pitch = 0;
    this.roll = 0;
    this.bankSlope = 0;
    this.vy = 0;
    this.airborne = false;
    this.squash = 0;
    this.push = 0;
    this.skid = 0;
    this.onIsland = false;
    this.outside = false; // flew over the wall and is off the track
    this.outTime = 0;
    this.exitIdx = idx;
    this.exitProgress = progress;
    this.respawned = false;
    this.vx = 0; this.vz = 0;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.idx = idx;
    this.progress = progress;
    this.lateral = 0;
    this.offroad = false;
    this.drifting = false;
    this.driftDir = 0;
    this.driftTime = 0;
    this.driftYaw = 0;
    this.boost = 0;
    this.hopY = 0; this.hopV = 0;
    this.wheelSpin = 0;
    this.finished = false;
    this.finishTime = 0;
    this.finishOrder = 0;
    this.updateVisual(0);
  }

  update(dt, input, track) {
    // Smooth digital steering so keyboard input feels analog.
    this.steer += (input.steer - this.steer) * Math.min(1, dt * 10);

    let fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let rx = -fz, rz = fx;
    let vf = this.vx * fx + this.vz * fz;
    let vl = this.vx * rx + this.vz * rz;

    // Drift: hop + slide, charge a mini-turbo while held.
    if (input.drift && !this.drifting && Math.abs(input.steer) > 0.3 && vf > 18 && this.hopY <= 0 && !this.airborne) {
      this.drifting = true;
      this.driftDir = Math.sign(input.steer);
      this.driftTime = 0;
      this.hopV = 5.5;
    }
    if (this.drifting) {
      this.driftTime += dt;
      if (!input.drift || vf < 10 || this.offroad) {
        if (!this.offroad) {
          if (this.driftTime > 1.7) this.boost = Math.max(this.boost, 1.1);
          else if (this.driftTime > 0.85) this.boost = Math.max(this.boost, 0.6);
        }
        this.drifting = false;
      }
    }

    let top = this.maxSpeed;
    if (this.offroad) top *= 0.45;
    if (this.boost > 0) {
      top *= BOOST_MULT;
      vf += ACCEL * 1.5 * dt;
      this.boost -= dt;
    } else if (this.push > 0) {
      // Being rear-ended: a weaker cousin of a boost.
      top *= PUSH_MULT;
      vf += ACCEL * 0.5 * dt;
    }
    this.push = Math.max(0, this.push - dt);

    if (this.airborne) {
      // Momentum carries you through the air; no throttle or brakes.
    } else if (input.throttle) {
      vf += ACCEL * dt * (vf < 0 ? 2 : 1);
    } else if (input.brake) {
      vf -= (vf > 0 ? BRAKE : ACCEL * 0.7) * dt;
      vf = Math.max(vf, -REVERSE_MAX);
    } else {
      const c = COAST * dt;
      vf = Math.abs(vf) <= c ? 0 : vf - Math.sign(vf) * c;
    }
    if (vf > top) vf -= (vf - top) * Math.min(1, dt * 2.5);
    // Hills: gravity pulls you back going up, pushes you going down.
    if (!this.airborne) vf -= 14 * this.slope * dt;

    const speedFactor = Math.min(1, Math.abs(vf) / 12);
    const highSpeedDamp = 1 - 0.35 * Math.min(1, Math.abs(vf) / MAX_SPEED);
    let steer = this.steer;
    if (this.drifting) steer = this.driftDir * 0.6 + this.steer * 0.5;
    let yawRate = steer * STEER_RATE * speedFactor * highSpeedDamp * Math.sign(vf);
    if (this.drifting) yawRate *= 1.2 * DRIFT_STRENGTH;
    if (this.airborne) yawRate *= 0.35;
    // Banked corners let you carry more speed through the turn.
    else yawRate *= 1 + 1.6 * Math.abs(this.bankSlope);
    const wx = fx * vf + rx * vl, wz = fz * vf + rz * vl; // velocity before turning
    this.heading = wrapAngle(this.heading - yawRate * dt);
    fx = Math.sin(this.heading); fz = Math.cos(this.heading);
    rx = -fz; rz = fx;

    if (this.drifting || this.airborne) {
      // Drifting (and flying) keep the arcade handling: the motion turns with
      // the car; drifts slide outward with loose lateral grip.
      if (this.drifting) vl -= this.driftDir * Math.abs(vf) * 0.45 * DRIFT_STRENGTH * dt;
      vl *= Math.exp(-(this.drifting ? 2.5 : 10) * dt);
      this.skid = 0;
    } else {
      // Tyres: the car's motion stays where it was while the nose turns; the
      // tyres pull it round, but only up to the grip limit. Turn harder than
      // that and the car skids wide (which also scrubs off speed).
      vf = wx * fx + wz * fz;
      vl = wx * rx + wz * rz;
      const want = vl * (1 - Math.exp(-30 * dt));
      const cap = gripLimit({ speed: vf, throttle: input.throttle, bank: this.bankSlope, offroad: this.offroad }) * dt;
      vl -= Math.max(-cap, Math.min(cap, want));
      this.skid = Math.abs(vl);
      if (this.skid > 1.5) vf -= Math.sign(vf) * Math.min(Math.abs(vf), this.skid * 1.1 * dt);
    }
    this.vx = fx * vf + rx * vl;
    this.vz = fz * vf + rz * vl;
    this.speed = vf;

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    this.hopV -= 30 * dt;
    this.hopY = Math.max(0, this.hopY + this.hopV * dt);
    if (this.hopY === 0) this.hopV = 0;

    this.constrain(track, dt);
    this.updateVisual(dt);
  }

  constrain(track, dt) {
    const prev = this.idx;
    this.idx = track.nearest(this.x, this.z, this.idx);
    let d = this.idx - prev;
    if (d > track.N / 2) d -= track.N;
    if (d < -track.N / 2) d += track.N;
    // No progress while off the track (no shortcuts across the countryside).
    if (!this.outside) this.progress += d;

    const r = track.right[this.idx];
    let lat = track.lateral(this.idx, this.x, this.z);
    const wall = track.wallOffset(this.idx);
    const s = Math.sign(lat) || 1;
    // Walls stop cars near the ground; a car flying higher than the barrier
    // sails over it (never in tunnels).
    const wallTop = track.roadHeight(this.idx, s * wall) + 1.1;
    const overWall = this.y > wallTop + 0.4 && !track.tunnelAt[this.idx];
    const inner = wall - CAR_RADIUS + 0.6, outer = wall + CAR_RADIUS;
    const bounce = (dir, at) => {
      // Push to lateral `at` and reflect velocity pointing toward `dir`.
      const push = at - lat;
      this.x += r.x * push;
      this.z += r.z * push;
      const vn = this.vx * r.x + this.vz * r.z;
      if (vn * dir > 0) {
        this.vx -= r.x * vn * 1.4;
        this.vz -= r.z * vn * 1.4;
        this.vx *= 0.96;
        this.vz *= 0.96;
        if (Math.abs(vn) > 2) {
          this.impacts.push({ x: this.x + r.x * dir * CAR_RADIUS, y: this.y + 0.6, z: this.z + r.z * dir * CAR_RADIUS, strength: Math.abs(vn) });
        }
      }
      lat = at;
    };
    if (!this.outside) {
      if (Math.abs(lat) > inner) {
        if (overWall) this.leaveTrack();
        else bounce(s, s * inner);
      }
    } else if (Math.abs(lat) < outer) {
      // Back over the wall only once clear of it; still low means you hit it.
      if (!overWall) bounce(-s, s * outer);
      else if (Math.abs(lat) < inner) this.rejoinTrack(track);
    }
    if (this.outside) {
      this.outTime += dt;
      if (this.outTime > this.respawnAfter) return this.respawn(track);
    }

    // Fork island: a solid curb for cars on the road, but you can jump onto
    // the mound (or clear it entirely) and drive off the other side.
    const iw = track.islandHw[this.idx], mid = track.islandMid[this.idx];
    if (iw > 0 && !this.outside && !this.onIsland) {
      const lim = iw + CAR_RADIUS - 0.3;
      const rel = lat - mid;
      if (Math.abs(rel) < lim) {
        const side = rel >= 0 ? 1 : -1;
        const top = Math.abs(rel) < iw ? track.islandTop(this.idx, lat) : track.islandTop(this.idx, mid + side * iw);
        if (this.y < top - 0.15) bounce(-side, mid + side * lim);
      }
    }
    this.lateral = lat;
    this.bankSlope = this.outside ? 0 : track.bank[this.idx];
    this.offroad = this.outside || Math.abs(lat) > track.hw[this.idx] + CURB_WIDTH;

    // Ground: road, island mound, or the terrain when off the track.
    let ground;
    if (this.outside && track.terrainY) {
      ground = track.terrainY(this.x, this.z);
      this.onIsland = false;
    } else {
      ground = track.heightAt(this.idx, this.x, this.z);
      // No road over a gap: fall into the canyon if you didn't make it.
      if (track.gapAt[this.idx]) {
        if (this.y < ground - 7) return this.fellIn(track);
        ground -= 60;
      }
      const top = iw > 0 && Math.abs(lat - mid) < iw ? track.islandTop(this.idx, lat) : -Infinity;
      this.onIsland = top > ground;
      if (this.onIsland) ground = top;
    }

    // Vertical: follow the ground unless it falls away faster than a
    // ballistic arc would (e.g. off a ramp lip), then fly until landing.
    if (this.airborne) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= ground) {
        const impact = -this.vy;
        this.y = ground;
        this.vy = 0;
        this.airborne = false;
        this.squash = Math.min(1, impact / 14);
        this.landed = impact;
        const keep = 1 - 0.08 * this.squash;
        this.vx *= keep;
        this.vz *= keep;
      }
    } else {
      const ballistic = this.y + this.vy * dt - 0.5 * GRAVITY * dt * dt;
      if (this.vy > 2 && ballistic > ground + 0.02) {
        this.airborne = true;
        this.y = ballistic;
        this.vy -= GRAVITY * dt;
      } else {
        this.vy = dt > 0 ? Math.max(-40, Math.min(40, (ground - this.y) / dt)) : 0;
        this.y = ground;
      }
    }
    if (!this.airborne && !this.outside && track.padAt(this.idx, lat)) this.boost = Math.max(this.boost, 0.9);
    // Tunnel roof: follows the arch (lower toward the walls).
    const roof = track.archTop(this.idx, lat) - 1.9;
    if (this.y > roof) {
      this.y = roof;
      if (this.vy > 0) this.vy = 0;
    }
    const t = track.tan[this.idx];
    this.trackTan = t;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    if (this.outside && track.terrainY) {
      this.slope = (track.terrainY(this.x + fx, this.z + fz) - track.terrainY(this.x - fx, this.z - fz)) / 2;
    } else {
      this.slope = track.slopeAt(this.idx, lat) * (fx * t.x + fz * t.z);
    }
  }

  leaveTrack() {
    this.outside = true;
    this.outTime = 0;
    this.exitIdx = this.idx;
    this.exitProgress = this.progress;
  }

  // Back over the wall: fine if it's near where you left, otherwise it was a
  // shortcut and you go back to the exit point.
  rejoinTrack(track) {
    let df = this.idx - this.exitIdx;
    if (df > track.N / 2) df -= track.N;
    if (df < -track.N / 2) df += track.N;
    if (Math.abs(df) > 80) return this.respawn(track);
    this.outside = false;
    this.progress = this.exitProgress + df;
  }

  // Missed the big jump: back up the run-up (before the boost pads) with
  // some speed, for another go.
  fellIn(track) {
    const g = track.gaps.find((gg) => this.idx >= gg.from && this.idx <= gg.to) ?? track.gaps[0];
    const back = this.idx - (g.from - 150);
    this.exitIdx = track.wrap(g.from - 150);
    this.exitProgress = this.progress - back;
    this.respawn(track, 32);
    this.lateral = 0;
  }

  // Put the car back on the road where it left, pointing down the track.
  respawn(track, speed = 12) {
    const i = track.wrap(this.exitIdx);
    const side = Math.sign(this.lateral || 1);
    const lat = track.route(i, side).center;
    const p = track.pos[i], r = track.right[i];
    const heading = track.headingAt(i);
    this.x = p.x + r.x * lat;
    this.z = p.z + r.z * lat;
    this.y = track.roadHeight(i, lat);
    this.heading = heading;
    this.vx = Math.sin(heading) * speed;
    this.vz = Math.cos(heading) * speed;
    this.vy = 0;
    this.airborne = false;
    this.drifting = false;
    this.idx = i;
    this.progress = this.exitProgress;
    this.lateral = lat;
    this.outside = false;
    this.outTime = 0;
    this.respawned = true;
  }

  updateVisual(dt) {
    const p = this.parts;
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.heading;
    // In the air the nose follows the flight path (softened), on the ground the slope.
    const pitchTarget = this.airborne
      ? -0.6 * Math.atan(this.vy / Math.max(8, Math.abs(this.speed)))
      : -Math.atan(this.slope);
    this.pitch += (pitchTarget - this.pitch) * Math.min(1, dt * (this.airborne ? 4 : 10));
    this.mesh.rotation.x = this.pitch;
    const t = this.trackTan;
    const along = t ? Math.sign(Math.sin(this.heading) * t.x + Math.cos(this.heading) * t.z) || 1 : 1;
    const rollTarget = this.airborne ? 0 : -Math.atan(this.bankSlope * along);
    this.roll += (rollTarget - this.roll) * Math.min(1, dt * 8);
    this.mesh.rotation.z = this.roll;

    const targetYaw = this.drifting ? -this.driftDir * 0.38 * DRIFT_STRENGTH : 0;
    this.driftYaw += (targetYaw - this.driftYaw) * Math.min(1, dt * 8);
    p.visual.rotation.y = this.driftYaw;
    p.visual.position.y = this.hopY;
    // Landing squash.
    this.squash = Math.max(0, this.squash - dt * 4);
    p.body.scale.set(1 + this.squash * 0.12, 1 - this.squash * 0.3, 1 + this.squash * 0.08);

    const sf = Math.min(1, Math.abs(this.speed) / MAX_SPEED);
    p.body.rotation.z += (this.steer * sf * 0.09 - p.body.rotation.z) * Math.min(1, dt * 8);
    // Off-road rumble.
    p.body.position.y = this.offroad && Math.abs(this.speed) > 3 ? Math.random() * 0.08 : 0;

    this.wheelSpin += (this.speed * dt) / WHEEL_R;
    for (const w of p.wheels) w.rotation.x = this.wheelSpin;
    for (const fp of p.frontPivots) fp.rotation.y = -this.steer * 0.45;

    p.flame.visible = this.boost > 0;
    if (p.flame.visible) p.flame.scale.setScalar(0.8 + Math.random() * 0.5);

  }
}

// Pushes cars apart; records contact points on both cars for sparks.
export function collideCars(cars) {
  const minD = CAR_RADIUS * 2;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minD * minD || d2 < 1e-6 || Math.abs(a.y - b.y) > 1.5) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, nz = dz / d;
      const overlap = (minD - d) / 2;
      a.x -= nx * overlap; a.z -= nz * overlap;
      b.x += nx * overlap; b.z += nz * overlap;
      const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rv < 0) {
        if (rv < -3) {
          const hit = { x: a.x + nx * CAR_RADIUS, y: (a.y + b.y) / 2 + 0.7, z: a.z + nz * CAR_RADIUS, strength: -rv };
          a.impacts.push(hit);
        }
        const jImp = (-(1 + 0.3) * rv) / 2;
        a.vx -= nx * jImp; a.vz -= nz * jImp;
        b.vx += nx * jImp; b.vz += nz * jImp;

        // Bump rules: contact costs speed, except that the car that gets
        // rear-ended is shoved along (reward for keeping rivals behind you).
        const strength = Math.min(1, -rv / 10);
        const fa = [Math.sin(a.heading), Math.cos(a.heading)], fb = [Math.sin(b.heading), Math.cos(b.heading)];
        const sameWay = fa[0] * fb[0] + fa[1] * fb[1] > 0.5;
        const slow = (car, k) => { car.vx *= 1 - k * strength; car.vz *= 1 - k * strength; };
        let rear = null, front = null;
        if (sameWay && nx * fa[0] + nz * fa[1] > 0.7) { rear = a; front = b; }
        else if (sameWay && -(nx * fb[0] + nz * fb[1]) > 0.7) { rear = b; front = a; }
        if (rear) {
          slow(rear, 0.08);
          front.push = Math.max(front.push, 0.6 * strength + 0.2);
          front.pushed = true;
        } else {
          slow(a, 0.05);
          slow(b, 0.05);
        }
      }
    }
  }
}
