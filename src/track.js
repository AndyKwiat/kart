import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, canvasTexture } from './materials.js';
import { buildTunnel } from './tunnel.js';
import { THEMES } from './themes.js';
import { buildChasm } from './chasm.js';
import { roadTexture, stripeTexture, chevronTexture, padTexture, checkerTexture, iceTexture } from './textures.js';

export const BASE_HALF_WIDTH = 18;
export const CURB_WIDTH = 1.4;
export const RUNOFF = 8; // grass between the curb and the wall

export const PAD_HALF_LENGTH = 4;
const ISLAND_LIFT = 0.45; // height of the island curb above the road
export const PAD_HALF_WIDTH = 2.6;

const smooth = (t) => t * t * (3 - 2 * t);

// Height offset and kicker ranges for one feature.
function featureProfile(segs, spacing) {
  const heights = [];
  const kicks = [];
  const gaps = [];
  let h0 = 0;
  for (const seg of segs) {
    const len = seg.kick ?? seg.flat ?? seg.ease ?? seg.whoops ?? seg.gap;
    const n = Math.round(len / spacing);
    const start = heights.length;
    for (let k = 0; k < n; k++) {
      const t = k / n;
      if (seg.kick !== undefined) heights.push(h0 + (seg.to - h0) * t * t);
      else if (seg.ease !== undefined) heights.push(h0 + (seg.to - h0) * smooth(t));
      else if (seg.whoops !== undefined) heights.push(h0 + seg.height * (1 - Math.cos(t * seg.count * Math.PI * 2)) / 2);
      else if (seg.gap !== undefined) heights.push(h0 + (seg.to - h0) * t); // no road here; nominal only
      else heights.push(h0);
    }
    if (seg.kick !== undefined) kicks.push([start, heights.length]);
    if (seg.gap !== undefined) gaps.push([start, heights.length - 1]);
    if (seg.to !== undefined) h0 = seg.to;
  }
  heights.push(h0);
  return { heights, kicks, gaps };
}

// Road width zones ease in and out over this many samples.
const BLEND = 45;

export class Track {
  // `def` is a track definition (see tracks/*.js): control points, width
  // zones, elevation features, forks, banks, tunnels, pads, hills, theme.
  constructor(def) {
    this.def = def;
    this.theme = THEMES[def.theme];
    const pts = def.control.map(([x, z]) => new THREE.Vector3(x * def.scale, 0, z * def.scale));
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

    const L = (i) => Math.round((i * this.N) / def.layoutN);
    const widthZones = (def.widthZones ?? []).map((z) => ({ ...z, from: L(z.from), to: L(z.to) }));
    this.bankZones = (def.banks ?? []).map((z) => ({ ...z, from: L(z.from), to: L(z.to) }));
    this.tunnels = (def.tunnels ?? []).map((t) => ({ ...t, from: L(t.from), to: L(t.to) }));
    this.forks = (def.forks ?? []).map((f) => ({ ...f, from: L(f.from), to: L(f.to), ramp: L(f.ramp) }));

    this.hw = [];
    for (let i = 0; i < this.N; i++) {
      let hw = def.halfWidth ?? BASE_HALF_WIDTH;
      for (const z of widthZones) {
        const w = THREE.MathUtils.smoothstep(i, z.from - BLEND, z.from) * (1 - THREE.MathUtils.smoothstep(i, z.to, z.to + BLEND));
        hw = THREE.MathUtils.lerp(hw, z.hw, w);
      }
      this.hw.push(hw);
    }

    // Forks widen the road to cover both routes and put an island between.
    // Each side has its own spread/width, so one route can be a narrow lane;
    // the island is the interval [islandMid - islandHw, islandMid + islandHw].
    this.islandHw = new Array(this.N).fill(0);
    this.islandMid = new Array(this.N).fill(0);
    this.forkId = new Array(this.N).fill(-1);
    this.forkO = [new Array(this.N).fill(0), new Array(this.N).fill(0)]; // [left, right] route centre offsets
    this.forkBw = [new Array(this.N).fill(0), new Array(this.N).fill(0)]; // route half-widths
    this.forks.forEach((f, id) => {
      const L = f.left ?? f, R = f.right ?? f;
      for (let i = f.from; i <= f.to; i++) {
        const k = this.wrap(i);
        const env = THREE.MathUtils.smoothstep(i, f.from, f.from + f.ramp) * (1 - THREE.MathUtils.smoothstep(i, f.to - f.ramp, f.to));
        const oL = L.spread * env, oR = R.spread * env;
        this.hw[k] = Math.max(this.hw[k], oL + L.bw, oR + R.bw);
        const lo = -(oL - L.bw), hi = oR - R.bw;
        this.islandHw[k] = Math.max(0, (hi - lo) / 2);
        this.islandMid[k] = (hi + lo) / 2 * Math.min(1, env * 3);
        this.forkId[k] = id;
        this.forkO[0][k] = oL;
        this.forkO[1][k] = oR;
        this.forkBw[0][k] = L.bw;
        this.forkBw[1][k] = R.bw;
      }
    });

    this.bank = this.computeBank();

    // Rolling elevation along the loop (integer frequencies keep it periodic).
    this.height = [];
    for (let i = 0; i < this.N; i++) {
      const u = (i / this.N) * Math.PI * 2;
      // Frequencies are per lap; doubled when the lap doubled in length so the
      // hills keep the same spacing.
      this.height.push(def.hills.reduce((h, [amp, f, ph]) => h + amp * Math.sin(u * f + ph), 0));
    }

    // Per-route height offsets inside forks ([left, right]).
    this.sideH = [new Float32Array(this.N), new Float32Array(this.N)];
    this.kicks = [];
    // Gaps: stretches with no road (the chasm). gapAt marks them per sample.
    this.gaps = [];
    this.gapAt = new Uint8Array(this.N);
    for (const f of def.features ?? []) {
      const at = L(f.at);
      const { heights, kicks, gaps } = featureProfile(f.segs, this.spacing);
      for (const [a, b] of gaps) {
        this.gaps.push({ from: at + a, to: at + b, center: this.wrap(at + Math.round((a + b) / 2)) });
        for (let i = at + a; i <= at + b; i++) this.gapAt[this.wrap(i)] = 1;
      }
      const target = f.side ? this.sideH[f.side < 0 ? 0 : 1] : this.height;
      heights.forEach((h, k) => { target[this.wrap(at + k)] += h; });
      for (const [a, b] of kicks) this.kicks.push([at + a, at + b, f.side ?? 0]);
    }
    // Keep the lowest point (including the low side of banked corners) above
    // the flat backdrop plane at y = -1.
    let lowest = Infinity;
    for (let i = 0; i < this.N; i++) lowest = Math.min(lowest, this.height[i] - Math.abs(this.bank[i]) * this.wallOffset(i));
    for (let i = 0; i < this.N; i++) this.height[i] += 2 - lowest;

    // Ice patches (slippery road).
    this.iceAt = new Uint8Array(this.N);
    for (const z of def.ice ?? []) for (let i = L(z.from); i <= L(z.to); i++) this.iceAt[this.wrap(i)] = 1;
    this.iceRanges = (def.ice ?? []).map((z) => [L(z.from), L(z.to)]);

    this.pads = (def.pads ?? []).map((p) => {
      const at = this.wrap(L(p.at));
      const lat = p.branch ? this.route(at, p.branch).center : p.lat;
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
    this.buildIce();
    for (const t of this.tunnels) buildTunnel(this, t);
    for (const f of this.forks) this.buildIsland(f);
    for (const g of this.gaps) buildChasm(this, g);
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
    if (iw > 0) h += this.sideH[lat < this.islandMid[i] ? 0 : 1][i] * Math.min(1, iw / 3);
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
    const iw = this.islandHw[i], mid = this.islandMid[i];
    if (iw <= 0) return lat === mid ? this.roadHeight(i, mid) + ISLAND_LIFT : -Infinity; // island tip
    if (Math.abs(lat - mid) > iw) return -Infinity;
    const c = (lat - mid) / iw;
    const hl = this.roadHeight(i, mid - iw), hr = this.roadHeight(i, mid + iw);
    return THREE.MathUtils.lerp(hl, hr, (c + 1) / 2) + ISLAND_LIFT + Math.min(6, iw * 0.3) * (1 - c * c);
  }

  // Centre and half-width of the route on `side` at sample i inside a fork,
  // or of the whole road elsewhere.
  route(i, side) {
    const s = side < 0 ? 0 : 1;
    const o = this.forkO[s][i];
    if (o <= 0) return { center: 0, half: this.hw[i] };
    return { center: side * o, half: this.forkBw[s][i] };
  }

  // Lateral edge of the fork island on `side` (the island centre if none).
  islandEdge(i, side) {
    return this.islandMid[i] + side * this.islandHw[i];
  }
  // Sample ranges [a, b] covering the loop minus the gaps (road pieces).
  roadRanges() {
    const out = [];
    let a = 0;
    for (const g of [...this.gaps].sort((p, q) => p.from - q.from)) {
      out.push([a, g.from]);
      a = g.to;
    }
    out.push([a, this.N]);
    return out;
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
      // No wall across a gap.
      if (i < N && !this.gapAt[k] && !this.gapAt[(i + 1) % N]) {
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
    const tex = roadTexture(this.theme.road.asphalt);
    // Left and right halves, split down the middle (or at the island inside a
    // fork) so each route can sit at its own height.
    const geo = mergeGeometries(this.roadRanges().flatMap(([a, b]) => [
      this.flatRibbon((k) => -this.hw[k], (k) => this.islandEdge(k, -1), 0.02, 28, a, b, 0, 0.5),
      this.flatRibbon((k) => this.islandEdge(k, 1), (k) => this.hw[k], 0.02, 28, a, b, 0.5, 1),
    ]));
    const mesh = new THREE.Mesh(geo, toon(0xffffff, { map: tex }));
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.road = mesh;
  }

  buildCurbs() {
    const tex = stripeTexture(...this.theme.road.curb);
    const mat = toon(0xffffff, { map: tex });
    const sides = [
      [(k) => -this.hw[k] - CURB_WIDTH, (k) => -this.hw[k]],
      [(k) => this.hw[k], (k) => this.hw[k] + CURB_WIDTH],
    ];
    for (const [a, b] of sides) {
      const mesh = new THREE.Mesh(mergeGeometries(this.roadRanges().map(([i0, i1]) => this.flatRibbon(a, b, 0.05, 4, i0, i1))), mat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  buildWalls() {
    const tex = stripeTexture(...this.theme.road.wall, { bevel: false });
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
      const lo = side > 0 ? (k) => this.islandEdge(k, 1) : (k) => -this.hw[k];
      const hi = side < 0 ? (k) => this.islandEdge(k, -1) : (k) => this.hw[k];
      const mesh = new THREE.Mesh(this.flatRibbon(lo, hi, 0.04, -9, a, b), mat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  // Frosty, glassy overlay where the road is icy.
  buildIce() {
    if (!this.iceRanges.length) return;
    const tex = iceTexture();
    const mat = toon(0xffffff, { map: tex, transparent: true, opacity: 0.85, depthWrite: false });
    for (const [a, b] of this.iceRanges) {
      const mesh = new THREE.Mesh(this.flatRibbon((k) => -this.hw[k] - 0.5, (k) => this.hw[k] + 0.5, 0.035, 12, a, b), mat);
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
    const surface = (k, c) => this.islandTop(k, this.islandMid[k] + c * this.islandHw[k]);
    const point = (k, lat, h) => {
      const p = this.pos[k], r = this.right[k];
      return [p.x + r.x * lat, h, p.z + r.z * lat];
    };

    const positions = [], indices = [];
    const rows = to - from + 1;
    for (let n = 0; n < rows; n++) {
      const k = this.wrap(from + n);
      for (const c of COLS) positions.push(...point(k, this.islandMid[k] + c * this.islandHw[k], surface(k, c)));
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
    const topMesh = new THREE.Mesh(top, toon(this.theme.road.island));
    topMesh.receiveShadow = true;
    this.group.add(topMesh);

    const curbTex = stripeTexture('#ffcc1a', '#26262b');
    const sideMat = toon(0xffffff, { map: curbTex, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const pos = [], uvs = [], idx = [];
      for (let n = 0; n < rows; n++) {
        const k = this.wrap(from + n);
        const lat = this.islandEdge(k, side);
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
    const isl = this.theme.islandTree ?? { shape: 'cone', leaf: 0x2f9e44 };
    const leafGeo = isl.shape === 'ball' ? new THREE.IcosahedronGeometry(2.6, 0).scale(1, 0.85, 1) : new THREE.ConeGeometry(2.4, 5.5, 7);
    const trunkMat = toon(0x8a5a32), leafMat = toon(isl.leaf, { flatShading: true });
    const rockMat = toon(0x8f8a84, { flatShading: true });
    for (let k = from; k <= to; k += 14) {
      const iw = this.islandHw[this.wrap(k)];
      if (iw < 4) continue;
      const lanes = iw > 12 ? [-0.55, 0, 0.55] : [0];
      for (const c0 of lanes) {
        if (Math.random() < 0.3) continue;
        const kk = this.wrap(k + Math.floor(Math.random() * 8));
        const c = c0 + (Math.random() - 0.5) * 0.2;
        const [x, y, z] = point(kk, this.islandMid[kk] + c * this.islandHw[kk], surface(kk, c));
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
    const [x, y, z] = point(k, this.islandMid[k], surface(k, 0));
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
