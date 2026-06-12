// Meanings: curated thematic groups (biblical, presidential, virtue...) over time.
import * as store from '../store.js';
import { getMeta, getGroups, getYearCounts, toRates } from '../data.js';
import { sexFilter, segmented, controlGroup, colorFor, el, fmt, addButton } from '../ui.js';
import { lineChart } from '../chart.js';

const WAR_BANDS = [
  { x0: 1917, x1: 1918, label: 'WWI' },
  { x0: 1941, x1: 1945, label: 'WWII' },
  { x0: 1950, x1: 1953, label: 'Korea' },
  { x0: 1964, x1: 1973, label: 'Vietnam' },
];

let groupId = 'biblical';
let view = 'combined'; // 'combined' | 'members'
let showWars = true;

export async function render(page) {
  page.append(
    el('h1', null, 'Names with meanings'),
    el('p', 'lede', 'Naming is never neutral. Watch biblical names ebb and flow with the country’s mood, virtue names stage a 21st-century revival, and presidents lend their surnames to nurseries.'),
  );

  const [meta, groups] = await Promise.all([getMeta(), getGroups()]);

  const cards = el('div', 'group-cards');
  page.append(cards);

  const controls = el('div', 'controls');
  const card = el('div', 'card');
  const blurb = el('p', 'lede');
  const chartHost = el('div');
  const membersRow = el('div');
  card.append(blurb, controls, chartHost, membersRow);
  page.append(card);

  const chart = lineChart(chartHost, {
    yLabel: 'share of births (%)',
    tooltipFormat: v => `${v.toFixed(2)}%`,
  });

  controls.append(
    controlGroup('Sex', sexFilter()),
    controlGroup('View', segmented([
      { value: 'combined', label: 'Group total' },
      { value: 'members', label: 'Top members' },
    ], view, v => { view = v; draw(); })),
    controlGroup('Context', segmented([
      { value: 'on', label: 'War years' },
      { value: 'off', label: 'Hide' },
    ], showWars ? 'on' : 'off', v => { showWars = v === 'on'; draw(); })),
  );

  function renderCards() {
    cards.innerHTML = '';
    for (const [gid, g] of Object.entries(groups)) {
      const b = el('button', `group-card${gid === groupId ? ' active' : ''}`);
      b.innerHTML = `<div class="g-name">${g.label}</div><div class="g-count">${g.names.length} names</div>`;
      b.onclick = () => { groupId = gid; renderCards(); draw(); };
      cards.append(b);
    }
  }

  function totalsFor(sex, yi) {
    return sex === 'B' ? meta.totals.F[yi] + meta.totals.M[yi] : meta.totals[sex][yi];
  }

  let drawSeq = 0;
  async function draw() {
    const seq = ++drawSeq;
    const g = groups[groupId];
    const sex = store.getSex();
    blurb.innerHTML = `<em>${g.label}.</em> ${g.blurb}`;
    const years = d3.range(meta.yearMin, meta.yearMax + 1);
    const bands = showWars ? WAR_BANDS : [];

    if (view === 'combined') {
      const values = years.map((yr, yi) => {
        const c = sex === 'B' ? g.series.F[yi] + g.series.M[yi]
          : g.series[sex][yi];
        const tot = totalsFor(sex, yi);
        return { x: yr, y: tot ? (c / tot) * 100 : 0 };
      });
      chart.update(
        [{ id: groupId, label: g.label, color: 'var(--accent)', values }],
        { yLabel: `share of ${sex === 'F' ? 'girl' : sex === 'M' ? 'boy' : 'all'} births (%)`, bands, xDomain: [meta.yearMin, meta.yearMax] });
    } else {
      // top 8 members by all-time volume in the selected sex
      const scored = await Promise.all(g.names.map(async n => {
        const counts = await getYearCounts(n, sex, meta);
        return counts ? { n, counts, total: counts.reduce((a, b) => a + b, 0) } : null;
      }));
      if (seq !== drawSeq) return;
      const topMembers = scored.filter(Boolean).sort((a, b) => b.total - a.total).slice(0, 8);
      const series = topMembers.map((m, i) => ({
        id: m.n, label: m.n, color: colorFor(i),
        values: toRates(m.counts, sex, meta).map((r, yi) => ({ x: years[yi], y: r })),
      }));
      chart.update(series, { yLabel: 'births per million', bands, xDomain: [meta.yearMin, meta.yearMax] });
    }
    drawMembers(g);
  }

  function drawMembers(g) {
    membersRow.innerHTML = '';
    membersRow.append(el('h3', null, 'Names in this group — click + to add one to your list'));
    const wrap = el('div', 'chips-actions');
    g.names.forEach(n => {
      const chip = el('span', 'chip', n);
      chip.append(addButton(n));
      wrap.append(chip);
    });
    membersRow.append(wrap);
  }

  store.subscribe(() => draw());
  renderCards();
  await draw();
}
