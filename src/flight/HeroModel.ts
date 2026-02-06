import * as THREE from 'three';

export interface HeroRig {
  group: THREE.Group;
  leftHand: THREE.Object3D;
  rightHand: THREE.Object3D;
  leftFoot: THREE.Object3D;
  rightFoot: THREE.Object3D;
  updatePose(turnRate: number, pitchRate: number, speed: number, dt: number): void;
}

type CapeUpdater = (speed: number, turnRate: number, dt: number) => void;

export function createHeroMesh(): THREE.Group {
  const heroMesh = new THREE.Group();
  heroMesh.name = 'HeroMesh';

  const suitPrimary = new THREE.MeshStandardMaterial({ color: 0x3c4f76, roughness: 0.5, metalness: 0.18 });
  const suitSecondary = new THREE.MeshStandardMaterial({ color: 0x2d3d60, roughness: 0.55, metalness: 0.12 });
  const glovesBoots = new THREE.MeshStandardMaterial({ color: 0x5b6f98, roughness: 0.48, metalness: 0.14 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xb8896a, roughness: 0.78, metalness: 0.02 });
  const accent = new THREE.MeshStandardMaterial({
    color: 0x8ee6ff,
    emissive: 0x34c9ff,
    emissiveIntensity: 1.6,
    roughness: 0.2,
    metalness: 0.04
  });
  const capeMat = new THREE.MeshStandardMaterial({
    color: 0x48305e,
    emissive: 0x1c1027,
    emissiveIntensity: 0.45,
    roughness: 0.62,
    metalness: 0.1,
    side: THREE.DoubleSide
  });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.31, 0.86, 6, 10), suitPrimary);
  torso.castShadow = true;
  heroMesh.add(torso);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.22, 0.3), suitSecondary);
  hips.position.set(0, -0.63, 0.08);
  hips.castShadow = true;
  heroMesh.add(hips);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skin);
  head.position.set(0, 1.02, -0.1);
  head.castShadow = true;
  heroMesh.add(head);

  const leftArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.7, 4, 8), suitSecondary);
  leftArm.position.set(-0.47, 0.18, 0.24);
  leftArm.rotation.z = THREE.MathUtils.degToRad(-22);
  leftArm.rotation.x = THREE.MathUtils.degToRad(-66);
  leftArm.castShadow = true;
  heroMesh.add(leftArm);

  const rightArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.7, 4, 8), suitSecondary);
  rightArm.position.set(0.47, 0.18, 0.24);
  rightArm.rotation.z = THREE.MathUtils.degToRad(22);
  rightArm.rotation.x = THREE.MathUtils.degToRad(-66);
  rightArm.castShadow = true;
  heroMesh.add(rightArm);

  const leftGlove = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), glovesBoots);
  leftGlove.position.set(-0.75, -0.06, -0.27);
  leftGlove.castShadow = true;
  heroMesh.add(leftGlove);

  const rightGlove = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), glovesBoots);
  rightGlove.position.set(0.75, -0.06, -0.27);
  rightGlove.castShadow = true;
  heroMesh.add(rightGlove);

  const leftLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.76, 4, 8), suitPrimary);
  leftLeg.position.set(-0.2, -1.2, 0.3);
  leftLeg.rotation.x = THREE.MathUtils.degToRad(-18);
  leftLeg.castShadow = true;
  heroMesh.add(leftLeg);

  const rightLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.76, 4, 8), suitPrimary);
  rightLeg.position.set(0.2, -1.2, 0.3);
  rightLeg.rotation.x = THREE.MathUtils.degToRad(-18);
  rightLeg.castShadow = true;
  heroMesh.add(rightLeg);

  const leftBoot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.54), glovesBoots);
  leftBoot.position.set(-0.2, -1.58, 0.72);
  leftBoot.castShadow = true;
  heroMesh.add(leftBoot);

  const rightBoot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.54), glovesBoots);
  rightBoot.position.set(0.2, -1.58, 0.72);
  rightBoot.castShadow = true;
  heroMesh.add(rightBoot);

  const chestAccent = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.58, 0.08), accent);
  chestAccent.position.set(0, 0.14, -0.36);
  heroMesh.add(chestAccent);

  const leftBootAccent = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.2), accent);
  leftBootAccent.position.set(-0.2, -1.54, 0.95);
  heroMesh.add(leftBootAccent);

  const rightBootAccent = leftBootAccent.clone();
  rightBootAccent.position.x = 0.2;
  heroMesh.add(rightBootAccent);

  const capeAnchor = new THREE.Group();
  capeAnchor.position.set(0, 0.52, 0.32);
  heroMesh.add(capeAnchor);

  const capeGeom = new THREE.PlaneGeometry(1.3, 1.75, 12, 18);
  const cape = new THREE.Mesh(capeGeom, capeMat);
  cape.position.set(0, -0.86, 0.34);
  cape.rotation.x = THREE.MathUtils.degToRad(10);
  cape.castShadow = true;
  capeAnchor.add(cape);

  const capeBase = (cape.geometry as THREE.BufferGeometry).attributes.position.array.slice() as Float32Array;
  (heroMesh.userData as { updateCape?: CapeUpdater }).updateCape = (speed: number, turnRate: number, dt: number) => {
    const posAttr = (cape.geometry as THREE.BufferGeometry).attributes.position as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const t = performance.now() * 0.001;
    const speedFactor = THREE.MathUtils.clamp((speed - 70) / 220, 0, 1);
    const turnFactor = THREE.MathUtils.clamp(Math.abs(turnRate) * 0.02, 0, 1);

    for (let i = 0; i < posAttr.count; i += 1) {
      const x0 = capeBase[i * 3];
      const y0 = capeBase[i * 3 + 1];
      const z0 = capeBase[i * 3 + 2];

      const row = (y0 + 0.875) / 1.75;
      const amp = (0.025 + row * 0.14) * (1 + speedFactor * 1.55);
      const wave = Math.sin(t * (5.2 + row * 2.4) + x0 * 7.5) * amp;
      const side = Math.sin(t * 3.1 + row * 4.0) * turnRate * 0.0007;

      arr[i * 3] = x0 + side;
      arr[i * 3 + 1] = y0 - speedFactor * 0.11 * row;
      arr[i * 3 + 2] = z0 + wave + turnFactor * 0.05 * row;
    }

    posAttr.needsUpdate = true;
    (cape.geometry as THREE.BufferGeometry).computeVertexNormals();
    capeAnchor.rotation.y = THREE.MathUtils.lerp(capeAnchor.rotation.y, -turnRate * 0.0016, Math.min(1, dt * 10));
  };

  // Flying pose: slight forward lean with arms swept back.
  heroMesh.rotation.x = THREE.MathUtils.degToRad(16);
  heroMesh.scale.setScalar(1.38);

  // Height is approximately 2.2 units from boots to head top.
  return heroMesh;
}

export function createHeroRig(): HeroRig {
  const heroMesh = createHeroMesh();

  const leftHand = new THREE.Object3D();
  leftHand.position.set(-0.76, -0.08, -0.36);
  heroMesh.add(leftHand);

  const rightHand = new THREE.Object3D();
  rightHand.position.set(0.76, -0.08, -0.36);
  heroMesh.add(rightHand);

  const leftFoot = new THREE.Object3D();
  leftFoot.position.set(-0.2, -1.64, 1.04);
  heroMesh.add(leftFoot);

  const rightFoot = new THREE.Object3D();
  rightFoot.position.set(0.2, -1.64, 1.04);
  heroMesh.add(rightFoot);

  return {
    group: heroMesh,
    leftHand,
    rightHand,
    leftFoot,
    rightFoot,
    updatePose(turnRate: number, pitchRate: number, speed: number, dt: number) {
      const t = performance.now() * 0.001;
      const turn = THREE.MathUtils.clamp(turnRate * 0.0055, -0.5, 0.5);
      const pitch = THREE.MathUtils.clamp(pitchRate * 0.009, -0.3, 0.3);

      heroMesh.rotation.z = THREE.MathUtils.lerp(heroMesh.rotation.z, -turn * 0.22, Math.min(1, dt * 9));
      heroMesh.rotation.x = THREE.MathUtils.lerp(
        heroMesh.rotation.x,
        THREE.MathUtils.degToRad(16) + pitch * 0.14 + Math.sin(t * 8) * 0.01,
        Math.min(1, dt * 8)
      );

      const updateCape = (heroMesh.userData as { updateCape?: CapeUpdater }).updateCape;
      if (updateCape) updateCape(speed, turnRate, dt);
    }
  };
}
