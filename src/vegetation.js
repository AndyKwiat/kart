import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from './materials.js';
import { part } from './geom.js';

// Landscape dressing: trees, bushes and ground plants chosen by the theme
// (pines, oaks, birches, palms, jungle trees, bamboo, ferns, city trees,
// snowy pines, bare trees, ice crystals...), plus reeds and lily pads around
// ponds. Each kind is one or two InstancedMeshes.

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

// Palm: a leaning, ringed trunk and drooping fronds (+ coconuts).
function palm() {
  const segs = [];
  let x = 0, y = 0;
  for (let k = 0; k < 7; k++) {
    const lean = 0.08 + k * 0.035;
    segs.push(part(new THREE.CylinderGeometry(0.32 - k * 0.02, 0.38 - k * 0.02, 1.25, 7), k % 2 ? 0x8a6a42 : 0x9c7a4e, x, y + 0.6, 0, { rz: -lean }));
    x += Math.sin(lean) * 1.2;
    y += Math.cos(lean) * 1.2;
  }
  const trunk = mergeGeometries([...segs,
    ...[0, 2.1, 4.2].map((a) => part(ico0, 0x6b4a22, x + Math.cos(a) * 0.35, y - 0.25, Math.sin(a) * 0.35, { sx: 0.3, sy: 0.3, sz: 0.3 }))]);
  const fronds = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    fronds.push(part(new THREE.BoxGeometry(0.7, 0.06, 3.6), 0xffffff, x + Math.sin(a) * 1.6, y - 0.35, Math.cos(a) * 1.6, { ry: a, rx: 0.45 }));
  }
  const crown = mergeGeometries(fronds);
  return { trunk, crown, trunkColor: 0xffffff, crownColors: [0x3fae3a, 0x2f9e44, 0x5cbf3f, 0x4aa83a] };
}

// Big jungle tree: buttress roots, tall trunk, layered wide canopy.
function jungleTree() {
  const trunk = mergeGeometries([
    part(new THREE.CylinderGeometry(0.55, 0.85, 8, 8), 0x6b5236, 0, 4, 0),
    ...[0, 1.6, 3.2, 4.7].map((a) => part(new THREE.BoxGeometry(0.25, 1.8, 1.6), 0x5e4830, Math.cos(a) * 0.7, 0.8, Math.sin(a) * 0.7, { ry: -a })),
    part(new THREE.CylinderGeometry(0.06, 0.06, 5, 4), 0x3f7a2a, 1.1, 4.5, 0.3, { rz: 0.1 }), // vine
  ]);
  const crown = mergeGeometries([
    [0, 8.6, 0, 4.2, 1.4], [2.2, 7.8, 1, 2.8, 1.2], [-2.3, 8, -0.6, 3, 1.2], [0.4, 9.8, -0.4, 2.8, 1.1], [-0.6, 7.6, 2.2, 2.4, 1],
  ].map(([x, y, z, r, h]) => part(ico0, 0xffffff, x, y, z, { sx: r, sy: h, sz: r })));
  return { trunk, crown, trunkColor: 0xffffff, crownColors: [0x2f8a2f, 0x3c9a32, 0x24742a, 0x4aa83a, 0x2f7d4a] };
}

function bamboo() {
  const parts = [];
  for (let k = 0; k < 7; k++) {
    const a = k * 2.4, r = 0.25 + (k % 3) * 0.35, h = rand(6, 9.5);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    parts.push(part(new THREE.CylinderGeometry(0.11, 0.13, h, 6), k % 2 ? 0x7fb83a : 0x9cc94a, x, h / 2, z, { rz: rand(-0.06, 0.06) }));
    for (let n = 1; n < h; n += 1.4) parts.push(part(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 6), 0x5e8a2a, x, n, z));
    parts.push(part(new THREE.BoxGeometry(1.4, 0.03, 0.3), 0x4f9e3a, x + 0.5, h - 0.4, z, { ry: a, rz: -0.4 }));
  }
  return mergeGeometries(parts);
}

function fern() {
  const parts = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    parts.push(part(new THREE.ConeGeometry(0.35, 2.2, 4), 0xffffff, Math.sin(a) * 0.8, 0.55, Math.cos(a) * 0.8, { ry: a, rx: 1.1, sz: 0.25 }));
  }
  return mergeGeometries(parts);
}

// Street tree in a concrete planter.
function cityTree() {
  const trunk = mergeGeometries([
    part(new THREE.BoxGeometry(2.4, 0.7, 2.4), 0x9a9ca2, 0, 0.35, 0),
    part(new THREE.BoxGeometry(2.0, 0.1, 2.0), 0x4a3a2a, 0, 0.72, 0),
    part(new THREE.CylinderGeometry(0.2, 0.28, 3.4, 6), 0x6b5236, 0, 2.3, 0),
  ]);
  const crown = mergeGeometries([[0, 4.6, 0, 1.7], [0.7, 4.1, 0.3, 1.2], [-0.6, 4.3, -0.3, 1.2]]
    .map(([x, y, z, r]) => part(ico1, 0xffffff, x, y, z, { sx: r, sy: r, sz: r })));
  return { trunk, crown, trunkColor: 0xffffff, crownColors: [0x4f9e3a, 0x5cb85c, 0x3e8b3e] };
}

// Pine with snow on its branches.
function snowPine() {
  const trunk = new THREE.CylinderGeometry(0.45, 0.6, 2.4, 6);
  trunk.translate(0, 1.2, 0);
  const crown = mergeGeometries([
    part(new THREE.ConeGeometry(2.8, 3.2, 7), 0x2a6e44, 0, 3.6, 0),
    part(new THREE.ConeGeometry(2.6, 0.7, 7), 0xffffff, 0, 3.0, 0),
    part(new THREE.ConeGeometry(2.1, 3, 7), 0x2a6e44, 0, 5.4, 0),
    part(new THREE.ConeGeometry(1.95, 0.6, 7), 0xffffff, 0, 4.9, 0),
    part(new THREE.ConeGeometry(1.3, 2.5, 7), 0x2f7a4a, 0, 7.1, 0),
    part(new THREE.ConeGeometry(0.75, 1.1, 7), 0xffffff, 0, 8.0, 0),
  ]);
  return { trunk, crown, trunkColor: 0x6b4a32, crownColors: [0xffffff, 0xf0f8f0, 0xe8f2ff], crownVertexColors: true };
}

function bareTree() {
  const parts = [part(new THREE.CylinderGeometry(0.25, 0.42, 5, 6), 0x4a3a30, 0, 2.5, 0)];
  for (let k = 0; k < 6; k++) {
    const a = k * 1.9, y = 2.6 + k * 0.45, len = 2.2 - k * 0.18;
    parts.push(part(new THREE.CylinderGeometry(0.05, 0.12, len, 4), 0x4a3a30, Math.cos(a) * len * 0.35, y + len * 0.3, Math.sin(a) * len * 0.35, { rz: -Math.cos(a) * 0.9, rx: Math.sin(a) * 0.9 }));
    parts.push(part(new THREE.BoxGeometry(len * 0.5, 0.08, 0.16), 0xffffff, Math.cos(a) * len * 0.45, y + len * 0.45, Math.sin(a) * len * 0.45, { ry: -a }));
  }
  return mergeGeometries(parts);
}

function iceCrystal() {
  const parts = [];
  for (let k = 0; k < 6; k++) {
    const a = k * 1.1, h = rand(1.5, 4.2);
    parts.push(part(new THREE.ConeGeometry(0.35 + h * 0.06, h, 5), k % 2 ? 0xb8ecff : 0x8fd8ff, Math.cos(a) * 0.5, h / 2 - 0.2, Math.sin(a) * 0.5, { rz: Math.cos(a) * 0.35, rx: Math.sin(a) * 0.35 }));
  }
  return mergeGeometries(parts);
}

const flowering = (color) => () => floweringBush(color);

// Plant kinds: `tree` = trunk + tinted crown (two instanced meshes);
// `single` = one instanced mesh (vertex colours and/or tint colours).
const MODELS = {
  pine: { type: 'tree', make: pine },
  oak: { type: 'tree', make: oak },
  birch: { type: 'tree', make: birch },
  palm: { type: 'tree', make: palm },
  jungleTree: { type: 'tree', make: jungleTree },
  cityTree: { type: 'tree', make: cityTree },
  snowPine: { type: 'tree', make: snowPine },
  shrub: { type: 'single', make: shrub, flat: true, sink: 0.15, colors: [0x3d8b37, 0x4f9e3a, 0x2e7d32, 0x5aa83f, 0x6b9e2e] },
  snowShrub: { type: 'single', make: shrub, flat: true, sink: 0.15, colors: [0xf4f8fc, 0xe6eef6, 0xdfe9df] },
  fern: { type: 'single', make: fern, flat: true, sink: 0.1, colors: [0x3a9a32, 0x2f8a2f, 0x4caf50, 0x5cbf3f] },
  flowerPink: { type: 'single', make: flowering(0xf06aa8), sink: 0.1 },
  flowerYellow: { type: 'single', make: flowering(0xffd23f), sink: 0.1 },
  flowerRed: { type: 'single', make: flowering(0xe8312a), sink: 0.1 },
  bamboo: { type: 'single', make: bamboo, sink: 0.1 },
  bareTree: { type: 'single', make: bareTree, sink: 0.2 },
  iceCrystal: { type: 'single', make: iceCrystal, sink: 0.3, emissive: 0x2a5a7a },
};

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
  instanced(scene, model.crown, toon(0xffffff, { flatShading: true, vertexColors: !!model.crownVertexColors }), spots, { colors: model.crownColors, scale: [1, 1] });
}

/**
 * world: { groundY, distToTrack, box, inWater, ponds }
 */
export function buildVegetation(scene, world) {
  const { groundY, distToTrack, box, inWater } = world;
  const ok = (x, z, minD, maxD, maxH) => {
    const [i, d, wall] = distToTrack(x, z);
    if (d < wall + minD || d > wall + maxD || inWater(x, z)) return null;
    if (world.tunnelAt[i] && d < wall + 40) return null; // nothing over/around tunnels
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

  // Plants for this theme (see themes.js).
  for (const plant of world.theme.plants) {
    const def = MODELS[plant.model];
    const spots = plant.at.flatMap((p) => (p.scatter ? scatter(...p.scatter) : groves(...p.groves)))
      .map(([x, y, z]) => [x, y, z, rand(plant.scale[0], plant.scale[1])]);
    if (!spots.length) continue;
    if (def.type === 'tree') tree(scene, def.make(), spots);
    else {
      const geo = def.make();
      const mat = toon(0xffffff, { vertexColors: !!geo.attributes.color, flatShading: !!def.flat, ...(def.emissive ? { emissive: def.emissive } : {}) });
      instanced(scene, geo, mat, spots, { colors: def.colors, scale: [1, 1], sink: def.sink ?? 0.2 });
    }
  }

  // Pond edges: reed clumps around the shore, lily pads (some flowering).
  const reedSpots = [], pads = [], blooms = [];
  for (const p of world.theme.pondPlants ? world.ponds : []) {
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
