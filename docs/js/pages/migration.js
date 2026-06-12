// Migration: names whose geographic center of gravity drifted decade by decade.
import * as store from '../store.js';
import { getMeta, getMigration, getNameStateData } from '../data.js';
import { controlGroup, segmented, el, toast, addButton, listSelect } from '../ui.js';
import { usMap } from '../usmap.js';

let direction = 'north';

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

export async function render(page) {
  page.append(
    el('h1', null, 'Names that packed their bags'),
    el('p', 'lede', 'Some names migrate: their geographic center of gravity drifts across the map decade by decade. Centers are computed over the continental U.S. (lower 48 + D.C.).'),
  );

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
  page.append(controls, layout);

  const [meta, migration] = await Promise.all([getMeta(), getMigration()]);
  const map = await usMap(mapHost);
  map.flatten();

  controls.append(controlGroup('Direction', segmented(
    Object.entries(DIR_LABELS).map(([value, label]) => ({ value, label })),
    direction, v => { direction = v; drawList(); })));

  const myNamesRow = el('div', 'chips-actions');
  mapCard.append(myNamesRow);
  const myListSelect = listSelect(); // created once — reused on every redraw

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
    myNamesRow.append(el('span', 'control-label', 'Trace one of yours:'), myListSelect);
    const names = store.getNames();
    if (!names.length) {
      myNamesRow.append(el('span', 'namebox-hint', 'This list is empty — add names via “My Lists”.'));
      return;
    }
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
        if (st === 'AK' || st === 'HI') continue; // continental only
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
