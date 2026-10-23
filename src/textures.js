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
export function roadTexture(asphalt = '#585a64') {
  return canvasTexture(512, 1024, (ctx, w, h) => {
    ctx.fillStyle = asphalt;
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

// --- Tunnel interiors ---------------------------------------------------------

function blotches(ctx, w, h, n, colors, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    const r = rMin + Math.random() * (rMax - rMin);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, colors[i % colors.length]);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(Math.random() * w, Math.random() * h);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }
}

export function rockWallTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#6b5d50';
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 160, ['rgba(40,32,26,0.35)', 'rgba(150,130,105,0.25)'], 15, 70);
    ctx.strokeStyle = 'rgba(30,24,20,0.6)';
    for (let i = 0; i < 40; i++) {
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 60; y += Math.random() * 40; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    noise(ctx, w, h, 24);
  });
}

export function panelWallTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#8d9096';
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 60, ['rgba(60,62,66,0.25)', 'rgba(170,172,176,0.2)'], 20, 80);
    ctx.strokeStyle = '#4c4f55';
    ctx.lineWidth = 6;
    for (let x = 0; x <= w; x += 128) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 256) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.fillStyle = '#3d4045';
    for (let x = 0; x < w; x += 128) for (let y = 0; y < h; y += 256) {
      for (const [dx, dy] of [[14, 14], [114, 14], [14, 242], [114, 242]]) {
        ctx.beginPath(); ctx.arc(x + dx, y + dy, 5, 0, Math.PI * 2); ctx.fill();
      }
    }
    noise(ctx, w, h, 14);
  });
}

export function neonTileTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#1a1c38';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2c3062';
    ctx.lineWidth = 4;
    for (let x = 0; x <= w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    blotches(ctx, w, h, 30, ['rgba(80,40,140,0.25)', 'rgba(20,120,160,0.2)'], 30, 90);
    noise(ctx, w, h, 10);
  });
}

export function crystalRockTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#3b2a55';
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 140, ['rgba(20,10,40,0.4)', 'rgba(120,80,170,0.3)', 'rgba(60,140,180,0.15)'], 15, 70);
    ctx.strokeStyle = 'rgba(190,150,255,0.5)';
    for (let i = 0; i < 25; i++) {
      ctx.lineWidth = 1 + Math.random() * 2.5;
      ctx.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (Math.random() - 0.5) * 80; y += (Math.random() - 0.5) * 80; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    noise(ctx, w, h, 18);
  });
}

export function concreteFloorTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#7a7b80';
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 40, ['rgba(50,50,55,0.25)', 'rgba(150,150,155,0.2)'], 15, 50);
    ctx.fillStyle = 'rgba(40,40,45,0.6)';
    ctx.fillRect(0, h / 2 - 2, w, 4);
    noise(ctx, w, h, 16);
  });
}

// Diagonal hazard stripes.
export function hazardTexture() {
  return canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#ffcc1a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#222226';
    for (let x = -h; x < w + h; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + 24, 0); ctx.lineTo(x + 24 - h, h); ctx.lineTo(x - h, h);
      ctx.closePath();
      ctx.fill();
    }
  });
}

// Dashed light strip (white where lit, black gaps) for glowing ceiling lights.
export function dashTexture() {
  return canvasTexture(16, 128, (ctx, w, h) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 8, w, h * 0.7);
  });
}

// Glowing chevron arrow board (arrows point toward +u).
export function arrowSignTexture(color) {
  return canvasTexture(256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#111116';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = color;
    for (let n = 0; n < 3; n++) {
      const x = 30 + n * 72;
      ctx.beginPath();
      ctx.moveTo(x, 12); ctx.lineTo(x + 40, h / 2); ctx.lineTo(x, h - 12);
      ctx.lineTo(x + 18, h - 12); ctx.lineTo(x + 58, h / 2); ctx.lineTo(x + 18, 12);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, w - 8, h - 8);
  });
}

// Made-up sponsor posters for the tunnel walls.
const POSTERS = [
  ['TURBO', '#ff3b3b', '#fff'], ['ZOOM!', '#2d7cff', '#ffe14a'], ['KART CO.', '#1fbf6a', '#fff'],
  ['GO GO GO', '#ff9b1a', '#222'], ['No. 7', '#9b4dff', '#fff'], ['SLIPSTREAM', '#1fd6d6', '#14243a'],
  ['DRIFT!', '#ff5fb8', '#fff'], ['MAX FUEL', '#ffd21f', '#c4161c'],
];
export function posterTextures() {
  return POSTERS.map(([text, bg, fg]) => canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w * 0.45, 0); ctx.lineTo(w * 0.62, 0); ctx.lineTo(w * 0.17, h); ctx.fill();
    ctx.fillStyle = fg;
    ctx.font = `italic 900 ${text.length > 7 ? 38 : 52}px Arial Black, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, w - 12, h - 12);
  }));
}

export function glowTexture() {
  const tex = canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  return tex;
}

export function bannerTexture(text) {
  return canvasTexture(1024, 160, (ctx, w, h) => {
    ctx.fillStyle = '#222226';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffcc1a';
    for (let x = -h; x < w + h; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x + 30, 0); ctx.lineTo(x + 30 - 24, 24); ctx.lineTo(x - 24, 24); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, h - 24); ctx.lineTo(x + 30, h - 24); ctx.lineTo(x + 30 - 24, h); ctx.lineTo(x - 24, h); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#fff4c0';
    ctx.font = 'italic 900 78px Arial Black, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 3);
  });
}

// Mossy stone blocks for temple tunnels.
export function templeWallTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#7d7460';
    ctx.fillRect(0, 0, w, h);
    const bw = 128, bh = 64;
    for (let r = 0; r < h / bh; r++) {
      for (let c = -1; c < w / bw + 1; c++) {
        const x = c * bw + (r % 2) * (bw / 2), y = r * bh;
        const t = 100 + Math.random() * 40;
        ctx.fillStyle = `rgb(${t + 15},${t + 8},${t - 15})`;
        ctx.fillRect(x + 3, y + 3, bw - 6, bh - 6);
        // Carved glyph on some blocks.
        if (Math.random() < 0.18) {
          ctx.strokeStyle = 'rgba(40,34,24,0.7)';
          ctx.lineWidth = 4;
          ctx.strokeRect(x + 30, y + 14, bw - 60, bh - 28);
          ctx.beginPath(); ctx.arc(x + bw / 2, y + bh / 2, 8, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    blotches(ctx, w, h, 70, ['rgba(70,110,40,0.35)', 'rgba(40,30,20,0.25)'], 15, 60);
    noise(ctx, w, h, 18);
  });
}

// Glassy ice for slippery road patches: pale blue with white scratches.
export function iceTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#cfeaf8';
    ctx.fillRect(0, 0, w, h);
    blotches(ctx, w, h, 40, ['rgba(255,255,255,0.5)', 'rgba(150,200,230,0.4)'], 15, 60);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 40; i++) {
      ctx.lineWidth = 1 + Math.random() * 1.5;
      ctx.beginPath();
      const x = Math.random() * w, y = Math.random() * h;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 60);
      ctx.stroke();
    }
    noise(ctx, w, h, 10);
  });
}
