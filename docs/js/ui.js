// Shared UI helpers: toast, tooltip, segmented controls, the name-list
// chips editor, and the global lists-manager dialog.
import * as store from './store.js';
import { nameExists } from './data.js';

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

const esc = s => String(s).replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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

/* ---------------- name-list chips ---------------- */

// A chips editor bound to one list (getId is read at event time so the box
// can follow the active list). Returns {root, render}.
function chipsBox(getId, opts = {}) {
  const root = el('div');
  const box = el('div', 'chips');
  const input = document.createElement('input');
  input.placeholder = 'Add a name…';
  input.autocapitalize = 'words';
  box.appendChild(input);

  input.addEventListener('keydown', async e => {
    const id = getId();
    const list = store.getList(id);
    if (!list) return;
    if (e.key === 'Backspace' && !input.value) {
      if (list.names.length) store.setListNames(id, list.names.slice(0, -1));
      return;
    }
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const name = titleCase(input.value);
    if (!name) return;
    input.value = '';
    if (list.names.includes(name)) { toast(`${name} is already in “${list.name}”`); return; }
    if (!(await nameExists(name))) { toast(`“${name}” isn’t in the SSA database (1880–2025)`); return; }
    const fresh = store.getList(id);
    if (fresh) store.setListNames(id, [...fresh.names, name]);
  });

  function render() {
    box.querySelectorAll('.chip').forEach(c => c.remove());
    const list = store.getList(getId());
    (list ? list.names : []).forEach((name, i) => {
      const chip = el('span', 'chip');
      if (opts.showSwatches !== false) {
        const sw = el('span', 'swatch');
        sw.style.background = colorFor(i);
        chip.appendChild(sw);
      }
      chip.appendChild(document.createTextNode(name));
      const x = document.createElement('button');
      x.textContent = '×';
      x.setAttribute('aria-label', `Remove ${name}`);
      x.onclick = () => {
        const l = store.getList(getId());
        if (l) store.setListNames(l.id, l.names.filter(n => n !== name));
      };
      chip.appendChild(x);
      box.insertBefore(chip, input);
    });
  }

  root.append(box);
  render();
  return { root, render };
}

// Bare dropdown bound to the active list — for compact spots (map pages etc.).
// Create it once per page render: it subscribes to the page-scoped store.
export function listSelect() {
  const select = document.createElement('select');
  select.className = 'dropdown';
  select.title = 'Switch the active list';
  select.onchange = () => store.setActive(select.value);
  function render() {
    select.innerHTML = store.getLists().map(l =>
      `<option value="${esc(l.id)}"${l.id === store.getActiveId() ? ' selected' : ''}>${esc(l.name)} (${l.names.length})</option>`).join('');
  }
  render();
  store.subscribe(render);
  return select;
}

/**
 * The shared "name list" component pages embed: shows which list is active,
 * lets you switch lists, and previews its names. All editing happens in the
 * lists manager dialog. opts: {hint, showSwatches}
 */
export function listPicker(opts = {}) {
  const root = el('div', 'namebox');

  const head = el('div', 'namebox-head');
  const left = el('div', 'namebox-titlewrap');
  const title = el('span', 'namebox-title', 'Name list');
  const select = listSelect();
  const edit = el('button', 'btn-quiet', 'Edit names…');
  edit.title = 'Add or remove names in the lists manager';
  edit.onclick = () => openListsManager(store.getActiveId());
  left.append(title, select, edit);
  const hint = el('span', 'namebox-hint',
    opts.hint || 'The active list follows you across every tab — edit it via “Edit names…”.');
  head.append(left, hint);

  const box = el('div', 'chips chips-readonly');

  function render() {
    box.innerHTML = '';
    const list = store.getActiveList();
    if (!list || !list.names.length) {
      box.append(el('span', 'chips-empty', 'This list is empty — click “Edit names…” to add some.'));
      return;
    }
    list.names.forEach((name, i) => {
      const chip = el('span', 'chip chip-readonly');
      if (opts.showSwatches !== false) {
        const sw = el('span', 'swatch');
        sw.style.background = colorFor(i);
        chip.appendChild(sw);
      }
      chip.appendChild(document.createTextNode(name));
      box.append(chip);
    });
  }

  root.append(head, box);
  render();
  store.subscribe(render);
  return root;
}

/* ---------------- lists manager dialog ---------------- */

let dlg = null, dlgBody = null, expandedId = null;

// Optionally pass a list id to open with that list's name editor expanded.
export function openListsManager(expandId) {
  if (typeof expandId === 'string') expandedId = expandId;
  if (!dlg) buildDialog();
  renderDialog();
  dlg.showModal();
}

function buildDialog() {
  dlg = document.createElement('dialog');
  dlg.className = 'lists-dialog';
  dlg.innerHTML = `
    <div class="ld-head">
      <h2>Your name lists</h2>
      <button class="ld-close" aria-label="Close">×</button>
    </div>
    <p class="ld-hint">Lists are saved in your browser and shared by every page.
      The built-in lists (Biblical, Presidential…) are ordinary lists — edit,
      copy, or delete them like any other. Click a list's name to edit its names.</p>
    <div class="ld-body"></div>
    <div class="ld-foot">
      <input class="ld-newname" placeholder="New list name…">
      <button class="btn-quiet ld-create">Create list</button>
      <span class="ld-spacer"></span>
      <button class="btn-quiet ld-restore">Restore missing built-ins</button>
    </div>`;
  document.body.appendChild(dlg);
  dlgBody = dlg.querySelector('.ld-body');
  dlg.querySelector('.ld-close').onclick = () => dlg.close();
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

  const newInput = dlg.querySelector('.ld-newname');
  const create = () => {
    const name = newInput.value.trim();
    if (!name) { toast('Give the new list a name first'); return; }
    newInput.value = '';
    // the store emits during createList, before we know the new id — re-render
    // once more so the new list's editor opens
    expandedId = store.createList(name);
    renderDialog();
  };
  dlg.querySelector('.ld-create').onclick = create;
  newInput.addEventListener('keydown', e => { if (e.key === 'Enter') create(); });

  dlg.querySelector('.ld-restore').onclick = () => {
    const n = store.restoreDefaults();
    toast(n ? `Restored ${n} built-in list${n > 1 ? 's' : ''}` : 'All built-in lists are already here');
  };

  store.subscribePersistent(() => { if (dlg.open) renderDialog(); });
}

function renderDialog() {
  const refocus = document.activeElement
    && dlgBody.contains(document.activeElement)
    && document.activeElement.matches('.chips input');
  dlgBody.innerHTML = '';
  for (const list of store.getLists()) {
    const isActive = list.id === store.getActiveId();
    const row = el('div', `list-row${isActive ? ' active' : ''}`);
    const head = el('div', 'list-row-head');

    const name = el('button', 'list-name');
    name.innerHTML = `${esc(list.name)} <span class="list-count">${list.names.length} name${list.names.length === 1 ? '' : 's'}</span>`;
    name.title = 'Edit the names in this list';
    name.onclick = () => { expandedId = expandedId === list.id ? null : list.id; renderDialog(); };

    const actions = el('div', 'list-actions');
    const useBtn = el('button', 'btn-quiet', isActive ? '✓ Active' : 'Use');
    useBtn.disabled = isActive;
    useBtn.onclick = () => store.setActive(list.id);
    const renameBtn = el('button', 'btn-quiet', 'Rename');
    renameBtn.onclick = () => {
      const nn = prompt('Rename list', list.name);
      if (nn && nn.trim()) store.renameList(list.id, nn.trim());
    };
    const copyBtn = el('button', 'btn-quiet', 'Copy');
    copyBtn.onclick = () => { expandedId = store.duplicateList(list.id); renderDialog(); };
    const delBtn = el('button', 'btn-quiet danger', 'Delete');
    delBtn.onclick = () => {
      if (!list.names.length || confirm(`Delete “${list.name}” (${list.names.length} names)?`)) {
        if (expandedId === list.id) expandedId = null;
        store.deleteList(list.id);
      }
    };
    actions.append(useBtn, renameBtn, copyBtn, delBtn);

    head.append(name, actions);
    row.append(head);
    if (expandedId === list.id) row.append(chipsBox(() => list.id, { showSwatches: false }).root);
    dlgBody.append(row);
  }
  if (refocus) dlgBody.querySelector('.list-row .chips input')?.focus();
}

/* ---------------- misc ---------------- */

// "+" button that adds a name to the active list.
export function addButton(name) {
  const b = document.createElement('button');
  b.className = 'add-mini';
  b.textContent = '+';
  b.title = `Add ${name} to your active list`;
  b.onclick = e => {
    e.stopPropagation();
    const list = store.getActiveList();
    if (store.addName(name)) toast(`Added ${name} to “${list.name}”`);
    else toast(`${name} is already in “${list.name}”`);
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
