// Neon City: sunset streets between towers, long boulevards, sharp
// right-angle corners, an underpass and plenty of ramps.
export default {
  id: 'city',
  name: 'Neon City',
  scale: 1.948,
  layoutN: 5200,
  control: [
    [-150, -150], [0, -150], [120, -150], [170, -110], [170, -40], [130, 0], [60, 0], [20, 40],
    [20, 110], [60, 150], [150, 160], [200, 210], [180, 280], [100, 300], [-40, 300], [-150, 290],
    [-210, 240], [-220, 150], [-170, 90], [-200, 20], [-240, -40], [-230, -120],
  ],
  hills: [[3, 3, 0.4], [2, 5, 1.7]],
  widthZones: [
    { from: 0, to: 700, hw: 22 },      // the boulevard
    { from: 1280, to: 1400, hw: 14 },
    { from: 4230, to: 4400, hw: 15 },
  ],
  features: [
    { at: 300, segs: [{ kick: 16, to: 3.5 }, { flat: 12 }, { ease: 22, to: 0 }] },
    { at: 560, segs: [{ whoops: 40, count: 5, height: 0.9 }] }, // speed bumps
    { at: 1700, side: -1, segs: [{ kick: 14, to: 3 }, { flat: 12 }, { ease: 20, to: 0 }] },
    { at: 2330, side: 1, segs: [{ kick: 16, to: 2 }, { flat: 8 }, { ease: 16, to: 0 }] },
    { at: 3150, segs: [{ kick: 16, to: 3.5 }, { flat: 12 }, { ease: 22, to: 0 }] }, // ramp in the underpass
    // Canal leap.
    { at: 3640, segs: [{ ease: 30, to: -4 }, { kick: 18, to: -0.5 }, { gap: 30, to: -5 }, { ease: 45, to: 0 }] },
    { at: 4850, segs: [{ kick: 20, to: 4 }, { flat: 18 }, { ease: 26, to: 0 }] },
  ],
  forks: [
    { from: 1600, to: 2000, spread: 30, bw: 12, ramp: 60 },
    { from: 2200, to: 2650, ramp: 60, left: { spread: 24, bw: 12 }, right: { spread: 30, bw: 6.5 } },
  ],
  banks: [{ from: 4250, to: 4350, slope: 0.3 }, { from: 1270, to: 1340, slope: 0.22 }],
  tunnels: [{ from: 2850, to: 3500, long: true }],
  pads: [
    { at: 240, lat: -9 }, { at: 240, lat: 9 },
    { at: 1800, branch: 1 },
    { at: 2280, branch: 1 },
    { at: 3610, lat: -9 }, { at: 3610, lat: 0 }, { at: 3610, lat: 9 },
    { at: 4800, lat: 0 },
  ],
  theme: 'city',
};
