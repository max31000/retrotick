import type { ComponentChildren, Ref } from 'preact';
import type { MenuItem } from '../../../lib/pe/types';
import { formatMnemonic } from '../../../lib/format';

/** Windows XP Luna popup menu body (white, #316AC5 highlight). Behaviour mirrors the win2k MenuDropdown. */
export function LunaMenuDropdownBody({ divRef, items, posStyle, hoverIdx, openSub, setHoverIdx, setOpenSub, onCommand, onClose, renderSub }: {
  divRef: Ref<HTMLDivElement>;
  items: MenuItem[];
  posStyle: Record<string, string | number | undefined>;
  hoverIdx: number | null;
  openSub: number | null;
  setHoverIdx: (i: number | null) => void;
  setOpenSub: (i: number | null) => void;
  onCommand: (id: number) => void;
  onClose: () => void;
  renderSub: (items: MenuItem[]) => ComponentChildren;
}) {
  return (
    <div
      ref={divRef}
      class="bliss-luna-menu-popup"
      role="menu"
      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
      style={posStyle}
    >
      {items.map((child, j) => {
        if (child.isSeparator) return <div key={j} class="bliss-luna-menu-sep" />;
        const highlighted = hoverIdx === j || openSub === j;
        const cls = ['bliss-luna-menu-entry'];
        if (highlighted) cls.push('bliss-luna-hl');
        if (child.isGrayed) cls.push('bliss-luna-disabled');
        if (child.isDefault) cls.push('bliss-luna-default');
        const [label, accel] = child.text.split('\t');
        return (
          <div
            key={j}
            class={cls.join(' ')}
            role="menuitem"
            aria-disabled={child.isGrayed || undefined}
            onPointerEnter={() => {
              setHoverIdx(j);
              setOpenSub(child.children ? j : null);
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              setHoverIdx(j);
              if (child.children) {
                setOpenSub(j);
              } else if (!child.isGrayed) {
                onCommand(child.id);
                onClose();
              }
            }}
            onPointerLeave={() => {
              if (openSub !== j) setHoverIdx(null);
            }}
          >
            {child.isChecked && <span class="bliss-luna-menu-check" />}
            <span class="bliss-luna-menu-text">{formatMnemonic(label)}</span>
            {accel !== undefined && <span class="bliss-luna-menu-accel">{accel}</span>}
            {child.children && <span class="bliss-luna-menu-arrow" />}
            {openSub === j && child.children && renderSub(child.children)}
          </div>
        );
      })}
    </div>
  );
}

/** Windows XP Luna menu bar body. Behaviour mirrors the win2k MenuBar. */
export function LunaMenuBarBody({ items, openIdx, setOpenIdx, onCommand, onFocus, onMenuOpen, renderDropdown }: {
  items: MenuItem[];
  openIdx: number | null;
  setOpenIdx: (i: number | null) => void;
  onCommand: (id: number) => void;
  onFocus?: () => void;
  onMenuOpen?: (index: number) => void;
  renderDropdown: (items: MenuItem[]) => ComponentChildren;
}) {
  return (
    <div
      class="bliss-luna-menubar"
      role="menubar"
      onPointerDown={(e) => { onFocus?.(); e.stopPropagation(); e.preventDefault(); }}
    >
      {items.map((item, i) => (
        <div key={i} class="bliss-luna-menubar-cell">
          <div
            class={`bliss-luna-menu-title${openIdx === i ? ' bliss-luna-open' : ''}${item.isGrayed ? ' bliss-luna-disabled' : ''}`}
            role="menuitem"
            onPointerDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (item.children) {
                const newIdx = openIdx === i ? null : i;
                if (newIdx !== null) onMenuOpen?.(newIdx);
                setOpenIdx(newIdx);
              }
            }}
            onPointerUp={(e) => {
              e.stopPropagation();
              if (!item.children && !item.isGrayed) {
                onCommand(item.id);
                setOpenIdx(null);
              }
            }}
            onPointerEnter={() => {
              if (openIdx !== null && openIdx !== i) {
                onMenuOpen?.(i);
                setOpenIdx(i);
              }
            }}
          >
            {formatMnemonic(item.text)}
          </div>
          {openIdx === i && item.children && renderDropdown(item.children)}
        </div>
      ))}
    </div>
  );
}
