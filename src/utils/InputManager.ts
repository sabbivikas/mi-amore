type KeyState = Record<string, boolean>;

type InputAction =
  | 'pitchUp'
  | 'pitchDown'
  | 'rollLeft'
  | 'rollRight'
  | 'fire'
  | 'boost'
  | 'brake'
  | 'pause'
  | 'reset'
  | 'minimap'
  | 'hud'
  | 'debug'
  | 'mode';

const ACTION_MAP: Record<InputAction, string[]> = {
  pitchUp: ['ArrowDown'],
  pitchDown: ['ArrowUp'],
  rollLeft: ['ArrowLeft'],
  rollRight: ['ArrowRight'],
  fire: ['Space'],
  boost: ['ShiftLeft', 'ShiftRight'],
  brake: ['ControlLeft', 'ControlRight'],
  pause: ['KeyP'],
  reset: ['KeyR'],
  minimap: ['KeyM'],
  hud: ['KeyH'],
  debug: ['Backquote'],
  mode: ['KeyF']
};

export class InputManager {
  private keys: KeyState = {};
  private toggles: Record<string, boolean> = {};

  constructor() {
    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keys[event.code] = true;

      if (event.code === 'KeyP') this.flipToggle('pause');
      if (event.code === 'KeyM') this.flipToggle('minimap');
      if (event.code === 'KeyH') this.flipToggle('hud');
      if (event.code === 'Backquote') this.flipToggle('debug');
      if (event.code === 'KeyF') this.flipToggle('mode');
    });

    window.addEventListener('keyup', (event) => {
      this.keys[event.code] = false;
    });
  }

  isDown(action: InputAction): boolean {
    return ACTION_MAP[action].some((code) => this.keys[code]);
  }

  getToggle(name: 'pause' | 'minimap' | 'hud' | 'debug' | 'mode'): boolean {
    if (!(name in this.toggles)) this.toggles[name] = false;
    return this.toggles[name];
  }

  private flipToggle(name: 'pause' | 'minimap' | 'hud' | 'debug' | 'mode') {
    this.toggles[name] = !this.getToggle(name);
  }

  isCodeDown(code: string): boolean {
    return !!this.keys[code];
  }
}
