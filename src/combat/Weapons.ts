import * as THREE from 'three';
import { InputManager } from '../utils/InputManager';
import { ProjectileManager } from './Projectiles';

export class WeaponsSystem {
  private readonly input: InputManager;
  private readonly projectiles: ProjectileManager;
  private cooldown = 0;

  constructor(input: InputManager, projectiles: ProjectileManager) {
    this.input = input;
    this.projectiles = projectiles;
  }

  update(dt: number, origin: THREE.Object3D, handAnchors?: THREE.Object3D[]): boolean {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.input.isDown('fire')) return false;
    if (this.cooldown > 0) return false;

    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(origin.quaternion).normalize();
    if (handAnchors && handAnchors.length >= 2) {
      for (const anchor of handAnchors.slice(0, 2)) {
        const muzzle = new THREE.Vector3();
        anchor.getWorldPosition(muzzle);
        this.projectiles.spawn(muzzle, direction);
      }
    } else {
      const muzzle = origin.position.clone().add(new THREE.Vector3(0, 0, -6).applyQuaternion(origin.quaternion));
      this.projectiles.spawn(muzzle, direction);
    }

    this.cooldown = 0.11;
    return true;
  }
}
