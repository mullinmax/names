// Regional: which names are concentrated in one place (choropleth of LQs).
import * as store from '../store.js';
import { getMeta, getRegional, getNameStateData, STATE_NAMES, CONTINENTAL } from '../data.js';
import { sexFilter, segmented, controlGroup, el, fmt, toast, addButton } from '../ui.js';
import { usMap } from '../usmap.js';

let era = 'all'; // 'all' | 'recent'
let mode = 'most';

export async function render(page) {
  page.append(
    el('h1', null, 'Where names live'),
    el('p', 'lede', 'Some names belong to the whole country; others are fiercely local. The rankings are noise-hardened: we assume every state hides counts just under the SSA’s 5-per-year reporting minimum, so only names with a genuine regional signal make the list.'),
  );

  const controls = el('div', 'controls');
  const layout = el('div', 'side-layout');
  const listCard = el('div', 'card');
  const mapCard = el('div', 'card');
  const mapTitle = el('h2', null, '');
  const mapHost = el('div');
  const mapNote = el('p', 'footnote', 'Color shows a location quotient: how popular the name is in a state relative to its national popularity. Click any name on the left — or one of your own below. Continental U.S. only (lower 48 + D.C.).');
  mapCard.append(mapTitle, mapHost, mapNote);
  layout.append(listCard, mapCard);
  page.append(controls, layout);

  const [meta, regional] = await Promise.all([getMeta(), getRegional()]);
  const map = await usMap(mapHost);

  const myNamesRow = el('div', 'chips-actions');
  mapCard.append(myNamesRow);

  controls.append(
    controlGroup('Sex', sexFilter()),
    controlGroup('Era', segmented([
      { value: 'all', label: 'All-time (1910–)' },
      { value: 'recent', label: 'Since 2000' },
    ], era, v => { era = v; drawLists(); })),
    controlGroup('Show', segmented([
      { value: 'most', label: 'Most regional' },
      { value: 'least', label: 'Least regional' },
    ], mode, v => { mode = v; drawLists(); })),
  );

  let selected = null;

  function sexKey() { const s = store.getSex(); return s === 'B' ? 'A' : s; }

  function drawLists() {
    const entries = regional[era][sexKey()][mode];
    listCard.innerHTML = '';
    listCard.append(el('h3', null, mode === 'most'
      ? 'Most regional — concentrated in one place'
      : 'Least regional — evenly spread coast to coast'));
    const ul = el('ul', 'ranklist');
    const maxTvd = entries[0] ? Math.max(...entries.map(e => e.tvd)) : 1;
    entries.slice(0, 20).forEach((e, i) => {
      const li = el('li');
      li.innerHTML = `<span class="rk">${i + 1}</span><span class="nm">${e.name}</span>
        <span class="bar"><i style="width:${(e.tvd / maxTvd) * 100}%"></i></span>
        <span class="meta">${e.topState} ×${e.lq}</span>`;
      li.append(addButton(e.name));
      li.onclick = () => { selected = e.name; showName(e.name); markSelected(ul, li); };
      ul.append(li);
    });
    listCard.append(ul, el('p', 'footnote',
      mode === 'most'
        ? '“×N” = the name is N times more common in its hotspot state than nationally, after the noise adjustment.'
        : 'These names track the national average almost everywhere.'));
    if (!selected || !entries.some(e => e.name === selected)) {
      selected = entries[0]?.name;
      if (selected) { showName(selected); markSelected(ul, ul.firstChild); }
    } else {
      showName(selected);
    }
    drawMyNames();
  }

  function markSelected(ul, li) {
    ul.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
    li?.classList.add('selected');
  }

  function drawMyNames() {
    myNamesRow.innerHTML = '';
    const names = store.getNames();
    if (!names.length) return;
    myNamesRow.append(el('span', 'control-label', 'Map one of yours:'));
    names.forEach(n => {
      const b = el('button', 'btn-quiet', n);
      b.onclick = () => { selected = n; showName(n); };
      myNamesRow.append(b);
    });
  }

  async function showName(name) {
    const sex = store.getSex();
    const data = await getNameStateData(name);
    mapTitle.textContent = name;
    if (!data) {
      toast(`${name} is too rare for reliable state-level data`);
      map.flatten();
      return;
    }
    const decLo = era === 'recent' ? 9 : 0;
    const sexes = sex === 'B' ? ['F', 'M'] : [sex];
    const counts = {}, base = {};
    let nameTotal = 0, baseTotal = 0;
    for (const st of CONTINENTAL) {
      counts[st] = 0;
      base[st] = 0;
      for (const sx of sexes) {
        const arr = data[sx]?.[st];
        if (arr) counts[st] += arr.slice(decLo).reduce((a, b) => a + b, 0);
        base[st] += meta.stateDecadeTotals[st][sx].slice(decLo).reduce((a, b) => a + b, 0);
      }
      nameTotal += counts[st];
      baseTotal += base[st];
    }
    if (!nameTotal) {
      toast(`No ${sex === 'F' ? 'girls' : sex === 'M' ? 'boys' : ''} named ${name} in this era`);
      map.flatten();
      return;
    }
    const lq = {};
    for (const st of CONTINENTAL) {
      lq[st] = base[st] ? (counts[st] / nameTotal) / (base[st] / baseTotal) : null;
    }
    map.choropleth(lq, {
      diverging: true,
      label: `${name} — local popularity vs national (${era === 'recent' ? '2000–2025' : '1910–2025'})`,
      tooltip: p => `<div class="tt-title">${STATE_NAMES[p]}</div>
        ${fmt(counts[p])} babies named ${name}<br>
        ${lq[p] ? `${lq[p].toFixed(2)}× the national rate` : 'no data'}`,
    });
  }

  store.subscribe(() => { drawLists(); });
  drawLists();
}
