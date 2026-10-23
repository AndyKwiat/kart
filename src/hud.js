const $ = (id) => document.getElementById(id);

export function ordinal(n) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return [n, s];
}

export function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t % 1) * 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

const hex = (c) => '#' + c.toString(16).padStart(6, '0');

export class Hud {
  constructor() {
    this.lap = $('lap');
    this.time = $('time');
    this.speed = $('speed');
    this.pos = $('pos');
    this.center = $('center');
    this.wrong = $('wrongway');
    this.results = $('results');
    this.resultsList = $('results-list');
    this.flashUntil = 0;
  }

  // New track: pre-render the minimap outline.
  setTrack(track) {
    const canvas = $('minimap');
    this.mapCtx = canvas.getContext('2d');
    const size = canvas.width;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of track.pos) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const pad = 16;
    const scale = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    const ox = pad + (size - pad * 2 - (maxX - minX) * scale) / 2;
    const oz = pad + (size - pad * 2 - (maxZ - minZ) * scale) / 2;
    this.toMap = (x, z) => [ox + (x - minX) * scale, oz + (z - minZ) * scale];

    this.mapBg = document.createElement('canvas');
    this.mapBg.width = this.mapBg.height = size;
    const g = this.mapBg.getContext('2d');
    // Two passes, one per fork route (they coincide outside forks).
    const trace = (side) => {
      g.beginPath();
      track.pos.forEach((p, i) => {
        const lat = track.route(i, side).center, r = track.right[i];
        const [x, y] = this.toMap(p.x + r.x * lat, p.z + r.z * lat);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.closePath();
    };
    g.lineJoin = 'round';
    for (const side of [-1, 1]) { trace(side); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 10; g.stroke(); }
    for (const side of [-1, 1]) { trace(side); g.strokeStyle = '#f4f4f4'; g.lineWidth = 5.5; g.stroke(); }
    const [sx, sy] = this.toMap(track.pos[0].x, track.pos[0].z);
    g.fillStyle = '#111';
    g.fillRect(sx - 2, sy - 7, 4, 14);
  }

  update({ lap, laps, time, speed, rank, wrongWay }) {
    // Only touch the DOM when something visible changed.
    const set = (el, key, value, html = false) => {
      if (this[key] === value) return;
      this[key] = value;
      if (html) el.innerHTML = value; else el.textContent = value;
    };
    set(this.lap, '_lap', `LAP ${lap}/${laps}`);
    set(this.time, '_time', formatTime(time));
    set(this.speed, '_speed', `${Math.round(Math.max(0, speed) * 2.4)} <span>km/h</span>`, true);
    const [n, s] = ordinal(rank);
    set(this.pos, '_pos', `${n}<sup>${s}</sup>`, true);
    if (this._wrong !== wrongWay) {
      this._wrong = wrongWay;
      this.wrong.style.display = wrongWay ? 'block' : 'none';
    }
  }

  setCenter(text, small = false) {
    if (this._center === text && this._small === small) return;
    this._center = text;
    this._small = small;
    this.center.textContent = text;
    this.center.classList.toggle('small', small);
  }

  flash(text, now, duration = 1.5, small = true) {
    this.setCenter(text, small);
    this.flashUntil = now + duration;
  }

  tickFlash(now) {
    if (this.flashUntil && now > this.flashUntil) {
      this.flashUntil = 0;
      this.setCenter('');
    }
  }

  drawMinimap(cars, player) {
    const ctx = this.mapCtx;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(this.mapBg, 0, 0);
    for (const car of [...cars.filter((c) => c !== player), player]) {
      const [x, y] = this.toMap(car.x, car.z);
      const r = car === player ? 7 : 5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = hex(car.color);
      ctx.fill();
      ctx.lineWidth = car === player ? 3 : 2;
      ctx.strokeStyle = car === player ? '#fff' : '#000';
      ctx.stroke();
    }
  }

  // Close-range radar, your heading up: the road around you and every car
  // within range. A car right on your tail gets a pulsing red ring.
  drawRadar(cars, player, track, time) {
    const ctx = this.radarCtx ??= document.getElementById('radar').getContext('2d');
    const S = ctx.canvas.width, C = S / 2, R = C - 8;
    const RANGE = 55, k = R / RANGE;
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    const rx = -fz, rz = fx; // car's right
    const toScreen = (x, z) => {
      const dx = x - player.x, dz = z - player.z;
      return [C + (dx * rx + dz * rz) * k, C - (dx * fx + dz * fz) * k];
    };

    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(C, C, R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(14, 18, 40, 0.62)';
    ctx.fill();
    ctx.clip();

    // Road edges (both routes through forks).
    const edges = [
      [(i) => -track.hw[i], false], [(i) => track.hw[i], false],
      [(i) => track.islandEdge(i, -1), true], [(i) => track.islandEdge(i, 1), true],
    ];
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(210, 215, 235, 0.55)';
    for (const [edge, island] of edges) {
      ctx.beginPath();
      let drawing = false;
      for (let n = -110; n <= 110; n += 3) {
        const i = track.wrap(player.idx + n), p = track.pos[i], r = track.right[i];
        if (island && track.islandHw[i] <= 0) { drawing = false; continue; }
        const lat = edge(i);
        const [x, y] = toScreen(p.x + r.x * lat, p.z + r.z * lat);
        drawing ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        drawing = true;
      }
      ctx.stroke();
    }

    // Range ring.
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(C, C, R * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    for (const car of cars) {
      if (car === player) continue;
      const [x, y] = toScreen(car.x, car.z);
      const dx = car.x - player.x, dz = car.z - player.z;
      if (dx * dx + dz * dz > (RANGE + 6) ** 2) continue;
      const behind = dx * fx + dz * fz < 0 && Math.hypot(dx, dz) < 20;
      if (behind) {
        ctx.beginPath();
        ctx.arc(x, y, 16 + Math.sin(time * 12) * 3, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 70, 60, 0.9)';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fillStyle = hex(car.color);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }

    // You: an arrow pointing up.
    ctx.beginPath();
    ctx.moveTo(C, C - 15);
    ctx.lineTo(C + 10, C + 11);
    ctx.lineTo(C, C + 6);
    ctx.lineTo(C - 10, C + 11);
    ctx.closePath();
    ctx.fillStyle = hex(player.color);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(C, C, R, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.stroke();
  }

  showLoading(sub, name) {
    $('loading-sub').textContent = sub;
    $('loading-name').textContent = name;
    $('loading').classList.remove('hidden');
  }

  hideLoading() {
    $('loading').classList.add('hidden');
  }

  // Track title card during the countdown.
  showTitle(sub, name) {
    const el = $('title');
    $('title-sub').textContent = sub;
    $('title-name').textContent = name;
    el.classList.remove('hidden', 'fade');
    clearTimeout(this._titleTimer);
    this._titleTimer = setTimeout(() => el.classList.add('fade'), 2600);
  }

  // After a race: this race's result (with points earned) and the circuit table.
  showStandings({ title, race, totals, player, next }) {
    const row = (car, rank, right, extra = '') => `
      <li class="${car === player ? 'you' : ''}">
        <span class="rank">${rank}.</span>
        <span class="swatch" style="background:${hex(car.color)}"></span>
        <span class="name">${car.name}</span>
        ${extra}<span class="val">${right}</span>
      </li>`;
    $('results-title').textContent = title;
    this.resultsList.innerHTML = race
      .map(({ car, points, time }, i) => row(car, i + 1, `+${points}`, `<span class="time">${time === null ? '—' : formatTime(time)}</span>`))
      .join('');
    $('totals-list').innerHTML = totals.map(({ car, pts }, i) => row(car, i + 1, `${pts} pts`)).join('');
    $('results-next').textContent = next;
    this.results.classList.remove('hidden');
  }

  hideResults() {
    this.results.classList.add('hidden');
  }
}
