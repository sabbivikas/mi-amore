import * as THREE from 'three';
import { InputManager } from '../utils/InputManager';

export interface FlightTelemetry {
  speed: number;
  altitude: number;
  heading: number;
  boost: number;
  turnRate: number;
  pitchRate: number;
  boostActive: boolean;
  forward: THREE.Vector3;
}

export class FlightController {
  public readonly object: THREE.Object3D;
  private velocity = new THREE.Vector3();
  private pitch = 0;
  private roll = 0;
  private yaw = 0;
  private boostEnergy = 1;
  private readonly input: InputManager;
  private readonly camera: THREE.PerspectiveCamera;

  private readonly baseSpeed = 110;
  private readonly maxSpeed = 235;
  private readonly minSpeed = 55;
  private readonly boostSpeed = 290;
  private readonly rollRate = THREE.MathUtils.degToRad(68);
  private readonly pitchRate = THREE.MathUtils.degToRad(64);
  private readonly yawRate = THREE.MathUtils.degToRad(80);

  constructor(object: THREE.Object3D, camera: THREE.PerspectiveCamera, input: InputManager) {
    this.object = object;
    this.camera = camera;
    this.input = input;
    this.velocity.set(0, 0, -this.baseSpeed);
  }

  reset(position = new THREE.Vector3(0, 200, 0)) {
    this.object.position.copy(position);
    this.velocity.set(0, 0, -this.baseSpeed);
    this.pitch = 0;
    this.roll = 0;
    this.yaw = 0;
  }

  addCameraImpulse(amount: number) {
    // Intentionally disabled for stable camera behavior.
    void amount;
  }

  update(dt: number): FlightTelemetry {
    const pitchInput = (this.input.isDown('pitchDown') ? 1 : 0) - (this.input.isDown('pitchUp') ? 1 : 0);
    const rollInput = (this.input.isDown('rollRight') ? 1 : 0) - (this.input.isDown('rollLeft') ? 1 : 0);

    const targetPitchRate = pitchInput * this.pitchRate;
    const targetRollRate = rollInput * this.rollRate;

    this.pitch = THREE.MathUtils.clamp(this.pitch + targetPitchRate * dt, -1.0, 1.0);
    this.roll = THREE.MathUtils.clamp(this.roll + targetRollRate * dt, -1.05, 1.05);

    const yawInfluence = this.roll * 0.85 + rollInput * 0.18;
    this.yaw += yawInfluence * this.yawRate * dt;

    const sway = Math.sin(performance.now() * 0.004) * 0.025 * Math.abs(rollInput);
    const euler = new THREE.Euler(this.pitch + sway, this.yaw, this.roll * 0.92, 'YXZ');
    this.object.quaternion.setFromEuler(euler);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.object.quaternion);
    const speed = this.velocity.length();

    const boostActive = this.input.isDown('boost') && this.boostEnergy > 0.05;
    const brakeActive = this.input.isDown('brake');

    const desiredSpeed = boostActive ? this.boostSpeed : this.baseSpeed + Math.max(0, this.pitch) * 32;
    const drag = 0.016 * speed * speed;

    let nextSpeed = THREE.MathUtils.lerp(speed, desiredSpeed, 0.45 * dt);
    nextSpeed -= drag * dt;

    if (brakeActive) nextSpeed *= 0.84;
    nextSpeed = THREE.MathUtils.clamp(nextSpeed, this.minSpeed, this.maxSpeed);

    if (boostActive) {
      this.boostEnergy = Math.max(0, this.boostEnergy - dt * 0.24);
    } else {
      this.boostEnergy = Math.min(1, this.boostEnergy + dt * 0.09);
    }

    const lift = Math.max(0, nextSpeed - this.minSpeed) * 0.33;
    this.velocity.copy(forward).multiplyScalar(nextSpeed);
    this.velocity.y += lift * dt - 9.8 * dt;

    this.object.position.addScaledVector(this.velocity, dt);
    if (this.object.position.y < 30) {
      this.object.position.y = 30;
      this.velocity.y = Math.max(0, this.velocity.y);
    }

    this.updateCamera(dt, boostActive);

    return {
      speed: nextSpeed,
      altitude: this.object.position.y,
      heading: ((THREE.MathUtils.radToDeg(this.yaw) % 360) + 360) % 360,
      boost: this.boostEnergy,
      turnRate: targetRollRate,
      pitchRate: targetPitchRate,
      boostActive,
      forward
    };
  }

  private updateCamera(dt: number, boostActive: boolean) {
    const desiredOffset = new THREE.Vector3(0, 14, 34).applyQuaternion(this.object.quaternion);
    const desiredPos = this.object.position.clone().add(desiredOffset);

    const smooth = 1 - Math.pow(0.004, dt);
    this.camera.position.lerp(desiredPos, smooth);
    this.camera.lookAt(this.object.position.clone().add(new THREE.Vector3(0, 4.2, 0)));

    const targetFov = boostActive ? 66 : 62;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 0.07);
    this.camera.updateProjectionMatrix();
  }
}
