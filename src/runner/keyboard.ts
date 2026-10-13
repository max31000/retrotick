/**
 * Focus and keyboard handling of the runner root:
 * - a press anywhere in the game focuses the root (the canvas cancels the
 *   default focus change), and resumes the AudioContext (user gesture);
 * - while focus is inside, F1–F12, Space and the arrow keys never reach the
 *   browser (help, find, reload, page scrolling...);
 * - Alt shows the keyboard cues (mnemonic underlines), as on XP.
 */
const FUNCTION_KEYS = new Set(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12']);
/** Guarded only outside text inputs: in an edit control they type / move the caret. */
const NAVIGATION_KEYS = new Set([' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function isTextInput(el: EventTarget | null): boolean {
  const e = el as HTMLElement | null;
  if (!e || !e.tagName) return false;
  const tag = e.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.isContentEditable;
}

/** Whether the runner suppresses the browser default for this key in this target. */
export function shouldGuardKey(key: string, target: EventTarget | null): boolean {
  if (FUNCTION_KEYS.has(key)) return true;
  return NAVIGATION_KEYS.has(key) && !isTextInput(target);
}
const CUES_CLASS = 'bliss-luna-cues';

export function installKeyboardGuard(root: HTMLElement, audio: AudioContext | null): () => void {
  const resumeAudio = () => {
    if (audio && audio.state === 'suspended') audio.resume().catch(() => { /* not allowed yet */ });
  };
  const onPointerDown = (e: PointerEvent) => {
    resumeAudio();
    root.classList.remove(CUES_CLASS);
    // Let form fields (dialog edit controls) take focus themselves
    if (isTextInput(e.target)) return;
    if (root.ownerDocument.activeElement !== root && !root.contains(root.ownerDocument.activeElement)) {
      root.focus({ preventScroll: true });
    }
  };
  const onKeyDown = (e: KeyboardEvent) => {
    resumeAudio();
    if (e.key === 'Alt') root.classList.add(CUES_CLASS);
    if (shouldGuardKey(e.key, e.target)) e.preventDefault();
  };
  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('keydown', onKeyDown);
  return () => {
    root.removeEventListener('pointerdown', onPointerDown, true);
    root.removeEventListener('keydown', onKeyDown);
  };
}
