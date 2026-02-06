import * as THREE from 'three';
import { ProjectileManager, Projectile } from '../combat/Projectiles';
import { AlienKind, createAlienShip } from './AlienShips';

export type ProtectZone = { id: string; position: THREE.Vector3; radius: number; health: number };

interface Alien {
  mesh: THREE.Group;
  kind: AlienKind;
  velocity: THREE.Vector3;
  state: 'patrol' | 'intercept' | 'break';
  baseSpeed: number;
  agility: number;
  hitRadius: number;
  phase: number;
  spinRate: number;
  hoverBaseY: number;
  shield: number;
  health: number;
  targetOffset: THREE.Vector3;
  fireCooldown: number;
}

interface EnemyShot {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  active: boolean;
}

export class AlienDirector {
  private readonly scene: THREE.Scene;
  private readonly aliens: Alien[] = [];
  private readonly enemyShots: EnemyShot[] = [];
  private wave = 1;
  private waveTimer = 0;
  private threat = 0;
  private nearMissPulse = 0;
  private readonly bounds: THREE.Box3;
  public readonly zones: ProtectZone[];

  constructor(scene: THREE.Scene, zones: ProtectZone[], bounds: THREE.Box3) {
    this.scene = scene;
    this.zones = zones;
    this.bounds = bounds;
    this.spawnWave();
  }

  update(dt: number, player: THREE.Object3D, projectiles: Projectile[], projectileFx: ProjectileManager) {
    this.waveTimer += dt;
    if (this.aliens.length === 0 && this.waveTimer > 3) {
      this.wave += 1;
      this.spawnWave();
    }

    for (const alien of this.aliens) {
      this.updateAlien(dt, alien, player);
      this.tryAlienFire(alien, player, dt);
    }

    this.updateEnemyShots(dt, player);
    this.handleZoneDamage(dt);
    this.handleProjectileHits(projectiles, projectileFx);
    this.cleanup();
    this.updateThreat(player);
  }

  getAliens(): Alien[] {
    return this.aliens;
  }

  getWave(): number {
    return this.wave;
  }

  getThreat(): number {
    return this.threat;
  }

  consumeNearMissPulse(): number {
    const pulse = this.nearMissPulse;
    this.nearMissPulse = 0;
    return pulse;
  }

  private spawnWave() {
    this.waveTimer = 0;
    const spawnBoss = this.wave > 0 && this.wave % 5 === 0;
    const baseCount = 4 + this.wave * 2;
    const count = spawnBoss ? Math.max(6, baseCount - 3) : baseCount;

    if (spawnBoss) {
      const boss = this.createAlien('boss');
      boss.mesh.position.set(0, THREE.MathUtils.randFloat(260, 360), -220);
      boss.hoverBaseY = boss.mesh.position.y;
      this.scene.add(boss.mesh);
      this.aliens.push(boss);
    }

    for (let i = 0; i < count; i += 1) {
      const kind: AlienKind = Math.random() < 0.68 ? 'interceptor' : 'tank';
      const alien = this.createAlien(kind);
      alien.mesh.position.set(
        THREE.MathUtils.randFloat(-600, 600),
        THREE.MathUtils.randFloat(140, 320),
        THREE.MathUtils.randFloat(-600, 600)
      );
      alien.hoverBaseY = alien.mesh.position.y;
      this.scene.add(alien.mesh);
      this.aliens.push(alien);
    }
  }

  private updateAlien(dt: number, alien: Alien, player: THREE.Object3D) {
    const toPlayer = player.position.clone().add(alien.targetOffset).sub(alien.mesh.position);
    const distance = toPlayer.length();

    if (distance < 220 && alien.state !== 'intercept') alien.state = 'intercept';
    if (distance > 420 && alien.state === 'intercept') alien.state = 'break';
    if (alien.state === 'break' && distance > 520) alien.state = 'patrol';

    let desired = new THREE.Vector3();
    if (alien.state === 'patrol') {
      desired.set(Math.sin(performance.now() * 0.0005 + alien.mesh.position.x), 0, Math.cos(performance.now() * 0.0005));
      desired.y = Math.sin(performance.now() * 0.001 + alien.phase) * 0.2;
    } else if (alien.state === 'intercept') {
      desired.copy(toPlayer).normalize();
    } else {
      desired.copy(toPlayer).normalize().negate();
    }

    const speed = alien.baseSpeed + this.wave * (alien.kind === 'interceptor' ? 7 : 4);
    alien.velocity.lerp(desired.multiplyScalar(speed), alien.agility * dt);
    alien.mesh.position.addScaledVector(alien.velocity, dt);
    alien.hoverBaseY = THREE.MathUtils.lerp(alien.hoverBaseY, alien.mesh.position.y, 0.18);
    this.animateAlien(alien);

    if (!this.bounds.containsPoint(alien.mesh.position)) {
      alien.mesh.position.clamp(this.bounds.min, this.bounds.max);
    }
  }

  private updateEnemyShots(dt: number, player: THREE.Object3D) {
    for (const shot of this.enemyShots) {
      if (!shot.active) continue;
      shot.mesh.position.addScaledVector(shot.velocity, dt);
      shot.life -= dt;

      const dist = shot.mesh.position.distanceTo(player.position);
      if (dist < 18) {
        this.nearMissPulse = Math.max(this.nearMissPulse, 0.35);
      }

      if (shot.life <= 0) {
        shot.active = false;
        shot.mesh.visible = false;
      }
    }
  }

  private tryAlienFire(alien: Alien, player: THREE.Object3D, dt: number) {
    if (alien.kind !== 'tank' && alien.kind !== 'boss') return;

    alien.fireCooldown = Math.max(0, alien.fireCooldown - dt);
    if (alien.fireCooldown > 0) return;

    const toPlayer = player.position.clone().sub(alien.mesh.position);
    const distance = toPlayer.length();
    const range = alien.kind === 'tank' ? 520 : 760;
    if (distance > range) return;

    const shot = this.getEnemyShot();
    shot.mesh.position.copy(alien.mesh.position);
    shot.mesh.position.y += alien.kind === 'boss' ? -4 : -1;

    const speed = alien.kind === 'tank' ? 110 : 95;
    shot.velocity.copy(toPlayer.normalize().multiplyScalar(speed));
    shot.life = alien.kind === 'tank' ? 3.8 : 5.2;
    shot.active = true;
    shot.mesh.visible = true;

    alien.fireCooldown = alien.kind === 'tank' ? THREE.MathUtils.randFloat(1.7, 2.8) : THREE.MathUtils.randFloat(1.2, 2.0);
  }

  private handleZoneDamage(dt: number) {
    for (const zone of this.zones) {
      const attackers = this.aliens.filter((alien) => alien.mesh.position.distanceTo(zone.position) < zone.radius + 60);
      if (attackers.length === 0) continue;
      zone.health = Math.max(0, zone.health - attackers.length * dt * 3);
    }
  }

  private handleProjectileHits(projectiles: Projectile[], projectileFx: ProjectileManager) {
    for (const projectile of projectiles) {
      for (const alien of this.aliens) {
        if (alien.mesh.position.distanceTo(projectile.mesh.position) < alien.hitRadius) {
          projectile.life = 0;
          projectileFx.spawnImpact(projectile.mesh.position.clone());
          if (alien.shield > 0) alien.shield -= 20;
          else alien.health -= 20;
        }
      }
    }
  }

  private cleanup() {
    for (let i = this.aliens.length - 1; i >= 0; i -= 1) {
      const alien = this.aliens[i];
      if (alien.health > 0) continue;
      this.scene.remove(alien.mesh);
      this.aliens.splice(i, 1);
    }
  }

  private createAlien(kind: AlienKind): Alien {
    const mesh = createAlienShip(kind);

    if (kind === 'interceptor') {
      return {
        mesh,
        kind,
        velocity: new THREE.Vector3(),
        state: 'patrol',
        baseSpeed: 95,
        agility: 1.4,
        hitRadius: 6,
        phase: Math.random() * Math.PI * 2,
        spinRate: 0.015,
        hoverBaseY: 0,
        shield: 24 + this.wave * 3,
        health: 28 + this.wave * 5,
        targetOffset: new THREE.Vector3(
          THREE.MathUtils.randFloat(-100, 100),
          THREE.MathUtils.randFloat(40, 140),
          THREE.MathUtils.randFloat(-100, 100)
        ),
        fireCooldown: THREE.MathUtils.randFloat(0.8, 1.4)
      };
    }

    if (kind === 'tank') {
      return {
        mesh,
        kind,
        velocity: new THREE.Vector3(),
        state: 'patrol',
        baseSpeed: 55,
        agility: 0.75,
        hitRadius: 8.5,
        phase: Math.random() * Math.PI * 2,
        spinRate: 0.005,
        hoverBaseY: 0,
        shield: 66 + this.wave * 8,
        health: 84 + this.wave * 10,
        targetOffset: new THREE.Vector3(
          THREE.MathUtils.randFloat(-140, 140),
          THREE.MathUtils.randFloat(70, 170),
          THREE.MathUtils.randFloat(-140, 140)
        ),
        fireCooldown: THREE.MathUtils.randFloat(0.3, 1.2)
      };
    }

    return {
      mesh,
      kind,
      velocity: new THREE.Vector3(),
      state: 'intercept',
      baseSpeed: 42,
      agility: 0.55,
      hitRadius: 14,
      phase: Math.random() * Math.PI * 2,
      spinRate: 0.01,
      hoverBaseY: 0,
      shield: 280 + this.wave * 22,
      health: 420 + this.wave * 26,
      targetOffset: new THREE.Vector3(
        THREE.MathUtils.randFloat(-220, 220),
        THREE.MathUtils.randFloat(120, 240),
        THREE.MathUtils.randFloat(-220, 220)
      ),
      fireCooldown: THREE.MathUtils.randFloat(0.7, 1.8)
    };
  }

  private animateAlien(alien: Alien) {
    const t = performance.now() * 0.001 + alien.phase;

    if (alien.kind === 'interceptor') {
      alien.mesh.rotation.y = Math.atan2(-alien.velocity.x, -alien.velocity.z);
      alien.mesh.rotation.z = Math.sin(t * 6) * 0.25;
      alien.mesh.position.y = alien.hoverBaseY + Math.sin(t * 8) * 1.8;
      return;
    }

    if (alien.kind === 'tank') {
      alien.mesh.rotation.y += alien.spinRate;
      alien.mesh.position.y = alien.hoverBaseY + Math.sin(t * 2.4) * 1.1;
      return;
    }

    alien.mesh.rotation.y += alien.spinRate;
    alien.mesh.rotation.x = Math.sin(t * 1.5) * 0.1;
    alien.mesh.rotation.z = Math.sin(t * 1.1) * 0.08;
    alien.mesh.position.y = alien.hoverBaseY + Math.sin(t * 1.6) * 2.3;
    for (const child of alien.mesh.children) {
      const spin = child.userData.spin as number | undefined;
      if (!spin) continue;
      child.rotation.z += spin;
    }
  }

  private updateThreat(player: THREE.Object3D) {
    let nearest = 9999;
    for (const alien of this.aliens) {
      nearest = Math.min(nearest, alien.mesh.position.distanceTo(player.position));
    }

    const closeThreat = THREE.MathUtils.clamp(1 - nearest / 700, 0, 1);
    const shotThreat = this.enemyShots.some((s) => s.active && s.mesh.position.distanceTo(player.position) < 120) ? 0.35 : 0;
    this.threat = THREE.MathUtils.clamp(closeThreat + shotThreat, 0, 1);
  }

  private getEnemyShot(): EnemyShot {
    const existing = this.enemyShots.find((s) => !s.active);
    if (existing) return existing;

    const shot = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 8, 8),
      new THREE.MeshStandardMaterial({
        color: 0xb37cff,
        emissive: 0x7b4dff,
        emissiveIntensity: 2.1,
        roughness: 0.2,
        metalness: 0
      })
    );
    shot.visible = false;
    this.scene.add(shot);

    const pooled: EnemyShot = {
      mesh: shot,
      velocity: new THREE.Vector3(),
      life: 0,
      active: false
    };
    this.enemyShots.push(pooled);
    return pooled;
  }
}
