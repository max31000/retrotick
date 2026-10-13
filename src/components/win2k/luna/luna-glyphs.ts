/**
 * Pixel glyphs of the Windows XP Luna caption buttons and menu marks, drawn
 * on the 21×21 caption-button grid (rows as 1px horizontal strokes, the same
 * way the original bitmaps are laid out). Returned as CSS `url()` values.
 */

function svgUrl(paths: string, color: string, size = 21): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 -0.5 ${size} ${size}" shape-rendering="crispEdges"><path stroke="${color}" d="${paths}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const MIN = 'M5 13h7M5 14h7M5 15h7';
const MAX = 'M5 5h11M5 6h11M5 7h11M5 8h1M15 8h1M5 9h1M15 9h1M5 10h1M15 10h1M5 11h1M15 11h1M5 12h1M15 12h1M5 13h1M15 13h1M5 14h1M15 14h1M5 15h11';
const RESTORE = 'M8 4h8M8 5h8M8 6h1M15 6h1M8 7h1M15 7h1M15 8h1M15 9h1M15 10h1M13 11h3'
  + 'M5 8h8M5 9h8M5 10h1M12 10h1M5 11h1M12 11h1M5 12h1M12 12h1M5 13h1M12 13h1M5 14h1M12 14h1M5 15h8';
const CLOSE = 'M6 5h1M14 5h1M5 6h3M13 6h3M6 7h3M12 7h3M7 8h3M11 8h3M8 9h5M9 10h3M8 11h5'
  + 'M7 12h3M11 12h3M6 13h3M12 13h3M5 14h3M13 14h3M6 15h1M14 15h1';
const HELP = 'M8 4h5M7 5h2M12 5h2M12 6h2M11 7h2M10 8h2M9 9h2M9 10h2M9 13h2M9 14h2';

const WHITE = '#FFFFFF';
const FADED = 'rgba(255,255,255,0.45)';

export const LUNA_GLYPHS = {
  min: svgUrl(MIN, WHITE),
  max: svgUrl(MAX, WHITE),
  maxDisabled: svgUrl(MAX, FADED),
  minDisabled: svgUrl(MIN, FADED),
  restore: svgUrl(RESTORE, WHITE),
  close: svgUrl(CLOSE, WHITE),
  help: svgUrl(HELP, WHITE),
  /** Menu check mark (7×7 on a 9×9 grid) */
  check: svgUrl('M7 1h1M6 2h2M1 3h1M5 3h2M1 4h2M4 4h2M2 5h3M3 6h1', '#000000', 9),
  checkWhite: svgUrl('M7 1h1M6 2h2M1 3h1M5 3h2M1 4h2M4 4h2M2 5h3M3 6h1', '#FFFFFF', 9),
  /** Check box tick (green, 7×7 on a 9×9 grid) */
  tick: svgUrl('M7 1h1M6 2h2M1 3h1M5 3h2M1 4h2M4 4h2M2 5h3M3 6h1', '#21A121', 9),
  tickDisabled: svgUrl('M7 1h1M6 2h2M1 3h1M5 3h2M1 4h2M4 4h2M2 5h3M3 6h1', '#CAC8BB', 9),
  /** Submenu arrow (4×7 triangle on a 9×9 grid) */
  arrow: svgUrl('M3 1h1M3 2h2M3 3h3M3 4h4M3 5h3M3 6h2M3 7h1', '#000000', 9),
  arrowWhite: svgUrl('M3 1h1M3 2h2M3 3h3M3 4h4M3 5h3M3 6h2M3 7h1', '#FFFFFF', 9),
} as const;
