// Fits the deck to any screen: iPad Air 2 / iPad 9 / Pro, Samsung tablets,
// phones, portrait or landscape.
//
// The deck is laid out on a logical canvas close to 1024x768 (768x1024 in
// portrait) whose aspect ratio matches the real usable area, then scaled
// uniformly with a transform. That keeps proportions identical on every
// device, and it sizes from the measured window instead of 100vh, which on
// iOS home-screen apps disagrees with the real screen. That mismatch is what
// pushed the deck under the status bar and left a black strip at the bottom.

import { store } from './util.js';

const K_EDGES = 'deckos.edges';
const LANDSCAPE = { w: 1024, h: 768 };
const PORTRAIT = { w: 768, h: 1024 };
// Phones get a smaller canvas so text isn't shrunk to half size.
const PHONE_LANDSCAPE = { w: 1000, h: 520 };
const PHONE_PORTRAIT = { w: 520, h: 1000 };

let probe = null;

function safeArea() {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;inset:0;pointer-events:none;visibility:hidden;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  const px = (v) => parseFloat(v) || 0;
  const area = { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };

  // iPads with a home button report no top inset in a home-screen app even
  // though the translucent status bar (clock, battery, charging) is drawn over
  // the page, so reserve its height ourselves.
  const iosStandalone = window.navigator.standalone === true;
  if (iosStandalone && area.top === 0) area.top = 20;
  return area;
}

export function getEdges() {
  return { top: 0, bottom: 0, sides: 0, ...store.get(K_EDGES, {}) };
}

export function setEdges(edges) {
  store.set(K_EDGES, edges);
  fit();
}

export function fit() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  const width = Math.round((vv && vv.width) || window.innerWidth);
  const height = Math.round((vv && vv.height) || window.innerHeight);
  const safe = safeArea();
  const extra = getEdges();

  const top = safe.top + extra.top;
  const bottom = safe.bottom + extra.bottom;
  const left = safe.left + extra.sides;
  const right = safe.right + extra.sides;
  const availW = Math.max(200, width - left - right);
  const availH = Math.max(200, height - top - bottom);

  const portrait = availW < availH * 0.9;
  const phone = Math.min(availW, availH) < 540;
  const base = phone ? (portrait ? PHONE_PORTRAIT : PHONE_LANDSCAPE) : portrait ? PORTRAIT : LANDSCAPE;
  // Uniform scale so text stays readable; the canvas stretches to the aspect.
  const scale = Math.min(1.8, Math.max(0.5, Math.min(availW / base.w, availH / base.h)));

  root.classList.toggle('is-portrait', portrait);
  root.classList.toggle('is-phone', phone);
  root.style.setProperty('--deck-w', `${availW / scale}px`);
  root.style.setProperty('--deck-h', `${availH / scale}px`);
  root.style.setProperty('--deck-x', `${left}px`);
  root.style.setProperty('--deck-y', `${top}px`);
  root.style.setProperty('--deck-s', String(scale));
  window.dispatchEvent(new CustomEvent('deck:fit', { detail: { portrait, phone, scale } }));
}

export function startFitting() {
  fit();
  let timer = null;
  const refit = () => {
    clearTimeout(timer);
    // iOS reports the new size a beat after rotating.
    timer = setTimeout(fit, 120);
  };
  window.addEventListener('resize', refit);
  window.addEventListener('orientationchange', refit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', refit);
}
