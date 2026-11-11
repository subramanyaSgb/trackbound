export type Action = 'left' | 'right' | 'jump' | 'slide' | 'pause';

/** Keyboard + swipe input. Swipes fire as soon as the threshold is crossed, not on release. */
export class Input {
  private sx = 0;
  private sy = 0;
  private armed = false;
  threshold = 26;
  /** Called with horizontal drag deltas (used to rotate the character in menus). */
  onDrag: (dx: number) => void = () => {};
  /** While true, drags rotate the preview and no swipes are emitted. */
  dragMode = false;
  private lastX = 0;

  constructor(el: HTMLElement, private emit: (a: Action) => void) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const map: Record<string, Action> = {
        ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
        ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', ArrowDown: 'slide', KeyS: 'slide', Escape: 'pause', KeyP: 'pause',
      };
      const a = map[e.code];
      if (a) { e.preventDefault(); this.emit(a); }
    });
    el.addEventListener('pointerdown', (e) => { this.sx = this.lastX = e.clientX; this.sy = e.clientY; this.armed = true; });
    el.addEventListener('pointermove', (e) => {
      if (!this.armed) return;
      if (this.dragMode) { this.onDrag(e.clientX - this.lastX); this.lastX = e.clientX; return; }
      const dx = e.clientX - this.sx;
      const dy = e.clientY - this.sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < this.threshold) return;
      this.armed = false;
      this.emit(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'slide' : 'jump');
    });
    const end = () => { this.armed = false; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
}
