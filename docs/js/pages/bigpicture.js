// Big Picture: name diversity over time + letter & length fashions.
import * as store from '../store.js';
import { getMeta, getBigPicture } from '../data.js';
import { sexFilter, controlGroup, segmented, el, fmt, showTooltip, hideTooltip } from '../ui.js';
import { lineChart } from '../chart.js';

let subview = 'diversity';
let letterMode = 'last'; // 'first' | 'last'

export async function render(page) {
  page.append(
    el('h1', null, 'The big picture'),
    el('p', 'lede', 'Step back from individual names. America used to agree on names — in 1947, a third of all boys got a top-10 name. Today the top 10 covers less than 8%. And the sounds of names drift too: watch the rise of girls’ names ending in <em>a</em> and boys’ names ending in <em>n</em>.'),
  );

  const subtabs = el('div', 'subtabs');
  const divBtn = el('button', subview === 'diversity' ? 'active' : '', 'Name diversity');
  const letBtn = el('button', subview === 'letters' ? 'active' : '', 'Letters & length');
  subtabs.append(divBtn, letBtn);
  page.append(subtabs);

  const host = el('div');
  page.append(host);

  divBtn.onclick = () => { subview = 'diversity'; swap(); };
  letBtn.onclick = () => { subview = 'letters'; swap(); };
  function swap() {
    divBtn.classList.toggle('active', subview === 'diversity');
    letBtn.classList.toggle('active', subview === 'letters');
    host.innerHTML = '';
    (subview === 'diversity' ? renderDiversity : renderLetters)(host);
  }
  swap();
}

/* ---------------- diversity ---------------- */

async function renderDiversity(host) {
  const controls = el('div', 'controls');
  const card1 = el('div', 'card');
  card1.append(el('h2', null, 'How much of the country shares the most popular names?'));
  const chart1Host = el('div');
  card1.append(chart1Host, el('p', 'footnote',
    'Share of all babies (of each sex) given a name ranked in that year’s top 10, top 100, or top 1,000. The collapse since the 1960s is the “naming long tail”: parents now hunt for distinctive names.'));

  const card2 = el('div', 'card');
  card2.append(el('h2', null, 'The effective number of names in use'));
  const chart2Host = el('div');
  card2.append(chart2Host, el('p', 'footnote',
    'Inverse-Simpson diversity: “if all names were equally common, how many would there be?” A measure of how spread out naming really is.'));

  host.append(controls, card1, card2);

  const [meta, big] = await Promise.all([getMeta(), getBigPicture()]);
  const years = d3.range(meta.yearMin, meta.yearMax + 1);

  const chart1 = lineChart(chart1Host, { height: 380, tooltipFormat: v => `${v.toFixed(1)}%` });
  const chart2 = lineChart(chart2Host, { height: 320, tooltipFormat: v => fmt(Math.round(v)) });

  controls.append(controlGroup('Sex', sexFilter()));

  function draw() {
    const sex = store.getSex();
    const sexes = sex === 'B' ? ['F', 'M'] : [sex];
    const colors = { F: '#c0544f', M: '#46688c' };
    const shades = { top10: 1, top100: .65, top1000: .35 };

    const series1 = [];
    for (const sx of sexes) {
      for (const k of ['top10', 'top100', 'top1000']) {
        const base = d3.color(colors[sx]);
        const c = d3.interpolateRgb('#ffffff', base)(shades[k] * .8 + .2);
        series1.push({
          id: `${sx}-${k}`,
          label: `${k.replace('top', 'Top ')}${sexes.length > 1 ? (sx === 'F' ? ' ♀' : ' ♂') : ''}`,
          color: c,
          values: years.map((yr, yi) => ({ x: yr, y: big.diversity[sx][k][yi] * 100 })),
        });
      }
    }
    chart1.update(series1, { yLabel: 'share of births (%)', xDomain: [meta.yearMin, meta.yearMax] });

    const series2 = sexes.map(sx => ({
      id: `eff-${sx}`,
      label: sx === 'F' ? 'Girls' : 'Boys',
      color: colors[sx],
      values: years.map((yr, yi) => ({ x: yr, y: big.diversity[sx].effective[yi] })),
    }));
    chart2.update(series2, { yLabel: 'effective number of names', xDomain: [meta.yearMin, meta.yearMax] });
  }

  store.subscribe(() => draw());
  draw();
}

/* ---------------- letters ---------------- */

async function renderLetters(host) {
  const controls = el('div', 'controls');
  const card1 = el('div', 'card');
  card1.append(el('h2', null, 'Letter fashions, year by year'));
  const heatHost = el('div', 'chart-wrap');
  card1.append(heatHost, el('p', 'footnote',
    'Each row is a letter; brightness shows what share of babies’ names started or ended with it that year, relative to the letter’s own all-time peak. Hover for exact shares.'));

  const card2 = el('div', 'card');
  card2.append(el('h2', null, 'Names are getting shorter again'));
  const lenHost = el('div');
  card2.append(lenHost, el('p', 'footnote',
    'Mean length (in letters) of the name given to each baby, weighted by births.'));

  host.append(controls, card1, card2);

  const [meta, big] = await Promise.all([getMeta(), getBigPicture()]);
  const years = d3.range(meta.yearMin, meta.yearMax + 1);

  controls.append(
    controlGroup('Sex', sexFilter()),
    controlGroup('Position', segmented([
      { value: 'first', label: 'First letter' },
      { value: 'last', label: 'Last letter' },
    ], letterMode, v => { letterMode = v; drawAll(); })),
  );

  const lenChart = lineChart(lenHost, { height: 300, tooltipFormat: v => `${v.toFixed(2)} letters` });

  // -- heatmap (built once, recolored on change)
  const W = 960, H = 480, mL = 30, mT = 8, mB = 24;
  const cw = (W - mL - 8) / years.length;
  const ch = (H - mT - mB) / 26;
  const svg = d3.select(heatHost).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const g = svg.append('g');
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');

  g.selectAll('text.row').data(letters).join('text')
    .attr('class', 'row axis')
    .attr('x', mL - 8).attr('y', (d, i) => mT + i * ch + ch * .72)
    .attr('text-anchor', 'end').attr('font-size', 11).attr('fill', 'var(--muted)')
    .attr('font-weight', 600)
    .text(d => d);
  g.selectAll('text.col').data(d3.range(1880, 2030, 20)).join('text')
    .attr('class', 'col axis')
    .attr('x', d => mL + (d - meta.yearMin) * cw).attr('y', H - 6)
    .attr('font-size', 11).attr('fill', 'var(--muted)')
    .text(d => d);

  const cells = g.append('g');

  function combinedShare(yi, li) {
    const sex = store.getSex();
    if (sex !== 'B') return big.letters[sex][letterMode][yi][li];
    const tf = meta.totals.F[yi], tm = meta.totals.M[yi];
    const f = big.letters.F[letterMode][yi][li], m = big.letters.M[letterMode][yi][li];
    return tf + tm ? (f * tf + m * tm) / (tf + tm) : 0;
  }

  function drawHeat() {
    const data = [];
    const rowMax = new Array(26).fill(1e-9);
    for (let li = 0; li < 26; li++) {
      for (let yi = 0; yi < years.length; yi++) {
        const v = combinedShare(yi, li);
        rowMax[li] = Math.max(rowMax[li], v);
      }
    }
    for (let li = 0; li < 26; li++) {
      for (let yi = 0; yi < years.length; yi++) {
        const v = combinedShare(yi, li);
        data.push({ li, yi, v, rel: v / rowMax[li] });
      }
    }
    cells.selectAll('rect')
      .data(data, d => `${d.li}-${d.yi}`)
      .join('rect')
      .attr('x', d => mL + d.yi * cw)
      .attr('y', d => mT + d.li * ch)
      .attr('width', cw + .5).attr('height', ch - 1)
      .on('mousemove', (event, d) => showTooltip(
        `<div class="tt-title">${letters[d.li].toUpperCase()}— ${years[d.yi]}</div>
         ${(d.v * 100).toFixed(1)}% of names ${letterMode === 'first' ? 'start' : 'end'} with “${letters[d.li]}”`,
        event))
      .on('mouseleave', hideTooltip)
      .transition().duration(600)
      .attr('fill', d => d3.interpolateYlGnBu(.05 + d.rel * .92));
  }

  function drawLen() {
    const sex = store.getSex();
    const sexes = sex === 'B' ? ['F', 'M'] : [sex];
    const colors = { F: '#c0544f', M: '#46688c' };
    const series = sexes.map(sx => ({
      id: `len-${sx}`,
      label: sx === 'F' ? 'Girls' : 'Boys',
      color: colors[sx],
      values: years.map((yr, yi) => ({ x: yr, y: big.letters[sx].meanLength[yi] })),
    }));
    lenChart.update(series, {
      yLabel: 'mean name length (letters)',
      xDomain: [meta.yearMin, meta.yearMax],
      yDomain: [5, 7],
    });
  }

  function drawAll() { drawHeat(); drawLen(); }
  store.subscribe(() => drawAll());
  drawAll();
}
