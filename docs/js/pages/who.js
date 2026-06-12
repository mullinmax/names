// Guess Who: given a name, estimate the most likely gender, current age, and
// birth state of an American with that name.
import * as store from '../store.js';
import { getMeta, getNameSeries, getNameStateData, STATE_NAMES, CONTINENTAL } from '../data.js';
import { el, fmt, titleCase, toast } from '../ui.js';
import { lineChart } from '../chart.js';
import { usMap } from '../usmap.js';

// Rough probability of surviving from birth to a given age (US period life
// table, both sexes, coarse). Linearly interpolated.
const SURVIVAL = [
  [0, 1], [10, .992], [20, .986], [30, .976], [40, .961], [50, .938],
  [60, .896], [70, .808], [80, .617], [90, .302], [100, .045], [110, 0],
];
function survival(age) {
  if (age <= 0) return 1;
  for (let i = 1; i < SURVIVAL.length; i++) {
    const [a1, s1] = SURVIVAL[i];
    if (age <= a1) {
      const [a0, s0] = SURVIVAL[i - 1];
      return s0 + (s1 - s0) * (age - a0) / (a1 - a0);
    }
  }
  return 0;
}

let lastName = null; // remembered across visits

export async function render(page) {
  page.append(
    el('h1', null, 'Guess who'),
    el('p', 'lede', 'Type a name and we’ll profile the typical living American who has it: most likely gender, age today, and birth state — estimated from 145 years of births, weighted by who is still alive.'),
  );

  const searchCard = el('div', 'card');
  const searchRow = el('div', 'who-search');
  const input = document.createElement('input');
  input.className = 'year-input';
  input.placeholder = 'Type a name…';
  input.autocapitalize = 'words';
  const go = el('button', 'btn-quiet', 'Profile this name');
  searchRow.append(input, go);
  const quick = el('div', 'chips-actions');
  searchCard.append(searchRow, quick);
  page.append(searchCard);

  const resultHost = el('div');
  page.append(resultHost);

  const meta = await getMeta();
  const nYears = meta.yearMax - meta.yearMin + 1;

  function drawQuick() {
    quick.innerHTML = '';
    const names = store.getNames();
    if (!names.length) return;
    quick.append(el('span', 'control-label', 'Or one of yours:'));
    names.forEach(n => {
      const b = el('button', 'btn-quiet', n);
      b.onclick = () => show(n);
      quick.append(b);
    });
  }

  const submit = () => {
    const name = titleCase(input.value);
    if (name) show(name);
  };
  go.onclick = submit;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

  let showSeq = 0;
  async function show(name) {
    const seq = ++showSeq;
    input.value = name;
    const series = await getNameSeries(name);
    if (seq !== showSeq) return;
    if (!series) { toast(`“${name}” isn’t in the SSA database (1880–2025)`); return; }
    lastName = name;

    // living-population estimate per birth year and sex
    const living = { F: new Array(nYears).fill(0), M: new Array(nYears).fill(0) };
    for (const sx of ['F', 'M']) {
      const s = series[sx];
      if (!s) continue;
      s.counts.forEach((v, i) => {
        const year = s.start + i;
        living[sx][year - meta.yearMin] = v * survival(meta.yearMax - year);
      });
    }
    const totF = d3.sum(living.F), totM = d3.sum(living.M);
    const totAll = totF + totM;
    if (!totAll) { toast(`Everyone named ${name} would be over 110 by now`); return; }
    const pF = totF / totAll;

    // age stats from the combined living distribution
    const byAge = []; // index = age
    for (let yi = 0; yi < nYears; yi++) {
      const age = meta.yearMax - (meta.yearMin + yi);
      byAge[age] = (living.F[yi] || 0) + (living.M[yi] || 0);
    }
    let acc = 0, median = 0, q1 = 0, q3 = 0;
    for (let age = 0; age < byAge.length; age++) {
      acc += byAge[age] || 0;
      if (!q1 && acc >= totAll * .25) q1 = age;
      if (!median && acc >= totAll * .5) median = age;
      if (!q3 && acc >= totAll * .75) { q3 = age; break; }
    }

    // birth state from the state x decade data (1910+)
    const stateData = await getNameStateData(name);
    if (seq !== showSeq) return;
    let stateShares = null, topStates = [], stateTotal = 0;
    if (stateData) {
      const counts = {};
      for (const sx of ['F', 'M']) {
        for (const [st, arr] of Object.entries(stateData[sx] || {})) {
          counts[st] = (counts[st] || 0) + arr.reduce((a, b) => a + b, 0);
        }
      }
      stateTotal = d3.sum(Object.values(counts));
      if (stateTotal) {
        stateShares = Object.fromEntries(
          Object.entries(counts).map(([st, c]) => [st, c / stateTotal]));
        topStates = Object.entries(counts)
          .sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([st, c]) => ({ st, c, share: c / stateTotal }));
      }
    }

    /* ---- render ---- */
    resultHost.innerHTML = '';
    const card = el('div', 'card');
    const genderWord = pF >= 0.5 ? 'female' : 'male';
    const genderPct = Math.round(Math.max(pF, 1 - pF) * 100);
    const topState = topStates[0];
    card.append(el('h2', null,
      `A living American named ${name} is most likely ${genderWord} (${genderPct}%), about ${median} years old${topState ? `, and born in ${STATE_NAMES[topState.st]}` : ''}.`));

    const stats = el('div', 'stat-row');
    stats.append(
      statBlock(`${genderPct}% ${genderWord}`, 'most likely gender',
        `${fmt(Math.round(totF))} living women vs ${fmt(Math.round(totM))} living men (est.)`),
      statBlock(`${median} years old`, 'median age today', `half are between ${q1} and ${q3}`),
      topState
        ? statBlock(STATE_NAMES[topState.st], 'most likely birth state',
            `${(topState.share * 100).toFixed(1)}% of all ${name}s since 1910`)
        : statBlock('—', 'most likely birth state', 'too rare for state-level data'),
    );
    card.append(stats);
    resultHost.append(card);

    // age distribution chart
    const ageCard = el('div', 'card');
    ageCard.append(el('h2', null, `How old are the ${name}s?`));
    const ageHost = el('div');
    ageCard.append(ageHost, el('p', 'footnote',
      'Estimated number of living Americans with this name at each age: recorded births weighted by the chance of surviving to today. SSA coverage before the late 1930s was thinner, so the oldest ages are undercounted.'));
    resultHost.append(ageCard);
    const ageChart = lineChart(ageHost, {
      height: 320,
      yLabel: 'estimated living people',
      tooltipFormat: v => fmt(Math.round(v)),
    });
    const maxAge = Math.min(105, byAge.length - 1);
    const mkSeries = (sx, label, color) => ({
      id: sx, label, color,
      values: d3.range(0, maxAge + 1).map(age => ({
        x: age,
        y: living[sx][nYears - 1 - age] || 0,
      })),
    });
    const ageSeries = [];
    if (totF) ageSeries.push(mkSeries('F', 'Women', '#c0544f'));
    if (totM) ageSeries.push(mkSeries('M', 'Men', '#46688c'));
    ageChart.update(ageSeries, { xDomain: [0, maxAge], yLabel: `living people named ${name}, by age` });

    // birth-state map
    if (stateShares) {
      const mapCard = el('div', 'card');
      mapCard.append(el('h2', null, `Where the ${name}s were born`));
      const mapHost = el('div');
      mapCard.append(mapHost, el('p', 'footnote',
        'Share of all recorded births of this name in each state, 1910–2025 (continental U.S. shown). Bigger states naturally claim bigger shares.'));
      resultHost.append(mapCard);
      const map = await usMap(mapHost);
      if (seq !== showSeq) return;
      const pct = {};
      for (const st of CONTINENTAL) pct[st] = stateShares[st] ? stateShares[st] * 100 : null;
      map.choropleth(pct, {
        label: `${name} — share of births by state`,
        maxLabel: `${(d3.max(Object.values(pct).filter(v => v !== null)) || 0).toFixed(1)}%`,
        tooltip: p => `<div class="tt-title">${STATE_NAMES[p]}</div>
          ${pct[p] !== null ? `${pct[p].toFixed(2)}% chance a ${name} was born here` : 'no recorded data'}`,
      });

      const ol = el('ol', 'who-topstates');
      topStates.forEach(s => {
        ol.append(el('li', null,
          `<strong>${STATE_NAMES[s.st]}</strong> — ${(s.share * 100).toFixed(1)}% (${fmt(s.c)} births)`));
      });
      mapCard.append(ol);
    }
  }

  function statBlock(big, label, detail) {
    const d = el('div', 'stat-block');
    d.append(el('div', 'bignum', big), el('div', 'bignum-label', label),
      el('div', 'footnote', detail));
    return d;
  }

  store.subscribe(drawQuick);
  drawQuick();
  await show(lastName || store.getNames()[0] || 'Riley');
}
