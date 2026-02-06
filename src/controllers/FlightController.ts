import * as THREE from 'three';
import { InputManager } from '../utils/InputManager';

export type FlightState = {
  speed: number;
  forward: THREE.Vector3;
  heading: number;
  boostActive: boolean;
};

export class FlightController {
  private velocity = new THREE.Vector3(0, 0, -70);
  private yaw = Math.PI;
  private pitch = 0;
  private yawRate = 0;
  private pitchRate = 0;
  private boostEnergy = 1;

  constructor(private readonly player: THREE.Object3D, private readonly input: InputManager) {}

  syncFromCurrentPose() {
    this.yaw = this.player.rotation.y;
    this.pitch = 0;
    this.velocity.set(0, 0, -70);
    this.boostEnergy = 1;
  }

  update(dt: number): FlightState {
    const pitchInput = (this.input.isDown('pitchDown') ? 1 : 0) - (this.input.isDown('pitchUp') ? 1 : 0);
    const yawInput = (this.input.isDown('rollRight') ? 1 : 0) - (this.input.isDown('rollLeft') ? 1 : 0);
    const boost = this.input.isDown('boost') && this.boostEnergy > 0.1;
    const brake = this.input.isDown('brake');

    const maxPitchRate = THREE.MathUtils.degToRad(45);
    const maxYawRate = THREE.MathUtils.degToRad(52);

    this.pitchRate = THREE.MathUtils.lerp(this.pitchRate, pitchInput * maxPitchRate, Math.min(1, dt * 5));
    this.yawRate = THREE.MathUtils.lerp(this.yawRate, yawInput * maxYawRate, Math.min(1, dt * 5));

    this.pitch = THREE.MathUtils.clamp(this.pitch + this.pitchRate * dt, -0.7, 0.7);
    this.yaw += this.yawRate * dt;

    const euler = new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ');
    this.player.quaternion.setFromEuler(euler);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.player.quaternion);
    const speedNow = this.velocity.length();
    const targetSpeed = boost ? 160 : 110;

    let speed = THREE.MathUtils.lerp(speedNow, targetSpeed, Math.min(1, dt * 2.4));
    if (brake) speed *= 0.88;
    speed = THREE.MathUtils.clamp(speed, 50, 180);

    if (boost) this.boostEnergy = Math.max(0, this.boostEnergy - dt * 0.22);
    else this.boostEnergy = Math.min(1, this.boostEnergy + dt * 0.08);

    const lift = 9 + Math.max(0, speed - 70) * 0.11;
    this.velocity.copy(forward).multiplyScalar(speed);
    this.velocity.y += (lift - 9.8) * dt;

    this.player.position.addScaledVector(this.velocity, dt);
    this.player.position.y = Math.max(6, this.player.position.y);

    return {
      speed,
      forward,
      heading: ((THREE.MathUtils.radToDeg(this.yaw) % 360) + 360) % 360,
      boostActive: boost
    };
  }
}
