import type { ComponentChildren } from 'preact';
import { useUiTheme, themeFaceColor } from './theme';

interface GroupBoxProps {
  children: ComponentChildren;
  label: ComponentChildren;
  fontCSS: string;
  bgColor?: string | null;
}

export function GroupBox({ children, label, fontCSS, bgColor }: GroupBoxProps) {
  const m = fontCSS.match(/^(\d+)px/);
  const frameTop = Math.round((m ? parseInt(m[1]) : 11) / 2);
  const theme = useUiTheme();
  const bg = bgColor || themeFaceColor(theme);
  if (theme.name === 'luna') {
    return (
      <>
        <div class="bliss-luna-groupbox-frame" style={{ top: frameTop }} />
        <span class="bliss-luna-groupbox-label" style={{ left: frameTop + 2, background: bg, font: fontCSS }}>{label}</span>
        {children}
      </>
    );
  }

  return (
    <>
      <div style={{
        position: 'absolute', left: 0, right: 0, top: `${frameTop}px`, bottom: 0,
        border: '1px solid', borderColor: '#808080 #FFF #FFF #808080',
        boxShadow: 'inset 1px 1px 0 #FFF, inset -1px -1px 0 #808080',
      }} />
      <span style={{
        position: 'absolute', top: 0, left: `${frameTop + 2}px`, background: bg,
        padding: '0 2px', font: fontCSS,
      }}>
        {label}
      </span>
      {children}
    </>
  );
}
