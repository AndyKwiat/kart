import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from './materials.js';
import {
  rockWallTexture, panelWallTexture, neonTileTexture, crystalRockTexture, concreteFloorTexture,
  hazardTexture, dashTexture, arrowSignTexture, posterTextures, glowTexture, bannerTexture, templeWallTexture,
} from './textures.js';

// Tunnels: an arched shell following the road (height can vary per sample),
// with themed interiors for the long mountain tunnel: rock cave → industrial
// → neon → crystal cave. Interiors get lights (fake glow pools on the road),
// arrow boards on the outside of bends, posters, hazard bands and crystals.

const rand = (a, b) => a + Math.random() * (b - a);
const glow = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

// Interior styles; a track's theme lists which ones its long tunnel uses, in
// order (short tunnels use the first).
const INTERIORS = {
  rock: { wall: rockWallTexture, pool: 0xffb35c, arrow: '#ffb020', lamps: true },
  industrial: { wall: panelWallTexture, pool: 0xd8ecff, arrow: '#ffd23f', strip: 0xe8f4ff, hazard: true, posters: true, ribs: true },
  neon: { wall: neonTileTexture, pool: 0xff4fd8, arrow: '#33f0ff', neon: [0x33f0ff, 0xff4fd8], posters: true },
  crystal: { wall: crystalRockTexture, pool: 0x9a6bff, arrow: '#c58bff', crystals: true },
  temple: { wall: templeWallTexture, pool: 0xffa040, arrow: '#ffb020', lamps: true, ribs: true },
};

export function buildTunnel(track, t) {
  const group = track.group;
  const { from, to } = t;
  const span = to - from;
  const K = (n) => track.wrap(from + n);
  const H = (k) => (t.long ? track.ceil[k] - track.roadHeight(k, 0) + 0.4 : t.height);
  const W = (k) => track.wallOffset(k) + 0.6;
  t.heightAt = H;

  // Point on the arch at sample k, arch fraction u (0 = right base, 1 = left
  // base), pushed outward by g.
  const surf = (k, u, g = 0) => {
    const a = u * Math.PI;
    const w = W(k) + g;
    const lat = Math.cos(a) * w;
    const p = track.pos[k], r = track.right[k];
    return new THREE.Vector3(p.x + r.x * lat, track.roadHeight(k, lat) - 0.4 + Math.sin(a) * (H(k) + g), p.z + r.z * lat);
  };
  // u at which the wall reaches height y above the road on a side.
  const uAt = (k, y, side) => {
    const u = Math.asin(Math.min(1, y / H(k))) / Math.PI;
    return side > 0 ? u : 1 - u;
  };

  // Grid surface over rows n0..n1 and arch columns between u0(k)..u1(k).
  const band = (n0, n1, u0, u1, { g = 0, cols = 1, vScale = 10, uRepeat = 1 } = {}) => {
    const pos = [], uv = [], idx = [];
    const rows = n1 - n0 + 1;
    for (let n = 0; n < rows; n++) {
      const k = K(n0 + n);
      const a = typeof u0 === 'function' ? u0(k) : u0, b = typeof u1 === 'function' ? u1(k) : u1;
      for (let c = 0; c <= cols; c++) {
        const p = surf(k, a + (b - a) * (c / cols), g);
        pos.push(p.x, p.y, p.z);
        uv.push((c / cols) * uRepeat, ((n0 + n) * track.spacing) / vScale);
      }
      if (n < rows - 1) {
        for (let c = 0; c < cols; c++) {
          const i0 = n * (cols + 1) + c, i1 = i0 + 1, i2 = i0 + cols + 1, i3 = i2 + 1;
          idx.push(i0, i2, i1, i1, i2, i3);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  };
  // Flat ring face at sample k between grow g0 and g1 (portals, ribs).
  const ringFace = (k, g0, g1, material) => {
    const M = 24, pos = [], idx = [];
    for (let m = 0; m <= M; m++) {
      const a = surf(k, m / M, g0), b = surf(k, m / M, g1);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      if (m < M) { const i = m * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  const add = (geo, material, { shadow = false } = {}) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // Board/poster on the wall facing into the tunnel. `forward` keeps the
  // image's +x along the direction of travel on both walls (arrows);
  // otherwise it's oriented to read normally from inside (text).
  const UP = new THREE.Vector3(0, 1, 0);
  const plane = (k, u, w, h, material, forward = false, lift = 0.15) => {
    const p = surf(k, u, -lift);
    const axis = track.pos[k].clone();
    axis.y = p.y;
    const z = axis.sub(p).normalize();
    const x = forward
      ? track.tan[k].clone().setY(0).normalize()
      : new THREE.Vector3().crossVectors(UP, z).normalize();
    const zz = z.clone().addScaledVector(x, -x.dot(z)).normalize();
    const geo = new THREE.PlaneGeometry(w, h);
    geo.applyMatrix4(new THREE.Matrix4().makeBasis(x, UP, zz).setPosition(p));
    if (!material) return geo; // caller merges
    add(geo, material);
  };

  const glowTex = glowTexture();
  const styles = track.theme.tunnel.map((name) => INTERIORS[name]);
  const themes = t.long ? styles : [styles[0]];
  const segLen = Math.ceil(span / themes.length);

  themes.forEach((theme, s) => {
    const n0 = s * segLen, n1 = Math.min(span, (s + 1) * segLen);
    const k0 = K(n0);
    const arc = Math.PI * W(k0);
    const tex = theme.wall();
    add(band(n0, n1, 0, 1, { cols: 24, vScale: 16, uRepeat: Math.max(2, Math.round(arc / 16)) }),
      toon(0xffffff, { map: tex, side: THREE.DoubleSide }), { shadow: true });

    // Glow pools on the road under the lights.
    const poolMat = new THREE.MeshBasicMaterial({
      map: glowTex, color: glow(theme.pool, 0.32), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const pools = [];
    for (let n = n0 + 6; n < n1 - 6; n += 16) {
      pools.push(track.flatRibbon(-5, 5, 0.13, 13 * track.spacing, from + n - 6, from + n + 6));
    }
    if (pools.length) add(mergeGeometries(pools), poolMat);

    if (theme.lamps) {
      const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.5, 1.6) });
      const lamps = [];
      for (let n = n0 + 6; n < n1 - 6; n += 16) {
        const k = K(n);
        const g = new THREE.BoxGeometry(2.4, 0.25, 0.8);
        g.applyMatrix4(new THREE.Matrix4().makeRotationY(track.headingAt(k)).setPosition(surf(k, 0.5, -0.4)));
        lamps.push(g);
      }
      if (lamps.length) add(mergeGeometries(lamps), lampMat);
    }
    if (theme.strip) {
      const dash = dashTexture();
      // Two thin dashed strips either side of the crown (bright enough to
      // bloom a little, not to flood the screen).
      for (const c of [0.455, 0.545]) {
        add(band(n0, n1, c - 0.008, c + 0.008, { g: -0.12, vScale: 8 }),
          new THREE.MeshBasicMaterial({ map: dash, color: glow(theme.strip, 1.7), side: THREE.DoubleSide }));
      }
    }
    if (theme.hazard) {
      const hz = hazardTexture();
      const mat = toon(0xffffff, { map: hz, side: THREE.DoubleSide });
      for (const side of [1, -1]) {
        add(band(n0, n1, (k) => uAt(k, 1.4, side), (k) => uAt(k, 2.3, side), { g: -0.06, vScale: 6 }), mat);
      }
    }
    if (theme.neon) {
      theme.neon.forEach((col, j) => {
        const mat = new THREE.MeshBasicMaterial({ color: glow(col, 3.2), side: THREE.DoubleSide });
        for (const side of [1, -1]) {
          const y = j === 0 ? 5 : 7.5;
          add(band(n0, n1, (k) => uAt(k, y, side), (k) => uAt(k, y + 0.35, side), { g: -0.08 }), mat);
        }
      });
    }
    if (theme.ribs) {
      const ribMat = toon(0x34373d, { side: THREE.DoubleSide, flatShading: true });
      for (let n = n0 + 10; n < n1 - 4; n += 28) ringFace(K(n), -0.9, 0.05, ribMat);
    }
    if (theme.posters) {
      const posters = posterTextures().map((map) => new THREE.MeshBasicMaterial({ map, color: glow(0xffffff, 1.1), side: THREE.DoubleSide }));
      let side = 1;
      for (let n = n0 + 18; n < n1 - 10; n += 34) {
        const k = K(n);
        plane(k, uAt(k, 3.2, side), 5, 2.5, posters[Math.floor(Math.random() * posters.length)]);
        side = -side;
      }
    }
    if (theme.crystals) {
      const cones = [];
      for (let n = n0; n < n1; n += 2) {
        for (let r = 0; r < 2; r++) {
          if (Math.random() < 0.45) continue;
          const k = K(n);
          const side = Math.random() < 0.5 ? 1 : -1;
          const onFloor = Math.random() < 0.3;
          let p, dir;
          if (onFloor) {
            const lat = side * rand(track.hw[k] + 2.5, track.wallOffset(k) - 0.5);
            const pk = track.pos[k], rr = track.right[k];
            p = new THREE.Vector3(pk.x + rr.x * lat, track.roadHeight(k, lat), pk.z + rr.z * lat);
            dir = new THREE.Vector3(rand(-0.3, 0.3), 1, rand(-0.3, 0.3)).normalize();
          } else {
            const u = side > 0 ? rand(0.05, 0.38) : rand(0.62, 0.95);
            p = surf(k, u, 0.2);
            const axis = track.pos[k].clone();
            axis.y = track.roadHeight(k, 0) + H(k) * 0.4;
            dir = axis.sub(p).normalize().add(new THREE.Vector3(rand(-0.3, 0.3), rand(-0.2, 0.3), rand(-0.3, 0.3))).normalize();
          }
          cones.push({ p, dir, s: rand(0.6, 1.7), c: [0xb57bff, 0x5ad7ff, 0xff7ad9][Math.floor(Math.random() * 3)] });
        }
      }
      const geo = new THREE.ConeGeometry(0.45, 3, 5);
      geo.translate(0, 1.3, 0);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), cones.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
      cones.forEach(({ p, dir, s: k, c }, i) => {
        q.setFromUnitVectors(UP, dir);
        m.compose(p, q, sc.set(k, k * rand(0.8, 1.4), k));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, glow(c, rand(1.4, 2.6)));
      });
      group.add(mesh);
    }

    // Arrow boards on the outside of bends.
    const arrowMat = new THREE.MeshBasicMaterial({ map: arrowSignTexture(theme.arrow), color: glow(0xffffff, 1.8), side: THREE.DoubleSide });
    let last = -99;
    const arrows = [];
    for (let n = n0 + 4; n < n1 - 4; n++) {
      const k = K(n);
      const a = track.tan[K(n - 12)], b = track.tan[K(n + 12)], r = track.right[k];
      const curv = ((b.x - a.x) * r.x + (b.z - a.z) * r.z) / (24 * track.spacing);
      if (Math.abs(curv) < 0.007 || n - last < 22) continue;
      last = n;
      const outer = -Math.sign(curv);
      arrows.push(plane(k, uAt(k, 3.4, outer), 5, 1.9, null, true));
    }
    if (arrows.length) add(mergeGeometries(arrows), arrowMat);

    // Seam ring where one theme meets the next.
    if (s > 0) ringFace(k0, -0.7, 0.1, toon(0x2a2a30, { side: THREE.DoubleSide, flatShading: true }));
  });

  // Concrete floor between the curbs and the walls (no grass in a tunnel).
  const floorTex = concreteFloorTexture();
  for (const side of [-1, 1]) {
    const lo = (k) => side * (track.hw[k] + 1.4), hi = (k) => side * (W(k) - 0.2);
    add(track.flatRibbon(side < 0 ? hi : lo, side < 0 ? lo : hi, 0.06, 8, from, to), toon(0xffffff, { map: floorTex }));
  }

  // Darken the inside (the sky light alone washes out the shadow), fading in
  // from each portal.
  const fade = t.long ? 40 : 10, shade = t.long ? 0.42 : 0.5;
  const shadeGeo = track.flatRibbon((k) => -W(k), (k) => W(k), 0.09, 10, from - 2, to + 2);
  const alpha = new Float32Array((span + 5) * 8);
  for (let n = 0; n < span + 5; n++) {
    const a = shade * Math.min(1, Math.max(0, Math.min(n, span + 4 - n) / fade));
    alpha.set([0, 0, 0, a, 0, 0, 0, a], n * 8);
  }
  shadeGeo.setAttribute('color', new THREE.BufferAttribute(alpha, 4));
  group.add(new THREE.Mesh(shadeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false })));

  // Portals.
  const stone = toon(0xb9b2a6, { side: THREE.DoubleSide, flatShading: true });
  for (const [k, dir] of [[K(0), -1], [K(span), 1]]) {
    ringFace(k, 0, t.long ? 6 : 3, stone);
    if (!t.long) continue;
    // Banner over the mouth, with lamps.
    const top = surf(k, 0.5, 2.5);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(W(k) * 1.3, 3.2, 0.8), [
      stone, stone, stone, stone,
      new THREE.MeshBasicMaterial({ map: bannerTexture(track.theme.tunnelBanner), color: glow(0xffffff, 1.15) }), stone,
    ]);
    banner.position.copy(top).addScaledVector(track.tan[k], dir * 1.2);
    banner.rotation.y = track.headingAt(k) + (dir < 0 ? Math.PI : 0);
    banner.castShadow = true;
    group.add(banner);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, 1.2) }));
    for (const sx of [-1, 1]) {
      const b = bulb.clone();
      b.position.copy(banner.position).addScaledVector(track.right[k], sx * W(k) * 0.6).add(new THREE.Vector3(0, 2.2, 0));
      group.add(b);
    }
    // Boulders heaped around the mouth.
    const rockMat = toon(0x8c857c, { flatShading: true });
    for (let b = 0; b < 14; b++) {
      const side = b % 2 ? 1 : -1;
      const kk = track.wrap(k + dir * Math.round(rand(-6, 8)));
      const lat = side * (W(kk) + rand(2, 9));
      const pk = track.pos[kk], r = track.right[kk];
      const size = rand(1.8, 4.5);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rockMat);
      rock.position.set(pk.x + r.x * lat, track.roadHeight(kk, lat) + size * 0.4, pk.z + r.z * lat);
      rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
      rock.castShadow = true;
      group.add(rock);
    }
  }

  // Rocky cap over a long tunnel, so from outside it reads as mountain, not a tube.
  if (t.long) {
    const COLS = 10, pos = [], col = [], idx = [];
    const grass = new THREE.Color(track.theme.terrain.darkGrass), rockC = new THREE.Color(track.theme.terrain.rock), c = new THREE.Color();
    for (let n = 0; n <= span; n++) {
      const k = K(n);
      const w = W(k) + 10, p = track.pos[k], r = track.right[k];
      for (let j = 0; j <= COLS; j++) {
        const f = (j / COLS) * 2 - 1, lat = f * w;
        const y = track.roadHeight(k, 0) + H(k) + 4.5 + (1 - f * f) * 3;
        pos.push(p.x + r.x * lat, y, p.z + r.z * lat);
        c.copy(rockC).lerp(grass, 0.35 + 0.3 * Math.sin(n * 0.05 + j));
        col.push(c.r, c.g, c.b);
      }
      if (n < span) {
        for (let j = 0; j < COLS; j++) {
          const i0 = n * (COLS + 1) + j, i1 = i0 + 1, i2 = i0 + COLS + 1, i3 = i2 + 1;
          idx.push(i0, i1, i2, i1, i3, i2);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    add(geo, toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide }), { shadow: true });
  }
}
