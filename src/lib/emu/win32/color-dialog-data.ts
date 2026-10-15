// ChooseColor data shared by comdlg32 and the dialog UI: CHOOSECOLOR layout, flags, the
// 48 basic colours (COLORREF, Wine dlls/comdlg32/colordlg.c) and HSL conversion (0..240).

export const CC_RGBINIT = 0x00000001;
export const CC_FULLOPEN = 0x00000002;
export const CC_PREVENTFULLOPEN = 0x00000004;
export const CHOOSECOLOR_RGBRESULT = 12;
export const CHOOSECOLOR_CUSTCOLORS = 16;
export const CHOOSECOLOR_FLAGS = 20;
export const CUSTOM_COLOR_COUNT = 16;
export const HSL_MAX = 240;

export const BASIC_COLORS: number[] = [
  0x8080FF, 0x80FFFF, 0x80FF80, 0x80FF00, 0xFFFF80, 0xFF8000, 0xC080FF, 0xFF80FF,
  0x0000FF, 0x00FFFF, 0x00FF80, 0x40FF00, 0xFFFF00, 0xC08000, 0xC08080, 0xFF00FF,
  0x404080, 0x4080FF, 0x00FF00, 0x808000, 0x804000, 0xFF8080, 0x400080, 0x8000FF,
  0x000080, 0x0080FF, 0x008000, 0x408000, 0xFF0000, 0xA00000, 0x800080, 0xFF0080,
  0x000040, 0x004080, 0x004000, 0x404000, 0x800000, 0x400000, 0x400040, 0x800040,
  0x000000, 0x008080, 0x408080, 0x808080, 0x808040, 0xC0C0C0, 0x400040, 0xFFFFFF,
];

export const rgbOf = (c: number): [number, number, number] => [c & 0xFF, (c >> 8) & 0xFF, (c >> 16) & 0xFF];
export const colorRef = (r: number, g: number, b: number): number => (r & 0xFF) | ((g & 0xFF) << 8) | ((b & 0xFF) << 16);
export const cssOf = (c: number): string => { const [r, g, b] = rgbOf(c); return `rgb(${r},${g},${b})`; };

/** RGB → HSL in the dialog's 0..240 scale. */
export function toHsl(c: number): [number, number, number] {
  const [r, g, b] = rgbOf(c).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [Math.round(h * HSL_MAX) % HSL_MAX, Math.round(s * HSL_MAX), Math.round(l * HSL_MAX)];
}

/** HSL (0..240) → COLORREF. */
export function fromHsl(h: number, s: number, l: number): number {
  const H = h / HSL_MAX, S = s / HSL_MAX, L = l / HSL_MAX;
  if (S === 0) { const v = Math.round(L * 255); return colorRef(v, v, v); }
  const q = L < 0.5 ? L * (1 + S) : L + S - L * S, p = 2 * L - q;
  const f = (t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return colorRef(Math.round(f(H + 1 / 3) * 255), Math.round(f(H) * 255), Math.round(f(H - 1 / 3) * 255));
}

export interface ColorDialogStrings {
  title: string; basic: string; custom: string; define: string; add: string;
  hue: string; sat: string; lum: string; red: string; green: string; blue: string; solid: string;
}

const RU: ColorDialogStrings = {
  title: 'Цвет', basic: 'Основные цвета:', custom: 'Дополнительные цвета:', define: 'Определить цвет >>',
  add: 'Добавить в набор', hue: 'Оттенок:', sat: 'Контраст:', lum: 'Яркость:', red: 'Красный:', green: 'Зелёный:',
  blue: 'Синий:', solid: 'Цвет|Заливка',
};
const EN: ColorDialogStrings = {
  title: 'Color', basic: 'Basic colors:', custom: 'Custom colors:', define: 'Define Custom Colors >>',
  add: 'Add to Custom Colors', hue: 'Hue:', sat: 'Sat:', lum: 'Lum:', red: 'Red:', green: 'Green:', blue: 'Blue:',
  solid: 'Color|Solid',
};
const LANG_RUSSIAN = 0x19;

export function colorDialogStrings(lcid: number): ColorDialogStrings {
  return (lcid & 0x3FF) === LANG_RUSSIAN ? RU : EN;
}
