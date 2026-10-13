/**
 * Windows XP style 32×32 MessageBox icons (vector re-drawings): red disc with
 * a white cross (error), yellow triangle with "!" (warning), white speech
 * balloon with a blue "i" / "?" (information / question).
 */
import type { ComponentChildren } from 'preact';

import { MB_ICONERROR, MB_ICONQUESTION, MB_ICONWARNING, MB_ICONINFORMATION } from '../MessageBox';

function Balloon({ id, children }: { id: string; children: ComponentChildren }) {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stop-color="#FFFFFF" />
          <stop offset="1" stop-color="#C9D6EE" />
        </linearGradient>
      </defs>
      <path d="M16 2C8.3 2 2 7.2 2 13.6c0 4 2.4 7.4 6.1 9.5L6 30l7.6-4.9c.8.1 1.6.1 2.4.1 7.7 0 14-5.2 14-11.6S23.7 2 16 2z"
        fill={`url(#${id})`} stroke="#5A73A8" stroke-width="1" />
      {children}
    </svg>
  );
}

export function LunaMsgBoxIcon({ type }: { type: number }) {
  const icon = type & 0xF0;
  if (icon === MB_ICONERROR) {
    return (
      <svg width="32" height="32" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
        <defs>
          <radialGradient id="bliss-luna-err" cx="0.38" cy="0.32" r="0.75">
            <stop offset="0" stop-color="#FF9A86" />
            <stop offset="0.45" stop-color="#E8361E" />
            <stop offset="1" stop-color="#A40C00" />
          </radialGradient>
        </defs>
        <circle cx="16" cy="16" r="14.5" fill="url(#bliss-luna-err)" stroke="#8C0A00" stroke-width="1" />
        <path d="M10.5 10.5L21.5 21.5M21.5 10.5L10.5 21.5" stroke="#FFF" stroke-width="3.6" stroke-linecap="round" />
      </svg>
    );
  }
  if (icon === MB_ICONWARNING) {
    return (
      <svg width="32" height="32" viewBox="0 0 32 32" style={{ flexShrink: 0 }}>
        <defs>
          <linearGradient id="bliss-luna-warn" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#FFF3A6" />
            <stop offset="0.5" stop-color="#FFD43B" />
            <stop offset="1" stop-color="#F0A800" />
          </linearGradient>
        </defs>
        <path d="M16 2.5c.9 0 1.6.5 2 1.2l12.3 22.6c.8 1.5-.2 3.2-1.9 3.2H3.6c-1.7 0-2.7-1.7-1.9-3.2L14 3.7c.4-.7 1.1-1.2 2-1.2z"
          fill="url(#bliss-luna-warn)" stroke="#9C7000" stroke-width="1" />
        <path d="M14.3 10h3.4l-.7 10h-2z" fill="#000" />
        <circle cx="16" cy="24" r="1.8" fill="#000" />
      </svg>
    );
  }
  if (icon === MB_ICONINFORMATION) {
    return (
      <Balloon id="bliss-luna-info">
        <circle cx="16" cy="7.6" r="2" fill="#1A4FB5" />
        <path d="M13 11.5h4.6v8.6h1.6v1.9h-6.4v-1.9h1.5v-6.7H13z" fill="#1A4FB5" />
      </Balloon>
    );
  }
  if (icon === MB_ICONQUESTION) {
    return (
      <Balloon id="bliss-luna-quest">
        <path d="M12 9.2c.5-2.3 2.2-3.6 4.4-3.6 2.6 0 4.4 1.5 4.4 3.8 0 1.8-1.1 2.8-2.3 3.7-1 .7-1.3 1.2-1.3 2.4v.6h-2.6v-.9c0-1.7.6-2.6 1.8-3.5 1-.8 1.6-1.3 1.6-2.2 0-1-.7-1.6-1.7-1.6-1.1 0-1.7.7-1.9 1.8z" fill="#1A4FB5" />
        <circle cx="15.9" cy="19.6" r="1.7" fill="#1A4FB5" />
      </Balloon>
    );
  }
  return null;
}
