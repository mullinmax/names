// Shared, persisted UI state: the user's name list and sex filter.
const KEY_NAMES = 'nominal:names';
const KEY_SEX = 'nominal:sex';

const listeners = new Set();

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

const state = {
  names: load(KEY_NAMES, []),   // empty = "use the default (top 10)"
  sex: load(KEY_SEX, 'B'),      // 'F' | 'M' | 'B'
};

function emit() { listeners.forEach(fn => fn(state)); }

export function getNames() { return [...state.names]; }
export function getSex() { return state.sex; }

export function setNames(names) {
  state.names = [...new Set(names)];
  save(KEY_NAMES, state.names);
  emit();
}

export function addName(name) {
  if (state.names.includes(name)) return false;
  state.names = [...state.names, name];
  save(KEY_NAMES, state.names);
  emit();
  return true;
}

export function removeName(name) {
  state.names = state.names.filter(n => n !== name);
  save(KEY_NAMES, state.names);
  emit();
}

export function setSex(sex) {
  state.sex = sex;
  save(KEY_SEX, sex);
  emit();
}

// Subscribe to changes; returns an unsubscribe fn. Auto-cleared on page change.
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function clearSubscribers() { listeners.clear(); }

// Curated quick-pick lists for the chips component.
export const CURATED_LISTS = {
  'Timeless classics': ['James', 'Mary', 'William', 'Elizabeth', 'John', 'Katherine', 'Thomas', 'Anne'],
  'Today’s top 10': null, // resolved at runtime from top.json
  '1950s favorites': ['Linda', 'Deborah', 'Gary', 'Ronald', 'Patricia', 'Dennis', 'Sandra', 'Larry'],
  '1990s kids': ['Ashley', 'Brittany', 'Tyler', 'Brandon', 'Megan', 'Cody', 'Kayla', 'Austin'],
  'Comeback vintage': ['Hazel', 'Eleanor', 'Theodore', 'Arthur', 'Mabel', 'Otis', 'Ida', 'Silas'],
  'Pop-culture spikes': ['Khaleesi', 'Miley', 'Neo', 'Kylo', 'Arya', 'Elsa', 'Farrah', 'Kobe'],
  'Gender benders': ['Leslie', 'Ashley', 'Madison', 'Aubrey', 'Riley', 'Casey', 'Jordan', 'Avery'],
};
