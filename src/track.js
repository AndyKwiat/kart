import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, canvasTexture } from './materials.js';
import { buildTunnel } from './tunnel.js';
import { roadTexture, stripeTexture, chevronTexture, padTexture, checkerTexture } from './textures.js';

export const BASE_HALF_WIDTH = 18;
export const CURB_WIDTH = 1.4;
export const RUNOFF = 8; // grass between the curb and the wall

const SCALE = 1.75;
// All sample indices below are authored against a lap of LAYOUT_N samples and
// rescaled to the real sample count, so the layout can be resized freely.
const LAYOUT_N = 4754;
// Closed loop of control points (x, z). Starts on the top straight heading +x.
// The eastern half is the original circuit; from [-200, 0] the road heads
// out on a big western loop and comes back to the start straight.
const CONTROL = [
  [-60, 100], [40, 100], [120, 80], [170, 20], [160, -50], [110, -80],
  [60, -50], [20, -20], [-30, -40], [-60, -100], [-120, -120],
  [-180, -80], [-200, 0],
  [-240, 60], [-320, 80], [-400, 40], [-480, 70], [-520, 160], [-490, 260],
  [-420, 330], [-310, 370], [-200, 350], [-130, 280], [-165, 190], [-135, 118],
];

// Road width zones (sample indices). Width eases in and out over BLEND samples.
const BLEND = 45;
const WIDTH_ZONES = [
  { from: 320, to: 700, hw: 23 },   // wide right-hand sweeper
  { from: 860, to: 940, hw: 15 },   // hairpin
  { from: 1110, to: 1290, hw: 11 }, // narrow technical chicane
  { from: 1480, to: 1610, hw: 12.5 }, // mountain pass over the summit
  { from: 2280, to: 2520, hw: 12.5 }, // western esses
  { from: 4080, to: 4240, hw: 15 },   // valley hairpin
  { from: 4370, to: 4510, hw: 13 },   // second tunnel
  { from: 4600, to: 4690, hw: 21 },   // wide run to the finish
];

// Elevation features layered on the rolling hills. Each is a list of segments
// (lengths in world units) starting at sample `at`:
//   kick:   concave ramp up to `to` (a lip that launches you)
//   flat:   hold height
//   ease:   smooth slope to `to` (landing)
//   whoops: `count` rhythm bumps of `height`
// Every feature is continuous road: there is never a gap to fall into.
// `side` (-1 left / +1 right) puts a feature on one branch of a fork only.
const FEATURES = [
  { at: 140, segs: [{ kick: 14, to: 3 }, { flat: 16 }, { ease: 22, to: 0 }] },
  { at: 500, side: 1, segs: [{ kick: 12, to: 2.5 }, { flat: 10 }, { ease: 18, to: 0 }] },
  { at: 990, segs: [{ kick: 20, to: 4 }, { flat: 18 }, { ease: 26, to: 0 }] },
  { at: 1775, segs: [{ whoops: 60, count: 6, height: 1.3 }] },
  { at: 3895, side: -1, segs: [{ whoops: 60, count: 6, height: 1.3 }] },
  { at: 1960, segs: [{ kick: 12, to: 2.5 }, { flat: 10 }, { kick: 10, to: 5 }, { flat: 14 }, { ease: 26, to: 0 }] },
  { at: 2715, side: -1, segs: [{ ease: 50, to: 9 }, { flat: 22 }, { ease: 50, to: 0 }] }, // hill route
  { at: 3150, segs: [{ kick: 16, to: 3.5 }, { flat: 16 }, { ease: 24, to: 0 }] },
  { at: 3355, side: -1, segs: [{ kick: 14, to: 3.5 }, { flat: 14 }, { ease: 22, to: 0 }] },
  { at: 3370, side: 1, segs: [{ whoops: 70, count: 7, height: 1.3 }] },
  { at: 3700, segs: [{ kick: 22, to: 5 }, { flat: 22 }, { ease: 30, to: 0 }] }, // mega jump
];

// Forks: the road splits into two routes around a grass island and rejoins.
// `spread` is how far each route's centre moves from the centreline, `bw`
// the half-width of each route, `ramp` the samples taken to split/merge.
const FORKS = [
  { from: 400, to: 650, spread: 26, bw: 12, ramp: 60 },   // sweeper: pad vs kicker
  { from: 2620, to: 3020, spread: 34, bw: 12, ramp: 70 }, // valley: over the hill vs round it
  { from: 3240, to: 3600, spread: 30, bw: 12, ramp: 60 }, // back straight: jump vs whoops
  { from: 3850, to: 4060, spread: 24, bw: 11, ramp: 55 }, // downhill: whoops vs pad
];

// Banked corners: the road tilts up toward the outside of the bend
// (`slope` = rise per unit of lateral distance at full bank).
const BANK_ZONES = [
  { from: 815, to: 965, slope: 0.3 },   // hairpin
  { from: 1370, to: 1450, slope: 0.22 }, // climb to the summit
  { from: 4080, to: 4240, slope: 0.3 },  // valley hairpin
];

// Tunnels through hills: a long mountain tunnel and a short one on the final S-bends.
// The long one runs through a mountain for about a quarter of the lap; its
// ceiling height is worked out from jump trajectories (see computeCeiling).
const TUNNELS = [
  { from: 1110, to: 2310, long: true },
  { from: 4390, to: 4490, height: 10 },
];

// Dash panels: sample index and lateral offset of the pad centre.
// `branch` (-1/+1) centres a pad on that route of a fork instead.
const PADS = [
  { at: 270, lat: 9 },
  { at: 525, branch: -1 },
  { at: 960, lat: 0 },
  { at: 1740, lat: -6 },
  { at: 3950, branch: 1 },
  { at: 2800, branch: 1 },
  { at: 3120, lat: 0 },
  { at: 3320, branch: -1 },
  { at: 4640, lat: 7 },
];
export const PAD_HALF_LENGTH = 4;
const ISLAND_LIFT = 0.45; // height of the island curb above the road
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

    const L = (i) => Math.round((i * this.N) / LAYOUT_N);
    const widthZones = WIDTH_ZONES.map((z) => ({ ...z, from: L(z.from), to: L(z.to) }));
    this.bankZones = BANK_ZONES.map((z) => ({ ...z, from: L(z.from), to: L(z.to) }));
    this.tunnels = TUNNELS.map((t) => ({ ...t, from: L(t.from), to: L(t.to) }));
    this.forks = FORKS.map((f) => ({ ...f, from: L(f.from), to: L(f.to), ramp: L(f.ramp) }));

    this.hw = [];
    for (let i = 0; i < this.N; i++) {
      let hw = BASE_HALF_WIDTH;
      for (const z of widthZones) {
        const w = THREE.MathUtils.smoothstep(i, z.from - BLEND, z.from) * (1 - THREE.MathUtils.smoothstep(i, z.to, z.to + BLEND));
        hw = THREE.MathUtils.lerp(hw, z.hw, w);
      }
      this.hw.push(hw);
    }

    // Forks widen the road to cover both routes and put an island between.
    this.islandHw = new Array(this.N).fill(0);
    this.forkId = new Array(this.N).fill(-1);
    this.forkO = new Array(this.N).fill(0); // route centre offset
    this.forkBw = new Array(this.N).fill(0); // route half-width
    this.forks.forEach((f, id) => {
      for (let i = f.from; i <= f.to; i++) {
        const k = this.wrap(i);
        const env = THREE.MathUtils.smoothstep(i, f.from, f.from + f.ramp) * (1 - THREE.MathUtils.smoothstep(i, f.to - f.ramp, f.to));
        const o = f.spread * env;
        this.hw[k] = Math.max(this.hw[k], o + f.bw);
        this.islandHw[k] = Math.max(0, o - f.bw);
        this.forkId[k] = id;
        this.forkO[k] = o;
        this.forkBw[k] = f.bw;
      }
    });

    this.bank = this.computeBank();

    // Rolling elevation along the loop (integer frequencies keep it periodic).
    this.height = [];
    for (let i = 0; i < this.N; i++) {
      const u = (i / this.N) * Math.PI * 2;
      // Frequencies are per lap; doubled when the lap doubled in length so the
      // hills keep the same spacing.
      this.height.push(11 * Math.sin(u * 4 + 0.6) + 8 * Math.sin(u * 6 + 2.1) + 4 * Math.sin(u * 10 + 0.3) + 2.5 * Math.sin(u * 16 + 1.2));
    }

    // Per-route height offsets inside forks ([left, right]).
    this.sideH = [new Float32Array(this.N), new Float32Array(this.N)];
    this.kicks = [];
    for (const f of FEATURES) {
      const at = L(f.at);
      const { heights, kicks } = featureProfile(f.segs, this.spacing);
      const target = f.side ? this.sideH[f.side < 0 ? 0 : 1] : this.height;
      heights.forEach((h, k) => { target[this.wrap(at + k)] += h; });
      for (const [a, b] of kicks) this.kicks.push([at + a, at + b, f.side ?? 0]);
    }
    // Keep the lowest point (including the low side of banked corners) above
    // the flat backdrop plane at y = -1.
    let lowest = Infinity;
    for (let i = 0; i < this.N; i++) lowest = Math.min(lowest, this.height[i] - Math.abs(this.bank[i]) * this.wallOffset(i));
    for (let i = 0; i < this.N; i++) this.height[i] += 2 - lowest;

    this.pads = PADS.map((p) => {
      const at = this.wrap(L(p.at));
      const lat = p.branch ? p.branch * this.forkO[at] : p.lat;
      return { at, lat, halfSamples: Math.round(PAD_HALF_LENGTH / this.spacing) };
    });

    this.tunnelAt = new Uint8Array(this.N);
    this.tunnelOf = new Array(this.N).fill(null);
    for (const t of this.tunnels) {
      for (let i = t.from; i <= t.to; i++) {
        this.tunnelAt[this.wrap(i)] = 1;
        this.tunnelOf[this.wrap(i)] = t;
      }
    }
    // Set from outside once the terrain exists: terrain height at (x, z), for
    // cars that leave the track.
    this.terrainY = null;

    // Absolute ceiling height per sample inside long tunnels (Infinity elsewhere).
    this.ceil = new Float32Array(this.N).fill(Infinity);
    for (const t of this.tunnels) if (t.long) this.computeCeiling(t);

    this.group = new THREE.Group();
    this.buildRoad();
    this.buildCurbs();
    this.buildWalls();
    this.buildStartLine();
    this.buildJumpMarkings();
    this.buildPads();
    for (const t of this.tunnels) buildTunnel(this, t);
    for (const f of this.forks) this.buildIsland(f);
  }

  // Ceiling for a long tunnel: fly a car along the centreline at several
  // speeds (same launch/gravity rules as the car physics), take the highest
  // point reached at each sample, add headroom, then smooth upward so the roof
  // never dips below what's needed.
  computeCeiling({ from, to }) {
    const span = to - from;
    const need = new Float32Array(span + 1).fill(-Infinity);
    const top = (k) => Math.max(this.roadHeight(k, -this.hw[k]), this.roadHeight(k, 0), this.roadHeight(k, this.hw[k]));
    const G = 32;
    for (const v of [40, 55, 70, 85]) {
      const dt = this.spacing / v;
      let y = this.roadHeight(this.wrap(from - 220), 0), vy = 0, air = false;
      for (let i = from - 220; i <= to; i++) {
        const g = this.roadHeight(this.wrap(i), 0);
        if (air) {
          vy -= G * dt; y += vy * dt;
          if (y <= g) { y = g; vy = 0; air = false; }
        } else {
          const yb = y + vy * dt - 0.5 * G * dt * dt;
          if (vy > 2 && yb > g + 0.02) { air = true; y = yb; vy -= G * dt; }
          else { vy = Math.max(-40, Math.min(40, (g - y) / dt)); y = g; }
        }
        if (i >= from) need[i - from] = Math.max(need[i - from], y);
      }
    }
    const raw = [];
    for (let n = 0; n <= span; n++) {
      const k = this.wrap(from + n);
      // Headroom for the car plus the chase camera riding above it.
      raw.push(Math.max(top(k) + 12, need[n] + 9));
    }
    const max = raw.map((_, n) => Math.max(...raw.slice(Math.max(0, n - 30), n + 31)));
    for (let n = 0; n <= span; n++) {
      const win = max.slice(Math.max(0, n - 20), n + 21);
      this.ceil[this.wrap(from + n)] = win.reduce((a, b) => a + b, 0) / win.length;
    }
  }

  // Bank slope per sample: tilts up toward the outside of the curve inside
  // BANK_ZONES, eased in/out and smoothed along the track.
  computeBank() {
    const raw = [];
    for (let i = 0; i < this.N; i++) {
      let w = 0, slope = 0;
      for (const z of this.bankZones) {
        const zw = THREE.MathUtils.smoothstep(i, z.from - 30, z.from) * (1 - THREE.MathUtils.smoothstep(i, z.to, z.to + 30));
        if (zw > w) { w = zw; slope = z.slope; }
      }
      if (w === 0) { raw.push(0); continue; }
      // Which side is the inside of the bend?
      const a = this.tan[this.wrap(i - 8)], b = this.tan[this.wrap(i + 8)], r = this.right[i];
      const k = ((b.x - a.x) * r.x + (b.z - a.z) * r.z) / (16 * this.spacing);
      raw.push(-Math.sign(k) * slope * w * THREE.MathUtils.smoothstep(Math.abs(k), 0.002, 0.01));
    }
    const out = [];
    for (let i = 0; i < this.N; i++) {
      let sum = 0;
      for (let k = -12; k <= 12; k++) sum += raw[this.wrap(i + k)];
      out.push(sum / 25);
    }
    return out;
  }

  // Road surface height at sample i, lateral offset lat (includes banking).
  roadHeight(i, lat) {
    let h = this.height[i] + this.bank[i] * lat;
    const iw = this.islandHw[i];
    if (iw > 0) h += this.sideH[lat < 0 ? 0 : 1][i] * Math.min(1, iw / 3);
    return h;
  }

  // Inside a tunnel: height of the arch above lateral offset `lat` (the arch is
  // a half-ellipse, lowest at the walls). Infinity outside tunnels.
  archTop(i, lat) {
    const t = this.tunnelOf[i];
    if (!t || !t.heightAt) return Infinity;
    const w = this.wallOffset(i) + 0.6;
    const f = Math.min(0.995, Math.abs(lat) / w);
    return this.roadHeight(i, lat) - 0.4 + Math.sqrt(1 - f * f) * t.heightAt(i);
  }

  // Fork island surface height at lateral `lat` (mound between the routes),
  // or -Infinity off the island.
  islandTop(i, lat) {
    const iw = this.islandHw[i];
    if (iw <= 0) return lat === 0 ? this.roadHeight(i, 0) + ISLAND_LIFT : -Infinity; // island tip
    if (Math.abs(lat) > iw) return -Infinity;
    const c = lat / iw;
    const hl = this.roadHeight(i, -iw), hr = this.roadHeight(i, iw);
    return THREE.MathUtils.lerp(hl, hr, (c + 1) / 2) + ISLAND_LIFT + Math.min(6, iw * 0.3) * (1 - c * c);
  }

  // Centre and half-width of the route on `side` at sample i inside a fork,
  // or of the whole road elsewhere.
  route(i, side) {
    const o = this.forkO[i];
    if (o <= 0) return { center: 0, half: this.hw[i] };
    return { center: side * o, half: this.forkBw[i] };
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
    const lat = this.lateral(i, x, z);
    return THREE.MathUtils.lerp(this.roadHeight(i, lat), this.roadHeight(j, lat), Math.min(1, Math.abs(f)));
  }

  slopeAt(i, lat = 0) {
    return (this.roadHeight(this.wrap(i + 1), lat) - this.roadHeight(this.wrap(i - 1), lat)) / (2 * this.spacing);
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
  flatRibbon(o0, o1, y, vScale, i0 = 0, i1 = this.N, u0 = 0, u1 = 1) {
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
      const ha = this.roadHeight(k, a) + y, hb = this.roadHeight(k, b) + y;
      positions.set([p.x + r.x * a, ha, p.z + r.z * a, p.x + r.x * b, hb, p.z + r.z * b], n * 6);
      normals.set([0, 1, 0, 0, 1, 0], n * 6);
      uvs.set([u0, v, u1, v], n * 4);
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
      const h = this.roadHeight(k, o) - 0.3;
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
    const tex = roadTexture();
    // Left and right halves, split down the middle (or at the island inside a
    // fork) so each route can sit at its own height.
    const geo = mergeGeometries([
      this.flatRibbon((k) => -this.hw[k], (k) => -this.islandHw[k], 0.02, 28, 0, this.N, 0, 0.5),
      this.flatRibbon((k) => this.islandHw[k], (k) => this.hw[k], 0.02, 28, 0, this.N, 0.5, 1),
    ]);
    const mesh = new THREE.Mesh(geo, toon(0xffffff, { map: tex }));
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.road = mesh;
  }

  buildCurbs() {
    const tex = stripeTexture('#e8312a', '#f6f6f6');
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
    const tex = stripeTexture('#2f6fe0', '#f6f6f6', { bevel: false });
    const mat = toon(0xffffff, { map: tex, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(this.wallRibbon(side, 1.1, 6), mat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  // Yellow/black chevrons on each kicker so the jumps read from a distance.
  buildJumpMarkings() {
    const tex = chevronTexture();
    const mat = toon(0xffffff, { map: tex });
    for (const [a, b, side] of this.kicks) {
      const lo = side > 0 ? (k) => this.islandHw[k] : (k) => -this.hw[k];
      const hi = side < 0 ? (k) => -this.islandHw[k] : (k) => this.hw[k];
      const mesh = new THREE.Mesh(this.flatRibbon(lo, hi, 0.04, -9, a, b), mat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  // Glowing dash panels with scrolling arrows.
  buildPads() {
    this.padTex = padTexture();
    // Over-bright so the bloom pass makes the pads glow.
    const mat = new THREE.MeshBasicMaterial({ map: this.padTex, color: new THREE.Color(2.4, 2.4, 2.4) });
    for (const pad of this.pads) {
      const geo = this.flatRibbon(pad.lat - PAD_HALF_WIDTH, pad.lat + PAD_HALF_WIDTH, 0.07, -PAD_HALF_LENGTH,
        pad.at - pad.halfSamples, pad.at + pad.halfSamples);
      this.group.add(new THREE.Mesh(geo, mat));
    }
  }

  // Fork island: a grassy mound between the two routes, curb-striped sides,
  // trees and rocks, and a chevron board where the road splits.
  buildIsland({ from, to }) {
    const lift = ISLAND_LIFT;
    const COLS = [-1, -0.5, 0, 0.5, 1];
    // Island surface height at sample k, fraction c (-1..1) across.
    const surface = (k, c) => this.islandTop(k, c * this.islandHw[k]);
    const point = (k, lat, h) => {
      const p = this.pos[k], r = this.right[k];
      return [p.x + r.x * lat, h, p.z + r.z * lat];
    };

    const positions = [], indices = [];
    const rows = to - from + 1;
    for (let n = 0; n < rows; n++) {
      const k = this.wrap(from + n);
      for (const c of COLS) positions.push(...point(k, c * this.islandHw[k], surface(k, c)));
      if (n < rows - 1) {
        for (let m = 0; m < COLS.length - 1; m++) {
          const a = n * COLS.length + m, b = a + 1, c2 = a + COLS.length, d = c2 + 1;
          indices.push(a, b, c2, b, d, c2);
        }
      }
    }
    const top = new THREE.BufferGeometry();
    top.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    top.setIndex(indices);
    top.computeVertexNormals();
    const topMesh = new THREE.Mesh(top, toon(0x5fb240));
    topMesh.receiveShadow = true;
    this.group.add(topMesh);

    const curbTex = stripeTexture('#ffcc1a', '#26262b');
    const sideMat = toon(0xffffff, { map: curbTex, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const pos = [], uvs = [], idx = [];
      for (let n = 0; n < rows; n++) {
        const k = this.wrap(from + n);
        const lat = side * this.islandHw[k];
        const h = this.roadHeight(k, lat);
        pos.push(...point(k, lat, h), ...point(k, lat, h + lift));
        const v = (n * this.spacing) / 3;
        uvs.push(0, v, 1, v);
        if (n < rows - 1) {
          const a = n * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      this.group.add(new THREE.Mesh(g, sideMat));
    }

    // Trees (and a few boulders) scattered over the mound.
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.5, 2, 6);
    const leafGeo = new THREE.ConeGeometry(2.4, 5.5, 7);
    const trunkMat = toon(0x8a5a32), leafMat = toon(0x2f9e44, { flatShading: true });
    const rockMat = toon(0x8f8a84, { flatShading: true });
    for (let k = from; k <= to; k += 14) {
      const iw = this.islandHw[this.wrap(k)];
      if (iw < 4) continue;
      const lanes = iw > 12 ? [-0.55, 0, 0.55] : [0];
      for (const c0 of lanes) {
        if (Math.random() < 0.3) continue;
        const kk = this.wrap(k + Math.floor(Math.random() * 8));
        const c = c0 + (Math.random() - 0.5) * 0.2;
        const [x, y, z] = point(kk, c * this.islandHw[kk], surface(kk, c));
        if (Math.random() < 0.2) {
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2 + Math.random(), 0), rockMat);
          rock.position.set(x, y + 0.4, z);
          rock.castShadow = true;
          this.group.add(rock);
          continue;
        }
        const s = 0.8 + Math.random() * 0.5;
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.set(x, y + 1 * s, z);
        trunk.scale.setScalar(s);
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.set(x, y + 4.5 * s, z);
        leaf.scale.setScalar(s);
        trunk.castShadow = leaf.castShadow = true;
        this.group.add(trunk, leaf);
      }
    }

    const chevron = canvasTexture(256, 128, (ctx) => {
      ctx.scale(4, 4);
      const w = 64, h = 32;
      ctx.fillStyle = '#ffcc1a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#26262b';
      for (const dir of [-1, 1]) {
        for (let n = 0; n < 2; n++) {
          const cx = w / 2 + dir * (10 + n * 12);
          ctx.beginPath();
          ctx.moveTo(cx, 4);
          ctx.lineTo(cx + dir * 7, h / 2);
          ctx.lineTo(cx, h - 4);
          ctx.lineTo(cx + dir * 3, h - 4);
          ctx.lineTo(cx + dir * 10, h / 2);
          ctx.lineTo(cx + dir * 3, 4);
          ctx.closePath();
          ctx.fill();
        }
      }
    });
    // Board at the nose, where the island is just wide enough to stand on.
    let k = from;
    while (k < to && this.islandHw[this.wrap(k)] < 3) k++;
    k = this.wrap(k + 4);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 0.3), [
      toon(0x26262b), toon(0x26262b), toon(0x26262b), toon(0x26262b),
      toon(0xffffff, { map: chevron }), toon(0xffffff, { map: chevron }),
    ]);
    const [x, y, z] = point(k, 0, surface(k, 0));
    sign.position.set(x, y + 1.6, z);
    sign.rotation.y = this.headingAt(k);
    sign.castShadow = true;
    this.group.add(sign);
  }

  buildStartLine() {
    const checker = checkerTexture(16, 4);
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
