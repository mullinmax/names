// Animated multi-series line chart (D3). Create once, call update() to morph.
import { showTooltip, moveTooltip, hideTooltip, fmt, fmt1 } from './ui.js';

const MARGIN = { top: 16, right: 90, bottom: 30, left: 60 };

export function lineChart(container, opts = {}) {
  const width = opts.width || 920;
  const height = opts.height || 440;
  const m = { ...MARGIN, ...(opts.margin || {}) };
  const iw = width - m.left - m.right;
  const ih = height - m.top - m.bottom;
  const dur = opts.duration ?? 700;

  const wrap = d3.select(container).append('div').attr('class', 'chart-wrap');
  const svg = wrap.append('svg').attr('viewBox', `0 0 ${width} ${height}`);
  const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

  const bandLayer = g.append('g');
  const gridLayer = g.append('g');
  const refLayer = g.append('g');
  const xAxisG = g.append('g').attr('class', 'axis').attr('transform', `translate(0,${ih})`);
  const yAxisG = g.append('g').attr('class', 'axis');
  const lineLayer = g.append('g');
  const labelLayer = g.append('g');
  const hoverRule = g.append('line')
    .attr('stroke', 'var(--faint)').attr('stroke-dasharray', '3 3')
    .attr('y1', 0).attr('y2', ih).style('opacity', 0);
  const hoverDots = g.append('g');
  const overlay = g.append('rect')
    .attr('width', iw).attr('height', ih)
    .attr('fill', 'transparent').style('cursor', 'crosshair');

  const x = d3.scaleLinear().range([0, iw]);
  const y = d3.scaleLinear().range([ih, 0]).nice();
  let series = [];
  let yLabel = opts.yLabel || '';
  const yFmt = v => (v >= 10000 ? d3.format('.2s')(v) : fmt(Math.round(v * 10) / 10));

  const yLabelText = g.append('text')
    .attr('class', 'axis')
    .attr('transform', 'rotate(-90)')
    .attr('x', -4).attr('y', -38)
    .attr('text-anchor', 'end')
    .attr('font-size', 11.5).attr('fill', 'var(--muted)');

  const lineGen = d3.line()
    .defined(d => d.y !== null && d.y !== undefined)
    .x(d => x(d.x))
    .y(d => y(d.y))
    .curve(d3.curveMonotoneX);

  function update(newSeries, o = {}) {
    series = newSeries.filter(s => s.values.some(v => v.y));
    if (o.yLabel !== undefined) yLabel = o.yLabel;
    yLabelText.text(yLabel);

    const allX = series.flatMap(s => s.values.map(v => v.x));
    const allY = series.flatMap(s => s.values.map(v => v.y || 0));
    x.domain(o.xDomain || (allX.length ? d3.extent(allX) : [1880, 2025]));
    if (o.yDomain) y.domain(o.yDomain);
    else y.domain([0, (d3.max(allY) || 1) * 1.06]).nice();

    const t = svg.transition().duration(dur).ease(d3.easeCubicInOut);

    xAxisG.transition(t).call(
      d3.axisBottom(x).ticks(Math.min(10, iw / 80)).tickFormat(d3.format('d')).tickSizeOuter(0));
    yAxisG.transition(t).call(
      d3.axisLeft(y).ticks(6).tickFormat(yFmt).tickSizeOuter(0));
    gridLayer.selectAll('line').data(y.ticks(6)).join('line')
      .attr('class', 'gridline').attr('x1', 0).attr('x2', iw)
      .transition(t)
      .attr('y1', d => y(d)).attr('y2', d => y(d));

    // annotation bands (e.g. wars)
    const bands = o.bands || [];
    bandLayer.selectAll('g.band')
      .data(bands, d => d.label)
      .join(
        enter => {
          const bg = enter.append('g').attr('class', 'band');
          bg.append('rect').attr('class', 'annotation-band')
            .attr('y', 0).attr('height', ih);
          bg.append('text').attr('class', 'annotation-text')
            .attr('y', 12).attr('text-anchor', 'middle');
          bg.style('opacity', 0).transition(t).style('opacity', 1);
          return bg;
        },
        u => u,
        exit => exit.transition(t).style('opacity', 0).remove(),
      )
      .each(function (d) {
        d3.select(this).select('rect')
          .attr('x', x(d.x0)).attr('width', Math.max(0, x(d.x1) - x(d.x0)));
        d3.select(this).select('text')
          .attr('x', (x(d.x0) + x(d.x1)) / 2).text(d.label);
      });

    // horizontal reference lines (e.g. the 50% gender midline)
    refLayer.selectAll('g.refline')
      .data(o.refLines || [], d => d.label)
      .join(
        enter => {
          const rg = enter.append('g').attr('class', 'refline');
          rg.append('line')
            .attr('x1', 0).attr('x2', iw)
            .attr('stroke', 'var(--faint)').attr('stroke-dasharray', '5 4');
          rg.append('text').attr('class', 'annotation-text')
            .attr('x', iw - 4).attr('text-anchor', 'end');
          return rg;
        },
        u => u,
        exit => exit.remove(),
      )
      .each(function (d) {
        d3.select(this).select('line')
          .transition(t).attr('y1', y(d.y)).attr('y2', y(d.y));
        d3.select(this).select('text')
          .text(d.label)
          .transition(t).attr('y', y(d.y) - 5);
      });

    // lines: morph existing, draw-in new
    lineLayer.selectAll('path.series')
      .data(series, d => d.id)
      .join(
        enter => enter.append('path')
          .attr('class', 'series')
          .attr('fill', 'none')
          .attr('stroke', d => d.color)
          .attr('stroke-width', 2.4)
          .attr('d', d => lineGen(d.values))
          .each(function () {
            const len = this.getTotalLength();
            d3.select(this)
              .attr('stroke-dasharray', `${len} ${len}`)
              .attr('stroke-dashoffset', len)
              .transition(t)
              .attr('stroke-dashoffset', 0)
              .on('end', function () { d3.select(this).attr('stroke-dasharray', null); });
          }),
        upd => upd
          .attr('stroke-dasharray', null)
          .call(sel => sel.transition(t)
            .attr('stroke', d => d.color)
            .attr('d', d => lineGen(d.values))),
        exit => exit.transition().duration(dur / 2).style('opacity', 0).remove(),
      );

    // right-edge direct labels, nudged apart
    const ends = series.map(s => {
      const lastPt = [...s.values].reverse().find(v => v.y);
      return lastPt ? { id: s.id, label: s.label, color: s.color, y: y(lastPt.y), x: x(lastPt.x) } : null;
    }).filter(Boolean).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) {
      if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    }
    // keep labels inside the plot: push the stack back up if it overflows
    const overflow = ends.length ? ends[ends.length - 1].y - (ih - 2) : 0;
    if (overflow > 0) {
      for (let i = ends.length - 1; i >= 0; i--) {
        ends[i].y = Math.min(ends[i].y - overflow, i === ends.length - 1 ? ih - 2 : ends[i + 1].y - 14);
      }
      ends.forEach(e => { e.y = Math.max(e.y, 6); });
    }
    labelLayer.selectAll('text.line-label')
      .data(ends, d => d.id)
      .join(
        enter => enter.append('text')
          .attr('class', 'line-label')
          .attr('x', d => d.x + 6).attr('y', d => d.y + 4)
          .attr('fill', d => d.color)
          .text(d => d.label)
          .style('opacity', 0)
          .call(s => s.transition(t).style('opacity', 1)),
        upd => upd.call(s => s.transition(t)
          .attr('x', d => d.x + 6).attr('y', d => d.y + 4)
          .attr('fill', d => d.color)
          .text(d => d.label)),
        exit => exit.transition().duration(200).style('opacity', 0).remove(),
      );
  }

  overlay
    .on('mousemove', function (event) {
      if (!series.length) return;
      const [mx] = d3.pointer(event);
      const xRaw = x.invert(mx);
      // snap to the nearest x that any series actually has a point at
      const xs = [...new Set(series.flatMap(s => s.values.map(v => v.x)))].sort((a, b) => a - b);
      if (!xs.length) return;
      const xv = xs.reduce((best, v) => Math.abs(v - xRaw) < Math.abs(best - xRaw) ? v : best, xs[0]);
      hoverRule.attr('x1', x(xv)).attr('x2', x(xv)).style('opacity', 1);
      const rows = series.map(s => {
        const pt = s.values.find(v => v.x === xv);
        return pt && pt.y ? { label: s.label, color: s.color, y: pt.y } : null;
      }).filter(Boolean).sort((a, b) => b.y - a.y);
      hoverDots.selectAll('circle').data(rows, d => d.label).join('circle')
        .attr('r', 3.5).attr('fill', d => d.color)
        .attr('stroke', '#fff').attr('stroke-width', 1.5)
        .attr('cx', x(xv)).attr('cy', d => y(d.y));
      const fmtv = opts.tooltipFormat || (v => fmt1(v));
      showTooltip(
        `<div class="tt-title">${xv}</div>` +
        rows.slice(0, 12).map(r =>
          `<div class="tt-row"><span><span class="sw" style="background:${r.color}"></span>${r.label}</span><span>${fmtv(r.y)}</span></div>`
        ).join('') +
        (rows.length > 12 ? `<div class="tt-row" style="color:#aaa">…and ${rows.length - 12} more</div>` : ''),
        event);
    })
    .on('mouseleave', () => {
      hoverRule.style('opacity', 0);
      hoverDots.selectAll('circle').remove();
      hideTooltip();
    });

  return { update, svg };
}

// Tiny sparkline used in cards (one-hit wonders etc.)
export function sparkline(container, values, { width = 230, height = 60, color = 'var(--accent)', peakX } = {}) {
  const svg = d3.select(container).append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('display', 'block').style('width', '100%');
  const x = d3.scaleLinear().domain(d3.extent(values, d => d.x)).range([2, width - 2]);
  const y = d3.scaleLinear().domain([0, d3.max(values, d => d.y) || 1]).range([height - 4, 6]);
  const area = d3.area().x(d => x(d.x)).y0(height - 4).y1(d => y(d.y)).curve(d3.curveMonotoneX);
  const line = d3.line().x(d => x(d.x)).y(d => y(d.y)).curve(d3.curveMonotoneX);
  svg.append('path').attr('d', area(values)).attr('fill', color).attr('opacity', .12);
  svg.append('path').attr('d', line(values)).attr('fill', 'none')
    .attr('stroke', color).attr('stroke-width', 1.8);
  if (peakX !== undefined) {
    const pv = values.find(v => v.x === peakX);
    if (pv) svg.append('circle').attr('cx', x(peakX)).attr('cy', y(pv.y))
      .attr('r', 3).attr('fill', color).attr('stroke', '#fff').attr('stroke-width', 1.2);
  }
  return svg;
}
