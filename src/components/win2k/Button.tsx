import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { disabledTextStyle } from './styles';
import { useIsLuna } from './theme';

interface ButtonProps {
  children: ComponentChildren;
  fontCSS: string;
  isDefault?: boolean;
  disabled?: boolean;
  fontColor?: string | null;
}

export function Button({ children, fontCSS, isDefault, disabled, fontColor }: ButtonProps) {
  const [pressed, setPressed] = useState(false);
  const active = pressed && !disabled;
  const luna = useIsLuna();
  if (luna) {
    const cls = ['bliss-luna-button'];
    if (isDefault) cls.push('bliss-luna-default');
    if (active) cls.push('bliss-luna-pressed');
    if (disabled) cls.push('bliss-luna-disabled');
    return (
      <button
        type="button"
        tabIndex={-1}
        class={cls.join(' ')}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        style={{ font: fontCSS, ...(fontColor && !disabled ? { color: fontColor } : {}) }}
      >
        <span style={active ? { position: 'relative', left: '1px', top: '1px' } : undefined}>{children}</span>
      </button>
    );
  }
  return (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        width: '100%', height: '100%', background: '#D4D0C8', cursor: 'var(--win2k-cursor)',
        ...(active
          ? {
              border: isDefault ? '1px solid #000' : '1px solid',
              borderColor: isDefault ? undefined : '#404040 #FFF #FFF #404040',
              boxShadow: isDefault
                ? 'inset 1px 1px 0 #404040, inset -1px -1px 0 #D4D0C8'
                : 'inset 1px 1px 0 #808080',
            }
          : isDefault
            ? {
                border: '1px solid #000',
                boxShadow: 'inset 1px 1px 0 #FFF, inset -1px -1px 0 #404040, inset 2px 2px 0 #D4D0C8, inset -2px -2px 0 #808080',
              }
            : {
                border: '1px solid', borderColor: '#FFF #404040 #404040 #FFF',
                boxShadow: 'inset 1px 1px 0 #D4D0C8, inset -1px -1px 0 #808080',
              }),
        font: fontCSS, padding: 0,
        ...(disabled ? disabledTextStyle : fontColor ? { color: fontColor } : {}),
      }}>
      <span style={active ? { position: 'relative', left: '1px', top: '1px' } : undefined}>
        {children}
      </span>
    </button>
  );
}
