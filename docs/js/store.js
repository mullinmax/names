// Shared, persisted UI state: named name-lists and the sex filter.
// Every page works with the *active* list; the lists manager (ui.js) can
// create, rename, copy, edit, and delete any list. Built-in lists are seeded
// once and are ordinary lists from then on.
import { DEFAULT_LISTS } from './defaultLists.js';

const KEY = 'nominal:v2';
const KEY_NAMES_V1 = 'nominal:names';
const KEY_SEX_V1 = 'nominal:sex';

const pageListeners = new Set();       // cleared on navigation
const persistentListeners = new Set(); // header / dialog — never cleared

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

function builtinId(id) { return `builtin:${id}`; }

function seed() {
  // migrate the v1 single list if one existed
  const v1 = load(KEY_NAMES_V1, []);
  const mine = { id: 'mine', name: 'My names', names: Array.isArray(v1) ? v1 : [] };
  const builtins = DEFAULT_LISTS.map(d =>
    ({ id: builtinId(d.id), name: d.name, names: [...new Set(d.names)] }));
  return { lists: [mine, ...builtins], activeId: 'mine', sex: load(KEY_SEX_V1, 'B') };
}

let state = load(KEY, null);
if (!state || !Array.isArray(state.lists) || !state.lists.length) state = seed();
if (!state.lists.some(l => l.id === state.activeId)) state.activeId = state.lists[0].id;

function persist() { save(KEY, state); }
function emit() {
  persist();
  persistentListeners.forEach(fn => fn(state));
  pageListeners.forEach(fn => fn(state));
}

let uid = 0;
const newId = () => `u${Date.now().toString(36)}${(uid++).toString(36)}`;

/* ---------------- lists ---------------- */

export function getLists() {
  return state.lists.map(l => ({ id: l.id, name: l.name, names: [...l.names] }));
}
export function getList(id) {
  const l = state.lists.find(x => x.id === id);
  return l ? { id: l.id, name: l.name, names: [...l.names] } : null;
}
export function getActiveId() { return state.activeId; }
export function getActiveList() { return getList(state.activeId); }

export function setActive(id) {
  if (!state.lists.some(l => l.id === id) || state.activeId === id) return;
  state.activeId = id;
  emit();
}

export function createList(name, names = [], activate = true) {
  const id = newId();
  state.lists.push({ id, name, names: [...new Set(names)] });
  if (activate) state.activeId = id;
  emit();
  return id;
}

export function renameList(id, name) {
  const l = state.lists.find(x => x.id === id);
  if (!l) return;
  l.name = name;
  emit();
}

export function duplicateList(id) {
  const l = state.lists.find(x => x.id === id);
  if (!l) return null;
  const copyId = newId();
  const idx = state.lists.indexOf(l);
  state.lists.splice(idx + 1, 0, { id: copyId, name: `${l.name} copy`, names: [...l.names] });
  emit();
  return copyId;
}

export function deleteList(id) {
  const idx = state.lists.findIndex(x => x.id === id);
  if (idx < 0) return;
  state.lists.splice(idx, 1);
  if (!state.lists.length) state.lists.push({ id: 'mine', name: 'My names', names: [] });
  if (state.activeId === id) state.activeId = state.lists[0].id;
  emit();
}

export function setListNames(id, names) {
  const l = state.lists.find(x => x.id === id);
  if (!l) return;
  l.names = [...new Set(names)];
  emit();
}

// Re-add any built-in lists that were deleted; returns how many were restored.
export function restoreDefaults() {
  let restored = 0;
  for (const d of DEFAULT_LISTS) {
    if (!state.lists.some(l => l.id === builtinId(d.id))) {
      state.lists.push({ id: builtinId(d.id), name: d.name, names: [...new Set(d.names)] });
      restored++;
    }
  }
  if (restored) emit();
  return restored;
}

/* ------------- active-list conveniences (used by pages) ------------- */

export function getNames() { return [...(state.lists.find(l => l.id === state.activeId)?.names || [])]; }
export function setNames(names) { setListNames(state.activeId, names); }

export function addName(name) {
  const l = state.lists.find(x => x.id === state.activeId);
  if (!l || l.names.includes(name)) return false;
  l.names = [...l.names, name];
  emit();
  return true;
}

export function removeName(name) {
  const l = state.lists.find(x => x.id === state.activeId);
  if (!l) return;
  l.names = l.names.filter(n => n !== name);
  emit();
}

/* ---------------- sex filter ---------------- */

export function getSex() { return state.sex; }
export function setSex(sex) {
  state.sex = sex;
  emit();
}

/* ---------------- subscriptions ---------------- */

// Page-scoped: auto-cleared on navigation.
export function subscribe(fn) {
  pageListeners.add(fn);
  return () => pageListeners.delete(fn);
}
// App-scoped: survives navigation (header bar, lists dialog).
export function subscribePersistent(fn) {
  persistentListeners.add(fn);
  return () => persistentListeners.delete(fn);
}
export function clearSubscribers() { pageListeners.clear(); }
