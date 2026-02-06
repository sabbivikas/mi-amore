import * as THREE from 'three';

export class CapeRig {
  public readonly group = new THREE.Group();
  private readonly segments: THREE.Mesh[] = [];
  private readonly baseLength = 8.8;

  constructor() {
    const material = new THREE.MeshStandardMaterial({
      color: 0x30243f,
      emissive: 0x1a1024,
      emissiveIntensity: 0.35,
      roughness: 0.64,
      metalness: 0.1,
      side: THREE.DoubleSide
    });

    const segmentCount = 8;
    for (let i = 0; i < segmentCount; i += 1) {
      const width = THREE.MathUtils.lerp(2.9, 1.7, i / (segmentCount - 1));
      const geo = new THREE.PlaneGeometry(width, this.baseLength / segmentCount, 1, 1);
      const seg = new THREE.Mesh(geo, material);
      seg.position.set(0, -i * 1.0, i * 0.88 + 0.4);
      seg.castShadow = i < 4;
      this.group.add(seg);
      this.segments.push(seg);
    }
  }

  update(dt: number, speed: number, turnRate: number) {
    const t = performance.now() * 0.001;
    const speedFactor = THREE.MathUtils.clamp((speed - 80) / 220, 0, 1);
    const turnFactor = THREE.MathUtils.clamp(Math.abs(turnRate) * 0.02, 0, 1);
    const stretch = 1 + speedFactor * 0.18;

    for (let i = 0; i < this.segments.length; i += 1) {
      const seg = this.segments[i];
      const p = (i + 1) / this.segments.length;
      const flutter = Math.sin(t * (8 + i * 0.35) + i * 0.45) * (0.08 + 0.19 * speedFactor * p);
      const sway = Math.sin(t * 4 + i * 0.6) * 0.08 + turnRate * 0.0025 * p;

      seg.position.z = 0.55 + i * 0.95 * stretch;
      seg.position.y = -i * 0.92 - speedFactor * 0.65 * p;

      // Keep cape mostly behind the torso to reduce clipping with the body.
      seg.position.z = Math.max(seg.position.z, 0.5 + i * 0.8);
      seg.rotation.x = 0.18 + flutter + speedFactor * 0.13 * p;
      seg.rotation.y = sway;
      seg.rotation.z = turnFactor * 0.3 * Math.sin(t * 6 + i);
    }

    // Fast damping to keep simulation stable under frame spikes.
    this.group.rotation.z = THREE.MathUtils.lerp(this.group.rotation.z, -turnRate * 0.0018, Math.min(1, dt * 12));
  }
}
