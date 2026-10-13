import type { LocalePreset } from '../../../regional-settings';
import {
  LOCALE_ILANGUAGE, LOCALE_SLANGUAGE, LOCALE_SNATIVELANGNAME, LOCALE_SNATIVECTRYNAME,
  LOCALE_IDEFAULTLANGUAGE, LOCALE_IDEFAULTCODEPAGE, LOCALE_SLIST, LOCALE_IMEASURE, LOCALE_SDECIMAL,
  LOCALE_STHOUSAND, LOCALE_SGROUPING, LOCALE_IDIGITS, LOCALE_ILZERO, LOCALE_SCURRENCY, LOCALE_SDATE,
  LOCALE_STIME, LOCALE_SSHORTDATE, LOCALE_SLONGDATE, LOCALE_IDATE, LOCALE_ILDATE, LOCALE_ITIME,
  LOCALE_ITLZERO, LOCALE_S1159, LOCALE_S2359, LOCALE_SDAYNAME1, LOCALE_SABBREVDAYNAME1,
  LOCALE_SMONTHNAME1, LOCALE_SABBREVMONTHNAME1, LOCALE_SISO639LANGNAME, LOCALE_SISO3166CTRYNAME,
  LOCALE_STIMEFORMAT, LOCALE_IDEFAULTANSICODEPAGE, LOCALE_ITIMEMARKPOSN, LOCALE_IFIRSTDAYOFWEEK,
  LOCALE_INEGNUMBER,
} from '../types';

/** Date order from a short date picture: 0 = M-D-Y, 1 = D-M-Y, 2 = Y-M-D (LOCALE_IDATE). */
function dateOrder(fmt: string): string {
  const d = fmt.search(/d/), m = fmt.search(/M/), y = fmt.search(/y/);
  if (y >= 0 && y < m && y < d) return '2';
  if (d >= 0 && d < m) return '1';
  return '0';
}

/** Build the GetLocaleInfo string table for a locale preset. Keys are LCTYPE values. */
export function buildLocaleInfo(preset: LocalePreset): Record<number, string> {
  const [iso639, iso3166] = preset.isoTag.split('-');
  const info: Record<number, string> = {
    [LOCALE_ILANGUAGE]: preset.localeId.toString(16).toUpperCase().padStart(4, '0'),
    [LOCALE_IDEFAULTLANGUAGE]: preset.localeId.toString(16).toUpperCase().padStart(4, '0'),
    [LOCALE_SLANGUAGE]: preset.name,
    [LOCALE_SNATIVELANGNAME]: preset.langName ?? preset.name,
    [LOCALE_SNATIVECTRYNAME]: preset.countryName ?? preset.name,
    [LOCALE_SISO639LANGNAME]: iso639.toLowerCase(),
    [LOCALE_SISO3166CTRYNAME]: (iso3166 ?? '').toUpperCase(),
    [LOCALE_IDEFAULTCODEPAGE]: String(preset.oemCodePage),
    [LOCALE_IDEFAULTANSICODEPAGE]: String(preset.ansiCodePage),
    [LOCALE_SLIST]: preset.listSep,
    [LOCALE_IMEASURE]: preset.measure,
    [LOCALE_SDECIMAL]: preset.decimalSep,
    [LOCALE_STHOUSAND]: preset.thousandsSep,
    [LOCALE_SGROUPING]: preset.grouping,
    [LOCALE_IDIGITS]: preset.iDigits,
    [LOCALE_ILZERO]: preset.iLZero,
    [LOCALE_INEGNUMBER]: preset.negOrder,
    [LOCALE_SCURRENCY]: preset.currencySym ?? '$',
    [LOCALE_SDATE]: preset.dateSep,
    [LOCALE_STIME]: preset.timeSep,
    [LOCALE_SSHORTDATE]: preset.shortDate,
    [LOCALE_SLONGDATE]: preset.longDate,
    [LOCALE_IDATE]: dateOrder(preset.shortDate),
    [LOCALE_ILDATE]: dateOrder(preset.longDate),
    [LOCALE_ITIME]: preset.iTime,
    [LOCALE_ITLZERO]: preset.iTLZero,
    [LOCALE_S1159]: preset.am,
    [LOCALE_S2359]: preset.pm,
    [LOCALE_STIMEFORMAT]: preset.timeFormat,
    [LOCALE_ITIMEMARKPOSN]: '0',
    [LOCALE_IFIRSTDAYOFWEEK]: preset.measure === '1' ? '6' : '0', // 0 = Monday, 6 = Sunday
  };
  for (let i = 0; i < 7; i++) {
    info[LOCALE_SDAYNAME1 + i] = preset.dayNames[i];
    info[LOCALE_SABBREVDAYNAME1 + i] = preset.dayAbbr[i];
  }
  for (let i = 0; i < 12; i++) {
    info[LOCALE_SMONTHNAME1 + i] = preset.monthNames[i];
    info[LOCALE_SABBREVMONTHNAME1 + i] = preset.monthAbbr[i];
  }
  return info;
}

/** Parse a GetLocaleInfo value for LOCALE_RETURN_NUMBER (ILANGUAGE-style values are hex). */
export function localeInfoNumber(lcType: number, str: string): number {
  if (lcType === LOCALE_ILANGUAGE || lcType === LOCALE_IDEFAULTLANGUAGE) return parseInt(str, 16) || 0;
  return parseInt(str, 10) || 0;
}
