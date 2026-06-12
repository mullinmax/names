// Trends: popularity of names over time. Defaults to the top 10; the user's
// active list takes over once it has names.
import * as store from '../store.js';
import { getMeta, getTop, getYearCounts, toRates } from '../data.js';
import { nameChips, sexFilter, segmented, controlGroup, colorFor, el, fmt } from '../ui.js';
import { lineChart } from '../chart.js';

let yMode = 'rate'; // 'rate' | 'count' | 'relative'

export async function render(page) {
  page.append(
    el('h1', null, 'The rise and fall of American names'),
    el('p', 'lede', 'Every name tells a story of fashion. Add names to your list to trace them across 145 years — or leave it empty to see the current top 10. Hover the chart for exact values.'),
  );

  const chips = nameChips({});
  page.append(chips);

  const controls = el('div', 'controls');
  const card = el('div', 'card');
  const chartHost = el('div');
  const note = el('p', 'footnote');
  card.append(controls, chartHost, note);
  page.append(card);

  const [meta, top] = await Promise.all([getMeta(), getTop()]);
  const chart = lineChart(chartHost, {
    yLabel: 'births per million (of selected sex)',
    tooltipFormat: v => yMode === 'rate' ? `${fmt(Math.round(v))} /M`
      : yMode === 'relative' ? `${Math.round(v)}% of its peak`
      : fmt(Math.round(v)),
  });

  controls.append(
    controlGroup('Sex', sexFilter()),
    controlGroup('Scale', segmented([
      { value: 'rate', label: 'Per million' },
      { value: 'count', label: 'Raw count' },
      { value: 'relative', label: 'Relative (% of own peak)' },
    ], yMode, v => { yMode = v; draw(); })),
  );

  function defaultNames(sex) {
    const latest = String(meta.yearMax);
    if (sex === 'F') return top.F[latest].slice(0, 10).map(d => d[0]);
    if (sex === 'M') return top.M[latest].slice(0, 10).map(d => d[0]);
    return [...top.F[latest].slice(0, 5), ...top.M[latest].slice(0, 5)].map(d => d[0]);
  }

  let drawSeq = 0;
  async function draw() {
    const seq = ++drawSeq;
    const sex = store.getSex();
    const userNames = store.getNames();
    const names = userNames.length ? userNames : defaultNames(sex);
    note.textContent = yMode === 'relative'
      ? 'Each line is scaled to that name’s own all-time peak (100%), so a rare name and a megahit share the same axis — you’re comparing when each name trended up or down, not how big it was.'
      : userNames.length
        ? `Showing your ${names.length} name${names.length > 1 ? 's' : ''}. “Per million” adjusts for the size of each year’s birth cohort, so eras are comparable.`
        : `Showing the top 10 ${sex === 'F' ? 'girls’' : sex === 'M' ? 'boys’' : ''} names of ${meta.yearMax}. Add your own names above to replace this view.`;

    const results = await Promise.all(names.map(n => getYearCounts(n, sex, meta)));
    if (seq !== drawSeq) return; // stale
    const years = d3.range(meta.yearMin, meta.yearMax + 1);
    const series = names.map((name, i) => {
      const counts = results[i];
      if (!counts) return null;
      let ys;
      if (yMode === 'count') ys = counts;
      else {
        ys = toRates(counts, sex, meta);
        if (yMode === 'relative') {
          const peak = Math.max(...ys);
          ys = peak ? ys.map(r => (r / peak) * 100) : ys;
        }
      }
      return {
        id: `${name}`, label: name, color: colorFor(i),
        values: years.map((yr, yi) => ({ x: yr, y: ys[yi] || 0 })),
      };
    }).filter(Boolean);
    chart.update(series, {
      yLabel: yMode === 'rate' ? 'births per million (of selected sex)'
        : yMode === 'relative' ? '% of each name’s own peak popularity'
        : 'births per year',
      xDomain: [meta.yearMin, meta.yearMax],
      yDomain: yMode === 'relative' ? [0, 105] : null,
    });
  }

  store.subscribe(() => draw());
  await draw();
}
