import * as THREE from 'three';
import { toon, canvasTexture } from './materials.js';

export const HALF_WIDTH = 18;
export const CURB_WIDTH = 1.4;
export const WALL_OFFSET = HALF_WIDTH + 8;

const SCALE = 1.6;

// Motocross-style tabletop jumps: kicker up to a flat table, then a smooth
// landing slope back down, so there is never a gap to fall into.
// `at` is the sample index where the kicker starts (both sit on straights).
export const JUMP = { height: 3, kick: 14, table: 16, landing: 22 };
const JUMPS = [{ at: 140 }, { at: 990 }];

function jumpProfile(s) {
  const { height: H, kick, table, landing } = JUMP;
  if (s <= 0) return 0;
  if (s < kick) return H * (s / kick) ** 2;
  if (s < kick + table) return H;
  const t = (s - kick - table) / landing;
  if (t < 1) return H * (1 - t * t * (3 - 2 * t));
  return 0;
}
// Closed loop of control points (x, z). Starts on the top straight heading +x.
const CONTROL = [
  [-60, 100], [40, 100], [120, 80], [170, 20], [160, -50], [110, -80],
  [60, -50], [20, -20], [-30, -40], [-60, -100], [-120, -120],
  [-180, -80], [-200, 0], [-150, 80],
];

export class Track {
  constructor() {
    const pts = CONTROL.map(([x, z]) => new THREE.Vector3(x * SCALE, 0, z * SCALE));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.length = curve.getLength();
    this.N = Math.round(this.length / 0.7);
    this.spacing = this.length / this.N;
    this.pos = curve.getSpacedPoints(this.N).slice(0, this.N);
    this.tan = [];
    this.right = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < this.N; i++) {
      const a = this.pos[this.wrap(i - 1)];
      const b = this.pos[this.wrap(i + 1)];
      const t = new THREE.Vector3().subVectors(b, a).normalize();
      this.tan.push(t);
      this.right.push(new THREE.Vector3().crossVectors(t, up).normalize());
    }
    // Rolling elevation along the loop (integer frequencies keep it periodic).
    this.height = [];
    for (let i = 0; i < this.N; i++) {
      const u = (i / this.N) * Math.PI * 2;
      this.height.push(7 * Math.sin(u * 2 + 0.6) + 5 * Math.sin(u * 3 + 2.1) + 3 * Math.sin(u * 5 + 0.3));
    }
    // Keep the lowest valley above the flat backdrop plane at y = -1.
    const lowest = Math.min(...this.height);
    for (let i = 0; i < this.N; i++) this.height[i] += 2 - lowest;
    this.jumps = JUMPS.map(({ at }) => ({ at, end: at + Math.ceil((JUMP.kick + JUMP.table + JUMP.landing) / this.spacing) }));
    for (const j of this.jumps) {
      for (let i = j.at; i <= j.end; i++) this.height[this.wrap(i)] += jumpProfile((i - j.at) * this.spacing);
    }

    this.group = new THREE.Group();
    this.buildRoad();
    this.buildCurbs();
    this.buildWalls();
    this.buildStartLine();
    this.buildJumpMarkings();
  }

  wrap(i) {
    return ((i % this.N) + this.N) % this.N;
  }

  // Nearest centerline sample. With a hint, only searches a local window.
  nearest(x, z, hint = -1) {
    let best = 0;
    let bestD = Infinity;
    const test = (i) => {
      const p = this.pos[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    };
    if (hint < 0) {
      for (let i = 0; i < this.N; i++) test(i);
    } else {
      for (let k = -40; k <= 40; k++) test(this.wrap(hint + k));
    }
    return best;
  }

  lateral(i, x, z) {
    const p = this.pos[i];
    const r = this.right[i];
    return (x - p.x) * r.x + (z - p.z) * r.z;
  }

  // Road height under (x, z), interpolated between neighbouring samples.
  heightAt(i, x, z) {
    const p = this.pos[i], t = this.tan[i];
    const f = ((x - p.x) * t.x + (z - p.z) * t.z) / this.spacing;
    const j = this.wrap(i + (f >= 0 ? 1 : -1));
    return THREE.MathUtils.lerp(this.height[i], this.height[j], Math.min(1, Math.abs(f)));
  }

  slopeAt(i) {
    return (this.height[this.wrap(i + 1)] - this.height[this.wrap(i - 1)]) / (2 * this.spacing);
  }

  headingAt(i) {
    const t = this.tan[i];
    return Math.atan2(t.x, t.z);
  }

  // Flat strip between two lateral offsets, following the centerline
  // (optionally only over samples i0..i1).
  flatRibbon(o0, o1, y, vScale, i0 = 0, i1 = this.N) {
    const count = i1 - i0 + 1;
    const positions = new Float32Array(count * 6);
    const normals = new Float32Array(count * 6);
    const uvs = new Float32Array(count * 4);
    const indices = [];
    for (let n = 0; n < count; n++) {
      const k = this.wrap(i0 + n);
      const p = this.pos[k];
      const r = this.right[k];
      const v = (n * this.spacing) / vScale;
      const h = this.height[k] + y;
      positions.set([p.x + r.x * o0, h, p.z + r.z * o0, p.x + r.x * o1, h, p.z + r.z * o1], n * 6);
      normals.set([0, 1, 0, 0, 1, 0], n * 6);
      uvs.set([0, v, 1, v], n * 4);
      if (n < count - 1) {
        const a = n * 2, b = a + 1, c = a + 2, d = a + 3;
        indices.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(indices);
    return g;
  }

  // Vertical strip at a lateral offset.
  wallRibbon(offset, height, vScale) {
    const N = this.N;
    const positions = new Float32Array((N + 1) * 6);
    const uvs = new Float32Array((N + 1) * 4);
    const indices = [];
    for (let i = 0; i <= N; i++) {
      const p = this.pos[i % N];
      const r = this.right[i % N];
      const x = p.x + r.x * offset;
      const z = p.z + r.z * offset;
      const v = (i * this.spacing) / vScale;
      const h = this.height[i % N] - 0.3;
      positions.set([x, h, z, x, h + height + 0.3, z], i * 6);
      uvs.set([0, v, 1, v], i * 4);
      if (i < N) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        indices.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  buildRoad() {
    const tex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#5b5c66';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        const s = 70 + Math.random() * 40;
        ctx.fillStyle = `rgb(${s},${s},${s + 8})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(3, 0, 4, h);
      ctx.fillRect(w - 7, 0, 4, h);
    });
    tex.anisotropy = 8;
    const mesh = new THREE.Mesh(
      this.flatRibbon(-HALF_WIDTH, HALF_WIDTH, 0.02, 14),
      toon(0xffffff, { map: tex }),
    );
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.road = mesh;
  }

  buildCurbs() {
    const tex = canvasTexture(2, 2, (ctx) => {
      ctx.fillStyle = '#e8312a'; ctx.fillRect(0, 0, 2, 1);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 1, 2, 1);
    }, { nearest: true });
    const mat = toon(0xffffff, { map: tex });
    for (const [a, b] of [[-HALF_WIDTH - CURB_WIDTH, -HALF_WIDTH], [HALF_WIDTH, HALF_WIDTH + CURB_WIDTH]]) {
      const mesh = new THREE.Mesh(this.flatRibbon(a, b, 0.05, 4), mat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  buildWalls() {
    const tex = canvasTexture(2, 2, (ctx) => {
      ctx.fillStyle = '#2f6fe0'; ctx.fillRect(0, 0, 2, 1);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 1, 2, 1);
    }, { nearest: true });
    const mat = toon(0xffffff, { map: tex, side: THREE.DoubleSide });
    for (const off of [-WALL_OFFSET, WALL_OFFSET]) {
      const mesh = new THREE.Mesh(this.wallRibbon(off, 1.1, 6), mat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  // Yellow/black chevrons on each kicker so the jumps read from a distance.
  buildJumpMarkings() {
    const tex = canvasTexture(64, 64, (ctx, w, h) => {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          ctx.fillStyle = (y + Math.abs(x - w / 2)) % 32 < 16 ? '#ffcc1a' : '#26262b';
          ctx.fillRect(x, y, 1, 1);
        }
      }
    });
    tex.anisotropy = 8;
    const mat = toon(0xffffff, { map: tex });
    const kickSamples = Math.round(JUMP.kick / this.spacing);
    for (const j of this.jumps) {
      const mesh = new THREE.Mesh(this.flatRibbon(-HALF_WIDTH, HALF_WIDTH, 0.04, -9, j.at, j.at + kickSamples), mat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  buildStartLine() {
    const checker = canvasTexture(16, 4, (ctx) => {
      for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 4; y++) {
          ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }, { nearest: true });
    checker.wrapS = checker.wrapT = THREE.ClampToEdgeWrapping;

    const g = new THREE.Group();
    const line = new THREE.Mesh(new THREE.PlaneGeometry(HALF_WIDTH * 2, 3), toon(0xffffff, { map: checker }));
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.06;
    line.receiveShadow = true;
    g.add(line);

    const postMat = toon(0xdddddd);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 9, 0.9), postMat);
      post.position.set(s * (HALF_WIDTH + 2.5), 4.5, 0);
      post.castShadow = true;
      g.add(post);
    }
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(HALF_WIDTH * 2 + 6, 2, 0.6),
      [postMat, postMat, postMat, postMat, toon(0xffffff, { map: checker }), toon(0xffffff, { map: checker })],
    );
    banner.position.y = 9;
    banner.castShadow = true;
    g.add(banner);

    const p = this.pos[0];
    g.position.set(p.x, this.height[0], p.z);
    g.rotation.y = this.headingAt(0);
    this.group.add(g);
  }
}
