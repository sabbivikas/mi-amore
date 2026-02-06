import { FlightTelemetry } from '../flight/FlightController';

export class HUD {
  private readonly speedEl = document.querySelector('#hud-speed') as HTMLElement;
  private readonly altitudeEl = document.querySelector('#hud-altitude') as HTMLElement;
  private readonly headingEl = document.querySelector('#hud-heading') as HTMLElement;
  private readonly targetEl = document.querySelector('#hud-target') as HTMLElement;
  private readonly threatEl = document.querySelector('#hud-threat') as HTMLElement;
  private readonly boostFill = document.querySelector('#hud-boost-fill') as HTMLElement;
  private readonly waveEl = document.querySelector('#hud-wave') as HTMLElement;

  setVisible(visible: boolean) {
    const hud = document.querySelector('#hud') as HTMLElement;
    hud.classList.toggle('hidden', !visible);
  }

  setWave(wave: number) {
    this.waveEl.textContent = `WAVE ${wave}`;
  }

  setTarget(locked: boolean) {
    this.targetEl.textContent = locked ? 'TGT LOCK' : 'TGT ---';
  }

  setThreat(threat: number) {
    if (threat > 0.66) this.threatEl.textContent = 'THREAT HIGH';
    else if (threat > 0.33) this.threatEl.textContent = 'THREAT MED';
    else this.threatEl.textContent = 'THREAT LOW';
  }

  update(telemetry: FlightTelemetry) {
    this.speedEl.textContent = `SPD ${telemetry.speed.toFixed(0)}`;
    this.altitudeEl.textContent = `ALT ${telemetry.altitude.toFixed(0)}`;
    this.headingEl.textContent = `HDG ${telemetry.heading.toFixed(0).padStart(3, '0')}`;
    this.boostFill.style.width = `${Math.round(telemetry.boost * 100)}%`;
  }
}
