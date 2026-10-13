/**
 * Registers the original Windows XP font files under the family names that
 * Windows programs (and the Luna stylesheet) ask for. Author-defined faces
 * take precedence over locally installed fonts of the same family, so GDI
 * text drawn on the canvas ("Tahoma", "MS Shell Dlg") uses the XP files too.
 */
import type { RunnerFonts } from './types';

const FAMILIES: { key: keyof RunnerFonts; families: string[]; weight: string }[] = [
  { key: 'tahoma', families: ['Tahoma', 'Bliss Tahoma'], weight: 'normal' },
  { key: 'micross', families: ['Microsoft Sans Serif', 'MS Shell Dlg', 'MS Sans Serif'], weight: 'normal' },
  { key: 'trebucbd', families: ['Trebuchet MS', 'Bliss Trebuchet MS'], weight: 'bold' },
];

const registered = new Set<string>();

export async function registerXpFonts(fonts: RunnerFonts, doc: Document = document): Promise<void> {
  if (typeof FontFace === 'undefined' || !doc.fonts) return;
  const loads: Promise<unknown>[] = [];
  for (const { key, families, weight } of FAMILIES) {
    const url = fonts[key];
    if (!url) continue;
    for (const family of families) {
      const id = `${family}|${weight}|${url}`;
      if (registered.has(id)) continue;
      registered.add(id);
      const face = new FontFace(family, `url("${url}")`, { weight, style: 'normal' });
      doc.fonts.add(face);
      loads.push(face.load().catch(e => {
        registered.delete(id);
        console.warn(`[runner] font ${family} (${url}) failed to load:`, e);
      }));
    }
  }
  await Promise.all(loads);
}
