import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from './materials.js';
import { grassDetailTexture } from './textures.js';
import { SKY } from './sky.js';
import { buildVegetation } from './vegetation.js';

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
  const box = new THREE.Box3().setFromPoints(track.pos);
  const lake = findLake(track, box);
  const { heightAt, distToTrack, groundY, ponds, chasms, inChasm, bounds, mesh: terrain } = buildTerrain(scene, track, box, speckleTex, lake);

  // Flat backdrop plain at y = -1 *around* the terrain grid (a frame, not a
  // sheet underneath), so valleys and the canyon can go below it.
  const plainMat = toon(0x7ccf55, { map: speckleTex });
  const plainGeo = (x0, z0, x1, z1) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, -1, (z0 + z1) / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / 24, (z0 + uv.getY(i) * (z1 - z0)) / 24);
    return g;
  };
  const F = 2500, { minX, maxX, minZ, maxZ } = bounds;
  const plain = new THREE.Mesh(mergeGeometries([
    plainGeo(minX - F, minZ - F, maxX + F, minZ),
    plainGeo(minX - F, maxZ, maxX + F, maxZ + F),
    plainGeo(minX - F, minZ, minX, maxZ),
    plainGeo(maxX, minZ, maxX + F, maxZ),
  ]), plainMat);
  scene.add(plain);

  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x2f8fd8, roughness: 0.08, metalness: 0, clearcoat: 1,
    transparent: true, opacity: 0.88, envMapIntensity: 1.2,
  });
  const addWater = (x, z, r, level) => {
    const water = new THREE.Mesh(new THREE.CircleGeometry(r, 48), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(x, level, z);
    water.receiveShadow = true;
    scene.add(water);
  };
  if (lake) addWater(lake.x, lake.z, lake.r * 1.25, lake.level);
  for (const p of ponds) addWater(p.x, p.z, p.r * 1.15, p.level);

  // River along the bottom of each canyon, with boulders on the banks.
  for (const ch of chasms) {
    const w = ch.halfGap - 4, e = ch.extent - 40, y = ch.floor + 2.2;
    const corners = [[-e, -w], [e, -w], [e, w], [-e, w]].map(([sd, al]) => [
      ch.c.x + ch.r.x * sd + ch.t.x * al, y, ch.c.z + ch.r.z * sd + ch.t.z * al,
    ]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals();
    const river = new THREE.Mesh(g, waterMat);
    river.material = waterMat.clone();
    river.material.side = THREE.DoubleSide;
    river.material.color.setHex(0x2a7fd0);
    scene.add(river);
    const rockMat = toon(0x8c857c, { flatShading: true });
    for (let n = 0; n < 40; n++) {
      const sd = (Math.random() * 2 - 1) * (ch.extent - 60), al = (Math.random() * 2 - 1) * (ch.halfGap - 2);
      const x = ch.c.x + ch.r.x * sd + ch.t.x * al, z = ch.c.z + ch.r.z * sd + ch.t.z * al;
      const size = 1 + Math.random() * 3.5;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rockMat);
      rock.position.set(x, groundY(x, z) + size * 0.3, z);
      rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      rock.castShadow = true;
      scene.add(rock);
    }
  }

  const inLake = (x, z) => lake && Math.hypot(x - lake.x, z - lake.z) < lake.r * 1.3;
  // (canyons count as "water" for placement: nothing grows or grazes in them)
  const inWater = (x, z) => inLake(x, z) || inChasm(x, z) || ponds.some((p) => Math.hypot(x - p.x, z - p.z) < p.r * 1.1);
  const scatter = (count, minD, maxD, maxH, expand) => {
    const b = box.clone().expandByScalar(expand);
    const spots = [];
    for (let tries = 0; spots.length < count && tries < count * 30; tries++) {
      const x = THREE.MathUtils.lerp(b.min.x, b.max.x, Math.random());
      const z = THREE.MathUtils.lerp(b.min.z, b.max.z, Math.random());
      const [i, d, wall] = distToTrack(x, z);
      if (d < wall + minD || d > wall + maxD || inWater(x, z)) continue;
      if (track.tunnelAt[i] && d < wall + 40) continue;
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

  buildVegetation(scene, { groundY, distToTrack, box, inWater, ponds, tunnelAt: track.tunnelAt });

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

  // Where grazing animals may stand: grass, off the track, out of the lake,
  // below the rocky/snowy heights and not too steep.
  const pasture = (x, z) => {
    const [i, d, wall] = distToTrack(x, z);
    if (d < wall + 8 || d > wall + 260 || inWater(x, z)) return false;
    if (track.tunnelAt[i] && d < wall + 60) return false;
    const y = groundY(x, z);
    if (y > 55) return false;
    const slope = Math.abs(groundY(x + 2, z) - y) + Math.abs(groundY(x, z + 2) - y);
    return slope < 1.2;
  };

  return {
    sun, ground: [terrain, plain], lake, center: box.getCenter(new THREE.Vector3()),
    groundY, distToTrack, pasture, box, ponds,
  };
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

  const longTunnels = track.tunnels.filter((t) => t.long);

  // Canyons under road gaps: a deep cut across the track at the gap, with
  // wobbly cliff edges, running out sideways until it would reach another
  // part of the track, then pinching closed.
  const chasms = track.gaps.map((g) => {
    const i = g.center, c = track.pos[i], t = track.tan[i], r = track.right[i];
    const halfGap = ((g.to - g.from) * track.spacing) / 2;
    const roadLow = Math.min(track.roadHeight(track.wrap(g.from), 0), track.roadHeight(track.wrap(g.to), 0));
    let extent = 420;
    for (let j = 0; j < track.N; j += 3) {
      let dj = Math.abs(j - i);
      dj = Math.min(dj, track.N - dj);
      if (dj < 260) continue;
      const p = track.pos[j];
      const along = (p.x - c.x) * t.x + (p.z - c.z) * t.z;
      const side = (p.x - c.x) * r.x + (p.z - c.z) * r.z;
      if (Math.abs(along) < 90) extent = Math.min(extent, Math.abs(side) - 70);
    }
    return { c, t, r, halfGap, floor: roadLow - 42, extent: Math.max(80, extent) };
  });
  const chasmLocal = (ch, x, z) => {
    const along = (x - ch.c.x) * ch.t.x + (z - ch.c.z) * ch.t.z;
    const side = (x - ch.c.x) * ch.r.x + (z - ch.c.z) * ch.r.z;
    const wobble = (4 * Math.sin(side / 19) + 2.5 * Math.sin(side / 7.3)) * smoothstep(Math.abs(side), 25, 80);
    return { along, side, halfW: ch.halfGap - 1.5 + wobble };
  };
  const carveChasms = (x, z, h) => {
    for (const ch of chasms) {
      const { along, side, halfW } = chasmLocal(ch, x, z);
      if (Math.abs(side) > ch.extent || Math.abs(along) > halfW + 10) continue;
      const dig = (1 - smoothstep(Math.abs(along), halfW, halfW + 8)) * (1 - smoothstep(Math.abs(side), ch.extent - 90, ch.extent));
      const floor = ch.floor + 1.5 * Math.sin(side / 11) + Math.abs(along) * 0.15;
      h = Math.min(h, lerp(h, floor, dig));
    }
    return h;
  };
  const inChasm = (x, z) => chasms.some((ch) => {
    const { along, side, halfW } = chasmLocal(ch, x, z);
    return Math.abs(side) < ch.extent && Math.abs(along) < halfW + 12;
  });
  // [nearest sample index along tunnel t, distance to its centreline]
  const nearestOnTunnel = (t, x, z) => {
    let best = t.from, bestD = Infinity;
    for (let i = t.from; i <= t.to; i += 8) {
      const p = track.pos[track.wrap(i)];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    for (let i = Math.max(t.from, best - 8); i <= Math.min(t.to, best + 8); i++) {
      const p = track.pos[track.wrap(i)];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return [best, Math.sqrt(bestD)];
  };

  const baseHeight = (x, z) => {
    const [i, d, wall] = distToTrack(x, z);
    // Road height here, following banking and per-route fork heights out to
    // the wall. Under the road use the lowest nearby road height, so the coarse
    // terrain grid can't poke up through bumps (whoops, ramp bases); under a
    // fork island use the lower route so it stays below the island mound.
    const lat = Math.max(-wall, Math.min(wall, track.lateral(i, x, z)));
    const iw = track.islandHw[i], mid = track.islandMid[i];
    let roadH = iw > 0 && Math.abs(lat - mid) < iw + 2
      ? Math.min(track.roadHeight(i, mid - iw - 0.01), track.roadHeight(i, mid + iw + 0.01))
      : track.roadHeight(i, lat);
    if (d < track.hw[i] + 3) {
      for (let k = -6; k <= 6; k++) roadH = Math.min(roadH, track.roadHeight(track.wrap(i + k), lat));
    }
    const w = smoothstep(d, wall + 2, wall + 50);
    const far = smoothstep(d, 90, 380);
    let free = hills(x, z) * (1 + far * 1.5) + 12 + far * ridges(x, z) * 1.6;
    // A mountain over the long tunnel: rises steeply from the portals and
    // peaks over the middle; the approach becomes a cutting into its flank.
    for (const t of longTunnels) {
      const [n, dT] = nearestOnTunnel(t, x, z);
      const env = 0.6 + 0.4 * smoothstep(n, t.from, t.from + 150) * (1 - smoothstep(n, t.to - 150, t.to));
      free += 58 * env * (1 - smoothstep(dT, 18, 240)) + ridges(x * 1.7, z * 1.7) * 0.25 * env * (1 - smoothstep(dT, 30, 200));
    }
    if (lake) {
      const basin = 1 - smoothstep(Math.hypot(x - lake.x, z - lake.z), lake.r * 0.5, lake.r * 1.4);
      free = lerp(free, lake.level - 5, basin);
    }
    // Fade toward the edge so the terrain meets the flat plain.
    const edge = Math.min(x - minX, maxX - x, z - minZ, maxZ - z);
    free = lerp(-1, free, smoothstep(edge, 0, 120));
    let h = lerp(roadH - 0.3, free, w);
    // Hill over the tunnel: rises right outside the arch, fading at the portals.
    for (const t of track.tunnels) {
      const tw = smoothstep(i, t.from - 4, t.from + 4) * (1 - smoothstep(i, t.to - 4, t.to + 4));
      if (tw > 0) {
        const W = wall + 0.6;
        // (the mound ramps in a few samples outside the tunnel; clamp into it)
        const th = t.heightAt ? t.heightAt(Math.min(t.to, Math.max(t.from, i))) : t.height;
        const face = t.long ? 14 : 5; // long tunnel: a tall cliff around the mouth
        const mound = roadH - 0.3 + (th + face) * smoothstep(d, W + 1, W + 9) * (1 - smoothstep(d, W + 45, W + 140));
        h = Math.max(h, lerp(h, mound, tw));
      }
    }
    return carveChasms(x, z, h);
  };

  // Ponds: small basins on fairly flat ground away from the track and lake
  // (inside the fine part of the terrain grid so the shoreline is smooth).
  const ponds = [];
  const area = trackBox.clone().expandByScalar(60);
  for (let tries = 0; ponds.length < 8 && tries < 6000; tries++) {
    const x = lerp(area.min.x, area.max.x, Math.random()), z = lerp(area.min.z, area.max.z, Math.random());
    const r = 8 + Math.random() * 8;
    const [, d, wall] = distToTrack(x, z);
    if (d < wall + r + 15 || d > wall + 200) continue;
    if (lake && Math.hypot(x - lake.x, z - lake.z) < lake.r * 1.6 + r + 25) continue;
    if (ponds.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r + 45)) continue;
    let lo = Infinity, hi = -Infinity;
    for (let a = 0; a < 8; a++) {
      const h = baseHeight(x + Math.cos(a * 0.785) * r * 1.3, z + Math.sin(a * 0.785) * r * 1.3);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    if (hi - lo > 3 || hi > 55) continue;
    ponds.push({ x, z, r, level: lo - 0.4 });
  }

  const heightAt = (x, z) => {
    let h = baseHeight(x, z);
    for (const p of ponds) {
      const dd = Math.hypot(x - p.x, z - p.z);
      if (dd > p.r * 3) continue;
      // Bowl below the water inside the shoreline, gentle bank outside it.
      const bowl = dd < p.r ? p.level - 1.8 * (1 - (dd / p.r) ** 2) : p.level + (dd - p.r) * 0.3;
      h = Math.min(h, bowl);
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
  const mud = new THREE.Color(0x8a7a52), sand = new THREE.Color(0xe3d08a), rock = new THREE.Color(0x8b8580), snow = new THREE.Color(0xf6f8ff);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const steep = 1 - normal.getY(i);
    col.copy(grass).lerp(darkGrass, Math.max(0, smoothstep(y, 15, 40) * 0.8 + 0.2 * Math.sin(x / 23) * Math.cos(z / 19)));
    if (lake) {
      const shore = 1 - smoothstep(Math.hypot(x - lake.x, z - lake.z), lake.r * 1.2, lake.r * 1.6);
      col.lerp(sand, shore * (1 - smoothstep(y, lake.level + 0.6, lake.level + 2.2)));
    }
    for (const p of ponds) {
      const dd = Math.hypot(x - p.x, z - p.z);
      if (dd < p.r * 1.6) col.lerp(mud, (1 - smoothstep(dd, p.r * 0.9, p.r * 1.5)) * 0.85);
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
  // Fast exact height of the terrain mesh surface at (x, z): find the grid
  // cell by binary search and interpolate within the same triangle split the
  // mesh uses. Used by animals every frame.
  const find = (arr, v) => {
    let lo = 0, hi = arr.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (arr[mid] <= v) lo = mid; else hi = mid - 1;
    }
    return lo;
  };
  const groundY = (x, z) => {
    x = Math.min(Math.max(x, xs[0]), xs[xs.length - 1]);
    z = Math.min(Math.max(z, zs[0]), zs[zs.length - 1]);
    const i = find(xs, x), j = find(zs, z);
    const fx = (x - xs[i]) / (xs[i + 1] - xs[i]), fz = (z - zs[j]) / (zs[j + 1] - zs[j]);
    const H = (ii, jj) => positions[(jj * xs.length + ii) * 3 + 1];
    const a = H(i, j), b = H(i + 1, j), c = H(i, j + 1), e = H(i + 1, j + 1);
    return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : e + (c - e) * (1 - fx) + (b - e) * (1 - fz);
  };
  return { heightAt, distToTrack, groundY, ponds, chasms, inChasm, bounds: { minX, maxX, minZ, maxZ }, mesh };
}
