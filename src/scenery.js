import * as THREE from 'three';
import { toon, canvasTexture } from './materials.js';
import { WALL_OFFSET } from './track.js';

export function buildScenery(scene, track) {
  const sky = 0x8fd3ff;
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(sky, 180, 650);

  scene.add(new THREE.HemisphereLight(0xdff2ff, 0x5d8a3a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -70;
  sc.right = sc.top = 70;
  sc.near = 1;
  sc.far = 300;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // Grass with speckles so speed reads well.
  const grassTex = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#6cc24a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? '#5fb240' : '#7ad257';
      ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
  });
  grassTex.repeat.set(330, 330);
  grassTex.anisotropy = 8;
  const plain = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), toon(0xffffff, { map: grassTex }));
  plain.rotation.x = -Math.PI / 2;
  plain.position.y = -1;
  scene.add(plain);

  const box = new THREE.Box3().setFromPoints(track.pos);
  const center = box.getCenter(new THREE.Vector3());
  const { heightAt, mesh: terrain } = buildTerrain(scene, track, box, grassTex);

  // Trees, kept clear of the track.
  const distToTrack = (x, z) => {
    let best = Infinity;
    for (let i = 0; i < track.N; i += 6) {
      const p = track.pos[i];
      best = Math.min(best, (p.x - x) ** 2 + (p.z - z) ** 2);
    }
    return Math.sqrt(best);
  };
  box.expandByScalar(90);
  const spots = [];
  for (let tries = 0; spots.length < 320 && tries < 5000; tries++) {
    const x = THREE.MathUtils.lerp(box.min.x, box.max.x, Math.random());
    const z = THREE.MathUtils.lerp(box.min.z, box.max.z, Math.random());
    if (distToTrack(x, z) > WALL_OFFSET + 5) spots.push([x, z]);
  }

  const trunkGeo = new THREE.CylinderGeometry(0.45, 0.6, 2.4, 6);
  trunkGeo.translate(0, 1.2, 0);
  const leafGeo = new THREE.ConeGeometry(2.8, 6.5, 7);
  leafGeo.translate(0, 5.4, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, toon(0x8a5a32), spots.length);
  const leaves = new THREE.InstancedMesh(leafGeo, toon(0xffffff, { flatShading: true }), spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  const greens = [0x2f9e44, 0x3fb34f, 0x26843a, 0x51c45a];
  spots.forEach(([x, z], i) => {
    const k = 0.7 + Math.random() * 0.7;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
    m.compose(new THREE.Vector3(x, heightAt(x, z) - 0.3, z), q, s.set(k, k, k));
    trunks.setMatrixAt(i, m);
    leaves.setMatrixAt(i, m);
    leaves.setColorAt(i, c.setHex(greens[i % greens.length]));
  });
  trunks.castShadow = leaves.castShadow = true;
  scene.add(trunks, leaves);

  // Distant rolling hills.
  const hillMat = toon(0x4f9e3a);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + Math.random() * 0.2;
    const r = 470 + Math.random() * 80;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), hillMat);
    hill.scale.set(70 + Math.random() * 60, 35 + Math.random() * 40, 70 + Math.random() * 60);
    hill.position.set(center.x + Math.cos(a) * r, -5, center.z + Math.sin(a) * r);
    scene.add(hill);
  }

  return { sun, ground: [terrain, plain] };
}

// Rolling grass terrain. Near the track it flattens to the road's height so the
// road sits on it; further out it blends into free-form hills.
function buildTerrain(scene, track, trackBox, grassTex) {
  const margin = 380;
  const minX = trackBox.min.x - margin, maxX = trackBox.max.x + margin;
  const minZ = trackBox.min.z - margin, maxZ = trackBox.max.z + margin;
  const cell = 4;

  const hills = (x, z) =>
    12 * Math.sin(x / 70 + 1) * Math.cos(z / 60 - 0.5) +
    7 * Math.sin((x - z) / 45) +
    4 * Math.cos((x + 2 * z) / 31) + 12;

  const nearest = (x, z) => {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < track.N; i += 4) {
      const p = track.pos[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    for (let k = -4; k <= 4; k++) {
      const i = track.wrap(best + k), p = track.pos[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return [best, Math.sqrt(bestD)];
  };

  const heightAt = (x, z) => {
    const [i, d] = nearest(x, z);
    const w = THREE.MathUtils.smoothstep(d, WALL_OFFSET + 2, WALL_OFFSET + 50);
    // Fade hills out toward the edge so the terrain meets the flat plain.
    const edge = Math.min(x - minX, maxX - x, z - minZ, maxZ - z);
    const fade = THREE.MathUtils.smoothstep(edge, 0, 150);
    const free = THREE.MathUtils.lerp(-1, hills(x, z), fade);
    return THREE.MathUtils.lerp(track.height[i] - 0.3, free, w);
  };

  const w = maxX - minX, d = maxZ - minZ;
  const geo = new THREE.PlaneGeometry(w, d, Math.round(w / cell), Math.round(d / cell));
  geo.rotateX(-Math.PI / 2);
  geo.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();

  const tex = grassTex.clone();
  tex.repeat.set(w / 12, d / 12);
  const mesh = new THREE.Mesh(geo, toon(0xffffff, { map: tex }));
  mesh.receiveShadow = true;
  scene.add(mesh);
  return { heightAt, mesh };
}
