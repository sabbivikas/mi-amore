import * as THREE from 'three';
import { InputManager } from '../utils/InputManager';
import { ChunkManager } from '../world/ChunkManager';

export type GroundState = {
  speed: number;
  forward: THREE.Vector3;
  heading: number;
  inPond: boolean;
};

export class GroundController {
  private yaw = Math.PI;
  private speed = 0;
  private verticalVel = 0;
  private grounded = false;
  private readonly capsuleHeight = 1.4;
  private readonly capsuleRadius = 0.35;
  private readonly gravity = 18;

  constructor(private readonly player: THREE.Object3D, private readonly input: InputManager, private readonly chunks: ChunkManager) {}

  syncFromCurrentPose() {
    this.yaw = this.player.rotation.y;
    this.speed = 0;
    this.verticalVel = 0;
  }

  update(dt: number): GroundState {
    const forwardInput = (this.input.isDown('pitchUp') ? 1 : 0) - (this.input.isDown('pitchDown') ? 1 : 0);
    const turnInput = (this.input.isDown('rollRight') ? 1 : 0) - (this.input.isDown('rollLeft') ? 1 : 0);
    const sprint = this.input.isDown('boost');

    const targetTurnRate = turnInput * 2.5;
    this.yaw += targetTurnRate * dt;

    const moveSpeed = sprint ? 10 : 6;
    const targetSpeed = forwardInput * moveSpeed;
    const accel = Math.abs(targetSpeed) > Math.abs(this.speed) ? 18 : 14;
    this.speed = THREE.MathUtils.lerp(this.speed, targetSpeed, Math.min(1, dt * accel));

    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const nextPos = this.player.position.clone().addScaledVector(forward, this.speed * dt);

    const pondDepth = this.chunks.getPondDepth(nextPos.x, nextPos.z);
    const slowdown = THREE.MathUtils.lerp(1, 0.45, pondDepth);
    this.speed *= slowdown;
    nextPos.copy(this.player.position).addScaledVector(forward, this.speed * dt);

    const groundHeight = this.chunks.getTerrainHeight(nextPos.x, nextPos.z) + this.capsuleHeight;
    this.verticalVel -= this.gravity * dt;
    nextPos.y = this.player.position.y + this.verticalVel * dt;

    if (nextPos.y <= groundHeight) {
      this.grounded = true;
      this.verticalVel = 0;
      nextPos.y = THREE.MathUtils.lerp(this.player.position.y, groundHeight, Math.min(1, dt * 18));
    } else {
      this.grounded = false;
    }

    this.player.position.copy(nextPos);

    const targetRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.yaw, 0));
    this.player.quaternion.slerp(targetRot, Math.min(1, dt * 12));

    return {
      speed: Math.abs(this.speed),
      forward,
      heading: ((THREE.MathUtils.radToDeg(this.yaw) % 360) + 360) % 360,
      inPond: pondDepth > 0.05
    };
  }
}
