import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toon } from './materials.js';
import { CURB_WIDTH } from './track.js';

export const CAR_RADIUS = 1.6;

const MAX_SPEED = 52;
const ACCEL = 30;
const BRAKE = 55;
const REVERSE_MAX = 14;
const COAST = 7;
const STEER_RATE = 2.3;
const BOOST_MULT = 1.32;
const GRAVITY = 32;

const WHEEL_R = 0.55;

const wheelGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.55, 16);
wheelGeo.rotateZ(Math.PI / 2);
const hubGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.58, 8);
hubGeo.rotateZ(Math.PI / 2);
const wheelMat = toon(0x222226);
const hubMat = toon(0xd8d8d8);
const glassMat = toon(0x2b3a55);
const darkMat = toon(0x333338);
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff3a0 });
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.9 });
const sparkMats = {
  small: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  blue: new THREE.MeshBasicMaterial({ color: 0x3fb8ff }),
  orange: new THREE.MeshBasicMaterial({ color: 0xff8a1f }),
};

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function buildMesh(color) {
  const root = new THREE.Group();
  const visual = new THREE.Group();
  const body = new THREE.Group();
  root.add(visual);
  visual.add(body);

  const paint = toon(color);
  const add = (parent, geo, mat, x, y, z, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    parent.add(m);
    return m;
  };

  add(body, new RoundedBoxGeometry(2.3, 0.65, 3.8, 3, 0.28), paint, 0, 0.72, 0);
  add(body, new RoundedBoxGeometry(1.7, 0.7, 1.7, 3, 0.3), glassMat, 0, 1.3, -0.35);
  add(body, new RoundedBoxGeometry(1.78, 0.2, 1.5, 2, 0.08), paint, 0, 1.66, -0.35);
  add(body, new THREE.BoxGeometry(2.0, 0.28, 0.3), darkMat, 0, 0.5, 1.92);
  add(body, new THREE.BoxGeometry(2.4, 0.12, 0.55), paint, 0, 1.38, -1.72);
  for (const s of [-1, 1]) {
    add(body, new THREE.BoxGeometry(0.12, 0.35, 0.25), darkMat, s * 0.8, 1.17, -1.72);
    add(body, new THREE.BoxGeometry(0.45, 0.22, 0.1), lightMat, s * 0.68, 0.82, 1.9, false);
  }

  const flame = add(body, new THREE.ConeGeometry(0.28, 1.4, 8), flameMat, 0, 0.6, -2.5, false);
  flame.rotation.x = -Math.PI / 2;
  flame.visible = false;

  const sparks = [-1, 1].map((s) => {
    const m = add(visual, new THREE.IcosahedronGeometry(0.22, 0), sparkMats.small, s * 1.25, 0.2, -1.8, false);
    m.visible = false;
    return m;
  });

  const wheels = [];
  const frontPivots = [];
  for (const [x, z, front] of [[-1.25, 1.25, true], [1.25, 1.25, true], [-1.25, -1.25, false], [1.25, -1.25, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, WHEEL_R, z);
    const spin = new THREE.Group();
    pivot.add(spin);
    add(spin, wheelGeo, wheelMat, 0, 0, 0);
    add(spin, hubGeo, hubMat, 0, 0, 0, false);
    visual.add(pivot);
    wheels.push(spin);
    if (front) frontPivots.push(pivot);
  }

  return { root, visual, body, wheels, frontPivots, flame, sparks };
}

export class Car {
  constructor(color, name) {
    this.color = color;
    this.name = name;
    this.parts = buildMesh(color);
    this.mesh = this.parts.root;
    this.mesh.rotation.order = 'YXZ';
    this.maxSpeed = MAX_SPEED;
  }

  reset(x, z, heading, idx, progress) {
    this.x = x; this.z = z;
    this.y = 0;
    this.slope = 0;
    this.pitch = 0;
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
    if (this.drifting) yawRate *= 1.2;
    if (this.airborne) yawRate *= 0.35;
    this.heading = wrapAngle(this.heading - yawRate * dt);

    // Lateral grip: strong normally, loose while drifting (car slides outward).
    if (this.drifting) vl -= this.driftDir * Math.abs(vf) * 0.45 * dt;
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
      }
      lat = s * limit;
    }
    this.lateral = lat;
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

    const targetYaw = this.drifting ? -this.driftDir * 0.38 : 0;
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

    const charge = this.driftTime > 1.7 ? 'orange' : this.driftTime > 0.85 ? 'blue' : 'small';
    for (const s of p.sparks) {
      s.visible = this.drifting;
      s.material = sparkMats[charge];
      s.scale.setScalar((charge === 'small' ? 0.6 : 1.1) * (0.7 + Math.random() * 0.6));
    }
  }
}

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
        const jImp = (-(1 + 0.3) * rv) / 2;
        a.vx -= nx * jImp; a.vz -= nz * jImp;
        b.vx += nx * jImp; b.vz += nz * jImp;
      }
    }
  }
}
