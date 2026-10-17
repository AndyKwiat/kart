import * as THREE from 'three';
import { toon } from './materials.js';

export const SKY = {
  top: new THREE.Color(0x2f8ef0),
  horizon: new THREE.Color(0xcdeeff),
  bottom: new THREE.Color(0x9ccf86),
  sunDir: new THREE.Vector3(0.45, 0.75, 0.3).normalize(),
};

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: SKY.top },
      horizon: { value: SKY.horizon },
      bottom: { value: SKY.bottom },
      sunDir: { value: SKY.sunDir },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top, horizon, bottom, sunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55))
                         : mix(horizon, bottom, pow(clamp(-h, 0.0, 1.0), 0.35));
        float s = max(dot(d, sunDir), 0.0);
        c += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 6.0 + pow(s, 60.0) * 0.35 + pow(s, 6.0) * 0.12);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// Gradient sky dome with a sun, fluffy clouds, and an environment map baked
// from the same sky so glossy materials pick up matching reflections.
export class Sky {
  constructor(scene, renderer, center) {
    scene.background = null;
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMaterial());
    this.dome.scale.setScalar(1800);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1;
    scene.add(this.dome);

    const envScene = new THREE.Scene();
    const envDome = new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), skyMaterial());
    envScene.add(envDome);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    pmrem.dispose();

    // Clouds: clusters of puffs, slowly drifting.
    const puffs = [];
    for (let c = 0; c < 34; c++) {
      const a = Math.random() * Math.PI * 2;
      const r = 350 + Math.random() * 650;
      const cx = center.x + Math.cos(a) * r, cz = center.z + Math.sin(a) * r;
      const cy = 140 + Math.random() * 90;
      const n = 5 + Math.floor(Math.random() * 5);
      const scale = 10 + Math.random() * 12;
      for (let k = 0; k < n; k++) {
        const s = scale * (0.6 + Math.random() * 0.7) * (k === 0 ? 1.3 : 1);
        puffs.push([
          cx + (k - n / 2) * scale * 0.9 + (Math.random() - 0.5) * scale,
          cy + Math.random() * scale * 0.4,
          cz + (Math.random() - 0.5) * scale * 1.2,
          s,
        ]);
      }
    }
    this.clouds = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 3),
      toon(0xffffff, { fog: false, emissive: 0x8899aa, emissiveIntensity: 0.35 }),
      puffs.length,
    );
    const m = new THREE.Matrix4();
    puffs.forEach(([x, y, z, s], i) => {
      m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.7, s));
      this.clouds.setMatrixAt(i, m);
    });
    scene.add(this.clouds);
  }

  update(dt, camera) {
    this.dome.position.copy(camera.position);
    this.clouds.position.x += dt * 2.5;
  }
}
