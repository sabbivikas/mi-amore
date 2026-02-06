import * as THREE from 'three';
import buildingData from '../data/buildings_sample.json';
import { latLngToMeters, metersToLatLng } from '../utils/CoordinateUtils';

type BuildingDatum = {
  id: string;
  footprint: [number, number][];
  height_m: number;
  roof: 'flat' | 'gable';
};

export class BuildingTile {
  public readonly group = new THREE.Group();
  private readonly farGroup = new THREE.Group();
  private readonly midGroup = new THREE.Group();
  private readonly nearGroup = new THREE.Group();
  private readonly tileCenter: THREE.Vector3;

  constructor(private readonly tileBounds: THREE.Box2) {
    this.tileCenter = new THREE.Vector3(
      (tileBounds.min.x + tileBounds.max.x) / 2,
      0,
      (tileBounds.min.y + tileBounds.max.y) / 2
    );

    this.group.add(this.farGroup, this.midGroup, this.nearGroup);
    this.build();
  }

  updateLOD(cameraPos: THREE.Vector3) {
    const distance = cameraPos.distanceTo(this.tileCenter);
    this.farGroup.visible = distance > 6500;
    this.midGroup.visible = distance <= 6500 && distance > 3000;
    this.nearGroup.visible = distance <= 3000;
  }

  private build() {
    const data = buildingData as BuildingDatum[];
    const generated = this.generateSkylineBuildings();
    const source = data.length >= 80 ? data : [...data, ...generated];

    const inTile = source.filter((building) => {
      const meters = building.footprint.map(([lng, lat]) => latLngToMeters(lat, lng));
      return meters.some((p) => this.tileBounds.containsPoint(new THREE.Vector2(p.x, p.z)));
    });

    if (inTile.length === 0) return;

    const farGeometry = new THREE.BoxGeometry(1, 1, 1);
    const farMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.06,
      fog: true
    });
    const farMesh = new THREE.InstancedMesh(farGeometry, farMaterial, inTile.length);

    inTile.forEach((building, index) => {
      const points = building.footprint.map(([lng, lat]) => {
        const p = latLngToMeters(lat, lng);
        return new THREE.Vector2(p.x, p.z);
      });
      const centroid = this.getCentroid(points);
      const bbox = new THREE.Box2();
      points.forEach((p) => bbox.expandByPoint(p));

      const width = Math.max(10, bbox.max.x - bbox.min.x);
      const depth = Math.max(10, bbox.max.y - bbox.min.y);
      const height = building.height_m;
      const tint = this.colorForHeight(height);

      const boxMatrix = new THREE.Matrix4();
      boxMatrix.compose(
        new THREE.Vector3(centroid.x, height / 2, centroid.y),
        new THREE.Quaternion(),
        new THREE.Vector3(width, height, depth)
      );
      farMesh.setMatrixAt(index, boxMatrix);
      farMesh.setColorAt(index, tint.clone().multiplyScalar(0.78));

      const midMesh = this.extrude(points, height, this.makeMaterial(tint, false));
      this.midGroup.add(midMesh);

      const nearMesh = this.extrude(points, height, this.makeMaterial(tint, true));
      if (building.roof === 'gable') this.addGableRoof(nearMesh, points, height, tint);
      this.addRoofMarker(nearMesh, points, height, tint);
      this.nearGroup.add(nearMesh);
    });

    farMesh.instanceMatrix.needsUpdate = true;
    if (farMesh.instanceColor) farMesh.instanceColor.needsUpdate = true;
    farMesh.castShadow = false;
    farMesh.receiveShadow = false;
    this.farGroup.add(farMesh);
  }

  private generateSkylineBuildings(): BuildingDatum[] {
    const buildings: BuildingDatum[] = [];
    const centerX = (this.tileBounds.min.x + this.tileBounds.max.x) / 2;
    const centerZ = (this.tileBounds.min.y + this.tileBounds.max.y) / 2;
    const downtown = new THREE.Vector2(0, 0);
    const distToDowntown = new THREE.Vector2(centerX, centerZ).distanceTo(downtown);

    const seed = Math.floor(Math.abs(centerX * 0.0013 + centerZ * 0.0017) * 10000);
    const minX = this.tileBounds.min.x + 70;
    const maxX = this.tileBounds.max.x - 70;
    const minZ = this.tileBounds.min.y + 70;
    const maxZ = this.tileBounds.max.y - 70;

    const candidateCount = distToDowntown < 7000 ? 170 : distToDowntown < 14000 ? 65 : 18;
    let idCounter = 0;

    for (let i = 0; i < candidateCount; i += 1) {
      const rx = this.rand(seed + i * 17);
      const rz = this.rand(seed + i * 37 + 11);
      const x = THREE.MathUtils.lerp(minX, maxX, rx);
      const z = THREE.MathUtils.lerp(minZ, maxZ, rz);

      const d = new THREE.Vector2(x, z).distanceTo(downtown);
      const urban = THREE.MathUtils.clamp(1 - d / 19000, 0, 1);
      const keepChance = 0.18 + urban * 0.82;
      if (this.rand(seed + i * 59 + 13) > keepChance) continue;

      const towerChance = 0.04 + urban * 0.2;
      const isTower = this.rand(seed + i * 67 + 5) < towerChance;
      const width = 22 + this.rand(seed + i * 31 + 9) * (isTower ? 45 : 85);
      const depth = 22 + this.rand(seed + i * 43 + 3) * (isTower ? 45 : 85);

      let height = 18 + urban * 65 + Math.pow(this.rand(seed + i * 47 + 21), 2) * (40 + urban * 220);
      if (isTower) height += 80 + this.rand(seed + i * 73 + 7) * 170;
      height = THREE.MathUtils.clamp(height, 16, 360);

      const halfW = width / 2;
      const halfD = depth / 2;
      const footprintMeters: [number, number][] = [
        [x - halfW, z - halfD],
        [x - halfW, z + halfD],
        [x + halfW, z + halfD],
        [x + halfW, z - halfD]
      ];

      const footprint = footprintMeters.map(([mx, mz]) => {
        const { lat, lng } = metersToLatLng(mx, mz);
        return [lng, lat] as [number, number];
      });

      buildings.push({
        id: `g_${seed}_${idCounter}`,
        footprint,
        height_m: height,
        roof: urban > 0.6 || isTower ? 'flat' : 'gable'
      });
      idCounter += 1;
    }

    return buildings;
  }

  private makeMaterial(baseColor: THREE.Color, near: boolean): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: baseColor.clone().multiplyScalar(near ? 0.11 : 0.05),
      emissiveIntensity: near ? 0.75 : 0.3,
      roughness: near ? 0.62 : 0.82,
      metalness: near ? 0.24 : 0.1
    });
  }

  private colorForHeight(height: number): THREE.Color {
    const t = THREE.MathUtils.clamp((height - 20) / 320, 0, 1);
    return new THREE.Color().setHSL(0.61 - t * 0.12, 0.18 + t * 0.2, 0.34 + t * 0.18);
  }

  private extrude(points: THREE.Vector2[], height: number, material: THREE.Material): THREE.Mesh {
    const shape = new THREE.Shape(points);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 1 });
    geometry.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = height < 140;
    return mesh;
  }

  private addGableRoof(mesh: THREE.Mesh, points: THREE.Vector2[], height: number, tint: THREE.Color) {
    const bbox = new THREE.Box2();
    points.forEach((p) => bbox.expandByPoint(p));

    const width = bbox.max.x - bbox.min.x;
    const depth = bbox.max.y - bbox.min.y;
    const roofHeight = Math.min(12, height * 0.2);

    const geometry = new THREE.ConeGeometry(Math.max(width, depth) * 0.34, roofHeight, 4);
    geometry.rotateY(Math.PI / 4);
    const roof = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: tint.clone().offsetHSL(-0.02, 0.03, -0.06),
        roughness: 0.64,
        metalness: 0.08
      })
    );
    roof.position.set((bbox.min.x + bbox.max.x) / 2, height + roofHeight * 0.45, (bbox.min.y + bbox.max.y) / 2);
    mesh.add(roof);
  }

  private addRoofMarker(mesh: THREE.Mesh, points: THREE.Vector2[], height: number, tint: THREE.Color) {
    if (height < 140) return;

    const bbox = new THREE.Box2();
    points.forEach((p) => bbox.expandByPoint(p));

    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 3.2, 6),
      new THREE.MeshStandardMaterial({
        color: tint.clone().lerp(new THREE.Color(0xfff0cf), 0.7),
        emissive: 0xff9f52,
        emissiveIntensity: 1.8,
        roughness: 0.2,
        metalness: 0
      })
    );
    marker.position.set((bbox.min.x + bbox.max.x) / 2, height + 2.2, (bbox.min.y + bbox.max.y) / 2);
    mesh.add(marker);
  }

  private rand(value: number): number {
    const s = Math.sin(value * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  }

  private getCentroid(points: THREE.Vector2[]): THREE.Vector2 {
    const sum = points.reduce((acc, p) => acc.add(p), new THREE.Vector2());
    return sum.multiplyScalar(1 / points.length);
  }
}
