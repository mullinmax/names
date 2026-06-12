// Shared UI helpers: toast, tooltip, segmented controls, the name-chips editor.
import * as store from './store.js';
import { nameExists, getTop } from './data.js';

export const SEX_LABEL = { F: 'Girls', M: 'Boys', B: 'Both' };
export const SEX_COLOR = { F: 'var(--girl)', M: 'var(--boy)', B: 'var(--both)' };

// A muted-editorial categorical palette for name lines.
export const PALETTE = [
  '#b3543e', '#46688c', '#7d9a6b', '#caa53d', '#7a5d92',
  '#3f8f8a', '#c07c9f', '#8a6f4d', '#5b7fb5', '#a8a23f',
  '#d0782e', '#5e5e5e',
];
export const colorFor = i => PALETTE[i % PALETTE.length];

export function titleCase(s) {
  s = s.trim();
  return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : '';
}

export const fmt = d3.format(',');
export const fmt1 = d3.format(',.1f');

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

const tip = () => document.getElementById('tooltip');
export function showTooltip(html, event) {
  const el = tip();
  el.innerHTML = html;
  el.hidden = false;
  moveTooltip(event);
}
export function moveTooltip(event) {
  const el = tip();
  const pad = 14;
  const w = el.offsetWidth, h = el.offsetHeight;
  let x = event.clientX + pad, y = event.clientY + pad;
  if (x + w > innerWidth - 8) x = event.clientX - w - pad;
  if (y + h > innerHeight - 8) y = event.clientY - h - pad;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}
export function hideTooltip() { tip().hidden = true; }

// Segmented control. options: [{value,label,cls?}]
export function segmented(options, value, onChange) {
  const div = document.createElement('div');
  div.className = 'seg';
  for (const opt of options) {
    const b = document.createElement('button');
    b.textContent = opt.label;
    b.dataset.value = opt.value;
    if (opt.cls) b.classList.add(opt.cls);
    if (opt.value === value) b.classList.add('active');
    b.onclick = () => {
      div.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      onChange(opt.value);
    };
    div.appendChild(b);
  }
  return div;
}

// Note: pages react to sex changes via store.subscribe — setSex emits for us.
export function sexFilter(value = store.getSex()) {
  return segmented([
    { value: 'F', label: 'Girls', cls: 'sex-F' },
    { value: 'M', label: 'Boys', cls: 'sex-M' },
    { value: 'B', label: 'Both', cls: 'sex-B' },
  ], value, v => store.setSex(v));
}

export function controlGroup(label, el) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '8px';
  const span = document.createElement('span');
  span.className = 'control-label';
  span.textContent = label;
  wrap.append(span, el);
  return wrap;
}

/**
 * The shared "your names" chips editor. Persists via store; re-renders itself
 * on store changes. opts: {hint, showSwatches}
 */
export function nameChips(opts = {}) {
  const root = document.createElement('div');
  root.className = 'namebox';

  const head = document.createElement('div');
  head.className = 'namebox-head';
  head.innerHTML = `<span class="namebox-title">Your name list</span>
    <span class="namebox-hint">${opts.hint || 'Type a name and press Enter — your list follows you across every tab.'}</span>`;

  const box = document.createElement('div');
  box.className = 'chips';
  const input = document.createElement('input');
  input.placeholder = 'Add a name…';
  input.autocapitalize = 'words';

  const actions = document.createElement('div');
  actions.className = 'chips-actions';
  const select = document.createElement('select');
  select.className = 'dropdown';
  select.innerHTML = '<option value="">Load a curated list…</option>' +
    Object.keys(store.CURATED_LISTS).map(k => `<option>${k}</option>`).join('');
  select.onchange = async () => {
    const key = select.value;
    select.value = '';
    if (!key) return;
    let names = store.CURATED_LISTS[key];
    if (!names) { // “Today’s top 10” — resolved from data
      const top = await getTop();
      const years = Object.keys(top.F).map(Number);
      const latest = String(Math.max(...years));
      names = [...top.F[latest].slice(0, 5), ...top.M[latest].slice(0, 5)].map(d => d[0]);
    }
    store.setNames(names);
  };
  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn-quiet';
  clearBtn.textContent = 'Clear list';
  clearBtn.onclick = () => store.setNames([]);
  actions.append(select, clearBtn);

  function render() {
    box.querySelectorAll('.chip').forEach(c => c.remove());
    const names = store.getNames();
    names.forEach((name, i) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      if (opts.showSwatches !== false) {
        const sw = document.createElement('span');
        sw.className = 'swatch';
        sw.style.background = colorFor(i);
        chip.appendChild(sw);
      }
      chip.appendChild(document.createTextNode(name));
      const x = document.createElement('button');
      x.textContent = '×';
      x.setAttribute('aria-label', `Remove ${name}`);
      x.onclick = () => store.removeName(name);
      chip.appendChild(x);
      box.insertBefore(chip, input);
    });
  }

  input.addEventListener('keydown', async e => {
    if (e.key === 'Backspace' && !input.value) {
      const names = store.getNames();
      if (names.length) store.removeName(names[names.length - 1]);
      return;
    }
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const name = titleCase(input.value);
    if (!name) return;
    input.value = '';
    if (store.getNames().includes(name)) { toast(`${name} is already in your list`); return; }
    if (!(await nameExists(name))) { toast(`“${name}” isn’t in the SSA database (1880–2025)`); return; }
    store.addName(name);
  });

  box.appendChild(input);
  root.append(head, box, actions);
  render();
  store.subscribe(render);
  return root;
}

// "+" button that adds a name to the shared list.
export function addButton(name) {
  const b = document.createElement('button');
  b.className = 'add-mini';
  b.textContent = '+';
  b.title = `Add ${name} to your list`;
  b.onclick = e => {
    e.stopPropagation();
    if (store.addName(name)) toast(`Added ${name} to your list`);
    else toast(`${name} is already in your list`);
  };
  return b;
}

export function el(tag, cls, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

export function loadingBlock() {
  return el('div', 'loading-block', '<span class="spinner"></span> Crunching 145 years of names…');
}
