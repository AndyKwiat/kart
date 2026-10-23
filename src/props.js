import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon, canvasTexture } from './materials.js';
import { part } from './geom.js';
import { posterTextures } from './textures.js';

// Theme set pieces placed around the track: jungle temple ruins, city
// buildings / street lamps / billboards, and snowmen / igloos / cabins.

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const ico0 = new THREE.IcosahedronGeometry(1, 0);
const ico1 = new THREE.IcosahedronGeometry(1, 1);
const UP = new THREE.Vector3(0, 1, 0);

export function buildProps(scene, world) {
  for (const kind of world.theme.props) BUILDERS[kind]?.(scene, world);
}

// Random spots in a band beyond the track wall (same rules as plants).
function placer(world) {
  const { groundY, distToTrack, box, inWater, track } = world;
  const ok = (x, z, minD, maxD, maxH, foot = 0) => {
    const [i, d, wall] = distToTrack(x, z);
    if (d < wall + minD + foot || d > wall + maxD || inWater(x, z)) return null;
    if (track.tunnelAt[i] && d < wall + 40) return null;
    const y = groundY(x, z);
    return y > maxH ? null : [x, y, z, i];
  };
  return (count, minD, maxD, maxH, expand, foot = 0, apart = 0) => {
    const b = box.clone().expandByScalar(expand);
    const out = [];
    for (let t = 0; out.length < count && t < count * 40; t++) {
      const p = ok(rand(b.min.x, b.max.x), rand(b.min.z, b.max.z), minD, maxD, maxH, foot);
      if (p && !out.some((q) => Math.hypot(q[0] - p[0], q[2] - p[2]) < apart)) out.push(p);
    }
    return out;
  };
}

// Facing toward the nearest track point (so things look at the road).
function faceTrack(world, x, z, i) {
  const p = world.track.pos[i];
  return Math.atan2(p.x - x, p.z - z);
}

function addMerged(scene, parts, material, shadow = true) {
  if (!parts.length) return;
  const mesh = new THREE.Mesh(mergeGeometries(parts), material);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// Transform a geometry in place (position, yaw, scale) and return it.
function placed(geo, x, y, z, yaw = 0, s = 1) {
  return geo.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(s, s, s)));
}

// --- Jungle ruins -------------------------------------------------------------

function ruins(scene, world) {
  const place = placer(world);
  const vc = toon(0xffffff, { vertexColors: true, flatShading: true });
  const stone = [0x9a9078, 0x8c8470, 0xa49a80];
  const moss = 0x5e7d3a;
  const parts = [];

  // Stepped pyramids with a shrine on top, in clearings.
  for (const [x, y, z, i] of place(7, 35, 220, 99, 160, 20, 120)) {
    const steps = Math.round(rand(5, 8)), base = rand(26, 44), stepH = rand(2.6, 3.4);
    const yaw = faceTrack(world, x, z, i);
    for (let k = 0; k < steps; k++) {
      const w = base * (1 - k / (steps + 1.5));
      parts.push(placed(part(new THREE.BoxGeometry(w, stepH, w), k % 3 === 2 ? moss : stone[k % 3], 0, stepH * (k + 0.5), 0), x, y - 1, z, yaw));
    }
    const top = stepH * steps, sw = base * 0.25;
    parts.push(placed(part(new THREE.BoxGeometry(sw, sw * 0.8, sw), stone[0], 0, top + sw * 0.4, 0), x, y - 1, z, yaw));
    parts.push(placed(part(new THREE.BoxGeometry(sw * 0.4, sw * 0.5, 0.3), 0x2a2620, 0, top + sw * 0.3, sw * 0.51), x, y - 1, z, yaw));
    parts.push(placed(part(new THREE.BoxGeometry(base * 0.18, top, base * 0.5), stone[1], 0, top / 2, base * 0.38), x, y - 1, z, yaw)); // stair
  }
  // Broken columns, some fallen, near the road.
  for (const [x, y, z] of place(36, 4, 70, 99, 60, 0, 25)) {
    const n = Math.round(rand(2, 5));
    for (let k = 0; k < n; k++) {
      const cx = x + rand(-6, 6), cz = z + rand(-6, 6);
      const h = rand(2, 9), fallen = Math.random() < 0.3;
      const g = part(new THREE.CylinderGeometry(0.9, 1, fallen ? 6 : h, 8), pick(stone), 0, 0, 0, fallen ? { rz: Math.PI / 2, ry: rand(0, 3) } : {});
      parts.push(placed(g, cx, y + (fallen ? 0.8 : h / 2 - 0.2), cz));
      if (!fallen && Math.random() < 0.6) parts.push(placed(part(new THREE.BoxGeometry(2.4, 0.7, 2.4), stone[2], 0, 0, 0), cx, y + h, cz));
    }
  }
  // Big stone heads looking at the road.
  for (const [x, y, z, i] of place(10, 6, 80, 99, 80, 0, 60)) {
    const yaw = faceTrack(world, x, z, i), s = rand(1.4, 2.2);
    const head = mergeGeometries([
      part(new THREE.BoxGeometry(3, 3.6, 2.6), stone[1], 0, 1.8, 0),
      part(new THREE.BoxGeometry(3.2, 0.8, 2.8), moss, 0, 3.8, 0),
      part(new THREE.BoxGeometry(0.6, 0.35, 0.2), 0x2a2620, -0.7, 2.4, 1.31),
      part(new THREE.BoxGeometry(0.6, 0.35, 0.2), 0x2a2620, 0.7, 2.4, 1.31),
      part(new THREE.BoxGeometry(0.5, 1, 0.5), stone[2], 0, 1.7, 1.4),
      part(new THREE.BoxGeometry(1.6, 0.3, 0.2), 0x2a2620, 0, 0.9, 1.31),
    ]);
    parts.push(placed(head, x, y - 0.3, z, yaw, s));
  }
  addMerged(scene, parts, vc);
}

// --- City ---------------------------------------------------------------------

// Window grid texture (8x8 windows, some lit) and a matching emissive mask
// with only the lit windows, so they glow at dusk. The margin around each
// window is plain wall, which the roofs sample.
function facadeTextures(wall, frame, glassDark, lit) {
  const cols = 8, rows = 8, on = [];
  for (let k = 0; k < cols * rows; k++) on.push(Math.random() < 0.35);
  const draw = (emissive) => (ctx, w, h) => {
    ctx.fillStyle = emissive ? '#000' : wall;
    ctx.fillRect(0, 0, w, h);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * (w / cols), y = r * (h / rows), lit_ = on[r * cols + c];
      if (!emissive) {
        ctx.fillStyle = frame;
        ctx.fillRect(x + 3, y + 4, w / cols - 6, h / rows - 8);
      }
      if (!emissive || lit_) {
        ctx.fillStyle = lit_ ? lit : glassDark;
        ctx.fillRect(x + 6, y + 7, w / cols - 12, h / rows - 14);
      }
    }
  };
  return { map: canvasTexture(256, 256, draw(false)), glow: canvasTexture(256, 256, draw(true)) };
}

// Box with world-scaled UVs (one window per ~4 units) and roof UVs pinned to
// the plain corner of the texture.
function building(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const ny = n.getY(i);
    if (Math.abs(ny) > 0.5) { uv.setXY(i, 0.01, 0.01); continue; }
    const across = Math.abs(n.getX(i)) > 0.5 ? d : w;
    uv.setXY(i, (uv.getX(i) * across) / 32, (uv.getY(i) * h) / 32); // 8 windows per 32 units
  }
  g.translate(0, h / 2, 0);
  return g;
}

function city(scene, world) {
  const place = placer(world);
  const styles = [
    facadeTextures('#8fa3b8', '#5a6a7a', '#2a3a52', '#ffe7a0'),
    facadeTextures('#a8624a', '#6a3a2a', '#2a2a36', '#ffd890'),
    facadeTextures('#d8cdb8', '#9a8f7a', '#3a3f4a', '#fff0c0'),
    facadeTextures('#4a5468', '#2a3040', '#1a2a3a', '#9fe8ff'),
  ];
  const groups = styles.map(() => []);
  const center = world.box.getCenter(new THREE.Vector3());
  // Buildings: lower near the track, towers further out.
  const spots = [...place(260, 10, 70, 999, 120, 10, 22), ...place(220, 60, 340, 999, 340, 14, 30)];
  for (const [x, y, z, i] of spots) {
    const [, d, wall] = world.distToTrack(x, z);
    const far = Math.min(1, Math.max(0, (d - wall - 40) / 200));
    const w = rand(14, 24), dd = rand(14, 24), h = rand(14, 34) + far * rand(20, 110) + (Math.hypot(x - center.x, z - center.z) < 250 ? rand(0, 30) : 0);
    const g = building(w, h, dd);
    groups[Math.floor(Math.random() * styles.length)].push(placed(g, x, y - 0.5, z, faceTrack(world, x, z, i)));
  }
  groups.forEach((parts, k) => {
    if (!parts.length) return;
    const { map, glow } = styles[k];
    addMerged(scene, parts, toon(0xffffff, { map, emissiveMap: glow, emissive: new THREE.Color(1.5, 1.4, 1.2) }));
  });

  // Street lamps both sides of the road.
  const track = world.track, poles = [], bulbs = [];
  for (let i = 0; i < track.N; i += Math.round(36 / track.spacing)) {
    if (track.tunnelAt[i] || track.gapAt[i]) continue;
    for (const side of [-1, 1]) {
      const lat = side * (track.wallOffset(i) + 1.5);
      const p = track.pos[i], r = track.right[i];
      const x = p.x + r.x * lat, z = p.z + r.z * lat, y = track.roadHeight(i, lat);
      const yaw = Math.atan2(-r.x * side, -r.z * side);
      poles.push(placed(mergeGeometries([
        part(new THREE.CylinderGeometry(0.18, 0.25, 9, 6), 0x3a3c44, 0, 4.5, 0),
        part(new THREE.BoxGeometry(0.2, 0.2, 3.2), 0x3a3c44, 0, 8.9, 1.5),
        part(new THREE.BoxGeometry(0.8, 0.25, 1), 0x2a2c34, 0, 8.75, 3),
      ]), x, y, z, yaw));
      bulbs.push(placed(new THREE.BoxGeometry(0.6, 0.12, 0.8).translate(0, 0, 3), x, y + 8.6, z, yaw));
    }
  }
  addMerged(scene, poles, toon(0xffffff, { vertexColors: true }));
  addMerged(scene, bulbs, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.8) }), false);

  // Billboards facing the road.
  const posters = posterTextures();
  for (const [x, y, z, i] of place(18, 3, 25, 999, 40, 0, 60)) {
    const yaw = faceTrack(world, x, z, i);
    const frame = mergeGeometries([
      part(new THREE.CylinderGeometry(0.3, 0.3, 9, 6), 0x3a3c44, -4, 4.5, 0),
      part(new THREE.CylinderGeometry(0.3, 0.3, 9, 6), 0x3a3c44, 4, 4.5, 0),
      part(new THREE.BoxGeometry(12.6, 6.6, 0.4), 0x2a2c34, 0, 11, -0.25),
    ]);
    addMerged(scene, [placed(frame, x, y, z, yaw)], toon(0xffffff, { vertexColors: true }));
    const board = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshBasicMaterial({ map: pick(posters), color: new THREE.Color(1.3, 1.3, 1.3) }));
    board.position.set(x, y + 11, z);
    board.rotation.y = yaw;
    board.translateZ(0.01);
    scene.add(board);
  }

  // Traffic cones along the walls.
  const cones = [];
  for (const [x, y, z] of place(120, 0.5, 4, 999, 20)) {
    cones.push(placed(mergeGeometries([
      part(new THREE.ConeGeometry(0.4, 1.1, 8), 0xff6a1a, 0, 0.55, 0),
      part(new THREE.CylinderGeometry(0.31, 0.36, 0.18, 8), 0xffffff, 0, 0.55, 0),
      part(new THREE.BoxGeometry(1, 0.1, 1), 0xff6a1a, 0, 0.05, 0),
    ]), x, y, z, rand(0, 3)));
  }
  addMerged(scene, cones, toon(0xffffff, { vertexColors: true }));
}

// --- Frost --------------------------------------------------------------------

function frost(scene, world) {
  const place = placer(world);
  const vc = toon(0xffffff, { vertexColors: true });
  const parts = [];
  // Snowmen.
  for (const [x, y, z, i] of place(24, 3, 80, 99, 80, 0, 30)) {
    const yaw = faceTrack(world, x, z, i), s = rand(0.9, 1.4);
    const hat = Math.random() < 0.6;
    parts.push(placed(mergeGeometries([
      part(ico1, 0xffffff, 0, 1, 0, { sx: 1.1, sy: 1.1, sz: 1.1 }),
      part(ico1, 0xffffff, 0, 2.5, 0, { sx: 0.8, sy: 0.8, sz: 0.8 }),
      part(ico1, 0xffffff, 0, 3.6, 0, { sx: 0.58, sy: 0.58, sz: 0.58 }),
      part(new THREE.ConeGeometry(0.1, 0.6, 6), 0xff7a1a, 0, 3.6, 0.75, { rx: Math.PI / 2 }),
      part(ico0, 0x111111, -0.2, 3.8, 0.5, { sx: 0.08, sy: 0.08, sz: 0.08 }),
      part(ico0, 0x111111, 0.2, 3.8, 0.5, { sx: 0.08, sy: 0.08, sz: 0.08 }),
      part(new THREE.CylinderGeometry(0.03, 0.04, 1.6, 4), 0x5a3a22, 1, 2.7, 0, { rz: 1 }),
      part(new THREE.CylinderGeometry(0.03, 0.04, 1.6, 4), 0x5a3a22, -1, 2.7, 0, { rz: -1 }),
      part(new THREE.BoxGeometry(1.2, 0.2, 0.3), 0xd8312a, 0, 3.05, 0.2),
      ...(hat ? [part(new THREE.CylinderGeometry(0.42, 0.42, 0.6, 10), 0x1a1a1e, 0, 4.35, 0), part(new THREE.CylinderGeometry(0.65, 0.65, 0.06, 12), 0x1a1a1e, 0, 4.06, 0)] : []),
    ]), x, y - 0.2, z, yaw, s));
  }
  // Igloos.
  for (const [x, y, z, i] of place(9, 15, 160, 99, 120, 6, 60)) {
    const yaw = faceTrack(world, x, z, i), s = rand(1, 1.5);
    const dome = new THREE.SphereGeometry(4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const door = new THREE.CylinderGeometry(1.5, 1.5, 3, 10, 1, false, 0, Math.PI);
    parts.push(placed(mergeGeometries([
      part(dome, 0xf4f8fc, 0, 0, 0),
      part(door, 0xeaf1f8, 0, 0, 4, { rz: Math.PI / 2, ry: Math.PI / 2 }),
      part(new THREE.CircleGeometry(1.2, 10, 0, Math.PI), 0x2a3440, 0, 0, 5.52),
    ]), x, y - 0.3, z, yaw, s));
  }
  // Snowy cabins with smoke-coloured chimneys.
  for (const [x, y, z, i] of place(10, 20, 180, 60, 140, 8, 60)) {
    const yaw = faceTrack(world, x, z, i), s = rand(1, 1.4);
    const roof = new THREE.CylinderGeometry(0.01, 5.2, 3, 4, 1);
    roof.rotateY(Math.PI / 4);
    parts.push(placed(mergeGeometries([
      part(new THREE.BoxGeometry(7, 4.4, 6), 0x7a4a2a, 0, 2.2, 0),
      part(roof, 0xffffff, 0, 5.9, 0, { sx: 1.05, sz: 0.95 }),
      part(new THREE.BoxGeometry(0.9, 2.6, 0.9), 0x6a6a72, 2, 6.8, -1),
      part(new THREE.BoxGeometry(1.4, 1.2, 0.1), 0xffd890, -1.5, 2.6, 3.01),
      part(new THREE.BoxGeometry(1.4, 2.4, 0.1), 0x4a2a1a, 1.6, 1.2, 3.01),
    ]), x, y - 0.3, z, yaw, s));
  }
  addMerged(scene, parts, vc);
}

const BUILDERS = { ruins, city, frost };
