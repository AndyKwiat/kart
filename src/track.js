import * as THREE from 'three';
import { toon, canvasTexture } from './materials.js';
import { roadTexture, stripeTexture, chevronTexture, padTexture, checkerTexture } from './textures.js';

export const BASE_HALF_WIDTH = 18;
export const CURB_WIDTH = 1.4;
export const RUNOFF = 8; // grass between the curb and the wall

const SCALE = 1.6;
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
  { from: 2600, to: 3050, hw: 22 },   // wide valley sweeper
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
const FEATURES = [
  { at: 140, segs: [{ kick: 14, to: 3 }, { flat: 16 }, { ease: 22, to: 0 }] },
  { at: 990, segs: [{ kick: 20, to: 4 }, { flat: 18 }, { ease: 26, to: 0 }] },
  { at: 1789, segs: [{ whoops: 60, count: 6, height: 1.3 }] },
  { at: 1960, segs: [{ kick: 12, to: 2.5 }, { flat: 10 }, { kick: 10, to: 5 }, { flat: 14 }, { ease: 26, to: 0 }] },
  { at: 3150, segs: [{ kick: 16, to: 3.5 }, { flat: 16 }, { ease: 24, to: 0 }] },
  { at: 3420, segs: [{ whoops: 70, count: 7, height: 1.3 }] },
  { at: 3700, segs: [{ kick: 22, to: 5 }, { flat: 22 }, { ease: 30, to: 0 }] }, // mega jump
];

// Banked corners: the road tilts up toward the outside of the bend
// (`slope` = rise per unit of lateral distance at full bank).
const BANK_ZONES = [
  { from: 815, to: 965, slope: 0.3 },   // hairpin
  { from: 1370, to: 1450, slope: 0.22 }, // climb to the summit
  { from: 2560, to: 2800, slope: 0.15 }, // valley sweeper entry
  { from: 4080, to: 4240, slope: 0.3 },  // valley hairpin
];

// Tunnels through hills: over the twisty chicane and the final S-bends.
export const TUNNELS = [
  { from: 1180, to: 1268, height: 10 },
  { from: 4390, to: 4490, height: 10 },
];

// Grassy median that splits the wide sweeper into two lanes.
export const ISLAND = { from: 430, to: 610, hw: 5, nose: 28 };

// Dash panels: sample index and lateral offset of the pad centre.
const PADS = [
  { at: 270, lat: 9 },
  { at: 520, lat: -14 },
  { at: 960, lat: 0 },
  { at: 1740, lat: -6 },
  { at: 3120, lat: 0 },
  { at: 3600, lat: -8 },
  { at: 4640, lat: 7 },
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

    this.bank = this.computeBank();
    this.islandHw = [];
    for (let i = 0; i < this.N; i++) {
      const { from, to, hw, nose } = ISLAND;
      const w = i < from || i > to ? 0
        : THREE.MathUtils.smoothstep(i, from, from + nose) * (1 - THREE.MathUtils.smoothstep(i, to - nose, to));
      this.islandHw.push(hw * w);
    }

    // Rolling elevation along the loop (integer frequencies keep it periodic).
    this.height = [];
    for (let i = 0; i < this.N; i++) {
      const u = (i / this.N) * Math.PI * 2;
      // Frequencies are per lap; doubled when the lap doubled in length so the
      // hills keep the same spacing.
      this.height.push(7 * Math.sin(u * 4 + 0.6) + 5 * Math.sin(u * 6 + 2.1) + 3 * Math.sin(u * 10 + 0.3));
    }

    this.kicks = [];
    for (const f of FEATURES) {
      const { heights, kicks } = featureProfile(f.segs, this.spacing);
      heights.forEach((h, k) => { this.height[this.wrap(f.at + k)] += h; });
      for (const [a, b] of kicks) this.kicks.push([f.at + a, f.at + b]);
    }
    // Keep the lowest point (including the low side of banked corners) above
    // the flat backdrop plane at y = -1.
    let lowest = Infinity;
    for (let i = 0; i < this.N; i++) lowest = Math.min(lowest, this.height[i] - Math.abs(this.bank[i]) * this.wallOffset(i));
    for (let i = 0; i < this.N; i++) this.height[i] += 2 - lowest;

    this.pads = PADS.map((p) => ({ ...p, halfSamples: Math.round(PAD_HALF_LENGTH / this.spacing) }));

    this.group = new THREE.Group();
    this.buildRoad();
    this.buildCurbs();
    this.buildWalls();
    this.buildStartLine();
    this.buildJumpMarkings();
    this.buildPads();
    for (const t of TUNNELS) this.buildTunnel(t);
    this.buildIsland();
  }

  // Bank slope per sample: tilts up toward the outside of the curve inside
  // BANK_ZONES, eased in/out and smoothed along the track.
  computeBank() {
    const raw = [];
    for (let i = 0; i < this.N; i++) {
      let w = 0, slope = 0;
      for (const z of BANK_ZONES) {
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
    return this.height[i] + this.bank[i] * lat;
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
      const ha = this.roadHeight(k, a) + y, hb = this.roadHeight(k, b) + y;
      positions.set([p.x + r.x * a, ha, p.z + r.z * a, p.x + r.x * b, hb, p.z + r.z * b], n * 6);
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
    const mesh = new THREE.Mesh(
      this.flatRibbon((k) => -this.hw[k], (k) => this.hw[k], 0.02, 28),
      toon(0xffffff, { map: tex }),
    );
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
    for (const [a, b] of this.kicks) {
      const mesh = new THREE.Mesh(this.flatRibbon((k) => -this.hw[k], (k) => this.hw[k], 0.04, -9, a, b), mat);
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

  // Arched rock tunnel with ceiling lamps and stone portals. The hill around
  // it comes from the terrain (see scenery.js).
  buildTunnel({ from, to, height: H }) {
    const M = 16;
    const ring = (k, grow) => {
      const W = this.wallOffset(k) + 0.6 + grow;
      const p = this.pos[k], r = this.right[k];
      const pts = [];
      for (let m = 0; m <= M; m++) {
        const a = (m / M) * Math.PI;
        const lat = Math.cos(a) * W;
        pts.push([p.x + r.x * lat, this.roadHeight(k, lat) - 0.4 + Math.sin(a) * (H + grow), p.z + r.z * lat]);
      }
      return pts;
    };
    const tube = (grow) => {
      const positions = [];
      const indices = [];
      const rows = to - from + 1;
      for (let n = 0; n < rows; n++) for (const v of ring(this.wrap(from + n), grow)) positions.push(...v);
      for (let n = 0; n < rows - 1; n++) {
        for (let m = 0; m < M; m++) {
          const a = n * (M + 1) + m, b = a + 1, c = a + M + 1, d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setIndex(indices);
      g.computeVertexNormals();
      return g;
    };
    const rock = toon(0x5e5853, { side: THREE.DoubleSide });
    const inner = new THREE.Mesh(tube(0), rock);
    inner.castShadow = inner.receiveShadow = true;
    this.group.add(inner);

    // Portals: stone band between the inner arch and a thicker outer arch.
    const stone = toon(0xb9b2a6, { side: THREE.DoubleSide, flatShading: true });
    for (const k of [from, to]) {
      const a = ring(k, 0), b = ring(k, 3);
      const positions = [...a.flat(), ...b.flat()];
      const indices = [];
      for (let m = 0; m < M; m++) indices.push(m, M + 1 + m, m + 1, m + 1, M + 1 + m, M + 2 + m);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setIndex(indices);
      g.computeVertexNormals();
      const portal = new THREE.Mesh(g, stone);
      portal.castShadow = true;
      this.group.add(portal);
    }

    // Darken the floor inside (the sky light alone washes out the shadow),
    // fading in from each portal.
    const fade = 10;
    const shadeGeo = this.flatRibbon((k) => -this.wallOffset(k), (k) => this.wallOffset(k), 0.09, 10, from - 2, to + 2);
    const alpha = new Float32Array((to - from + 5) * 2 * 4);
    for (let n = 0; n < to - from + 5; n++) {
      const t = Math.min(n, to - from + 4 - n) / fade;
      const a = 0.5 * Math.min(1, Math.max(0, t));
      alpha.set([0, 0, 0, a, 0, 0, 0, a], n * 8);
    }
    shadeGeo.setAttribute('color', new THREE.BufferAttribute(alpha, 4));
    this.group.add(new THREE.Mesh(shadeGeo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false,
    })));

    const lampGeo = new THREE.BoxGeometry(2.4, 0.25, 0.8);
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.7, 2) });
    for (let k = from + 6; k < to - 3; k += 9) {
      const i = this.wrap(k);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      const p = this.pos[i];
      lamp.position.set(p.x, this.roadHeight(i, 0) - 0.4 + H - 0.2, p.z);
      lamp.rotation.y = this.headingAt(i);
      this.group.add(lamp);
    }
  }

  // Median island: grassy top, curb-striped sides, a few trees and a
  // chevron board on the leading nose.
  buildIsland() {
    const { from, to } = ISLAND;
    const lift = 0.45;
    const top = this.flatRibbon((k) => -this.islandHw[k], (k) => this.islandHw[k], lift, 6, from, to);
    const topMesh = new THREE.Mesh(top, toon(0x5fb240));
    topMesh.receiveShadow = true;
    this.group.add(topMesh);

    const curbTex = stripeTexture('#ffcc1a', '#26262b');
    const sideMat = toon(0xffffff, { map: curbTex, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const positions = [], uvs = [], indices = [];
      for (let n = 0; n <= to - from; n++) {
        const k = this.wrap(from + n);
        const lat = side * this.islandHw[k];
        const p = this.pos[k], r = this.right[k];
        const x = p.x + r.x * lat, z = p.z + r.z * lat, h = this.roadHeight(k, lat);
        positions.push(x, h, z, x, h + lift, z);
        const v = (n * this.spacing) / 3;
        uvs.push(0, v, 1, v);
        if (n < to - from) {
          const a = n * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.setIndex(indices);
      g.computeVertexNormals();
      this.group.add(new THREE.Mesh(g, sideMat));
    }

    const trunkMat = toon(0x8a5a32), leafMat = toon(0x2f9e44, { flatShading: true });
    for (let k = from + ISLAND.nose + 6; k < to - ISLAND.nose; k += 22) {
      const p = this.pos[k];
      const y = this.roadHeight(k, 0) + lift;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 2, 6), trunkMat);
      trunk.position.set(p.x, y + 1, p.z);
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(2.4, 5.5, 7), leafMat);
      leaf.position.set(p.x, y + 4.5, p.z);
      trunk.castShadow = leaf.castShadow = true;
      this.group.add(trunk, leaf);
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
    const k = from + Math.round(ISLAND.nose * 0.6);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 0.3), [
      toon(0x26262b), toon(0x26262b), toon(0x26262b), toon(0x26262b),
      toon(0xffffff, { map: chevron }), toon(0xffffff, { map: chevron }),
    ]);
    const p = this.pos[k];
    sign.position.set(p.x, this.roadHeight(k, 0) + lift + 1.6, p.z);
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
