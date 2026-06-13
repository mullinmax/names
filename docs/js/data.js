// Fetch + cache layer for the precomputed JSON artifacts.
const cache = new Map();

async function getJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const promise = fetch(`data/${path}`).then(r => {
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  });
  cache.set(path, promise);
  return promise;
}

export const getMeta = () => getJSON('meta.json');
export const getTop = () => getJSON('top.json');
export const getRegional = () => getJSON('regional.json');
export const getMigration = () => getJSON('migration.json');
export const getRising = () => getJSON('rising.json');
export const getStability = () => getJSON('stability.json');
export const getGender = () => getJSON('gender.json');
export const getDecades = () => getJSON('decades.json');
export const getWonders = () => getJSON('wonders.json');
export const getBigPicture = () => getJSON('bigpicture.json');

const shardKey = name => {
  const c = name[0].toLowerCase();
  return c >= 'a' && c <= 'z' ? c : '0';
};

// National yearly series for one name. Returns {F: {start, counts}, M: ...} or null.
export async function getNameSeries(name) {
  const shard = await getJSON(`names/${shardKey(name)}.json`);
  const entry = shard[name];
  if (!entry) return null;
  const out = {};
  for (const [sex, arr] of Object.entries(entry)) {
    out[sex] = { start: arr[0], counts: arr.slice(1) };
  }
  return out;
}

// State x decade counts for one name: {F: {CA: [12 decade counts], ...}, M: ...}
export async function getNameStateData(name) {
  const shard = await getJSON(`states/${shardKey(name)}.json`);
  return shard[name] || null;
}

export async function nameExists(name) {
  return (await getNameSeries(name)) !== null;
}

// Full per-year array (yearMin..yearMax) of counts for a name+sex ('B' sums both).
export async function getYearCounts(name, sex, meta) {
  const series = await getNameSeries(name);
  if (!series) return null;
  const n = meta.yearMax - meta.yearMin + 1;
  const out = new Array(n).fill(0);
  const sexes = sex === 'B' ? ['F', 'M'] : [sex];
  let any = false;
  for (const sx of sexes) {
    const s = series[sx];
    if (!s) continue;
    any = true;
    const offset = s.start - meta.yearMin;
    s.counts.forEach((v, i) => { out[offset + i] += v; });
  }
  return any ? out : null;
}

// Rate per million of the chosen sex's births that year ('B' uses combined totals).
export function toRates(counts, sex, meta) {
  return counts.map((v, i) => {
    const tot = sex === 'B'
      ? meta.totals.F[i] + meta.totals.M[i]
      : meta.totals[sex][i];
    return tot ? (v / tot) * 1e6 : 0;
  });
}

export const POSTAL_TO_FIPS = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09',
  DE: '10', DC: '11', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17',
  IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23', MD: '24',
  MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31',
  NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38',
  OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46',
  TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54',
  WI: '55', WY: '56',
};
export const FIPS_TO_POSTAL = Object.fromEntries(
  Object.entries(POSTAL_TO_FIPS).map(([p, f]) => [f, p]));

export const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'D.C.', FL: 'Florida',
  GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana',
  IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska',
  NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas',
  UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

// Maps and regional stats cover the continental US only (lower 48 + DC).
export const CONTINENTAL = Object.keys(STATE_NAMES).filter(s => s !== 'AK' && s !== 'HI');

export const getUSTopo = () =>
  cache.has('__topo')
    ? cache.get('__topo')
    : cache.set('__topo', fetch('vendor/states-albers-10m.json').then(r => r.json())).get('__topo');
