/**
 * Focus and keyboard handling of the runner root:
 * - a press anywhere in the game focuses the root (the canvas cancels the
 *   default focus change), and resumes the AudioContext (user gesture);
 * - while focus is inside, F1–F12, Space and the arrow keys never reach the
 *   browser (help, find, reload, page scrolling...);
 * - Alt shows the keyboard cues (mnemonic underlines), as on XP.
 */
const GUARDED_KEYS = new Set([
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  ' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);
const CUES_CLASS = 'bliss-luna-cues';

export function installKeyboardGuard(root: HTMLElement, audio: AudioContext | null): () => void {
  const resumeAudio = () => {
    if (audio && audio.state === 'suspended') audio.resume().catch(() => { /* not allowed yet */ });
  };
  const onPointerDown = (e: PointerEvent) => {
    resumeAudio();
    root.classList.remove(CUES_CLASS);
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    // Let form fields (dialog edit controls) take focus themselves
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (root.ownerDocument.activeElement !== root && !root.contains(root.ownerDocument.activeElement)) {
      root.focus({ preventScroll: true });
    }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    resumeAudio();
    if (e.key === 'Alt') root.classList.add(CUES_CLASS);
    const tag = (e.target as HTMLElement | null)?.tagName;
    const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (GUARDED_KEYS.has(e.key) && !(inField && e.key.startsWith('Arrow'))) e.preventDefault();
  };
  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('keydown', onKeyDown);
  return () => {
    root.removeEventListener('pointerdown', onPointerDown, true);
    root.removeEventListener('keydown', onKeyDown);
  };
}
