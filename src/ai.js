import { cornerSpeed } from './car.js';

const BRAKING = 26; // deceleration the AI plans its braking around

// Signed curvature per sample (+ = bending right), smoothed; cached per track.
const curvCache = new WeakMap();
function curvature(track) {
  let c = curvCache.get(track);
  if (c) return c;
  const raw = [];
  for (let i = 0; i < track.N; i++) {
    const a = track.tan[track.wrap(i - 6)], b = track.tan[track.wrap(i + 6)], r = track.right[i];
    raw.push(((b.x - a.x) * r.x + (b.z - a.z) * r.z) / (12 * track.spacing));
  }
  c = raw.map((_, i) => {
    let sum = 0;
    for (let k = -5; k <= 5; k++) sum += raw[track.wrap(i + k)];
    return sum / 11;
  });
  curvCache.set(track, c);
  return c;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class AIDriver {
  constructor(car, skill) {
    this.car = car;
    this.skill = skill;
    this.phase = Math.random() * Math.PI * 2;
    this.weaveFreq = 0.15 + Math.random() * 0.2;
    this.dodge = 0;
    this.stuckTime = 0;
    this.reverseTime = 0;
  }

  input(track, time, dt, cars, leaderGap) {
    const car = this.car;
    const out = { throttle: true, brake: false, steer: 0, drift: false };

    // Unstick: if pinned against a wall, back up briefly.
    if (this.reverseTime > 0) {
      this.reverseTime -= dt;
      out.throttle = false;
      out.brake = true;
      out.steer = -Math.sign(car.lateral || 1);
      return out;
    }
    this.stuckTime = Math.abs(car.speed) < 2 ? this.stuckTime + dt : 0;
    if (this.stuckTime > 1.2) {
      this.stuckTime = 0;
      this.reverseTime = 0.9;
    }

    // Avoid cars just ahead by shifting lanes.
    let dodgeTarget = 0;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    for (const other of cars) {
      if (other === car) continue;
      const dx = other.x - car.x, dz = other.z - car.z;
      const ahead = dx * fx + dz * fz;
      const side = dx * -fz + dz * fx;
      if (ahead > 0 && ahead < 12 && Math.abs(side) < 3.5 && other.speed < car.speed + 2) {
        dodgeTarget = side > 0 ? -6 : 6;
      }
    }
    this.dodge += (dodgeTarget - this.dodge) * Math.min(1, dt * 2);

    const speed = Math.max(0, car.speed);
    const lookahead = 9 + speed * 0.45;
    const ti = track.wrap(car.idx + Math.round(lookahead / track.spacing));
    const hw = track.hw[ti];

    // Forks: pick a route once per visit (at random), and once alongside the
    // island stick with the side you're actually on.
    const forkId = track.forkId[ti] >= 0 ? track.forkId[ti] : track.forkId[car.idx];
    let center = 0, half = hw;
    if (forkId >= 0) {
      if (this.forkFor !== forkId) {
        this.forkFor = forkId;
        this.forkSide = Math.random() < 0.5 ? -1 : 1;
      }
      if (track.islandHw[car.idx] > 0) this.forkSide = Math.sign(car.lateral - track.islandMid[car.idx] || this.forkSide);
      ({ center, half } = track.route(ti, this.forkSide));
    } else {
      this.forkFor = -1;
    }

    // Weave across the road/route, but line up for an upcoming dash panel
    // that's on the route being driven.
    let lane = center + Math.sin(time * this.weaveFreq + this.phase) * half * 0.5;
    for (const pad of track.pads) {
      const ahead = track.wrap(pad.at - car.idx) * track.spacing;
      if (ahead > 0 && ahead < 70 && Math.abs(pad.lat - center) < half) lane = pad.lat;
    }
    lane = Math.max(center - half + 3, Math.min(center + half - 3, lane + this.dodge));

    const tp = track.pos[ti], tr = track.right[ti];
    const tx = tp.x + tr.x * lane, tz = tp.z + tr.z * lane;
    const desired = Math.atan2(tx - car.x, tz - car.z);
    const diff = wrapAngle(desired - car.heading);
    out.steer = Math.max(-1, Math.min(1, -diff * 3));

    // Corner speed: the AI obeys the same grip limit as the player, so it
    // looks ahead and slows enough to make each bend on its current line,
    // braking early enough (v² = v_corner² + 2·decel·distance).
    const curv = curvature(track);
    let allowed = Infinity;
    for (let d = 0; d <= 110; d += 2.5) {
      const j = track.wrap(car.idx + Math.round(d / track.spacing));
      const k = curv[j];
      // (a racing line across the road's width opens the corner up a bit)
      const radius = Math.max(8, 1 / Math.max(1e-4, Math.abs(k)) - Math.sign(k) * car.lateral + track.hw[j] * 0.5);
      const vCorner = cornerSpeed(radius, { bank: track.bank[j] });
      allowed = Math.min(allowed, Math.sqrt(vCorner * vCorner + 2 * BRAKING * d));
    }
    // Light rubber-banding keeps the pack close to the player.
    let rubber = 1;
    if (leaderGap > 120) rubber = 1.07;
    else if (leaderGap < -250) rubber = 0.94;

    const targetSpeed = Math.min(car.maxSpeed * this.skill * rubber, allowed);
    out.throttle = speed < targetSpeed;
    out.brake = speed > targetSpeed + 2;
    return out;
  }
}
