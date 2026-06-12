// Decade signatures: the names most distinctively "of" each decade.
import * as store from '../store.js';
import { getMeta, getDecades, getYearCounts, toRates } from '../data.js';
import { sexFilter, controlGroup, colorFor, el, fmt, addButton } from '../ui.js';
import { lineChart } from '../chart.js';

let decade = 1980;

export async function render(page) {
  page.append(
    el('h1', null, 'Signature names of every decade'),
    el('p', 'lede', 'Not the most <em>common</em> names — the most <em>distinctive</em>. These are the names whose popularity was most concentrated in a single decade relative to their all-time average. The higher the ratio, the more a name screams its era.'),
  );

  const strip = el('div', 'decade-strip');
  page.append(strip);

  const controls = el('div', 'controls');
  const layout = el('div', 'side-layout');
  const listCard = el('div', 'card');
  const chartCard = el('div', 'card');
  const chartTitle = el('h2', null, '');
  const chartHost = el('div');
  chartCard.append(chartTitle, chartHost);
  layout.append(listCard, chartCard);
  page.append(controls, layout);

  const [meta, decades] = await Promise.all([getMeta(), getDecades()]);
  const chart = lineChart(chartHost, {
    height: 400,
    tooltipFormat: v => `${fmt(Math.round(v))} /M`,
  });

  controls.append(controlGroup('Sex', sexFilter()));

  function drawStrip() {
    strip.innerHTML = '';
    for (let d = 1880; d <= 2020; d += 10) {
      const b = el('button', d === decade ? 'active' : '', `${d}s`);
      b.onclick = () => { decade = d; drawStrip(); };
      strip.append(b);
    }
    drawList();
  }

  let selected = [];

  function entriesFor() {
    const sex = store.getSex();
    if (sex !== 'B') return decades[sex][String(decade)].map(e => ({ ...e, sex }));
    const both = [
      ...decades.F[String(decade)].map(e => ({ ...e, sex: 'F' })),
      ...decades.M[String(decade)].map(e => ({ ...e, sex: 'M' })),
    ];
    return both.sort((a, b) => b.ratio - a.ratio);
  }

  function drawList() {
    const entries = entriesFor().slice(0, 18);
    listCard.innerHTML = '';
    listCard.append(el('h3', null, `Most ${decade}s names ever`));
    const ul = el('ul', 'ranklist');
    const maxR = entries[0]?.ratio || 1;
    entries.forEach((e, i) => {
      const li = el('li');
      li.innerHTML = `<span class="rk">${i + 1}</span>
        <span class="nm">${e.name}</span>
        <span class="bar"><i style="width:${(e.ratio / maxR) * 100}%"></i></span>
        <span class="meta">${e.sex === 'F' ? '♀' : '♂'} ${e.ratio}×</span>`;
      li.append(addButton(e.name));
      li.onclick = () => toggle(e, li);
      ul.append(li);
    });
    listCard.append(ul, el('p', 'footnote',
      `“N×” = the name was N times more popular in the ${decade}s than across all of 1880–2025.`));
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
      ? `Life stories: ${selected.map(s => s.name).join(', ')}`
      : 'Select names on the left';
    const results = await Promise.all(selected.map(s => getYearCounts(s.name, s.sex, meta)));
    if (seq !== plotSeq) return;
    const years = d3.range(meta.yearMin, meta.yearMax + 1);
    const series = selected.map((s, i) => {
      if (!results[i]) return null;
      const rates = toRates(results[i], s.sex, meta);
      return {
        id: `${s.name}-${s.sex}`, label: s.name, color: colorFor(i),
        values: years.map((yr, yi) => ({ x: yr, y: rates[yi] || 0 })),
      };
    }).filter(Boolean);
    chart.update(series, {
      yLabel: 'births per million',
      xDomain: [meta.yearMin, meta.yearMax],
      bands: [{ x0: decade, x1: Math.min(decade + 10, meta.yearMax), label: `the ${decade}s` }],
    });
  }

  store.subscribe(() => drawList());
  drawStrip();
}
