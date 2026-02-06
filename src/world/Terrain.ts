import * as THREE from 'three';

export class Terrain {
  constructor(private readonly seed = 1337) {}

  createChunkMesh(chunkX: number, chunkZ: number, chunkSize: number, resolution: number): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(chunkSize, chunkSize, resolution, resolution);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();

    const baseX = chunkX * chunkSize;
    const baseZ = chunkZ * chunkSize;

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i) + baseX;
      const z = pos.getZ(i) + baseZ;
      const h = this.getTerrainHeight(x, z);
      pos.setY(i, h);

      const n = this.fbm(x * 0.004, z * 0.004, 3, 2.1, 0.5);
      const t = THREE.MathUtils.clamp(h / 34, 0, 1);
      c.setHSL(0.29 - t * 0.03 + n * 0.015, 0.34, 0.26 + t * 0.12);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      flatShading: true
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.position.set(baseX, 0, baseZ);
    return mesh;
  }

  getTerrainHeight(x: number, z: number): number {
    const broad = this.fbm(x * 0.00045, z * 0.00045, 4, 2.0, 0.52);
    const detail = this.fbm(x * 0.0025, z * 0.0025, 3, 2.1, 0.48);
    const ridge = this.ridge(x * 0.0008 + 12, z * 0.0008 - 7);
    const mountainMask = THREE.MathUtils.smoothstep(this.fbm(x * 0.00018, z * 0.00018, 3, 2.0, 0.5), 0.65, 0.92);

    const low = 4 + broad * 10 + detail * 3;
    const mountains = ridge * mountainMask * 22;
    return THREE.MathUtils.clamp(low + mountains, 0, 42);
  }

  private ridge(x: number, y: number): number {
    const n = this.fbm(x, y, 5, 2.0, 0.55);
    return 1 - Math.abs(2 * n - 1);
  }

  private fbm(x: number, y: number, octaves: number, lacunarity: number, gain: number): number {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i += 1) {
      sum += this.valueNoise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  }

  private valueNoise(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const tx = x - xi;
    const ty = y - yi;

    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);

    const n00 = this.hash(xi, yi);
    const n10 = this.hash(xi + 1, yi);
    const n01 = this.hash(xi, yi + 1);
    const n11 = this.hash(xi + 1, yi + 1);

    const nx0 = THREE.MathUtils.lerp(n00, n10, sx);
    const nx1 = THREE.MathUtils.lerp(n01, n11, sx);
    return THREE.MathUtils.lerp(nx0, nx1, sy);
  }

  private hash(x: number, y: number): number {
    const s = Math.sin(x * 127.1 + y * 311.7 + this.seed * 17.17) * 43758.5453123;
    return s - Math.floor(s);
  }
}
