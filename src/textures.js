import { canvasTexture } from './materials.js';

// High-resolution procedural textures. Everything is drawn once at startup and
// mipmapped with anisotropic filtering, so surfaces stay crisp up close and
// don't shimmer in the distance.

function noise(ctx, w, h, amount, tint = [0, 0, 0]) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n + tint[0];
    d[i + 1] += n + tint[1];
    d[i + 2] += n + tint[2];
  }
  ctx.putImageData(img, 0, 0);
}

// Asphalt across the full road width (u) and 28 units along it (v).
export function roadTexture() {
  return canvasTexture(512, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#585a64';
    ctx.fillRect(0, 0, w, h);
    // Soft blotches and darker racing-line wear.
    for (let i = 0; i < 140; i++) {
      const r = 10 + Math.random() * 50;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      const dark = Math.random() < 0.6;
      g.addColorStop(0, dark ? 'rgba(40,40,48,0.16)' : 'rgba(120,120,130,0.1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.translate(Math.random() * w, Math.random() * h);
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    }
    for (const u of [0.3, 0.7]) {
      const g = ctx.createLinearGradient(w * (u - 0.12), 0, w * (u + 0.12), 0);
      g.addColorStop(0, 'rgba(30,30,36,0)');
      g.addColorStop(0.5, 'rgba(30,30,36,0.16)');
      g.addColorStop(1, 'rgba(30,30,36,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    noise(ctx, w, h, 26);
    // Aggregate flecks.
    for (let i = 0; i < 2500; i++) {
      const s = 60 + Math.random() * 90;
      ctx.fillStyle = `rgba(${s},${s},${s + 6},0.55)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
    // Edge lines with a slightly soft edge.
    for (const x of [10, w - 26]) {
      ctx.fillStyle = 'rgba(245,245,245,0.35)';
      ctx.fillRect(x - 1, 0, 18, h);
      ctx.fillStyle = '#f4f4f0';
      ctx.fillRect(x, 0, 16, h);
    }
  });
}

// Alternating bands along v (curbs, barriers), with a bevel shade across u.
export function stripeTexture(a, b, { bevel = true } = {}) {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = a; ctx.fillRect(0, 0, w, h / 2);
    ctx.fillStyle = b; ctx.fillRect(0, h / 2, w, h / 2);
    if (bevel) {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(0,0,0,0.25)');
      g.addColorStop(0.2, 'rgba(255,255,255,0.12)');
      g.addColorStop(0.8, 'rgba(255,255,255,0.12)');
      g.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    noise(ctx, w, h, 10);
  });
}

export function chevronTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#26262b';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffcc1a';
    const band = h / 2;
    for (let k = -1; k < 3; k++) {
      const y = k * band;
      ctx.beginPath();
      ctx.moveTo(0, y + band * 0.5);
      ctx.lineTo(w / 2, y);
      ctx.lineTo(w, y + band * 0.5);
      ctx.lineTo(w, y + band);
      ctx.lineTo(w / 2, y + band * 0.5);
      ctx.lineTo(0, y + band);
      ctx.closePath();
      ctx.fill();
    }
    noise(ctx, w, h, 14);
  });
}

export function padTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#d94800');
    g.addColorStop(0.5, '#ff7a10');
    g.addColorStop(1, '#d94800');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffe866';
    ctx.strokeStyle = '#fff6c0';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    for (const y0 of [0, h / 2]) {
      ctx.beginPath();
      ctx.moveTo(w * 0.14, y0 + h * 0.4);
      ctx.lineTo(w / 2, y0 + h * 0.08);
      ctx.lineTo(w * 0.86, y0 + h * 0.4);
      ctx.lineTo(w * 0.86, y0 + h * 0.26);
      ctx.lineTo(w / 2, y0 - h * 0.06);
      ctx.lineTo(w * 0.14, y0 + h * 0.26);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  });
}

export function checkerTexture(cols, rows) {
  const tex = canvasTexture(cols * 32, rows * 32, (ctx) => {
    for (let x = 0; x < cols; x++) {
      for (let y = 0; y < rows; y++) {
        ctx.fillStyle = (x + y) % 2 ? '#141414' : '#fafafa';
        ctx.fillRect(x * 32, y * 32, 32, 32);
      }
    }
  });
  return tex;
}

// Neutral (light grey) grass detail; colour comes from vertex colours.
export function grassDetailTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#d6d6d6';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const s = Math.random() < 0.5 ? 190 + Math.random() * 20 : 225 + Math.random() * 25;
      ctx.strokeStyle = `rgb(${s},${s},${s})`;
      ctx.lineWidth = 1 + Math.random();
      const x = Math.random() * w, y = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 4, y - 3 - Math.random() * 5);
      ctx.stroke();
    }
    noise(ctx, w, h, 12);
  });
}
