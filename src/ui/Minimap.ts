import * as THREE from 'three';
import { ProtectZone } from '../ai/AlienAI';

export class Minimap {
  private readonly container = document.querySelector('#minimap') as HTMLElement;
  private readonly canvas = document.querySelector('#minimap-canvas') as HTMLCanvasElement;
  private readonly ctx = this.canvas.getContext('2d')!;

  setVisible(visible: boolean) {
    this.container.classList.toggle('hidden', !visible);
  }

  render(player: THREE.Object3D, aliens: THREE.Object3D[], zones: ProtectZone[]) {
    const ctx = this.ctx;
    const size = this.canvas.width;
    const scale = THREE.MathUtils.clamp(player.position.y * 2.2, 400, 1200);

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(5, 10, 16, 0.8)';
    ctx.fillRect(0, 0, size, size);

    const center = new THREE.Vector2(player.position.x, player.position.z);

    const mapToCanvas = (pos: THREE.Vector3) => {
      const dx = (pos.x - center.x) / scale;
      const dz = (pos.z - center.y) / scale;
      return {
        x: size / 2 + dx * size,
        y: size / 2 + dz * size
      };
    };

    zones.forEach((zone) => {
      const c = mapToCanvas(zone.position);
      ctx.strokeStyle = 'rgba(126, 247, 255, 0.6)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, (zone.radius / scale) * size, 0, Math.PI * 2);
      ctx.stroke();
    });

    aliens.forEach((alien) => {
      const c = mapToCanvas(alien.position);
      ctx.fillStyle = 'rgba(255, 90, 122, 0.9)';
      ctx.fillRect(c.x - 2, c.y - 2, 4, 4);
    });

    const playerPoint = mapToCanvas(player.position);
    ctx.fillStyle = 'rgba(126, 247, 255, 1)';
    ctx.beginPath();
    ctx.arc(playerPoint.x, playerPoint.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
