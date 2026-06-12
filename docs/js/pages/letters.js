// Letters & Length: how the sounds and sizes of names drift over time.
// One small chart per letter (each on its own scale) replaces the old heatmap.
import * as store from '../store.js';
import { getMeta, getBigPicture } from '../data.js';
import { sexFilter, controlGroup, segmented, el } from '../ui.js';
import { lineChart, sparkline } from '../chart.js';

let letterMode = 'last'; // 'first' | 'last'

const SEX_COLOR = { F: '#c0544f', M: '#46688c', B: '#7a5d92' };

export async function render(page) {
  page.append(
    el('h1', null, 'Letters &amp; length'),
    el('p', 'lede', 'The sounds of names drift: girls’ names ending in <em>a</em> surged, boys’ names ending in <em>n</em> took over the 2000s. Each tile below charts one letter on its own scale — the dot marks its all-time peak — so you can read every letter’s rise and fall at a glance.'),
  );

  const controls = el('div', 'controls');
  const card1 = el('div', 'card');
  const gridTitle = el('h2', null, '');
  const grid = el('div', 'letter-grid');
  card1.append(gridTitle, grid, el('p', 'footnote',
    'Share of babies whose name starts/ends with each letter, 1880–2025. Every tile has its own vertical scale so even rare letters show their movement; the labels give the real shares at the peak and today.'));

  const card2 = el('div', 'card');
  card2.append(el('h2', null, 'Names are getting shorter again'));
  const lenHost = el('div');
  card2.append(lenHost, el('p', 'footnote',
    'Mean length (in letters) of the name given to each baby, weighted by births.'));

  page.append(controls, card1, card2);

  const [meta, big] = await Promise.all([getMeta(), getBigPicture()]);
  const years = d3.range(meta.yearMin, meta.yearMax + 1);
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');

  controls.append(
    controlGroup('Sex', sexFilter()),
    controlGroup('Position', segmented([
      { value: 'first', label: 'First letter' },
      { value: 'last', label: 'Last letter' },
    ], letterMode, v => { letterMode = v; drawAll(); })),
  );

  const lenChart = lineChart(lenHost, { height: 300, tooltipFormat: v => `${v.toFixed(2)} letters` });

  function combinedShare(yi, li) {
    const sex = store.getSex();
    if (sex !== 'B') return big.letters[sex][letterMode][yi][li];
    const tf = meta.totals.F[yi], tm = meta.totals.M[yi];
    const f = big.letters.F[letterMode][yi][li], m = big.letters.M[letterMode][yi][li];
    return tf + tm ? (f * tf + m * tm) / (tf + tm) : 0;
  }

  function drawGrid() {
    const sex = store.getSex();
    const color = SEX_COLOR[sex];
    gridTitle.textContent = letterMode === 'first'
      ? 'What share of names start with…'
      : 'What share of names end with…';
    grid.innerHTML = '';
    for (let li = 0; li < 26; li++) {
      const values = years.map((yr, yi) => ({ x: yr, y: combinedShare(yi, li) * 100 }));
      const peak = values.reduce((a, b) => (b.y > a.y ? b : a), values[0]);
      const now = values[values.length - 1];
      const tile = el('div', 'letter-card');
      const head = el('div', 'lc-head');
      head.append(
        el('span', 'lc-letter', letters[li].toUpperCase()),
        el('span', 'lc-now', `now ${fmtPct(now.y)}`),
      );
      const spark = el('div');
      tile.append(head, spark,
        el('div', 'lc-meta', `peak ${fmtPct(peak.y)} in ${peak.x}`));
      sparkline(spark, values, { width: 200, height: 52, color, peakX: peak.x });
      grid.append(tile);
    }
  }

  const fmtPct = v => v >= 1 ? `${v.toFixed(1)}%` : `${v.toFixed(2)}%`;

  function drawLen() {
    const sex = store.getSex();
    const sexes = sex === 'B' ? ['F', 'M'] : [sex];
    const series = sexes.map(sx => ({
      id: `len-${sx}`,
      label: sx === 'F' ? 'Girls' : 'Boys',
      color: SEX_COLOR[sx],
      values: years.map((yr, yi) => ({ x: yr, y: big.letters[sx].meanLength[yi] })),
    }));
    lenChart.update(series, {
      yLabel: 'mean name length (letters)',
      xDomain: [meta.yearMin, meta.yearMax],
      yDomain: [5, 7],
    });
  }

  function drawAll() { drawGrid(); drawLen(); }
  store.subscribe(() => drawAll());
  drawAll();
}
