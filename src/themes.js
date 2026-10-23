import * as THREE from 'three';

// World themes: everything about how a track looks and what lives around it.
// Placement entries for plants/props:
//   scatter: [count, minD, maxD, maxH, expand]   uniform over a band
//   groves:  [groves, [lo, hi] per grove, radius, minD, maxD, maxH, expand]
// (minD/maxD are distances beyond the track wall, maxH the highest ground.)

const C = (hex) => new THREE.Color(hex);

export const THEMES = {
  alpine: {
    sky: { top: C(0x2f8ef0), horizon: C(0xcdeeff), bottom: C(0x9ccf86), sun: new THREE.Vector3(0.45, 0.75, 0.3) },
    fog: [260, 1000],
    hemi: [0xdff2ff, 0x5d8a3a, 1.6],
    sunLight: [0xfff4e0, 2.6],
    clouds: { count: 34, color: 0xffffff, emissive: 0x8899aa },
    terrain: {
      grass: 0x6cc24a, darkGrass: 0x4f9e3a, rock: 0x8b8580, snow: 0xf6f8ff, sand: 0xe3d08a, mud: 0x8a7a52,
      snowLine: [75, 90], plain: 0x7ccf55, hills: 1, base: 12, mountains: 1.6, lake: true, ponds: 8,
      water: 0x2f8fd8,
    },
    road: { asphalt: '#585a64', curb: ['#e8312a', '#f6f6f6'], wall: ['#2f6fe0', '#f6f6f6'], island: 0x5fb240 },
    rocks: { near: 140, far: 160, color: [1, 0.97, 0.92] },
    plants: [
      { model: 'pine', scale: [0.7, 1.4], at: [{ scatter: [300, 5, 220, 60, 160] }, { groves: [14, [8, 16], 22, 6, 240, 60, 180] }] },
      { model: 'oak', scale: [0.8, 1.3], at: [{ scatter: [110, 6, 200, 45, 140] }, { groves: [12, [5, 10], 20, 6, 200, 45, 140] }] },
      { model: 'birch', scale: [0.8, 1.2], at: [{ groves: [16, [6, 12], 16, 5, 180, 45, 120] }] },
      { model: 'shrub', scale: [0.6, 1.4], at: [{ scatter: [420, 1.5, 70, 55, 60] }, { groves: [30, [4, 9], 8, 2, 160, 55, 120] }] },
      { model: 'flowerPink', scale: [0.7, 1.2], at: [{ groves: [16, [5, 10], 9, 2, 120, 50, 100] }] },
      { model: 'flowerYellow', scale: [0.7, 1.2], at: [{ groves: [16, [5, 10], 9, 2, 120, 50, 100] }] },
    ],
    pondPlants: true,
    herds: [{ kind: 'cow', herds: 8, per: [5, 9] }, { kind: 'sheep', herds: 10, per: [7, 13] }],
    birds: { flocks: 10, spots: 24, palette: [0xf4f4f4, 0xf4f4f4, 0x2c2c36, 0x2c2c36, 0x8b6b4a, 0x4a7fd6, 0xd9d2c0, 0x5a5f6a] },
    tunnel: ['rock', 'industrial', 'neon', 'crystal'],
    tunnelBanner: 'MOUNTAIN TUNNEL',
    islandTree: { shape: 'cone', leaf: 0x2f9e44 },
    props: [],
  },

  jungle: {
    sky: { top: C(0x3a9ad9), horizon: C(0xe4f2c8), bottom: C(0x6f9e48), sun: new THREE.Vector3(-0.3, 0.8, 0.4) },
    fog: [180, 760],
    hemi: [0xf2ffe0, 0x3f6b28, 1.7],
    sunLight: [0xfff0c8, 2.5],
    clouds: { count: 26, color: 0xfdfdf2, emissive: 0x9aa58a },
    terrain: {
      grass: 0x3f9a30, darkGrass: 0x2a7024, rock: 0x5f6b45, snow: 0x6aa84a, sand: 0xcdb27a, mud: 0x6b5a36,
      snowLine: [999, 1000], plain: 0x3f9a34, hills: 1.3, base: 10, mountains: 1.1, lake: true, ponds: 10,
      water: 0x3a8f7a,
    },
    road: { asphalt: '#6a5a4a', curb: ['#d9a43a', '#f2e6c8'], wall: ['#7a5a3a', '#d8c8a0'], island: 0x3f9a34 },
    rocks: { near: 90, far: 120, color: [0.96, 0.94, 0.8] },
    plants: [
      { model: 'jungleTree', scale: [1.2, 2.3], at: [{ scatter: [520, 5, 240, 99, 180] }, { groves: [40, [8, 16], 26, 5, 260, 99, 200] }] },
      { model: 'palm', scale: [1, 1.7], at: [{ scatter: [520, 1.5, 90, 99, 80] }, { groves: [24, [5, 10], 14, 2, 180, 99, 140] }] },
      { model: 'bamboo', scale: [0.9, 1.4], at: [{ groves: [40, [6, 12], 10, 2, 160, 99, 120] }] },
      { model: 'fern', scale: [0.9, 1.9], at: [{ scatter: [1400, 1, 70, 99, 70] }, { groves: [60, [6, 12], 10, 1, 180, 99, 140] }] },
      { model: 'shrub', scale: [0.9, 1.8], at: [{ scatter: [700, 1.5, 120, 99, 100] }] },
      { model: 'flowerRed', scale: [0.8, 1.3], at: [{ groves: [30, [4, 8], 8, 2, 140, 99, 110] }] },
    ],
    pondPlants: true,
    herds: [{ kind: 'elephant', herds: 6, per: [3, 6] }],
    birds: { flocks: 8, spots: 22, palette: [0xe8312a, 0x2fbf4a, 0x2d7cff, 0xffd21f, 0xff8a1f, 0x1fbfbf] },
    tunnel: ['temple', 'temple', 'crystal'],
    tunnelBanner: 'LOST TEMPLE',
    islandTree: { shape: 'ball', leaf: 0x2f8a2f },
    props: ['ruins'],
  },

  city: {
    sky: { top: C(0x4b3c8f), horizon: C(0xffb07a), bottom: C(0x6b5a6e), sun: new THREE.Vector3(0.8, 0.22, -0.3) },
    fog: [240, 1100],
    hemi: [0xffd8c0, 0x5a5060, 1.5],
    sunLight: [0xffc090, 2.2],
    clouds: { count: 20, color: 0xffd0e0, emissive: 0x7a5a8a },
    terrain: {
      grass: 0x8a8d94, darkGrass: 0x787b83, rock: 0x6d6f76, snow: 0x8a8d94, sand: 0xa8a39a, mud: 0x5a5c62,
      snowLine: [999, 1000], plain: 0x7c7f86, hills: 0.15, base: 6, mountains: 0, lake: true, ponds: 0,
      water: 0x2f6f9a, flatFar: true,
    },
    road: { asphalt: '#4a4c54', curb: ['#ffcc1a', '#222226'], wall: ['#d8d8dc', '#9a9ca2'], island: 0x5a9a4a },
    rocks: { near: 0, far: 0, color: [1, 1, 1] },
    plants: [
      { model: 'cityTree', scale: [0.8, 1.2], at: [{ scatter: [160, 3, 30, 99, 60] }] },
    ],
    pondPlants: false,
    herds: [],
    birds: { flocks: 6, spots: 28, palette: [0x8a8f9a, 0x6d7280, 0xb0b4bc, 0x5a5f6a, 0xf4f4f4] },
    tunnel: ['industrial', 'neon', 'neon'],
    tunnelBanner: 'UNDERPASS',
    islandTree: { shape: 'ball', leaf: 0x4f9e3a },
    props: ['city'],
  },

  frost: {
    sky: { top: C(0x5aa0e6), horizon: C(0xe8f4ff), bottom: C(0xdde8f2), sun: new THREE.Vector3(0.3, 0.45, -0.6) },
    fog: [220, 900],
    hemi: [0xeef6ff, 0xb8c8d8, 1.75],
    sunLight: [0xfff6ee, 2.4],
    clouds: { count: 30, color: 0xffffff, emissive: 0x9aaabb },
    terrain: {
      grass: 0xf2f6fb, darkGrass: 0xdde7f2, rock: 0x7f8a96, snow: 0xffffff, sand: 0xcfe3f2, mud: 0xa9c4d8,
      snowLine: [999, 1000], plain: 0xeef3f9, hills: 1.1, base: 12, mountains: 1.9, lake: true, ponds: 6,
      water: 0xcfe9f7, frozen: true,
    },
    road: { asphalt: '#5e6470', curb: ['#2f6fe0', '#f6f6f6'], wall: ['#e8312a', '#f6f6f6'], island: 0xf2f6fb },
    rocks: { near: 80, far: 140, color: [1.1, 1.2, 1.32] },
    plants: [
      { model: 'snowPine', scale: [0.7, 1.5], at: [{ scatter: [340, 5, 230, 70, 160] }, { groves: [18, [8, 16], 22, 6, 240, 70, 180] }] },
      { model: 'bareTree', scale: [0.8, 1.3], at: [{ scatter: [90, 6, 180, 60, 140] }] },
      { model: 'iceCrystal', scale: [0.7, 1.6], at: [{ groves: [16, [3, 7], 8, 3, 150, 99, 120] }] },
      { model: 'snowShrub', scale: [0.6, 1.3], at: [{ scatter: [300, 1.5, 80, 70, 60] }] },
    ],
    pondPlants: false,
    herds: [{ kind: 'penguin', herds: 9, per: [6, 12] }, { kind: 'reindeer', herds: 6, per: [4, 7] }],
    birds: { flocks: 7, spots: 18, palette: [0xf4f4f4, 0xf4f4f4, 0xdde6ee, 0x2c2c36] },
    tunnel: ['crystal', 'rock', 'crystal'],
    tunnelBanner: 'ICE CAVE',
    islandTree: { shape: 'cone', leaf: 0x2a6e44 },
    props: ['frost'],
  },
};
