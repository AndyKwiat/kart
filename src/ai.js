
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
      if (track.islandHw[car.idx] > 0) this.forkSide = Math.sign(car.lateral || this.forkSide);
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

    // Slow for upcoming bends.
    const t0 = track.tan[car.idx];
    let bend = 0;
    for (const dist of [15, 30, 45]) {
      const t1 = track.tan[track.wrap(car.idx + Math.round(dist / track.spacing))];
      bend = Math.max(bend, Math.acos(Math.max(-1, Math.min(1, t0.x * t1.x + t0.z * t1.z))));
    }
    // Light rubber-banding keeps the pack close to the player.
    let rubber = 1;
    if (leaderGap > 120) rubber = 1.07;
    else if (leaderGap < -250) rubber = 0.94;

    // Banked corners can be taken faster.
    const bankAhead = Math.max(Math.abs(track.bank[car.idx]), Math.abs(track.bank[track.wrap(car.idx + Math.round(25 / track.spacing))]));
    const bankRelief = 1 - Math.min(0.7, bankAhead * 2.5);
    const penalty = Math.min(0.42, Math.max(0, bend - 0.25) * 0.5) * bankRelief;
    const targetSpeed = car.maxSpeed * this.skill * rubber * (1 - penalty);
    out.throttle = speed < targetSpeed;
    out.brake = speed > targetSpeed + 5;
    return out;
  }
}
