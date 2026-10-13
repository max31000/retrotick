/**
 * UI theme for the win2k widget set.
 *
 * The default theme is the classic Windows 2000 look rendered with inline
 * styles (upstream behaviour). The `luna` theme switches Window, MenuBar,
 * Button, Checkbox, Radio, GroupBox, MessageBox and dialogs to Windows XP
 * Luna (blue) visuals implemented as CSS classes (`bliss-luna-*`, see
 * `luna/luna-css.ts`). The stylesheet must be present in the document when
 * the luna theme is used (`injectLunaCss()`).
 */
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { t, type UiStrings } from '../../lib/regional-settings';

export type UiThemeName = 'win2k' | 'luna';

export interface UiTheme {
  name: UiThemeName;
  /** Overrides for UI strings (button labels, system menu) independent of the host's regional settings. */
  strings?: Partial<UiStrings>;
  /** Title of the ShellAbout dialog; `{0}` is replaced by the application name. */
  aboutTitle?: string;
  /** ShellAbout memory line; `{0}` is replaced by the amount in KB. */
  aboutMemory?: string;
}

export const WIN2K_THEME: UiTheme = { name: 'win2k' };

export const ThemeContext = createContext<UiTheme>(WIN2K_THEME);

export function useUiTheme(): UiTheme {
  return useContext(ThemeContext);
}

export function useIsLuna(): boolean {
  return useContext(ThemeContext).name === 'luna';
}

/** UI strings for the current theme: regional-settings strings with theme overrides applied. */
export function useUiStrings(): UiStrings {
  const theme = useContext(ThemeContext);
  const base = t();
  return theme.strings ? { ...base, ...theme.strings } : base;
}

/** Dialog face colour (COLOR_BTNFACE) of the active theme. */
export function themeFaceColor(theme: UiTheme): string {
  return theme.name === 'luna' ? '#ECE9D8' : '#D4D0C8';
}
