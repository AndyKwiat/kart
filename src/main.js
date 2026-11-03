import * as THREE from 'three';
import { Track } from './track.js';
import { TRACKS } from './tracks/index.js';
import { Car, collideCars } from './car.js';
import { AIDriver } from './ai.js';
import { Hud } from './hud.js';
import { buildScenery } from './scenery.js';
import { Sky } from './sky.js';
import { Effects } from './fx.js';
import { Wildlife } from './animals.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';

const LAPS = 2;
const COUNTDOWN = 3;

const pixelRatio = Math.min(window.devicePixelRatio, 2);
// No MSAA on the canvas: everything goes through the composer (FXAA at the end).
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 2400);

// The current world (rebuilt for each track of the circuit).
let scene = new THREE.Scene();
let track, world, sun, ground, sky, effects, wildlife;

// Render through an HDR target so emissive things (lights, pads, sparks, boost
// flames) can bloom. Anti-aliasing is FXAA at the end: 4x MSAA on the HDR
// target cost ~3.5 ms/frame (more than the whole scene) and made bloom 3x
// slower; FXAA costs a fraction of a millisecond.
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
composer.setPixelRatio(pixelRatio);
composer.setSize(window.innerWidth, window.innerHeight);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.45, 1.6);
// The blur is soft anyway: run the whole bloom chain at half resolution.
const bloomSetSize = bloom.setSize.bind(bloom);
bloom.setSize = (w, h) => bloomSetSize(w / 2, h / 2);
composer.addPass(bloom);
composer.addPass(new OutputPass());
composer.addPass(new FXAAPass());

// Adaptive resolution: if frames run long (sustained < ~50 fps), step the
// render scale down. Rendering is fill-rate bound, so this is the big lever.
const QUALITY_SCALES = [2, 1.5, 1.25, 1].filter((q) => q <= pixelRatio);
if (!QUALITY_SCALES.length) QUALITY_SCALES.push(pixelRatio);
let qualityLevel = 0;
let slowTime = 0, sampleTime = 0, sampleFrames = 0;
function applyQuality() {
  const pr = QUALITY_SCALES[qualityLevel];
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}
function adaptQuality(elapsed) {
  // Real frame time; skip gaps (tab switches, background throttling).
  if (elapsed > 0.25 || document.hidden) return;
  sampleTime += elapsed;
  sampleFrames++;
  if (sampleTime < 1) return;
  const fps = sampleFrames / sampleTime;
  sampleTime = 0;
  sampleFrames = 0;
  slowTime = fps < 50 ? slowTime + 1 : 0;
  // Two slow seconds in a row (ignores one-off hitches like tab switches).
  if (slowTime >= 2 && qualityLevel < QUALITY_SCALES.length - 1) {
    qualityLevel++;
    slowTime = 0;
    applyQuality();
  }
}

const shakeOffset = new THREE.Vector3();
function render() {
  const s = effects.shake;
  shakeOffset.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  camera.position.add(shakeOffset);
  sky.update(0, camera);
  effects.setScale((window.innerHeight * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)));
  composer.render();
  camera.position.sub(shakeOffset);
}
const hud = new Hud();

// The field: seven named rivals and you.
const RIVALS = [
  ['Rosa', 0x3b6cff], ['Blitz', 0x2fc45a], ['Mika', 0xffd21f], ['Luna', 0x9b4dff],
  ['Bolt', 0xff8a1f], ['Kiko', 0x1fd6d6], ['Pip', 0xff5fb8],
];
const player = new Car(0xe53935, 'You');
// Slightly lower top speed than before (52) so the player's edge over the
// AI comes mostly from driving well (drift boosts, lines, dash pads).
player.maxSpeed = 51;
player.respawnAfter = 5; // seconds you can spend off the track
const cars = [...RIVALS.map(([name, color]) => new Car(color, name)), player];
// Opponent top speeds relative to yours: the first four +20%, the next two
// +10%; the last keeps the default top speed with a little less skill.
for (const car of cars.slice(0, 4)) car.maxSpeed = player.maxSpeed * 1.2;
for (const car of cars.slice(4, 6)) car.maxSpeed = player.maxSpeed * 1.1;
const FULL_SKILL = new Set(cars.slice(0, 6));
const drivers = new Map();
const playerAutopilot = new AIDriver(player, 0.9);

// ---- Input ----
const keys = new Set();
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'Enter' && state === 'standings') nextRace();
  else if (e.code === 'KeyR' && state !== 'standings' && state !== 'loading') resetRace();
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
let paused = false; // dev: freeze for close-ups

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
      // Full skill means the AI actually reaches its top speed on straights.
      const skill = FULL_SKILL.has(car) ? 1 : 0.86 + (RIVALS.length - slot) * 0.018 + Math.random() * 0.02;
      drivers.set(car, new AIDriver(car, skill));
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
  // Over the chasm the camera swings wide and high for a cinematic shot.
  const back = 6.8 + sr * 1.4 + cine * 9;
  // Vertical follow is softer so jumps and landings don't jolt the view.
  camY = snap ? player.y : camY + (player.y - camY) * (1 - Math.exp(-dt * (player.y > camY ? 9 : 6)));
  const side = cine * 9;
  const target = new THREE.Vector3(
    player.x - Math.sin(camHeading) * back - Math.cos(camHeading) * side,
    camY + 4.3 + player.hopY * 0.3 + cine * 4,
    player.z - Math.cos(camHeading) * back + Math.sin(camHeading) * side,
  );
  if (snap) camera.position.copy(target);
  else camera.position.lerp(target, 1 - Math.exp(-dt * 12));
  // Keep the camera inside tunnel arches (it rides above and behind the car).
  const ci = track.nearest(camera.position.x, camera.position.z, player.idx);
  if (track.tunnelAt[ci]) {
    const r = track.right[ci];
    let clat = track.lateral(ci, camera.position.x, camera.position.z);
    const w = track.wallOffset(ci) - 0.5;
    if (Math.abs(clat) > w) {
      const shift = Math.sign(clat) * w - clat;
      camera.position.x += r.x * shift;
      camera.position.z += r.z * shift;
      clat += shift;
    }
    camera.position.y = Math.min(camera.position.y, track.archTop(ci, clat) - 0.8);
  }
  const ahead = 7 - cine * 5;
  camera.lookAt(
    player.x + Math.sin(player.heading) * ahead,
    camY + 1.2,
    player.z + Math.cos(player.heading) * ahead,
  );
  const fov = 68 + sr * 10 + (player.boost > 0 ? 7 : 0) + cine * 12;
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();

  sun.position.copy(sky.sunDir).multiplyScalar(150).add(player.mesh.position);
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
    // Keeps running after you finish so later finishers get their own times.
    raceTime += dt;
    for (const car of cars) {
      let input;
      if (car === player && !player.finished && !autopilot) input = playerInput();
      else {
        const driver = car === player ? playerAutopilot : drivers.get(car);
        input = driver.input(track, clock, dt, cars, player.progress - car.progress);
      }
      car.update(dt, input, track);
    }
    collideCars(cars, player.finished ? null : player);

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
    // Once you're home, wait for the others (or a few seconds), then score.
    if (state === 'finished' && (cars.every((c) => c.finished) || clock - finishShownAt > 10)) endRace();
  }

  for (const car of cars) {
    const near = car === player || camera.position.distanceToSquared(car.mesh.position) < 140 * 140;
    effects.car(car, dt, near, car === player);
  }
  const respawnSnap = player.respawned;
  for (const car of cars) car.respawned = false;

  const lap = Math.min(LAPS, Math.max(1, Math.floor(player.progress / track.N) + 1));
  if (state === 'race' && lap !== lastLap && lap > lastLap) {
    hud.flash(lap === LAPS ? 'FINAL LAP!' : `LAP ${lap}`, clock);
  }
  lastLap = Math.max(lastLap, lap);
  hud.tickFlash(clock);
  placeCamera(dt, respawnSnap);
}

// DOM/minimap updates once per rendered frame (not per physics substep).
function updateHud() {
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
  hud.drawMinimap(cars, player);
  hud.drawRadar(cars, player, track, clock);
}

let last = performance.now();
// Big-jump cinematics: while you're in the air over a chasm, time slows and
// the camera pulls out (`cine` eases 0..1 in real time).
let cine = 0;
function updateCinematic(dt) {
  const zone = track.gaps.some((g) => player.idx >= g.from - 45 && player.idx <= g.to + 40);
  const want = zone && player.airborne && !player.finished ? 1 : 0;
  cine += (want - cine) * Math.min(1, dt * (want > cine ? 5 : 2.5));
}

function frame(now) {
  const elapsed = (now - last) / 1000;
  const realDt = Math.min(0.05, elapsed);
  last = now;
  if (!paused && track && state !== 'loading') {
    simFrame(realDt);
    if (cine < 0.05) adaptQuality(elapsed); // slow-mo frames aren't a perf signal
  }
  requestAnimationFrame(frame);
}

// One rendered frame of game time (also used by the dev frame-capture tool).
function simFrame(realDt) {
  updateCinematic(realDt);
  const dt = realDt * (1 - 0.6 * cine); // slow motion over the chasm
  // Two substeps keep collisions stable at low frame rates.
  step(dt / 2);
  step(dt / 2);
  effects.update(dt);
  wildlife.update(dt, cars);
  sky.update(dt, camera);
  updateHud();
  render();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Tracks and the circuit ----

// Tear down the previous world (the cars are kept and carried over).
function disposeScene(old) {
  for (const car of cars) old.remove(car.mesh);
  old.traverse((o) => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
      m.dispose();
    }
  });
  old.environment?.dispose();
}

function loadTrack(def) {
  if (track) disposeScene(scene);
  scene = new THREE.Scene();
  renderPass.scene = scene;
  track = new Track(def);
  scene.add(track.group);
  world = buildScenery(scene, track, track.theme);
  ({ sun, ground } = world);
  track.terrainY = world.groundY; // lets cars drive on the terrain off-track
  sky = new Sky(scene, renderer, world.center, track.theme);
  effects = new Effects(scene);
  wildlife = new Wildlife(scene, world, track);
  for (const car of cars) scene.add(car.mesh);
  hud.setTrack(track);
}

// Mario Kart-style points for 1st..8th.
const POINTS = [15, 12, 10, 8, 6, 4, 2, 1];
const circuit = { order: [], race: 0, points: new Map(), last: [] };

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startCircuit() {
  circuit.order = shuffle(TRACKS);
  circuit.race = 0;
  circuit.points = new Map(cars.map((c) => [c, 0]));
  loadRace();
}

function loadRace() {
  const def = circuit.order[circuit.race];
  state = 'loading';
  hud.hideResults();
  hud.showLoading(`Race ${circuit.race + 1} of ${circuit.order.length}`, def.name);
  // Let the loading card paint before the (blocking) world build.
  setTimeout(() => {
    loadTrack(def);
    resetRace();
    hud.hideLoading();
    hud.showTitle(`Race ${circuit.race + 1}/${circuit.order.length}`, def.name);
  }, 40);
}

// Score the race: finishers in order, anyone still racing by track position.
function endRace() {
  state = 'standings';
  const order = rankOrder();
  circuit.last = order.map((car, i) => {
    circuit.points.set(car, circuit.points.get(car) + POINTS[i]);
    return { car, points: POINTS[i], time: car.finished ? car.finishTime : null };
  });
  const totals = [...circuit.points].sort((a, b) => b[1] - a[1]).map(([car, pts]) => ({ car, pts }));
  const done = circuit.race === circuit.order.length - 1;
  hud.showStandings({
    title: done ? 'Circuit complete!' : `Race ${circuit.race + 1} of ${circuit.order.length}: ${circuit.order[circuit.race].name}`,
    race: circuit.last,
    totals,
    player,
    next: done ? 'Press Enter for a new circuit' : `Press Enter for race ${circuit.race + 2}: ${circuit.order[circuit.race + 1].name}`,
  });
}

function nextRace() {
  if (circuit.race >= circuit.order.length - 1) return startCircuit();
  circuit.race++;
  loadRace();
}

startCircuit();
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
      if (track.gapAt[i]) continue; // no road over a gap, by design
      const p = track.pos[i], r = track.right[i];
      for (let lat = -track.hw[i] + 1; lat <= track.hw[i] - 1; lat += 6) {
        if (Math.abs(lat - track.islandMid[i]) < track.islandHw[i] + 0.5) continue;
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
      render();
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

  // __kart.film({ trackId, before, speed, seconds, fps }): AI drives you into
  // the track's big jump and the game is stepped at a fixed 60 fps (slow-mo
  // and cinematic camera included), returning canvas frames as data URLs.
  const film = ({ trackId = 'alpine', before = 70, speed = 58, seconds = 3, fps = 15 } = {}) => {
    if (track.def.id !== trackId) loadTrack(TRACKS.find((t) => t.id === trackId));
    resetRace();
    paused = true;
    autopilot = true;
    while (state === 'countdown') step(1 / 120);
    const g = track.gaps[0];
    const i = track.wrap(g.from - before);
    const hd = track.headingAt(i);
    player.reset(track.pos[i].x, track.pos[i].z, hd, i, i);
    player.y = track.height[i];
    player.vx = Math.sin(hd) * speed;
    player.vz = Math.cos(hd) * speed;
    player.boost = 0.6;
    cine = 0;
    placeCamera(0, true);
    const frames = [];
    const per = Math.round(60 / fps);
    for (let n = 0; n < seconds * 60; n++) {
      simFrame(1 / 60);
      if (n % per === 0) frames.push(renderer.domElement.toDataURL('image/png'));
    }
    autopilot = false;
    paused = false;
    return frames;
  };

  // __kart.closeup(car): freeze the loop and frame a beauty shot of a car.
  const closeup = (car = cars[0], angle = 2.4, dist = 7, height = 2.2) => {
    paused = true;
    const p = car.mesh.position;
    camera.position.set(p.x + Math.sin(car.heading + angle) * dist, p.y + height, p.z + Math.cos(car.heading + angle) * dist);
    camera.lookAt(p.x, p.y + 0.8, p.z);
    camera.fov = 45;
    camera.updateProjectionMatrix();
    render();
  };
  window.__kart = {
    cars, player, step, render, renderer, composer, camera, hud, groundCheck, tour, closeup, film,
    get track() { return track; }, get world() { return world; }, get scene() { return scene; },
    get effects() { return effects; }, get wildlife() { return wildlife; }, get state() { return state; },
    circuit, loadTrack: (id) => { loadTrack(TRACKS.find((t) => t.id === id)); resetRace(); }, endRace, nextRace,
    resume: () => { paused = false; }, setAutopilot: (on) => { autopilot = on; },
  };
}
