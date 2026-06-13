// Stable & Volatile: names that hold a steady slice of the population vs.
// names that boom, bust, and cycle.
import * as store from '../store.js';
import { getMeta, getStability, getYearCounts, toRates } from '../data.js';
import { sexFilter, segmented, controlGroup, colorFor, el, fmt, addButton } from '../ui.js';
import { lineChart } from '../chart.js';

let mode = 'stable'; // stable | volatile
const MODE_INFO = {
  stable: ['Steadiest names',
    'Lowest year-to-year swing in share of births across 1880–2025 — names that always claim roughly the same slice of the population.'],
  volatile: ['Most volatile names',
    'Biggest swing in share of births across 1880–2025 — names that boomed, busted, or only just arrived instead of holding steady.'],
};

export async function render(page) {
  page.append(
    el('h1', null, 'Stable &amp; volatile'),
    el('p', 'lede', 'Some names are <em>perennials</em> — they hold the same sliver of the population decade after decade. Others spike and crash. Ranked by how much a name’s share of births swings over 145 years. Click a name to chart its full history; hit + to add it to your list.'),
  );

  const controls = el('div', 'controls');
  const layout = el('div', 'side-layout');
  const listCard = el('div', 'card');
  const chartCard = el('div', 'card');
  const chartTitle = el('h2', null, '');
  const chartHost = el('div');
  chartCard.append(chartTitle, chartHost);
  layout.append(listCard, chartCard);
  page.append(controls, layout);

  const [meta, stability] = await Promise.all([getMeta(), getStability()]);
  const chart = lineChart(chartHost, {
    height: 400,
    tooltipFormat: v => `${fmt(Math.round(v))} /M`,
  });

  controls.append(
    controlGroup('Sex', sexFilter()),
    controlGroup('Show', segmented([
      { value: 'stable', label: 'Steadiest' },
      { value: 'volatile', label: 'Most volatile' },
    ], mode, v => { mode = v; draw(); })),
  );

  let selected = [];

  function entriesFor() {
    const sex = store.getSex();
    if (sex !== 'B') return stability[sex][mode].map(e => ({ ...e, sex }));
    const both = [...stability.F[mode].map(e => ({ ...e, sex: 'F' })),
                  ...stability.M[mode].map(e => ({ ...e, sex: 'M' }))];
    // steadiest = smallest CV first; most volatile = largest CV first
    both.sort((a, b) => mode === 'stable' ? a.cv - b.cv : b.cv - a.cv);
    return both;
  }

  function draw() {
    const [title, blurb] = MODE_INFO[mode];
    const entries = entriesFor().slice(0, 20);
    listCard.innerHTML = '';
    listCard.append(el('h3', null, title));
    const ul = el('ul', 'ranklist');
    // Bars: for steadiest, fuller = steadier (invert CV); for volatile, fuller = wilder.
    const cvs = entries.map(e => e.cv);
    const lo = Math.min(...cvs), hi = Math.max(...cvs);
    const span = hi - lo || 1e-9;
    entries.forEach((e, i) => {
      const li = el('li');
      const barVal = mode === 'stable' ? (hi - e.cv) / span : (e.cv - lo) / span;
      // "±NN%" reads as typical year-to-year swing; volatile names also show their peak.
      const metaTxt = mode === 'stable'
        ? `~${fmt(Math.round(e.mean))}/M · ±${Math.round(e.cv * 100)}%`
        : `peak ${e.peakYear} · ${(e.peak / Math.max(e.mean, 1e-9)).toFixed(1)}× norm`;
      li.innerHTML = `<span class="rk">${i + 1}</span>
        <span class="nm">${e.name}</span>
        <span class="bar"><i style="width:${barVal * 100}%"></i></span>
        <span class="meta">${e.sex === 'F' ? '♀' : '♂'} ${metaTxt}</span>`;
      li.append(addButton(e.name));
      li.onclick = () => toggle(e, li);
      ul.append(li);
    });
    listCard.append(ul, el('p', 'footnote', blurb));
    selected = entries.slice(0, 5);
    ul.querySelectorAll('li').forEach((li, i) => li.classList.toggle('selected', i < 5));
    plot();
  }

  function toggle(e, li) {
    const idx = selected.findIndex(s => s.name === e.name && s.sex === e.sex);
    if (idx >= 0) { selected.splice(idx, 1); li.classList.remove('selected'); }
    else if (selected.length < 8) { selected.push(e); li.classList.add('selected'); }
    plot();
  }

  let plotSeq = 0;
  async function plot() {
    const seq = ++plotSeq;
    chartTitle.textContent = selected.length
      ? `Share of births over time: ${selected.map(s => s.name).join(', ')}`
      : 'Select names on the left';
    const results = await Promise.all(selected.map(s => getYearCounts(s.name, s.sex, meta)));
    if (seq !== plotSeq) return;
    const series = selected.map((s, i) => {
      const counts = results[i];
      if (!counts) return null;
      const rates = toRates(counts, s.sex, meta);
      return {
        id: `${s.name}-${s.sex}`, label: s.name, color: colorFor(i),
        values: d3.range(meta.yearMin, meta.yearMax + 1).map(yr => ({
          x: yr, y: rates[yr - meta.yearMin] || 0,
        })),
      };
    }).filter(Boolean);
    chart.update(series, { yLabel: 'births per million', xDomain: [meta.yearMin, meta.yearMax] });
  }

  store.subscribe(() => draw());
  draw();
}
