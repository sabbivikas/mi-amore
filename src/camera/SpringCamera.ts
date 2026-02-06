import * as THREE from 'three';

export type SpringCameraConfig = {
  chestHeight: number;
  cameraBack: number;
  cameraUp: number;
  followSmooth: number;
  lookSmooth: number;
  maxMovePerFrame: number;
};

const DEFAULTS: SpringCameraConfig = {
  chestHeight: 1.2,
  cameraBack: 6.5,
  cameraUp: 2.6,
  followSmooth: 10,
  lookSmooth: 12,
  maxMovePerFrame: 1.2
};

export class SpringCamera {
  private readonly cfg: SpringCameraConfig;
  private smoothTarget = new THREE.Vector3();
  private smoothLook = new THREE.Vector3();
  private initialized = false;
  private collisionObjects: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();

  constructor(private readonly camera: THREE.PerspectiveCamera, config?: Partial<SpringCameraConfig>) {
    this.cfg = { ...DEFAULTS, ...config };
  }

  setCollisionObjects(objects: THREE.Object3D[]) {
    this.collisionObjects = objects;
  }

  setConfig(config: Partial<SpringCameraConfig>) {
    Object.assign(this.cfg, config);
  }

  update(dt: number, playerPos: THREE.Vector3, forward: THREE.Vector3) {
    const target = playerPos.clone().add(new THREE.Vector3(0, this.cfg.chestHeight, 0));
    const fwd = forward.clone().setY(0);
    if (fwd.lengthSq() < 0.0001) fwd.set(0, 0, 1);
    fwd.normalize();

    const desiredPos = target
      .clone()
      .add(fwd.clone().multiplyScalar(-this.cfg.cameraBack))
      .add(new THREE.Vector3(0, this.cfg.cameraUp, 0));

    const correctedPos = this.applyCollision(target, desiredPos);

    if (!this.initialized) {
      this.camera.position.copy(correctedPos);
      this.smoothTarget.copy(target);
      this.smoothLook.copy(target);
      this.initialized = true;
    }

    const followAlpha = 1 - Math.exp(-this.cfg.followSmooth * dt);
    const lookAlpha = 1 - Math.exp(-this.cfg.lookSmooth * dt);

    this.smoothTarget.lerp(target, lookAlpha);

    const prev = this.camera.position.clone();
    this.camera.position.lerp(correctedPos, followAlpha);

    const delta = this.camera.position.clone().sub(prev);
    const maxStep = this.cfg.maxMovePerFrame;
    if (delta.length() > maxStep) {
      delta.setLength(maxStep);
      this.camera.position.copy(prev.add(delta));
    }

    this.smoothLook.lerp(this.smoothTarget, lookAlpha);
    this.camera.lookAt(this.smoothLook);
  }

  private applyCollision(target: THREE.Vector3, desired: THREE.Vector3): THREE.Vector3 {
    if (this.collisionObjects.length === 0) return desired;

    const dir = desired.clone().sub(target);
    const dist = dir.length();
    if (dist < 0.001) return desired;
    dir.normalize();

    this.raycaster.set(target, dir);
    this.raycaster.far = dist;

    const hits = this.raycaster.intersectObjects(this.collisionObjects, true);
    if (hits.length === 0) return desired;

    const hit = hits[0];
    const safeDistance = Math.max(1.8, hit.distance - 0.4);
    return target.clone().add(dir.multiplyScalar(safeDistance));
  }
}
