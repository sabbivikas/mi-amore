import * as THREE from 'three';
import { Terrain } from './Terrain';

type Pond = {
  center: THREE.Vector2;
  radius: number;
  mesh: THREE.Mesh;
};

type ChunkProps = {
  group: THREE.Group;
  ponds: Pond[];
};

export class PropSpawner {
  constructor(private readonly terrain: Terrain, private readonly chunkSize: number) {}

  spawnChunk(chunkX: number, chunkZ: number): ChunkProps {
    const group = new THREE.Group();
    const ponds: Pond[] = [];
    const seed = this.hash(chunkX * 92821 + chunkZ * 68917 + 1024);

    const grassCount = 400 + Math.floor(this.rand(seed + 1) * 800);
    const stoneCount = 40 + Math.floor(this.rand(seed + 7) * 80);
    const shrubCount = 24 + Math.floor(this.rand(seed + 11) * 48);
    const pondCount = Math.floor(this.rand(seed + 17) * 2.2);

    const grassGeo = new THREE.PlaneGeometry(0.12, 0.48);
    grassGeo.translate(0, 0.24, 0);
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x5f8d4f,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide
    });
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);

    const stoneGeo = new THREE.DodecahedronGeometry(0.28, 0);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x798089, roughness: 0.9, metalness: 0.02 });
    const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, stoneCount);

    const shrubGeo = new THREE.IcosahedronGeometry(0.35, 0);
    const shrubMat = new THREE.MeshStandardMaterial({ color: 0x4f7349, roughness: 0.85, metalness: 0 });
    const shrubs = new THREE.InstancedMesh(shrubGeo, shrubMat, shrubCount);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();

    for (let i = 0; i < grassCount; i += 1) {
      const p = this.randomPoint(chunkX, chunkZ, seed + i * 3);
      if (p.length() < 110) continue;
      const y = this.terrain.getTerrainHeight(p.x, p.z);
      q.setFromEuler(new THREE.Euler(0, this.rand(seed + i * 5) * Math.PI * 2, 0));
      s.set(0.7 + this.rand(seed + i * 7) * 1.2, 0.8 + this.rand(seed + i * 9) * 1.2, 1);
      m.compose(new THREE.Vector3(p.x, y, p.z), q, s);
      grass.setMatrixAt(i, m);
    }

    for (let i = 0; i < stoneCount; i += 1) {
      const p = this.randomPoint(chunkX, chunkZ, seed + i * 13 + 201);
      if (p.length() < 95) continue;
      const y = this.terrain.getTerrainHeight(p.x, p.z);
      q.setFromEuler(new THREE.Euler(this.rand(seed + i * 3) * 0.3, this.rand(seed + i * 5) * Math.PI * 2, 0));
      const sc = 0.7 + this.rand(seed + i * 7) * 1.5;
      s.set(sc, sc * 0.7, sc * 0.9);
      m.compose(new THREE.Vector3(p.x, y + 0.08, p.z), q, s);
      stones.setMatrixAt(i, m);
    }

    for (let i = 0; i < shrubCount; i += 1) {
      const p = this.randomPoint(chunkX, chunkZ, seed + i * 17 + 701);
      if (p.length() < 100) continue;
      const y = this.terrain.getTerrainHeight(p.x, p.z);
      q.setFromEuler(new THREE.Euler(0, this.rand(seed + i * 19) * Math.PI * 2, 0));
      const sc = 0.7 + this.rand(seed + i * 23) * 1.3;
      s.set(sc * 1.2, sc, sc * 1.1);
      m.compose(new THREE.Vector3(p.x, y + 0.25, p.z), q, s);
      shrubs.setMatrixAt(i, m);
    }

    grass.instanceMatrix.needsUpdate = true;
    stones.instanceMatrix.needsUpdate = true;
    shrubs.instanceMatrix.needsUpdate = true;
    grass.castShadow = false;
    stones.castShadow = false;
    shrubs.castShadow = false;

    group.add(grass, stones, shrubs);

    for (let i = 0; i < pondCount; i += 1) {
      const p = this.randomPoint(chunkX, chunkZ, seed + i * 31 + 1201);
      if (p.length() < 160) continue;
      const radius = 8 + this.rand(seed + i * 29) * 16;
      const waterGeo = new THREE.CircleGeometry(radius, 28);
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x4f7c9f,
        emissive: 0x14304a,
        emissiveIntensity: 0.35,
        roughness: 0.22,
        metalness: 0.08,
        transparent: true,
        opacity: 0.78,
        depthWrite: false
      });
      const water = new THREE.Mesh(waterGeo, waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.set(p.x, this.terrain.getTerrainHeight(p.x, p.z) + 0.05, p.z);
      group.add(water);

      ponds.push({ center: new THREE.Vector2(p.x, p.z), radius, mesh: water });
    }

    return { group, ponds };
  }

  updateChunk(chunk: ChunkProps, time: number) {
    let pondIdx = 0;
    for (const child of chunk.group.children) {
      if (!(child instanceof THREE.Mesh)) continue;
      if (!(child.geometry instanceof THREE.CircleGeometry)) continue;
      child.position.y += Math.sin(time * 0.9 + pondIdx * 0.7) * 0.003;
      pondIdx += 1;
    }
  }

  getPondDepth(chunk: ChunkProps, x: number, z: number): number {
    for (const pond of chunk.ponds) {
      const d = pond.center.distanceTo(new THREE.Vector2(x, z));
      if (d < pond.radius) {
        return 1 - d / pond.radius;
      }
    }
    return 0;
  }

  private randomPoint(chunkX: number, chunkZ: number, seed: number): THREE.Vector2 {
    const minX = chunkX * this.chunkSize - this.chunkSize * 0.5;
    const maxX = chunkX * this.chunkSize + this.chunkSize * 0.5;
    const minZ = chunkZ * this.chunkSize - this.chunkSize * 0.5;
    const maxZ = chunkZ * this.chunkSize + this.chunkSize * 0.5;

    return new THREE.Vector2(
      THREE.MathUtils.lerp(minX, maxX, this.rand(seed + 1)),
      THREE.MathUtils.lerp(minZ, maxZ, this.rand(seed + 2))
    );
  }

  private rand(v: number): number {
    const s = Math.sin(v * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  }

  private hash(v: number): number {
    return Math.floor(this.rand(v) * 100000);
  }
}
