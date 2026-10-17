import * as THREE from 'three';
import { toon, canvasTexture } from './materials.js';

export const BASE_HALF_WIDTH = 18;
export const CURB_WIDTH = 1.4;
export const RUNOFF = 8; // grass between the curb and the wall

const SCALE = 1.6;
// Closed loop of control points (x, z). Starts on the top straight heading +x.
const CONTROL = [
  [-60, 100], [40, 100], [120, 80], [170, 20], [160, -50], [110, -80],
  [60, -50], [20, -20], [-30, -40], [-60, -100], [-120, -120],
  [-180, -80], [-200, 0], [-150, 80],
];

// Road width zones (sample indices). Width eases in and out over BLEND samples.
const BLEND = 45;
const WIDTH_ZONES = [
  { from: 320, to: 700, hw: 23 },   // wide right-hand sweeper
  { from: 860, to: 940, hw: 15 },   // hairpin
  { from: 1110, to: 1290, hw: 11 }, // narrow technical chicane
  { from: 1480, to: 1610, hw: 12.5 }, // mountain pass over the summit
  { from: 2120, to: 2260, hw: 21 }, // wide run to the finish
];

// Elevation features layered on the rolling hills. Each is a list of segments
// (lengths in world units) starting at sample `at`:
//   kick:   concave ramp up to `to` (a lip that launches you)
//   flat:   hold height
//   ease:   smooth slope to `to` (landing)
//   whoops: `count` rhythm bumps of `height`
// Every feature is continuous road: there is never a gap to fall into.
const FEATURES = [
  { at: 140, segs: [{ kick: 14, to: 3 }, { flat: 16 }, { ease: 22, to: 0 }] },
  { at: 990, segs: [{ kick: 20, to: 4 }, { flat: 18 }, { ease: 26, to: 0 }] },
  { at: 1790, segs: [{ whoops: 60, count: 6, height: 1.3 }] },
  { at: 1960, segs: [{ kick: 12, to: 2.5 }, { flat: 10 }, { kick: 10, to: 5 }, { flat: 14 }, { ease: 26, to: 0 }] },
];

// Dash panels: sample index and lateral offset of the pad centre.
const PADS = [
  { at: 270, lat: 9 },
  { at: 960, lat: 0 },
  { at: 1740, lat: -6 },
  { at: 2235, lat: 7 },
];
export const PAD_HALF_LENGTH = 4;
export const PAD_HALF_WIDTH = 2.6;

const smooth = (t) => t * t * (3 - 2 * t);

// Height offset and kicker ranges for one feature.
function featureProfile(segs, spacing) {
  const heights = [];
  const kicks = [];
  let h0 = 0;
  for (const seg of segs) {
    const len = seg.kick ?? seg.flat ?? seg.ease ?? seg.whoops;
    const n = Math.round(len / spacing);
    const start = heights.length;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      if (seg.kick !== undefined) heights.push(h0 + (seg.to - h0) * t * t);
      else if (seg.ease !== undefined) heights.push(h0 + (seg.to - h0) * smooth(t));
      else if (seg.whoops !== undefined) heights.push(h0 + seg.height * (1 - Math.cos(t * seg.count * Math.PI * 2)) / 2);
      else heights.push(h0);
    }
    if (seg.kick !== undefined) kicks.push([start, heights.length]);
    if (seg.to !== undefined) h0 = seg.to;
  }
  heights.push(h0);
  return { heights, kicks };
}

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

    this.hw = [];
    for (let i = 0; i < this.N; i++) {
      let hw = BASE_HALF_WIDTH;
      for (const z of WIDTH_ZONES) {
        const w = THREE.MathUtils.smoothstep(i, z.from - BLEND, z.from) * (1 - THREE.MathUtils.smoothstep(i, z.to, z.to + BLEND));
        hw = THREE.MathUtils.lerp(hw, z.hw, w);
      }
      this.hw.push(hw);
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

    this.kicks = [];
    for (const f of FEATURES) {
      const { heights, kicks } = featureProfile(f.segs, this.spacing);
      heights.forEach((h, k) => { this.height[this.wrap(f.at + k)] += h; });
      for (const [a, b] of kicks) this.kicks.push([f.at + a, f.at + b]);
    }

    this.pads = PADS.map((p) => ({ ...p, halfSamples: Math.round(PAD_HALF_LENGTH / this.spacing) }));

    this.group = new THREE.Group();
    this.buildRoad();
    this.buildCurbs();
    this.buildWalls();
    this.buildStartLine();
    this.buildJumpMarkings();
    this.buildPads();
  }

  wrap(i) {
    return ((i % this.N) + this.N) % this.N;
  }

  wallOffset(i) {
    return this.hw[i] + CURB_WIDTH + RUNOFF;
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

  // Pad the car at sample i / lateral `lat` is on, if any.
  padAt(i, lat) {
    for (const pad of this.pads) {
      let d = i - pad.at;
      if (d > this.N / 2) d -= this.N;
      if (d < -this.N / 2) d += this.N;
      if (Math.abs(d) <= pad.halfSamples && Math.abs(lat - pad.lat) <= PAD_HALF_WIDTH) return pad;
    }
    return null;
  }

  update(time) {
    this.padTex.offset.y = -time * 1.6;
  }

  // Flat strip between two lateral offsets (numbers, or functions of the
  // sample index), following the centerline over samples i0..i1.
  flatRibbon(o0, o1, y, vScale, i0 = 0, i1 = this.N) {
    const off = (o, k) => (typeof o === 'function' ? o(k) : o);
    const count = i1 - i0 + 1;
    const positions = new Float32Array(count * 6);
    const normals = new Float32Array(count * 6);
    const uvs = new Float32Array(count * 4);
    const indices = [];
    for (let n = 0; n < count; n++) {
      const k = this.wrap(i0 + n);
      const p = this.pos[k];
      const r = this.right[k];
      const a = off(o0, k), b = off(o1, k);
      const v = (n * this.spacing) / vScale;
      const h = this.height[k] + y;
      positions.set([p.x + r.x * a, h, p.z + r.z * a, p.x + r.x * b, h, p.z + r.z * b], n * 6);
      normals.set([0, 1, 0, 0, 1, 0], n * 6);
      uvs.set([0, v, 1, v], n * 4);
      if (n < count - 1) {
        const ia = n * 2, ib = ia + 1, ic = ia + 2, id = ia + 3;
        indices.push(ia, ib, ic, ib, id, ic);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    g.setIndex(indices);
    return g;
  }

  // Vertical strip on one side (+1 right / -1 left) at the wall offset.
  wallRibbon(side, height, vScale) {
    const N = this.N;
    const positions = new Float32Array((N + 1) * 6);
    const uvs = new Float32Array((N + 1) * 4);
    const indices = [];
    for (let i = 0; i <= N; i++) {
      const k = i % N;
      const p = this.pos[k];
      const r = this.right[k];
      const o = side * this.wallOffset(k);
      const x = p.x + r.x * o;
      const z = p.z + r.z * o;
      const v = (i * this.spacing) / vScale;
      const h = this.height[k] - 0.3;
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
      this.flatRibbon((k) => -this.hw[k], (k) => this.hw[k], 0.02, 14),
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
    const sides = [
      [(k) => -this.hw[k] - CURB_WIDTH, (k) => -this.hw[k]],
      [(k) => this.hw[k], (k) => this.hw[k] + CURB_WIDTH],
    ];
    for (const [a, b] of sides) {
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
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(this.wallRibbon(side, 1.1, 6), mat);
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
    for (const [a, b] of this.kicks) {
      const mesh = new THREE.Mesh(this.flatRibbon((k) => -this.hw[k], (k) => this.hw[k], 0.04, -9, a, b), mat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  // Glowing dash panels with scrolling arrows.
  buildPads() {
    this.padTex = canvasTexture(64, 64, (ctx, w, h) => {
      ctx.fillStyle = '#ff6a00';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffe14a';
      for (const y0 of [0, 32]) {
        ctx.beginPath();
        ctx.moveTo(8, y0 + 26);
        ctx.lineTo(32, y0 + 6);
        ctx.lineTo(56, y0 + 26);
        ctx.lineTo(56, y0 + 16);
        ctx.lineTo(32, y0 - 4);
        ctx.lineTo(8, y0 + 16);
        ctx.closePath();
        ctx.fill();
      }
    });
    const mat = new THREE.MeshBasicMaterial({ map: this.padTex });
    for (const pad of this.pads) {
      const geo = this.flatRibbon(pad.lat - PAD_HALF_WIDTH, pad.lat + PAD_HALF_WIDTH, 0.07, -PAD_HALF_LENGTH,
        pad.at - pad.halfSamples, pad.at + pad.halfSamples);
      this.group.add(new THREE.Mesh(geo, mat));
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

    const hw = this.hw[0];
    const g = new THREE.Group();
    const line = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 3), toon(0xffffff, { map: checker }));
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.06;
    line.receiveShadow = true;
    g.add(line);

    const postMat = toon(0xdddddd);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 9, 0.9), postMat);
      post.position.set(s * (hw + 2.5), 4.5, 0);
      post.castShadow = true;
      g.add(post);
    }
    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(hw * 2 + 6, 2, 0.6),
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
