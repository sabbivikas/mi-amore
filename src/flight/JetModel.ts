import * as THREE from 'three';

export function createPlayerJet(): THREE.Group {
  const jet = new THREE.Group();

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0xd9e6f5,
    metalness: 0.35,
    roughness: 0.42,
    flatShading: true
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x7e93ab,
    metalness: 0.28,
    roughness: 0.5,
    flatShading: true
  });
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x75d8ff,
    emissive: 0x0d2635,
    emissiveIntensity: 0.7,
    metalness: 0.2,
    roughness: 0.1,
    transparent: true,
    opacity: 0.82
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 0.8, 15, 10, 1), hullMat);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  jet.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.95, 3.8, 10), hullMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = -9.1;
  nose.castShadow = true;
  jet.add(nose);

  const intakeBulge = new THREE.Mesh(new THREE.SphereGeometry(1.35, 10, 8), accentMat);
  intakeBulge.scale.set(1.35, 0.7, 1.6);
  intakeBulge.position.set(0, -0.45, -0.7);
  intakeBulge.castShadow = true;
  jet.add(intakeBulge);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.1, 10, 8), canopyMat);
  canopy.scale.set(1.25, 0.65, 2.2);
  canopy.position.set(0, 0.95, -2.1);
  jet.add(canopy);

  const wingShape = new THREE.Shape();
  wingShape.moveTo(-0.6, 0);
  wingShape.lineTo(-10.8, 1.8);
  wingShape.lineTo(-8.9, 4.9);
  wingShape.lineTo(-0.9, 3.1);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.35,
    bevelEnabled: false,
    curveSegments: 2
  });
  wingGeo.rotateX(Math.PI / 2);
  wingGeo.translate(0, -0.65, -0.2);

  const leftWing = new THREE.Mesh(wingGeo, accentMat);
  leftWing.castShadow = true;
  jet.add(leftWing);

  const rightWing = leftWing.clone();
  rightWing.scale.x = -1;
  rightWing.castShadow = true;
  jet.add(rightWing);

  const finGeo = new THREE.ConeGeometry(0.42, 2.6, 4);
  const finLeft = new THREE.Mesh(finGeo, accentMat);
  finLeft.rotation.x = Math.PI / 2;
  finLeft.rotation.z = THREE.MathUtils.degToRad(-16);
  finLeft.position.set(-1.05, 1.05, 4.2);
  finLeft.castShadow = true;
  jet.add(finLeft);

  const finRight = finLeft.clone();
  finRight.rotation.z = THREE.MathUtils.degToRad(16);
  finRight.position.x = 1.05;
  jet.add(finRight);

  const tailWingShape = new THREE.Shape();
  tailWingShape.moveTo(-0.3, 0);
  tailWingShape.lineTo(-3.8, 0.8);
  tailWingShape.lineTo(-3.2, 2.1);
  tailWingShape.lineTo(-0.4, 1.3);
  tailWingShape.closePath();
  const tailWingGeo = new THREE.ExtrudeGeometry(tailWingShape, {
    depth: 0.25,
    bevelEnabled: false,
    curveSegments: 2
  });
  tailWingGeo.rotateX(Math.PI / 2);
  tailWingGeo.translate(0, -0.15, 4.1);

  const leftTailWing = new THREE.Mesh(tailWingGeo, accentMat);
  leftTailWing.castShadow = true;
  jet.add(leftTailWing);

  const rightTailWing = leftTailWing.clone();
  rightTailWing.scale.x = -1;
  jet.add(rightTailWing);

  const thrusterOuter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.05, 1.4, 10, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x27333f, metalness: 0.55, roughness: 0.35, flatShading: true })
  );
  thrusterOuter.rotation.x = Math.PI / 2;
  thrusterOuter.position.z = 7.9;
  thrusterOuter.castShadow = true;
  jet.add(thrusterOuter);

  const thrusterCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.6, 10, 8),
    new THREE.MeshStandardMaterial({
      color: 0x80c8ff,
      emissive: 0x1f8bff,
      emissiveIntensity: 2.8,
      roughness: 0.05,
      metalness: 0
    })
  );
  thrusterCore.scale.set(1, 1, 0.6);
  thrusterCore.position.z = 8.45;
  jet.add(thrusterCore);

  const glow = new THREE.PointLight(0x4aa7ff, 1.3, 24, 2);
  glow.position.z = 8.7;
  jet.add(glow);

  jet.rotation.y = Math.PI;
  jet.scale.setScalar(1.1);
  return jet;
}
