// Compare Lists: chart any of your name lists against each other over time.
// Built-in lists (Biblical, Presidential…) and lists you create are all here.
import * as store from '../store.js';
import { getMeta, getYearCounts } from '../data.js';
import { sexFilter, segmented, controlGroup, colorFor, el, openListsManager } from '../ui.js';
import { lineChart } from '../chart.js';

let scale = 'share'; // 'share' | 'relative'
let selectedIds = null; // persists across visits in this session
const MAX_SELECTED = 8;

export async function render(page) {
  page.append(
    el('h1', null, 'Compare groups of names'),
    el('p', 'lede', 'Pick any of your name lists and watch them rise and fall against each other. Each line is the combined popularity of every name in that list. Build a new list in <em>My Lists</em> and it shows up here instantly.'),
  );

  const cards = el('div', 'group-cards');
  page.append(cards);

  const controls = el('div', 'controls');
  const card = el('div', 'card');
  const chartHost = el('div');
  const note = el('p', 'footnote');
  card.append(controls, chartHost, note);
  page.append(card);

  const meta = await getMeta();
  const nYears = meta.yearMax - meta.yearMin + 1;
  const years = d3.range(meta.yearMin, meta.yearMax + 1);

  const chart = lineChart(chartHost, {
    yLabel: 'share of births (%)',
    tooltipFormat: v => scale === 'share' ? `${v.toFixed(2)}%` : `${Math.round(v)}% of its peak`,
  });

  controls.append(
    controlGroup('Sex', sexFilter()),
    controlGroup('Scale', segmented([
      { value: 'share', label: 'Share of births' },
      { value: 'relative', label: 'Relative (% of own peak)' },
    ], scale, v => { scale = v; draw(); })),
  );

  if (!selectedIds) {
    selectedIds = store.getLists().filter(l => l.names.length).slice(0, 3).map(l => l.id);
  }

  function renderCards() {
    const lists = store.getLists();
    selectedIds = selectedIds.filter(id => lists.some(l => l.id === id));
    cards.innerHTML = '';
    for (const list of lists) {
      const on = selectedIds.includes(list.id);
      const b = el('button', `group-card${on ? ' active' : ''}`);
      b.innerHTML = `<div class="g-name">${list.name}</div><div class="g-count">${list.names.length} names</div>`;
      b.onclick = () => {
        if (on) selectedIds = selectedIds.filter(id => id !== list.id);
        else if (selectedIds.length < MAX_SELECTED) selectedIds = [...selectedIds, list.id];
        renderCards();
        draw();
      };
      cards.append(b);
    }
    const manage = el('button', 'group-card group-card-manage');
    manage.innerHTML = `<div class="g-name">＋ Manage lists</div><div class="g-count">create / edit / copy</div>`;
    manage.onclick = openListsManager;
    cards.append(manage);
  }

  function totalsFor(sex, yi) {
    return sex === 'B' ? meta.totals.F[yi] + meta.totals.M[yi] : meta.totals[sex][yi];
  }

  // Aggregate yearly counts of a whole list, cached per (names, sex).
  const aggCache = new Map();
  function aggFor(list, sex) {
    const key = `${sex}|${list.names.join(',')}`;
    if (!aggCache.has(key)) {
      aggCache.set(key, Promise.all(list.names.map(n => getYearCounts(n, sex, meta)))
        .then(results => {
          const out = new Array(nYears).fill(0);
          for (const counts of results) {
            if (counts) counts.forEach((v, i) => { out[i] += v; });
          }
          return out;
        }));
    }
    return aggCache.get(key);
  }

  let drawSeq = 0;
  async function draw() {
    const seq = ++drawSeq;
    const sex = store.getSex();
    const lists = selectedIds.map(id => store.getList(id)).filter(l => l && l.names.length);
    note.textContent = scale === 'relative'
      ? 'Each list is scaled to its own all-time peak (100%), so small and huge groups share the same axis — compare when each group trended, not how big it was.'
      : 'Share of all recorded births (of the selected sex) given a name from each list.';
    if (!lists.length) {
      chart.update([], { xDomain: [meta.yearMin, meta.yearMax] });
      note.textContent = 'Select at least one list above — or create one via “Manage lists”.';
      return;
    }
    const aggs = await Promise.all(lists.map(l => aggFor(l, sex)));
    if (seq !== drawSeq) return; // stale
    const series = lists.map((list, i) => {
      const shares = aggs[i].map((c, yi) => {
        const tot = totalsFor(sex, yi);
        return tot ? (c / tot) * 100 : 0;
      });
      let ys = shares;
      if (scale === 'relative') {
        const peak = Math.max(...shares);
        ys = peak ? shares.map(v => (v / peak) * 100) : shares;
      }
      return {
        id: list.id, label: list.name, color: colorFor(i),
        values: years.map((yr, yi) => ({ x: yr, y: ys[yi] })),
      };
    });
    chart.update(series, {
      yLabel: scale === 'share'
        ? `share of ${sex === 'F' ? 'girl' : sex === 'M' ? 'boy' : 'all'} births (%)`
        : '% of each list’s own peak',
      xDomain: [meta.yearMin, meta.yearMax],
      yDomain: scale === 'relative' ? [0, 105] : null,
    });
  }

  store.subscribe(() => { renderCards(); draw(); });
  renderCards();
  await draw();
}
