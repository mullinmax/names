// Guess Who: given a name — plus anything you already know about the person
// (gender, age, birth state) — estimate the rest from 145 years of births.
import * as store from '../store.js';
import { getMeta, getNameSeries, getNameStateData, STATE_NAMES, CONTINENTAL } from '../data.js';
import { el, fmt, titleCase, toast, segmented, controlGroup } from '../ui.js';
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

function joinAnd(parts) {
  if (parts.length <= 1) return parts[0] || '';
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

// remembered across visits
let lastName = null;
const known = { sex: null, age: null, state: null };

export async function render(page) {
  page.append(
    el('h1', null, 'Guess who'),
    el('p', 'lede', 'Type a name — and fill in anything you already know about the person — and we’ll predict the rest: most likely gender, age today, and birth state, estimated from 145 years of births, weighted by who is still alive.'),
  );

  const searchCard = el('div', 'card');
  const searchRow = el('div', 'who-search');
  const input = document.createElement('input');
  input.className = 'year-input';
  input.placeholder = 'Type a name…';
  input.autocapitalize = 'words';
  const go = el('button', 'btn-quiet', 'Profile this name');
  searchRow.append(input, go);

  // optional knowns: anything filled in is taken as given, the rest predicted
  const rerun = () => { if (lastName) show(lastName); };
  const knownRow = el('div', 'who-known');
  const sexSeg = segmented([
    { value: '', label: 'Unknown' },
    { value: 'F', label: 'Female', cls: 'sex-F' },
    { value: 'M', label: 'Male', cls: 'sex-M' },
  ], known.sex || '', v => { known.sex = v || null; rerun(); });
  const ageInput = document.createElement('input');
  ageInput.type = 'number';
  ageInput.className = 'year-input who-age';
  ageInput.placeholder = 'Unknown';
  ageInput.min = 0;
  ageInput.max = 110;
  if (known.age !== null) ageInput.value = known.age;
  let ageTimer;
  ageInput.addEventListener('input', () => {
    clearTimeout(ageTimer);
    ageTimer = setTimeout(() => {
      const a = parseInt(ageInput.value, 10);
      known.age = Number.isFinite(a) && a >= 0 ? Math.min(a, 120) : null;
      rerun();
    }, 350);
  });
  const stateSel = document.createElement('select');
  stateSel.className = 'dropdown';
  stateSel.innerHTML = '<option value="">Unknown</option>' +
    Object.entries(STATE_NAMES)
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([st, nm]) => `<option value="${st}">${nm}</option>`).join('');
  if (known.state) stateSel.value = known.state;
  stateSel.onchange = () => { known.state = stateSel.value || null; rerun(); };
  knownRow.append(
    controlGroup('Gender', sexSeg),
    controlGroup('Age', ageInput),
    controlGroup('Birth state', stateSel),
  );

  const quick = el('div', 'chips-actions');
  searchCard.append(searchRow,
    el('div', 'control-label who-known-label', 'Optional — what do you already know about them?'),
    knownRow, quick);
  page.append(searchCard);

  const resultHost = el('div');
  page.append(resultHost);

  const meta = await getMeta();
  const nYears = meta.yearMax - meta.yearMin + 1;
  const nDecades = meta.decades.length;
  const decadeOf = year =>
    year < meta.decades[0] ? -1 : Math.min(nDecades - 1, Math.floor((year - meta.decades[0]) / 10));

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
    if (!(d3.sum(living.F) + d3.sum(living.M))) {
      toast(`Everyone named ${name} would be over 110 by now`);
      return;
    }

    // P(state | sex, decade) from the state x decade data (1910+)
    const stateData = await getNameStateData(name);
    if (seq !== showSeq) return;
    let decadeShares = null;
    if (stateData) {
      decadeShares = {};
      for (const sx of ['F', 'M']) {
        const totals = new Array(nDecades).fill(0);
        const rows = Array.from({ length: nDecades }, () => ({}));
        for (const [st, arr] of Object.entries(stateData[sx] || {})) {
          arr.forEach((v, d) => { if (v) { rows[d][st] = v; totals[d] += v; } });
        }
        decadeShares[sx] = rows.map((row, d) => {
          if (!totals[d]) return null;
          const r = {};
          for (const st in row) r[st] = row[st] / totals[d];
          return r;
        });
      }
    }
    const useState = !!(known.state && decadeShares);

    // condition the living estimates on what the user told us
    const filtered = useAge => {
      const out = {};
      for (const sx of ['F', 'M']) {
        out[sx] = living[sx].map((v, yi) => {
          if (!v) return 0;
          if (known.sex && known.sex !== sx) return 0;
          const year = meta.yearMin + yi;
          if (useAge && known.age !== null) {
            // someone aged N today was born N or N+1 years ago
            const by = meta.yearMax - known.age;
            if (year !== by && year !== by - 1) return 0;
          }
          if (useState) {
            const row = decadeShares[sx][decadeOf(year)];
            v *= (row && row[known.state]) || 0;
          }
          return v;
        });
      }
      return out;
    };
    const fl = filtered(true);
    const totF = d3.sum(fl.F), totM = d3.sum(fl.M);
    const totAll = totF + totM;

    resultHost.innerHTML = '';
    if (!totAll) {
      resultHost.append(el('div', 'card', `<h2>Nobody fits</h2>
        <p>No recorded living Americans named ${name} match those details —
        try clearing one of the filters above.</p>`));
      return;
    }
    const pF = totF / totAll;

    // age stats from the conditioned living distribution
    const byAge = []; // index = age
    for (let yi = 0; yi < nYears; yi++) {
      const age = meta.yearMax - (meta.yearMin + yi);
      byAge[age] = (fl.F[yi] || 0) + (fl.M[yi] || 0);
    }
    let acc = 0, median = 0, q1 = 0, q3 = 0;
    for (let age = 0; age < byAge.length; age++) {
      acc += byAge[age] || 0;
      if (!q1 && acc >= totAll * .25) q1 = age;
      if (!median && acc >= totAll * .5) median = age;
      if (!q3 && acc >= totAll * .75) { q3 = age; break; }
    }

    // birth-state posterior, given everything else we know
    let topStates = [], statePct = null;
    if (decadeShares && !known.state) {
      const scores = {};
      for (const sx of ['F', 'M']) {
        fl[sx].forEach((v, yi) => {
          if (!v) return;
          const row = decadeShares[sx][decadeOf(meta.yearMin + yi)];
          if (!row) return;
          for (const st in row) scores[st] = (scores[st] || 0) + v * row[st];
        });
      }
      const stateTotal = d3.sum(Object.values(scores));
      if (stateTotal) {
        statePct = {};
        for (const st in scores) statePct[st] = scores[st] / stateTotal;
        topStates = Object.entries(scores)
          .sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([st, v]) => ({ st, living: v, share: v / stateTotal }));
      }
    }

    /* ---- render ---- */
    const card = el('div', 'card');
    const genderWord = pF >= 0.5 ? 'female' : 'male';
    const genderPct = Math.round(Math.max(pF, 1 - pF) * 100);
    const topState = topStates[0];

    const knownBits = [];
    if (known.sex) knownBits.push(known.sex === 'F' ? 'female' : 'male');
    if (known.age !== null) knownBits.push(`${known.age} years old`);
    if (known.state) knownBits.push(`born in ${STATE_NAMES[known.state]}`);
    // "who is female, 34 years old, and born in Ohio" — but "who was born
    // in Ohio" when the state is the only thing given
    const verb = known.sex || known.age !== null ? 'is' : 'was';
    const who = `A living American named ${name}` +
      (knownBits.length ? ` who ${verb} ${joinAnd(knownBits)}` : '');
    const predBits = [];
    if (!known.sex) predBits.push(`${genderWord} (${genderPct}%)`);
    if (known.age === null) predBits.push(`about ${median} years old`);
    if (!known.state && topState) predBits.push(`born in ${STATE_NAMES[topState.st]}`);
    card.append(el('h2', null, predBits.length
      ? `${who} is most likely ${joinAnd(predBits)}.`
      : `${who} — that describes about ${fmt(Math.round(totAll))} living Americans (est.).`));

    const stats = el('div', 'stat-row');
    stats.append(
      known.sex
        ? statBlock(known.sex === 'F' ? 'Female' : 'Male', 'gender — given',
            `about ${fmt(Math.round(totAll))} living people match so far (est.)`)
        : statBlock(`${genderPct}% ${genderWord}`, 'most likely gender',
            `${fmt(Math.round(totF))} living women vs ${fmt(Math.round(totM))} living men (est.)`),
      known.age !== null
        ? statBlock(`${known.age} years old`, 'age — given',
            `born around ${meta.yearMax - known.age}`)
        : statBlock(`${median} years old`, 'median age today', `half are between ${q1} and ${q3}`),
      known.state
        ? statBlock(STATE_NAMES[known.state], 'birth state — given',
            useState ? '' : 'too rare for state-level data — not factored in')
        : (topState
            ? statBlock(STATE_NAMES[topState.st], 'most likely birth state',
                `${(topState.share * 100).toFixed(1)}% chance, given the rest`)
            : statBlock('—', 'most likely birth state', 'too rare for state-level data')),
    );
    card.append(stats);
    resultHost.append(card);

    // age distribution chart: conditioned on gender/state but not on age,
    // so a known age still shows where the person sits among their namesakes
    const cl = filtered(false);
    const clF = d3.sum(cl.F), clM = d3.sum(cl.M);
    const ageCard = el('div', 'card');
    ageCard.append(el('h2', null, `How old are the ${name}s?`));
    const ageHost = el('div');
    ageCard.append(ageHost, el('p', 'footnote',
      `Estimated number of living Americans with this name${known.sex || useState ? ', matching the details you filled in,' : ''} at each age: recorded births weighted by the chance of surviving to today. SSA coverage before the late 1930s was thinner, so the oldest ages are undercounted.`));
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
        y: cl[sx][nYears - 1 - age] || 0,
      })),
    });
    const ageSeries = [];
    if (clF) ageSeries.push(mkSeries('F', 'Women', '#c0544f'));
    if (clM) ageSeries.push(mkSeries('M', 'Men', '#46688c'));
    ageChart.update(ageSeries, { xDomain: [0, maxAge], yLabel: `living people named ${name}, by age` });

    // birth-state map (only when the state is the thing being predicted)
    if (statePct) {
      const mapCard = el('div', 'card');
      mapCard.append(el('h2', null, `Where the ${name}s were born`));
      const mapHost = el('div');
      mapCard.append(mapHost, el('p', 'footnote',
        'Estimated chance the person was born in each state, given the name and the details you filled in (continental U.S., births 1910–2025). Bigger states naturally claim bigger shares.'));
      resultHost.append(mapCard);
      const map = await usMap(mapHost);
      if (seq !== showSeq) return;
      const pct = {};
      for (const st of CONTINENTAL) pct[st] = statePct[st] ? statePct[st] * 100 : null;
      map.choropleth(pct, {
        label: `${name} — chance of being born in each state`,
        maxLabel: `${(d3.max(Object.values(pct).filter(v => v !== null)) || 0).toFixed(1)}%`,
        tooltip: p => `<div class="tt-title">${STATE_NAMES[p]}</div>
          ${pct[p] !== null ? `${pct[p].toFixed(2)}% chance a ${name} like this was born here` : 'no recorded data'}`,
      });

      const ol = el('ol', 'who-topstates');
      topStates.forEach(s => {
        ol.append(el('li', null,
          `<strong>${STATE_NAMES[s.st]}</strong> — ${(s.share * 100).toFixed(1)}% (≈${fmt(Math.round(s.living))} living)`));
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
