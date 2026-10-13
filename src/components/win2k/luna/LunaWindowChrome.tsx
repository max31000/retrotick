import type { ComponentChildren, Ref } from 'preact';

export interface LunaCapButton {
  onClick?: () => void;
  disabled?: boolean;
}

export interface LunaWindowChromeProps {
  boxRef?: Ref<HTMLDivElement>;
  lang?: string;
  wrapStyle?: Record<string, string | number | undefined>;
  focused: boolean;
  /** true for WS_DLGFRAME windows without WS_THICKFRAME (3px frame, 29px caption) */
  dlgFrame: boolean;
  /** Dialog / message box (semantic class `bliss-luna-dialog`) */
  dialog?: boolean;
  className?: string;
  hasCaption: boolean;
  /** Border width for caption-less windows (0 = none) */
  bareBorder: number;
  clientW?: number;
  clientH?: number;
  clientBg?: string;
  minimized?: boolean;
  title: string;
  iconNode?: ComponentChildren;
  help?: LunaCapButton;
  min?: LunaCapButton;
  max?: LunaCapButton & { restore?: boolean };
  close?: LunaCapButton;
  onTitlePointerDown?: (e: PointerEvent) => void;
  onTitleDblClick?: () => void;
  menus?: ComponentChildren;
  overlay?: ComponentChildren;
  children?: ComponentChildren;
}

function CapButton({ kind, btn, label }: { kind: string; btn: LunaCapButton; label: string }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      class={`bliss-luna-btn bliss-luna-btn-${kind}`}
      disabled={btn.disabled}
      onPointerDown={(e) => { e.stopPropagation(); }}
      onDblClick={(e) => { e.stopPropagation(); }}
      onClick={(e) => { e.stopPropagation(); if (!btn.disabled) btn.onClick?.(); }}
    />
  );
}

/** Windows XP Luna window frame: caption bar, side/bottom frame, menu bar slot and client area. */
export function LunaWindowChrome(p: LunaWindowChromeProps) {
  const cls = ['bliss-luna-window'];
  if (!p.focused) cls.push('bliss-luna-inactive');
  if (p.dlgFrame) cls.push('bliss-luna-fixed');
  if (p.dialog) cls.push('bliss-luna-dialog');
  if (p.className) cls.push(p.className);
  const clientStyle = {
    ...(p.clientW != null ? { width: `${p.clientW}px` } : {}),
    ...(p.clientH != null ? { height: `${p.clientH}px` } : {}),
    display: p.minimized ? 'none' : 'block',
    ...(p.clientBg ? { background: p.clientBg } : {}),
  };
  const bareStyle = p.hasCaption ? {} : {
    padding: `${p.bareBorder}px`,
    ...(p.bareBorder ? {} : { background: 'transparent', boxShadow: 'none' }),
  };
  const border = p.hasCaption ? (p.dlgFrame ? 3 : 4) : p.bareBorder;
  const widthStyle = p.clientW != null ? { width: `${p.clientW + 2 * border}px` } : {};
  return (
    <div ref={p.boxRef} lang={p.lang} class={cls.join(' ')} style={{ position: 'relative', ...widthStyle, ...bareStyle, ...p.wrapStyle }}>
      {p.overlay}
      {p.hasCaption && (
        <div class="bliss-luna-titlebar" onPointerDown={p.onTitlePointerDown} onDblClick={p.onTitleDblClick}>
          {p.iconNode}
          <span class="bliss-luna-title">{p.title}</span>
          <span class="bliss-luna-controls">
            {p.help && <CapButton kind="help" btn={p.help} label="Help" />}
            {p.min && <CapButton kind="min" btn={p.min} label="Minimize" />}
            {p.max && <CapButton kind={p.max.restore ? 'restore' : 'max'} btn={p.max} label="Maximize" />}
            {p.close && <CapButton kind="close" btn={p.close} label="Close" />}
          </span>
        </div>
      )}
      <div class="bliss-luna-frame">
        {p.menus && <div style={{ display: p.minimized ? 'none' : 'block' }}>{p.menus}</div>}
        <div class="bliss-luna-client" style={clientStyle}>
          {p.children}
        </div>
      </div>
    </div>
  );
}
