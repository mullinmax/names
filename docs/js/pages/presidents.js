// Presidents: presidential names aligned on the year each president first took
// office and normalized, so you can see whether taking office boosted or sank
// the name.
import * as store from '../store.js';
import { getMeta, getYearCounts, toRates } from '../data.js';
import { segmented, controlGroup, colorFor, el, fmt1, addButton } from '../ui.js';
import { lineChart } from '../chart.js';

const SPAN_BEFORE = 20, SPAN_AFTER = 25;

// Distinctive given names / surnames-as-given-names, with the year the
// president first took office. Common names like John or William would mostly
// measure the name, not the president, so they're left out.
const ENTRIES = [
  { name: 'Garfield', president: 'James A. Garfield', office: 1881 },
  { name: 'Chester', president: 'Chester A. Arthur', office: 1881 },
  { name: 'Grover', president: 'Grover Cleveland', office: 1885 },
  { name: 'Cleveland', president: 'Grover Cleveland', office: 1885 },
  { name: 'Harrison', president: 'Benjamin Harrison', office: 1889 },
  { name: 'McKinley', president: 'William McKinley', office: 1897 },
  { name: 'Theodore', president: 'Theodore Roosevelt', office: 1901 },
  { name: 'Roosevelt', president: 'Theodore Roosevelt', office: 1901 },
  { name: 'Taft', president: 'William H. Taft', office: 1909 },
  { name: 'Woodrow', president: 'Woodrow Wilson', office: 1913 },
  { name: 'Wilson', president: 'Woodrow Wilson', office: 1913 },
  { name: 'Harding', president: 'Warren G. Harding', office: 1921 },
  { name: 'Calvin', president: 'Calvin Coolidge', office: 1923 },
  { name: 'Coolidge', president: 'Calvin Coolidge', office: 1923 },
  { name: 'Herbert', president: 'Herbert Hoover', office: 1929 },
  { name: 'Hoover', president: 'Herbert Hoover', office: 1929 },
  { name: 'Franklin', president: 'Franklin D. Roosevelt', office: 1933 },
  { name: 'Truman', president: 'Harry S. Truman', office: 1945 },
  { name: 'Dwight', president: 'Dwight D. Eisenhower', office: 1953 },
  { name: 'Kennedy', president: 'John F. Kennedy', office: 1961 },
  { name: 'Lyndon', president: 'Lyndon B. Johnson', office: 1963 },
  { name: 'Nixon', president: 'Richard Nixon', office: 1969 },
  { name: 'Gerald', president: 'Gerald Ford', office: 1974 },
  { name: 'Carter', president: 'Jimmy Carter', office: 1977 },
  { name: 'Ronald', president: 'Ronald Reagan', office: 1981 },
  { name: 'Reagan', president: 'Ronald Reagan', office: 1981 },
  { name: 'Clinton', president: 'Bill Clinton', office: 1993 },
  { name: 'Barack', president: 'Barack Obama', office: 2009 },
  { name: 'Donald', president: 'Donald Trump', office: 2017 },
];

let mode = 'baseline'; // 'baseline' | 'peak'
let selected = ['Theodore', 'Woodrow', 'Calvin', 'Franklin', 'Dwight', 'Lyndon', 'Barack'];

export async function render(page) {
  page.append(
    el('h1', null, 'The presidential bump'),
    el('p', 'lede', 'Every line is a presidential name, shifted so that <em>year 0 is the year that president first took office</em> and normalized so rare and common names share one axis. Lines climbing after year 0 are presidents who sent their name into the nursery; lines collapsing are presidents parents wanted to forget.'),
  );

  const controls = el('div', 'controls');
  const layout = el('div', 'side-layout');
  const listCard = el('div', 'card');
  const chartCard = el('div', 'card');
  const chartHost = el('div');
  const note = el('p', 'footnote');
  chartCard.append(chartHost, note);
  layout.append(listCard, chartCard);
  page.append(controls, layout);

  const meta = await getMeta();
  const xFmt = v => v === 0 ? 'took office' : d3.format('+d')(v);
  const chart = lineChart(chartHost, {
    height: 460,
    tooltipFormat: v => mode === 'baseline'
      ? `${fmt1(v)}× pre-office level`
      : `${Math.round(v)}% of peak`,
  });

  controls.append(controlGroup('Normalize', segmented([
    { value: 'baseline', label: 'vs the decade before office' },
    { value: 'peak', label: '% of own peak' },
  ], mode, v => { mode = v; draw(); })));

  function drawList() {
    listCard.innerHTML = '';
    listCard.append(el('h3', null, 'Presidential names — pick up to 8'));
    const ul = el('ul', 'ranklist');
    for (const e of ENTRIES) {
      const li = el('li');
      li.innerHTML = `<span class="nm">${e.name}</span>
        <span class="meta">${e.president}, ${e.office}</span>`;
      li.append(addButton(e.name));
      li.classList.toggle('selected', selected.includes(e.name));
      li.onclick = () => {
        if (selected.includes(e.name)) selected = selected.filter(n => n !== e.name);
        else if (selected.length < 8) selected = [...selected, e.name];
        drawList();
        draw();
      };
      ul.append(li);
    }
    listCard.append(ul, el('p', 'footnote',
      'Listed by the year each president first took office. Names too common to attribute (John, William, George…) are omitted.'));
  }

  let drawSeq = 0;
  async function draw() {
    const seq = ++drawSeq;
    const entries = ENTRIES.filter(e => selected.includes(e.name));
    note.textContent = mode === 'baseline'
      ? 'Each line is the name’s popularity relative to its average over the 10 years before the inauguration (1× = no change). Hover for exact multiples; both sexes combined.'
      : 'Each line is scaled to the name’s own peak within the ±25-year window, so you compare shapes, not sizes. Both sexes combined.';

    const results = await Promise.all(entries.map(e => getYearCounts(e.name, 'B', meta)));
    if (seq !== drawSeq) return; // stale
    const series = entries.map((e, i) => {
      const counts = results[i];
      if (!counts) return null;
      const rates = toRates(counts, 'B', meta);
      const yr0 = Math.max(meta.yearMin, e.office - SPAN_BEFORE);
      const yr1 = Math.min(meta.yearMax, e.office + SPAN_AFTER);
      const window = d3.range(yr0, yr1 + 1).map(yr => ({ yr, r: rates[yr - meta.yearMin] || 0 }));
      let norm;
      if (mode === 'baseline') {
        const pre = window.filter(d => d.yr >= e.office - 10 && d.yr < e.office).map(d => d.r);
        const baseline = Math.max(pre.length ? d3.mean(pre) : 0, 0.5); // floor: ½ per million
        norm = r => r / baseline;
      } else {
        const peak = Math.max(...window.map(d => d.r));
        norm = r => peak ? (r / peak) * 100 : 0;
      }
      return {
        id: e.name, label: `${e.name} ’${String(e.office).slice(2)}`, color: colorFor(i),
        values: window.map(d => ({ x: d.yr - e.office, y: norm(d.r) })),
      };
    }).filter(Boolean);

    chart.update(series, {
      yLabel: mode === 'baseline'
        ? 'popularity ÷ pre-office average (×)'
        : '% of the name’s own peak',
      xDomain: [-SPAN_BEFORE, SPAN_AFTER],
      yDomain: mode === 'peak' ? [0, 105] : null,
      xTickFormat: xFmt,
      bands: [{ x0: 0, x1: 1, label: 'takes office' }],
      refLines: mode === 'baseline' ? [{ y: 1, label: '1× — pre-office level' }] : [],
    });
  }

  store.subscribe(() => draw());
  drawList();
  await draw();
}
