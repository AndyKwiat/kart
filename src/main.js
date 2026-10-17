import * as THREE from 'three';
import { Track } from './track.js';
import { Car, collideCars } from './car.js';
import { AIDriver } from './ai.js';
import { Hud } from './hud.js';
import { buildScenery } from './scenery.js';

const LAPS = 3;
const COUNTDOWN = 3;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 1500);

const track = new Track();
scene.add(track.group);
const { sun, ground } = buildScenery(scene, track);
const hud = new Hud(track);

const COLORS = [0x3b6cff, 0x2fc45a, 0xffd21f, 0x9b4dff, 0xff8a1f, 0x1fd6d6, 0xff5fb8];
const player = new Car(0xe53935, 'You');
const cars = [...COLORS.map((c, i) => new Car(c, `CPU ${i + 1}`)), player];
for (const car of cars) scene.add(car.mesh);
const drivers = new Map();
const playerAutopilot = new AIDriver(player, 0.9);

// ---- Input ----
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyR' || (e.code === 'Enter' && state === 'finished')) resetRace();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

function playerInput() {
  const left = keys.has('KeyA') || keys.has('ArrowLeft');
  const right = keys.has('KeyD') || keys.has('ArrowRight');
  return {
    throttle: keys.has('KeyW') || keys.has('ArrowUp'),
    brake: keys.has('KeyS') || keys.has('ArrowDown'),
    steer: (right ? 1 : 0) - (left ? 1 : 0),
    drift: keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight'),
  };
}
const IDLE = { throttle: false, brake: false, steer: 0, drift: false };

// ---- Race state ----
let state = 'countdown';
let clock = 0; // time since reset
let raceTime = 0;
let finishCount = 0;
let lastLap = 1;
let camHeading = 0;
let camY = 0;
let finishShownAt = 0;
let autopilot = false; // dev: AI drives the player car

function resetRace() {
  state = 'countdown';
  clock = 0;
  raceTime = 0;
  finishCount = 0;
  lastLap = 1;
  finishShownAt = 0;
  hud.hideResults();
  hud.setCenter('');
  // Two-column staggered grid behind the line; player starts at the back.
  cars.forEach((car, slot) => {
    const row = Math.floor(slot / 2);
    const back = 9 + row * 8 + (slot % 2) * 4;
    const idx = track.wrap(-Math.round(back / track.spacing));
    const p = track.pos[idx], r = track.right[idx];
    const side = slot % 2 ? 6 : -6;
    car.reset(p.x + r.x * side, p.z + r.z * side, track.headingAt(idx), idx, idx - track.N);
    car.y = track.height[idx];
    car.updateVisual(0);
    if (car !== player) {
      drivers.set(car, new AIDriver(car, 0.86 + (COLORS.length - slot) * 0.018 + Math.random() * 0.02));
    }
  });
  camHeading = player.heading;
  placeCamera(1, true);
}

function rankOrder() {
  return [...cars].sort((a, b) => {
    if (a.finished && b.finished) return a.finishOrder - b.finishOrder;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.progress - a.progress;
  });
}

function placeCamera(dt, snap = false) {
  const lerpAngle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
  camHeading = snap ? player.heading : lerpAngle(camHeading, player.heading, 1 - Math.exp(-dt * 4.5));
  const sr = Math.min(1, Math.max(0, player.speed) / player.maxSpeed);
  const back = 6.8 + sr * 1.4;
  // Vertical follow is softer so jumps and landings don't jolt the view.
  camY = snap ? player.y : camY + (player.y - camY) * (1 - Math.exp(-dt * (player.y > camY ? 9 : 6)));
  const target = new THREE.Vector3(
    player.x - Math.sin(camHeading) * back,
    camY + 4.3 + player.hopY * 0.3,
    player.z - Math.cos(camHeading) * back,
  );
  if (snap) camera.position.copy(target);
  else camera.position.lerp(target, 1 - Math.exp(-dt * 12));
  camera.lookAt(
    player.x + Math.sin(player.heading) * 7,
    camY + 1.2,
    player.z + Math.cos(player.heading) * 7,
  );
  const fov = 68 + sr * 10 + (player.boost > 0 ? 7 : 0);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();

  sun.position.set(player.x + 60, player.y + 110, player.z + 40);
  sun.target.position.set(player.x, player.y, player.z);
}

function step(dt) {
  clock += dt;
  track.update(clock);

  if (state === 'countdown') {
    const left = COUNTDOWN - clock;
    hud.setCenter(left > 0 ? String(Math.ceil(left)) : '');
    if (left <= 0) {
      state = 'race';
      hud.flash('GO!', clock, 1, false);
    }
    for (const car of cars) car.update(dt, IDLE, track);
  } else {
    if (state === 'race') raceTime += dt;
    for (const car of cars) {
      let input;
      if (car === player && !player.finished && !autopilot) input = playerInput();
      else {
        const driver = car === player ? playerAutopilot : drivers.get(car);
        input = driver.input(track, clock, dt, cars, player.progress - car.progress);
      }
      car.update(dt, input, track);
    }
    collideCars(cars);

    for (const car of cars) {
      if (!car.finished && car.progress >= LAPS * track.N) {
        car.finished = true;
        car.finishTime = raceTime;
        car.finishOrder = finishCount++;
        if (car === player) {
          state = 'finished';
          finishShownAt = clock;
          hud.flash('FINISH!', clock, 2, false);
        }
      }
    }
  }

  const lap = Math.min(LAPS, Math.max(1, Math.floor(player.progress / track.N) + 1));
  if (state === 'race' && lap !== lastLap && lap > lastLap) {
    hud.flash(lap === LAPS ? 'FINAL LAP!' : `LAP ${lap}`, clock);
  }
  lastLap = Math.max(lastLap, lap);

  const order = rankOrder();
  const t = track.tan[player.idx];
  const wrongWay = state === 'race' && player.speed > 5 &&
    Math.sin(player.heading) * t.x + Math.cos(player.heading) * t.z < -0.4;

  hud.update({
    lap: lastLap,
    laps: LAPS,
    time: state === 'finished' ? player.finishTime : raceTime,
    speed: player.speed,
    rank: order.indexOf(player) + 1,
    total: cars.length,
    wrongWay,
  });
  hud.tickFlash(clock);
  if (state === 'finished' && clock - finishShownAt > 1.5) hud.showResults(order, player);
  hud.drawMinimap(cars, player);

  placeCamera(dt);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // Two substeps keep collisions stable at low frame rates.
  step(dt / 2);
  step(dt / 2);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

resetRace();
requestAnimationFrame(frame);

// ---- Dev tools ----
// __kart.groundCheck(): raycasts down across the road surface and reports any
//   spot where terrain is above the road.
// __kart.tour(): AI drives the player car around the track and shows a contact
//   sheet of chase-camera frames (click it to dismiss).
if (import.meta.env.DEV) {
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const firstHit = (x, z) => {
    ray.set(new THREE.Vector3(x, 500, z), down);
    return ray.intersectObjects([track.road, ...ground], false)[0];
  };

  const groundCheck = (step = 12, from = 0, to = track.N) => {
    const bad = [];
    for (let i = from; i < to; i += step) {
      const p = track.pos[i], r = track.right[i];
      for (let lat = -track.hw[i] + 1; lat <= track.hw[i] - 1; lat += 6) {
        const hit = firstHit(p.x + r.x * lat, p.z + r.z * lat);
        if (hit && hit.object !== track.road) bad.push({ i, lat, over: +(hit.point.y - track.height[i]).toFixed(2) });
      }
    }
    return { checked: Math.ceil((to - from) / step), buried: bad.length, worst: bad.sort((a, b) => b.over - a.over).slice(0, 10) };
  };

  const tour = ({ shots = 16, every = 2, cols = 4, w = 320, h = 180, at = -1, speed = 50 } = {}) => {
    resetRace();
    autopilot = true;
    while (state === 'countdown') step(1 / 120);
    if (at >= 0) {
      // Drop the player at a sample index already moving at `speed`.
      const i = track.wrap(at);
      const hd = track.headingAt(i);
      player.reset(track.pos[i].x, track.pos[i].z, hd, i, i);
      player.y = track.height[i];
      player.vx = Math.sin(hd) * speed;
      player.vz = Math.cos(hd) * speed;
      placeCamera(0, true);
    }
    const sheet = document.createElement('canvas');
    sheet.width = cols * w;
    sheet.height = Math.ceil(shots / cols) * h;
    const ctx = sheet.getContext('2d');
    ctx.font = 'bold 14px monospace';
    const log = [];
    for (let n = 0; n < shots; n++) {
      for (let t = 0; t < every; t += 1 / 120) step(1 / 120);
      renderer.render(scene, camera);
      const x = (n % cols) * w, y = Math.floor(n / cols) * h;
      ctx.drawImage(renderer.domElement, x, y, w, h);
      const hit = firstHit(player.x, player.z);
      const buried = hit && hit.object !== track.road;
      const label = `${n} t=${raceTime.toFixed(0)}s idx=${player.idx} y=${player.y.toFixed(1)} v=${player.speed.toFixed(0)}${player.airborne ? ' AIR' : ''}${buried ? ' BURIED' : ''}`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, y, w, 20);
      ctx.fillStyle = buried ? '#ff5050' : '#fff';
      ctx.fillText(label, x + 4, y + 15);
      log.push(label);
    }
    autopilot = false;
    document.getElementById('kart-tour')?.remove();
    const img = new Image();
    img.id = 'kart-tour';
    img.src = sheet.toDataURL('image/jpeg', 0.85);
    img.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:10;cursor:pointer';
    img.onclick = () => img.remove();
    document.body.append(img);
    return log;
  };

  window.__kart = { cars, player, track, step, groundCheck, tour, setAutopilot: (on) => { autopilot = on; } };
}
