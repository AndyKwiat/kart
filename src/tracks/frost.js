// Frost Peaks: big flowing sweepers across snowfields, frozen lakes, icy
// patches on the road and an ice cave.
export default {
  id: 'frost',
  name: 'Frost Peaks',
  scale: 2.269,
  layoutN: 5200,
  control: [
    [-100, 0], [60, -10], [180, 40], [250, 140], [230, 250], [130, 300], [20, 260], [-20, 180],
    [-90, 160], [-160, 220], [-260, 240], [-330, 170], [-320, 60], [-250, -20],
  ],
  hills: [[12, 3, 2.0], [8, 5, 0.9], [4, 9, 1.6]],
  widthZones: [{ from: 4400, to: 4800, hw: 22 }],
  features: [
    { at: 230, segs: [{ kick: 20, to: 4.5 }, { flat: 18 }, { ease: 26, to: 0 }] },
    // Crevasse leap.
    { at: 2340, segs: [{ ease: 30, to: -5 }, { kick: 18, to: -1 }, { gap: 34, to: -7 }, { ease: 50, to: 0 }] },
    { at: 2780, side: -1, segs: [{ ease: 45, to: 8 }, { flat: 20 }, { ease: 45, to: 0 }] }, // hill route
    { at: 3290, side: 1, segs: [{ kick: 16, to: 2 }, { flat: 8 }, { ease: 16, to: 0 }] },
    { at: 3600, segs: [{ whoops: 70, count: 7, height: 1.4 }] }, // moguls
    { at: 1700, segs: [{ kick: 14, to: 3 }, { flat: 12 }, { ease: 20, to: 0 }] }, // in the ice cave
    { at: 4600, segs: [{ kick: 16, to: 3.5 }, { flat: 14 }, { ease: 22, to: 0 }] },
  ],
  forks: [
    { from: 2700, to: 3060, spread: 30, bw: 12, ramp: 60 },
    { from: 3230, to: 3460, ramp: 50, left: { spread: 22, bw: 12 }, right: { spread: 28, bw: 6.5 } },
  ],
  banks: [{ from: 2470, to: 2560, slope: 0.22 }, { from: 2980, to: 3060, slope: 0.18 }],
  tunnels: [{ from: 1300, to: 2200, long: true }],
  // Ice patches: much less grip.
  ice: [{ from: 600, to: 900 }, { from: 3750, to: 4150 }, { from: 4880, to: 5060 }],
  pads: [
    { at: 160, lat: 0 },
    { at: 2310, lat: -9 }, { at: 2310, lat: 0 }, { at: 2310, lat: 9 },
    { at: 2850, branch: 1 },
    { at: 3250, branch: 1 },
    { at: 4550, lat: 6 },
  ],
  theme: 'frost',
};
