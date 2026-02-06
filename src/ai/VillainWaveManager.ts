import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Projectile, ProjectileManager } from '../combat/Projectiles';

type Villain = {
  root: THREE.Object3D;
  velocity: THREE.Vector3;
  health: number;
  shield: number;
  hitRadius: number;
  mixer: THREE.AnimationMixer | null;
  action: THREE.AnimationAction | null;
  phase: number;
};

export class VillainWaveManager {
  private readonly scene: THREE.Scene;
  private readonly villains: Villain[] = [];
  private template: THREE.Object3D | null = null;
  private clips: THREE.AnimationClip[] = [];
  private loaded = false;
  private wave = 0;
  private waveTimer = 0;
  private threat = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  async load(url: string) {
    const loader = new FBXLoader();
    const fbx = await loader.loadAsync(url);

    fbx.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = false;
        obj.receiveShadow = false;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((mat) => {
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhongMaterial) {
            mat.emissive = new THREE.Color(0x4f1020);
            mat.emissiveIntensity = 0.45;
            mat.color.offsetHSL(0, 0.03, -0.04);
          }
        });
      }
    });

    const box = new THREE.Box3().setFromObject(fbx);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = 4.8 / Math.max(0.001, size.y);
    fbx.scale.setScalar(scale);

    const post = new THREE.Box3().setFromObject(fbx);
    const center = new THREE.Vector3();
    post.getCenter(center);
    fbx.position.set(-center.x, -post.min.y, -center.z);
    fbx.rotation.y = Math.PI;

    this.template = fbx;
    this.clips = ((fbx as unknown as { animations?: THREE.AnimationClip[] }).animations ?? []).slice();
    this.loaded = true;
  }

  update(dt: number, player: THREE.Object3D, projectiles: Projectile[], projectileFx: ProjectileManager) {
    if (!this.loaded || !this.template) return;

    this.waveTimer += dt;
    if (this.villains.length === 0 && this.waveTimer > 2) {
      this.spawnWave(player);
    }

    for (const villain of this.villains) {
      this.updateVillain(villain, player, dt);
      if (villain.mixer) villain.mixer.update(dt);
    }

    this.handleProjectileHits(projectiles, projectileFx);
    this.cleanup();
    this.updateThreat(player);
  }

  getWave(): number {
    return this.wave;
  }

  getThreat(): number {
    return this.threat;
  }

  getVillains(): THREE.Object3D[] {
    return this.villains.map((v) => v.root);
  }

  private spawnWave(player: THREE.Object3D) {
    if (!this.template) return;

    this.wave += 1;
    this.waveTimer = 0;
    const count = Math.min(7, 2 + this.wave);

    for (let i = 0; i < count; i += 1) {
      const model = clone(this.template);
      model.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.castShadow = false;
          obj.receiveShadow = false;
        }
      });

      const angle = (i / Math.max(1, count)) * Math.PI * 2;
      const radius = 180 + i * 14;
      model.position.set(
        player.position.x + Math.cos(angle) * radius,
        Math.max(33, player.position.y + 10 + THREE.MathUtils.randFloat(0, 45)),
        player.position.z + Math.sin(angle) * radius
      );
      this.scene.add(model);

      const mixer = new THREE.AnimationMixer(model);
      const action = this.clips.length > 0 ? mixer.clipAction(this.clips[0]) : null;
      if (action) {
        action.play();
        action.setEffectiveWeight(1);
        action.setEffectiveTimeScale(1);
      }

      this.villains.push({
        root: model,
        velocity: new THREE.Vector3(),
        health: 60 + this.wave * 14,
        shield: 35 + this.wave * 8,
        hitRadius: 4.2,
        mixer,
        action,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  private updateVillain(villain: Villain, player: THREE.Object3D, dt: number) {
    const toPlayer = player.position.clone().sub(villain.root.position);
    const distance = Math.max(0.001, toPlayer.length());
    const desired = toPlayer.normalize();

    const side = new THREE.Vector3(-desired.z, 0, desired.x).multiplyScalar(Math.sin(performance.now() * 0.001 + villain.phase) * 0.45);
    desired.add(side).normalize();

    const speed = 30 + this.wave * 2.2;
    villain.velocity.lerp(desired.multiplyScalar(speed), Math.min(1, dt * 2.2));
    villain.root.position.addScaledVector(villain.velocity, dt);

    const hover = 33 + Math.sin(performance.now() * 0.0018 + villain.phase) * 2.2;
    if (villain.root.position.y < hover) villain.root.position.y = THREE.MathUtils.lerp(villain.root.position.y, hover, Math.min(1, dt * 4));

    const facing = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(villain.velocity.x, 0, villain.velocity.z).normalize()
    );
    villain.root.quaternion.slerp(facing, Math.min(1, dt * 4));

    if (distance < 12) {
      villain.root.position.addScaledVector(toPlayer.normalize().negate(), dt * 10);
    }
  }

  private handleProjectileHits(projectiles: Projectile[], projectileFx: ProjectileManager) {
    for (const projectile of projectiles) {
      for (const villain of this.villains) {
        if (villain.root.position.distanceTo(projectile.mesh.position) > villain.hitRadius) continue;
        projectile.life = 0;
        projectileFx.spawnImpact(projectile.mesh.position.clone());

        if (villain.shield > 0) villain.shield -= 20;
        else villain.health -= 20;
      }
    }
  }

  private cleanup() {
    for (let i = this.villains.length - 1; i >= 0; i -= 1) {
      const villain = this.villains[i];
      if (villain.health > 0) continue;
      this.scene.remove(villain.root);
      this.villains.splice(i, 1);
    }
  }

  private updateThreat(player: THREE.Object3D) {
    let nearest = 9999;
    for (const villain of this.villains) {
      nearest = Math.min(nearest, villain.root.position.distanceTo(player.position));
    }
    this.threat = this.villains.length === 0 ? 0 : THREE.MathUtils.clamp(1 - nearest / 380, 0, 1);
  }
}
