// Gender Flips: names that crossed (or straddle) the boy–girl line.
import * as store from '../store.js';
import { getMeta, getGender, getNameSeries } from '../data.js';
import { segmented, controlGroup, colorFor, el, listPicker, toast } from '../ui.js';
import { lineChart } from '../chart.js';

let category = 'toF';
const CATS = {
  toF: ['Boy → Girl', e => e.delta > 0.25 && e.now > 0.6],
  toM: ['Girl → Boy', e => e.delta < -0.25 && e.now < 0.4],
  unisex: ['True unisex', e => Math.abs(e.now - 0.5) < 0.18 && e.total > 20000],
};

export async function render(page) {
  page.append(
    el('h1', null, 'When boys’ names become girls’ names'),
    el('p', 'lede', 'Leslie, Ashley, Madison — the traffic across the gender line runs mostly one way. The chart shows the share of each name’s babies who were girls, decade by decade. Above the dashed line, it’s a girls’ name.'),
  );

  page.append(listPicker({ hint: 'Your list is charted too — any name that has been given to both sexes will appear.' }));

  const controls = el('div', 'controls');
  const layout = el('div', 'side-layout');
  const listCard = el('div', 'card');
  const chartCard = el('div', 'card');
  const chartHost = el('div');
  chartCard.append(chartHost);
  layout.append(listCard, chartCard);
  page.append(controls, layout);

  const [meta, gender] = await Promise.all([getMeta(), getGender()]);
  const chart = lineChart(chartHost, {
    height: 430,
    yLabel: '% girls',
    tooltipFormat: v => `${Math.round(v)}% girls`,
  });

  // dashed 50% reference line drawn once
  controls.append(controlGroup('Category', segmented(
    Object.entries(CATS).map(([value, [label]]) => ({ value, label })),
    category, v => { category = v; drawList(); })));

  let selected = [];

  function drawList() {
    const entries = gender.names.filter(CATS[category][1]).slice(0, 18);
    listCard.innerHTML = '';
    listCard.append(el('h3', null, CATS[category][0]));
    const ul = el('ul', 'ranklist');
    entries.forEach((e, i) => {
      const li = el('li');
      li.innerHTML = `<span class="rk">${i + 1}</span>
        <span class="nm">${e.name}</span>
        <span class="meta">${Math.round(e.start * 100)}% → ${Math.round(e.now * 100)}% girls</span>`;
      li.onclick = () => toggle(e.name, li);
      ul.append(li);
    });
    listCard.append(ul, el('p', 'footnote',
      'Sorted by the size of the shift. Click to add or remove a line (up to 8).'));
    selected = entries.slice(0, 4).map(e => e.name);
    ul.querySelectorAll('li').forEach((li, i) => li.classList.toggle('selected', i < 4));
    plot();
  }

  function toggle(name, li) {
    const idx = selected.indexOf(name);
    if (idx >= 0) { selected.splice(idx, 1); li.classList.remove('selected'); }
    else if (selected.length < 8) { selected.push(name); li.classList.add('selected'); }
    plot();
  }

  // % girls per decade computed straight from national series.
  async function profileFor(name) {
    const s = await getNameSeries(name);
    if (!s || !s.F || !s.M) return null;
    const get = (sx, year) => {
      const ser = s[sx];
      if (!ser) return 0;
      const i = year - ser.start;
      return i >= 0 && i < ser.counts.length ? ser.counts[i] : 0;
    };
    const pts = [];
    for (let d = 1880; d <= 2020; d += 10) {
      let f = 0, m = 0;
      for (let yr = d; yr < d + 10 && yr <= meta.yearMax; yr++) {
        f += get('F', yr); m += get('M', yr);
      }
      pts.push({ x: d + 5, y: f + m >= 100 ? (f / (f + m)) * 100 : null });
    }
    return pts;
  }

  let plotSeq = 0;
  async function plot() {
    const seq = ++plotSeq;
    const names = [...new Set([...selected, ...store.getNames()])].slice(0, 12);
    const profiles = await Promise.all(names.map(profileFor));
    if (seq !== plotSeq) return;
    const series = names.map((n, i) => profiles[i] && {
      id: n, label: n, color: colorFor(i), values: profiles[i],
    }).filter(Boolean);
    const skipped = names.filter((n, i) => !profiles[i] && store.getNames().includes(n));
    if (skipped.length) toast(`${skipped.join(', ')}: only ever one sex — nothing to flip`);
    chart.update(series, {
      xDomain: [1880, 2030],
      yDomain: [0, 100],
      refLines: [{ y: 50, label: '50% — the gender line' }],
      yEndLabels: [
        { pos: 'top', text: '♀ all girls', color: 'var(--girl)' },
        { pos: 'bottom', text: '♂ all boys', color: 'var(--boy)' },
      ],
    });
  }

  store.subscribe(() => plot());
  drawList();
}
