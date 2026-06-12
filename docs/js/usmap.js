// US choropleth + migration-trail map built on the pre-projected Albers atlas.
import { getUSTopo, FIPS_TO_POSTAL, STATE_NAMES } from './data.js';
import { showTooltip, moveTooltip, hideTooltip } from './ui.js';

const W = 975, H = 610;

export async function usMap(container, opts = {}) {
  const topo = await getUSTopo();
  // continental US only: drop Alaska ('02') and Hawaii ('15')
  const states = topojson.feature(topo, topo.objects.states).features
    .filter(f => FIPS_TO_POSTAL[f.id] && f.id !== '02' && f.id !== '15');
  const borders = topojson.mesh(topo, topo.objects.states, (a, b) => a !== b);
  const path = d3.geoPath();
  // the albers atlas is pre-projected to 975x610 matching d3.geoAlbersUsa()
  const projection = d3.geoAlbersUsa().scale(1300).translate([487.5, 305]);

  const wrap = d3.select(container).append('div').attr('class', 'map-wrap');
  const svg = wrap.append('svg').attr('viewBox', `0 0 ${W} ${H + 40}`);
  const mapG = svg.append('g');
  const trailG = svg.append('g');
  const legendG = svg.append('g').attr('class', 'map-legend')
    .attr('transform', `translate(${W / 2 - 130}, ${H + 8})`);

  let tipFn = null;

  const shapes = mapG.selectAll('path.state-shape')
    .data(states, d => d.id)
    .join('path')
    .attr('class', 'state-shape')
    .attr('d', path)
    .attr('fill', '#eee8db')
    .on('mousemove', function (event, d) {
      const postal = FIPS_TO_POSTAL[d.id];
      if (tipFn) showTooltip(tipFn(postal), event);
    })
    .on('mouseleave', hideTooltip);

  mapG.append('path')
    .attr('d', path(borders))
    .attr('fill', 'none')
    .attr('stroke', 'var(--bg)')
    .attr('stroke-width', .8);

  /**
   * Paint a choropleth. values: {postal: number|null}.
   * o: {label, diverging (center=1 LQ scale), tooltip(postal)=>html}
   */
  function choropleth(values, o = {}) {
    tipFn = o.tooltip || (p => `<div class="tt-title">${STATE_NAMES[p]}</div>${values[p] ?? '—'}`);
    const vals = Object.values(values).filter(v => v !== null && v !== undefined && isFinite(v));
    let color;
    if (o.diverging) {
      // red side spans up to the max LQ; blue ("rare here") side is capped at
      // 8x-rarer so a state with zero doesn't dwarf merely-uncommon neighbors
      const maxLog = Math.max(Math.log2(d3.max(vals) || 2), 1.2);
      const minLog = Math.min(maxLog, 3);
      // squeeze the palette so neither end reaches RdBu's darkest stops
      color = v => {
        const lg = Math.log2(Math.max(v, 1e-4));
        const t = lg >= 0 ? Math.min(1, lg / maxLog) : Math.max(-1, lg / minLog);
        return d3.interpolateRdBu(.5 - .38 * t);
      };
    } else {
      const max = d3.max(vals) || 1;
      const scale = d3.scaleSequential(d3.interpolateYlGnBu).domain([0, max]);
      color = v => scale(v);
    }
    shapes.transition().duration(650).ease(d3.easeCubicInOut)
      .attr('fill', d => {
        const v = values[FIPS_TO_POSTAL[d.id]];
        return v === null || v === undefined ? '#efeadf' : color(v);
      });
    drawLegend(o, vals, color);
    clearTrail(false);
  }

  function drawLegend(o, vals, color) {
    legendG.selectAll('*').remove();
    if (!vals.length) return;
    const w = 260, h = 10, n = 60;
    const max = d3.max(vals);
    const grad = legendG.selectAll('rect').data(d3.range(n)).join('rect')
      .attr('x', i => (i / n) * w).attr('width', w / n + 1).attr('height', h).attr('y', 6);
    if (o.diverging) {
      const maxLog = Math.max(Math.log2(max || 2), 1.2);
      const minLog = Math.min(maxLog, 3);
      grad.attr('fill', i => {
        const t = (i / n) * 2 - 1;
        return color(Math.pow(2, t < 0 ? t * minLog : t * maxLog));
      });
      legendG.append('text').attr('x', 0).attr('y', 30).text('rare here');
      legendG.append('text').attr('x', w / 2).attr('y', 30).attr('text-anchor', 'middle').text('national avg');
      legendG.append('text').attr('x', w).attr('y', 30).attr('text-anchor', 'end').text('local favorite');
    } else {
      grad.attr('fill', i => color((i / n) * max));
      legendG.append('text').attr('x', 0).attr('y', 30).text('0');
      legendG.append('text').attr('x', w).attr('y', 30).attr('text-anchor', 'end')
        .text(o.maxLabel || d3.format('.2s')(max));
    }
    if (o.label) legendG.append('text')
      .attr('x', w / 2).attr('y', -2).attr('text-anchor', 'middle')
      .attr('font-weight', 700).text(o.label);
  }

  /**
   * Draw an animated centroid trail. pts: [{decade, lat, lon}], color.
   */
  function trail(pts, { color = 'var(--accent)', label = '' } = {}) {
    clearTrail(true);
    const proj = pts
      .map(p => ({ ...p, xy: projection([p.lon, p.lat]) }))
      .filter(p => p.xy);
    if (proj.length < 2) return;

    const line = d3.line().x(p => p.xy[0]).y(p => p.xy[1]).curve(d3.curveCatmullRom.alpha(.6));
    const pathEl = trailG.append('path')
      .attr('class', 'trail-path')
      .attr('d', line(proj))
      .attr('stroke', color)
      .attr('stroke-width', 3.5)
      .attr('opacity', .9);
    const len = pathEl.node().getTotalLength();
    pathEl
      .attr('stroke-dasharray', `${len} ${len}`)
      .attr('stroke-dashoffset', len)
      .transition().duration(1400).ease(d3.easeCubicInOut)
      .attr('stroke-dashoffset', 0);

    const dots = trailG.selectAll('g.trail-dot').data(proj).join('g')
      .attr('class', 'trail-dot')
      .attr('transform', p => `translate(${p.xy[0]},${p.xy[1]})`)
      .style('opacity', 0);
    dots.append('circle')
      .attr('r', (p, i) => i === proj.length - 1 ? 7 : 4)
      .attr('fill', color)
      .attr('stroke', '#fff').attr('stroke-width', 1.6);
    dots.append('text')
      .attr('class', 'trail-dot-label')
      .attr('y', -9).attr('text-anchor', 'middle')
      .text((p, i) => (i === 0 || i === proj.length - 1) ? `${p.decade}s` : '');
    dots.transition().delay((p, i) => 100 + (i / proj.length) * 1300).duration(250)
      .style('opacity', 1);

    if (label) {
      const last = proj[proj.length - 1];
      trailG.append('text')
        .attr('class', 'trail-dot-label')
        .attr('x', last.xy[0]).attr('y', last.xy[1] + 22)
        .attr('text-anchor', 'middle')
        .attr('font-size', 13)
        .text(label)
        .style('opacity', 0)
        .transition().delay(1300).duration(300).style('opacity', 1);
    }
  }

  function clearTrail(keepMapColors) {
    trailG.selectAll('*').remove();
    if (!keepMapColors) return;
  }

  function flatten(fillColor = '#eee8db') {
    shapes.transition().duration(500).attr('fill', fillColor);
    legendG.selectAll('*').remove();
    tipFn = p => `<div class="tt-title">${STATE_NAMES[p]}</div>`;
  }

  return { choropleth, trail, clearTrail, flatten, projection, svg };
}
