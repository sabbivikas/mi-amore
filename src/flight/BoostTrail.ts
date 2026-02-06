import * as THREE from 'three';

interface TrailParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  active: boolean;
}

export class BoostTrail {
  private readonly scene: THREE.Scene;
  private readonly particles: TrailParticle[] = [];
  private spawnTimer = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(
    dt: number,
    boostActive: boolean,
    anchors: THREE.Object3D[],
    direction: THREE.Vector3,
    speed: number
  ) {
    if (boostActive) {
      this.spawnTimer += dt;
      const interval = 0.018;
      while (this.spawnTimer > interval) {
        this.spawnTimer -= interval;
        for (const anchor of anchors) {
          const worldPos = new THREE.Vector3();
          anchor.getWorldPosition(worldPos);
          this.spawn(worldPos, direction, speed);
        }
      }
    }

    for (const p of this.particles) {
      if (!p.active) continue;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.life -= dt;
      const alpha = THREE.MathUtils.clamp(p.life / p.maxLife, 0, 1);
      const mat = p.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = alpha * 0.8;
      p.mesh.scale.setScalar(0.22 + (1 - alpha) * 0.65);
      if (p.life <= 0) this.deactivate(p);
    }
  }

  private spawn(position: THREE.Vector3, direction: THREE.Vector3, speed: number) {
    const p = this.getParticle();
    p.mesh.position.copy(position);

    const trailVel = direction.clone().multiplyScalar(-Math.max(80, speed * 0.6));
    trailVel.x += THREE.MathUtils.randFloatSpread(8);
    trailVel.y += THREE.MathUtils.randFloat(-5, 5);
    trailVel.z += THREE.MathUtils.randFloatSpread(8);

    p.velocity.copy(trailVel);
    p.life = 0.35;
    p.maxLife = 0.35;
    p.active = true;
    p.mesh.visible = true;
    (p.mesh.material as THREE.MeshStandardMaterial).opacity = 0.85;
  }

  private getParticle(): TrailParticle {
    const existing = this.particles.find((p) => !p.active);
    if (existing) return existing;

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 6, 6),
      new THREE.MeshStandardMaterial({
        color: 0x99deff,
        emissive: 0x3ac3ff,
        emissiveIntensity: 2.2,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        roughness: 0.2,
        metalness: 0
      })
    );
    mesh.visible = false;
    this.scene.add(mesh);

    const particle: TrailParticle = {
      mesh,
      velocity: new THREE.Vector3(),
      life: 0,
      maxLife: 0.35,
      active: false
    };
    this.particles.push(particle);
    return particle;
  }

  private deactivate(particle: TrailParticle) {
    particle.active = false;
    particle.mesh.visible = false;
  }
}
