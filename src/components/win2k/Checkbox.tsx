import type { ComponentChildren } from 'preact';
import { disabledTextStyle } from './styles';
import { useIsLuna } from './theme';

interface CheckboxProps {
  children: ComponentChildren;
  fontCSS: string;
  checked?: boolean;
  disabled?: boolean;
}

export function Checkbox({ children, fontCSS, checked, disabled }: CheckboxProps) {
  if (useIsLuna()) {
    const cls = ['bliss-luna-check'];
    if (checked) cls.push('bliss-luna-checked');
    if (disabled) cls.push('bliss-luna-disabled');
    return (
      <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        <span class={cls.join(' ')} />
        <span class={disabled ? 'bliss-luna-label-disabled' : undefined} style={{ font: fontCSS }}>{children}</span>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: '100%', cursor: 'var(--win2k-cursor)' }}>
      <input
        type="checkbox"
        checked={checked}
        readOnly
        style={{ margin: '0 4px 0 0', flexShrink: 0, pointerEvents: 'none' }}
      />
      <span style={{ font: fontCSS, ...(disabled ? disabledTextStyle : {}) }}>{children}</span>
    </div>
  );
}
