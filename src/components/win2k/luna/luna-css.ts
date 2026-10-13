/**
 * Windows XP Luna (blue) stylesheet. Every class is prefixed `bliss-luna-`
 * so it can be injected into any host page (the RetroTick runner, or plain
 * DOM / React pages that want an identical frame + menu bar — see LunaFrame).
 *
 * Colour values follow the Luna "Normal color" scheme (system colours
 * COLOR_BTNFACE #ECE9D8, COLOR_HIGHLIGHT #316AC5, COLOR_GRAYTEXT/BTNSHADOW
 * #ACA899) and the luna.msstyles frame bitmaps (caption gradient, frame
 * edge colours, 21×21 caption buttons, push-button gradient).
 */
import { LUNA_GLYPHS as G } from './luna-glyphs';

export const LUNA_STYLE_ID = 'bliss-luna-css';

const CAPBTN_BLUE = 'radial-gradient(circle at 30% 25%, #A5BEF9 0%, #6E97F8 20%, #3E73F5 48%, #2864F4 72%, #1A50D8 100%)';
const CAPBTN_BLUE_HOVER = 'radial-gradient(circle at 30% 25%, #C2D4FC 0%, #8AACF9 20%, #5A8BF7 48%, #427BF6 72%, #2F66E8 100%)';
const CAPBTN_BLUE_DOWN = 'radial-gradient(circle at 70% 75%, #6E92E8 0%, #3A68DD 30%, #2152CC 65%, #1440B3 100%)';
const CAPBTN_RED = 'radial-gradient(circle at 30% 25%, #F3B2A2 0%, #EB8B73 20%, #E46142 48%, #E04D28 72%, #C23B19 100%)';
const CAPBTN_RED_HOVER = 'radial-gradient(circle at 30% 25%, #FFC4BC 0%, #FF9285 20%, #FF7362 48%, #FA5643 72%, #E0442F 100%)';
const CAPBTN_RED_DOWN = 'radial-gradient(circle at 70% 75%, #D86C52 0%, #C2482A 30%, #AC3417 65%, #922810 100%)';

const CAPTION_ACTIVE = 'linear-gradient(180deg, #0997FF 0%, #0053EE 8%, #0050EE 40%, #0066FF 88%, #0066FF 93%, #005BFF 95%, #003DD7 96%, #003DD7 100%)';
const CAPTION_INACTIVE = 'linear-gradient(180deg, #A9C1F2 0%, #7E9EE3 8%, #7B9BE3 40%, #89A8EC 88%, #89A8EC 93%, #809FE7 95%, #6E8DDC 96%, #6E8DDC 100%)';

const FRAME_ACTIVE = 'inset 1px 0 #0831D9, inset 2px 0 #166AEE, inset -1px 0 #00138C, inset -2px 0 #001EA0, inset -3px 0 #003BDA, inset 0 -1px #00138C, inset 0 -2px #001EA0, inset 0 -3px #003BDA';
const FRAME_INACTIVE = 'inset 1px 0 #6F8EDD, inset 2px 0 #92ACEB, inset -1px 0 #4D69C1, inset -2px 0 #5D79CD, inset -3px 0 #7090DC, inset 0 -1px #4D69C1, inset 0 -2px #5D79CD, inset 0 -3px #7090DC';

const ARROW_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='23' viewBox='-1 -1 14 23'%3E%3Cpath d='M0,0 L0,17 L4,13 L7,20 L9,19 L6,12 L11,12 Z' fill='white' stroke='black' stroke-width='1' stroke-linejoin='miter'/%3E%3C/svg%3E") 1 1, auto`;

export const LUNA_CSS = `
:root {
  --bliss-luna-font-ui: Tahoma, "Bliss Tahoma", Verdana, sans-serif;
  --bliss-luna-font-dlg: "Microsoft Sans Serif", "MS Shell Dlg", Tahoma, sans-serif;
  --bliss-luna-font-caption: "Trebuchet MS", "Bliss Trebuchet MS", Tahoma, sans-serif;
  --bliss-luna-face: #ECE9D8;
  --bliss-luna-highlight: #316AC5;
  --bliss-luna-graytext: #ACA899;
}
.bliss-luna-root {
  --win2k-cursor: ${ARROW_CURSOR};
  font: 11px/1.2 var(--bliss-luna-font-ui);
  color: #000;
  -webkit-font-smoothing: antialiased;
}
.bliss-luna-root:not(.bliss-luna-cues) u { text-decoration: none; }

/* ---- Window frame ---- */
.bliss-luna-window {
  position: relative;
  display: inline-block;
  vertical-align: top;
  border-radius: 8px 8px 0 0;
  box-sizing: border-box;
  padding: 0 4px 4px;
  background: #0855DD;
  box-shadow: ${FRAME_ACTIVE};
  text-align: left;
}
.bliss-luna-window.bliss-luna-fixed, .bliss-luna-window.bliss-luna-dialog { padding: 0 3px 3px; }
.bliss-luna-window.bliss-luna-inactive { background: #7B9BE3; box-shadow: ${FRAME_INACTIVE}; }
.bliss-luna-titlebar {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  height: 30px;
  margin: 0 -4px;
  padding: 0 5px 0 5px;
  border-radius: 8px 8px 0 0;
  background: ${CAPTION_ACTIVE};
  box-shadow: inset 0 1px #3D95FF, inset 1px 0 #0831D9, inset -1px 0 #001EA0;
  color: #FFF;
  user-select: none;
  -webkit-user-select: none;
  cursor: default;
}
.bliss-luna-window.bliss-luna-fixed > .bliss-luna-titlebar, .bliss-luna-window.bliss-luna-dialog > .bliss-luna-titlebar { height: 29px; margin: 0 -3px; }
.bliss-luna-inactive > .bliss-luna-titlebar {
  background: ${CAPTION_INACTIVE};
  box-shadow: inset 0 1px #B9CDF5, inset 1px 0 #6F8EDD, inset -1px 0 #5D79CD;
  color: #D8E4F8;
}
.bliss-luna-title-icon {
  display: inline-flex;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-right: 4px;
  align-items: center;
  justify-content: center;
  position: relative;
}
.bliss-luna-title-icon img { display: block; width: 16px; height: 16px; image-rendering: pixelated; pointer-events: none; }
.bliss-luna-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font: bold 13px/18px var(--bliss-luna-font-caption);
  text-shadow: 1px 1px #0A1883;
  padding-top: 1px;
}
.bliss-luna-inactive .bliss-luna-title { text-shadow: none; }
.bliss-luna-controls { display: flex; align-items: center; flex-shrink: 0; margin-left: 4px; gap: 2px; }
.bliss-luna-btn {
  display: inline-block;
  box-sizing: border-box;
  width: 21px;
  height: 21px;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px #FFF;
  background-color: #2864F4;
  background-repeat: no-repeat;
  background-size: 21px 21px, auto;
  cursor: default;
  outline: none;
  flex-shrink: 0;
}
.bliss-luna-btn-min { background-image: ${G.min}, ${CAPBTN_BLUE}; }
.bliss-luna-btn-max { background-image: ${G.max}, ${CAPBTN_BLUE}; }
.bliss-luna-btn-restore { background-image: ${G.restore}, ${CAPBTN_BLUE}; }
.bliss-luna-btn-help { background-image: ${G.help}, ${CAPBTN_BLUE}; }
.bliss-luna-btn-close { background-image: ${G.close}, ${CAPBTN_RED}; background-color: #E04D28; }
.bliss-luna-btn-min:hover { background-image: ${G.min}, ${CAPBTN_BLUE_HOVER}; }
.bliss-luna-btn-max:hover { background-image: ${G.max}, ${CAPBTN_BLUE_HOVER}; }
.bliss-luna-btn-restore:hover { background-image: ${G.restore}, ${CAPBTN_BLUE_HOVER}; }
.bliss-luna-btn-help:hover { background-image: ${G.help}, ${CAPBTN_BLUE_HOVER}; }
.bliss-luna-btn-close:hover { background-image: ${G.close}, ${CAPBTN_RED_HOVER}; }
.bliss-luna-btn-min:active, .bliss-luna-btn-min.bliss-luna-pressed { background-image: ${G.min}, ${CAPBTN_BLUE_DOWN}; }
.bliss-luna-btn-max:active, .bliss-luna-btn-max.bliss-luna-pressed { background-image: ${G.max}, ${CAPBTN_BLUE_DOWN}; }
.bliss-luna-btn-restore:active, .bliss-luna-btn-restore.bliss-luna-pressed { background-image: ${G.restore}, ${CAPBTN_BLUE_DOWN}; }
.bliss-luna-btn-help:active, .bliss-luna-btn-help.bliss-luna-pressed { background-image: ${G.help}, ${CAPBTN_BLUE_DOWN}; }
.bliss-luna-btn-close:active, .bliss-luna-btn-close.bliss-luna-pressed { background-image: ${G.close}, ${CAPBTN_RED_DOWN}; }
.bliss-luna-btn-max:disabled, .bliss-luna-btn-max.bliss-luna-disabled { background-image: ${G.maxDisabled}, ${CAPBTN_BLUE}; }
.bliss-luna-btn-min:disabled, .bliss-luna-btn-min.bliss-luna-disabled { background-image: ${G.minDisabled}, ${CAPBTN_BLUE}; }
.bliss-luna-inactive .bliss-luna-btn { filter: saturate(0.45) brightness(1.25); box-shadow: inset 0 0 0 1px #E6EDFB; }

/* .bliss-luna-frame: optional plain wrapper around menu bar + client */
.bliss-luna-frame { position: relative; }
.bliss-luna-client {
  position: relative;
  overflow: hidden;
  line-height: 1;
  background: var(--bliss-luna-face);
}

/* ---- Menu bar ---- */
.bliss-luna-menubar {
  display: flex;
  flex-wrap: wrap;
  background: var(--bliss-luna-face);
  min-height: 20px;
  padding: 0;
  font: 11px/1 var(--bliss-luna-font-ui);
  color: #000;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}
.bliss-luna-menubar-cell { position: relative; }
.bliss-luna-menu-title {
  display: block;
  padding: 0 6px;
  height: 20px;
  line-height: 19px;
  white-space: nowrap;
  cursor: default;
}
.bliss-luna-menu-title.bliss-luna-open { background: var(--bliss-luna-highlight); color: #FFF; }
.bliss-luna-menu-title.bliss-luna-disabled { color: var(--bliss-luna-graytext); }

/* ---- Popup menu ---- */
.bliss-luna-menu-popup {
  position: absolute;
  z-index: 10000;
  min-width: 140px;
  box-sizing: border-box;
  background: #FFF;
  border: 1px solid #ACA899;
  padding: 2px;
  box-shadow: 2px 2px 2px rgba(0, 0, 0, 0.32);
  font: 11px/1 var(--bliss-luna-font-ui);
  color: #000;
  touch-action: none;
  text-align: left;
}
.bliss-luna-menu-entry {
  position: relative;
  display: flex;
  align-items: center;
  height: 17px;
  padding: 0 17px 0 20px;
  white-space: nowrap;
  cursor: default;
}
.bliss-luna-menu-entry.bliss-luna-hl, .bliss-luna-menu-entry:hover { background: var(--bliss-luna-highlight); color: #FFF; }
.bliss-luna-menu-entry.bliss-luna-disabled:hover { color: var(--bliss-luna-graytext); }
.bliss-luna-menu-entry.bliss-luna-disabled { color: var(--bliss-luna-graytext); }
.bliss-luna-menu-entry.bliss-luna-default { font-weight: bold; }
.bliss-luna-menu-text { flex: 1; }
.bliss-luna-menu-accel { margin-left: 24px; }
.bliss-luna-menu-check {
  position: absolute; left: 5px; top: 4px; width: 9px; height: 9px;
  background: ${G.check} no-repeat;
}
.bliss-luna-hl > .bliss-luna-menu-check, .bliss-luna-menu-entry:hover > .bliss-luna-menu-check { background-image: ${G.checkWhite}; }
.bliss-luna-menu-arrow {
  position: absolute; right: 4px; top: 4px; width: 9px; height: 9px;
  background: ${G.arrow} no-repeat;
}
.bliss-luna-hl > .bliss-luna-menu-arrow, .bliss-luna-menu-entry:hover > .bliss-luna-menu-arrow { background-image: ${G.arrowWhite}; }
.bliss-luna-menu-sep { height: 1px; margin: 3px 1px; background: #ACA899; }

/* ---- Dialog face, push buttons, check boxes, radio buttons, group boxes ---- */
.bliss-luna-face { background: var(--bliss-luna-face); }
.bliss-luna-button {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 0;
  border: 1px solid #003C74;
  border-radius: 3px;
  background: linear-gradient(180deg, #FFFFFF 0%, #ECEBE5 86%, #D8D0C4 100%);
  color: #000;
  cursor: default;
  outline: none;
}
.bliss-luna-button:hover:not(.bliss-luna-disabled) {
  box-shadow: inset -1px 1px #FFF0CF, inset 1px 2px #FDD889, inset -2px 2px #FBC761, inset 2px -2px #E5A01A;
}
.bliss-luna-button.bliss-luna-default:not(:hover):not(.bliss-luna-disabled) {
  box-shadow: inset -1px 1px #CEE7FF, inset 1px 2px #98B8EA, inset -2px 2px #BCD4F6, inset 1px -1px #89ADE4, inset 2px -2px #89ADE4;
}
.bliss-luna-button.bliss-luna-pressed:not(.bliss-luna-disabled) {
  box-shadow: none;
  background: linear-gradient(180deg, #CDCAC3 0%, #E3E3DB 8%, #E5E5DE 94%, #F2F2F1 100%);
}
.bliss-luna-button.bliss-luna-disabled {
  border-color: #C9C7BA;
  background: #F5F4EA;
  color: var(--bliss-luna-graytext);
}
.bliss-luna-check, .bliss-luna-radio {
  display: inline-block;
  flex-shrink: 0;
  box-sizing: border-box;
  width: 13px;
  height: 13px;
  margin-right: 5px;
  border: 1px solid #1C5180;
  background: linear-gradient(135deg, #DCDCD7 0%, #F0F0EA 40%, #FFFFFF 100%);
  background-repeat: no-repeat;
}
.bliss-luna-check.bliss-luna-checked { background: ${G.tick} 1px 1px no-repeat, linear-gradient(135deg, #DCDCD7 0%, #F0F0EA 40%, #FFFFFF 100%); }
.bliss-luna-radio { border-radius: 50%; position: relative; }
.bliss-luna-radio.bliss-luna-checked::after {
  content: ''; position: absolute; left: 3px; top: 3px; width: 5px; height: 5px; border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #55D551 0%, #2DB52A 50%, #189E13 100%);
}
.bliss-luna-check.bliss-luna-disabled, .bliss-luna-radio.bliss-luna-disabled { border-color: #CAC8BB; background: #FFF; }
.bliss-luna-check.bliss-luna-disabled.bliss-luna-checked { background: ${G.tickDisabled} 1px 1px no-repeat, #FFF; }
.bliss-luna-radio.bliss-luna-disabled.bliss-luna-checked::after { background: #CAC8BB; }
.bliss-luna-label-disabled { color: var(--bliss-luna-graytext); }
.bliss-luna-groupbox-frame { position: absolute; left: 0; right: 0; bottom: 0; border: 1px solid #D0D0BF; border-radius: 3px; }
.bliss-luna-groupbox-label { position: absolute; top: 0; padding: 0 2px; color: #0046D5; }
`;

/** Insert the Luna stylesheet into `doc` once (idempotent). */
export function injectLunaCss(doc: Document = document): void {
  if (doc.getElementById(LUNA_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = LUNA_STYLE_ID;
  style.textContent = LUNA_CSS;
  doc.head.appendChild(style);
}
