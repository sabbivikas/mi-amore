import * as THREE from 'three';
import { TerrainTile } from './TerrainTile';
import { BuildingTile } from './BuildingTile';
import { WaterTile } from './WaterTile';

export class WorldManager {
  private readonly scene: THREE.Scene;
  private readonly tileSize = 10000;
  private readonly tiles = new Map<string, { terrain: TerrainTile; buildings: BuildingTile; water: WaterTile }>();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(playerPos: THREE.Vector3, timeSec: number) {
    const centerX = Math.floor(playerPos.x / this.tileSize);
    const centerZ = Math.floor(playerPos.z / this.tileSize);

    const needed = new Set<string>();
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const tx = centerX + dx;
        const tz = centerZ + dz;
        const key = `${tx}:${tz}`;
        needed.add(key);

        if (!this.tiles.has(key)) this.createTile(tx, tz, key);
      }
    }

    for (const [key, tile] of this.tiles) {
      if (needed.has(key)) continue;
      this.scene.remove(tile.terrain.mesh);
      this.scene.remove(tile.buildings.group);
      this.scene.remove(tile.water.group);
      this.tiles.delete(key);
    }

    for (const tile of this.tiles.values()) {
      tile.buildings.updateLOD(playerPos);
      tile.water.update(timeSec);
    }
  }

  getActiveChunkCount(): number {
    return this.tiles.size;
  }

  getTerrainMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const tile of this.tiles.values()) {
      meshes.push(tile.terrain.mesh);
    }
    return meshes;
  }

  private createTile(tileX: number, tileZ: number, key: string) {
    const terrain = new TerrainTile(
      this.tileSize,
      64,
      tileX * 10 + tileZ,
      tileX * this.tileSize,
      tileZ * this.tileSize
    );
    terrain.mesh.position.set(tileX * this.tileSize, 0, tileZ * this.tileSize);
    this.scene.add(terrain.mesh);

    const bounds = new THREE.Box2(
      new THREE.Vector2(tileX * this.tileSize - this.tileSize / 2, tileZ * this.tileSize - this.tileSize / 2),
      new THREE.Vector2(tileX * this.tileSize + this.tileSize / 2, tileZ * this.tileSize + this.tileSize / 2)
    );
    const buildings = new BuildingTile(bounds);
    buildings.group.position.set(0, 0, 0);
    this.scene.add(buildings.group);

    const water = new WaterTile(tileX, tileZ, this.tileSize);
    this.scene.add(water.group);

    this.tiles.set(key, { terrain, buildings, water });
  }
}
