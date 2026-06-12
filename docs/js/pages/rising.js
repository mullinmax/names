// Up & Coming: names accelerating (or collapsing) right now.
import * as store from '../store.js';
import { getMeta, getRising, getYearCounts, toRates } from '../data.js';
import { sexFilter, segmented, controlGroup, colorFor, el, fmt, addButton } from '../ui.js';
import { lineChart } from '../chart.js';

let mode = 'rising'; // rising | surging | falling
const MODE_INFO = {
  rising: ['Breakout names', 'Fastest relative growth: the last 3 years vs the 6 before. Small names catching fire.', '× growth'],
  surging: ['Surging names', 'Biggest absolute gains in births per million — established names on a steep climb.', '+ per million'],
  falling: ['Fading fast', 'Names that have lost the most of their recent peak popularity.', 'of peak left'],
};

export async function render(page) {
  page.append(
    el('h1', null, 'Up &amp; coming (and down &amp; going)'),
    el('p', 'lede', 'The maternity-ward leaderboard of the near future. Click a name to chart its last 25 years; hit + to add it to your list.'),
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

  const [meta, rising] = await Promise.all([getMeta(), getRising()]);
  const chart = lineChart(chartHost, {
    height: 400,
    tooltipFormat: v => `${fmt(Math.round(v))} /M`,
  });

  controls.append(
    controlGroup('Sex', sexFilter()),
    controlGroup('Show', segmented([
      { value: 'rising', label: 'Breakouts' },
      { value: 'surging', label: 'Surging' },
      { value: 'falling', label: 'Fading' },
    ], mode, v => { mode = v; draw(); })),
  );

  let selected = [];

  function entriesFor() {
    const sex = store.getSex();
    if (sex !== 'B') return rising[sex][mode].map(e => ({ ...e, sex }));
    const both = [...rising.F[mode].map(e => ({ ...e, sex: 'F' })),
                  ...rising.M[mode].map(e => ({ ...e, sex: 'M' }))];
    both.sort((a, b) => mode === 'falling' ? a.growth - b.growth : b.growth - a.growth);
    return both;
  }

  function draw() {
    const [title, blurb, unit] = MODE_INFO[mode];
    const entries = entriesFor().slice(0, 20);
    listCard.innerHTML = '';
    listCard.append(el('h3', null, title));
    const ul = el('ul', 'ranklist');
    const maxG = Math.max(...entries.map(e => mode === 'falling' ? 1 - e.growth : e.growth), 1e-9);
    entries.forEach((e, i) => {
      const li = el('li');
      const metaTxt = mode === 'rising' ? `${e.growth}×`
        : mode === 'surging' ? `+${fmt(Math.round(e.growth))}/M`
        : `${Math.round(e.growth * 100)}% left`;
      const barVal = mode === 'falling' ? 1 - e.growth : e.growth;
      li.innerHTML = `<span class="rk">${i + 1}</span>
        <span class="nm">${e.name}</span>
        <span class="bar"><i style="width:${(barVal / maxG) * 100}%"></i></span>
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
      ? `The last 25 years: ${selected.map(s => s.name).join(', ')}`
      : 'Select names on the left';
    const y0 = meta.yearMax - 25;
    const results = await Promise.all(selected.map(s => getYearCounts(s.name, s.sex, meta)));
    if (seq !== plotSeq) return;
    const series = selected.map((s, i) => {
      const counts = results[i];
      if (!counts) return null;
      const rates = toRates(counts, s.sex, meta);
      return {
        id: `${s.name}-${s.sex}`, label: s.name, color: colorFor(i),
        values: d3.range(y0, meta.yearMax + 1).map(yr => ({
          x: yr, y: rates[yr - meta.yearMin] || 0,
        })),
      };
    }).filter(Boolean);
    chart.update(series, { yLabel: 'births per million', xDomain: [y0, meta.yearMax] });
  }

  store.subscribe(() => draw());
  draw();
}
