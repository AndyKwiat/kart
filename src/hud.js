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
  constructor(track) {
    this.lap = $('lap');
    this.time = $('time');
    this.speed = $('speed');
    this.pos = $('pos');
    this.center = $('center');
    this.wrong = $('wrongway');
    this.results = $('results');
    this.resultsList = $('results-list');
    this.flashUntil = 0;

    // Pre-render the minimap track outline.
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
    const trace = () => {
      g.beginPath();
      track.pos.forEach((p, i) => {
        const [x, y] = this.toMap(p.x, p.z);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.closePath();
    };
    g.lineJoin = 'round';
    trace(); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 12; g.stroke();
    trace(); g.strokeStyle = '#f4f4f4'; g.lineWidth = 7; g.stroke();
    const [sx, sy] = this.toMap(track.pos[0].x, track.pos[0].z);
    g.fillStyle = '#111';
    g.fillRect(sx - 2, sy - 7, 4, 14);
  }

  update({ lap, laps, time, speed, rank, total, wrongWay }) {
    this.lap.textContent = `LAP ${lap}/${laps}`;
    this.time.textContent = formatTime(time);
    this.speed.innerHTML = `${Math.round(Math.max(0, speed) * 2.4)} <span>km/h</span>`;
    const [n, s] = ordinal(rank);
    this.pos.innerHTML = `${n}<sup>${s}</sup>`;
    this.wrong.style.display = wrongWay ? 'block' : 'none';
  }

  setCenter(text, small = false) {
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

  showResults(order, player) {
    this.results.classList.remove('hidden');
    this.resultsList.innerHTML = order.map((car, i) => `
      <li class="${car === player ? 'you' : ''}">
        <span class="rank">${i + 1}.</span>
        <span class="swatch" style="background:${hex(car.color)}"></span>
        <span class="name">${car.name}</span>
        <span>${car.finished ? formatTime(car.finishTime) : 'racing…'}</span>
      </li>`).join('');
  }

  hideResults() {
    this.results.classList.add('hidden');
  }
}
