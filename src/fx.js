import * as THREE from 'three';

// Pooled GPU point particles. One pool is additive (sparks, flames), one uses
// normal blending (smoke, dust). Each particle has velocity, gravity, drag,
// a lifetime, and size/colour/alpha that animate from start to end.
class ParticlePool {
  constructor(scene, max, additive) {
    this.max = max;
    this.next = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.params = new Array(max).fill(null);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geo = g;

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: 600 }, soft: { value: additive ? 0.15 : 0.5 } },
      vertexShader: /* glsl */ `
        attribute float alpha;
        attribute float size;
        uniform float scale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float soft;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = vAlpha * (1.0 - smoothstep(1.0 - soft, 1.0, d));
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
          #include <colorspace_fragment>
        }`,
      vertexColors: true,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, p) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = p.life;
    this.maxLife[i] = p.life;
    this.params[i] = p;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      const p = this.params[i];
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const drag = Math.exp(-(p.drag ?? 0) * dt);
      const k = i * 3;
      this.vel[k] *= drag;
      this.vel[k + 1] = this.vel[k + 1] * drag - (p.gravity ?? 0) * dt;
      this.vel[k + 2] *= drag;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] = p.size + (p.sizeEnd - p.size) * t;
      const c0 = p.color, c1 = p.colorEnd ?? p.color;
      this.col[k] = c0.r + (c1.r - c0.r) * t;
      this.col[k + 1] = c0.g + (c1.g - c0.g) * t;
      this.col[k + 2] = c0.b + (c1.b - c0.b) * t;
      this.alpha[i] = p.alpha * (1 - t) * Math.min(1, t * 8 + 0.3);
    }
    for (const name of ['position', 'color', 'alpha', 'size']) this.geo.attributes[name].needsUpdate = true;
  }
}

const C = (r, g, b) => new THREE.Color(r, g, b);
const P = {
  spark: { life: 0.35, size: 0.35, sizeEnd: 0.05, color: C(4, 3, 1.2), colorEnd: C(2.5, 0.6, 0.1), alpha: 1, gravity: 25, drag: 1.5 },
  driftWhite: { life: 0.22, size: 0.3, sizeEnd: 0.05, color: C(3, 3, 3), alpha: 1, gravity: 8, drag: 3 },
  driftBlue: { life: 0.3, size: 0.45, sizeEnd: 0.08, color: C(0.6, 1.8, 4), colorEnd: C(0.2, 0.6, 3), alpha: 1, gravity: 6, drag: 3 },
  driftOrange: { life: 0.32, size: 0.55, sizeEnd: 0.1, color: C(4, 2, 0.4), colorEnd: C(3, 0.6, 0.1), alpha: 1, gravity: 6, drag: 3 },
  flame: { life: 0.14, size: 0.7, sizeEnd: 0.15, color: C(4, 2.6, 0.8), colorEnd: C(2.5, 0.4, 0.05), alpha: 0.9, drag: 4 },
  smoke: { life: 0.9, size: 0.8, sizeEnd: 3.2, color: C(0.92, 0.92, 0.95), alpha: 0.35, gravity: -1.2, drag: 2.5 },
  dust: { life: 0.7, size: 0.6, sizeEnd: 2.4, color: C(0.62, 0.55, 0.38), colorEnd: C(0.7, 0.66, 0.5), alpha: 0.45, gravity: -0.5, drag: 3 },
  grass: { life: 0.5, size: 0.25, sizeEnd: 0.2, color: C(0.3, 0.65, 0.2), alpha: 0.9, gravity: 20, drag: 1 },
};

const rnd = (s) => (Math.random() - 0.5) * 2 * s;

export class Effects {
  constructor(scene) {
    this.glow = new ParticlePool(scene, 2500, true);
    this.puff = new ParticlePool(scene, 1500, false);
    this.shake = 0;
    this.acc = new Map(); // per-car emission accumulators
  }

  setScale(px) {
    // Point sizes are in world units: scale by viewport height.
    this.glow.points.material.uniforms.scale.value = px;
    this.puff.points.material.uniforms.scale.value = px;
  }

  burst(x, y, z, strength) {
    const n = Math.min(40, 6 + strength * 2.5);
    for (let i = 0; i < n; i++) {
      this.glow.emit(x, y, z, rnd(8), 2 + Math.random() * 7, rnd(8), P.spark);
    }
    for (let i = 0; i < 3; i++) this.puff.emit(x, y, z, rnd(2), 1, rnd(2), P.smoke);
  }

  // Per-frame emitters for one car. `near` limits detail to cars close to the camera.
  car(car, dt, near, isPlayer) {
    let acc = this.acc.get(car) ?? 0;
    acc += dt * 60;
    const ticks = Math.floor(acc);
    this.acc.set(car, acc - ticks);

    for (const hit of car.impacts) {
      if (near) this.burst(hit.x, hit.y, hit.z, hit.strength);
      if (isPlayer) this.shake = Math.max(this.shake, Math.min(0.6, hit.strength * 0.05));
    }
    car.impacts.length = 0;

    if (car.respawned && near) {
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        this.puff.emit(car.x + Math.cos(a), car.y + 0.6, car.z + Math.sin(a), Math.cos(a) * 4, 2, Math.sin(a) * 4, P.smoke);
      }
    }
    if (car.landed) {
      if (near && car.landed > 6) {
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          this.puff.emit(car.x + Math.cos(a) * 1.5, car.y + 0.2, car.z + Math.sin(a) * 1.5, Math.cos(a) * 6, 1, Math.sin(a) * 6, P.dust);
        }
      }
      if (isPlayer) this.shake = Math.max(this.shake, Math.min(0.5, car.landed * 0.03));
      car.landed = 0;
    }
    if (!near || ticks === 0) return;

    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const rx = -fz, rz = fx;
    const rear = (side, back = 1.3) => [car.x - fx * back + rx * side, car.y + 0.15, car.z - fz * back + rz * side];
    const vx = car.vx, vz = car.vz;

    for (let t = 0; t < ticks; t++) {
      if (car.drifting && !car.airborne) {
        const p = car.driftTime > 1.7 ? P.driftOrange : car.driftTime > 0.85 ? P.driftBlue : P.driftWhite;
        for (const side of [-1.25, 1.25]) {
          const [x, y, z] = rear(side);
          this.glow.emit(x, y, z, vx * 0.85 - fx * 3 + rx * side * 1.5 + rnd(2.5), 1.5 + Math.random() * 3, vz * 0.85 - fz * 3 + rz * side * 1.5 + rnd(2.5), p);
          if (Math.random() < 0.5) this.puff.emit(x, y, z, vx * 0.3 + rnd(1), 0.5, vz * 0.3 + rnd(1), P.smoke);
        }
      }
      if (car.boost > 0) {
        for (const side of [-0.45, 0.45]) {
          const [x, , z] = rear(side, 2.3);
          this.glow.emit(x, car.y + 0.55, z, vx - fx * 7 + rnd(1.2), rnd(0.8), vz - fz * 7 + rnd(1.2), P.flame);
        }
      }
      if (car.offroad && !car.airborne && Math.abs(car.speed) > 10 && Math.random() < 0.7) {
        const side = Math.random() < 0.5 ? -1.25 : 1.25;
        const [x, y, z] = rear(side);
        this.puff.emit(x, y, z, vx * 0.2 + rnd(2), 1.5, vz * 0.2 + rnd(2), P.dust);
        this.puff.emit(x, y, z, vx * 0.4 + rnd(3), 3 + Math.random() * 3, vz * 0.4 + rnd(3), P.grass);
      }
    }
  }

  update(dt) {
    this.glow.update(dt);
    this.puff.update(dt);
    this.shake = Math.max(0, this.shake - dt * 1.8);
  }
}
