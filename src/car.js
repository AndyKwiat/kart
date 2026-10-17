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
    }

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
    this.heading = wrapAngle(this.heading - yawRate * dt);

    // Lateral grip: strong normally, loose while drifting (car slides outward).
    if (this.drifting) vl -= this.driftDir * Math.abs(vf) * 0.45 * DRIFT_STRENGTH * dt;
    vl *= Math.exp(-(this.drifting ? 2.5 : 10) * dt);

    fx = Math.sin(this.heading); fz = Math.cos(this.heading);
    rx = -fz; rz = fx;
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
    this.progress += d;

    let lat = track.lateral(this.idx, this.x, this.z);
    const limit = track.wallOffset(this.idx) - CAR_RADIUS + 0.6;
    if (Math.abs(lat) > limit) {
      const r = track.right[this.idx];
      const s = Math.sign(lat);
      const push = Math.abs(lat) - limit;
      this.x -= r.x * s * push;
      this.z -= r.z * s * push;
      const vn = this.vx * r.x + this.vz * r.z;
      if (vn * s > 0) {
        this.vx -= r.x * vn * 1.4;
        this.vz -= r.z * vn * 1.4;
        this.vx *= 0.96;
        this.vz *= 0.96;
        // Scrape point on the wall, for sparks.
        if (Math.abs(vn) > 2) {
          this.impacts.push({ x: this.x + r.x * s * CAR_RADIUS, y: this.y + 0.6, z: this.z + r.z * s * CAR_RADIUS, strength: Math.abs(vn) });
        }
      }
      lat = s * limit;
    }
    // Median island: solid, like a low wall down the middle.
    const iw = track.islandHw[this.idx];
    if (iw > 0) {
      const lim = iw + CAR_RADIUS - 0.3;
      if (Math.abs(lat) < lim) {
        const r = track.right[this.idx];
        const s = lat >= 0 ? 1 : -1;
        const push = lim - Math.abs(lat);
        this.x += r.x * s * push;
        this.z += r.z * s * push;
        const vn = this.vx * r.x + this.vz * r.z;
        if (vn * s < 0) {
          this.vx -= r.x * vn * 1.4;
          this.vz -= r.z * vn * 1.4;
          this.vx *= 0.96;
          this.vz *= 0.96;
        }
        lat = s * lim;
      }
    }
    this.lateral = lat;
    this.bankSlope = track.bank[this.idx];
    this.offroad = Math.abs(lat) > track.hw[this.idx] + CURB_WIDTH;

    // Vertical: follow the ground unless it falls away faster than a
    // ballistic arc would (e.g. off a ramp lip), then fly until landing.
    const ground = track.heightAt(this.idx, this.x, this.z);
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
    if (!this.airborne && track.padAt(this.idx, lat)) this.boost = Math.max(this.boost, 0.9);
    const t = track.tan[this.idx];
    this.trackTan = t;
    this.slope = track.slopeAt(this.idx) * (Math.sin(this.heading) * t.x + Math.cos(this.heading) * t.z);
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
      }
    }
  }
}
