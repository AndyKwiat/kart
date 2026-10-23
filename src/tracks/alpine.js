// Alpine Valley: the original circuit. Rolling green hills, a lake, a long
// mountain tunnel, forks, banked hairpins and the big chasm jump.

const SCALE = 1.75;
// All sample indices below are authored against a lap of LAYOUT_N samples and
// rescaled to the real sample count, so the layout can be resized freely.
const LAYOUT_N = 4754;
// Closed loop of control points (x, z). Starts on the top straight heading +x.
// The eastern half is the original circuit; from [-200, 0] the road heads
// out on a big western loop and comes back to the start straight.
const CONTROL = [
  [-60, 100], [40, 100], [120, 80], [170, 20], [160, -50], [110, -80],
  [60, -50], [20, -20], [-30, -40], [-60, -100], [-120, -120],
  [-180, -80], [-200, 0],
  [-240, 60], [-320, 80], [-400, 40], [-480, 70], [-520, 160], [-490, 260],
  [-420, 330], [-310, 370], [-200, 350], [-130, 280], [-165, 190], [-135, 118],
];

// Road width zones (sample indices); widths ease in and out at the ends.
const WIDTH_ZONES = [
  { from: 320, to: 700, hw: 23 },   // wide right-hand sweeper
  { from: 860, to: 940, hw: 15 },   // hairpin
  { from: 1110, to: 1290, hw: 11 }, // narrow technical chicane
  { from: 1480, to: 1610, hw: 12.5 }, // mountain pass over the summit
  { from: 2280, to: 2520, hw: 12.5 }, // western esses
  { from: 4080, to: 4240, hw: 15 },   // valley hairpin
  { from: 4370, to: 4510, hw: 13 },   // second tunnel
  { from: 4600, to: 4690, hw: 21 },   // wide run to the finish
];

// Elevation features layered on the rolling hills. Each is a list of segments
// (lengths in world units) starting at sample `at`:
//   kick:   concave ramp up to `to` (a lip that launches you)
//   flat:   hold height
//   ease:   smooth slope to `to` (landing)
//   whoops: `count` rhythm bumps of `height`
// Every feature is continuous road: there is never a gap to fall into.
// `side` (-1 left / +1 right) puts a feature on one branch of a fork only.
const FEATURES = [
  { at: 140, segs: [{ kick: 14, to: 3 }, { flat: 16 }, { ease: 22, to: 0 }] },
  // Shortcut lane through the sweeper: pad, then a kicker in a narrow lane.
  { at: 490, side: -1, segs: [{ kick: 16, to: 2 }, { flat: 8 }, { ease: 16, to: 0 }] },
  { at: 990, segs: [{ kick: 20, to: 4 }, { flat: 18 }, { ease: 26, to: 0 }] },
  { at: 1775, segs: [{ whoops: 60, count: 6, height: 1.3 }] },
  { at: 1960, segs: [{ kick: 12, to: 2.5 }, { flat: 10 }, { kick: 10, to: 5 }, { flat: 14 }, { ease: 26, to: 0 }] },
  { at: 2400, segs: [{ kick: 10, to: 2 }, { ease: 16, to: 0 }] }, // hop in the esses
  { at: 2715, side: -1, segs: [{ ease: 50, to: 9 }, { flat: 22 }, { ease: 50, to: 0 }] }, // hill route
  // THE BIG JUMP: steep downhill run, ramp, then a real gap over a canyon.
  { at: 3050, segs: [{ ease: 40, to: -7 }, { kick: 22, to: -1 }, { gap: 40, to: -9 }, { ease: 60, to: 0 }] },
  { at: 3415, side: -1, segs: [{ kick: 14, to: 3.5 }, { flat: 14 }, { ease: 22, to: 0 }] },
  { at: 3430, side: 1, segs: [{ whoops: 70, count: 7, height: 1.3 }] },
  { at: 3700, segs: [{ kick: 22, to: 5 }, { flat: 22 }, { ease: 30, to: 0 }] }, // mega jump
  { at: 3895, side: -1, segs: [{ whoops: 60, count: 6, height: 1.3 }] },
  { at: 4290, segs: [{ kick: 12, to: 2.5 }, { flat: 8 }, { ease: 16, to: 0 }] },
  // Shortcut lane through the final S-bend.
  { at: 4570, side: 1, segs: [{ kick: 16, to: 2 }, { flat: 8 }, { ease: 16, to: 0 }] },
];

// Forks: the road splits into two routes around a grass island and rejoins.
// `spread` is how far each route's centre moves from the centreline, `bw`
// the half-width of each route, `ramp` the samples taken to split/merge.
// Symmetric forks give `spread`/`bw`; asymmetric ones give `left`/`right`
// (a narrow inside lane is a risky shortcut: shorter line, pad and kicker).
const FORKS = [
  { from: 400, to: 650, ramp: 60, left: { spread: 30, bw: 6.5 }, right: { spread: 24, bw: 12 } }, // sweeper shortcut (inside = left)
  { from: 2620, to: 3020, spread: 34, bw: 12, ramp: 70 }, // valley: over the hill vs round it
  { from: 3300, to: 3640, spread: 30, bw: 12, ramp: 60 }, // back straight: jump vs whoops
  { from: 3850, to: 4060, spread: 24, bw: 11, ramp: 55 }, // downhill: whoops vs pad
  { from: 4500, to: 4680, ramp: 50, left: { spread: 20, bw: 12 }, right: { spread: 26, bw: 6.5 } }, // S-bend shortcut (inside = right)
];

// Banked corners: the road tilts up toward the outside of the bend
// (`slope` = rise per unit of lateral distance at full bank).
const BANK_ZONES = [
  { from: 815, to: 965, slope: 0.3 },   // hairpin
  { from: 1370, to: 1450, slope: 0.22 }, // climb to the summit
  { from: 4080, to: 4240, slope: 0.3 },  // valley hairpin
];

// Tunnels through hills: a long mountain tunnel and a short one on the final S-bends.
// The long one runs through a mountain for about a quarter of the lap; its
// ceiling height is worked out from jump trajectories (see computeCeiling).
const TUNNELS = [
  { from: 1110, to: 2310, long: true },
  { from: 4390, to: 4490, height: 10 },
];

// Dash panels: sample index and lateral offset of the pad centre.
// `branch` (-1/+1) centres a pad on that route of a fork instead.
const PADS = [
  { at: 270, lat: 9 },
  { at: 575, branch: -1 },
  { at: 960, lat: 0 },
  { at: 1740, lat: -6 },
  { at: 2800, branch: 1 },
  { at: 3032, lat: -9 }, { at: 3032, lat: 0 }, { at: 3032, lat: 9 }, // run-up to the big jump
  { at: 3380, branch: -1 },
  { at: 3950, branch: 1 },
  { at: 4630, branch: 1 },
];

export default {
  id: 'alpine',
  name: 'Alpine Valley',
  scale: SCALE,
  layoutN: LAYOUT_N,
  control: CONTROL,
  widthZones: WIDTH_ZONES,
  features: FEATURES,
  forks: FORKS,
  banks: BANK_ZONES,
  tunnels: TUNNELS,
  pads: PADS,
  // Rolling hills: [amplitude, waves per lap, phase].
  hills: [[11, 4, 0.6], [8, 6, 2.1], [4, 10, 0.3], [2.5, 16, 1.2]],
  theme: 'alpine',
};
