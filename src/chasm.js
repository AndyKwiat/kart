import * as THREE from 'three';
import { toon } from './materials.js';
import { hazardTexture } from './textures.js';

// Set dressing for a gap in the road (the big jump): chequered flags on both
// cliff edges and glowing edge markers. The canyon itself is carved into the
// terrain (scenery.js).

export function buildChasm(track, gap) {
  const group = track.group;
  const at = (k, lat, up = 0) => {
    const i = track.wrap(k), p = track.pos[i], r = track.right[i];
    return new THREE.Vector3(p.x + r.x * lat, track.roadHeight(i, lat) + up, p.z + r.z * lat);
  };

  // Flags and edge markers on both lips.
  const flagTex = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const flagMat = toon(0xffffff, { map: flagTex, side: THREE.DoubleSide });
  const poleMat = toon(0xdddddd);
  const edgeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.9, 0.2) });
  const hz = toon(0xffffff, { map: hazardTexture() });
  for (const k of [gap.from, gap.to]) {
    const i = track.wrap(k);
    const w = track.hw[i];
    for (const s of [-1, 1]) {
      const base = at(i, s * (w + 2.5));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 9, 8), poleMat);
      pole.position.copy(base).add(new THREE.Vector3(0, 4.5, 0));
      pole.castShadow = true;
      group.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), flagMat);
      flag.position.copy(base).add(new THREE.Vector3(0, 7.8, 0)).addScaledVector(track.right[i], s * 1.6);
      flag.rotation.y = track.headingAt(i) + Math.PI / 2;
      group.add(flag);
    }
    // Glowing strip and hazard board along the lip.
    const dir = k === gap.from ? -1 : 1;
    const lip = new THREE.Mesh(new THREE.BoxGeometry(w * 2, 0.25, 0.6), edgeMat);
    lip.position.copy(at(i, 0, 0.12)).addScaledVector(track.tan[i], dir * 0.3);
    lip.rotation.y = track.headingAt(i);
    group.add(lip);
    const face = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 2, 2.2, 0.4), hz);
    face.position.copy(at(i, 0, -1.2)).addScaledVector(track.tan[i], dir * 0.35);
    face.rotation.y = track.headingAt(i);
    group.add(face);
  }
}
