// Big Picture: name diversity over time.
import * as store from '../store.js';
import { getMeta, getBigPicture } from '../data.js';
import { sexFilter, controlGroup, el, fmt } from '../ui.js';
import { lineChart } from '../chart.js';

export async function render(page) {
  page.append(
    el('h1', null, 'The big picture'),
    el('p', 'lede', 'Step back from individual names. America used to agree on names — in 1947, a third of all boys got a top-10 name. Today the top 10 covers less than 8%.'),
  );

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

  page.append(controls, card1, card2);

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
