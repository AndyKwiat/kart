import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from './materials.js';
import { part } from './geom.js';

// Ambient wildlife: grazing cows and sheep, high flocks of birds, birds
// circling over the roadside, and birds pecking in the grass that scatter
// when a car goes past. Everything is instanced (a few draw calls total) and
// animated by updating instance matrices each frame.

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// --- Low-poly models (merged, vertex coloured) -------------------------------

const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, r);
const ball = new THREE.IcosahedronGeometry(1, 1);
const lowBall = new THREE.IcosahedronGeometry(1, 0); // birds are small and numerous
const box = new THREE.BoxGeometry(1, 1, 1);

// Each model: body (origin at the feet, facing +z) and head (origin at the
// neck joint, so pitching it down makes the animal graze).
function cowModel() {
  const W = 0xf4f1ea, B = 0x26242a, P = 0xf2a3a8;
  const body = mergeGeometries([
    part(rbox(1.4, 1.1, 2.4, 0.3), W, 0, 1.35, 0),
    part(rbox(0.06, 0.5, 0.7, 0.03), B, 0.71, 1.45, 0.3),
    part(rbox(0.06, 0.4, 0.5, 0.03), B, -0.71, 1.3, -0.5),
    part(rbox(0.06, 0.45, 0.6, 0.03), B, -0.71, 1.55, 0.55),
    part(rbox(0.7, 0.06, 0.6, 0.03), B, 0.15, 1.91, -0.3),
    ...[[-0.45, 0.8], [0.45, 0.8], [-0.45, -0.8], [0.45, -0.8]].flatMap(([x, z]) => [
      part(box, W, x, 0.5, z, { sx: 0.3, sy: 0.9, sz: 0.3 }),
      part(box, B, x, 0.08, z, { sx: 0.32, sy: 0.16, sz: 0.32 }),
    ]),
    part(ball, P, 0, 0.78, -0.55, { sx: 0.3, sy: 0.22, sz: 0.3 }),
    part(box, W, 0, 1.3, -1.25, { rx: 0.3, sx: 0.08, sy: 0.9, sz: 0.08 }),
    part(ball, B, 0, 0.85, -1.38, { sx: 0.12, sy: 0.16, sz: 0.12 }),
  ]);
  const head = mergeGeometries([
    part(rbox(0.8, 0.8, 0.9, 0.22), W, 0, 0.05, 0.45),
    part(rbox(0.7, 0.45, 0.35, 0.15), P, 0, -0.15, 0.95),
    part(rbox(0.36, 0.4, 0.06, 0.03), B, 0.2, 0.25, 0.9),
    part(new THREE.ConeGeometry(0.08, 0.35, 6), 0xe8dcc0, 0.3, 0.55, 0.3, { rz: -0.4 }),
    part(new THREE.ConeGeometry(0.08, 0.35, 6), 0xe8dcc0, -0.3, 0.55, 0.3, { rz: 0.4 }),
    part(box, B, 0.5, 0.2, 0.3, { sx: 0.35, sy: 0.12, sz: 0.2 }),
    part(box, B, -0.5, 0.2, 0.3, { sx: 0.35, sy: 0.12, sz: 0.2 }),
    part(box, 0x111111, 0.3, 0.2, 0.86, { sx: 0.1, sy: 0.12, sz: 0.06 }),
    part(box, 0x111111, -0.3, 0.2, 0.86, { sx: 0.1, sy: 0.12, sz: 0.06 }),
  ]);
  return { body, head, neck: new THREE.Vector3(0, 1.6, 1.15), walk: 1.1, scale: 1 };
}

function sheepModel() {
  const Wool = 0xf3efe2, Face = 0x2b2a2e;
  const puffs = [];
  for (const [x, y, z, r] of [
    [0, 1.15, 0, 0.62], [0.35, 1.1, 0.45, 0.48], [-0.35, 1.1, 0.45, 0.48], [0.35, 1.1, -0.45, 0.5],
    [-0.35, 1.1, -0.45, 0.5], [0, 1.45, 0.3, 0.45], [0, 1.45, -0.35, 0.45], [0, 1.05, 0.8, 0.42],
    [0, 1.1, -0.85, 0.42], [0.45, 1.3, 0, 0.42], [-0.45, 1.3, 0, 0.42],
  ]) puffs.push(part(ball, Wool, x, y, z, { sx: r, sy: r, sz: r }));
  const body = mergeGeometries([
    ...puffs,
    ...[[-0.32, 0.55], [0.32, 0.55], [-0.32, -0.55], [0.32, -0.55]].map(([x, z]) =>
      part(box, Face, x, 0.4, z, { sx: 0.16, sy: 0.8, sz: 0.16 })),
  ]);
  const head = mergeGeometries([
    part(rbox(0.5, 0.55, 0.7, 0.18), Face, 0, -0.05, 0.35),
    part(ball, Wool, 0, 0.25, 0.2, { sx: 0.3, sy: 0.22, sz: 0.3 }),
    part(box, Face, 0.32, 0.1, 0.2, { rz: -0.4, sx: 0.3, sy: 0.08, sz: 0.16 }),
    part(box, Face, -0.32, 0.1, 0.2, { rz: 0.4, sx: 0.3, sy: 0.08, sz: 0.16 }),
    part(box, 0xffffff, 0.2, 0.08, 0.62, { sx: 0.08, sy: 0.08, sz: 0.04 }),
    part(box, 0xffffff, -0.2, 0.08, 0.62, { sx: 0.08, sy: 0.08, sz: 0.04 }),
  ]);
  return { body, head, neck: new THREE.Vector3(0, 1.25, 0.95), walk: 1.3, scale: 0.95 };
}

// Bird facing +z. Body is white (tinted per instance); wings pivot at the body.
function birdModel() {
  const body = mergeGeometries([
    part(lowBall, 0xffffff, 0, 0, 0, { sx: 0.24, sy: 0.22, sz: 0.55 }),
    part(lowBall, 0xffffff, 0, 0.1, 0.48, { sx: 0.17, sy: 0.17, sz: 0.17 }),
    part(new THREE.ConeGeometry(0.06, 0.22, 5), 0xffb030, 0, 0.07, 0.7, { rx: Math.PI / 2 }),
    part(box, 0xffffff, 0, 0.02, -0.6, { sx: 0.3, sy: 0.04, sz: 0.3 }),
  ]);
  const wing = (dir) => mergeGeometries([
    part(box, 0xffffff, dir * 0.55, 0, 0, { sx: 1.1, sy: 0.04, sz: 0.42 }),
    part(box, 0xffffff, dir * 1.25, 0, -0.06, { sx: 0.4, sy: 0.03, sz: 0.3 }),
  ]);
  return { body, left: wing(-1), right: wing(1) };
}

// --- Herd animals -------------------------------------------------------------

class Herds {
  constructor(scene, world, model, herdCount, perHerd) {
    this.world = world;
    this.model = model;
    this.animals = [];
    const centers = [];
    const b = world.box.clone().expandByScalar(200);
    for (let tries = 0; centers.length < herdCount && tries < 4000; tries++) {
      const x = rand(b.min.x, b.max.x), z = rand(b.min.z, b.max.z);
      if (!world.pasture(x, z) || centers.some((c) => Math.hypot(c.x - x, c.z - z) < 70)) continue;
      centers.push({ x, z });
    }
    for (const home of centers) {
      const n = Math.round(rand(perHerd[0], perHerd[1]));
      for (let k = 0, tries = 0; k < n && tries < 200; tries++) {
        const x = home.x + rand(-14, 14), z = home.z + rand(-14, 14);
        if (!world.pasture(x, z)) continue;
        this.animals.push({
          home, x, z, heading: rand(-Math.PI, Math.PI), head: rand(0, 0.9),
          state: 'graze', timer: rand(0, 6), target: null, phase: rand(0, 10),
          size: model.scale * rand(0.85, 1.15),
        });
        k++;
      }
    }
    const mat = toon(0xffffff, { vertexColors: true });
    this.bodies = new THREE.InstancedMesh(model.body, mat, Math.max(1, this.animals.length));
    this.heads = new THREE.InstancedMesh(model.head, mat, Math.max(1, this.animals.length));
    this.bodies.count = this.heads.count = this.animals.length;
    for (const m of [this.bodies, this.heads]) {
      m.castShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this._m = new THREE.Matrix4();
    this._h = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }

  update(dt, time) {
    const { world, model } = this;
    this.animals.forEach((a, i) => {
      a.timer -= dt;
      let headTarget = 0, bob = 0;
      if (a.state === 'graze') {
        headTarget = 0.95 + Math.sin(time * 2.5 + a.phase) * 0.08;
        if (a.timer <= 0) {
          a.state = Math.random() < 0.65 ? 'walk' : 'idle';
          a.timer = rand(2, 4);
          if (a.state === 'walk') {
            a.target = null;
            for (let t = 0; t < 6 && !a.target; t++) {
              const x = a.home.x + rand(-22, 22), z = a.home.z + rand(-22, 22);
              if (world.pasture(x, z)) a.target = { x, z };
            }
            if (!a.target) a.state = 'idle';
          }
        }
      } else if (a.state === 'idle') {
        headTarget = -0.1;
        if (a.timer <= 0) { a.state = 'graze'; a.timer = rand(3, 9); }
      } else {
        const dx = a.target.x - a.x, dz = a.target.z - a.z;
        const d = Math.hypot(dx, dz);
        const turn = wrapAngle(Math.atan2(dx, dz) - a.heading);
        a.heading += Math.sign(turn) * Math.min(Math.abs(turn), dt * 1.4);
        const speed = Math.abs(turn) < 0.6 ? model.walk : 0.2;
        a.x += Math.sin(a.heading) * speed * dt;
        a.z += Math.cos(a.heading) * speed * dt;
        headTarget = 0.15;
        bob = Math.abs(Math.sin(time * 7 + a.phase)) * 0.06;
        if (d < 1.2 || a.timer < -12) { a.state = 'graze'; a.timer = rand(4, 10); }
      }
      a.head += (headTarget - a.head) * Math.min(1, dt * 3);

      const y = world.groundY(a.x, a.z);
      this._q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a.heading);
      this._m.compose(this._v.set(a.x, y + bob, a.z), this._q, this._s.setScalar(a.size));
      this.bodies.setMatrixAt(i, this._m);
      this._h.compose(model.neck, this._q.setFromEuler(this._e.set(a.head, 0, 0)), this._s.setScalar(1));
      this.heads.setMatrixAt(i, this._m.multiply(this._h));
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }
}

// --- Birds ----------------------------------------------------------------------

const BIRD_COLORS = [0xf4f4f4, 0xf4f4f4, 0x2c2c36, 0x2c2c36, 0x8b6b4a, 0x4a7fd6, 0xd9d2c0, 0x5a5f6a];

class Birds {
  constructor(scene, world, track) {
    this.world = world;
    this.birds = [];

    // High flocks drifting across the sky in loose V formations.
    this.flocks = [];
    const c = world.box.getCenter(new THREE.Vector3());
    for (let f = 0; f < 10; f++) {
      const flock = {
        cx: c.x + rand(-500, 500), cz: c.z + rand(-500, 500), r: rand(250, 600),
        w: rand(0.02, 0.05) * (Math.random() < 0.5 ? -1 : 1), phase: rand(0, 6.3),
        alt: rand(70, 170), color: pick(BIRD_COLORS),
      };
      this.flocks.push(flock);
      const n = Math.round(rand(10, 22));
      for (let k = 0; k < n; k++) {
        const row = Math.ceil(k / 2), side = k === 0 ? 0 : k % 2 ? -1 : 1;
        this.birds.push({
          kind: 'flock', flock, ox: side * row * rand(2.6, 3.4), oz: -row * rand(2, 3), oy: rand(-1, 1),
          scale: rand(2, 2.6), phase: rand(0, 6.3), flap: rand(7, 10), color: flock.color,
        });
      }
    }

    // Spots along the roadside: birds circling overhead and birds on the ground.
    const spots = [];
    const nSpots = 24;
    for (let s = 0; s < nSpots; s++) {
      let i = Math.floor(((s + Math.random() * 0.6) / nSpots) * track.N) % track.N;
      while (track.tunnelAt[i]) i = (i + 37) % track.N; // no birds in tunnels
      const side = Math.random() < 0.5 ? -1 : 1;
      const off = side * (track.wallOffset(i) + rand(6, 26));
      const p = track.pos[i], r = track.right[i];
      const x = p.x + r.x * off, z = p.z + r.z * off;
      spots.push({ x, z, y: world.groundY(x, z) });
    }
    for (const spot of spots) {
      const color = pick(BIRD_COLORS);
      for (let k = 0, n = Math.round(rand(4, 8)); k < n; k++) {
        this.birds.push({
          kind: 'circle', spot, rad: rand(6, 26), ang: rand(0, 6.3), w: rand(0.35, 0.9) * (Math.random() < 0.5 ? -1 : 1),
          alt: rand(5, 18), scale: rand(0.75, 1.05), phase: rand(0, 6.3), flap: rand(9, 13),
          color: Math.random() < 0.7 ? color : pick(BIRD_COLORS),
        });
      }
      for (let k = 0, n = Math.round(rand(4, 8)); k < n; k++) {
        const x = spot.x + rand(-8, 8), z = spot.z + rand(-8, 8);
        this.birds.push({
          kind: 'ground', spot, state: 'ground', x, z, y: world.groundY(x, z), heading: rand(-3, 3),
          vx: 0, vy: 0, vz: 0, timer: rand(0, 3), scale: rand(0.6, 0.8), phase: rand(0, 6.3), flap: rand(12, 16),
          color: pick(BIRD_COLORS), ang: rand(0, 6.3), rad: rand(6, 16), alt: rand(8, 18),
        });
      }
    }

    const model = birdModel();
    const mat = toon(0xffffff, { vertexColors: true });
    const n = this.birds.length;
    this.body = new THREE.InstancedMesh(model.body, mat, n);
    this.left = new THREE.InstancedMesh(model.left, mat, n);
    this.right = new THREE.InstancedMesh(model.right, mat, n);
    const col = new THREE.Color();
    this.birds.forEach((b, i) => {
      col.setHex(b.color).multiplyScalar(rand(0.9, 1.05));
      for (const m of [this.body, this.left, this.right]) m.setColorAt(i, col);
    });
    for (const m of [this.body, this.left, this.right]) {
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this._m = new THREE.Matrix4();
    this._w = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._o = new THREE.Vector3();
  }

  set(i, x, y, z, yaw, pitch, roll, scale, wing, fold = 1) {
    this._q.setFromEuler(this._e.set(pitch, yaw, roll));
    this._m.compose(this._v.set(x, y, z), this._q, this._s.setScalar(scale));
    this.body.setMatrixAt(i, this._m);
    // Wings rotate about the body's forward axis; folded wings shrink in.
    for (const [mesh, dir] of [[this.left, -1], [this.right, 1]]) {
      this._q.setFromEuler(this._e.set(0, 0, dir * wing));
      this._w.compose(this._o.set(0, 0.05, 0), this._q, this._s.set(fold, 1, 1));
      mesh.setMatrixAt(i, this._w.premultiply(this._m));
    }
  }

  update(dt, time, cars) {
    const { world } = this;
    for (const f of this.flocks) f.phase += f.w * dt;
    this.birds.forEach((b, i) => {
      const flapAngle = (amp) => Math.sin(time * b.flap + b.phase) * amp;
      if (b.kind === 'flock') {
        const f = b.flock;
        const cx = f.cx + Math.cos(f.phase) * f.r, cz = f.cz + Math.sin(f.phase) * f.r;
        const yaw = Math.atan2(-Math.sin(f.phase) * f.r * f.w, Math.cos(f.phase) * f.r * f.w);
        const sy = Math.sin(yaw), cy = Math.cos(yaw);
        const x = cx + cy * b.ox + sy * b.oz + Math.sin(time * 0.7 + b.phase) * 0.6;
        const z = cz - sy * b.ox + cy * b.oz;
        // Flap in bursts, glide in between.
        const gliding = Math.sin(time * 0.6 + b.phase) > 0.4;
        this.set(i, x, f.alt + b.oy + Math.sin(time + b.phase) * 0.8, z, yaw, 0, -Math.sign(f.w) * 0.15, b.scale,
          gliding ? 0.08 : flapAngle(0.7));
      } else if (b.kind === 'circle') {
        b.ang += b.w * dt;
        const x = b.spot.x + Math.cos(b.ang) * b.rad, z = b.spot.z + Math.sin(b.ang) * b.rad;
        const y = b.spot.y + b.alt + Math.sin(time * 0.8 + b.phase) * 2;
        const yaw = Math.atan2(-Math.sin(b.ang) * b.w, Math.cos(b.ang) * b.w);
        const gliding = Math.sin(time * 0.9 + b.phase) > 0.2;
        this.set(i, x, y, z, yaw, 0, -Math.sign(b.w) * 0.45, b.scale, gliding ? 0.1 : flapAngle(0.8));
      } else {
        this.updateGround(b, i, dt, time, cars);
      }
    });
    for (const m of [this.body, this.left, this.right]) m.instanceMatrix.needsUpdate = true;
  }

  // Ground birds: peck and hop; scatter when a car comes close (or now and
  // then on their own), circle for a while, then come back down.
  updateGround(b, i, dt, time, cars) {
    const { world } = this;
    b.timer -= dt;
    if (b.state === 'ground') {
      let scare = Math.random() < dt * 0.01;
      for (const car of cars) {
        if ((car.x - b.x) ** 2 + (car.z - b.z) ** 2 < 26 * 26) { scare = true; break; }
      }
      if (scare) {
        b.state = 'air';
        b.timer = rand(5, 12);
        b.vy = rand(7, 11);
        b.ang = Math.atan2(b.z - b.spot.z, b.x - b.spot.x);
        return this.set(i, b.x, b.y, b.z, b.heading, -0.5, 0, b.scale, 0.6);
      }
      if (b.timer <= 0) {
        // Hop to a nearby spot.
        b.timer = rand(0.6, 2.5);
        b.heading += rand(-1.2, 1.2);
        const hop = rand(0, 0.8);
        b.x += Math.sin(b.heading) * hop;
        b.z += Math.cos(b.heading) * hop;
        if (Math.hypot(b.x - b.spot.x, b.z - b.spot.z) > 10) b.heading += Math.PI;
        b.y = world.groundY(b.x, b.z);
      }
      const peck = Math.max(0, Math.sin(time * 9 + b.phase)) * 0.5;
      return this.set(i, b.x, b.y + 0.22 * b.scale, b.z, b.heading, peck, 0, b.scale, -0.15, 0.4);
    }

    if (b.state === 'air') {
      // Climb into a circle above the spot.
      b.ang += 0.9 * dt;
      const tx = b.spot.x + Math.cos(b.ang) * b.rad, tz = b.spot.z + Math.sin(b.ang) * b.rad;
      const ty = b.spot.y + b.alt;
      b.vx += ((tx - b.x) * 1.5 - b.vx) * Math.min(1, dt * 2);
      b.vz += ((tz - b.z) * 1.5 - b.vz) * Math.min(1, dt * 2);
      b.vy += ((ty - b.y) * 1.2 - b.vy) * Math.min(1, dt * 1.5);
      if (b.timer <= 0) {
        b.state = 'landing';
        b.land = { x: b.spot.x + rand(-8, 8), z: b.spot.z + rand(-8, 8) };
        b.land.y = world.groundY(b.land.x, b.land.z);
      }
    } else {
      // Glide down to the landing point.
      const dx = b.land.x - b.x, dz = b.land.z - b.z, dy = b.land.y + 0.2 - b.y;
      b.vx += (dx * 1.2 - b.vx) * Math.min(1, dt * 2);
      b.vz += (dz * 1.2 - b.vz) * Math.min(1, dt * 2);
      b.vy += (dy * 1.2 - b.vy) * Math.min(1, dt * 2);
      if (Math.hypot(dx, dz) < 0.6 && Math.abs(dy) < 0.5) {
        b.state = 'ground';
        b.x = b.land.x; b.z = b.land.z; b.y = b.land.y;
        b.timer = rand(1, 3);
        return;
      }
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    const speed = Math.hypot(b.vx, b.vz);
    if (speed > 0.5) b.heading = Math.atan2(b.vx, b.vz);
    const pitch = -Math.atan2(b.vy, Math.max(1, speed)) * 0.6;
    this.set(i, b.x, b.y, b.z, b.heading, pitch, 0, b.scale, Math.sin(time * b.flap + b.phase) * 0.85);
  }
}

export class Wildlife {
  constructor(scene, world, track) {
    this.time = 0;
    this.cows = new Herds(scene, world, cowModel(), 8, [5, 9]);
    this.sheep = new Herds(scene, world, sheepModel(), 10, [7, 13]);
    this.birds = new Birds(scene, world, track);
  }

  get counts() {
    return { cows: this.cows.animals.length, sheep: this.sheep.animals.length, birds: this.birds.birds.length };
  }

  update(dt, cars) {
    this.time += dt;
    this.cows.update(dt, this.time);
    this.sheep.update(dt, this.time);
    this.birds.update(dt, this.time, cars);
  }
}
