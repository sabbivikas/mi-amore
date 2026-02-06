import * as THREE from 'three';

export type AlienKind = 'interceptor' | 'tank' | 'boss';

export function createAlienShip(kind: AlienKind): THREE.Group {
  if (kind === 'interceptor') return createInterceptor();
  if (kind === 'tank') return createTank();
  return createBoss();
}

function createInterceptor(): THREE.Group {
  const ship = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({
    color: 0xb62443,
    emissive: 0x360512,
    emissiveIntensity: 0.9,
    roughness: 0.55,
    metalness: 0.2,
    flatShading: true
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: 0xff5476,
    emissive: 0xff2f5d,
    emissiveIntensity: 1.8,
    roughness: 0.2,
    metalness: 0
  });

  const spear = new THREE.Mesh(new THREE.ConeGeometry(2.2, 8.5, 6), shell);
  spear.rotation.x = -Math.PI / 2;
  spear.position.z = -1.5;
  spear.castShadow = true;
  ship.add(spear);

  const wingGeo = new THREE.ConeGeometry(0.45, 5.8, 4);
  const leftWing = new THREE.Mesh(wingGeo, shell);
  leftWing.rotation.z = THREE.MathUtils.degToRad(80);
  leftWing.rotation.x = THREE.MathUtils.degToRad(10);
  leftWing.position.set(-2.8, -0.1, 0.2);
  leftWing.castShadow = true;
  ship.add(leftWing);

  const rightWing = leftWing.clone();
  rightWing.rotation.z = THREE.MathUtils.degToRad(-80);
  rightWing.position.x = 2.8;
  ship.add(rightWing);

  const core = new THREE.Mesh(new THREE.SphereGeometry(1.05, 8, 8), glowMat);
  core.position.z = 2.6;
  ship.add(core);

  const glare = new THREE.PointLight(0xff4768, 1.1, 20, 2);
  glare.position.z = 2.8;
  ship.add(glare);

  return ship;
}

function createTank(): THREE.Group {
  const ship = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({
    color: 0x4d7755,
    emissive: 0x112715,
    emissiveIntensity: 0.65,
    roughness: 0.72,
    metalness: 0.15,
    flatShading: true
  });
  const bandMat = new THREE.MeshStandardMaterial({
    color: 0x93e2a9,
    emissive: 0x44c06d,
    emissiveIntensity: 1.4,
    roughness: 0.25,
    metalness: 0
  });

  const hull = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 3.2, 10), shell);
  hull.rotation.z = Math.PI / 2;
  hull.castShadow = true;
  ship.add(hull);

  const armorCap = new THREE.Mesh(new THREE.SphereGeometry(3.2, 10, 8), shell);
  armorCap.scale.set(1.25, 0.65, 1.15);
  armorCap.castShadow = true;
  ship.add(armorCap);

  const leftPod = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8), shell);
  leftPod.position.set(-4.2, 0, 0.8);
  leftPod.castShadow = true;
  ship.add(leftPod);

  const rightPod = leftPod.clone();
  rightPod.position.x = 4.2;
  ship.add(rightPod);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.45, 8, 14), bandMat);
  ring.rotation.x = Math.PI / 2;
  ship.add(ring);

  const glow = new THREE.PointLight(0x66ff9a, 1.2, 26, 2);
  glow.position.set(0, -0.6, 0);
  ship.add(glow);

  return ship;
}

function createBoss(): THREE.Group {
  const ship = new THREE.Group();

  const shell = new THREE.MeshStandardMaterial({
    color: 0x3f355e,
    emissive: 0x170f2d,
    emissiveIntensity: 0.9,
    roughness: 0.6,
    metalness: 0.25,
    flatShading: true
  });
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0xff9f4a,
    emissive: 0xff7b1f,
    emissiveIntensity: 2.1,
    roughness: 0.2,
    metalness: 0
  });

  const center = new THREE.Mesh(new THREE.OctahedronGeometry(6.2, 0), shell);
  center.scale.set(1.2, 0.9, 1.6);
  center.castShadow = true;
  ship.add(center);

  const crown = new THREE.Mesh(new THREE.ConeGeometry(2.8, 8.5, 5), shell);
  crown.position.set(0, 4.5, -1.5);
  crown.rotation.x = THREE.MathUtils.degToRad(25);
  crown.castShadow = true;
  ship.add(crown);

  const heavyArm = new THREE.Mesh(new THREE.BoxGeometry(13.5, 2.5, 2.9), shell);
  heavyArm.position.set(-2.6, -1.2, 1.8);
  heavyArm.rotation.z = THREE.MathUtils.degToRad(12);
  heavyArm.rotation.y = THREE.MathUtils.degToRad(-10);
  heavyArm.castShadow = true;
  ship.add(heavyArm);

  const spikeCluster = new THREE.Mesh(new THREE.ConeGeometry(1.9, 7.5, 4), shell);
  spikeCluster.position.set(5.3, 0.7, -2.4);
  spikeCluster.rotation.z = THREE.MathUtils.degToRad(-36);
  spikeCluster.rotation.x = THREE.MathUtils.degToRad(14);
  spikeCluster.castShadow = true;
  ship.add(spikeCluster);

  const sideNode = new THREE.Mesh(new THREE.IcosahedronGeometry(2.3, 0), shell);
  sideNode.position.set(4.9, -1.8, 3.1);
  sideNode.castShadow = true;
  ship.add(sideNode);

  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x8b79c4,
    emissive: 0x4e3d89,
    emissiveIntensity: 1.1,
    roughness: 0.3,
    metalness: 0.2
  });
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.52, 8, 28, Math.PI * 1.55), ringMat);
  ringA.rotation.x = Math.PI / 2;
  ringA.position.set(1.5, 0.4, 0.5);
  ringA.userData.spin = 0.018;
  ship.add(ringA);

  const ringB = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.46, 8, 24, Math.PI * 1.2), ringMat.clone());
  ringB.rotation.y = THREE.MathUtils.degToRad(70);
  ringB.rotation.z = THREE.MathUtils.degToRad(22);
  ringB.position.set(-2.7, -1.2, -1.1);
  ringB.userData.spin = -0.024;
  ship.add(ringB);

  const core = new THREE.Mesh(new THREE.SphereGeometry(2.1, 10, 8), coreMat);
  core.scale.set(1, 0.7, 0.8);
  core.position.set(-1.5, 0.3, 4.5);
  ship.add(core);

  const glare = new THREE.PointLight(0xff9b3d, 1.9, 34, 2);
  glare.position.copy(core.position);
  ship.add(glare);

  const tailGlow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 1.2, 4.2, 8),
    new THREE.MeshStandardMaterial({
      color: 0x8f5cff,
      emissive: 0x7d49ff,
      emissiveIntensity: 1.6,
      roughness: 0.18,
      metalness: 0
    })
  );
  tailGlow.rotation.x = Math.PI / 2;
  tailGlow.position.set(-3.5, -0.4, 6.5);
  ship.add(tailGlow);

  for (let i = 0; i < 4; i += 1) {
    const vent = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.48, 1.8, 6),
      new THREE.MeshStandardMaterial({
        color: 0xffb466,
        emissive: 0xff8d2b,
        emissiveIntensity: 1.9,
        roughness: 0.2,
        metalness: 0
      })
    );
    vent.rotation.x = Math.PI / 2;
    vent.position.set(-2.2 + i * 1.45, -1.2 + (i % 2 === 0 ? 0.55 : -0.35), 7.6);
    ship.add(vent);
  }

  return ship;
}
