import * as THREE from 'three';

export class TerrainTile {
  public readonly mesh: THREE.Mesh;
  public readonly size: number;
  private readonly seed: number;
  private readonly worldOffsetX: number;
  private readonly worldOffsetZ: number;

  constructor(size: number, resolution: number, seed: number, worldOffsetX = 0, worldOffsetZ = 0) {
    this.size = size;
    this.seed = seed;
    this.worldOffsetX = worldOffsetX;
    this.worldOffsetZ = worldOffsetZ;
    const geometry = new THREE.PlaneGeometry(size, size, resolution, resolution);
    geometry.rotateX(-Math.PI / 2);

    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const color = new THREE.Color();
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const z = position.getZ(i);
      const worldX = x + this.worldOffsetX;
      const worldZ = z + this.worldOffsetZ;
      const height = this.sampleHeight(worldX, worldZ);
      position.setY(i, height);

      const biome = this.sampleBiome(worldX, worldZ);
      const mountainMask = THREE.MathUtils.smoothstep(biome, 0.45, 0.88);
      const heightT = THREE.MathUtils.clamp(height / 320, 0, 1);

      const plains = new THREE.Color(0x4d734a);
      const hill = new THREE.Color(0x6e7f56);
      const rock = new THREE.Color(0x7f8288);
      const snow = new THREE.Color(0xe6ebef);

      color.copy(plains);
      color.lerp(hill, THREE.MathUtils.clamp(heightT * 1.15, 0, 1));
      color.lerp(rock, mountainMask * THREE.MathUtils.smoothstep(height, 90, 260));
      color.lerp(snow, THREE.MathUtils.smoothstep(height, 250, 380) * mountainMask);

      const variation = this.fbm(worldX * 0.0018, worldZ * 0.0018, 3, 2.1, 0.5) * 0.12;
      color.offsetHSL(0.01 - variation * 0.08, 0, variation * 0.04);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      flatShading: true
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
  }

  private sampleHeight(worldX: number, worldZ: number): number {
    const lowlands = this.fbm(worldX * 0.00012, worldZ * 0.00012, 5, 2.0, 0.52);
    const hills = this.fbm(worldX * 0.00042, worldZ * 0.00042, 4, 2.1, 0.48);
    const mountainRidge = this.ridgeFbm(worldX * 0.00022, worldZ * 0.00022, 5, 2.0, 0.55);
    const mountainMask = THREE.MathUtils.smoothstep(this.sampleBiome(worldX, worldZ), 0.48, 0.9);
    const range = mountainRidge * mountainMask * 300;
    const plateau = Math.pow(lowlands, 1.6) * 70;

    const height = 8 + lowlands * 34 + hills * 46 + plateau + range;
    return THREE.MathUtils.clamp(height, 2, 420);
  }

  private sampleBiome(worldX: number, worldZ: number): number {
    return this.fbm(worldX * 0.000085 + 42.3, worldZ * 0.000085 - 13.7, 4, 2.0, 0.5);
  }

  private ridgeFbm(x: number, y: number, octaves: number, lacunarity: number, gain: number): number {
    let frequency = 1;
    let amplitude = 0.5;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i += 1) {
      const n = this.valueNoise2D(x * frequency, y * frequency);
      const ridge = 1 - Math.abs(2 * n - 1);
      sum += ridge * ridge * amplitude;
      norm += amplitude;
      frequency *= lacunarity;
      amplitude *= gain;
    }
    return norm > 0 ? sum / norm : 0;
  }

  private fbm(x: number, y: number, octaves: number, lacunarity: number, gain: number): number {
    let frequency = 1;
    let amplitude = 0.5;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i += 1) {
      sum += this.valueNoise2D(x * frequency, y * frequency) * amplitude;
      norm += amplitude;
      frequency *= lacunarity;
      amplitude *= gain;
    }
    return norm > 0 ? sum / norm : 0;
  }

  private valueNoise2D(x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = x - x0;
    const ty = y - y0;

    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);

    const n00 = this.hash2(x0, y0);
    const n10 = this.hash2(x0 + 1, y0);
    const n01 = this.hash2(x0, y0 + 1);
    const n11 = this.hash2(x0 + 1, y0 + 1);

    const ix0 = THREE.MathUtils.lerp(n00, n10, sx);
    const ix1 = THREE.MathUtils.lerp(n01, n11, sx);
    return THREE.MathUtils.lerp(ix0, ix1, sy);
  }

  private hash2(x: number, y: number): number {
    const s = Math.sin(x * 127.1 + y * 311.7 + this.seed * 19.19) * 43758.5453123;
    return s - Math.floor(s);
  }
}
