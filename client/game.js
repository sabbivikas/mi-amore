import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

const HEART_TARGET = 20;
const WORLD_SIZE = 90;
const PLAYER_MAX_HP = 100;
const BASE_ZOMBIE_MAX = 4;
const BASE_ZOMBIE_INTERVAL_MS = 7000;
const CHUNK_SIZE = 32;
const VIEW_DISTANCE = 6;
const WATER_LEVEL = 6;
const SNOW_LINE = 18;
const SEED = 133742;

const ZOMBIE_TARGET_HEIGHT = 1.95;
const VISION_RADIUS = 18;
const ZOMBIE_ATTACK_RANGE = 1.6;
const ZOMBIE_ATTACK_COOLDOWN = 1200;
const ZOMBIE_WALK_SPEED = 2.2;
const ZOMBIE_MAX_SPEED = 3.2;

const GIRL_TARGET_HEIGHT = 1.78;
const BOY_TARGET_HEIGHT = 1.85;
const WALK_SPEED = 4.5;
const RUN_SPEED = 7.2;
const COMBO_WINDOW_START = 0.45;
const COMBO_WINDOW_END = 1.0;
const ATTACK_COOLDOWN = 0.08;
const MIN_ATTACK_INTERVAL = 0.25;
const PUNCH_HIT_WINDOW = { start: 0.35, end: 0.55 };
const KICK_HIT_WINDOW = { start: 0.3, end: 0.6 };
const ATTACK_RANGE = 1.6;
const ATTACK_ARC = Math.PI / 2;
const BOY_ATTACK_RANGE = 1.7;
const BOY_ATTACK_ARC = (100 * Math.PI) / 180;
const HIT_WINDOWS = {
  fist: { start: 0.35, end: 0.55 },
  kick: { start: 0.3, end: 0.6 },
  jump: { start: 0.4, end: 0.7 }
};
const ATTACK_BLEND_GAP = 0.08;
const DANCE_DURATION = 5000;

const ZOMBIE_ACCEL = 12;
const ZOMBIE_DAMPING = 7;
const TURN_SPEED = 7;
const ARRIVE_RADIUS = 3.2;
const ATTACK_ANIM_MS = 950;
const STUN_MS = 220;

const ZOMBIE_COLLIDER_RADIUS = 0.5;
const ZOMBIE_COLLIDER_HALF_HEIGHT = ZOMBIE_TARGET_HEIGHT * 0.5;

const ZOMBIE_STATE = {
  IDLE: 'IDLE',
  CHASE: 'CHASE',
  ATTACK: 'ATTACK',
  STUN: 'STUN'
};

let ACTIVE_WORLD_SEED = SEED;

const socketProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const socketUrl = `${socketProtocol}://${window.location.hostname}:${window.location.port || 3000}`;

const ui = {
  startMenu: document.getElementById('startMenu'),
  modeMenu: document.getElementById('modeMenu'),
  multiplayerMenu: document.getElementById('multiplayerMenu'),
  characterSelect: document.getElementById('characterSelect'),
  toModeBtn: document.getElementById('toModeBtn'),
  singleModeBtn: document.getElementById('singleModeBtn'),
  multiModeBtn: document.getElementById('multiModeBtn'),
  backToStartBtn: document.getElementById('backToStartBtn'),
  backToModeBtn: document.getElementById('backToModeBtn'),
  createRoomBtn: document.getElementById('createRoomBtn'),
  joinRoomBtn: document.getElementById('joinRoomBtn'),
  joinCodeInput: document.getElementById('joinCodeInput'),
  roomInfo: document.getElementById('roomInfo'),
  menuError: document.getElementById('menuError'),
  hud: document.getElementById('hud'),
  statsEl: document.getElementById('stats'),
  objectiveEl: document.getElementById('objective'),
  distanceEl: document.getElementById('distance'),
  radar: document.getElementById('radar'),
  deathOverlay: document.getElementById('deathOverlay'),
  proposalOverlay: document.getElementById('proposalOverlay'),
  proposalText: document.getElementById('proposalText'),
  proposalButtons: document.getElementById('proposalButtons'),
  resultOverlay: document.getElementById('resultOverlay'),
  resultTitle: document.getElementById('resultTitle'),
  resultText: document.getElementById('resultText'),
  backToLobbyBtn: document.getElementById('backToLobbyBtn'),
  singleGameOverOverlay: document.getElementById('singleGameOverOverlay'),
  singleGameOverText: document.getElementById('singleGameOverText'),
  singleRestartBtn: document.getElementById('singleRestartBtn'),
  canvas: document.getElementById('game')
};

const radarCtx = ui.radar.getContext('2d');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function dist2(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return dx * dx + dz * dz;
}

function normalizeAngle(a) {
  let out = a;
  while (out > Math.PI) out -= Math.PI * 2;
  while (out < -Math.PI) out += Math.PI * 2;
  return out;
}

function hash2(seed, x, z) {
  let h = (seed ^ (x * 374761393) ^ (z * 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise2(seed, x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = x0 + 1;
  const z1 = z0 + 1;
  const tx = smoothstep(x - x0);
  const tz = smoothstep(z - z0);

  const n00 = hash2(seed, x0, z0);
  const n10 = hash2(seed, x1, z0);
  const n01 = hash2(seed, x0, z1);
  const n11 = hash2(seed, x1, z1);
  const nx0 = n00 + (n10 - n00) * tx;
  const nx1 = n01 + (n11 - n01) * tx;
  return nx0 + (nx1 - nx0) * tz;
}

function fbm(seed, x, z, octaves = 4) {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let total = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise2(seed + i * 97, x * frequency, z * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}

function terrainHeightWithSeed(seed, x, z) {
  const nx = x * 0.014;
  const nz = z * 0.014;
  const continents = fbm(seed, nx * 0.45, nz * 0.45, 3);
  const hills = fbm(seed ^ 0x9e3779b9, nx * 1.4, nz * 1.4, 4);
  const mountains = fbm(seed ^ 0x85ebca6b, nx * 2.2, nz * 2.2, 5);
  const mountainMask = smoothstep(clamp((continents - 0.58) * 2.6, 0, 1));
  const lowlands = 7 + (continents - 0.5) * 4.5;
  const hilly = lowlands + (hills - 0.5) * 7.0;
  const peak = hilly + mountainMask * (mountains - 0.42) * 18;
  return Math.max(1, Math.round(peak));
}

function terrainHeight(x, z) {
  return terrainHeightWithSeed(ACTIVE_WORLD_SEED, x, z);
}

function moistureAt(seed, x, z) {
  return fbm(seed ^ 0x27d4eb2f, x * 0.03, z * 0.03, 3);
}

function computeDifficulty(timerMs) {
  return Math.floor(timerMs / 30000);
}

function computeSpawnIntervalMs(difficultyLevel) {
  return Math.max(1800, BASE_ZOMBIE_INTERVAL_MS - difficultyLevel * 450);
}

function computeMaxZombies(difficultyLevel) {
  return BASE_ZOMBIE_MAX + difficultyLevel * 2;
}

function getGroundedY(x, z) {
  return terrainHeight(x, z) + ZOMBIE_COLLIDER_HALF_HEIGHT;
}

function canMoveCapsule(x, z) {
  const sampleOffsets = [
    [0, 0],
    [ZOMBIE_COLLIDER_RADIUS * 0.8, 0],
    [-ZOMBIE_COLLIDER_RADIUS * 0.8, 0],
    [0, ZOMBIE_COLLIDER_RADIUS * 0.8],
    [0, -ZOMBIE_COLLIDER_RADIUS * 0.8]
  ];

  let minH = Infinity;
  let maxH = -Infinity;
  for (const [ox, oz] of sampleOffsets) {
    const h = terrainHeight(x + ox, z + oz);
    minH = Math.min(minH, h);
    maxH = Math.max(maxH, h);
  }

  return maxH - minH <= 2.2;
}

function randomSpawnAroundPlayer(player) {
  for (let i = 0; i < 120; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 20 + Math.random() * 15;
    const x = player.x + Math.cos(angle) * radius;
    const z = player.z + Math.sin(angle) * radius;
    if (dist2({ x, z }, player) < 12 * 12) continue;
    if (!canMoveCapsule(x, z)) continue;
    return { x, z };
  }
  return { x: player.x + 22, z: player.z + 22 };
}

function hidePanels() {
  ui.startMenu.classList.add('hidden');
  ui.modeMenu.classList.add('hidden');
  ui.multiplayerMenu.classList.add('hidden');
}

function hideAllOverlays() {
  ui.deathOverlay.classList.add('hidden');
  ui.proposalOverlay.classList.add('hidden');
  ui.resultOverlay.classList.add('hidden');
  ui.singleGameOverOverlay.classList.add('hidden');
}

class ZombieAssets {
  constructor() {
    this.loader = new FBXLoader();
    this.ready = false;
    this.modelTemplate = null;
    this.walkClip = null;
    this.attackClip = null;
  }

  async load() {
    const [walkRoot, attackRoot] = await Promise.all([
      this.loader.loadAsync('/assets/zombie-walk.fbx'),
      this.loader.loadAsync('/assets/zombie-attack.fbx')
    ]);

    this.walkClip = walkRoot.animations?.[0] || null;
    this.attackClip = attackRoot.animations?.[0] || null;

    if (!this.walkClip || !this.attackClip) {
      throw new Error('FBX files are missing expected animations.');
    }

    walkRoot.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      if (obj.material) {
        obj.material = Array.isArray(obj.material)
          ? obj.material.map((m) => m.clone())
          : obj.material.clone();
      }
    });

    const box = new THREE.Box3().setFromObject(walkRoot);
    const size = new THREE.Vector3();
    box.getSize(size);
    const rawHeight = Math.max(0.001, size.y);
    const scale = ZOMBIE_TARGET_HEIGHT / rawHeight;
    walkRoot.scale.setScalar(scale);

    const scaledBox = new THREE.Box3().setFromObject(walkRoot);
    const minY = scaledBox.min.y;
    walkRoot.position.y -= minY;

    this.modelTemplate = walkRoot;
    this.ready = true;
  }

  createInstance() {
    const root = cloneSkeleton(this.modelTemplate);
    root.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return root;
  }
}

class GirlCharacterAssets {
  constructor() {
    this.loader = new FBXLoader();
    this.base = null;
    this.clips = {};
  }

  async load() {
    const [idleRoot, walkRoot, runRoot, punchRoot, kickRoot] = await Promise.all([
      this.loader.loadAsync('/assets/girl-idle.fbx'),
      this.loader.loadAsync('/assets/girl-walk.fbx'),
      this.loader.loadAsync('/assets/girl-run.fbx'),
      this.loader.loadAsync('/assets/girl-punch.fbx'),
      this.loader.loadAsync('/assets/girl-kick.fbx')
    ]);

    const base = idleRoot;
    const clips = {
      idle: idleRoot.animations?.[0] || null,
      walk: walkRoot.animations?.[0] || null,
      run: runRoot.animations?.[0] || null,
      punch: punchRoot.animations?.[0] || null,
      kick: kickRoot.animations?.[0] || null
    };
    if (!clips.idle || !clips.walk || !clips.run || !clips.punch || !clips.kick) {
      throw new Error('Girl FBX clips are missing (idle/walk/run/punch/kick).');
    }

    base.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      if (obj.material) {
        obj.material = Array.isArray(obj.material)
          ? obj.material.map((m) => m.clone())
          : obj.material.clone();
      }
    });

    const box = new THREE.Box3().setFromObject(base);
    const size = new THREE.Vector3();
    box.getSize(size);
    const rawHeight = Math.max(0.001, size.y);
    const scale = GIRL_TARGET_HEIGHT / rawHeight;
    base.scale.setScalar(scale);
    const scaledBox = new THREE.Box3().setFromObject(base);
    base.position.y -= scaledBox.min.y;

    this.base = base;
    this.clips = clips;
  }

  createInstance() {
    return cloneSkeleton(this.base);
  }
}

class GirlCharacterController {
  constructor(scene, assets, isLocal) {
    this.scene = scene;
    this.assets = assets;
    this.isLocal = isLocal;
    this.root = assets.createInstance();
    this.scene.add(this.root);

    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {
      idle: this.mixer.clipAction(assets.clips.idle),
      walk: this.mixer.clipAction(assets.clips.walk),
      run: this.mixer.clipAction(assets.clips.run),
      punch: this.mixer.clipAction(assets.clips.punch),
      kick: this.mixer.clipAction(assets.clips.kick)
    };

    this.actions.idle.play();
    this.actions.walk.play();
    this.actions.run.play();
    this.actions.walk.enabled = false;
    this.actions.run.enabled = false;

    this.actions.punch.loop = THREE.LoopOnce;
    this.actions.kick.loop = THREE.LoopOnce;
    this.actions.punch.clampWhenFinished = true;
    this.actions.kick.clampWhenFinished = true;

    this.current = 'idle';
    this.combat = {
      active: false,
      step: null,
      startedAt: 0,
      queuedStep: null,
      hitApplied: false,
      cooldownUntil: 0,
      lastStepStartedAt: 0
    };
    this.move = { speed: 0, sprinting: false };
    this.hitCallback = null;
    this.attackHeld = false;
    this.lastCompletedStep = 'kick';
  }

  destroy() {
    this.mixer.stopAllAction();
    this.scene.remove(this.root);
  }

  setTransform(x, y, z, rot) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = rot;
  }

  setMoveState(speed, sprinting) {
    this.move.speed = speed;
    this.move.sprinting = sprinting;
  }

  fadeTo(name, duration = 0.2) {
    if (this.current === name) return;
    const prev = this.actions[this.current];
    const next = this.actions[name];
    if (!next) return;
    next.enabled = true;
    next.reset();
    next.play();
    if (prev) prev.crossFadeTo(next, duration, false);
    this.current = name;
  }

  startStep(step, nowMs) {
    if (nowMs < this.combat.lastStepStartedAt + MIN_ATTACK_INTERVAL * 1000) return false;
    this.combat.active = true;
    this.combat.step = step;
    this.combat.startedAt = nowMs;
    this.combat.lastStepStartedAt = nowMs;
    this.combat.hitApplied = false;
    this.fadeTo(step === 'punch' ? 'punch' : 'kick', 0.15);
    return true;
  }

  nextComboStep() {
    return this.lastCompletedStep === 'punch' ? 'kick' : 'punch';
  }

  setAttackHeld(held) {
    this.attackHeld = held;
  }

  requestAttack(nowMs, isPressed = false) {
    if (!this.combat.active && nowMs >= this.combat.cooldownUntil) {
      const step = isPressed ? 'punch' : this.nextComboStep();
      const started = this.startStep(step, nowMs);
      return started ? step : null;
    }
    if (this.combat.active) {
      const next = this.combat.step === 'punch' ? 'kick' : 'punch';
      const elapsed = (nowMs - this.combat.startedAt) / 1000;
      if (isPressed) {
        this.combat.queuedStep = next;
        return next;
      }
      if (this.attackHeld && elapsed >= COMBO_WINDOW_START * 0.6) {
        this.combat.queuedStep = next;
        return next;
      }
    }
    return null;
  }

  triggerNetworkStep(step, nowMs) {
    this.combat.lastStepStartedAt = nowMs - MIN_ATTACK_INTERVAL * 1000;
    this.startStep(step, nowMs);
  }

  isAttacking() {
    return this.combat.active;
  }

  update(dtSec, nowMs, onHitStep) {
    const hitCb = onHitStep || this.hitCallback;
    if (!this.combat.active && this.attackHeld && nowMs >= this.combat.cooldownUntil) {
      this.requestAttack(nowMs, false);
    }

    if (this.combat.active) {
      const action = this.actions[this.combat.step];
      const clip = action.getClip();
      const elapsed = (nowMs - this.combat.startedAt) / 1000;
      const duration = Math.max(0.001, clip.duration);
      const t = elapsed / duration;
      const window = this.combat.step === 'punch' ? PUNCH_HIT_WINDOW : KICK_HIT_WINDOW;

      if (!this.combat.hitApplied && t >= window.start && t <= window.end) {
        this.combat.hitApplied = true;
        if (hitCb) hitCb(this.combat.step);
      }

      if (t >= 1) {
        const finishedStep = this.combat.step;
        this.lastCompletedStep = finishedStep;
        const queued = this.combat.queuedStep;
        this.combat.queuedStep = null;
        if (queued) {
          const started = this.startStep(queued, nowMs + 70);
          if (started) return queued;
        }
        this.combat.active = false;
        this.combat.step = null;
        this.combat.cooldownUntil = nowMs + ATTACK_COOLDOWN * 1000;
      }
    }

    if (!this.combat.active) {
      const moving = this.move.speed > 0.1;
      if (!moving) this.fadeTo('idle', 0.2);
      else if (this.move.sprinting) this.fadeTo('run', 0.2);
      else this.fadeTo('walk', 0.2);
      this.actions.walk.timeScale = 1.0;
      this.actions.run.timeScale = 1.0;
    }

    this.mixer.update(dtSec);
    return null;
  }
}

class BoyCharacterAssets {
  constructor() {
    this.loader = new FBXLoader();
    this.base = null;
    this.clips = {};
  }

  async load() {
    const [fistRoot, kickRoot, jumpRoot, danceRoot] = await Promise.all([
      this.loader.loadAsync('/assets/boy-fist.fbx'),
      this.loader.loadAsync('/assets/boy-kick.fbx'),
      this.loader.loadAsync('/assets/boy-jump.fbx'),
      this.loader.loadAsync('/assets/boy-dance.fbx')
    ]);

    const base = fistRoot;
    const clips = {
      fist: fistRoot.animations?.[0] || null,
      kick: kickRoot.animations?.[0] || null,
      jump: jumpRoot.animations?.[0] || null,
      dance: danceRoot.animations?.[0] || null
    };
    if (!clips.fist || !clips.kick || !clips.jump || !clips.dance) {
      throw new Error('Boy FBX clips missing (fist/kick/jump/dance).');
    }

    base.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
      if (obj.material) {
        obj.material = Array.isArray(obj.material)
          ? obj.material.map((m) => {
            const copy = m.clone();
            if ('metalness' in copy) copy.metalness = 0.1;
            if ('roughness' in copy) copy.roughness = 0.85;
            return copy;
          })
          : (() => {
            const copy = obj.material.clone();
            if ('metalness' in copy) copy.metalness = 0.1;
            if ('roughness' in copy) copy.roughness = 0.85;
            return copy;
          })();
      }
    });

    const box = new THREE.Box3().setFromObject(base);
    const size = new THREE.Vector3();
    box.getSize(size);
    const rawHeight = Math.max(0.001, size.y);
    base.scale.setScalar(BOY_TARGET_HEIGHT / rawHeight);
    const scaled = new THREE.Box3().setFromObject(base);
    base.position.y -= scaled.min.y;

    this.base = base;
    this.clips = clips;
  }

  createInstance() {
    return cloneSkeleton(this.base);
  }
}

class BoyCharacterController {
  constructor(scene, assets) {
    this.scene = scene;
    this.assets = assets;
    this.root = assets.createInstance();
    this.scene.add(this.root);

    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {
      idle: this.mixer.clipAction(assets.clips.fist),
      walk: this.mixer.clipAction(assets.clips.kick),
      run: this.mixer.clipAction(assets.clips.jump),
      fist: this.mixer.clipAction(assets.clips.fist),
      kick: this.mixer.clipAction(assets.clips.kick),
      jump: this.mixer.clipAction(assets.clips.jump),
      dance: this.mixer.clipAction(assets.clips.dance)
    };

    this.actions.idle.play();
    this.actions.idle.timeScale = 0.35;
    this.actions.walk.play();
    this.actions.walk.timeScale = 0.7;
    this.actions.walk.enabled = false;
    this.actions.run.play();
    this.actions.run.timeScale = 1.2;
    this.actions.run.enabled = false;

    for (const key of ['fist', 'kick', 'jump', 'dance']) {
      this.actions[key].loop = THREE.LoopOnce;
      this.actions[key].clampWhenFinished = true;
      this.actions[key].enabled = false;
    }

    this.current = 'idle';
    this.move = { speed: 0, sprinting: false };
    this.attack = {
      active: false,
      type: null,
      startedAt: 0,
      hitApplied: false,
      queueType: null,
      lastStartAt: 0,
      holdType: null
    };
    this.dance = { active: false, startAt: 0, minUntil: 0, endAt: 0 };
    this.hitCallback = null;
  }

  destroy() {
    this.mixer.stopAllAction();
    this.scene.remove(this.root);
  }

  setTransform(x, y, z, rot) {
    this.root.position.set(x, y, z);
    this.root.rotation.y = rot;
  }

  setMoveState(speed, sprinting) {
    this.move.speed = speed;
    this.move.sprinting = sprinting;
  }

  fadeTo(name, duration = 0.18) {
    if (this.current === name) return;
    const prev = this.actions[this.current];
    const next = this.actions[name];
    if (!next) return;
    next.enabled = true;
    next.reset();
    next.play();
    if (prev) prev.crossFadeTo(next, duration, false);
    this.current = name;
  }

  isAttacking() {
    return this.attack.active;
  }

  isDancing() {
    return this.dance.active;
  }

  setHeldAttack(type) {
    this.attack.holdType = type;
    if (type && this.attack.active) this.attack.queueType = type;
  }

  startAttack(type, nowMs) {
    if (!type) return false;
    if (nowMs < this.attack.lastStartAt + MIN_ATTACK_INTERVAL * 1000) return false;
    this.attack.active = true;
    this.attack.type = type;
    this.attack.startedAt = nowMs;
    this.attack.lastStartAt = nowMs;
    this.attack.hitApplied = false;
    this.fadeTo(type, 0.12);
    return true;
  }

  triggerNetworkAttack(type, nowMs) {
    this.attack.lastStartAt = nowMs - MIN_ATTACK_INTERVAL * 1000;
    this.startAttack(type, nowMs);
  }

  requestAttack(type, nowMs) {
    if (this.dance.active) return null;
    if (!this.attack.active) {
      const started = this.startAttack(type, nowMs);
      return started ? type : null;
    }
    this.attack.queueType = type;
    return null;
  }

  tryStartDance(nowMs, durationMs = DANCE_DURATION) {
    if (this.dance.active) return false;
    this.dance.active = true;
    this.dance.startAt = nowMs;
    this.dance.minUntil = nowMs + 2000;
    this.dance.endAt = nowMs + durationMs;
    this.attack.active = false;
    this.attack.type = null;
    this.attack.queueType = null;
    this.fadeTo('dance', 0.2);
    return true;
  }

  stopDance(nowMs) {
    if (!this.dance.active) return;
    if (nowMs < this.dance.minUntil) return;
    this.dance.active = false;
    this.actions.dance.stop();
  }

  update(dtSec, nowMs, onHit) {
    const hitCb = onHit || this.hitCallback;
    if (this.dance.active) {
      if (nowMs >= this.dance.endAt) this.dance.active = false;
      if (!this.dance.active) this.actions.dance.stop();
    }

    if (!this.dance.active && this.attack.active) {
      const action = this.actions[this.attack.type];
      const clip = action.getClip();
      const t = ((nowMs - this.attack.startedAt) / 1000) / Math.max(0.001, clip.duration);
      const win = HIT_WINDOWS[this.attack.type];
      if (!this.attack.hitApplied && t >= win.start && t <= win.end) {
        this.attack.hitApplied = true;
        if (hitCb) hitCb(this.attack.type);
      }
      if (t >= 1) {
        const queued = this.attack.queueType || this.attack.holdType;
        this.attack.queueType = null;
        if (queued) {
          const started = this.startAttack(queued, nowMs + ATTACK_BLEND_GAP * 1000);
          if (started) return queued;
        }
        this.attack.active = false;
        this.attack.type = null;
      }
    }

    if (!this.dance.active && !this.attack.active) {
      const moving = this.move.speed > 0.1;
      if (!moving) this.fadeTo('idle', 0.2);
      else if (this.move.sprinting) this.fadeTo('run', 0.2);
      else this.fadeTo('walk', 0.2);
    }

    this.mixer.update(dtSec);
    return null;
  }
}

class ZombieEnemy {
  constructor(world, assets, id, mode) {
    this.world = world;
    this.assets = assets;
    this.id = id;
    this.mode = mode;

    this.root = this.assets.createInstance();
    this.root.position.set(0, getGroundedY(0, 0), 0);
    this.world.scene.add(this.root);

    this.mixer = new THREE.AnimationMixer(this.root);
    this.walkAction = this.mixer.clipAction(this.assets.walkClip);
    this.attackAction = this.mixer.clipAction(this.assets.attackClip);
    this.walkAction.loop = THREE.LoopRepeat;
    this.attackAction.loop = THREE.LoopOnce;
    this.attackAction.clampWhenFinished = true;
    this.walkAction.play();

    this.state = ZOMBIE_STATE.IDLE;
    this.stateSince = performance.now();

    this.x = 0;
    this.y = getGroundedY(0, 0);
    this.z = 0;
    this.rot = 0;
    this.vx = 0;
    this.vz = 0;
    this.hp = 50;

    this.netTarget = new THREE.Vector3(0, this.y, 0);
    this.netRot = 0;

    this.targetPlayerId = null;
    this.lastKnownTarget = { x: 0, z: 0 };
    this.lastKnownAt = 0;

    this.attackStartedAt = 0;
    this.attackHitsAt = 0;
    this.attackEndsAt = 0;
    this.attackHasHit = false;
    this.attackCooldownUntil = 0;
    this.stunUntil = 0;

    this.flashUntil = 0;
  }

  destroy() {
    this.mixer.stopAllAction();
    this.world.scene.remove(this.root);
  }

  setState(next, nowMs) {
    if (this.state === next) return;
    this.state = next;
    this.stateSince = nowMs;

    if (next === ZOMBIE_STATE.CHASE) {
      this.walkAction.enabled = true;
      this.walkAction.paused = false;
      this.walkAction.fadeIn(0.12).play();
      this.attackAction.stop();
    } else if (next === ZOMBIE_STATE.ATTACK) {
      this.walkAction.fadeOut(0.08);
      this.attackAction.reset();
      this.attackAction.enabled = true;
      this.attackAction.play();
    } else {
      this.walkAction.paused = true;
      if (next !== ZOMBIE_STATE.ATTACK) this.attackAction.stop();
    }
  }

  triggerAttackFromServer(startTime, durationMs) {
    this.attackStartedAt = startTime;
    this.attackHitsAt = startTime + durationMs * 0.35;
    this.attackEndsAt = startTime + durationMs;
    this.attackHasHit = false;
    this.setState(ZOMBIE_STATE.ATTACK, performance.now());
  }

  applySnapshot(snapshot, nowMs) {
    this.hp = snapshot.hp;
    this.flashUntil = snapshot.flash ? nowMs + 90 : this.flashUntil;
    this.netTarget.set(snapshot.x, snapshot.y, snapshot.z);
    this.netRot = snapshot.rot || 0;
    if (snapshot.state) this.setState(snapshot.state, nowMs);
  }

  applyDamage(amount, nowMs, sourceRot) {
    this.hp -= amount;
    this.flashUntil = nowMs + 120;
    this.stunUntil = nowMs + STUN_MS;
    this.setState(ZOMBIE_STATE.STUN, nowMs);
    this.vx += Math.sin(sourceRot) * 3.3;
    this.vz += Math.cos(sourceRot) * 3.3;
  }

  chooseTarget(players, nowMs) {
    let best = null;
    let bestD2 = Infinity;

    for (const p of players) {
      if (!p.alive) continue;
      const d2v = dist2(this, p);
      if (d2v > VISION_RADIUS * VISION_RADIUS) continue;

      const yawToPlayer = Math.atan2(p.x - this.x, p.z - this.z);
      const delta = Math.abs(normalizeAngle(yawToPlayer - this.rot));
      if (delta > (Math.PI * 2) / 3) continue;

      if (d2v < bestD2) {
        bestD2 = d2v;
        best = p;
      }
    }

    if (best) {
      this.targetPlayerId = best.id;
      this.lastKnownTarget = { x: best.x, z: best.z };
      this.lastKnownAt = nowMs;
    }

    return best;
  }

  applySeparation(zombies, dtSec) {
    let steerX = 0;
    let steerZ = 0;
    const separationRadius = 1.25;

    for (const other of zombies) {
      if (other === this || other.hp <= 0) continue;
      const dx = this.x - other.x;
      const dz = this.z - other.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > separationRadius) continue;
      const strength = (separationRadius - d) / separationRadius;
      steerX += (dx / d) * strength * 4;
      steerZ += (dz / d) * strength * 4;
    }

    this.vx += steerX * dtSec;
    this.vz += steerZ * dtSec;
  }

  updateSinglePlayer(dtSec, nowMs, context) {
    if (this.hp <= 0) return;

    const player = context.player;
    const visible = this.chooseTarget([player], nowMs);
    const target = visible || (this.targetPlayerId === player.id ? player : null);

    if (this.state === ZOMBIE_STATE.STUN && nowMs >= this.stunUntil) {
      this.setState(ZOMBIE_STATE.IDLE, nowMs);
    }

    if (this.state === ZOMBIE_STATE.ATTACK) {
      const dx = player.x - this.x;
      const dz = player.z - this.z;
      const yawToTarget = Math.atan2(dx, dz);
      this.rot = normalizeAngle(this.rot + normalizeAngle(yawToTarget - this.rot) * Math.min(1, TURN_SPEED * dtSec));

      if (!this.attackHasHit && nowMs >= this.attackHitsAt && nowMs <= this.attackEndsAt) {
        if (dist2(this, player) <= ZOMBIE_ATTACK_RANGE * ZOMBIE_ATTACK_RANGE * 1.3) {
          this.attackHasHit = true;
          context.onAttackHit(this, player);
        }
      }

      if (nowMs >= this.attackEndsAt) {
        this.setState(ZOMBIE_STATE.CHASE, nowMs);
      }

      this.vx *= Math.exp(-ZOMBIE_DAMPING * dtSec);
      this.vz *= Math.exp(-ZOMBIE_DAMPING * dtSec);
      this.integrate(dtSec, context.zombies);
      return;
    }

    let desiredX = 0;
    let desiredZ = 0;
    let shouldChase = false;
    let targetDist = Infinity;

    if (target && target.alive) {
      const dx = target.x - this.x;
      const dz = target.z - this.z;
      targetDist = Math.hypot(dx, dz) || 0.0001;
      desiredX = dx;
      desiredZ = dz;
      shouldChase = true;
      this.lastKnownTarget = { x: target.x, z: target.z };
      this.lastKnownAt = nowMs;

      if (targetDist <= ZOMBIE_ATTACK_RANGE && nowMs >= this.attackCooldownUntil && this.state !== ZOMBIE_STATE.STUN) {
        this.setState(ZOMBIE_STATE.ATTACK, nowMs);
        this.attackStartedAt = nowMs;
        this.attackHitsAt = nowMs + ATTACK_ANIM_MS * 0.35;
        this.attackEndsAt = nowMs + ATTACK_ANIM_MS;
        this.attackHasHit = false;
        this.attackCooldownUntil = nowMs + ZOMBIE_ATTACK_COOLDOWN;
        return;
      }
    } else if (nowMs - this.lastKnownAt < 1500) {
      desiredX = this.lastKnownTarget.x - this.x;
      desiredZ = this.lastKnownTarget.z - this.z;
      shouldChase = true;
    }

    if (this.state !== ZOMBIE_STATE.STUN) {
      this.setState(shouldChase ? ZOMBIE_STATE.CHASE : ZOMBIE_STATE.IDLE, nowMs);
    }

    if (this.state === ZOMBIE_STATE.CHASE) {
      const d = Math.hypot(desiredX, desiredZ) || 1;
      const dirX = desiredX / d;
      const dirZ = desiredZ / d;
      const arriveFactor = clamp(d / ARRIVE_RADIUS, 0.25, 1);
      const speed = lerp(ZOMBIE_WALK_SPEED, ZOMBIE_MAX_SPEED, clamp(context.difficultyLevel / 8, 0, 1)) * arriveFactor;
      const targetVx = dirX * speed;
      const targetVz = dirZ * speed;

      this.vx += (targetVx - this.vx) * Math.min(1, ZOMBIE_ACCEL * dtSec);
      this.vz += (targetVz - this.vz) * Math.min(1, ZOMBIE_ACCEL * dtSec);

      const yawToTarget = Math.atan2(dirX, dirZ);
      this.rot = normalizeAngle(this.rot + normalizeAngle(yawToTarget - this.rot) * Math.min(1, TURN_SPEED * dtSec));
    } else {
      this.vx *= Math.exp(-ZOMBIE_DAMPING * dtSec);
      this.vz *= Math.exp(-ZOMBIE_DAMPING * dtSec);
      this.rot = normalizeAngle(this.rot + Math.sin((nowMs - this.stateSince) * 0.002 + this.id) * 0.02);
    }

    this.integrate(dtSec, context.zombies);
  }

  integrate(dtSec, zombies) {
    this.applySeparation(zombies, dtSec);

    const speed = Math.hypot(this.vx, this.vz);
    const maxSpeed = ZOMBIE_MAX_SPEED + 0.7;
    if (speed > maxSpeed) {
      this.vx = (this.vx / speed) * maxSpeed;
      this.vz = (this.vz / speed) * maxSpeed;
    }

    const nx = this.x + this.vx * dtSec;
    const nz = this.z + this.vz * dtSec;

    if (canMoveCapsule(nx, this.z)) this.x = nx;
    else this.vx *= -0.22;

    if (canMoveCapsule(this.x, nz)) this.z = nz;
    else this.vz *= -0.22;

    this.y = getGroundedY(this.x, this.z);
  }

  updateVisual(dtSec, nowMs, interpolate) {
    if (interpolate) {
      this.x += (this.netTarget.x - this.x) * clamp(dtSec * 10, 0, 1);
      this.y += (this.netTarget.y - this.y) * clamp(dtSec * 10, 0, 1);
      this.z += (this.netTarget.z - this.z) * clamp(dtSec * 10, 0, 1);
      const deltaRot = normalizeAngle(this.netRot - this.rot);
      this.rot = normalizeAngle(this.rot + deltaRot * clamp(dtSec * 10, 0, 1));
    }

    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.rot;

    if (this.flashUntil > nowMs) {
      this.root.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.material.emissive = obj.material.emissive || new THREE.Color(0x000000);
        obj.material.emissive.setHex(0x662222);
      });
    } else {
      this.root.traverse((obj) => {
        if (!obj.isMesh || !obj.material.emissive) return;
        obj.material.emissive.setHex(0x000000);
      });
    }

    this.mixer.update(dtSec);
  }

  toSnapshot() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      z: this.z,
      rot: this.rot,
      hp: this.hp,
      state: this.state,
      flash: this.flashUntil > performance.now()
    };
  }
}

class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    this.up = false;
    this.down = false;
    this.left = false;
    this.right = false;
    this.sprint = false;
    this.attackQueued = false;
    this.attackPresses = 0;
    this.attackHeld = false;
    this.boyAttackHeld = { fist: false, kick: false, jump: false };
    this.boyAttackPresses = [];
    this.enabled = false;
    this.cameraOrbit = { yaw: 0, pitch: 0.45, distance: 10 };

    document.addEventListener('keydown', (e) => {
      if (e.code === 'ArrowUp') this.up = true;
      if (e.code === 'ArrowDown') this.down = true;
      if (e.code === 'ArrowLeft') this.left = true;
      if (e.code === 'ArrowRight') this.right = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprint = true;
      if (e.code === 'Space') {
        this.attackQueued = true;
        this.attackPresses += 1;
        this.attackHeld = true;
      }
      if (e.code === 'KeyJ') {
        this.boyAttackHeld.fist = true;
        this.boyAttackPresses.push('fist');
      }
      if (e.code === 'KeyK') {
        this.boyAttackHeld.kick = true;
        this.boyAttackPresses.push('kick');
      }
      if (e.code === 'KeyL') {
        this.boyAttackHeld.jump = true;
        this.boyAttackPresses.push('jump');
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowUp') this.up = false;
      if (e.code === 'ArrowDown') this.down = false;
      if (e.code === 'ArrowLeft') this.left = false;
      if (e.code === 'ArrowRight') this.right = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.sprint = false;
      if (e.code === 'Space') this.attackHeld = false;
      if (e.code === 'KeyJ') this.boyAttackHeld.fist = false;
      if (e.code === 'KeyK') this.boyAttackHeld.kick = false;
      if (e.code === 'KeyL') this.boyAttackHeld.jump = false;
    });

    this.canvas.addEventListener('click', () => {
      if (this.enabled && document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock();
    });

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.cameraOrbit.yaw -= e.movementX * 0.003;
      this.cameraOrbit.pitch = clamp(this.cameraOrbit.pitch - e.movementY * 0.003, 0.15, 1.2);
    });
  }

  consumeAttack() {
    const value = this.attackQueued;
    this.attackQueued = false;
    return value;
  }

  consumeAttackPress() {
    if (this.attackPresses <= 0) return false;
    this.attackPresses -= 1;
    return true;
  }

  snapshot() {
    return {
      up: this.up,
      down: this.down,
      left: this.left,
      right: this.right,
      sprint: this.sprint,
      attack: this.attackQueued || this.attackHeld || this.boyAttackHeld.fist || this.boyAttackHeld.kick || this.boyAttackHeld.jump,
      yaw: this.cameraOrbit.yaw
    };
  }

  consumeBoyAttackPress() {
    return this.boyAttackPresses.shift() || null;
  }

  latestBoyHeldAttack() {
    for (let i = this.boyAttackPresses.length - 1; i >= 0; i -= 1) {
      const k = this.boyAttackPresses[i];
      if (this.boyAttackHeld[k]) return k;
    }
    if (this.boyAttackHeld.jump) return 'jump';
    if (this.boyAttackHeld.kick) return 'kick';
    if (this.boyAttackHeld.fist) return 'fist';
    return null;
  }
}

class ChunkManager {
  constructor(scene, geo, mats) {
    this.scene = scene;
    this.geo = geo;
    this.mats = mats;
    this.seed = ACTIVE_WORLD_SEED;
    this.chunks = new Map();
    this.pending = [];
    this.chunkGroup = new THREE.Group();
    this.scene.add(this.chunkGroup);
    this.tmpMatrix = new THREE.Matrix4();
    this.tmpQuat = new THREE.Quaternion();
    this.tmpScale = new THREE.Vector3(1, 1, 1);
  }

  setSeed(seed) {
    if (!Number.isFinite(seed) || seed === this.seed) return;
    this.seed = seed >>> 0;
    ACTIVE_WORLD_SEED = this.seed;
    this.reset();
  }

  reset() {
    for (const chunk of this.chunks.values()) {
      this.chunkGroup.remove(chunk.group);
    }
    this.chunks.clear();
    this.pending.length = 0;
  }

  key(cx, cz) {
    return `${cx},${cz}`;
  }

  update(playerPos) {
    if (!playerPos) return;
    const centerCx = Math.floor(playerPos.x / CHUNK_SIZE);
    const centerCz = Math.floor(playerPos.z / CHUNK_SIZE);
    const needed = new Set();

    for (let dz = -VIEW_DISTANCE; dz <= VIEW_DISTANCE; dz += 1) {
      for (let dx = -VIEW_DISTANCE; dx <= VIEW_DISTANCE; dx += 1) {
        const cx = centerCx + dx;
        const cz = centerCz + dz;
        const k = this.key(cx, cz);
        needed.add(k);
        if (!this.chunks.has(k) && !this.pending.some((p) => p.k === k)) {
          this.pending.push({ cx, cz, k, d2: dx * dx + dz * dz });
        }
      }
    }

    for (const [k, chunk] of this.chunks.entries()) {
      if (!needed.has(k)) {
        this.chunkGroup.remove(chunk.group);
        this.chunks.delete(k);
      }
    }

    this.pending.sort((a, b) => a.d2 - b.d2);
    const perFrame = 2;
    for (let i = 0; i < perFrame && this.pending.length > 0; i += 1) {
      const next = this.pending.shift();
      if (this.chunks.has(next.k)) continue;
      const chunk = this.generateChunk(next.cx, next.cz);
      this.chunks.set(next.k, chunk);
      this.chunkGroup.add(chunk.group);
    }
  }

  makeInstanced(geometry, material, positions, castsShadow = true, receivesShadow = true) {
    if (!positions.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
    mesh.castShadow = castsShadow;
    mesh.receiveShadow = receivesShadow;
    for (let i = 0; i < positions.length; i += 1) {
      const p = positions[i];
      this.tmpQuat.setFromEuler(new THREE.Euler(0, p.ry || 0, 0));
      this.tmpScale.set(p.sx || 1, p.sy || 1, p.sz || 1);
      this.tmpMatrix.compose(new THREE.Vector3(p.x, p.y, p.z), this.tmpQuat, this.tmpScale);
      mesh.setMatrixAt(i, this.tmpMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  buildTree(baseX, baseY, baseZ, out) {
    const hVar = hash2(this.seed ^ 11, baseX, baseZ);
    const trunkH = 3 + Math.floor(hVar * 3);
    for (let t = 0; t < trunkH; t += 1) {
      out.trunk.push({ x: baseX, y: baseY + 0.5 + t, z: baseZ });
    }

    const topY = baseY + trunkH;
    const radius = 1 + Math.floor(hash2(this.seed ^ 19, baseX, baseZ) * 2);
    for (let lx = -radius; lx <= radius; lx += 1) {
      for (let lz = -radius; lz <= radius; lz += 1) {
        for (let ly = 0; ly <= 2; ly += 1) {
          const d = Math.abs(lx) + Math.abs(lz) + ly * 0.7;
          if (d > radius + 0.8) continue;
          out.leaves.push({ x: baseX + lx, y: topY + 0.5 + ly, z: baseZ + lz });
        }
      }
    }
  }

  buildRockCluster(baseX, baseY, baseZ, out) {
    const count = 3 + Math.floor(hash2(this.seed ^ 31, baseX, baseZ) * 4);
    for (let i = 0; i < count; i += 1) {
      const ox = Math.floor(hash2(this.seed ^ (77 + i), baseX + i, baseZ) * 3) - 1;
      const oz = Math.floor(hash2(this.seed ^ (121 + i), baseX, baseZ + i) * 3) - 1;
      const sy = 0.5 + hash2(this.seed ^ (151 + i), baseX, baseZ) * 0.7;
      out.rock.push({ x: baseX + ox, y: baseY + sy * 0.5, z: baseZ + oz, sx: 0.8, sy, sz: 0.8 });
    }
  }

  generateChunk(cx, cz) {
    const group = new THREE.Group();
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    const buckets = {
      grass: [],
      dirt: [],
      stone: [],
      sand: [],
      snow: [],
      trunk: [],
      leaves: [],
      rock: [],
      grassDetail: [],
      flowers: []
    };

    const waterNeeded = { value: false };

    for (let lx = 0; lx < CHUNK_SIZE; lx += 1) {
      for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
        const x = baseX + lx;
        const z = baseZ + lz;
        const h = terrainHeightWithSeed(this.seed, x, z);
        const moisture = moistureAt(this.seed, x, z);
        const slope = Math.abs(
          terrainHeightWithSeed(this.seed, x + 1, z) -
          terrainHeightWithSeed(this.seed, x - 1, z)
        ) + Math.abs(
          terrainHeightWithSeed(this.seed, x, z + 1) -
          terrainHeightWithSeed(this.seed, x, z - 1)
        );

        const topY = h + 0.5;
        const nearWater = h <= WATER_LEVEL + 1;
        const isMountain = h >= SNOW_LINE - 3;
        const topType = h >= SNOW_LINE
          ? 'snow'
          : nearWater
            ? 'sand'
            : slope > 4 || isMountain
              ? 'stone'
              : 'grass';

        buckets[topType].push({ x, y: topY, z });
        for (let d = 1; d <= 3; d += 1) {
          const yy = h - d + 0.5;
          const underType = (h - d <= WATER_LEVEL - 2 || slope > 4 || h > SNOW_LINE - 2) ? 'stone' : 'dirt';
          buckets[underType].push({ x, y: yy, z });
        }

        if (h < WATER_LEVEL) waterNeeded.value = true;

        const floraRnd = hash2(this.seed ^ 211, x, z);
        if (topType === 'grass' && h > WATER_LEVEL + 1 && slope < 3) {
          if (floraRnd > 0.76) {
            buckets.grassDetail.push({
              x: x + (hash2(this.seed ^ 301, x, z) - 0.5) * 0.45,
              y: h + 0.2,
              z: z + (hash2(this.seed ^ 347, x, z) - 0.5) * 0.45,
              sx: 0.08,
              sy: 0.5 + hash2(this.seed ^ 401, x, z) * 0.3,
              sz: 0.08
            });
          }
          if (floraRnd > 0.965) {
            buckets.flowers.push({
              x: x + (hash2(this.seed ^ 433, x, z) - 0.5) * 0.3,
              y: h + 0.15,
              z: z + (hash2(this.seed ^ 467, x, z) - 0.5) * 0.3,
              sx: 0.18,
              sy: 0.18,
              sz: 0.18
            });
          }
        }

        const treeRnd = hash2(this.seed ^ 521, x, z);
        if (topType === 'grass' && h > WATER_LEVEL + 1 && slope < 2.5 && moisture > 0.44 && treeRnd > 0.988) {
          this.buildTree(x, h + 1, z, buckets);
        }

        const rockRnd = hash2(this.seed ^ 613, x, z);
        if ((topType === 'stone' || topType === 'snow') && slope > 2.5 && rockRnd > 0.986) {
          this.buildRockCluster(x, h + 1, z, buckets);
        }
      }
    }

    const meshes = [
      this.makeInstanced(this.geo.block, this.mats.grass, buckets.grass),
      this.makeInstanced(this.geo.block, this.mats.dirt, buckets.dirt),
      this.makeInstanced(this.geo.block, this.mats.stone, buckets.stone),
      this.makeInstanced(this.geo.block, this.mats.sand, buckets.sand),
      this.makeInstanced(this.geo.block, this.mats.snow, buckets.snow),
      this.makeInstanced(this.geo.block, this.mats.trunk, buckets.trunk),
      this.makeInstanced(this.geo.block, this.mats.leaves, buckets.leaves),
      this.makeInstanced(this.geo.block, this.mats.rock, buckets.rock),
      this.makeInstanced(this.geo.blade, this.mats.grassBlade, buckets.grassDetail, false, false),
      this.makeInstanced(this.geo.block, this.mats.flower, buckets.flowers, false, true)
    ].filter(Boolean);

    for (const mesh of meshes) group.add(mesh);

    if (waterNeeded.value) {
      const water = new THREE.Mesh(this.geo.waterPlane, this.mats.water);
      water.position.set(baseX + CHUNK_SIZE * 0.5 - 0.5, WATER_LEVEL + 0.03, baseZ + CHUNK_SIZE * 0.5 - 0.5);
      water.rotation.x = -Math.PI / 2;
      water.receiveShadow = true;
      group.add(water);
    }

    return { cx, cz, group };
  }
}

class WorldRenderer {
  constructor(canvas, input, zombieAssets, girlAssets, boyAssets) {
    this.input = input;
    this.zombieAssets = zombieAssets;
    this.girlAssets = girlAssets;
    this.boyAssets = boyAssets;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#7fb2ff');
    this.scene.fog = new THREE.Fog('#9ac0ff', 70, 260);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 250);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.scene.add(new THREE.HemisphereLight(0xd4e8ff, 0x4a5a3a, 0.9));
    const sun = new THREE.DirectionalLight(0xfff3d3, 1.08);
    sun.position.set(120, 180, 90);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 500;
    sun.shadow.camera.left = -180;
    sun.shadow.camera.right = 180;
    sun.shadow.camera.top = 180;
    sun.shadow.camera.bottom = -180;
    this.scene.add(sun);

    this.geo = {
      block: new THREE.BoxGeometry(1, 1, 1),
      blade: new THREE.BoxGeometry(1, 1, 1),
      waterPlane: new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE),
      body: new THREE.BoxGeometry(0.9, 1.1, 0.6),
      head: new THREE.BoxGeometry(0.65, 0.65, 0.65),
      heart: new THREE.BoxGeometry(0.35, 0.35, 0.35),
      spark: new THREE.SphereGeometry(0.08, 5, 5)
    };

    this.mats = {
      grass: new THREE.MeshLambertMaterial({ color: '#4f9e45' }),
      dirt: new THREE.MeshLambertMaterial({ color: '#7e5a3a' }),
      stone: new THREE.MeshLambertMaterial({ color: '#7d8388' }),
      sand: new THREE.MeshLambertMaterial({ color: '#c9b274' }),
      snow: new THREE.MeshLambertMaterial({ color: '#eef4ff' }),
      trunk: new THREE.MeshLambertMaterial({ color: '#8b5a3c' }),
      leaves: new THREE.MeshLambertMaterial({ color: '#3b7f44' }),
      rock: new THREE.MeshLambertMaterial({ color: '#8f9499' }),
      water: new THREE.MeshPhongMaterial({ color: '#4ea7d8', transparent: true, opacity: 0.58 }),
      grassBlade: new THREE.MeshLambertMaterial({ color: '#5abf4b' }),
      flower: new THREE.MeshLambertMaterial({ color: '#f7cc5d' }),
      heart: new THREE.MeshLambertMaterial({ color: '#ff5c89', emissive: '#7e1f3f' }),
      boy: new THREE.MeshLambertMaterial({ color: '#4f86ff' }),
      girl: new THREE.MeshLambertMaterial({ color: '#ff8bb0' }),
      skin: new THREE.MeshLambertMaterial({ color: '#f2cfb1' }),
      white: new THREE.MeshLambertMaterial({ color: '#f3f7ff' })
    };

    this.players = new Map();
    this.zombies = new Map();
    this.hearts = new Map();
    this.effects = [];
    this.localPlayerId = null;
    this.chunkManager = new ChunkManager(this.scene, this.geo, this.mats);
    this.setWorldSeed(ACTIVE_WORLD_SEED);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  addBlock(x, y, z, material, parent = this.scene) {
    const mesh = new THREE.Mesh(this.geo.block, material);
    mesh.position.set(x, y + 0.5, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  setWorldSeed(seed) {
    ACTIVE_WORLD_SEED = seed >>> 0;
    this.chunkManager.setSeed(ACTIVE_WORLD_SEED);
  }

  resetDynamic() {
    for (const entry of this.players.values()) {
      if (entry.girlController) entry.girlController.destroy();
      else if (entry.boyController) entry.boyController.destroy();
      else this.scene.remove(entry.mesh);
    }
    for (const zombie of this.zombies.values()) zombie.destroy();
    for (const entry of this.hearts.values()) this.scene.remove(entry.mesh);
    for (const effect of this.effects) this.scene.remove(effect.mesh);

    this.players.clear();
    this.zombies.clear();
    this.hearts.clear();
    this.effects = [];
    this.localPlayerId = null;
  }

  createPlayerMesh(character, isLocal = false) {
    if (character === 'girl' && this.girlAssets) {
      const controller = new GirlCharacterController(this.scene, this.girlAssets, isLocal);
      return { mesh: controller.root, girlController: controller, boyController: null };
    }
    if (character === 'boy' && this.boyAssets) {
      const controller = new BoyCharacterController(this.scene, this.boyAssets);
      return { mesh: controller.root, girlController: null, boyController: controller };
    }
    const root = new THREE.Group();
    const body = new THREE.Mesh(this.geo.body, character === 'girl' ? this.mats.girl : this.mats.boy);
    const head = new THREE.Mesh(this.geo.head, this.mats.skin);
    const feetL = new THREE.Mesh(this.geo.block, this.mats.white);
    const feetR = new THREE.Mesh(this.geo.block, this.mats.white);

    body.position.y = 0.65;
    head.position.y = 1.45;
    feetL.scale.set(0.3, 0.35, 0.45);
    feetR.scale.set(0.3, 0.35, 0.45);
    feetL.position.set(-0.18, 0.18, 0);
    feetR.position.set(0.18, 0.18, 0);

    root.add(body, head, feetL, feetR);
    this.scene.add(root);
    return { mesh: root, girlController: null, boyController: null };
  }

  createZombie(id, mode) {
    const zombie = new ZombieEnemy(this, this.zombieAssets, id, mode);
    this.zombies.set(id, zombie);
    return zombie;
  }

  createHeartMesh() {
    const root = new THREE.Group();
    const a = new THREE.Mesh(this.geo.heart, this.mats.heart);
    const b = new THREE.Mesh(this.geo.heart, this.mats.heart);
    const c = new THREE.Mesh(this.geo.heart, this.mats.heart);
    a.position.set(-0.2, 0, 0);
    b.position.set(0.2, 0, 0);
    c.position.set(0, -0.25, 0);
    c.scale.set(1.1, 1.4, 1);
    root.add(a, b, c);
    this.scene.add(root);
    return root;
  }

  applyPlayers(playersState, localPlayerId) {
    this.localPlayerId = localPlayerId;
    const playerIds = new Set();

    for (const p of playersState) {
      playerIds.add(p.id);
      if (!this.players.has(p.id)) {
        const created = this.createPlayerMesh(p.character || 'boy', p.id === localPlayerId);
        this.players.set(p.id, {
          mesh: created.mesh,
          girlController: created.girlController,
          boyController: created.boyController,
          character: p.character || 'boy',
          target: new THREE.Vector3(p.x, p.y, p.z),
          from: new THREE.Vector3(p.x, p.y, p.z),
          renderPos: new THREE.Vector3(p.x, p.y, p.z),
          interpT: 1,
          rot: p.rot || 0,
          fromRot: p.rot || 0,
          toRot: p.rot || 0,
          moveSpeed: 0,
          sprinting: false,
          damageFlash: false
        });
      }
      const ent = this.players.get(p.id);
      ent.from.copy(ent.renderPos);
      ent.target.set(p.x, p.y, p.z);
      ent.fromRot = ent.rot;
      ent.toRot = p.rot || 0;
      ent.interpT = 0;
      ent.moveSpeed = p.moveSpeed || 0;
      ent.sprinting = !!p.sprinting;
      ent.damageFlash = !!p.damageFlash;
    }

    for (const [id, ent] of this.players.entries()) {
      if (!playerIds.has(id)) {
        if (ent.girlController) ent.girlController.destroy();
        if (ent.boyController) ent.boyController.destroy();
        this.scene.remove(ent.mesh);
        this.players.delete(id);
      }
    }
  }

  applyZombieSnapshots(zombiesState, nowMs, mode) {
    const zombieIds = new Set();
    for (const snapshot of zombiesState) {
      zombieIds.add(snapshot.id);
      if (!this.zombies.has(snapshot.id)) this.createZombie(snapshot.id, mode);
      const zombie = this.zombies.get(snapshot.id);
      zombie.applySnapshot(snapshot, nowMs);
    }

    for (const [id, zombie] of this.zombies.entries()) {
      if (!zombieIds.has(id)) {
        zombie.destroy();
        this.zombies.delete(id);
      }
    }
  }

  applyHearts(heartsState) {
    const heartIds = new Set();

    for (const h of heartsState) {
      heartIds.add(h.id);
      if (!this.hearts.has(h.id)) {
        this.hearts.set(h.id, {
          mesh: this.createHeartMesh(),
          target: new THREE.Vector3(h.x, h.y, h.z)
        });
      }
      this.hearts.get(h.id).target.set(h.x, h.y, h.z);
    }

    for (const [id, ent] of this.hearts.entries()) {
      if (!heartIds.has(id)) {
        this.scene.remove(ent.mesh);
        this.hearts.delete(id);
      }
    }
  }

  syncPlayerFromSimulation(player) {
    this.applyPlayers([{
      id: player.id,
      character: player.character,
      x: player.x,
      y: player.y,
      z: player.z,
      rot: player.rot,
      moveSpeed: Math.hypot(player.vx || 0, player.vz || 0),
      sprinting: !!player.sprinting,
      damageFlash: player.damageFlashUntil > performance.now()
    }], player.id);
  }

  getGirlController(playerId) {
    const ent = this.players.get(playerId);
    return ent?.girlController || null;
  }

  getBoyController(playerId) {
    const ent = this.players.get(playerId);
    return ent?.boyController || null;
  }

  playGirlAttack(playerId, step, atMs) {
    const controller = this.getGirlController(playerId);
    if (!controller) return;
    controller.triggerNetworkStep(step === 'kick' ? 'kick' : 'punch', atMs || performance.now());
  }

  playBoyAttack(playerId, attackType, atMs) {
    const controller = this.getBoyController(playerId);
    if (!controller) return;
    controller.triggerNetworkAttack(attackType, atMs || performance.now());
  }

  playBoyDance(playerId, atMs, durationMs) {
    const controller = this.getBoyController(playerId);
    if (!controller) return;
    controller.tryStartDance(atMs || performance.now(), durationMs || DANCE_DURATION);
  }

  syncSingleZombies(zombies) {
    const snapshots = zombies.map((z) => z.toSnapshot());
    this.applyZombieSnapshots(snapshots, performance.now(), 'single');
  }

  spawnCelebration(accepted) {
    const count = accepted ? 180 : 80;
    for (let i = 0; i < count; i += 1) {
      const hue = accepted ? Math.random() : 0.58;
      const color = new THREE.Color().setHSL(hue, 0.9, accepted ? 0.62 : 0.42);
      const mesh = new THREE.Mesh(this.geo.spark, new THREE.MeshBasicMaterial({ color }));
      mesh.position.set((Math.random() - 0.5) * 16, 2 + Math.random() * 8, (Math.random() - 0.5) * 16);
      this.scene.add(mesh);
      this.effects.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.22, Math.random() * 0.25, (Math.random() - 0.5) * 0.22),
        life: 1.8 + Math.random() * 1.5
      });
    }
  }

  spawnHitBurst(x, y, z) {
    for (let i = 0; i < 8; i += 1) {
      const color = new THREE.Color().setHSL(0.03 + Math.random() * 0.05, 0.9, 0.6);
      const mesh = new THREE.Mesh(this.geo.spark, new THREE.MeshBasicMaterial({ color }));
      mesh.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
      this.scene.add(mesh);
      this.effects.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.1 + Math.random() * 0.1, (Math.random() - 0.5) * 0.15),
        life: 0.25 + Math.random() * 0.2
      });
    }
  }

  update(dtSec, timeSec, mode) {
    for (const ent of this.players.values()) {
      if (mode === 'multiplayer') {
        ent.interpT = clamp(ent.interpT + dtSec / 0.05, 0, 1);
        ent.renderPos.lerpVectors(ent.from, ent.target, ent.interpT);
        const rDelta = normalizeAngle(ent.toRot - ent.fromRot);
        ent.rot = normalizeAngle(ent.fromRot + rDelta * ent.interpT);
        ent.mesh.position.copy(ent.renderPos);
      } else {
        ent.renderPos.copy(ent.target);
        ent.rot = ent.toRot;
        ent.mesh.position.copy(ent.target);
      }
      ent.mesh.rotation.y = ent.rot;
      if (ent.girlController) {
        ent.girlController.setMoveState(ent.moveSpeed, ent.sprinting);
      }
      if (ent.boyController) {
        ent.boyController.setMoveState(ent.moveSpeed, ent.sprinting);
      }
    }

    const nowMs = performance.now();
    for (const zombie of this.zombies.values()) {
      zombie.updateVisual(dtSec, nowMs, mode === 'multiplayer');
    }

    for (const ent of this.players.values()) {
      if (ent.girlController) {
        ent.girlController.update(dtSec, nowMs);
      }
      if (ent.boyController) {
        ent.boyController.update(dtSec, nowMs);
      }
    }

    for (const ent of this.hearts.values()) {
      ent.mesh.position.lerp(ent.target, 0.3);
      const pulse = 1 + Math.sin(timeSec * 6 + ent.mesh.position.x) * 0.12;
      ent.mesh.scale.setScalar(pulse);
      ent.mesh.position.y = ent.target.y + 0.2 + Math.sin(timeSec * 4 + ent.mesh.position.z) * 0.15;
      ent.mesh.rotation.y += 0.02;
    }

    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i];
      effect.life -= dtSec;
      if (effect.life <= 0) {
        this.scene.remove(effect.mesh);
        this.effects.splice(i, 1);
        continue;
      }
      effect.vel.y -= 0.15 * dtSec;
      effect.mesh.position.addScaledVector(effect.vel, dtSec * 60);
    }

    const local = this.players.get(this.localPlayerId);
    if (local) {
      this.chunkManager.update(local.mesh.position);
    }

    this.updateCamera(dtSec);
    this.renderer.render(this.scene, this.camera);
  }

  updateCamera(dtSec) {
    const me = this.players.get(this.localPlayerId);
    if (!me) return;

    const target = me.mesh.position.clone();
    target.y += 1.6;
    const orbit = this.input.cameraOrbit;
    const dir = new THREE.Vector3(
      Math.sin(orbit.yaw) * Math.cos(orbit.pitch),
      Math.sin(orbit.pitch),
      Math.cos(orbit.yaw) * Math.cos(orbit.pitch)
    );
    const desired = target.clone().addScaledVector(dir, orbit.distance);
    const lerpFactor = 1 - Math.pow(0.002, dtSec);
    this.camera.position.lerp(desired, lerpFactor);
    this.camera.lookAt(target);
  }
}

class HitFeedback {
  constructor() {
    this.flash = document.createElement('div');
    this.flash.style.position = 'fixed';
    this.flash.style.inset = '0';
    this.flash.style.pointerEvents = 'none';
    this.flash.style.background = 'rgba(255,30,30,0)';
    this.flash.style.transition = 'background 90ms linear';
    this.flash.style.zIndex = '25';
    document.body.appendChild(this.flash);
    this.intensity = 0;
  }

  trigger() {
    this.intensity = 0.45;
  }

  update(dtSec) {
    this.intensity = Math.max(0, this.intensity - dtSec * 2.8);
    this.flash.style.background = `rgba(255,30,30,${this.intensity})`;
  }
}

class SinglePlayerSession {
  constructor(world, input, feedback) {
    this.world = world;
    this.input = input;
    this.feedback = feedback;
    this.running = true;
    this.localPlayerId = 1;

    this.player = {
      id: 1,
      character: ui.characterSelect.value,
      x: 0,
      z: 0,
      y: terrainHeight(0, 0) + 1.2,
      rot: 0,
      vx: 0,
      vz: 0,
      hp: PLAYER_MAX_HP,
      alive: true,
      attackCooldownUntil: 0,
      damageFlashUntil: 0
    };
    this.player.sprinting = false;

    this.timerMs = 0;
    this.nextZombieSpawnAt = 3000;
    this.difficultyLevel = 0;
    this.zombies = [];
    this.nextZombieId = 1;
    this.kills = 0;

    this.world.syncPlayerFromSimulation(this.player);
    this.girlController = this.player.character === 'girl' ? this.world.getGirlController(this.player.id) : null;
    this.boyController = this.player.character === 'boy' ? this.world.getBoyController(this.player.id) : null;
    if (this.girlController) {
      this.girlController.hitCallback = (step) => this.applyGirlHit(step);
    }
    if (this.boyController) {
      this.boyController.hitCallback = (type) => this.applyBoyHit(type);
    }
  }

  spawnZombie(force = false) {
    const max = computeMaxZombies(this.difficultyLevel);
    if (!force && this.zombies.length >= max) return;

    const pos = randomSpawnAroundPlayer(this.player);
    const zombie = this.world.createZombie(this.nextZombieId++, 'single');
    zombie.x = pos.x;
    zombie.z = pos.z;
    zombie.y = getGroundedY(pos.x, pos.z);
    zombie.hp = 50 + this.difficultyLevel * 10;
    zombie.root.position.set(zombie.x, zombie.y, zombie.z);
    this.zombies.push(zombie);
  }

  updatePlayer(dtSec, nowMs) {
    const move = { x: 0, z: 0 };
    if (this.input.up) move.z -= 1;
    if (this.input.down) move.z += 1;
    if (this.input.left) move.x -= 1;
    if (this.input.right) move.x += 1;

    const len = Math.hypot(move.x, move.z);
    if (len > 0) {
      move.x /= len;
      move.z /= len;
      const baseSpeed = this.input.sprint ? RUN_SPEED : WALK_SPEED;
      const attackSlow = (this.girlController?.isAttacking() || this.boyController?.isAttacking()) ? 0.4 : 1;
      const danceSlow = this.boyController?.isDancing() ? 0.1 : 1;
      const speed = baseSpeed * attackSlow * danceSlow;
      this.player.vx += (move.x * speed - this.player.vx) * Math.min(1, 14 * dtSec);
      this.player.vz += (move.z * speed - this.player.vz) * Math.min(1, 14 * dtSec);
      this.player.rot = Math.atan2(move.x, move.z);
    } else {
      this.player.vx *= Math.exp(-10 * dtSec);
      this.player.vz *= Math.exp(-10 * dtSec);
    }

    this.player.x += this.player.vx * dtSec;
    this.player.z += this.player.vz * dtSec;
    this.player.y = terrainHeight(this.player.x, this.player.z) + 1.2;
    this.player.sprinting = this.input.sprint && len > 0;

    if (this.player.character === 'girl' && this.girlController) {
      this.girlController.setAttackHeld(this.input.attackHeld);
    }
    if (this.player.character === 'boy' && this.boyController) {
      this.boyController.setHeldAttack(this.input.latestBoyHeldAttack());
    }

    while (this.input.consumeAttackPress()) {
      if (this.player.character === 'girl' && this.girlController) {
        this.girlController.requestAttack(nowMs, true);
      } else if (nowMs >= this.player.attackCooldownUntil) {
        this.player.attackCooldownUntil = nowMs + MIN_ATTACK_INTERVAL * 1000;
        this.applyMeleeDamage(20, 3.2, Math.PI * 0.8, nowMs);
      }
    }

    if (this.player.character !== 'girl' && this.input.attackHeld && nowMs >= this.player.attackCooldownUntil) {
      this.player.attackCooldownUntil = nowMs + MIN_ATTACK_INTERVAL * 1000;
      this.applyMeleeDamage(20, 3.2, Math.PI * 0.8, nowMs);
    }

    if (this.player.character === 'boy' && this.boyController && !this.boyController.isDancing()) {
      let key;
      while ((key = this.input.consumeBoyAttackPress())) {
        this.boyController.requestAttack(key, nowMs);
      }
      const held = this.input.latestBoyHeldAttack();
      if (held) this.boyController.requestAttack(held, nowMs);
    }
  }

  applyMeleeDamage(damage, range, arc, nowMs) {
    for (const zombie of this.zombies) {
      if (zombie.hp <= 0) continue;
      if (dist2(this.player, zombie) > range * range) continue;
      const angleToZombie = Math.atan2(zombie.x - this.player.x, zombie.z - this.player.z);
      const delta = Math.abs(normalizeAngle(angleToZombie - this.player.rot));
      if (delta > arc / 2) continue;
      zombie.applyDamage(damage, nowMs, this.player.rot);
      this.world.spawnHitBurst(zombie.x, zombie.y + 0.8, zombie.z);
    }
  }

  applyGirlHit(step) {
    const nowMs = performance.now();
    const damage = step === 'kick' ? 28 : 18;
    this.applyMeleeDamage(damage, ATTACK_RANGE, ATTACK_ARC, nowMs);
  }

  applyBoyHit(type) {
    const nowMs = performance.now();
    const damage = type === 'jump' ? 34 : type === 'kick' ? 24 : 20;
    this.applyMeleeDamage(damage, BOY_ATTACK_RANGE, BOY_ATTACK_ARC, nowMs);
    if (type === 'jump') {
      this.player.vx += Math.sin(this.player.rot) * 1.9;
      this.player.vz += Math.cos(this.player.rot) * 1.9;
    }
  }

  onAttackHit(zombie, player) {
    const damage = 8 + this.difficultyLevel;
    player.hp = Math.max(0, player.hp - damage);
    player.damageFlashUntil = performance.now() + 180;

    const dx = player.x - zombie.x;
    const dz = player.z - zombie.z;
    const d = Math.hypot(dx, dz) || 1;
    player.vx += (dx / d) * 2.6;
    player.vz += (dz / d) * 2.6;
    this.feedback.trigger();
  }

  updateZombies(dtSec, nowMs) {
    const hadAlive = this.zombies.some((z) => z.hp > 0);
    for (const zombie of this.zombies) {
      zombie.updateSinglePlayer(dtSec, nowMs, {
        player: this.player,
        zombies: this.zombies,
        difficultyLevel: this.difficultyLevel,
        onAttackHit: (attacker, target) => this.onAttackHit(attacker, target)
      });
    }

    const alive = [];
    for (const zombie of this.zombies) {
      if (zombie.hp > 0) alive.push(zombie);
      else {
        this.kills += 1;
        zombie.destroy();
        this.world.zombies.delete(zombie.id);
      }
    }
    this.zombies = alive;

    if (
      this.player.character === 'boy' &&
      this.boyController &&
      hadAlive &&
      this.zombies.length === 0
    ) {
      this.boyController.tryStartDance(nowMs, DANCE_DURATION);
    }

    if (this.player.character === 'boy' && this.boyController?.isDancing() && this.zombies.length > 0) {
      this.boyController.stopDance(nowMs);
    }
  }

  update(dtSec, nowMs) {
    if (!this.running) return;

    this.timerMs += dtSec * 1000;
    this.difficultyLevel = computeDifficulty(this.timerMs);

    if (this.timerMs >= this.nextZombieSpawnAt) {
      this.nextZombieSpawnAt = this.timerMs + computeSpawnIntervalMs(this.difficultyLevel);
      this.spawnZombie();
    }

    if (this.zombies.length === 0) {
      this.spawnZombie(true);
      this.spawnZombie(true);
    }

    this.updatePlayer(dtSec, nowMs);
    this.updateZombies(dtSec, nowMs);

    this.world.syncPlayerFromSimulation(this.player);
    this.world.syncSingleZombies(this.zombies);

    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.running = false;
      ui.singleGameOverText.textContent = `Survived ${Math.floor(this.timerMs / 1000)}s with ${this.kills} zombie kills.`;
      ui.singleGameOverOverlay.classList.remove('hidden');
      ui.hud.classList.add('hidden');
      this.input.enabled = false;
    }

    ui.statsEl.textContent = `Timer: ${Math.floor(this.timerMs / 1000)}s | HP: ${Math.round(this.player.hp)} | Kills: ${this.kills}`;
    ui.objectiveEl.textContent = `Zombies alive: ${this.zombies.length} | Difficulty: ${this.difficultyLevel}`;
    ui.distanceEl.textContent = 'Single Player: survive and kill zombies.';
  }

  destroy() {
    this.running = false;
  }
}

class MultiplayerSession {
  constructor(world, input, feedback) {
    this.world = world;
    this.input = input;
    this.feedback = feedback;

    this.socket = null;
    this.connectPromise = null;
    this.destroyed = false;
    this.matchActive = false;
    this.myPlayerId = null;
    this.currentState = null;
    this.myVoteSent = false;
    this.inputTimer = null;
    this.lastDanceSentAt = 0;

    this.inputTimer = setInterval(() => {
      if (!this.matchActive || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
      this.socket.send(JSON.stringify({ type: 'input', input: this.input.snapshot() }));
      this.input.attackQueued = false;
    }, 33);
  }

  async connectIfNeeded() {
    if (this.destroyed) throw new Error('Session destroyed');
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise((resolve, reject) => {
      let resolved = false;
      const ws = new WebSocket(socketUrl);
      this.socket = ws;

      const timeout = setTimeout(() => {
        if (!resolved) reject(new Error('Connection timeout.'));
      }, 5000);

      ws.onopen = () => {
        resolved = true;
        clearTimeout(timeout);
        ui.menuError.textContent = '';
        resolve();
      };

      ws.onerror = () => {
        if (!resolved) {
          clearTimeout(timeout);
          reject(new Error('Cannot reach multiplayer server.'));
        }
      };

      ws.onclose = () => {
        if (!this.destroyed) {
          this.matchActive = false;
          this.input.enabled = false;
          ui.menuError.textContent = 'Disconnected from server.';
        }
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      };
    }).finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  async createRoom() {
    try {
      await this.connectIfNeeded();
      this.socket.send(JSON.stringify({ type: 'create_room', character: ui.characterSelect.value }));
    } catch (error) {
      ui.menuError.textContent = error.message;
    }
  }

  async joinRoom(code) {
    try {
      await this.connectIfNeeded();
      this.socket.send(JSON.stringify({
        type: 'join_room',
        code: code.trim().toUpperCase(),
        character: ui.characterSelect.value
      }));
    } catch (error) {
      ui.menuError.textContent = error.message;
    }
  }

  handleMessage(message) {
    if (message.type === 'welcome') {
      this.myPlayerId = message.playerId;
      return;
    }

    if (message.type === 'error') {
      ui.menuError.textContent = message.message;
      return;
    }

    if (message.type === 'room_joined') {
      if (Number.isFinite(message.worldSeed)) this.world.setWorldSeed(message.worldSeed);
      ui.roomInfo.textContent = `Room code: ${message.code}`;
      return;
    }

    if (message.type === 'room_update') {
      ui.roomInfo.textContent = `Room ${message.code} players: ${message.players.length}/2`;
      return;
    }

    if (message.type === 'match_started') {
      if (Number.isFinite(message.worldSeed)) this.world.setWorldSeed(message.worldSeed);
      this.matchActive = true;
      hidePanels();
      hideAllOverlays();
      ui.hud.classList.remove('hidden');
      ui.radar.classList.remove('hidden');
      this.input.enabled = true;
      return;
    }

    if (message.type === 'proposal_started') {
      this.showProposal(message.byPlayerId);
      return;
    }

    if (message.type === 'match_end') {
      this.showResult(message.accepted);
      return;
    }

    if (message.type === 'player_left') {
      this.matchActive = false;
      this.input.enabled = false;
      ui.menuError.textContent = message.reason;
      ui.hud.classList.add('hidden');
      ui.radar.classList.add('hidden');
      ui.multiplayerMenu.classList.remove('hidden');
      return;
    }

    if (message.type === 'zombie_events') {
      this.handleZombieEvents(message.events || []);
      return;
    }

    if (message.type === 'girl_attack_event') {
      this.world.playGirlAttack(message.playerId, message.step, message.at || performance.now());
      return;
    }

    if (message.type === 'boy_attack_event') {
      this.world.playBoyAttack(message.playerId, message.attackType, message.at || performance.now());
      return;
    }

    if (message.type === 'boy_dance_event') {
      this.world.playBoyDance(message.playerId, message.at || performance.now(), message.durationMs || DANCE_DURATION);
      return;
    }

    if (message.type === 'state') {
      if (Number.isFinite(message.worldSeed)) this.world.setWorldSeed(message.worldSeed);
      this.currentState = message;
      this.world.applyPlayers(message.players, this.myPlayerId);
      this.world.applyZombieSnapshots(message.zombies, performance.now(), 'multiplayer');
      this.world.applyHearts(message.hearts);
      this.updateHud(message);
      ui.deathOverlay.classList.toggle('hidden', !message.deathOverlay);
      if (!message.proposal.active) {
        ui.proposalOverlay.classList.add('hidden');
        this.myVoteSent = false;
      }
    }
  }

  handleZombieEvents(events) {
    for (const event of events) {
      if (event.type === 'attackStart') {
        const zombie = this.world.zombies.get(event.zombieId);
        if (zombie) zombie.triggerAttackFromServer(event.startTime, event.durationMs || ATTACK_ANIM_MS);
      }

      if (event.type === 'zombieHit' && event.targetPlayerId === this.myPlayerId) {
        this.feedback.trigger();
      }
    }
  }

  updateHud(state) {
    const me = state.players.find((p) => p.id === this.myPlayerId);
    const other = state.players.find((p) => p.id !== this.myPlayerId);
    if (!me) return;

    ui.statsEl.textContent = `Timer: ${state.timerSec}s | HP: ${Math.round(me.hp)} | Hearts: ${me.hearts}/${HEART_TARGET} | Zombies: ${state.zombieCount}`;
    ui.objectiveEl.textContent = `You: ${me.sentence || ''} | Teammate: ${other?.sentence || ''}`;

    if (other && Number.isFinite(state.otherPlayerDistance)) {
      const d = state.otherPlayerDistance.toFixed(1);
      const hint = state.otherPlayerDistance <= 3 ? ' - Together! Proposal range reached.' : '';
      ui.distanceEl.textContent = `Distance to teammate: ${d}m${hint}`;
    } else {
      ui.distanceEl.textContent = 'Waiting for teammate...';
    }

    if (me.character === 'boy' && state.zombieCount === 0) {
      const controller = this.world.getBoyController(this.myPlayerId);
      const now = performance.now();
      if (controller && !controller.isDancing() && now - this.lastDanceSentAt > DANCE_DURATION) {
        controller.tryStartDance(now, DANCE_DURATION);
        this.lastDanceSentAt = now;
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(JSON.stringify({ type: 'boy_dance', durationMs: DANCE_DURATION }));
        }
      }
    }
    if (me.character === 'boy' && state.zombieCount > 0) {
      const controller = this.world.getBoyController(this.myPlayerId);
      if (controller?.isDancing()) controller.stopDance(performance.now());
    }
  }

  showProposal(byPlayerId) {
    ui.proposalOverlay.classList.remove('hidden');
    ui.proposalText.textContent = 'Will you be my valentine?';
    ui.proposalButtons.innerHTML = '';

    const me = this.currentState?.players.find((p) => p.id === this.myPlayerId);
    const proposer = this.currentState?.players.find((p) => p.id === byPlayerId);
    const myCharacter = me?.character || ui.characterSelect.value;
    const proposerCharacter = proposer?.character || 'boy';

    if (proposerCharacter === 'boy') ui.proposalText.textContent = 'Boy asks: "Will you be my valentine?"';

    if (myCharacter === 'girl') {
      const yes = document.createElement('button');
      const no = document.createElement('button');
      yes.textContent = 'YES';
      no.textContent = 'NO';
      yes.onclick = () => this.sendProposal(true);
      no.onclick = () => this.sendProposal(false);
      ui.proposalButtons.append(yes, no);
    } else {
      const wait = document.createElement('p');
      wait.textContent = 'Waiting for answer...';
      ui.proposalButtons.append(wait);
    }
  }

  sendProposal(accept) {
    if (this.myVoteSent || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.myVoteSent = true;
    this.socket.send(JSON.stringify({ type: 'proposal_response', accept }));
    ui.proposalButtons.innerHTML = `<p>${accept ? 'You said YES!' : 'You said NO.'}</p>`;
  }

  showResult(accepted) {
    this.matchActive = false;
    this.input.enabled = false;
    ui.proposalOverlay.classList.add('hidden');
    ui.resultOverlay.classList.remove('hidden');
    if (accepted) {
      ui.resultTitle.textContent = 'YES! Celebration time';
      ui.resultText.textContent = 'Fireworks and confetti across the block world.';
      this.world.spawnCelebration(true);
    } else {
      ui.resultTitle.textContent = 'NO...';
      ui.resultText.textContent = 'Funny sad moment. Replay from lobby.';
      this.world.spawnCelebration(false);
    }
  }

  drawRadar() {
    if (!this.matchActive || !this.currentState) {
      radarCtx.clearRect(0, 0, ui.radar.width, ui.radar.height);
      return;
    }

    const me = this.currentState.players.find((p) => p.id === this.myPlayerId);
    const other = this.currentState.players.find((p) => p.id !== this.myPlayerId);
    if (!me) return;

    const size = ui.radar.width;
    const center = size / 2;
    const scale = size / WORLD_SIZE;

    radarCtx.clearRect(0, 0, size, size);
    radarCtx.strokeStyle = 'rgba(255,255,255,0.25)';
    radarCtx.beginPath();
    radarCtx.arc(center, center, center - 8, 0, Math.PI * 2);
    radarCtx.stroke();

    const drawDot = (x, z, color, r = 5) => {
      radarCtx.fillStyle = color;
      radarCtx.beginPath();
      radarCtx.arc(center + x * scale, center + z * scale, r, 0, Math.PI * 2);
      radarCtx.fill();
    };

    drawDot(me.x, me.z, '#6fd0ff', 5);
    if (other) drawDot(other.x, other.z, '#ff8ca8', 5);
    for (const zombie of this.currentState.zombies) drawDot(zombie.x, zombie.z, '#89d66f', 2.5);
  }

  update(_dtSec, nowMs) {
    if (this.matchActive && this.currentState) {
      const me = this.currentState.players.find((p) => p.id === this.myPlayerId);
      if (me?.character === 'girl') {
        const controller = this.world.getGirlController(this.myPlayerId);
        if (controller) {
          controller.setAttackHeld(this.input.attackHeld);
          while (this.input.consumeAttackPress()) {
            const step = controller.requestAttack(nowMs, true);
            if (step && this.socket && this.socket.readyState === WebSocket.OPEN) {
              this.socket.send(JSON.stringify({ type: 'girl_attack', step }));
            }
          }
          if (this.input.attackHeld) {
            const step = controller.requestAttack(nowMs, false);
            if (step && this.socket && this.socket.readyState === WebSocket.OPEN) {
              this.socket.send(JSON.stringify({ type: 'girl_attack', step }));
            }
          }
        }
      } else {
        while (this.input.consumeAttackPress()) {}
        const controller = this.world.getBoyController(this.myPlayerId);
        if (controller) {
          let key;
          while ((key = this.input.consumeBoyAttackPress())) {
            const started = controller.requestAttack(key, nowMs);
            if (started && this.socket && this.socket.readyState === WebSocket.OPEN) {
              this.socket.send(JSON.stringify({ type: 'boy_attack', attackType: started }));
            }
          }
          const held = this.input.latestBoyHeldAttack();
          controller.setHeldAttack(held);
          if (held) {
            const started = controller.requestAttack(held, nowMs);
            if (started && this.socket && this.socket.readyState === WebSocket.OPEN) {
              this.socket.send(JSON.stringify({ type: 'boy_attack', attackType: started }));
            }
          }
        }
      }
    }
    this.drawRadar();
  }

  destroy() {
    this.destroyed = true;
    this.matchActive = false;
    this.input.enabled = false;
    if (this.inputTimer) clearInterval(this.inputTimer);
    if (this.socket) this.socket.close();
  }
}

class App {
  constructor() {
    this.feedback = new HitFeedback();
    this.input = new InputController(ui.canvas);
    this.zombieAssets = new ZombieAssets();
    this.girlAssets = new GirlCharacterAssets();
    this.boyAssets = new BoyCharacterAssets();
    this.world = null;
    this.activeSession = null;
    this.mode = 'none';

    this.fixedDt = 1 / 60;
    this.accumulator = 0;
    this.lastFrameTime = performance.now();
    this.simTimeMs = this.lastFrameTime;

    this.debug = {
      enabled: true,
      el: null,
      fpsFrames: 0,
      fpsElapsed: 0,
      simStepsAccum: 0
    };
  }

  async init() {
    ui.menuError.textContent = 'Loading zombie FBX assets...';
    ui.toModeBtn.disabled = true;
    ui.singleModeBtn.disabled = true;
    ui.multiModeBtn.disabled = true;

    try {
      await Promise.all([this.zombieAssets.load(), this.girlAssets.load(), this.boyAssets.load()]);
      this.world = new WorldRenderer(ui.canvas, this.input, this.zombieAssets, this.girlAssets, this.boyAssets);
      this.bindUi();
      ui.menuError.textContent = '';
      ui.toModeBtn.disabled = false;
      ui.singleModeBtn.disabled = false;
      ui.multiModeBtn.disabled = false;
      this.initDebug();
      requestAnimationFrame((t) => this.loop(t));
    } catch (error) {
      ui.menuError.textContent = `Asset load failed: ${error.message}`;
    }
  }

  initDebug() {
    if (!this.debug.enabled) return;
    const el = document.createElement('div');
    el.style.position = 'fixed';
    el.style.bottom = '8px';
    el.style.left = '8px';
    el.style.padding = '6px 8px';
    el.style.background = 'rgba(0,0,0,0.45)';
    el.style.color = '#d6e7ff';
    el.style.font = '12px monospace';
    el.style.zIndex = '40';
    el.style.borderRadius = '6px';
    el.style.pointerEvents = 'none';
    el.textContent = 'fps: -- | dt: -- | sim: --';
    document.body.appendChild(el);
    this.debug.el = el;
  }

  bindUi() {
    ui.toModeBtn.onclick = () => {
      hidePanels();
      ui.modeMenu.classList.remove('hidden');
      hideAllOverlays();
    };

    ui.backToStartBtn.onclick = () => {
      this.stopSession();
      hidePanels();
      hideAllOverlays();
      ui.startMenu.classList.remove('hidden');
      ui.hud.classList.add('hidden');
      ui.radar.classList.add('hidden');
    };

    ui.singleModeBtn.onclick = () => this.startSingle();
    ui.multiModeBtn.onclick = () => this.startMultiplayerMenu();

    ui.backToModeBtn.onclick = () => {
      this.stopSession();
      hideAllOverlays();
      hidePanels();
      ui.modeMenu.classList.remove('hidden');
      ui.hud.classList.add('hidden');
      ui.radar.classList.add('hidden');
      ui.roomInfo.textContent = '';
      ui.menuError.textContent = '';
    };

    ui.createRoomBtn.onclick = () => {
      if (this.activeSession instanceof MultiplayerSession) this.activeSession.createRoom();
    };

    ui.joinRoomBtn.onclick = () => {
      if (this.activeSession instanceof MultiplayerSession) this.activeSession.joinRoom(ui.joinCodeInput.value);
    };

    ui.backToLobbyBtn.onclick = () => {
      this.stopSession();
      hideAllOverlays();
      hidePanels();
      ui.startMenu.classList.remove('hidden');
      ui.hud.classList.add('hidden');
      ui.radar.classList.add('hidden');
      ui.roomInfo.textContent = '';
      ui.menuError.textContent = '';
    };

    ui.singleRestartBtn.onclick = () => this.startSingle();
  }

  stopSession() {
    if (this.activeSession) this.activeSession.destroy();
    this.activeSession = null;
    this.mode = 'none';
    if (this.world) this.world.resetDynamic();
    this.input.enabled = false;
  }

  startSingle() {
    this.stopSession();
    this.world.setWorldSeed(SEED);
    hidePanels();
    hideAllOverlays();
    ui.hud.classList.remove('hidden');
    ui.radar.classList.add('hidden');
    this.input.enabled = true;
    this.mode = 'single';
    this.activeSession = new SinglePlayerSession(this.world, this.input, this.feedback);
  }

  startMultiplayerMenu() {
    this.stopSession();
    hidePanels();
    hideAllOverlays();
    ui.multiplayerMenu.classList.remove('hidden');
    ui.hud.classList.add('hidden');
    ui.radar.classList.add('hidden');
    ui.roomInfo.textContent = '';
    ui.menuError.textContent = '';
    this.mode = 'multiplayer';
    this.activeSession = new MultiplayerSession(this.world, this.input, this.feedback);
  }

  loop(nowMs) {
    const realDeltaSec = Math.min(0.1, Math.max(0, (nowMs - this.lastFrameTime) / 1000));
    this.lastFrameTime = nowMs;
    this.accumulator += realDeltaSec;

    let simSteps = 0;
    while (this.accumulator >= this.fixedDt && simSteps < 8) {
      this.simTimeMs += this.fixedDt * 1000;
      if (this.activeSession) this.activeSession.update(this.fixedDt, this.simTimeMs);
      this.accumulator -= this.fixedDt;
      simSteps += 1;
    }

    this.feedback.update(realDeltaSec);
    if (this.world) this.world.update(realDeltaSec, nowMs * 0.001, this.mode);

    if (this.debug.enabled && this.debug.el) {
      this.debug.fpsFrames += 1;
      this.debug.fpsElapsed += realDeltaSec;
      this.debug.simStepsAccum += simSteps;
      if (this.debug.fpsElapsed >= 0.5) {
        const fps = Math.round(this.debug.fpsFrames / this.debug.fpsElapsed);
        const simPerSec = Math.round(this.debug.simStepsAccum / this.debug.fpsElapsed);
        this.debug.el.textContent = `fps: ${fps} | dt: ${(realDeltaSec * 1000).toFixed(1)}ms | sim: ${simPerSec}/s`;
        this.debug.fpsFrames = 0;
        this.debug.fpsElapsed = 0;
        this.debug.simStepsAccum = 0;
      }
    }

    requestAnimationFrame((t) => this.loop(t));
  }
}

const app = new App();
app.init();
