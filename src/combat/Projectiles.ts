import * as THREE from 'three';

export interface Projectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  active: boolean;
}

interface Spark {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  active: boolean;
}

export class ProjectileManager {
  private readonly scene: THREE.Scene;
  private readonly pool: Projectile[] = [];
  private readonly sparkPool: Spark[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  spawn(position: THREE.Vector3, direction: THREE.Vector3) {
    const projectile = this.getProjectile();
    projectile.mesh.position.copy(position);
    projectile.velocity.copy(direction).multiplyScalar(560);
    projectile.life = 2.2;
    projectile.active = true;
    projectile.mesh.visible = true;
  }

  spawnImpact(position: THREE.Vector3) {
    for (let i = 0; i < 8; i += 1) {
      const spark = this.getSpark();
      spark.mesh.position.copy(position);
      spark.velocity.set(THREE.MathUtils.randFloatSpread(50), THREE.MathUtils.randFloat(-10, 26), THREE.MathUtils.randFloatSpread(50));
      spark.life = THREE.MathUtils.randFloat(0.12, 0.22);
      spark.active = true;
      spark.mesh.visible = true;
      (spark.mesh.material as THREE.MeshStandardMaterial).opacity = 0.95;
    }
  }

  update(dt: number) {
    for (const projectile of this.pool) {
      if (!projectile.active) continue;
      projectile.mesh.position.addScaledVector(projectile.velocity, dt);
      projectile.life -= dt;
      if (projectile.life <= 0) this.deactivate(projectile);
    }

    for (const spark of this.sparkPool) {
      if (!spark.active) continue;
      spark.mesh.position.addScaledVector(spark.velocity, dt);
      spark.velocity.multiplyScalar(0.86);
      spark.life -= dt;
      (spark.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, spark.life * 7);
      if (spark.life <= 0) this.deactivateSpark(spark);
    }
  }

  getActive(): Projectile[] {
    return this.pool.filter((p) => p.active);
  }

  private getProjectile(): Projectile {
    const existing = this.pool.find((p) => !p.active);
    if (existing) return existing;

    const geometry = new THREE.SphereGeometry(0.45, 8, 8);
    const material = new THREE.MeshStandardMaterial({
      color: 0xb0edff,
      emissive: 0x4ecbff,
      emissiveIntensity: 2.1,
      roughness: 0.2,
      metalness: 0,
      transparent: true,
      opacity: 0.95
    });
    const mesh = new THREE.Mesh(geometry, material);
    this.scene.add(mesh);

    const projectile: Projectile = {
      mesh,
      velocity: new THREE.Vector3(),
      life: 0,
      active: false
    };
    this.pool.push(projectile);
    return projectile;
  }

  private getSpark(): Spark {
    const existing = this.sparkPool.find((p) => !p.active);
    if (existing) return existing;

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 5, 5),
      new THREE.MeshStandardMaterial({
        color: 0xffe2af,
        emissive: 0xffa860,
        emissiveIntensity: 2.4,
        roughness: 0.1,
        metalness: 0,
        transparent: true,
        opacity: 0
      })
    );
    mesh.visible = false;
    this.scene.add(mesh);

    const spark: Spark = {
      mesh,
      velocity: new THREE.Vector3(),
      life: 0,
      active: false
    };
    this.sparkPool.push(spark);
    return spark;
  }

  private deactivate(projectile: Projectile) {
    projectile.active = false;
    projectile.mesh.visible = false;
  }

  private deactivateSpark(spark: Spark) {
    spark.active = false;
    spark.mesh.visible = false;
  }
}
