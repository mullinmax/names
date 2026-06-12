// One-hit wonders: names that spiked and vanished, usually thanks to pop culture.
import * as store from '../store.js';
import { getWonders } from '../data.js';
import { sexFilter, controlGroup, segmented, el, fmt, addButton } from '../ui.js';
import { sparkline } from '../chart.js';

let sort = 'spike';

export async function render(page) {
  page.append(
    el('h1', null, 'One-hit wonders'),
    el('p', 'lede', 'A TV premiere, a chart-topping single, a miniseries — and suddenly thousands of newborns share a name that barely existed the year before. Each card shows the spike, its peak year, and (where we know it) the likely culprit.'),
  );

  const controls = el('div', 'controls');
  const grid = el('div', 'wonder-grid');
  page.append(controls, grid);

  const wonders = await getWonders();

  controls.append(
    controlGroup('Sex', sexFilter()),
    controlGroup('Sort', segmented([
      { value: 'spike', label: 'Sharpest spike' },
      { value: 'peakYear', label: 'By year' },
      { value: 'peakCount', label: 'Biggest peak' },
    ], sort, v => { sort = v; draw(); })),
  );

  function draw() {
    const sex = store.getSex();
    let list = wonders.filter(w => sex === 'B' || w.sex === sex);
    list = [...list].sort((a, b) =>
      sort === 'peakYear' ? a.peakYear - b.peakYear : b[sort] - a[sort]);

    grid.innerHTML = '';
    list.slice(0, 48).forEach((w, i) => {
      const card = el('div', 'wonder-card');
      const head = el('div', 'w-head');
      const nameEl = el('span', 'w-name', w.name);
      nameEl.append(addButton(w.name));
      head.append(nameEl, el('span', 'w-year', String(w.peakYear)));
      card.append(head);
      card.append(el('div', 'w-note', w.note ||
        `${fmt(w.peakCount)} ${w.sex === 'F' ? 'girls' : 'boys'} at peak — ${w.spike}× its usual level`));
      const spark = el('div');
      card.append(spark);
      const start = w.series[0];
      const values = w.series.slice(1).map((v, j) => ({ x: start + j, y: v }));
      sparkline(spark, values, {
        color: w.sex === 'F' ? '#c0544f' : '#46688c',
        peakX: w.peakYear,
      });
      card.style.opacity = 0;
      card.style.transform = 'translateY(8px)';
      grid.append(card);
      setTimeout(() => {
        card.style.transition = 'opacity .4s, transform .4s';
        card.style.opacity = 1;
        card.style.transform = 'none';
      }, Math.min(i * 30, 600));
    });
  }

  store.subscribe(() => draw());
  draw();
}
