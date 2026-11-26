// DOM/format helpers and the fixed-step constants shared by main.js and the
// extracted main-* modules. They live in this leaf so no extracted module has
// to import main.js, which would close an import cycle.

export const STEP = 1 / 60;

export const DEFAULT_TITLE_VIEW = {
  position: [132, 64, 156],
  target: [-210, 2, 42],
  drift: [6.0, 1.4, 4.0],
  speed: 0.03,
};

export function byId(id) {
  return document.getElementById(id);
}

export function formatCash(value) {
  return `$ ${Math.max(0, Math.round(value)).toLocaleString('en-US')}`;
}

export function setHidden(element, hidden) {
  if (element) element.hidden = hidden;
}
