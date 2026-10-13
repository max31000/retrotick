/** Windows 2000 caption-bar buttons (moved out of Window.tsx). */
import { useState } from 'preact/hooks';

// --- Caption bar button SVGs ---

function encodeSvg(svgMarkup: string): string {
  return svgMarkup.replace(/'/g, '%27').replace(/"/g, '%22').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E');
}

/** Parse a bgPos like "top 2px left 3px" into {x, y} numbers */
function parseBgPos(bgPos: string): { x: number; y: number } {
  const topM = bgPos.match(/top\s+(\d+)px/);
  const leftM = bgPos.match(/left\s+(\d+)px/);
  return { x: leftM ? parseInt(leftM[1]) : 0, y: topM ? parseInt(topM[1]) : 0 };
}

export function capBtnSvg(svgMarkup: string, bgPos: string, onClick?: () => void) {
  const [pressed, setPressed] = useState(false);
  const encoded = encodeSvg(svgMarkup);
  // When pressed, shift the icon 1px right and 1px down
  const pos = pressed ? (() => { const p = parseBgPos(bgPos); return `top ${p.y + 1}px left ${p.x + 1}px`; })() : bgPos;
  return (
    <span
      onPointerDown={(e) => { e.stopPropagation(); setPressed(true); }}
      onPointerUp={() => { setPressed(false); onClick?.(); }}
      onPointerLeave={() => setPressed(false)}
      style={{
        display: 'inline-block', width: '16px', height: '14px', background: '#D4D0C8',
        border: '1px solid',
        borderColor: pressed ? '#404040 #FFF #FFF #404040' : '#FFF #404040 #404040 #FFF',
        boxShadow: pressed ? 'none' : 'inset 1px 1px 0 #D4D0C8, inset -1px -1px 0 #808080',
        cursor: 'var(--win2k-cursor)',
        backgroundImage: `url("data:image/svg+xml,${encoded}")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: pos,
      }}
    />
  );
}

/** Caption-bar text button (e.g. "2×"). `active` renders as sunken. */
export function capBtnText(label: string, onClick?: () => void, active?: boolean, title?: string) {
  const [pressed, setPressed] = useState(false);
  const sunken = pressed || active;
  return (
    <span
      title={title}
      onPointerDown={(e) => { e.stopPropagation(); setPressed(true); }}
      onPointerUp={() => { setPressed(false); onClick?.(); }}
      onPointerLeave={() => setPressed(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '22px', height: '14px', background: '#D4D0C8',
        border: '1px solid',
        borderColor: sunken ? '#404040 #FFF #FFF #404040' : '#FFF #404040 #404040 #FFF',
        boxShadow: sunken ? 'none' : 'inset 1px 1px 0 #D4D0C8, inset -1px -1px 0 #808080',
        cursor: 'var(--win2k-cursor)',
        font: 'bold 9px/1 "Tahoma",sans-serif',
        color: '#000',
        userSelect: 'none',
        paddingBottom: sunken ? '0' : '1px',
        paddingRight: sunken ? '0' : '1px',
        paddingTop: sunken ? '1px' : '0',
        paddingLeft: sunken ? '1px' : '0',
      }}
    >
      {label}
    </span>
  );
}

export const svgMin = "<svg width='6' height='2' xmlns='http://www.w3.org/2000/svg'><rect width='6' height='2' fill='#000'/></svg>";
export const svgMax = "<svg width='9' height='9' xmlns='http://www.w3.org/2000/svg'><path fill-rule='evenodd' d='M0 0h9v9H0V0zm1 2h7v6H1V2z' fill='#000'/></svg>";
export const svgRestore = "<svg width='9' height='9' xmlns='http://www.w3.org/2000/svg'><path fill-rule='evenodd' d='M2 0h7v7H7v2H0V2h2V0zm1 2h4v1H3v3H2V2h1zm-1 2h5v4H1V4h1zm0 1v2h4V5H2z' fill='#000'/></svg>";
export const svgClose = "<svg width='8' height='7' xmlns='http://www.w3.org/2000/svg'><path fill-rule='evenodd' d='M0 0h2v1h1v1h2V1h1V0h2v1H7v1H6v1H5v1h1v1h1v1h1v1H6V6H5V5H3v1H2v1H0V6h1V5h1V4h1V3H2V2H1V1H0V0z' fill='#000'/></svg>";
export const svgHelp = "<svg width='6' height='9' xmlns='http://www.w3.org/2000/svg'><path fill='#000' d='M0 1h2v2H0zM1 0h4v1H1zM4 1h2v2H4zM3 3h2v1H3zM2 4h2v2H2zM2 7h2v2H2z'/></svg>";
export const svgFullscreen = "<svg width='9' height='9' xmlns='http://www.w3.org/2000/svg'><path fill='#000' d='M0 0h4v1H1v3H0V0zm5 0h4v4H8V1H5V0zM0 5h1v3h3v1H0V5zm8 0h1v4H5V8h3V5z'/></svg>";
