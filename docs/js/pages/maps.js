// Maps: regional concentration (choropleth) and migration (centroid trails).
import * as store from '../store.js';
import { getMeta, getRegional, getMigration, getNameStateData, STATE_NAMES } from '../data.js';
import { sexFilter, segmented, controlGroup, el, fmt, toast, addButton } from '../ui.js';
import { usMap } from '../usmap.js';

let subview = 'regional';
let era = 'all'; // 'all' | 'recent'
let direction = 'north';

export async function render(page) {
  page.append(
    el('h1', null, 'Where names live'),
    el('p', 'lede', 'Some names belong to the whole country; others are fiercely local. And some names pack their bags: their geographic center of gravity drifts across the map decade by decade.'),
  );

  const subtabs = el('div', 'subtabs');
  const regBtn = el('button', subview === 'regional' ? 'active' : '', 'Regional names');
  const migBtn = el('button', subview === 'migration' ? 'active' : '', 'Name migration');
  subtabs.append(regBtn, migBtn);
  page.append(subtabs);

  const host = el('div');
  page.append(host);

  regBtn.onclick = () => { subview = 'regional'; swap(); };
  migBtn.onclick = () => { subview = 'migration'; swap(); };
  function swap() {
    regBtn.classList.toggle('active', subview === 'regional');
    migBtn.classList.toggle('active', subview === 'migration');
    host.innerHTML = '';
    store.clearSubscribers?.();
    (subview === 'regional' ? renderRegional : renderMigration)(host);
  }
  swap();
}

/* ---------------- regional ---------------- */

async function renderRegional(host) {
  const controls = el('div', 'controls');
  const layout = el('div', 'side-layout');
  const listCard = el('div', 'card');
  const mapCard = el('div', 'card');
  const mapTitle = el('h2', null, '');
  const mapHost = el('div');
  const mapNote = el('p', 'footnote', 'Color shows a location quotient: how popular the name is in a state relative to its national popularity. Click any name on the left — or one of your own below.');
  mapCard.append(mapTitle, mapHost, mapNote);
  layout.append(listCard, mapCard);
  host.append(controls, layout);

  const [meta, regional] = await Promise.all([getMeta(), getRegional()]);
  const map = await usMap(mapHost);

  const myNamesRow = el('div', 'chips-actions');
  mapCard.append(myNamesRow);

  let mode = 'most';
  controls.append(
    controlGroup('Sex', sexFilter()),
    controlGroup('Era', segmented([
      { value: 'all', label: 'All-time (1910–)' },
      { value: 'recent', label: 'Since 2000' },
    ], era, v => { era = v; drawLists(); })),
    controlGroup('Show', segmented([
      { value: 'most', label: 'Most regional' },
      { value: 'least', label: 'Least regional' },
    ], mode, v => { mode = v; drawLists(); })),
  );

  let selected = null;

  function sexKey() { const s = store.getSex(); return s === 'B' ? 'A' : s; }

  function drawLists() {
    const entries = regional[era][sexKey()][mode];
    listCard.innerHTML = '';
    listCard.append(el('h3', null, mode === 'most'
      ? 'Most regional — concentrated in one place'
      : 'Least regional — evenly spread coast to coast'));
    const ul = el('ul', 'ranklist');
    const maxTvd = entries[0] ? Math.max(...entries.map(e => e.tvd)) : 1;
    entries.slice(0, 20).forEach((e, i) => {
      const li = el('li');
      li.innerHTML = `<span class="rk">${i + 1}</span><span class="nm">${e.name}</span>
        <span class="bar"><i style="width:${(e.tvd / maxTvd) * 100}%"></i></span>
        <span class="meta">${e.topState} ×${e.lq}</span>`;
      li.append(addButton(e.name));
      li.onclick = () => { selected = e.name; showName(e.name); markSelected(ul, li); };
      ul.append(li);
    });
    listCard.append(ul, el('p', 'footnote',
      mode === 'most'
        ? '“×N” = the name is N times more common in its hotspot state than nationally.'
        : 'These names track the national average almost everywhere.'));
    if (!selected || !entries.some(e => e.name === selected)) {
      selected = entries[0]?.name;
      if (selected) { showName(selected); markSelected(ul, ul.firstChild); }
    } else {
      showName(selected);
    }
    drawMyNames();
  }

  function markSelected(ul, li) {
    ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
    li?.classList.add('selected');
  }

  function drawMyNames() {
    myNamesRow.innerHTML = '';
    const names = store.getNames();
    if (!names.length) return;
    myNamesRow.append(el('span', 'control-label', 'Map one of yours:'));
    names.forEach(n => {
      const b = el('button', 'btn-quiet', n);
      b.onclick = () => { selected = n; showName(n); };
      myNamesRow.append(b);
    });
  }

  async function showName(name) {
    const sex = store.getSex();
    const data = await getNameStateData(name);
    mapTitle.textContent = name;
    if (!data) {
      toast(`${name} is too rare for reliable state-level data`);
      map.flatten();
      return;
    }
    const decLo = era === 'recent' ? 9 : 0;
    const sexes = sex === 'B' ? ['F', 'M'] : [sex];
    const counts = {}, base = {};
    let nameTotal = 0, baseTotal = 0;
    for (const st of Object.keys(STATE_NAMES)) {
      counts[st] = 0;
      base[st] = 0;
      for (const sx of sexes) {
        const arr = data[sx]?.[st];
        if (arr) counts[st] += arr.slice(decLo).reduce((a, b) => a + b, 0);
        base[st] += meta.stateDecadeTotals[st][sx].slice(decLo).reduce((a, b) => a + b, 0);
      }
      nameTotal += counts[st];
      baseTotal += base[st];
    }
    if (!nameTotal) {
      toast(`No ${sex === 'F' ? 'girls' : sex === 'M' ? 'boys' : ''} named ${name} in this era`);
      map.flatten();
      return;
    }
    const lq = {};
    for (const st of Object.keys(counts)) {
      lq[st] = base[st] ? (counts[st] / nameTotal) / (base[st] / baseTotal) : null;
    }
    map.choropleth(lq, {
      diverging: true,
      label: `${name} — local popularity vs national (${era === 'recent' ? '2000–2025' : '1910–2025'})`,
      tooltip: p => `<div class="tt-title">${STATE_NAMES[p]}</div>
        ${fmt(counts[p])} babies named ${name}<br>
        ${lq[p] ? `${lq[p].toFixed(2)}× the national rate` : 'no data'}`,
    });
  }

  store.subscribe(() => { drawLists(); });
  drawLists();
}

/* ---------------- migration ---------------- */

const DIR_LABELS = {
  north: 'Moved north', south: 'Moved south', east: 'Moved east',
  west: 'Moved west', stable: 'Stayed put',
};
const DIR_BLURB = {
  north: 'Largest northward drift in the name’s center of gravity.',
  south: 'Largest southward drift — many follow the Sun Belt boom.',
  east: 'Largest eastward drift.',
  west: 'Largest westward drift — names that followed the frontier.',
  stable: 'High-volume names whose center of gravity barely moved.',
};

async function renderMigration(host) {
  const controls = el('div', 'controls');
  const layout = el('div', 'side-layout');
  const listCard = el('div', 'card');
  const mapCard = el('div', 'card');
  const mapTitle = el('h2', null, '');
  const mapHost = el('div');
  const note = el('p', 'footnote',
    'The trail traces the name’s population center each decade: every state pulls on the point in proportion to how popular the name is there per capita. Big dot = the 2020s.');
  mapCard.append(mapTitle, mapHost, note);
  layout.append(listCard, mapCard);
  host.append(controls, layout);

  const [meta, migration] = await Promise.all([getMeta(), getMigration()]);
  const map = await usMap(mapHost);
  map.flatten();

  controls.append(controlGroup('Direction', segmented(
    Object.entries(DIR_LABELS).map(([value, label]) => ({ value, label })),
    direction, v => { direction = v; drawList(); })));

  const myNamesRow = el('div', 'chips-actions');
  mapCard.append(myNamesRow);

  function drawList() {
    const entries = migration[direction];
    listCard.innerHTML = '';
    listCard.append(el('h3', null, DIR_LABELS[direction]));
    const ul = el('ul', 'ranklist');
    entries.slice(0, 18).forEach((m, i) => {
      const comp = direction === 'north' || direction === 'south'
        ? `${Math.abs(m.dLat).toFixed(1)}° ${direction}`
        : direction === 'stable'
          ? `${Math.hypot(m.dLat, m.dLon).toFixed(1)}° total`
          : `${Math.abs(m.dLon).toFixed(1)}° ${direction}`;
      const li = el('li');
      li.innerHTML = `<span class="rk">${i + 1}</span>
        <span class="nm">${m.name}</span>
        <span class="meta">${m.sex === 'F' ? '♀' : '♂'} · ${comp}</span>`;
      li.append(addButton(m.name));
      li.onclick = () => { show(m); markSelected(ul, li); };
      ul.append(li);
    });
    listCard.append(ul, el('p', 'footnote', DIR_BLURB[direction]));
    if (entries[0]) { show(entries[0]); markSelected(ul, ul.firstChild); }
    drawMyNames();
  }

  function markSelected(ul, li) {
    ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
    li?.classList.add('selected');
  }

  function show(m) {
    mapTitle.textContent = `${m.name} (${m.sex === 'F' ? 'girls' : 'boys'})`;
    map.trail(
      m.path.map(([decade, lat, lon]) => ({ decade, lat, lon })),
      { color: m.sex === 'F' ? '#c0544f' : '#46688c', label: m.name },
    );
  }

  function drawMyNames() {
    myNamesRow.innerHTML = '';
    const names = store.getNames();
    if (!names.length) return;
    myNamesRow.append(el('span', 'control-label', 'Trace one of yours:'));
    names.forEach(n => {
      const b = el('button', 'btn-quiet', n);
      b.onclick = () => traceCustom(n);
      myNamesRow.append(b);
    });
  }

  // Compute a centroid path client-side for any name in the user's list.
  async function traceCustom(name) {
    const data = await getNameStateData(name);
    if (!data) { toast(`${name} is too rare for state-level tracing`); return; }
    const sex = store.getSex() === 'B'
      ? (sumAll(data.F) >= sumAll(data.M) ? 'F' : 'M')
      : store.getSex();
    const sx = data[sex];
    if (!sx) { toast(`No ${sex === 'F' ? 'girls' : 'boys'} named ${name} in the state data`); return; }
    const pts = [];
    meta.decades.forEach((decade, di) => {
      let la = 0, lo = 0, wsum = 0, n = 0;
      for (const [st, arr] of Object.entries(sx)) {
        const tot = meta.stateDecadeTotals[st][sex][di];
        if (!tot || !arr[di]) continue;
        const w = arr[di] / tot;
        la += w * meta.centroids[st][0];
        lo += w * meta.centroids[st][1];
        wsum += w;
        n += arr[di];
      }
      if (wsum && n >= 80) pts.push({ decade, lat: la / wsum, lon: lo / wsum });
    });
    if (pts.length < 2) { toast(`${name} doesn’t have enough decades of data to trace`); return; }
    mapTitle.textContent = `${name} (${sex === 'F' ? 'girls' : 'boys'})`;
    map.trail(pts, { color: sex === 'F' ? '#c0544f' : '#46688c', label: name });
  }

  function sumAll(sx) {
    return sx ? Object.values(sx).reduce((a, arr) => a + arr.reduce((x, y) => x + y, 0), 0) : 0;
  }

  store.subscribe(drawMyNames);
  drawList();
}
