import type { ComponentChildren } from 'preact';
import { useState, useEffect, useRef, useLayoutEffect } from 'preact/hooks';
import { fixedOriginOf, toFixedCoords, VIEWPORT_ORIGIN, type FixedOrigin } from './fixed-origin';
import { MenuDropdown } from './MenuBar';
import { useUiStrings, useIsLuna } from './theme';
import { LunaWindowChrome } from './luna/LunaWindowChrome';
import type { MenuItem } from '../../lib/pe/types';

// Real Windows system menu commands. We keep the canonical SC_* values so that
// callers integrating with WM_SYSCOMMAND can recognise them; non-Windows extras
// (Zoom 2×, Fullscreen) get private IDs in the 0xE000 range.
const SC_SIZE       = 0xF000;
const SC_MOVE       = 0xF010;
const SC_MINIMIZE   = 0xF020;
const SC_MAXIMIZE   = 0xF030;
const SC_CLOSE      = 0xF060;
const SC_RESTORE    = 0xF120;
const SC_ZOOM2X     = 0xE001;
const SC_FULLSCREEN = 0xE002;
const SC_SMOOTH     = 0xE003;
const DOUBLE_CLICK_MS = 400;

export { capBtnSvg, capBtnText, svgMin, svgMax, svgRestore, svgClose, svgHelp, svgFullscreen } from './caption-buttons';
import { capBtnSvg, capBtnText, svgMin, svgMax, svgRestore, svgClose, svgHelp, svgFullscreen } from './caption-buttons';

// --- Window Style Constants ---
export const WS_BORDER      = 0x00800000;
export const WS_DLGFRAME    = 0x00400000;
export const WS_CAPTION     = 0x00C00000; // WS_BORDER | WS_DLGFRAME
export const WS_SYSMENU     = 0x00080000;
export const WS_THICKFRAME  = 0x00040000;
export const WS_MINIMIZEBOX = 0x00020000;
export const WS_MAXIMIZEBOX = 0x00010000;

export function getBorderWidth(style: number): number {
  if (style & WS_THICKFRAME) return 4;
  if (style & WS_DLGFRAME)   return 3;
  if (style & WS_BORDER)     return 1;
  return 0;
}

interface WindowProps {
  title: string;
  style: number;
  clientW?: number;
  clientH?: number;
  iconUrl?: string | null;
  iconElement?: ComponentChildren;
  focused?: boolean;
  maximized?: boolean;
  minimized?: boolean;
  menus?: ComponentChildren;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onTitleBarMouseDown?: (e: PointerEvent) => void;
  onTitleBarDblClick?: () => void;
  onResizeStart?: (edge: string, e: PointerEvent) => void;
  hasHelp?: boolean;
  draggable?: boolean;
  initialPos?: { x: number; y: number };
  /** When true, renders a transparent overlay blocking interaction and redirects clicks to onBlockedClick */
  blocked?: boolean;
  onBlockedClick?: () => void;
  /** Increment to trigger a title bar flash animation (like Windows 2000 FlashWindow) */
  flashTrigger?: number;
  /** Background color for the client area (default: inherited from frame) */
  clientBg?: string;
  lang?: string;
  /** When provided, renders a "2×" button in the title bar that toggles zoom. */
  onZoomToggle?: () => void;
  /** Reflects current zoom state — button appears sunken when active. */
  zoomActive?: boolean;
  /** Reflects current fullscreen state — appears as a checkmark in the system menu. */
  fullscreenActive?: boolean;
  /** When provided, renders a fullscreen button in the title bar. */
  onFullscreenToggle?: () => void;
  /** When provided, renders an "AA" smoothing toggle next to the zoom button. */
  onSmoothToggle?: () => void;
  /** Reflects current smoothing state — button appears sunken when active. */
  smoothActive?: boolean;
  /** System-menu Move command (mouse-driven move mode). Grayed if absent. */
  onSystemMove?: () => void;
  /** System-menu Size command (mouse-driven resize mode). Grayed if absent. */
  onSystemSize?: () => void;
  /** Dialog / message box window (Luna: adds the `bliss-luna-dialog` class) */
  isDialog?: boolean;
  /** Extra class names on the Luna window element */
  className?: string;
  children?: ComponentChildren;
}

export function Window({
  title, style: wStyle, clientW, clientH, iconUrl, iconElement,
  focused = true, maximized, minimized,
  menus, onClose, onMinimize, onMaximize,
  onTitleBarMouseDown, onTitleBarDblClick, onResizeStart,
  hasHelp, draggable, initialPos, blocked, onBlockedClick, flashTrigger, clientBg, lang,
  onZoomToggle, zoomActive, fullscreenActive, onFullscreenToggle,
  onSmoothToggle, smoothActive,
  onSystemMove, onSystemSize, isDialog, className, children,
}: WindowProps) {
  const hasCaption = (wStyle & WS_CAPTION) === WS_CAPTION;
  const hasThickFrame = !!(wStyle & WS_THICKFRAME);
  const uiStrings = useUiStrings();
  const luna = useIsLuna();

  // --- Flash animation ---
  const [flashUnfocused, setFlashUnfocused] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevFlashTrigger = useRef(flashTrigger ?? 0);

  useEffect(() => {
    const cur = flashTrigger ?? 0;
    if (cur === prevFlashTrigger.current) return;
    prevFlashTrigger.current = cur;
    // Already flashing — ignore
    if (flashTimer.current) return;
    let count = 0;
    const toggle = () => {
      count++;
      setFlashUnfocused(count % 2 === 1);
      if (count < 6) {
        flashTimer.current = setTimeout(toggle, 70);
      } else {
        flashTimer.current = null;
      }
    };
    toggle();
  }, [flashTrigger]);

  const effectiveFocused = flashUnfocused ? false : focused;

  // --- Built-in drag support ---
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(initialPos ?? null);

  useEffect(() => {
    if (initialPos) setDragPos(initialPos);
  }, [initialPos?.x, initialPos?.y]);
  const dragState = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!draggable) return;
    const onMove = (e: PointerEvent) => {
      const d = dragState.current;
      if (!d) return;
      setDragPos({ x: d.startPosX + e.clientX - d.startX, y: d.startPosY + e.clientY - d.startY });
    };
    const onUp = () => { dragState.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [draggable]);

  // --- System menu (icon click) ---
  const [sysMenuPos, setSysMenuPos] = useState<{ x: number; y: number } | null>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const lastIconClick = useRef(0);
  const hasSysMenu = !!(wStyle & WS_SYSMENU);

  const openSysMenu = () => {
    const el = iconRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setSysMenuPos(toFixedCoords(fixedOriginOf(el), rect.left, rect.bottom));
  };

  const dispatchSysCmd = (id: number) => {
    setSysMenuPos(null);
    switch (id) {
      case SC_RESTORE:
        // For minimized windows the parent's title-bar dblclick handler knows
        // how to restore (postMessage SC_RESTORE + handle un-minimize); for
        // maximized windows onMaximize toggles back to normal.
        if (minimized && onTitleBarDblClick) onTitleBarDblClick();
        else onMaximize?.();
        break;
      case SC_MOVE:       onSystemMove?.(); break;
      case SC_SIZE:       onSystemSize?.(); break;
      case SC_MINIMIZE:   onMinimize?.(); break;
      case SC_MAXIMIZE:   onMaximize?.(); break;
      case SC_CLOSE:      onClose?.(); break;
      case SC_ZOOM2X:     onZoomToggle?.(); break;
      case SC_FULLSCREEN: onFullscreenToggle?.(); break;
      case SC_SMOOTH:     onSmoothToggle?.(); break;
    }
  };

  const handleIconPointerDown = (e: PointerEvent) => {
    if (!hasSysMenu) return;
    e.stopPropagation();
    e.preventDefault();
    const now = Date.now();
    if (now - lastIconClick.current < DOUBLE_CLICK_MS) {
      // Double-click on the system icon closes the window (Windows convention).
      lastIconClick.current = 0;
      setSysMenuPos(null);
      onClose?.();
    } else {
      lastIconClick.current = now;
      if (sysMenuPos) setSysMenuPos(null);
      else openSysMenu();
    }
  };

  // Close sysmenu on outside click while it's open.
  useEffect(() => {
    if (!sysMenuPos) return;
    const close = () => setSysMenuPos(null);
    const timer = setTimeout(() => document.addEventListener('pointerdown', close), 0);
    return () => { clearTimeout(timer); document.removeEventListener('pointerdown', close); };
  }, [sysMenuPos]);

  const buildSysMenuItems = (): MenuItem[] => {
    const s = uiStrings;
    const inNormal = !maximized && !minimized;
    const items: MenuItem[] = [];
    items.push({ id: SC_RESTORE,  text: s.restore,     isSeparator: false, isChecked: false, isGrayed: inNormal,                                          isDefault: false,    children: null });
    items.push({ id: SC_MOVE,     text: s.sysMove,     isSeparator: false, isChecked: false, isGrayed: !!maximized || !onSystemMove,                       isDefault: false,    children: null });
    items.push({ id: SC_SIZE,     text: s.sysSize,     isSeparator: false, isChecked: false, isGrayed: !!maximized || !(wStyle & WS_THICKFRAME) || !onSystemSize, isDefault: false, children: null });
    items.push({ id: SC_MINIMIZE, text: s.minimize,    isSeparator: false, isChecked: false, isGrayed: !!minimized || !(wStyle & WS_MINIMIZEBOX),         isDefault: false,    children: null });
    items.push({ id: SC_MAXIMIZE, text: s.sysMaximize, isSeparator: false, isChecked: false, isGrayed: !!maximized || !(wStyle & WS_MAXIMIZEBOX),         isDefault: false,    children: null });
    items.push({ id: 0,           text: '',            isSeparator: true,  isChecked: false, isGrayed: false,                                              isDefault: false,    children: null });
    items.push({ id: SC_CLOSE,    text: `${s.close}\tAlt+F4`, isSeparator: false, isChecked: false, isGrayed: false,                                       isDefault: true,     children: null });
    if (onZoomToggle || onFullscreenToggle) {
      items.push({ id: 0,           text: '',            isSeparator: true,  isChecked: false, isGrayed: false, isDefault: false, children: null });
      if (onZoomToggle) {
        items.push({ id: SC_ZOOM2X,     text: s.sysZoom2x,    isSeparator: false, isChecked: !!zoomActive,       isGrayed: false, isDefault: false, children: null });
      }
      if (onFullscreenToggle) {
        items.push({ id: SC_FULLSCREEN, text: s.sysFullscreen, isSeparator: false, isChecked: !!fullscreenActive, isGrayed: false, isDefault: false, children: null });
      }
    }
    return items;
  };

  const handleDragTitleMouseDown = draggable ? (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('span[style*="border"], .bliss-luna-btn')) return;
    e.preventDefault();
    let cur = dragPos;
    if (!cur && boxRef.current) {
      const rect = boxRef.current.getBoundingClientRect();
      cur = { x: rect.left, y: rect.top };
      setDragPos(cur);
    }
    if (cur) dragState.current = { startX: e.clientX, startY: e.clientY, startPosX: cur.x, startPosY: cur.y };
    onTitleBarMouseDown?.(e);
  } : onTitleBarMouseDown;

  // Fixed positioning inside a transformed/scaled embedder: map viewport coordinates into its space
  const [fixedOrigin, setFixedOrigin] = useState<FixedOrigin>(VIEWPORT_ORIGIN);
  useLayoutEffect(() => {
    if (!draggable || !dragPos) return;
    const o = fixedOriginOf(boxRef.current);
    if (o.left !== fixedOrigin.left || o.top !== fixedOrigin.top || o.scaleX !== fixedOrigin.scaleX || o.scaleY !== fixedOrigin.scaleY) setFixedOrigin(o);
  }, [draggable, dragPos?.x, dragPos?.y]);
  const fixedPos = dragPos ? toFixedCoords(fixedOrigin, dragPos.x, dragPos.y) : null;
  const wrapStyle = draggable && fixedPos
    ? { position: 'fixed' as const, left: `${fixedPos.x}px`, top: `${fixedPos.y}px`, zIndex: 200 }
    : undefined;

  if (luna) {
    const hasMinMax = !!(wStyle & (WS_MINIMIZEBOX | WS_MAXIMIZEBOX));
    return (
      <LunaWindowChrome
        boxRef={draggable ? boxRef : undefined}
        lang={lang}
        wrapStyle={wrapStyle}
        focused={effectiveFocused}
        dlgFrame={!hasThickFrame}
        dialog={isDialog}
        className={className}
        hasCaption={hasCaption}
        bareBorder={hasThickFrame ? 4 : (wStyle & WS_DLGFRAME) ? 3 : (wStyle & WS_BORDER) ? 1 : 0}
        clientW={clientW}
        clientH={clientH}
        clientBg={clientBg}
        minimized={minimized}
        title={title}
        iconNode={(iconUrl || iconElement) ? (
          <span ref={iconRef} class="bliss-luna-title-icon" onPointerDown={handleIconPointerDown} onDblClick={(e) => { e.stopPropagation(); }}>
            {iconUrl ? <img src={iconUrl} /> : <span style={{ display: 'inline-flex', width: '16px', height: '16px', pointerEvents: 'none' }}>{iconElement}</span>}
            {sysMenuPos && <MenuDropdown items={buildSysMenuItems()} onCommand={dispatchSysCmd} onClose={() => setSysMenuPos(null)} x={sysMenuPos.x} y={sysMenuPos.y} />}
          </span>
        ) : undefined}
        help={hasHelp && !hasMinMax ? {} : undefined}
        min={hasMinMax ? { onClick: onMinimize, disabled: !(wStyle & WS_MINIMIZEBOX) } : undefined}
        max={hasMinMax ? { onClick: onMaximize, disabled: !(wStyle & WS_MAXIMIZEBOX), restore: !!(maximized || minimized) } : undefined}
        close={(wStyle & WS_SYSMENU) ? { onClick: onClose } : undefined}
        onTitlePointerDown={handleDragTitleMouseDown}
        onTitleDblClick={onTitleBarDblClick}
        menus={menus}
        overlay={blocked && (
          <div
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}
            onPointerDown={(e) => { e.preventDefault(); onBlockedClick?.(); }}
          />
        )}
      >
        {children}
      </LunaWindowChrome>
    );
  }

  return (
    <div ref={draggable ? boxRef : undefined} lang={lang} style={{ position: 'relative', ...wrapStyle }}>
      {/* Modal blocking overlay — covers entire window including title bar */}
      {blocked && (
        <div
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, cursor: 'var(--win2k-cursor)' }}
          onPointerDown={(e) => { e.preventDefault(); onBlockedClick?.(); }}
        />
      )}
      {/* Resize handles */}
      {hasThickFrame && !minimized && !maximized && onResizeStart && <>
        <div style={{ position: 'absolute', top: 0, left: '8px', right: '8px', height: '6px', cursor: 'n-resize', zIndex: 50 }} onPointerDown={(e) => onResizeStart('n', e)} />
        <div style={{ position: 'absolute', bottom: 0, left: '8px', right: '8px', height: '6px', cursor: 's-resize', zIndex: 50 }} onPointerDown={(e) => onResizeStart('s', e)} />
        <div style={{ position: 'absolute', left: 0, top: '8px', bottom: '8px', width: '6px', cursor: 'w-resize', zIndex: 50 }} onPointerDown={(e) => onResizeStart('w', e)} />
        <div style={{ position: 'absolute', right: 0, top: '8px', bottom: '8px', width: '6px', cursor: 'e-resize', zIndex: 50 }} onPointerDown={(e) => onResizeStart('e', e)} />
        <div style={{ position: 'absolute', top: 0, left: 0, width: '8px', height: '8px', cursor: 'nw-resize', zIndex: 51 }} onPointerDown={(e) => onResizeStart('nw', e)} />
        <div style={{ position: 'absolute', top: 0, right: 0, width: '8px', height: '8px', cursor: 'ne-resize', zIndex: 51 }} onPointerDown={(e) => onResizeStart('ne', e)} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '8px', height: '8px', cursor: 'sw-resize', zIndex: 51 }} onPointerDown={(e) => onResizeStart('sw', e)} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: '8px', height: '8px', cursor: 'se-resize', zIndex: 51 }} onPointerDown={(e) => onResizeStart('se', e)} />
      </>}
      {/* Frame border */}
      <div style={{
        background: '#D4D0C8', ...(clientW != null ? { width: `${clientW}px` } : {}), boxSizing: 'content-box',
        ...(maximized ? {} :
          (wStyle & WS_THICKFRAME) ? {
            padding: '4px',
            boxShadow: 'inset -1px -1px #0a0a0a, inset 1px 1px #dfdfdf, inset -2px -2px grey, inset 2px 2px #fff',
          } : (wStyle & WS_DLGFRAME) ? {
            padding: '3px',
            boxShadow: 'inset -1px -1px #0a0a0a, inset 1px 1px #dfdfdf, inset -2px -2px grey, inset 2px 2px #fff',
          } : (wStyle & WS_BORDER) ? {
            padding: '1px',
            boxShadow: 'inset 0 0 0 1px #000',
          } : {}),
      }}>
        {/* Title Bar */}
        {hasCaption && <div
          onPointerDown={handleDragTitleMouseDown}
          onDblClick={onTitleBarDblClick}
          style={{
            background: effectiveFocused ? 'linear-gradient(to right, #0A246A, #3A6EA5)' : 'linear-gradient(to right, #808080, #B4B4B4)',
            color: '#FFF', font: 'bold 12px/1 "Tahoma",sans-serif',
            padding: '2px 2px', display: 'flex', alignItems: 'center',
            height: '20px', userSelect: 'none',
          }}>
          {(iconUrl || iconElement) && (
            <span
              ref={iconRef}
              onPointerDown={handleIconPointerDown}
              onDblClick={(e) => { e.stopPropagation(); }}
              style={{
                display: 'inline-flex', width: '16px', height: '16px', marginRight: '3px',
                flexShrink: 0, alignItems: 'center', justifyContent: 'center',
                cursor: hasSysMenu ? 'var(--win2k-cursor)' : undefined,
              }}
            >
              {iconUrl ? (
                <img src={iconUrl} style={{
                  display: 'block', width: '16px', height: '16px',
                  imageRendering: 'pixelated', pointerEvents: 'none',
                }} />
              ) : (
                <span style={{ display: 'inline-flex', width: '16px', height: '16px', pointerEvents: 'none' }}>{iconElement}</span>
              )}
              {sysMenuPos && (
                <MenuDropdown
                  items={buildSysMenuItems()}
                  onCommand={dispatchSysCmd}
                  onClose={() => setSysMenuPos(null)}
                  x={sysMenuPos.x}
                  y={sysMenuPos.y}
                />
              )}
            </span>
          )}
          <span style={{
            flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', letterSpacing: '0.2px', lineHeight: '16px',
          }}>
            {title}
          </span>
          <span style={{ display: 'flex', gap: '0px', marginLeft: '2px', flexShrink: 0 }}>
            {hasHelp && !(wStyle & WS_MINIMIZEBOX) && !(wStyle & WS_MAXIMIZEBOX) && <>
              {capBtnSvg(svgHelp, 'top 1px left 4px')}
              <span style={{ width: '2px' }} />
            </>}
            {onZoomToggle && <>
              {capBtnText('2×', onZoomToggle, zoomActive, zoomActive ? 'Restore 1× zoom' : 'Zoom 2×')}
              <span style={{ width: '2px' }} />
            </>}
            {onSmoothToggle && <>
              {capBtnText('AA', onSmoothToggle, smoothActive, smoothActive ? 'Disable smoothing' : 'Enable smoothing')}
              <span style={{ width: '2px' }} />
            </>}
            {onFullscreenToggle && <>
              {capBtnSvg(svgFullscreen, 'top 1px left 2px', onFullscreenToggle)}
              <span style={{ width: '2px' }} />
            </>}
            {(wStyle & WS_MINIMIZEBOX) ? capBtnSvg(svgMin, 'top 7px left 4px', onMinimize) : null}
            {(wStyle & WS_MAXIMIZEBOX) ? capBtnSvg((maximized || minimized) ? svgRestore : svgMax, (maximized || minimized) ? 'top 0px left 2px' : 'top 1px left 2px', onMaximize) : null}
            {((wStyle & WS_MINIMIZEBOX) || (wStyle & WS_MAXIMIZEBOX)) ? <span style={{ width: '2px' }} /> : null}
            {(wStyle & WS_SYSMENU) ? capBtnSvg(svgClose, 'top 2px left 3px', onClose) : null}
          </span>
        </div>}

        {/* Menu Bar */}
        {menus && <div style={{ display: minimized ? 'none' : 'block' }}>{menus}</div>}

        {/* Client Area */}
        <div style={{
          position: 'relative',
          ...(clientW != null ? { width: `${clientW}px` } : {}),
          ...(clientH != null ? { height: `${clientH}px` } : {}),
          overflow: 'hidden',
          marginTop: hasCaption ? '1px' : '0',
          display: minimized ? 'none' : 'block',
          lineHeight: 1,
          ...(clientBg ? { background: clientBg } : {}),
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}
