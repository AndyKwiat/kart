// Jungle Ruins: a twisty run through dense rainforest, past temple pyramids,
// through a lost temple, over river crossings.
export default {
  id: 'jungle',
  name: 'Jungle Ruins',
  scale: 2.466,
  layoutN: 5200, // indices below are samples on a 5200-sample lap
  control: [
    [-100, 0], [20, 0], [110, -20], [160, -80], [140, -160], [70, -190], [10, -150], [-40, -185],
    [-100, -255], [-190, -250], [-240, -180], [-210, -110], [-280, -60], [-330, 20], [-300, 100],
    [-210, 120], [-150, 60],
  ],
  hills: [[9, 3, 1.2], [7, 7, 0.4], [3, 13, 2.2]],
  widthZones: [
    { from: 2200, to: 2340, hw: 13 },  // temple corridor
    { from: 3420, to: 3820, hw: 22 },  // wide river flats
  ],
  features: [
    { at: 200, segs: [{ kick: 14, to: 3 }, { flat: 14 }, { ease: 20, to: 0 }] },
    // River gorge leap.
    { at: 365, segs: [{ ease: 30, to: -5 }, { kick: 18, to: -1 }, { gap: 30, to: -6 }, { ease: 50, to: 0 }] },
    { at: 720, side: -1, segs: [{ whoops: 50, count: 5, height: 1.2 }] }, // temple steps route
    { at: 1060, side: -1, segs: [{ kick: 16, to: 2 }, { flat: 8 }, { ease: 16, to: 0 }] },
    { at: 1700, segs: [{ whoops: 50, count: 5, height: 1.2 }] },
    { at: 2080, segs: [{ kick: 14, to: 3 }, { flat: 12 }, { ease: 20, to: 0 }] },
    { at: 2760, side: -1, segs: [{ ease: 45, to: 7 }, { flat: 20 }, { ease: 45, to: 0 }] }, // hill route
    { at: 3560, segs: [{ kick: 20, to: 4.5 }, { flat: 18 }, { ease: 26, to: 0 }] },
    { at: 4040, segs: [{ whoops: 55, count: 6, height: 1.3 }] },
    { at: 4360, side: -1, segs: [{ kick: 16, to: 2 }, { flat: 8 }, { ease: 16, to: 0 }] },
    { at: 4900, segs: [{ kick: 10, to: 2 }, { ease: 16, to: 0 }] },
  ],
  forks: [
    { from: 640, to: 900, spread: 26, bw: 12, ramp: 55 },
    { from: 980, to: 1250, ramp: 55, left: { spread: 28, bw: 6.5 }, right: { spread: 22, bw: 12 } },
    { from: 2680, to: 3040, spread: 30, bw: 12, ramp: 60 },
    { from: 4280, to: 4560, ramp: 55, left: { spread: 28, bw: 6.5 }, right: { spread: 22, bw: 12 } },
  ],
  banks: [{ from: 3240, to: 3380, slope: 0.28 }, { from: 1560, to: 1640, slope: 0.2 }],
  tunnels: [{ from: 1500, to: 2650, long: true }],
  pads: [
    { at: 120, lat: 9 },
    { at: 335, lat: -9 }, { at: 335, lat: 0 }, { at: 335, lat: 9 },
    { at: 800, branch: 1 },
    { at: 1010, branch: -1 },
    { at: 2850, branch: 1 },
    { at: 3500, lat: 0 },
    { at: 4310, branch: -1 },
    { at: 4720, lat: -7 },
  ],
  theme: 'jungle',
};
