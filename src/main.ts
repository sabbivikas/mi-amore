import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { InputManager } from './utils/InputManager';
import { FlightController, FlightTelemetry } from './flight/FlightController';
import { ProjectileManager } from './combat/Projectiles';
import { WeaponsSystem } from './combat/Weapons';
import { WorldManager } from './world/WorldManager';
import { VillainWaveManager } from './ai/VillainWaveManager';
import { HUD } from './ui/HUD';
import { Minimap } from './ui/Minimap';
import { createHeroRig } from './flight/HeroModel';
import { BoostTrail } from './flight/BoostTrail';
import { loadFBXHero } from './flight/FBXHero';

const canvas = document.querySelector('#game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
(renderer as unknown as { physicallyCorrectLights?: boolean; useLegacyLights?: boolean }).physicallyCorrectLights = true;
(renderer as unknown as { useLegacyLights?: boolean }).useLegacyLights = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x98b6d3);
scene.fog = new THREE.FogExp2(0x98b6d3, 0.00009);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 8000);

const sun = new THREE.DirectionalLight(0xfff4df, 3.8);
sun.position.set(320, 620, 220);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 100;
sun.shadow.camera.far = 1400;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xb7d7f7, 0x3f4c5b, 1.2));
scene.add(new THREE.AmbientLight(0x6986a0, 0.5));

const skylineGlow = new THREE.Mesh(
  new THREE.CircleGeometry(2200, 64),
  new THREE.MeshBasicMaterial({ color: 0x8ac0ff, transparent: true, opacity: 0.08, depthWrite: false })
);
skylineGlow.rotation.x = -Math.PI / 2;
skylineGlow.position.set(0, 25, 0);
scene.add(skylineGlow);

const hazeRings: THREE.Mesh[] = [];
for (let i = 0; i < 3; i += 1) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2800 + i * 1200, 4200 + i * 1200, 96),
    new THREE.MeshBasicMaterial({
      color: 0xbdd7f4,
      transparent: true,
      opacity: 0.06 - i * 0.012,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 20 + i * 18;
  scene.add(ring);
  hazeRings.push(ring);
}

const input = new InputManager();

const player = new THREE.Group();
const fallbackHero = createHeroRig();
player.add(fallbackHero.group);
player.position.set(0, 200, 0);
scene.add(player);

let activeHands: THREE.Object3D[] = [fallbackHero.leftHand, fallbackHero.rightHand];
let activeTrailAnchors: THREE.Object3D[] = [fallbackHero.leftHand, fallbackHero.rightHand, fallbackHero.leftFoot, fallbackHero.rightFoot];
let activePoseUpdate = fallbackHero.updatePose;
let runningHero: Awaited<ReturnType<typeof loadFBXHero>> | null = null;
let floatingHero: Awaited<ReturnType<typeof loadFBXHero>> | null = null;
let isFloatMode = false;
let shiftToggleLatch = false;
let groundYaw = 0;
let groundSpeed = 0;
let groundCameraYaw = 0;
const groundRaycaster = new THREE.Raycaster();
const groundRayOrigin = new THREE.Vector3();

function applyPlayerMode() {
  if (!runningHero || !floatingHero) return;
  runningHero.group.visible = !isFloatMode;
  floatingHero.group.visible = isFloatMode;

  const current = isFloatMode ? floatingHero : runningHero;
  activeHands = [current.leftHand, current.rightHand];
  activeTrailAnchors = [current.leftHand, current.rightHand, current.leftFoot, current.rightFoot];
  activePoseUpdate = current.updatePose;
}

Promise.all([
  loadFBXHero('/models/Running.fbx'),
  loadFBXHero('/models/Floating.fbx', { alwaysAnimate: true })
])
  .then(([runModel, floatModel]) => {
    runningHero = runModel;
    floatingHero = floatModel;
    player.remove(fallbackHero.group);
    player.add(runningHero.group);
    player.add(floatingHero.group);
    applyPlayerMode();
  })
  .catch((error) => {
    console.warn('FBX player load failed, using fallback hero mesh.', error);
  });

const flight = new FlightController(player, camera, input);
const boostTrail = new BoostTrail(scene);

const projectiles = new ProjectileManager(scene);
const weapons = new WeaponsSystem(input, projectiles);

const protectZones = [
  { id: 'zone_a', position: new THREE.Vector3(0, 0, 0), radius: 140, health: 100 },
  { id: 'zone_b', position: new THREE.Vector3(420, 0, -320), radius: 120, health: 100 },
  { id: 'zone_c', position: new THREE.Vector3(-380, 0, 260), radius: 150, health: 100 }
];

protectZones.forEach((zone) => {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(zone.radius - 4, zone.radius, 32),
    new THREE.MeshBasicMaterial({ color: 0x7ef7ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  ring.rotateX(-Math.PI / 2);
  ring.position.copy(zone.position);
  ring.position.y = 2;
  scene.add(ring);
});

const world = new WorldManager(scene);
const villains = new VillainWaveManager(scene);
villains.load('/models/villain.fbx').catch((error) => {
  console.warn('Villain model load failed.', error);
});
const hud = new HUD();
const minimap = new Minimap();

const debugEl = document.querySelector('#debug') as HTMLElement;
const debugDrawEl = document.querySelector('#debug-draws') as HTMLElement;
const debugChunkEl = document.querySelector('#debug-chunks') as HTMLElement;
const pauseEl = document.querySelector('#pause') as HTMLElement;
const exposureInput = document.querySelector('#setting-exposure') as HTMLInputElement;
const postFxToggle = document.querySelector('#setting-postfx') as HTMLInputElement;
const shadowToggle = document.querySelector('#setting-shadows') as HTMLInputElement;

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.35, 0.82);
const fxaaPass = new ShaderPass(FXAAShader);
fxaaPass.material.uniforms.resolution.value.set(1 / window.innerWidth, 1 / window.innerHeight);

const vignettePass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0.16 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 p = vUv - 0.5;
      float vignette = smoothstep(0.72, 0.2, dot(p, p));
      color.rgb *= mix(1.0, vignette, strength);
      gl_FragColor = color;
    }
  `
});

composer.addPass(renderPass);
composer.addPass(bloomPass);
composer.addPass(fxaaPass);
composer.addPass(vignettePass);

const clock = new THREE.Clock();
let resetLatch = false;

function updateGroundMovement(dt: number): FlightTelemetry {
  const strafeInput = (input.isDown('rollRight') ? 1 : 0) - (input.isDown('rollLeft') ? 1 : 0);
  const forwardInput = (input.isDown('pitchUp') ? 1 : 0) - (input.isDown('pitchDown') ? 1 : 0);

  const camForward = new THREE.Vector3();
  camera.getWorldDirection(camForward);
  camForward.y = 0;
  if (camForward.lengthSq() < 0.0001) camForward.set(0, 0, 1);
  camForward.normalize();
  const camRight = new THREE.Vector3(camForward.z, 0, -camForward.x);

  const inputMove = camForward.multiplyScalar(forwardInput).add(camRight.multiplyScalar(strafeInput));
  const hasInput = inputMove.lengthSq() > 0;

  if (hasInput) inputMove.normalize();
  const moveDir = hasInput ? inputMove.clone() : new THREE.Vector3();

  const runSpeed = 86;
  const targetSpeed = hasInput ? runSpeed : 0;
  groundSpeed = THREE.MathUtils.lerp(groundSpeed, targetSpeed, Math.min(1, dt * 6.2));

  const velocity = hasInput ? moveDir.clone().multiplyScalar(groundSpeed) : new THREE.Vector3();
  player.position.addScaledVector(velocity, dt);
  groundRayOrigin.set(player.position.x, 1200, player.position.z);
  groundRaycaster.set(groundRayOrigin, new THREE.Vector3(0, -1, 0));
  const terrainHits = groundRaycaster.intersectObjects(world.getTerrainMeshes(), false);
  const groundY = terrainHits.length > 0 ? terrainHits[0].point.y : 30;
  player.position.y = THREE.MathUtils.lerp(player.position.y, groundY + 0.2, Math.min(1, dt * 12));

  if (hasInput) {
    groundYaw = Math.atan2(velocity.x, velocity.z);
  }

  const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, groundYaw, 0));
  player.quaternion.slerp(targetQuat, Math.min(1, dt * 10));

  groundCameraYaw = THREE.MathUtils.lerp(groundCameraYaw, groundYaw, Math.min(1, dt * 3.2));
  const cameraQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, groundCameraYaw, 0));
  const desiredOffset = new THREE.Vector3(0, 7.2, -13.5).applyQuaternion(cameraQuat);
  const desiredCameraPos = player.position.clone().add(desiredOffset);
  camera.position.lerp(desiredCameraPos, 1 - Math.pow(0.04, dt));
  camera.lookAt(player.position.clone().add(new THREE.Vector3(0, 2.6, 0)));
  camera.fov = THREE.MathUtils.lerp(camera.fov, 56, 0.1);
  camera.updateProjectionMatrix();

  return {
    speed: Math.abs(groundSpeed),
    altitude: player.position.y,
    heading: ((THREE.MathUtils.radToDeg(groundYaw) % 360) + 360) % 360,
    boost: 1,
    turnRate: strafeInput * 90,
    pitchRate: forwardInput * 90,
    boostActive: false,
    forward: new THREE.Vector3(Math.sin(groundYaw), 0, Math.cos(groundYaw))
  };
}

function update() {
  requestAnimationFrame(update);

  const paused = input.getToggle('pause');
  pauseEl.classList.toggle('hidden', !paused);

  const dt = Math.min(clock.getDelta(), 0.05);
  if (paused) return;

  if (input.isDown('reset')) {
    if (!resetLatch) flight.reset(new THREE.Vector3(0, 200, 0));
    resetLatch = true;
  } else {
    resetLatch = false;
  }

  renderer.toneMappingExposure = parseFloat(exposureInput.value);
  const shadowsEnabled = shadowToggle.checked;
  renderer.shadowMap.enabled = shadowsEnabled;
  sun.castShadow = shadowsEnabled;

  const shiftPressed = input.isDown('boost');
  if (shiftPressed && !shiftToggleLatch) {
    isFloatMode = !isFloatMode;
    if (isFloatMode) {
      flight.reset(player.position.clone());
    } else {
      groundYaw = player.rotation.y;
      groundSpeed = 0;
    }
    applyPlayerMode();
  }
  shiftToggleLatch = shiftPressed;

  const telemetry = isFloatMode ? flight.update(dt) : updateGroundMovement(dt);
  activePoseUpdate(telemetry.turnRate, telemetry.pitchRate, telemetry.speed, dt);

  weapons.update(dt, player, activeHands);

  projectiles.update(dt);

  boostTrail.update(
    dt,
    telemetry.boostActive,
    activeTrailAnchors,
    telemetry.forward,
    telemetry.speed
  );

  world.update(player.position, clock.elapsedTime);
  villains.update(dt, player, projectiles.getActive(), projectiles);

  hud.setWave(villains.getWave() || 1);
  hud.setVisible(!input.getToggle('hud'));
  minimap.setVisible(!input.getToggle('minimap'));

  const villainMeshes = villains.getVillains();
  minimap.render(player, villainMeshes, protectZones);

  hud.setTarget(villainMeshes.some((alien) => alien.position.distanceTo(player.position) < 220));
  hud.setThreat(villains.getThreat());
  hud.update(telemetry);

  const fog = scene.fog as THREE.FogExp2;
  const altitudeFog = THREE.MathUtils.clamp((player.position.y - 500) / 1500, 0, 1);
  fog.density = THREE.MathUtils.lerp(0.0001, 0.000055, altitudeFog);

  const t = performance.now() * 0.00005;
  (skylineGlow.material as THREE.MeshBasicMaterial).opacity = 0.06 + Math.sin(t * 4) * 0.01;
  skylineGlow.rotation.z += 0.00008;
  hazeRings.forEach((ring, i) => {
    ring.rotation.z += 0.00004 * (i + 1);
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.035 + Math.sin(t * (2 + i)) * 0.01;
  });

  if (input.getToggle('debug')) {
    debugEl.classList.remove('hidden');
    debugDrawEl.textContent = `Draws ${renderer.info.render.calls}`;
    debugChunkEl.textContent = `Chunks ${world.getActiveChunkCount()}`;
  } else {
    debugEl.classList.add('hidden');
  }

  if (postFxToggle.checked) composer.render();
  else renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  fxaaPass.material.uniforms.resolution.value.set(1 / window.innerWidth, 1 / window.innerHeight);
});

update();
