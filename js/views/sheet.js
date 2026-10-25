// Modal sheets: open/close, tap-outside and [data-close] buttons.

import { $ } from '../util.js';

export function openSheet(id) {
  const el = $(`#${id}`);
  if (!el) return;
  el.hidden = false;
}

export function closeSheet(id) {
  const el = $(`#${id}`);
  if (el) el.hidden = true;
}

export function bindSheets() {
  document.querySelectorAll('.sheet-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop || e.target.closest('[data-close]')) backdrop.hidden = true;
    });
  });
}
