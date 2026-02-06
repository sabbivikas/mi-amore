import * as THREE from 'three';
import { BuildingTile } from './BuildingTile';
import { Terrain } from './Terrain';
import { PropSpawner } from './PropSpawner';

type Chunk = {
  terrain: THREE.Mesh;
  buildings: BuildingTile;
  props: { group: THREE.Group; ponds: { center: THREE.Vector2; radius: number; mesh: THREE.Mesh }[] };
};

export class ChunkManager {
  private readonly chunkSize = 700;
  private readonly terrain: Terrain;
  private readonly propSpawner: PropSpawner;
  private readonly chunks = new Map<string, Chunk>();

  constructor(private readonly scene: THREE.Scene) {
    this.terrain = new Terrain(991);
    this.propSpawner = new PropSpawner(this.terrain, this.chunkSize);
  }

  update(playerPos: THREE.Vector3, timeSec: number) {
    const cx = Math.floor(playerPos.x / this.chunkSize);
    const cz = Math.floor(playerPos.z / this.chunkSize);

    const needed = new Set<string>();
    for (let z = -1; z <= 1; z += 1) {
      for (let x = -1; x <= 1; x += 1) {
        const tx = cx + x;
        const tz = cz + z;
        const key = `${tx}:${tz}`;
        needed.add(key);
        if (!this.chunks.has(key)) this.createChunk(tx, tz, key);
      }
    }

    for (const [key, chunk] of this.chunks) {
      if (needed.has(key)) continue;
      this.scene.remove(chunk.terrain);
      this.scene.remove(chunk.buildings.group);
      this.scene.remove(chunk.props.group);
      this.chunks.delete(key);
    }

    for (const chunk of this.chunks.values()) {
      chunk.buildings.updateLOD(playerPos);
      this.propSpawner.updateChunk(chunk.props, timeSec);
    }
  }

  getActiveChunkCount(): number {
    return this.chunks.size;
  }

  getTerrainHeight(x: number, z: number): number {
    return this.terrain.getTerrainHeight(x, z);
  }

  getCollisionMeshes(): THREE.Object3D[] {
    const meshes: THREE.Object3D[] = [];
    for (const chunk of this.chunks.values()) {
      meshes.push(chunk.terrain);
      meshes.push(chunk.buildings.group);
    }
    return meshes;
  }

  getPondDepth(x: number, z: number): number {
    let depth = 0;
    for (const chunk of this.chunks.values()) {
      depth = Math.max(depth, this.propSpawner.getPondDepth(chunk.props, x, z));
      if (depth > 0) return depth;
    }
    return depth;
  }

  private createChunk(chunkX: number, chunkZ: number, key: string) {
    const terrain = this.terrain.createChunkMesh(chunkX, chunkZ, this.chunkSize, 46);
    this.scene.add(terrain);

    const bounds = new THREE.Box2(
      new THREE.Vector2(chunkX * this.chunkSize - this.chunkSize / 2, chunkZ * this.chunkSize - this.chunkSize / 2),
      new THREE.Vector2(chunkX * this.chunkSize + this.chunkSize / 2, chunkZ * this.chunkSize + this.chunkSize / 2)
    );
    const buildings = new BuildingTile(bounds);
    this.scene.add(buildings.group);

    const props = this.propSpawner.spawnChunk(chunkX, chunkZ);
    this.scene.add(props.group);

    this.chunks.set(key, { terrain, buildings, props });
  }
}
