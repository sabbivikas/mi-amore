const canvas = document.querySelector("#world");
const ctx = canvas.getContext("2d", { alpha: false });

const statusEl = document.querySelector("#status");
const consoleEl = document.querySelector("#console");
const toggleConsoleEl = document.querySelector("#toggleConsole");
const seedInputEl = document.querySelector("#seedInput");
const ruleInputEl = document.querySelector("#ruleInput");
const applyRuleEl = document.querySelector("#applyRule");
const saveWorldEl = document.querySelector("#saveWorld");
const loadWorldEl = document.querySelector("#loadWorld");
const ruleListEl = document.querySelector("#ruleList");
const logEl = document.querySelector("#log");

const SAVE_KEY = "lawborne_world_v1";
const WORLD_SIZE = 96;
const TILE_SIZE = 16;
const ENTITY_BUDGET = 140;
const MAX_FRAME_DT = 0.05;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2654435761);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xf = x - x0;
  const yf = y - y0;

  const r00 = hash2(x0, y0, seed) / 0xffffffff;
  const r10 = hash2(x0 + 1, y0, seed) / 0xffffffff;
  const r01 = hash2(x0, y0 + 1, seed) / 0xffffffff;
  const r11 = hash2(x0 + 1, y0 + 1, seed) / 0xffffffff;

  const u = smoothstep(xf);
  const v = smoothstep(yf);

  const a = lerp(r00, r10, u);
  const b = lerp(r01, r11, u);
  return lerp(a, b, v);
}

function fbm(x, y, seed, octaves = 4) {
  let amp = 1;
  let freq = 0.016;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 31) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}

class RuleInterpreter {
  parseLines(inputText) {
    const lines = inputText
      .split(/[\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const parsed = [];
    const notes = [];

    for (const line of lines) {
      const text = line.toLowerCase();
      let matched = false;

      if (text.includes("forest")) {
        parsed.push(this.makeRule("terrain", "forest_density", 0.72, 30, line));
        parsed.push(this.makeRule("terrain", "tree_rate", 0.16, 30, line));
        matched = true;
      }

      if (text.includes("animals avoid shadows") || text.includes("avoid shadow")) {
        parsed.push(this.makeRule("entities", "avoid_shadows", true, 60, line));
        matched = true;
      }

      if (text.includes("trees") && text.includes("move") && text.includes("light")) {
        parsed.push(this.makeRule("entities", "trees_seek_light", true, 55, line));
        parsed.push(this.makeRule("entities", "tree_drift_rate", 0.18, 55, line));
        matched = true;
      }

      if (text.includes("water") && text.includes("poison") && text.includes("night")) {
        parsed.push(this.makeRule("materials", "water_poison_night", true, 70, line));
        parsed.push(this.makeRule("materials", "water_poison_damage", 5.5, 70, line));
        matched = true;
      }

      if (text.includes("gravity") && text.includes("weak") && text.includes("mountain")) {
        parsed.push(this.makeRule("environment", "gravity_near_mountains", 0.42, 75, line));
        parsed.push(this.makeRule("environment", "mountain_gravity_radius", 9, 75, line));
        matched = true;
      }

      if (text.includes("full moon") || text.includes("moon")) {
        parsed.push(this.makeRule("environment", "full_moon_night", true, 40, line));
        matched = true;
      }

      if (text.includes("sunset") || text.includes("sun rise") || text.includes("sunrise")) {
        parsed.push(this.makeRule("environment", "sun_cycle", true, 40, line));
        matched = true;
      }

      if (!matched) {
        notes.push(`No safe mapping for: "${line}"`);
      }
    }

    if (!parsed.length && lines.length) {
      notes.push("Interpreter accepted no executable rules. Use concrete law statements.");
    }

    return { rules: parsed, notes };
  }

  makeRule(domain, key, value, priority, source) {
    return {
      id: `${domain}:${key}:${hashString(source + Date.now() + Math.random())}`,
      domain,
      key,
      value,
      priority,
      source,
      createdAt: Date.now(),
    };
  }
}

class ConflictResolver {
  static defaults() {
    return {
      terrain: {
        forest_density: 0.4,
        tree_rate: 0.08,
        water_level: 0.37,
        mountain_sharpness: 0.68,
      },
      materials: {
        water_poison_night: false,
        water_poison_damage: 0,
      },
      entities: {
        avoid_shadows: false,
        trees_seek_light: false,
        tree_drift_rate: 0.08,
        adaptation_rate: 0.22,
      },
      environment: {
        gravity: 9.8,
        gravity_near_mountains: 1,
        mountain_gravity_radius: 0,
        day_length: 160,
        full_moon_night: true,
        sun_cycle: true,
      },
    };
  }

  static resolve(ruleList) {
    const config = this.defaults();
    const sorted = [...ruleList].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.createdAt - b.createdAt;
    });

    for (const rule of sorted) {
      if (!config[rule.domain]) continue;
      config[rule.domain][rule.key] = rule.value;
    }

    return config;
  }
}

class ProceduralWorld {
  constructor(size) {
    this.size = size;
    this.grid = [];
    this.seed = 0;
  }

  generate(seedText, config) {
    this.seed = hashString(seedText);
    this.grid = new Array(this.size);

    for (let y = 0; y < this.size; y++) {
      this.grid[y] = new Array(this.size);
      for (let x = 0; x < this.size; x++) {
        const elev = fbm(x, y, this.seed + 101, 5);
        const moist = fbm(x + 100, y + 200, this.seed + 202, 4);
        const lightBias = fbm(x - 80, y + 40, this.seed + 303, 3);

        const mountain = Math.pow(clamp(elev, 0, 1), 1 + config.terrain.mountain_sharpness);
        const water = elev < config.terrain.water_level;

        let material = "grass";
        if (water) material = "water";
        else if (mountain > 0.66) material = "mountain";
        else if (moist < 0.28) material = "dry";

        const hasTree = !water && material !== "mountain" && moist > 0.42 && (hash2(x, y, this.seed + 777) / 0xffffffff) < config.terrain.tree_rate;

        this.grid[y][x] = {
          x,
          y,
          elevation: mountain,
          moisture: moist,
          lightBias,
          material,
          hasTree,
          grassTuft: material === "grass" && moist > 0.4 && (hash2(x, y, this.seed + 999) & 7) < 3,
          shadow: false,
        };
      }
    }
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  get(x, y) {
    if (!this.inBounds(x, y)) return null;
    return this.grid[y][x];
  }

  forEachCell(fn) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        fn(this.grid[y][x]);
      }
    }
  }

  recomputeShadows(sunDir) {
    this.forEachCell((cell) => {
      cell.shadow = false;
    });

    const sx = Math.round(-sunDir.x);
    const sy = Math.round(-sunDir.y);

    if (sx === 0 && sy === 0) return;

    this.forEachCell((cell) => {
      if (cell.material !== "mountain" && !cell.hasTree) return;
      const len = cell.material === "mountain" ? 7 : 3;
      for (let i = 1; i <= len; i++) {
        const tx = cell.x + sx * i;
        const ty = cell.y + sy * i;
        const t = this.get(tx, ty);
        if (!t) break;
        t.shadow = true;
      }
    });
  }
}

class PhysicsEngine {
  constructor(configGetter, worldGetter) {
    this.getConfig = configGetter;
    this.getWorld = worldGetter;
  }

  gravityScaleFor(entity) {
    const config = this.getConfig();
    const world = this.getWorld();
    const cx = Math.round(entity.x);
    const cy = Math.round(entity.y);
    const r = config.environment.mountain_gravity_radius;

    if (!r || config.environment.gravity_near_mountains >= 1) return 1;

    let mountainWeight = 0;
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        const c = world.get(cx + ox, cy + oy);
        if (!c) continue;
        if (c.material === "mountain") {
          const d = Math.max(1, Math.hypot(ox, oy));
          mountainWeight += 1 / d;
        }
      }
    }

    const influence = clamp(mountainWeight / 6, 0, 1);
    return lerp(1, config.environment.gravity_near_mountains, influence);
  }

  step(entity, dt) {
    const cfg = this.getConfig();
    const gScale = this.gravityScaleFor(entity);
    const g = cfg.environment.gravity * gScale;

    entity.vz -= g * dt;
    entity.z += entity.vz * dt;

    if (entity.z <= 0) {
      entity.z = 0;
      entity.vz = 0;
      entity.grounded = true;
    } else {
      entity.grounded = false;
    }
  }
}

class EntitySystem {
  constructor(worldGetter, configGetter, playerGetter) {
    this.entities = [];
    this.getWorld = worldGetter;
    this.getConfig = configGetter;
    this.getPlayer = playerGetter;
    this.playerScareCount = 0;
  }

  clear() {
    this.entities = [];
    this.playerScareCount = 0;
  }

  spawnEcosystem(seedText) {
    const world = this.getWorld();
    const cfg = this.getConfig();
    const seed = hashString(seedText + "|entities");
    const rng = makeRng(seed);

    const treeBudget = Math.floor(160 * cfg.terrain.forest_density);
    const animalBudget = 36;

    let trees = 0;
    let attempts = 0;
    while (trees < treeBudget && attempts < 9000) {
      attempts++;
      const x = Math.floor(rng() * world.size);
      const y = Math.floor(rng() * world.size);
      const c = world.get(x, y);
      if (!c || c.material !== "grass") continue;
      if (!c.hasTree) continue;
      this.entities.push(this.makeEntity("tree", x + 0.5, y + 0.5));
      trees++;
    }

    let animals = 0;
    attempts = 0;
    while (animals < animalBudget && attempts < 9000) {
      attempts++;
      const x = Math.floor(rng() * world.size);
      const y = Math.floor(rng() * world.size);
      const c = world.get(x, y);
      if (!c || c.material !== "grass") continue;
      if (c.shadow) continue;
      const type = rng() < 0.5 ? "cow" : "sheep";
      this.entities.push(this.makeEntity(type, x + 0.5, y + 0.5));
      animals++;
    }
  }

  makeEntity(type, x, y) {
    return {
      id: `${type}-${Math.floor(Math.random() * 1e9)}`,
      type,
      x,
      y,
      z: 0,
      vz: 0,
      grounded: true,
      vx: 0,
      vy: 0,
      heading: Math.random() * Math.PI * 2,
      turnCooldown: 1 + Math.random() * 2,
      speed: type === "tree" ? 0.18 : 1.2 + Math.random() * 0.7,
      health: 100,
      hunger: Math.random() * 0.3,
      age: 0,
      state: "idle",
      avoidStrength: 0.55,
    };
  }

  update(dt, daytime) {
    const world = this.getWorld();
    const cfg = this.getConfig();
    const player = this.getPlayer();

    const count = Math.min(this.entities.length, ENTITY_BUDGET);

    for (let i = 0; i < count; i++) {
      const e = this.entities[i];
      e.age += dt;

      if (e.type === "tree") {
        this.updateTree(e, dt, daytime, cfg, world);
      } else {
        this.updateAnimal(e, dt, daytime, cfg, world, player);
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.x = clamp(e.x, 0.2, world.size - 0.2);
      e.y = clamp(e.y, 0.2, world.size - 0.2);
    }

    this.ecosystemTick(dt, world, cfg);
  }

  updateTree(e, dt, daytime, cfg, world) {
    const cell = world.get(Math.floor(e.x), Math.floor(e.y));
    if (!cell) return;

    e.vx = 0;
    e.vy = 0;

    if (cfg.entities.trees_seek_light) {
      const drift = cfg.entities.tree_drift_rate * (0.3 + daytime * 0.7);
      const nx = clamp(cell.lightBias * 2 - 1, -1, 1);
      const ny = clamp((1 - cell.moisture) * 2 - 1, -1, 1);
      e.vx = nx * drift;
      e.vy = ny * drift;

      const targetCell = world.get(Math.floor(e.x + e.vx * dt * 3), Math.floor(e.y + e.vy * dt * 3));
      if (!targetCell || targetCell.material !== "grass") {
        e.vx = 0;
        e.vy = 0;
      }
    }
  }

  updateAnimal(e, dt, daytime, cfg, world, player) {
    e.turnCooldown -= dt;
    e.hunger = clamp(e.hunger + dt * 0.01, 0, 1);

    const dxp = player.x - e.x;
    const dyp = player.y - e.y;
    const distPlayer = Math.hypot(dxp, dyp);

    if (distPlayer < 5.5 && player.sprint) {
      const fleeAngle = Math.atan2(-dyp, -dxp);
      e.heading = fleeAngle + (Math.random() - 0.5) * 0.3;
      e.state = "flee";
      this.playerScareCount += dt;
    } else if (e.turnCooldown <= 0) {
      e.heading += (Math.random() - 0.5) * 1.4;
      e.turnCooldown = 0.5 + Math.random() * 2.2;
      e.state = "wander";
    }

    let avoidX = 0;
    let avoidY = 0;

    if (cfg.entities.avoid_shadows) {
      for (let oy = -2; oy <= 2; oy++) {
        for (let ox = -2; ox <= 2; ox++) {
          const c = world.get(Math.floor(e.x + ox), Math.floor(e.y + oy));
          if (!c || !c.shadow) continue;
          const d = Math.max(0.7, Math.hypot(ox, oy));
          avoidX -= ox / d;
          avoidY -= oy / d;
        }
      }
    }

    const baseSpeed = e.speed * (e.state === "flee" ? 1.7 : 1) * (0.75 + daytime * 0.5);
    const dirX = Math.cos(e.heading);
    const dirY = Math.sin(e.heading);

    e.vx = dirX * baseSpeed + avoidX * e.avoidStrength;
    e.vy = dirY * baseSpeed + avoidY * e.avoidStrength;

    const nextCell = world.get(Math.floor(e.x + e.vx * dt * 2), Math.floor(e.y + e.vy * dt * 2));
    if (!nextCell || nextCell.material === "water" || nextCell.material === "mountain") {
      e.heading += Math.PI * (0.4 + Math.random() * 0.5);
      e.vx = 0;
      e.vy = 0;
    }

    if (nextCell && cfg.materials.water_poison_night && nextCell.material === "water" && daytime < 0.32) {
      e.health -= cfg.materials.water_poison_damage * dt;
    }

    if (e.health <= 0) {
      e.x = -999;
      e.y = -999;
    }
  }

  ecosystemTick(dt, world, cfg) {
    if (!this._ecoTimer) this._ecoTimer = 0;
    this._ecoTimer += dt;
    if (this._ecoTimer < 1.2) return;
    this._ecoTimer = 0;

    this.entities = this.entities.filter((e) => e.x > -100);

    const adaptation = clamp(this.playerScareCount * cfg.entities.adaptation_rate * 0.02, 0, 0.55);
    for (const e of this.entities) {
      if (e.type === "cow" || e.type === "sheep") {
        e.avoidStrength = 0.55 + adaptation;
      }
    }
    this.playerScareCount *= 0.85;

    if (this.entities.length < 45) {
      const rng = makeRng(hashString(String(Date.now()) + String(this.entities.length)));
      const type = rng() < 0.5 ? "cow" : "sheep";
      for (let i = 0; i < 30; i++) {
        const x = Math.floor(rng() * world.size);
        const y = Math.floor(rng() * world.size);
        const c = world.get(x, y);
        if (!c || c.material !== "grass" || c.shadow) continue;
        this.entities.push(this.makeEntity(type, x + 0.5, y + 0.5));
        break;
      }
    }

    if (cfg.entities.trees_seek_light && this.entities.filter((e) => e.type === "tree").length < 220) {
      const rng = makeRng(hashString("trees" + Date.now()));
      for (let i = 0; i < 50; i++) {
        const x = Math.floor(rng() * world.size);
        const y = Math.floor(rng() * world.size);
        const c = world.get(x, y);
        if (!c || c.material !== "grass" || c.shadow) continue;
        if ((hash2(x, y, world.seed + 5050) & 7) !== 0) continue;
        this.entities.push(this.makeEntity("tree", x + 0.5, y + 0.5));
        break;
      }
    }
  }
}

class Renderer {
  constructor(canvas, context, worldGetter, entitiesGetter, playerGetter, configGetter) {
    this.canvas = canvas;
    this.ctx = context;
    this.getWorld = worldGetter;
    this.getEntities = entitiesGetter;
    this.getPlayer = playerGetter;
    this.getConfig = configGetter;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(daytime) {
    const world = this.getWorld();
    const entities = this.getEntities();
    const player = this.getPlayer();
    const cfg = this.getConfig();

    const w = window.innerWidth;
    const h = window.innerHeight;
    const cx = w / 2;
    const cy = h / 2;

    this.ctx.fillStyle = daytime > 0.5 ? "#91d0ff" : "#1a2744";
    this.ctx.fillRect(0, 0, w, h);

    const camX = player.x * TILE_SIZE;
    const camY = player.y * TILE_SIZE;

    const minTileX = Math.floor((camX - cx) / TILE_SIZE) - 2;
    const minTileY = Math.floor((camY - cy) / TILE_SIZE) - 2;
    const maxTileX = minTileX + Math.ceil(w / TILE_SIZE) + 4;
    const maxTileY = minTileY + Math.ceil(h / TILE_SIZE) + 4;

    for (let ty = minTileY; ty <= maxTileY; ty++) {
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        const c = world.get(tx, ty);
        if (!c) continue;
        const sx = tx * TILE_SIZE - camX + cx;
        const sy = ty * TILE_SIZE - camY + cy;

        let color = "#4f9d4f";
        if (c.material === "water") color = "#3e7bc4";
        else if (c.material === "mountain") color = "#73828a";
        else if (c.material === "dry") color = "#a58b4e";

        if (daytime < 0.35) color = this.tint(color, 0.55);
        if (c.shadow) color = this.tint(color, 0.74);

        this.ctx.fillStyle = color;
        this.ctx.fillRect(sx, sy, TILE_SIZE + 1, TILE_SIZE + 1);

        if (c.grassTuft && c.material === "grass") {
          this.ctx.fillStyle = daytime > 0.4 ? "#86d567" : "#3e6f3d";
          this.ctx.fillRect(sx + 6, sy + 7, 2, 7);
          this.ctx.fillRect(sx + 8, sy + 6, 2, 8);
          this.ctx.fillRect(sx + 10, sy + 8, 2, 6);
        }
      }
    }

    const moonAlpha = cfg.environment.full_moon_night ? clamp((0.4 - daytime) * 1.8, 0, 0.9) : 0;
    if (moonAlpha > 0.01) {
      this.ctx.fillStyle = `rgba(220, 235, 255, ${moonAlpha})`;
      this.ctx.beginPath();
      this.ctx.arc(w - 120, 90, 28, 0, Math.PI * 2);
      this.ctx.fill();
    }

    const sunAlpha = clamp((daytime - 0.2) * 1.2, 0, 0.95);
    this.ctx.fillStyle = `rgba(255, 242, 173, ${sunAlpha})`;
    this.ctx.beginPath();
    this.ctx.arc(w - 120, 90, 32, 0, Math.PI * 2);
    this.ctx.fill();

    const sortEntities = [...entities].sort((a, b) => a.y - b.y);
    for (const e of sortEntities) {
      if (e.x < 0 || e.y < 0) continue;
      const ex = e.x * TILE_SIZE - camX + cx;
      const ey = e.y * TILE_SIZE - camY + cy;
      this.drawEntity(e, ex, ey, daytime);
    }

    this.ctx.fillStyle = "#f3fff7";
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, 7, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = "rgba(0,0,0,0.22)";
    this.ctx.fillRect(0, h - 32, w, 32);
    this.ctx.fillStyle = "#daf4df";
    this.ctx.font = "12px monospace";
    this.ctx.fillText("WASD move | Space hop | Shift sprint | ` world console", 12, h - 12);
  }

  drawEntity(e, x, y, daytime) {
    const dark = daytime < 0.4;

    if (e.type === "tree") {
      this.ctx.fillStyle = dark ? "#375d2f" : "#4d7f3d";
      this.ctx.fillRect(x - 2, y - 7, 4, 10);
      this.ctx.fillStyle = dark ? "#45793f" : "#5ca552";
      this.ctx.beginPath();
      this.ctx.arc(x, y - 10, 7, 0, Math.PI * 2);
      this.ctx.fill();
      return;
    }

    const base = e.type === "cow" ? (dark ? "#8b735e" : "#b6997e") : (dark ? "#b6beb8" : "#ecefe7");
    const head = e.type === "cow" ? (dark ? "#7f654e" : "#8f745c") : (dark ? "#d6dcd5" : "#fafcf4");

    this.ctx.fillStyle = base;
    this.ctx.fillRect(x - 8, y - 4, 16, 9);
    this.ctx.fillStyle = head;
    this.ctx.fillRect(x + 7, y - 3, 7, 6);
    this.ctx.fillStyle = "#2e2014";
    this.ctx.fillRect(x - 7, y + 4, 2, 4);
    this.ctx.fillRect(x - 2, y + 4, 2, 4);
    this.ctx.fillRect(x + 3, y + 4, 2, 4);
    this.ctx.fillRect(x + 8, y + 4, 2, 4);

    if (e.type === "cow") {
      this.ctx.fillStyle = "#3e2f22";
      this.ctx.fillRect(x - 4, y - 2, 4, 3);
      this.ctx.fillRect(x + 1, y + 1, 3, 2);
    }
  }

  tint(hex, mul) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(((n >> 16) & 255) * mul, 0, 255) | 0;
    const g = clamp(((n >> 8) & 255) * mul, 0, 255) | 0;
    const b = clamp((n & 255) * mul, 0, 255) | 0;
    return `rgb(${r},${g},${b})`;
  }
}

class Game {
  constructor() {
    this.ruleInterpreter = new RuleInterpreter();
    this.rules = [];
    this.config = ConflictResolver.defaults();
    this.world = new ProceduralWorld(WORLD_SIZE);

    this.player = {
      x: WORLD_SIZE / 2,
      y: WORLD_SIZE / 2,
      z: 0,
      vz: 0,
      grounded: true,
      sprint: false,
      health: 100,
    };

    this.physics = new PhysicsEngine(() => this.config, () => this.world);
    this.entitySystem = new EntitySystem(() => this.world, () => this.config, () => this.player);
    this.renderer = new Renderer(
      canvas,
      ctx,
      () => this.world,
      () => this.entitySystem.entities,
      () => this.player,
      () => this.config
    );

    this.input = {
      up: false,
      down: false,
      left: false,
      right: false,
      jump: false,
      sprint: false,
    };

    this.time = 0;
    this.last = performance.now();
    this.seedText = seedInputEl.value.trim();
    this.logMessages = [];

    this.bindUI();
    this.bindInput();
    this.renderer.resize();
    this.resetWorld();
  }

  bindUI() {
    toggleConsoleEl.addEventListener("click", () => {
      consoleEl.classList.toggle("open");
    });

    applyRuleEl.addEventListener("click", () => {
      const text = ruleInputEl.value.trim();
      if (!text) return;
      const result = this.ruleInterpreter.parseLines(text);
      this.rules.push(...result.rules);
      this.log(...result.notes, `${result.rules.length} executable rule(s) added.`);
      this.rebuildFromRules(false);
      ruleInputEl.value = "";
    });

    saveWorldEl.addEventListener("click", () => {
      this.save();
      this.log("World saved.");
    });

    loadWorldEl.addEventListener("click", () => {
      this.load();
    });

    seedInputEl.addEventListener("change", () => {
      this.seedText = seedInputEl.value.trim() || "Lawborne World";
      this.rebuildFromRules(true);
    });

    window.addEventListener("resize", () => this.renderer.resize());
    window.addEventListener("keydown", (e) => {
      if (e.code === "Backquote") {
        consoleEl.classList.toggle("open");
      }
    });
  }

  bindInput() {
    const mapping = {
      KeyW: "up",
      KeyS: "down",
      KeyA: "left",
      KeyD: "right",
      Space: "jump",
      ShiftLeft: "sprint",
    };

    window.addEventListener("keydown", (e) => {
      const key = mapping[e.code];
      if (!key) return;
      this.input[key] = true;
      if (e.code === "Space") e.preventDefault();
    });

    window.addEventListener("keyup", (e) => {
      const key = mapping[e.code];
      if (!key) return;
      this.input[key] = false;
    });
  }

  log(...messages) {
    for (const m of messages) {
      if (!m) continue;
      this.logMessages.push(`[${new Date().toLocaleTimeString()}] ${m}`);
    }
    this.logMessages = this.logMessages.slice(-20);
    logEl.textContent = this.logMessages.join("\n");
  }

  rebuildFromRules(regenerateWorld) {
    this.config = ConflictResolver.resolve(this.rules);
    if (regenerateWorld) {
      this.resetWorld();
    }
    this.refreshRuleList();
    this.save();
  }

  resetWorld() {
    this.world.generate(this.seedText, this.config);
    this.entitySystem.clear();
    this.entitySystem.spawnEcosystem(this.seedText + JSON.stringify(this.config));

    const center = this.world.get(Math.floor(WORLD_SIZE / 2), Math.floor(WORLD_SIZE / 2));
    this.player.x = center ? center.x + 0.5 : WORLD_SIZE / 2;
    this.player.y = center ? center.y + 0.5 : WORLD_SIZE / 2;
    this.player.z = 0;
    this.player.vz = 0;

    this.log("World regenerated from text seed and active laws.");
    this.refreshRuleList();
  }

  refreshRuleList() {
    ruleListEl.innerHTML = "";
    const grouped = this.rules.slice(-25);
    for (const r of grouped) {
      const li = document.createElement("li");
      li.textContent = `${r.domain}.${r.key} = ${JSON.stringify(r.value)} (p${r.priority})`;
      ruleListEl.appendChild(li);
    }
  }

  save() {
    const payload = {
      seedText: this.seedText,
      rules: this.rules,
      player: this.player,
      time: this.time,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  }

  load() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      this.log("No saved world found.");
      return;
    }

    try {
      const data = JSON.parse(raw);
      this.seedText = data.seedText || this.seedText;
      seedInputEl.value = this.seedText;
      this.rules = Array.isArray(data.rules) ? data.rules : [];
      this.config = ConflictResolver.resolve(this.rules);
      this.world.generate(this.seedText, this.config);
      this.entitySystem.clear();
      this.entitySystem.spawnEcosystem(this.seedText + JSON.stringify(this.config));

      if (data.player) {
        this.player.x = clamp(data.player.x || this.player.x, 0, WORLD_SIZE - 1);
        this.player.y = clamp(data.player.y || this.player.y, 0, WORLD_SIZE - 1);
        this.player.z = clamp(data.player.z || 0, 0, 10);
        this.player.vz = data.player.vz || 0;
      }
      this.time = data.time || 0;
      this.refreshRuleList();
      this.log("World loaded.");
    } catch (err) {
      this.log("Save file invalid.");
    }
  }

  getDaytime() {
    const cycle = this.config.environment.day_length;
    const t = (this.time % cycle) / cycle;
    return clamp(Math.sin(t * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5, 0, 1);
  }

  updatePlayer(dt, daytime) {
    const speed = this.input.sprint ? 6.2 : 4.1;
    this.player.sprint = !!this.input.sprint;

    let dx = 0;
    let dy = 0;
    if (this.input.up) dy -= 1;
    if (this.input.down) dy += 1;
    if (this.input.left) dx -= 1;
    if (this.input.right) dx += 1;

    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;

    const nx = this.player.x + dx * speed * dt;
    const ny = this.player.y + dy * speed * dt;
    const target = this.world.get(Math.floor(nx), Math.floor(ny));

    if (target && target.material !== "mountain") {
      this.player.x = nx;
      this.player.y = ny;
    }

    if (this.input.jump && this.player.grounded) {
      this.player.vz = 4.6;
    }

    this.physics.step(this.player, dt);

    const standing = this.world.get(Math.floor(this.player.x), Math.floor(this.player.y));
    if (standing && standing.material === "water" && this.config.materials.water_poison_night && daytime < 0.35) {
      this.player.health -= this.config.materials.water_poison_damage * dt;
    }

    this.player.health = clamp(this.player.health, 0, 100);
  }

  tick(now) {
    const dt = Math.min(MAX_FRAME_DT, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;

    const daytime = this.getDaytime();
    const sunDir = {
      x: Math.cos((this.time / this.config.environment.day_length) * Math.PI * 2),
      y: Math.sin((this.time / this.config.environment.day_length) * Math.PI * 2),
    };

    this.world.recomputeShadows(sunDir);
    this.updatePlayer(dt, daytime);
    this.entitySystem.update(dt, daytime);
    for (const e of this.entitySystem.entities) {
      this.physics.step(e, dt);
    }

    this.renderer.render(daytime);

    statusEl.textContent = [
      `seed=${hashString(this.seedText)}`,
      `laws=${this.rules.length}`,
      `entities=${this.entitySystem.entities.length}`,
      `time=${(this.time % this.config.environment.day_length).toFixed(1)}`,
      `playerHP=${this.player.health.toFixed(0)}`,
    ].join(" | ");

    if (!this._autosave) this._autosave = 0;
    this._autosave += dt;
    if (this._autosave > 3.2) {
      this._autosave = 0;
      this.save();
    }

    requestAnimationFrame((t) => this.tick(t));
  }

  start() {
    this.log("Simulation started.");
    requestAnimationFrame((t) => {
      this.last = t;
      this.tick(t);
    });
  }
}

const game = new Game();

const initialPrompt = seedInputEl.value.trim();
if (initialPrompt) {
  const initial = game.ruleInterpreter.parseLines(initialPrompt);
  game.rules.push(...initial.rules);
  game.log(...initial.notes, "Initial world laws compiled from seed text.");
  game.rebuildFromRules(true);
}

game.start();
