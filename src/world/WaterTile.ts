import * as THREE from 'three';

export class WaterTile {
  public readonly group = new THREE.Group();
  private readonly mats: THREE.MeshStandardMaterial[] = [];

  constructor(tileX: number, tileZ: number, tileSize: number) {
    const seed = Math.abs(tileX * 92821 + tileZ * 68917);
    const lakeCount = 1 + (seed % 2);

    for (let i = 0; i < lakeCount; i += 1) {
      const rx = this.rand(seed + i * 19);
      const rz = this.rand(seed + i * 31 + 7);
      const x = tileX * tileSize + THREE.MathUtils.lerp(-tileSize * 0.4, tileSize * 0.4, rx);
      const z = tileZ * tileSize + THREE.MathUtils.lerp(-tileSize * 0.4, tileSize * 0.4, rz);

      const radiusX = THREE.MathUtils.lerp(180, 520, this.rand(seed + i * 23 + 5));
      const radiusZ = THREE.MathUtils.lerp(130, 480, this.rand(seed + i * 41 + 3));
      const geo = new THREE.CircleGeometry(1, 40);
      geo.scale(radiusX, radiusZ, 1);

      const mat = new THREE.MeshStandardMaterial({
        color: 0x3f6f8d,
        emissive: 0x112a3d,
        emissiveIntensity: 0.35,
        roughness: 0.22,
        metalness: 0.08,
        transparent: true,
        opacity: 0.72,
        depthWrite: false
      });
      this.mats.push(mat);

      const lake = new THREE.Mesh(geo, mat);
      lake.rotation.x = -Math.PI / 2;
      lake.position.set(x, 9, z);
      lake.receiveShadow = false;
      this.group.add(lake);

      const shoreline = new THREE.Mesh(
        new THREE.RingGeometry(1.03, 1.1, 40),
        new THREE.MeshBasicMaterial({ color: 0x6287a3, transparent: true, opacity: 0.23, side: THREE.DoubleSide })
      );
      shoreline.scale.set(radiusX, radiusZ, 1);
      shoreline.rotation.x = -Math.PI / 2;
      shoreline.position.set(x, 9.03, z);
      this.group.add(shoreline);
    }
  }

  update(timeSec: number) {
    for (let i = 0; i < this.group.children.length; i += 1) {
      const child = this.group.children[i];
      if (child instanceof THREE.Mesh && child.geometry instanceof THREE.CircleGeometry) {
        child.position.y = 9 + Math.sin(timeSec * 0.8 + i * 0.5) * 0.1;
      }
    }

    for (let i = 0; i < this.mats.length; i += 1) {
      this.mats[i].emissiveIntensity = 0.28 + Math.sin(timeSec * 0.9 + i) * 0.08;
    }
  }

  private rand(value: number): number {
    const s = Math.sin(value * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  }
}
