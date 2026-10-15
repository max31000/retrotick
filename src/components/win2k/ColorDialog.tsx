// ChooseColor dialog (comdlg32 "Color"): basic and custom colour grids, and the
// "Define Custom Colors" panel with the hue/saturation spectrum, luminance bar and fields.
import { useState, useRef, useEffect, useLayoutEffect } from 'preact/hooks';
import { Window, WS_CAPTION, WS_SYSMENU } from './Window';
import { Button } from './Button';
import { useUiTheme, useUiStrings, themeFaceColor } from './theme';
import {
  BASIC_COLORS, HSL_MAX, cssOf, rgbOf, colorRef, toHsl, fromHsl, colorDialogStrings,
} from '../../lib/emu/win32/color-dialog-data';

const FONT = '11px/1 "Tahoma","MS Sans Serif",sans-serif';
const SPECTRUM_W = 175;
const SPECTRUM_H = 187;
const LUM_W = 10;

interface ColorDialogProps {
  color: number;
  custom: number[];
  fullOpen: boolean;
  preventFullOpen: boolean;
  lcid: number;
  onResult: (result: { color: number; custom: number[] } | null) => void;
  focused?: boolean;
  parentRef?: { current: HTMLDivElement | null };
}

function Swatch({ color, selected, onPick }: { color: number; selected: boolean; onPick: () => void }) {
  return (
    <div onPointerDown={onPick} style={{
      width: '20px', height: '16px', boxSizing: 'border-box', padding: '1px',
      border: selected ? '1px solid #000' : '1px solid transparent', outline: selected ? '1px dotted #000' : 'none',
    }}>
      <div style={{ width: '100%', height: '100%', background: cssOf(color), boxShadow: 'inset 1px 1px #808080, inset -1px -1px #fff' }} />
    </div>
  );
}

function NumField({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', height: '22px' }}>
      <span>{label}</span>
      <input value={String(value)} style={{ width: '30px', font: FONT }}
        onInput={(e) => { const v = parseInt((e.target as HTMLInputElement).value, 10); if (!isNaN(v)) onChange(Math.max(0, Math.min(max, v))); }} />
    </label>
  );
}

export function ColorDialog({ color, custom, fullOpen, preventFullOpen, lcid, onResult, focused = true, parentRef }: ColorDialogProps) {
  const s = colorDialogStrings(lcid);
  const ui = useUiStrings();
  const theme = useUiTheme();
  const [cur, setCur] = useState(color);
  const [customs, setCustoms] = useState(custom.slice());
  const [customSlot, setCustomSlot] = useState(0);
  const [full, setFull] = useState(fullOpen && !preventFullOpen);
  const [initialPos, setInitialPos] = useState<{ x: number; y: number } | undefined>(undefined);
  const measureRef = useRef<HTMLDivElement>(null);
  const spectrumRef = useRef<HTMLCanvasElement>(null);
  const [h, sat, lum] = toHsl(cur);
  const [r, g, b] = rgbOf(cur);

  useLayoutEffect(() => {
    if (!measureRef.current) return;
    const rect = measureRef.current.getBoundingClientRect();
    const p = parentRef?.current?.getBoundingClientRect();
    const cx = p ? p.left + p.width / 2 : window.innerWidth / 2;
    const cy = p ? p.top + p.height / 2 : window.innerHeight / 2;
    setInitialPos({ x: Math.max(0, cx - rect.width / 2), y: Math.max(0, cy - rect.height / 2) });
  }, []);

  // Hue (x) / saturation (y) spectrum at medium luminance
  useEffect(() => {
    const c = spectrumRef.current?.getContext('2d');
    if (!c) return;
    const img = c.createImageData(SPECTRUM_W, SPECTRUM_H);
    for (let y = 0; y < SPECTRUM_H; y++) {
      for (let x = 0; x < SPECTRUM_W; x++) {
        const [rr, gg, bb] = rgbOf(fromHsl(x * HSL_MAX / SPECTRUM_W, HSL_MAX - y * HSL_MAX / SPECTRUM_H, HSL_MAX / 2));
        const i = (y * SPECTRUM_W + x) * 4;
        img.data[i] = rr; img.data[i + 1] = gg; img.data[i + 2] = bb; img.data[i + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
  }, [full]);

  const pickSpectrum = (e: PointerEvent) => {
    const t = e.currentTarget as HTMLElement, rc = t.getBoundingClientRect();
    if (e.buttons === 0 && e.type !== 'pointerdown') return;
    const x = Math.max(0, Math.min(SPECTRUM_W - 1, e.clientX - rc.left)), y = Math.max(0, Math.min(SPECTRUM_H - 1, e.clientY - rc.top));
    setCur(fromHsl(Math.round(x * HSL_MAX / SPECTRUM_W), Math.round(HSL_MAX - y * HSL_MAX / SPECTRUM_H), lum || HSL_MAX / 2));
  };
  const pickLum = (e: PointerEvent) => {
    if (e.buttons === 0 && e.type !== 'pointerdown') return;
    const rc = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = Math.max(0, Math.min(SPECTRUM_H, e.clientY - rc.top));
    setCur(fromHsl(h, sat, Math.round(HSL_MAX - y * HSL_MAX / SPECTRUM_H)));
  };
  const lumGradient = `linear-gradient(to bottom, #fff, ${cssOf(fromHsl(h, sat, HSL_MAX / 2))}, #000)`;
  const ok = () => onResult({ color: cur, custom: customs });

  return (
    <div ref={measureRef} style={{ position: 'fixed', left: 0, top: 0, font: FONT, visibility: initialPos ? 'visible' : 'hidden', zIndex: 1000 }}>
      <Window title={s.title} style={WS_CAPTION | WS_SYSMENU} focused={focused} draggable isDialog initialPos={initialPos} onClose={() => onResult(null)}>
        <div style={{ background: themeFaceColor(theme), display: 'flex', gap: '12px', padding: '8px 10px' }} onKeyDown={(e) => { if (e.key === 'Escape') onResult(null); if (e.key === 'Enter') ok(); }}>
          <div style={{ width: '178px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div>{s.basic}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 20px)', gap: '2px 2px' }}>
              {BASIC_COLORS.map((c, i) => <Swatch key={i} color={c} selected={c === cur} onPick={() => setCur(c)} />)}
            </div>
            <div style={{ marginTop: '6px' }}>{s.custom}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 20px)', gap: '2px 2px' }}>
              {customs.map((c, i) => <Swatch key={i} color={c} selected={i === customSlot && c === cur} onPick={() => { setCustomSlot(i); setCur(c); }} />)}
            </div>
            <div style={{ height: '23px', marginTop: '8px', opacity: preventFullOpen || full ? 0.5 : 1 }} onClick={() => { if (!preventFullOpen) setFull(true); }}>
              <Button fontCSS={FONT}>{s.define}</Button>
            </div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
              <div style={{ width: '75px', height: '23px' }} onClick={ok}><Button fontCSS={FONT} isDefault>{ui.ok}</Button></div>
              <div style={{ width: '75px', height: '23px' }} onClick={() => onResult(null)}><Button fontCSS={FONT}>{ui.cancel}</Button></div>
            </div>
          </div>
          {full && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', gap: '6px' }}>
                <canvas ref={spectrumRef} width={SPECTRUM_W} height={SPECTRUM_H} style={{ boxShadow: 'inset 1px 1px #808080' }}
                  onPointerDown={pickSpectrum} onPointerMove={pickSpectrum} />
                <div style={{ width: `${LUM_W}px`, height: `${SPECTRUM_H}px`, background: lumGradient, position: 'relative' }}
                  onPointerDown={pickLum} onPointerMove={pickLum}>
                  <div style={{ position: 'absolute', left: `${LUM_W + 2}px`, top: `${SPECTRUM_H - lum * SPECTRUM_H / HSL_MAX - 4}px`, width: 0, height: 0,
                    borderTop: '4px solid transparent', borderBottom: '4px solid transparent', borderRight: '6px solid #000' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <div style={{ width: '42px', textAlign: 'center' }}>
                  <div style={{ width: '40px', height: '26px', background: cssOf(cur), boxShadow: 'inset 1px 1px #808080, inset -1px -1px #fff' }} />
                  <div style={{ fontSize: '10px', marginTop: '2px' }}>{s.solid}</div>
                </div>
                <div>
                  <NumField label={s.hue} value={h} max={HSL_MAX - 1} onChange={(v) => setCur(fromHsl(v, sat, lum))} />
                  <NumField label={s.sat} value={sat} max={HSL_MAX} onChange={(v) => setCur(fromHsl(h, v, lum))} />
                  <NumField label={s.lum} value={lum} max={HSL_MAX} onChange={(v) => setCur(fromHsl(h, sat, v))} />
                </div>
                <div>
                  <NumField label={s.red} value={r} max={255} onChange={(v) => setCur(colorRef(v, g, b))} />
                  <NumField label={s.green} value={g} max={255} onChange={(v) => setCur(colorRef(r, v, b))} />
                  <NumField label={s.blue} value={b} max={255} onChange={(v) => setCur(colorRef(r, g, v))} />
                </div>
              </div>
              <div style={{ height: '23px' }} onClick={() => { const next = customs.slice(); next[customSlot] = cur; setCustoms(next); setCustomSlot((customSlot + 1) % next.length); }}>
                <Button fontCSS={FONT}>{s.add}</Button>
              </div>
            </div>
          )}
        </div>
      </Window>
    </div>
  );
}
