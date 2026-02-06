import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

export interface LoadedHero {
  group: THREE.Group;
  leftHand: THREE.Object3D;
  rightHand: THREE.Object3D;
  leftFoot: THREE.Object3D;
  rightFoot: THREE.Object3D;
  updatePose: (turnRate: number, pitchRate: number, speed: number, dt: number) => void;
}

export async function loadFBXHero(url: string, options?: { alwaysAnimate?: boolean }): Promise<LoadedHero> {
  const loader = new FBXLoader();
  const fbx = await loader.loadAsync(url);

  const root = new THREE.Group();
  root.name = 'FBXHeroRoot';

  fbx.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhongMaterial) {
          if (mat.color.getHex() === 0x000000) mat.color.setHex(0x252b36);
        }
      });
    }
  });

  // Normalize height close to the existing gameplay character scale.
  const bbox = new THREE.Box3().setFromObject(fbx);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const currentHeight = Math.max(0.001, size.y);
  const targetHeight = 5.6;
  const scale = targetHeight / currentHeight;
  fbx.scale.setScalar(scale);

  // Recompute and pivot so feet are near y=0 and facing forward.
  const postScaleBox = new THREE.Box3().setFromObject(fbx);
  const center = new THREE.Vector3();
  postScaleBox.getCenter(center);
  fbx.position.set(-center.x, -postScaleBox.min.y, -center.z);
  fbx.rotation.y = Math.PI;

  root.add(fbx);

  const leftHand = findAnchor(fbx, ['lefthand', 'hand_l', 'left_hand', 'l_hand']) ?? makeFallbackAnchor(root, -0.55, 1.4, -0.6);
  const rightHand = findAnchor(fbx, ['righthand', 'hand_r', 'right_hand', 'r_hand']) ?? makeFallbackAnchor(root, 0.55, 1.4, -0.6);
  const leftFoot = findAnchor(fbx, ['leftfoot', 'foot_l', 'left_foot', 'l_foot']) ?? makeFallbackAnchor(root, -0.25, 0.1, 0.25);
  const rightFoot = findAnchor(fbx, ['rightfoot', 'foot_r', 'right_foot', 'r_foot']) ?? makeFallbackAnchor(root, 0.25, 0.1, 0.25);

  const hips = findAnchor(fbx, ['hips', 'pelvis', 'root']);
  const spine = findAnchor(fbx, ['spine', 'spine1', 'spine01', 'chest']);
  const leftUpperArm = findAnchor(fbx, ['leftarm', 'upperarm_l', 'leftupperarm', 'l_upperarm']);
  const rightUpperArm = findAnchor(fbx, ['rightarm', 'upperarm_r', 'rightupperarm', 'r_upperarm']);
  const leftUpperLeg = findAnchor(fbx, ['leftupleg', 'thigh_l', 'leftthigh', 'l_thigh']);
  const rightUpperLeg = findAnchor(fbx, ['rightupleg', 'thigh_r', 'rightthigh', 'r_thigh']);

  const mixer = new THREE.AnimationMixer(fbx);
  const clips = ((fbx as unknown as { animations?: THREE.AnimationClip[] }).animations ?? []).filter(Boolean);
  const action = clips.length > 0 ? mixer.clipAction(clips[0]) : null;
  if (action) {
    action.play();
    action.enabled = true;
    action.setEffectiveWeight(options?.alwaysAnimate ? 1 : 0.65);
    action.setEffectiveTimeScale(options?.alwaysAnimate ? 1 : 1);
  }

  const baseRootPos = root.position.clone();
  const baseRootRotX = root.rotation.x;
  const baseRootRotZ = root.rotation.z;
  const baseSpineRotX = spine?.rotation.x ?? 0;
  const baseSpineRotZ = spine?.rotation.z ?? 0;
  const baseLeftArmRot = leftUpperArm ? leftUpperArm.rotation.clone() : null;
  const baseRightArmRot = rightUpperArm ? rightUpperArm.rotation.clone() : null;
  const baseLeftLegRot = leftUpperLeg ? leftUpperLeg.rotation.clone() : null;
  const baseRightLegRot = rightUpperLeg ? rightUpperLeg.rotation.clone() : null;
  const baseHipsRotY = hips?.rotation.y ?? 0;
  let motionPhase = 0;

  const updatePose = (turnRate: number, pitchRate: number, speed: number, dt: number) => {
    if (options?.alwaysAnimate) {
      mixer.update(dt);
      if (action) {
        action.paused = false;
        action.setEffectiveWeight(1);
        action.setEffectiveTimeScale(1);
      }
      return;
    }

    const turnActivity = THREE.MathUtils.clamp(Math.abs(turnRate) * 0.01, 0, 1);
    const pitchActivity = THREE.MathUtils.clamp(Math.abs(pitchRate) * 0.01, 0, 1);
    const speedActivity = THREE.MathUtils.clamp(speed / 90, 0, 1);
    const activity = THREE.MathUtils.clamp(turnActivity * 0.35 + pitchActivity * 0.35 + speedActivity * 0.9, 0, 1);

    mixer.update(dt);
    if (action) {
      action.paused = activity < 0.06;
      action.setEffectiveWeight(0.18 + activity * 0.45);
      action.setEffectiveTimeScale(0.5 + activity * 0.8);
    }

    motionPhase += dt * (4.2 + speedActivity * 4.5) * Math.max(0.1, activity);
    const turn = THREE.MathUtils.clamp(turnRate * 0.0035, -0.55, 0.55);
    const pitch = THREE.MathUtils.clamp(pitchRate * 0.004, -0.35, 0.35);
    const speedFactor = THREE.MathUtils.clamp((speed - 70) / 220, 0, 1) * activity;

    root.rotation.x = THREE.MathUtils.lerp(root.rotation.x, baseRootRotX + 0.06 + pitch * 0.18 * activity, Math.min(1, dt * 7));
    root.rotation.z = THREE.MathUtils.lerp(root.rotation.z, baseRootRotZ - turn * 0.22 * activity, Math.min(1, dt * 8));
    root.position.y = THREE.MathUtils.lerp(
      root.position.y,
      baseRootPos.y + Math.sin(motionPhase) * (0.012 + speedFactor * 0.018),
      Math.min(1, dt * 9)
    );

    if (spine) {
      spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, baseSpineRotX + pitch * 0.22 * activity, Math.min(1, dt * 10));
      spine.rotation.z = THREE.MathUtils.lerp(spine.rotation.z, baseSpineRotZ - turn * 0.35 * activity, Math.min(1, dt * 10));
    }

    if (hips) {
      hips.rotation.y = THREE.MathUtils.lerp(hips.rotation.y, baseHipsRotY + turn * 0.25 * activity, Math.min(1, dt * 8));
    }

    const armPulse = Math.sin(motionPhase * 1.65) * (0.012 + speedFactor * 0.03);
    if (leftUpperArm && baseLeftArmRot) {
      leftUpperArm.rotation.x = THREE.MathUtils.lerp(
        leftUpperArm.rotation.x,
        baseLeftArmRot.x - 0.08 * activity - speedFactor * 0.12 + armPulse,
        Math.min(1, dt * 12)
      );
      leftUpperArm.rotation.z = THREE.MathUtils.lerp(
        leftUpperArm.rotation.z,
        baseLeftArmRot.z - 0.05 * activity - turn * 0.2 * activity,
        Math.min(1, dt * 12)
      );
    }
    if (rightUpperArm && baseRightArmRot) {
      rightUpperArm.rotation.x = THREE.MathUtils.lerp(
        rightUpperArm.rotation.x,
        baseRightArmRot.x - 0.08 * activity - speedFactor * 0.12 - armPulse,
        Math.min(1, dt * 12)
      );
      rightUpperArm.rotation.z = THREE.MathUtils.lerp(
        rightUpperArm.rotation.z,
        baseRightArmRot.z + 0.05 * activity - turn * 0.2 * activity,
        Math.min(1, dt * 12)
      );
    }

    const legPulse = Math.sin(motionPhase * 1.05) * (0.008 + speedFactor * 0.035);
    if (leftUpperLeg && baseLeftLegRot) {
      leftUpperLeg.rotation.x = THREE.MathUtils.lerp(
        leftUpperLeg.rotation.x,
        baseLeftLegRot.x + 0.04 * activity + legPulse,
        Math.min(1, dt * 10)
      );
    }
    if (rightUpperLeg && baseRightLegRot) {
      rightUpperLeg.rotation.x = THREE.MathUtils.lerp(
        rightUpperLeg.rotation.x,
        baseRightLegRot.x + 0.04 * activity - legPulse,
        Math.min(1, dt * 10)
      );
    }
  };

  return { group: root, leftHand, rightHand, leftFoot, rightFoot, updatePose };
}

function findAnchor(root: THREE.Object3D, keywords: string[]): THREE.Object3D | null {
  let best: THREE.Object3D | null = null;
  root.traverse((obj) => {
    const key = obj.name.toLowerCase().replace(/\s+/g, '');
    if (keywords.some((k) => key.includes(k))) {
      best = obj;
    }
  });
  return best;
}

function makeFallbackAnchor(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D {
  const anchor = new THREE.Object3D();
  anchor.position.set(x, y, z);
  parent.add(anchor);
  return anchor;
}
