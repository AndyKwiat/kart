import * as THREE from 'three';
import { toon } from './materials.js';
import { grassDetailTexture } from './textures.js';
import { SKY } from './sky.js';
import { TUNNELS } from './track.js';

export function buildScenery(scene, track) {
  scene.fog = new THREE.Fog(SKY.horizon.clone(), 260, 1000);

  scene.add(new THREE.HemisphereLight(0xdff2ff, 0x5d8a3a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -70;
  sc.right = sc.top = 70;
  sc.near = 1;
  sc.far = 300;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // Neutral speckle texture; terrain colour comes from vertex colours.
  const speckleTex = grassDetailTexture();
  const plainTex = speckleTex.clone();
  plainTex.repeat.set(160, 160);
  const plain = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), toon(0x7ccf55, { map: plainTex }));
  plain.rotation.x = -Math.PI / 2;
  plain.position.y = -1;
  scene.add(plain);

  const box = new THREE.Box3().setFromPoints(track.pos);
  const lake = findLake(track, box);
  const { heightAt, distToTrack, mesh: terrain } = buildTerrain(scene, track, box, speckleTex, lake);

  if (lake) {
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(lake.r * 1.25, 48),
      new THREE.MeshPhysicalMaterial({
        color: 0x2f8fd8, roughness: 0.08, metalness: 0, clearcoat: 1,
        transparent: true, opacity: 0.88, envMapIntensity: 1.2,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(lake.x, lake.level, lake.z);
    water.receiveShadow = true;
    scene.add(water);
  }

  const inLake = (x, z) => lake && Math.hypot(x - lake.x, z - lake.z) < lake.r * 1.3;
  const scatter = (count, minD, maxD, maxH, expand) => {
    const b = box.clone().expandByScalar(expand);
    const spots = [];
    for (let tries = 0; spots.length < count && tries < count * 30; tries++) {
      const x = THREE.MathUtils.lerp(b.min.x, b.max.x, Math.random());
      const z = THREE.MathUtils.lerp(b.min.z, b.max.z, Math.random());
      const [, d, wall] = distToTrack(x, z);
      if (d < wall + minD || d > wall + maxD || inLake(x, z)) continue;
      const y = heightAt(x, z);
      if (y > maxH) continue;
      spots.push([x, y, z]);
    }
    return spots;
  };

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  const yAxis = new THREE.Vector3(0, 1, 0);

  // Pine trees, kept clear of the track, the lake and the snowline.
  const trees = scatter(700, 5, 220, 60, 160);
  const trunkGeo = new THREE.CylinderGeometry(0.45, 0.6, 2.4, 6);
  trunkGeo.translate(0, 1.2, 0);
  const leafGeo = new THREE.ConeGeometry(2.8, 6.5, 7);
  leafGeo.translate(0, 5.4, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, toon(0x8a5a32), trees.length);
  const leaves = new THREE.InstancedMesh(leafGeo, toon(0xffffff, { flatShading: true }), trees.length);
  const greens = [0x2f9e44, 0x3fb34f, 0x26843a, 0x51c45a];
  trees.forEach(([x, y, z], i) => {
    const k = 0.7 + Math.random() * 0.7;
    q.setFromAxisAngle(yAxis, Math.random() * Math.PI);
    m.compose(new THREE.Vector3(x, y - 0.3, z), q, s.set(k, k, k));
    trunks.setMatrixAt(i, m);
    leaves.setMatrixAt(i, m);
    leaves.setColorAt(i, c.setHex(greens[i % greens.length]));
  });
  trunks.castShadow = leaves.castShadow = true;
  scene.add(trunks, leaves);

  // Boulders: a few right behind the walls, more out in the hills.
  const rocks = [...scatter(140, 1.5, 12, 999, 40), ...scatter(160, 30, 260, 999, 200)];
  const rockMesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    toon(0xffffff, { flatShading: true }),
    rocks.length,
  );
  rocks.forEach(([x, y, z], i) => {
    const k = 0.8 + Math.random() * 2.6;
    q.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3));
    m.compose(new THREE.Vector3(x, y + k * 0.3, z), q, s.set(k * (0.9 + Math.random() * 0.5), k * 0.75, k));
    rockMesh.setMatrixAt(i, m);
    const g = 0.5 + Math.random() * 0.2;
    rockMesh.setColorAt(i, c.setRGB(g, g * 0.97, g * 0.92));
  });
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  scene.add(rockMesh);

  return { sun, ground: [terrain, plain], lake, center: box.getCenter(new THREE.Vector3()) };
}

// Most open spot inside the loop, for a lake.
function findLake(track, box) {
  const poly = track.pos;
  const inside = (x, z) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i++) {
      const a = poly[i], b = poly[j];
      if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c;
    }
    return c;
  };
  let best = null;
  for (let x = box.min.x; x <= box.max.x; x += 10) {
    for (let z = box.min.z; z <= box.max.z; z += 10) {
      if (!inside(x, z)) continue;
      let d = Infinity;
      for (let i = 0; i < track.N; i += 6) {
        const p = track.pos[i];
        d = Math.min(d, Math.hypot(p.x - x, p.z - z) - track.wallOffset(i));
      }
      if (!best || d > best.d) best = { x, z, d };
    }
  }
  if (!best || best.d < 70) return null;
  return { x: best.x, z: best.z, r: Math.min(75, best.d - 50), level: 3 };
}

// Terrain: flat at road height next to the track, blending into hills that
// grow into rocky, snow-capped mountains far away, with a lake basin inside
// the loop. Vertex colours paint grass, dark grass, sand, rock and snow.
function buildTerrain(scene, track, trackBox, speckleTex, lake) {
  const margin = 450;
  const minX = trackBox.min.x - margin, maxX = trackBox.max.x + margin;
  const minZ = trackBox.min.z - margin, maxZ = trackBox.max.z + margin;
  const cell = 4;
  const { smoothstep, lerp } = THREE.MathUtils;

  const hills = (x, z) =>
    12 * Math.sin(x / 70 + 1) * Math.cos(z / 60 - 0.5) +
    7 * Math.sin((x - z) / 45) +
    4 * Math.cos((x + 2 * z) / 31);
  // Ridged bands for mountain ranges.
  const ridges = (x, z) =>
    (1 - Math.abs(Math.sin(x / 95 + Math.cos(z / 130)))) * 40 +
    (1 - Math.abs(Math.sin(z / 70 - 0.7 + Math.sin(x / 110)))) * 25;

  // [nearest sample, distance to centerline, wall offset there]
  const distToTrack = (x, z) => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < track.N; i += 12) {
      const p = track.pos[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    for (let k = -12; k <= 12; k++) {
      const i = track.wrap(best + k), p = track.pos[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return [best, Math.sqrt(bestD), track.wallOffset(best)];
  };

  const heightAt = (x, z) => {
    const [i, d, wall] = distToTrack(x, z);
    // Under the road use the lowest nearby road height, so the coarse terrain
    // grid can't poke up through bumps (whoops, ramp bases).
    let roadH = track.height[i];
    if (d < track.hw[i] + 3) {
      for (let k = -6; k <= 6; k++) roadH = Math.min(roadH, track.height[track.wrap(i + k)]);
    }
    // Follow the road's banking out to the wall.
    const lat = Math.max(-wall, Math.min(wall, track.lateral(i, x, z)));
    roadH += track.bank[i] * lat;
    const w = smoothstep(d, wall + 2, wall + 50);
    const far = smoothstep(d, 90, 380);
    let free = hills(x, z) * (1 + far * 1.5) + 12 + far * ridges(x, z) * 1.6;
    if (lake) {
      const basin = 1 - smoothstep(Math.hypot(x - lake.x, z - lake.z), lake.r * 0.5, lake.r * 1.4);
      free = lerp(free, lake.level - 5, basin);
    }
    // Fade toward the edge so the terrain meets the flat plain.
    const edge = Math.min(x - minX, maxX - x, z - minZ, maxZ - z);
    free = lerp(-1, free, smoothstep(edge, 0, 120));
    let h = lerp(roadH - 0.3, free, w);
    // Hill over the tunnel: rises right outside the arch, fading at the portals.
    for (const t of TUNNELS) {
      const tw = smoothstep(i, t.from - 4, t.from + 4) * (1 - smoothstep(i, t.to - 4, t.to + 4));
      if (tw > 0) {
        const W = wall + 0.6;
        const mound = roadH - 0.3 + (t.height + 5) * smoothstep(d, W + 1, W + 9) * (1 - smoothstep(d, W + 35, W + 110));
        h = Math.max(h, lerp(h, mound, tw));
      }
    }
    return h;
  };

  // Grid lines: `cell` spacing over the track area (needed so the terrain
  // hugs the road), much coarser out in the distant hills.
  const lines = (lo, hi, innerLo, innerHi) => {
    const out = [];
    const coarse = cell * 4;
    for (let v = lo; v < innerLo; v += coarse) out.push(v);
    for (let v = innerLo; v < innerHi; v += cell) out.push(v);
    for (let v = innerHi; v < hi; v += coarse) out.push(v);
    out.push(hi);
    return out;
  };
  const pad = 70;
  const xs = lines(minX, maxX, trackBox.min.x - pad, trackBox.max.x + pad);
  const zs = lines(minZ, maxZ, trackBox.min.z - pad, trackBox.max.z + pad);
  const positions = new Float32Array(xs.length * zs.length * 3);
  const uvs = new Float32Array(xs.length * zs.length * 2);
  let n = 0;
  for (const z of zs) {
    for (const x of xs) {
      positions.set([x, heightAt(x, z), z], n * 3);
      uvs.set([(x - minX) / 24, (z - minZ) / 24], n * 2);
      n++;
    }
  }
  const indices = [];
  for (let j = 0; j < zs.length - 1; j++) {
    for (let i = 0; i < xs.length - 1; i++) {
      const a = j * xs.length + i, b = a + 1, c = a + xs.length, e = c + 1;
      indices.push(a, c, b, b, c, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const pos = geo.attributes.position;

  const normal = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0x6cc24a), darkGrass = new THREE.Color(0x4f9e3a);
  const sand = new THREE.Color(0xe3d08a), rock = new THREE.Color(0x8b8580), snow = new THREE.Color(0xf6f8ff);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const steep = 1 - normal.getY(i);
    col.copy(grass).lerp(darkGrass, Math.max(0, smoothstep(y, 15, 40) * 0.8 + 0.2 * Math.sin(x / 23) * Math.cos(z / 19)));
    if (lake) {
      const shore = 1 - smoothstep(Math.hypot(x - lake.x, z - lake.z), lake.r * 1.2, lake.r * 1.6);
      col.lerp(sand, shore * (1 - smoothstep(y, lake.level + 0.6, lake.level + 2.2)));
    }
    col.lerp(rock, smoothstep(steep, 0.12, 0.3));
    col.lerp(snow, smoothstep(y, 75, 90));
    colors.set([col.r, col.g, col.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const tex = speckleTex.clone();
  const mesh = new THREE.Mesh(geo, toon(0xffffff, { map: tex, vertexColors: true }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  return { heightAt, distToTrack, mesh };
}
