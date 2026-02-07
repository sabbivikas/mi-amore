import express from 'express';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

const TICK_RATE = 60;
const TICK_MS = 1000 / TICK_RATE;
const NETWORK_RATE = 20;
const NETWORK_MS = 1000 / NETWORK_RATE;
const FIXED_DT_MS = 1000 / 60;

const ROOM_SIZE = 90;
const HEART_TARGET = 20;
const BASE_ZOMBIE_MAX = 4;
const BASE_ZOMBIE_INTERVAL_MS = 7000;
const HARD_ZOMBIE_CAP = 36;

const PLAYER_MAX_HP = 100;
const PLAYER_RESPAWN_MS = 3000;
const PLAYER_ATTACK_COOLDOWN_MS = 500;
const PLAYER_ATTACK_RANGE = 3.2;
const PLAYER_ATTACK_ARC = Math.PI * 0.8;
const BOY_ATTACK_COOLDOWN_MS = 250;
const BOY_ATTACK_RANGE = 1.7;
const BOY_ATTACK_ARC = (100 * Math.PI) / 180;

const ZOMBIE_TARGET_HEIGHT = 1.95;
const ZOMBIE_COLLIDER_RADIUS = 0.5;
const ZOMBIE_COLLIDER_HALF_HEIGHT = ZOMBIE_TARGET_HEIGHT * 0.5;
const VISION_RADIUS = 18;
const ATTACK_RANGE = 1.6;
const ATTACK_COOLDOWN = 1200;
const WALK_SPEED = 2.2;
const MAX_SPEED = 3.2;
const ZOMBIE_ACCEL = 12;
const ZOMBIE_DAMPING = 7;
const TURN_SPEED = 7;
const ARRIVE_RADIUS = 3.2;
const ATTACK_ANIM_MS = 950;
const STUN_MS = 220;
const LOS_STEP = 0.6;
const SEED = 133742;

const LETTERS = 'WILLYOUBEMYVALENTINE'.split('');

const ZOMBIE_STATE = {
  IDLE: 'IDLE',
  CHASE: 'CHASE',
  ATTACK: 'ATTACK',
  STUN: 'STUN'
};

const app = express();
app.use(express.static(path.join(ROOT, 'client')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let nextPlayerId = 1;
let nextZombieId = 1;
let nextHeartId = 1;

const rooms = new Map();

function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 5; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

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

function terrainHeight(x, z) {
  const h = Math.sin(x * 0.12) * 1.8 + Math.cos(z * 0.09) * 1.4 + Math.sin((x + z) * 0.06) * 1.2;
  return Math.max(0, Math.round(h + 2));
}

function isSolidAt(x, y, z) {
  return y <= terrainHeight(x, z);
}

function getGroundedY(x, z) {
  return terrainHeight(x, z) + ZOMBIE_COLLIDER_HALF_HEIGHT;
}

function canMoveCapsule(x, z) {
  if (x < -ROOM_SIZE / 2 || x > ROOM_SIZE / 2 || z < -ROOM_SIZE / 2 || z > ROOM_SIZE / 2) return false;

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

function sampleLineOfSight(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dy, dz);
  const steps = Math.max(1, Math.floor(dist / LOS_STEP));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    const z = from.z + dz * t;
    if (isSolidAt(x, y, z)) return false;
  }
  return true;
}

function computeDifficulty(timerMs) {
  return Math.floor(timerMs / 30000);
}

function computeSpawnIntervalMs(difficultyLevel) {
  return Math.max(1800, BASE_ZOMBIE_INTERVAL_MS - difficultyLevel * 450);
}

function computeMaxZombies(difficultyLevel) {
  return Math.min(HARD_ZOMBIE_CAP, BASE_ZOMBIE_MAX + difficultyLevel * 2);
}

function randomPosition(minDistanceFromSpawn = 8) {
  let attempt = 0;
  while (attempt < 100) {
    const x = (Math.random() - 0.5) * ROOM_SIZE;
    const z = (Math.random() - 0.5) * ROOM_SIZE;
    if (x * x + z * z >= minDistanceFromSpawn * minDistanceFromSpawn) {
      return { x, z };
    }
    attempt += 1;
  }
  return { x: minDistanceFromSpawn, z: minDistanceFromSpawn };
}

function randomSpawnAroundPlayers(room) {
  const players = [...room.players.values()].filter((p) => p.alive);
  if (!players.length) return randomPosition(14);

  for (let i = 0; i < 120; i += 1) {
    const anchor = players[Math.floor(Math.random() * players.length)];
    const angle = Math.random() * Math.PI * 2;
    const radius = 20 + Math.random() * 15;
    const x = anchor.x + Math.cos(angle) * radius;
    const z = anchor.z + Math.sin(angle) * radius;

    if (x < -ROOM_SIZE / 2 || x > ROOM_SIZE / 2 || z < -ROOM_SIZE / 2 || z > ROOM_SIZE / 2) continue;

    let safe = true;
    for (const p of players) {
      if (dist2({ x, z }, p) < 12 * 12) {
        safe = false;
        break;
      }
    }
    if (safe && canMoveCapsule(x, z)) return { x, z };
  }

  return randomPosition(18);
}

class ZombieEnemy {
  constructor(room, x, z) {
    this.room = room;
    this.id = nextZombieId++;
    this.x = x;
    this.z = z;
    this.y = getGroundedY(x, z);
    this.rot = 0;
    this.vx = 0;
    this.vz = 0;
    this.hp = 50 + room.difficultyLevel * 10;

    this.state = ZOMBIE_STATE.IDLE;
    this.stateSince = Date.now();
    this.lastKnownTarget = { x, z };
    this.lastKnownAt = 0;
    this.targetPlayerId = null;

    this.attackStartedAt = 0;
    this.attackHitsAt = 0;
    this.attackEndsAt = 0;
    this.attackHasHit = false;
    this.attackCooldownUntil = 0;

    this.stunUntil = 0;
    this.hitFlashUntil = 0;
  }

  getMoveSpeed(room) {
    const t = clamp(room.difficultyLevel / 8, 0, 1);
    return lerp(WALK_SPEED, MAX_SPEED, t);
  }

  setState(next, now) {
    if (this.state === next) return;
    this.state = next;
    this.stateSince = now;
  }

  applyDamage(amount, now, sourceRot) {
    this.hp -= amount;
    this.hitFlashUntil = now + 120;
    this.stunUntil = now + STUN_MS;
    this.setState(ZOMBIE_STATE.STUN, now);
    this.vx += Math.sin(sourceRot) * 3.3;
    this.vz += Math.cos(sourceRot) * 3.3;
  }

  chooseTarget(now) {
    let best = null;
    let bestD2 = Infinity;

    for (const p of this.room.players.values()) {
      if (!p.alive) continue;
      const d2v = dist2(this, p);
      if (d2v > VISION_RADIUS * VISION_RADIUS) continue;

      const yawToPlayer = Math.atan2(p.x - this.x, p.z - this.z);
      const delta = Math.abs(normalizeAngle(yawToPlayer - this.rot));
      if (delta > (Math.PI * 2) / 3) continue;

      const los = sampleLineOfSight(
        { x: this.x, y: this.y + 0.8, z: this.z },
        { x: p.x, y: p.y + 0.8, z: p.z }
      );
      if (!los) continue;

      if (d2v < bestD2) {
        bestD2 = d2v;
        best = p;
      }
    }

    if (best) {
      this.targetPlayerId = best.id;
      this.lastKnownTarget = { x: best.x, z: best.z };
      this.lastKnownAt = now;
    }

    return best;
  }

  updateSeparation(dtSec) {
    let steerX = 0;
    let steerZ = 0;
    const separationRadius = 1.25;

    for (const other of this.room.zombies) {
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

  update(now, dtSec) {
    if (this.hp <= 0) return;

    const player = this.room.players.get(this.targetPlayerId) || this.chooseTarget(now);
    if (!player || !player.alive) this.targetPlayerId = null;

    if (this.state === ZOMBIE_STATE.STUN) {
      if (now >= this.stunUntil) {
        this.setState(ZOMBIE_STATE.IDLE, now);
      }
    }

    if (this.state === ZOMBIE_STATE.ATTACK) {
      const target = this.room.players.get(this.targetPlayerId);
      if (target && target.alive) {
        const yawToTarget = Math.atan2(target.x - this.x, target.z - this.z);
        this.rot = normalizeAngle(this.rot + normalizeAngle(yawToTarget - this.rot) * Math.min(1, TURN_SPEED * dtSec));

        if (!this.attackHasHit && now >= this.attackHitsAt && now <= this.attackEndsAt) {
          if (dist2(this, target) <= ATTACK_RANGE * ATTACK_RANGE * 1.3) {
            this.attackHasHit = true;
            this.room.applyZombieHit(this, target, now);
          }
        }
      }

      if (now >= this.attackEndsAt) {
        this.setState(ZOMBIE_STATE.CHASE, now);
      }

      this.vx *= Math.exp(-ZOMBIE_DAMPING * dtSec);
      this.vz *= Math.exp(-ZOMBIE_DAMPING * dtSec);
      return;
    }

    let desiredX = 0;
    let desiredZ = 0;
    let shouldChase = false;
    let targetDist = Infinity;

    const visibleTarget = this.chooseTarget(now);
    const activeTarget = visibleTarget || (this.targetPlayerId ? this.room.players.get(this.targetPlayerId) : null);

    if (activeTarget && activeTarget.alive) {
      const dx = activeTarget.x - this.x;
      const dz = activeTarget.z - this.z;
      targetDist = Math.hypot(dx, dz) || 0.0001;
      const lineOfSight = sampleLineOfSight(
        { x: this.x, y: this.y + 0.8, z: this.z },
        { x: activeTarget.x, y: activeTarget.y + 0.8, z: activeTarget.z }
      );

      if (lineOfSight) {
        this.lastKnownTarget = { x: activeTarget.x, z: activeTarget.z };
        this.lastKnownAt = now;
      }

      desiredX = lineOfSight ? dx : this.lastKnownTarget.x - this.x;
      desiredZ = lineOfSight ? dz : this.lastKnownTarget.z - this.z;
      shouldChase = true;

      if (
        lineOfSight &&
        targetDist <= ATTACK_RANGE &&
        now >= this.attackCooldownUntil &&
        this.state !== ZOMBIE_STATE.STUN
      ) {
        this.setState(ZOMBIE_STATE.ATTACK, now);
        this.attackStartedAt = now;
        this.attackHitsAt = now + ATTACK_ANIM_MS * 0.35;
        this.attackEndsAt = now + ATTACK_ANIM_MS;
        this.attackHasHit = false;
        this.attackCooldownUntil = now + ATTACK_COOLDOWN;
        this.room.queueEvent({ type: 'attackStart', zombieId: this.id, startTime: now, durationMs: ATTACK_ANIM_MS });
        return;
      }
    } else if (now - this.lastKnownAt < 1500) {
      desiredX = this.lastKnownTarget.x - this.x;
      desiredZ = this.lastKnownTarget.z - this.z;
      shouldChase = true;
    }

    if (this.state !== ZOMBIE_STATE.STUN) {
      this.setState(shouldChase ? ZOMBIE_STATE.CHASE : ZOMBIE_STATE.IDLE, now);
    }

    if (this.state === ZOMBIE_STATE.CHASE) {
      const d = Math.hypot(desiredX, desiredZ) || 1;
      const dirX = desiredX / d;
      const dirZ = desiredZ / d;
      const arriveFactor = clamp(d / ARRIVE_RADIUS, 0.25, 1);
      const speed = this.getMoveSpeed(this.room) * arriveFactor;
      const targetVx = dirX * speed;
      const targetVz = dirZ * speed;

      this.vx += (targetVx - this.vx) * Math.min(1, ZOMBIE_ACCEL * dtSec);
      this.vz += (targetVz - this.vz) * Math.min(1, ZOMBIE_ACCEL * dtSec);

      const yawToTarget = Math.atan2(dirX, dirZ);
      this.rot = normalizeAngle(this.rot + normalizeAngle(yawToTarget - this.rot) * Math.min(1, TURN_SPEED * dtSec));
    } else {
      this.vx *= Math.exp(-ZOMBIE_DAMPING * dtSec);
      this.vz *= Math.exp(-ZOMBIE_DAMPING * dtSec);
      this.rot = normalizeAngle(this.rot + Math.sin((now - this.stateSince) * 0.002 + this.id) * 0.02);
    }

    this.updateSeparation(dtSec);

    const speed = Math.hypot(this.vx, this.vz);
    const maxSpeed = this.getMoveSpeed(this.room) + 0.7;
    if (speed > maxSpeed) {
      this.vx = (this.vx / speed) * maxSpeed;
      this.vz = (this.vz / speed) * maxSpeed;
    }

    const nx = this.x + this.vx * dtSec;
    const nz = this.z + this.vz * dtSec;

    if (canMoveCapsule(nx, this.z)) {
      this.x = nx;
    } else {
      this.vx *= -0.22;
    }

    if (canMoveCapsule(this.x, nz)) {
      this.z = nz;
    } else {
      this.vz *= -0.22;
    }

    this.y = getGroundedY(this.x, this.z);
  }

  toNetwork(now) {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      z: this.z,
      rot: this.rot,
      hp: this.hp,
      flash: this.hitFlashUntil > now,
      state: this.state
    };
  }
}

function makePlayer(playerId, character, ws) {
  const spawn = playerId % 2 === 0 ? { x: 2, z: 2 } : { x: -2, z: -2 };
  return {
    id: playerId,
    ws,
    character,
    x: spawn.x,
    y: terrainHeight(spawn.x, spawn.z) + 1.2,
    z: spawn.z,
    rot: 0,
    vx: 0,
    vz: 0,
    hp: PLAYER_MAX_HP,
    hearts: 0,
    alive: true,
    respawnAt: 0,
    attackCooldownUntil: 0,
    input: {
      up: false,
      down: false,
      left: false,
      right: false,
      sprint: false,
      attack: false,
      yaw: 0
    },
    proposalVote: null,
    deathNoticeUntil: 0,
    damageFlashUntil: 0
  };
}

function serializePlayer(player) {
  return {
    id: player.id,
    character: player.character,
    x: player.x,
    y: player.y,
    z: player.z,
    rot: player.rot,
    hp: player.hp,
    hearts: player.hearts,
    alive: player.alive,
    sentence: LETTERS.slice(0, player.hearts).join(' '),
    damageFlash: player.damageFlashUntil > Date.now()
  };
}

function createRoom(code) {
  return {
    code,
    worldSeed: (Math.floor(Math.random() * 2147483647) ^ SEED) >>> 0,
    players: new Map(),
    started: false,
    ended: false,
    timerMs: 0,
    difficultyLevel: 0,
    nextZombieSpawnAt: 3000,
    zombies: [],
    hearts: [],
    proposal: {
      active: false,
      byPlayerId: null,
      prompt: 'Will you be my valentine?',
      answered: false,
      accepted: false
    },
    lastNetworkBroadcastAt: 0,
    events: [],
    queueEvent(event) {
      this.events.push(event);
    },
    applyZombieHit(zombie, player, now) {
      const damage = 8 + this.difficultyLevel;
      player.hp = Math.max(0, player.hp - damage);
      player.damageFlashUntil = now + 180;

      const dx = player.x - zombie.x;
      const dz = player.z - zombie.z;
      const len = Math.hypot(dx, dz) || 1;
      player.vx += (dx / len) * 2.6;
      player.vz += (dz / len) * 2.6;

      this.queueEvent({
        type: 'zombieHit',
        zombieId: zombie.id,
        targetPlayerId: player.id,
        at: now,
        damage
      });

      if (player.hp <= 0) {
        player.alive = false;
        player.respawnAt = now + PLAYER_RESPAWN_MS;
        player.deathNoticeUntil = now + PLAYER_RESPAWN_MS;
        player.hearts = Math.max(0, player.hearts - 2);
        dropHeart(this, player.x, player.z);
      }
    }
  };
}

function roomBroadcast(room, payload) {
  const msg = JSON.stringify(payload);
  for (const player of room.players.values()) {
    if (player.ws.readyState === 1) player.ws.send(msg);
  }
}

function spawnInitialHearts(room) {
  room.hearts = [];
  for (let i = 0; i < 35; i += 1) {
    const pos = randomPosition(10);
    room.hearts.push({
      id: nextHeartId++,
      x: pos.x,
      z: pos.z,
      y: terrainHeight(pos.x, pos.z) + 1.1,
      collectedBy: new Set(),
      type: 'world',
      respawnAt: 0
    });
  }
}

function spawnZombie(room, forced = false) {
  if (!room.started || room.ended || room.proposal.active) return;
  const maxZombies = computeMaxZombies(room.difficultyLevel);
  if (!forced && room.zombies.length >= maxZombies) return;

  const pos = randomSpawnAroundPlayers(room);
  room.zombies.push(new ZombieEnemy(room, pos.x, pos.z));
}

function dropHeart(room, x, z) {
  room.hearts.push({
    id: nextHeartId++,
    x,
    z,
    y: terrainHeight(x, z) + 1.1,
    collectedBy: new Set(),
    type: 'drop',
    respawnAt: 0
  });
}

function startMatch(room) {
  room.started = true;
  room.ended = false;
  room.timerMs = 0;
  room.difficultyLevel = 0;
  room.nextZombieSpawnAt = 3000;
  room.zombies = [];
  room.events = [];
  room.lastNetworkBroadcastAt = 0;
  room.proposal = {
    active: false,
    byPlayerId: null,
    prompt: 'Will you be my valentine?',
    answered: false,
    accepted: false
  };

  for (const player of room.players.values()) {
    player.hp = PLAYER_MAX_HP;
    player.hearts = 0;
    player.alive = true;
    player.respawnAt = 0;
    player.proposalVote = null;
    player.deathNoticeUntil = 0;
    player.vx = 0;
    player.vz = 0;
  }

  spawnInitialHearts(room);
  spawnZombie(room, true);
  spawnZombie(room, true);
  roomBroadcast(room, { type: 'match_started', code: room.code, worldSeed: room.worldSeed });
}

function updatePlayers(room, now, dtSec) {
  for (const player of room.players.values()) {
    if (!player.alive) {
      if (now >= player.respawnAt) {
        player.alive = true;
        player.hp = PLAYER_MAX_HP;
        player.x = player.id % 2 === 0 ? 2 : -2;
        player.z = player.id % 2 === 0 ? 2 : -2;
        player.y = terrainHeight(player.x, player.z) + 1.2;
        player.vx = 0;
        player.vz = 0;
      }
      continue;
    }

    const move = { x: 0, z: 0 };
    if (player.input.up) move.z -= 1;
    if (player.input.down) move.z += 1;
    if (player.input.left) move.x -= 1;
    if (player.input.right) move.x += 1;

    const len = Math.hypot(move.x, move.z);
    if (len > 0) {
      move.x /= len;
      move.z /= len;
      const speed = player.input.sprint ? 7.2 : 4.5;
      player.vx += (move.x * speed - player.vx) * Math.min(1, 14 * dtSec);
      player.vz += (move.z * speed - player.vz) * Math.min(1, 14 * dtSec);
      player.rot = Math.atan2(move.x, move.z);
    } else {
      player.vx *= Math.exp(-10 * dtSec);
      player.vz *= Math.exp(-10 * dtSec);
    }

    player.x += player.vx * dtSec;
    player.z += player.vz * dtSec;

    player.x = clamp(player.x, -ROOM_SIZE / 2, ROOM_SIZE / 2);
    player.z = clamp(player.z, -ROOM_SIZE / 2, ROOM_SIZE / 2);
    player.y = terrainHeight(player.x, player.z) + 1.2;

    if (player.input.attack && now >= player.attackCooldownUntil && !room.proposal.active) {
      const isBoy = player.character === 'boy';
      const range = isBoy ? BOY_ATTACK_RANGE : PLAYER_ATTACK_RANGE;
      const arc = isBoy ? BOY_ATTACK_ARC : PLAYER_ATTACK_ARC;
      player.attackCooldownUntil = now + (isBoy ? BOY_ATTACK_COOLDOWN_MS : PLAYER_ATTACK_COOLDOWN_MS);
      for (const zombie of room.zombies) {
        if (zombie.hp <= 0) continue;
        const d2v = dist2(player, zombie);
        if (d2v > range * range) continue;
        const dirToZombie = Math.atan2(zombie.x - player.x, zombie.z - player.z);
        const delta = Math.abs(normalizeAngle(dirToZombie - player.rot));
        if (delta > arc / 2) continue;
        zombie.applyDamage(isBoy ? 24 : 20, now, player.rot);
      }
    }

    for (const heart of room.hearts) {
      if (heart.respawnAt > now) continue;
      if (heart.collectedBy.has(player.id)) continue;
      if (dist2(player, heart) <= 1.8 * 1.8) {
        heart.collectedBy.add(player.id);
        player.hearts = clamp(player.hearts + 1, 0, HEART_TARGET);
        if (heart.type === 'drop') {
          heart.respawnAt = now;
        } else if (heart.collectedBy.size >= room.players.size) {
          heart.respawnAt = now + 12000 + Math.random() * 8000;
        }
      }
    }
  }
}

function updateZombies(room, now, dtSec) {
  for (const zombie of room.zombies) {
    zombie.update(now, dtSec);
  }
  room.zombies = room.zombies.filter((zombie) => zombie.hp > 0);
}

function stepRoom(room, now, dtMs) {
  if (!room.started || room.ended) return;

  room.timerMs += dtMs;
  room.difficultyLevel = computeDifficulty(room.timerMs);

  if (!room.proposal.active && room.timerMs >= room.nextZombieSpawnAt) {
    room.nextZombieSpawnAt = room.timerMs + computeSpawnIntervalMs(room.difficultyLevel);
    spawnZombie(room);
  }

  const dtSec = dtMs / 1000;
  updatePlayers(room, now, dtSec);

  if (!room.proposal.active) {
    updateZombies(room, now, dtSec);
  }

  room.hearts = room.hearts
    .map((heart) => {
      if (heart.respawnAt > 0 && now >= heart.respawnAt) {
        if (heart.type === 'drop') return null;
        const pos = randomPosition(10);
        return {
          ...heart,
          x: pos.x,
          z: pos.z,
          y: terrainHeight(pos.x, pos.z) + 1.1,
          collectedBy: new Set(),
          respawnAt: 0
        };
      }
      return heart;
    })
    .filter(Boolean);

  const players = [...room.players.values()];
  if (players.length === 2 && !room.proposal.active) {
    const bothReady = players[0].hearts >= HEART_TARGET && players[1].hearts >= HEART_TARGET;
    const closeEnough = Math.sqrt(dist2(players[0], players[1])) <= 3;
    if (bothReady && closeEnough) {
      room.proposal.active = true;
      room.proposal.byPlayerId = players.find((p) => p.character === 'boy')?.id ?? players[0].id;
      roomBroadcast(room, {
        type: 'proposal_started',
        byPlayerId: room.proposal.byPlayerId,
        prompt: room.proposal.prompt
      });
    }
  }

  if (room.events.length > 0) {
    roomBroadcast(room, { type: 'zombie_events', events: room.events.splice(0) });
  }
}

function makeStateFor(room, playerId, now) {
  const player = room.players.get(playerId);
  const other = [...room.players.values()].find((p) => p.id !== playerId) || null;

  return {
    type: 'state',
    roomCode: room.code,
    worldSeed: room.worldSeed,
    timerSec: Math.floor(room.timerMs / 1000),
    difficultyLevel: room.difficultyLevel,
    players: [...room.players.values()].map((p) => {
      const moveSpeed = Math.hypot(p.vx, p.vz);
      return {
        id: p.id,
        character: p.character,
        x: p.x,
        y: p.y,
        z: p.z,
        rot: p.rot,
        moveSpeed,
        sprinting: p.input.sprint && moveSpeed > 0.2,
        hp: p.hp,
        hearts: p.hearts,
        alive: p.alive,
        sentence: LETTERS.slice(0, p.hearts).join(' '),
        damageFlash: p.damageFlashUntil > now
      };
    }),
    zombies: room.zombies.map((zombie) => zombie.toNetwork(now)),
    hearts: room.hearts
      .filter((heart) => heart.respawnAt <= now && !heart.collectedBy.has(playerId))
      .map((heart) => ({ id: heart.id, x: heart.x, y: heart.y, z: heart.z })),
    targetHearts: HEART_TARGET,
    zombieCount: room.zombies.length,
    otherPlayerDistance: other ? Math.sqrt(dist2(player, other)) : null,
    deathOverlay: !player.alive && player.deathNoticeUntil > now,
    proposal: room.proposal
  };
}

function sendLobbyUpdate(room) {
  roomBroadcast(room, {
    type: 'room_update',
    code: room.code,
    players: [...room.players.values()].map((p) => ({ id: p.id, character: p.character })),
    readyToStart: room.players.size === 2
  });
}

function attachPlayerToRoom(room, player) {
  room.players.set(player.id, player);
  player.ws.send(JSON.stringify({
    type: 'room_joined',
    code: room.code,
    playerId: player.id,
    worldSeed: room.worldSeed
  }));
  sendLobbyUpdate(room);
  if (room.players.size === 2 && !room.started) {
    startMatch(room);
  }
}

function removePlayer(playerId) {
  for (const room of rooms.values()) {
    if (!room.players.has(playerId)) continue;
    room.players.delete(playerId);
    room.started = false;
    room.ended = true;
    roomBroadcast(room, { type: 'player_left', reason: 'A player disconnected. Returning to lobby.' });
    if (room.players.size === 0) {
      rooms.delete(room.code);
    } else {
      sendLobbyUpdate(room);
    }
    break;
  }
}

function getRoomByPlayer(playerId) {
  for (const room of rooms.values()) {
    if (room.players.has(playerId)) return room;
  }
  return null;
}

wss.on('connection', (ws) => {
  const playerId = nextPlayerId++;
  ws.send(JSON.stringify({ type: 'welcome', playerId }));

  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === 'create_room') {
      const character = message.character === 'girl' ? 'girl' : 'boy';
      let code = randomRoomCode();
      while (rooms.has(code)) code = randomRoomCode();
      const room = createRoom(code);
      rooms.set(code, room);
      attachPlayerToRoom(room, makePlayer(playerId, character, ws));
      return;
    }

    if (message.type === 'join_room') {
      const code = String(message.code || '').toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found.' }));
        return;
      }
      if (room.players.size >= 2) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is full (2 players max).' }));
        return;
      }
      const character = message.character === 'girl' ? 'girl' : 'boy';
      const existing = [...room.players.values()][0];
      if (existing && existing.character === character) {
        ws.send(JSON.stringify({ type: 'error', message: 'Pick the other character so one Boy + one Girl can play.' }));
        return;
      }
      attachPlayerToRoom(room, makePlayer(playerId, character, ws));
      return;
    }

    const room = getRoomByPlayer(playerId);
    if (!room) return;
    const player = room.players.get(playerId);
    if (!player) return;

    if (message.type === 'input') {
      const input = message.input || {};
      player.input.up = !!input.up;
      player.input.down = !!input.down;
      player.input.left = !!input.left;
      player.input.right = !!input.right;
      player.input.sprint = !!input.sprint;
      player.input.attack = !!input.attack;
      player.input.yaw = Number.isFinite(input.yaw) ? input.yaw : 0;
      return;
    }

    if (message.type === 'girl_attack' && player.character === 'girl') {
      roomBroadcast(room, {
        type: 'girl_attack_event',
        playerId,
        step: message.step === 'kick' ? 'kick' : 'punch',
        at: Date.now()
      });
      return;
    }

    if (message.type === 'boy_attack' && player.character === 'boy') {
      const attackType = message.attackType === 'kick' || message.attackType === 'jump' ? message.attackType : 'fist';
      roomBroadcast(room, {
        type: 'boy_attack_event',
        playerId,
        attackType,
        at: Date.now()
      });
      return;
    }

    if (message.type === 'boy_dance' && player.character === 'boy') {
      roomBroadcast(room, {
        type: 'boy_dance_event',
        playerId,
        durationMs: Number.isFinite(message.durationMs) ? message.durationMs : 5000,
        at: Date.now()
      });
      return;
    }

    if (message.type === 'proposal_response' && room.proposal.active) {
      player.proposalVote = message.accept ? 'yes' : 'no';
      const votes = [...room.players.values()].map((p) => p.proposalVote);
      if (votes.every((v) => v)) {
        room.proposal.answered = true;
        room.proposal.accepted = votes.every((v) => v === 'yes');
        room.ended = true;
        roomBroadcast(room, {
          type: 'match_end',
          accepted: room.proposal.accepted,
          votes: [...room.players.values()].map((p) => ({ id: p.id, vote: p.proposalVote }))
        });
      }
    }
  });

  ws.on('close', () => removePlayer(playerId));
});

let lastTick = Date.now();
let simNow = lastTick;
let accumulatorMs = 0;
setInterval(() => {
  const now = Date.now();
  const frameMs = Math.min(100, Math.max(0, now - lastTick));
  lastTick = now;
  accumulatorMs += frameMs;

  let steps = 0;
  while (accumulatorMs >= FIXED_DT_MS && steps < 8) {
    simNow += FIXED_DT_MS;
    for (const room of rooms.values()) {
      stepRoom(room, simNow, FIXED_DT_MS);
    }
    accumulatorMs -= FIXED_DT_MS;
    steps += 1;
  }

  for (const room of rooms.values()) {
    if (!room.started) continue;
    const shouldBroadcast = simNow - room.lastNetworkBroadcastAt >= NETWORK_MS;
    if (!shouldBroadcast) continue;
    room.lastNetworkBroadcastAt = simNow;
    for (const player of room.players.values()) {
      if (player.ws.readyState !== 1) continue;
      player.ws.send(JSON.stringify(makeStateFor(room, player.id, simNow)));
    }
  }
}, TICK_MS);

function getLanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

async function findOpenPort(startPort) {
  for (let port = startPort; port < startPort + 25; port += 1) {
    const ok = await new Promise((resolve) => {
      const probe = net.createServer();
      probe.once('error', () => resolve(false));
      probe.once('listening', () => {
        probe.close(() => resolve(true));
      });
      probe.listen(port, '0.0.0.0');
    });
    if (ok) return port;
  }
  return startPort;
}

async function startServer() {
  const openPort = await findOpenPort(PORT);
  server.listen(openPort, '0.0.0.0', () => {
    if (openPort !== PORT) {
      console.log(`Port ${PORT} unavailable, using ${openPort}.`);
    }
    console.log(`Server listening on http://0.0.0.0:${openPort}`);
    const ips = getLanAddresses();
    if (ips.length === 0) {
      console.log(`LAN URL: http://localhost:${openPort}`);
    } else {
      for (const ip of ips) {
        console.log(`LAN URL: http://${ip}:${openPort}`);
      }
    }
  });
}

startServer();
