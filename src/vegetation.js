import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from './materials.js';
import { part } from './geom.js';

// Landscape dressing: pines, round oaks, autumn birches in groves, round
// shrubs, flowering bushes, and reeds + lily pads around the ponds. Each kind
// is one or two InstancedMeshes.

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const ico0 = new THREE.IcosahedronGeometry(1, 0);
const ico1 = new THREE.IcosahedronGeometry(1, 1);

// --- Models: origin at the base, white where the instance colour should tint.

function pine() {
  const trunk = new THREE.CylinderGeometry(0.45, 0.6, 2.4, 6);
  trunk.translate(0, 1.2, 0);
  const crown = new THREE.ConeGeometry(2.8, 6.5, 7);
  crown.translate(0, 5.4, 0);
  return { trunk, crown, trunkColor: 0x8a5a32, crownColors: [0x2f9e44, 0x3fb34f, 0x26843a, 0x51c45a] };
}

function oak() {
  const trunk = mergeGeometries([
    part(new THREE.CylinderGeometry(0.38, 0.55, 3.4, 7), 0xffffff, 0, 1.7, 0),
    part(new THREE.CylinderGeometry(0.15, 0.25, 1.8, 5), 0xffffff, 0.7, 3.2, 0, { rz: -0.8 }),
    part(new THREE.CylinderGeometry(0.15, 0.25, 1.6, 5), 0xffffff, -0.6, 3.3, 0.3, { rz: 0.8, rx: 0.3 }),
  ]);
  const crown = mergeGeometries([
    [0, 5.2, 0, 2.4], [1.6, 4.6, 0.4, 1.7], [-1.5, 4.7, -0.3, 1.8], [0.3, 4.5, 1.5, 1.7],
    [-0.3, 4.6, -1.5, 1.7], [0.4, 6.4, -0.2, 1.6],
  ].map(([x, y, z, r]) => part(ico0, 0xffffff, x, y, z, { sx: r, sy: r * 0.85, sz: r })));
  return { trunk, crown, trunkColor: 0x7a5232, crownColors: [0x4caf50, 0x5cb85c, 0x3e9b3e, 0x6cc04a, 0x88c540] };
}

function birch() {
  const trunk = mergeGeometries([
    part(new THREE.CylinderGeometry(0.2, 0.28, 6.2, 7), 0xf2efe6, 0, 3.1, 0),
    ...[1.2, 2.3, 3.1, 4.2, 5.0].map((y, k) => part(new THREE.BoxGeometry(0.42, 0.1, 0.42), 0x2a2a2a, 0, y, 0, { ry: k })),
  ]);
  const crown = mergeGeometries([
    [0, 6.4, 0, 1.4, 2.2], [0.8, 5.3, 0.2, 1.1, 1.5], [-0.7, 5.5, -0.3, 1.1, 1.6], [0.1, 7.6, 0, 0.9, 1.3],
  ].map(([x, y, z, r, h]) => part(ico0, 0xffffff, x, y, z, { sx: r, sy: h, sz: r })));
  return { trunk, crown, trunkColor: 0xffffff, crownColors: [0xf2a531, 0xe8742a, 0xf6cf3c, 0xd4532b, 0xf0b840] };
}

function shrub() {
  return mergeGeometries([
    [0, 0.6, 0, 0.9], [0.7, 0.45, 0.2, 0.7], [-0.6, 0.5, -0.2, 0.75], [0.1, 0.45, 0.7, 0.65], [0, 1.05, 0.1, 0.6],
  ].map(([x, y, z, r]) => part(ico0, 0xffffff, x, y, z, { sx: r, sy: r * 0.85, sz: r })));
}

function floweringBush(flower) {
  const leaves = [[0, 0.55, 0, 0.85], [0.6, 0.45, 0.25, 0.65], [-0.55, 0.45, -0.2, 0.7], [0, 0.95, 0, 0.55]]
    .map(([x, y, z, r]) => part(ico1, 0x3f8f3a, x, y, z, { sx: r, sy: r * 0.8, sz: r }));
  const blooms = [];
  for (let k = 0; k < 14; k++) {
    const a = k * 2.4, h = rand(0.3, 1.15), rr = 0.85 - (h - 0.3) * 0.5;
    blooms.push(part(ico0, k % 4 === 0 ? 0xffffff : flower, Math.cos(a) * rr, h + 0.1, Math.sin(a) * rr, { sx: 0.16, sy: 0.16, sz: 0.16 }));
  }
  return mergeGeometries([...leaves, ...blooms]);
}

function reeds() {
  const parts = [];
  for (let k = 0; k < 7; k++) {
    const x = rand(-0.5, 0.5), z = rand(-0.5, 0.5), h = rand(1.3, 2.4);
    parts.push(part(new THREE.CylinderGeometry(0.03, 0.06, h, 4), 0x6f8f3a, x, h / 2, z, { rx: rand(-0.15, 0.15), rz: rand(-0.15, 0.15) }));
    if (k % 2 === 0) parts.push(part(new THREE.CylinderGeometry(0.09, 0.09, 0.4, 6), 0x6b4a2a, x, h - 0.15, z));
  }
  return mergeGeometries(parts);
}

function lilyPad() {
  return mergeGeometries([
    part(new THREE.CylinderGeometry(0.9, 0.9, 0.05, 10, 1, false, 0.3, Math.PI * 2 - 0.6), 0x4c9a3c, 0, 0, 0),
  ]);
}

function lilyFlower() {
  return mergeGeometries([
    ...[0, 1, 2, 3, 4].map((k) => part(new THREE.ConeGeometry(0.12, 0.35, 4), 0xf7b6d2, Math.cos(k * 1.26) * 0.12, 0.12, Math.sin(k * 1.26) * 0.12, { rz: Math.cos(k * 1.26) * 0.6, rx: -Math.sin(k * 1.26) * 0.6 })),
    part(ico0, 0xffe14a, 0, 0.12, 0, { sx: 0.08, sy: 0.08, sz: 0.08 }),
  ]);
}

// --- Placement ------------------------------------------------------------------

const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const s = new THREE.Vector3();
const c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

function instanced(scene, geo, material, spots, { shadow = true, colors, scale = [0.8, 1.2], sink = 0.2 } = {}) {
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, spots.length));
  mesh.count = spots.length;
  spots.forEach(([x, y, z, k = rand(scale[0], scale[1])], i) => {
    q.setFromAxisAngle(UP, Math.random() * Math.PI * 2);
    m.compose(v.set(x, y - sink, z), q, s.setScalar(k));
    mesh.setMatrixAt(i, m);
    if (colors) mesh.setColorAt(i, c.setHex(pick(colors)).multiplyScalar(rand(0.92, 1.06)));
  });
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function tree(scene, model, spots) {
  const vertexColors = !!model.trunk.attributes.color;
  instanced(scene, model.trunk, toon(model.trunkColor, { vertexColors }), spots, { scale: [1, 1] });
  instanced(scene, model.crown, toon(0xffffff, { flatShading: true }), spots, { colors: model.crownColors, scale: [1, 1] });
}

/**
 * world: { groundY, distToTrack, box, inWater, ponds }
 */
export function buildVegetation(scene, world) {
  const { groundY, distToTrack, box, inWater } = world;
  const ok = (x, z, minD, maxD, maxH) => {
    const [, d, wall] = distToTrack(x, z);
    if (d < wall + minD || d > wall + maxD || inWater(x, z)) return null;
    const y = groundY(x, z);
    return y > maxH ? null : y;
  };
  // Uniform scatter over a band around the track.
  const scatter = (count, minD, maxD, maxH, expand) => {
    const b = box.clone().expandByScalar(expand);
    const out = [];
    for (let t = 0; out.length < count && t < count * 30; t++) {
      const x = rand(b.min.x, b.max.x), z = rand(b.min.z, b.max.z);
      const y = ok(x, z, minD, maxD, maxH);
      if (y !== null) out.push([x, y, z]);
    }
    return out;
  };
  // Clustered groves/patches.
  const groves = (groveCount, [lo, hi], radius, minD, maxD, maxH, expand) => {
    const centers = scatter(groveCount, minD + radius * 0.5, maxD, maxH, expand);
    const out = [];
    for (const [cx, , cz] of centers) {
      const n = Math.round(rand(lo, hi));
      for (let k = 0, t = 0; k < n && t < n * 8; t++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        const y = ok(x, z, minD, maxD, maxH);
        if (y !== null) { out.push([x, y, z]); k++; }
      }
    }
    return out;
  };

  // Trees: scattered pines plus pine stands, oak groves, autumn birch groves.
  const pineSpots = [...scatter(300, 5, 220, 60, 160), ...groves(14, [8, 16], 22, 6, 240, 60, 180)]
    .map(([x, y, z]) => [x, y, z, rand(0.7, 1.4)]);
  tree(scene, pine(), pineSpots);
  tree(scene, oak(), [...scatter(110, 6, 200, 45, 140), ...groves(12, [5, 10], 20, 6, 200, 45, 140)]
    .map(([x, y, z]) => [x, y, z, rand(0.8, 1.3)]));
  tree(scene, birch(), groves(16, [6, 12], 16, 5, 180, 45, 120).map(([x, y, z]) => [x, y, z, rand(0.8, 1.2)]));

  // Bushes: shrubs dotted near the roadside and in clumps; flowering bushes in
  // little meadows.
  const shrubMat = toon(0xffffff, { flatShading: true });
  instanced(scene, shrub(), shrubMat, [...scatter(420, 1.5, 70, 55, 60), ...groves(30, [4, 9], 8, 2, 160, 55, 120)],
    { colors: [0x3d8b37, 0x4f9e3a, 0x2e7d32, 0x5aa83f, 0x6b9e2e], scale: [0.6, 1.4], sink: 0.15 });
  const bushMat = toon(0xffffff, { vertexColors: true });
  for (const flower of [0xf06aa8, 0xffd23f]) {
    instanced(scene, floweringBush(flower), bushMat, groves(16, [5, 10], 9, 2, 120, 50, 100),
      { scale: [0.7, 1.2], sink: 0.1 });
  }

  // Pond edges: reed clumps around the shore, lily pads (some flowering).
  const reedSpots = [], pads = [], blooms = [];
  for (const p of world.ponds) {
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * Math.PI * 2, r = p.r * rand(0.85, 1.12);
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      reedSpots.push([x, Math.max(p.level, groundY(x, z)), z, rand(0.7, 1.3)]);
    }
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * Math.PI * 2, r = p.r * Math.sqrt(Math.random()) * 0.75;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      pads.push([x, p.level + 0.25, z, rand(0.7, 1.3)]);
      if (Math.random() < 0.4) blooms.push([x, p.level + 0.27, z, 1]);
    }
  }
  const vc = toon(0xffffff, { vertexColors: true });
  instanced(scene, reeds(), vc, reedSpots, { shadow: false, sink: 0.1 });
  instanced(scene, lilyPad(), vc, pads, { shadow: false, sink: 0 });
  instanced(scene, lilyFlower(), vc, blooms, { shadow: false, sink: 0 });
}
