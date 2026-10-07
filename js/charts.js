/*
 * Chart forms, all single-series, all plain DOM/SVG.
 *
 * Single series means one colour and no legend — the card title names what is
 * being plotted. Bars carry magnitude from a zero baseline; the line chart
 * carries change over time. Grid and axes are recessive hairlines, values are
 * labelled in text ink rather than in the series colour, and every point has a
 * hover tooltip.
 */
(function () {
  'use strict';

  var el = UI.el;

  /* ---- horizontal bars ------------------------------------------------
     rows: { label, value, display, title, href }
     Bars are anchored to the left baseline at zero with a rounded data-end,
     separated by a gap of surface rather than a border.
     -------------------------------------------------------------------- */
  function bars(options) {
    var rows = options.rows || [];
    if (!rows.length) return UI.empty(options.empty || 'Nothing to chart yet.');

    var peak = rows.reduce(function (max, row) {
      return Math.max(max, row.value || 0);
    }, 0) || 1;

    return el('div', { class: 'dist', role: 'list' }, rows.map(function (row) {
      var label = row.href
        ? el('a', { class: 'dist-band dist-link', href: row.href, text: row.label })
        : el('span', { class: 'dist-band', text: row.label });

      return el('div', {
        class: 'dist-row' + (options.wideLabel ? ' dist-row-wide' : ''),
        role: 'listitem',
        title: row.title || (row.label + ': ' + (row.display || row.value)),
      }, [
        label,
        el('span', { class: 'dist-track' },
          el('span', {
            class: 'dist-bar',
            style: 'width:' + Math.max(0, (row.value || 0) / peak) * 100 + '%',
          })),
        el('span', { class: 'dist-count', text: String(row.display != null ? row.display : row.value) }),
      ]);
    }));
  }

  /* ---- diverging bars -------------------------------------------------
     For signed values, where the sign is the point. Bars grow out from a
     centre rule — right and blue for positive, left and red for negative —
     and every bar is direct-labelled, so the sign never rests on colour
     alone. Both poles are validated against the light and dark surfaces.
     -------------------------------------------------------------------- */
  function diverging(options) {
    var rows = options.rows || [];
    if (!rows.length) return UI.empty(options.empty || 'Nothing to chart yet.');

    var widest = rows.reduce(function (max, row) {
      return Math.max(max, Math.abs(row.value || 0));
    }, 0) || 1;

    return el('div', { class: 'div-chart', role: 'list' }, rows.map(function (row) {
      var value = row.value || 0;
      var extent = Math.abs(value) / widest * 50;
      var bar = el('span', {
        class: 'div-bar ' + (value < 0 ? 'is-neg' : 'is-pos'),
        style: value < 0
          ? 'right:50%;width:' + extent + '%'
          : 'left:50%;width:' + extent + '%',
      });

      var label = row.href
        ? el('a', { class: 'dist-band dist-link', href: row.href, text: row.label })
        : el('span', { class: 'dist-band', text: row.label });

      return el('div', { class: 'div-row', role: 'listitem', title: row.title || '' }, [
        label,
        el('span', { class: 'div-track' }, [el('span', { class: 'div-axis' }), bar]),
        el('span', {
          class: 'div-value',
          text: row.display != null ? row.display : (value > 0 ? '+' : '') + value,
        }),
      ]);
    }));
  }

  /* ---- line chart -----------------------------------------------------
     points: { label, value, caption }
     Redraws at the container's real pixel width so the labels stay legible
     instead of being scaled by a viewBox.
     -------------------------------------------------------------------- */
  function line(options) {
    var points = (options.points || []).filter(function (p) {
      return p.value != null && isFinite(p.value);
    });

    if (!points.length) {
      return el('div', { class: 'chart' }, UI.empty(options.empty || 'No data to chart yet.'));
    }
    return responsive(function (width, tip) {
      return draw(width, points, options, tip);
    });
  }

  /* ---- columns ---------------------------------------------------------
     points: { label, axis, value, caption } — one bar per point, in order,
     rising from a zero baseline with a rounded data-end. An optional
     reference { value, label } is a dotted rule across the bars, and
     colours them by which side of it they finish on: the diverging blue
     for at or above, the diverging red for below. Where a bar ends against
     the rule says the same thing, so colour is never the only signal, and a
     small legend names the two.
     -------------------------------------------------------------------- */
  function columns(options) {
    var points = (options.points || []).filter(function (p) {
      return p.value != null && isFinite(p.value);
    });
    if (!points.length) {
      return el('div', { class: 'chart' }, UI.empty(options.empty || 'No data to chart yet.'));
    }
    var chart = responsive(function (width, tip) {
      return drawColumns(width, points, options, tip);
    });
    if (!options.reference) return chart;
    return el('div', null, [
      el('p', { class: 'chart-key' }, [
        el('span', { class: 'chart-key-item' }, [el('i', { class: 'chart-key-swatch is-above' }), 'Above average']),
        el('span', { class: 'chart-key-item' }, [el('i', { class: 'chart-key-swatch is-below' }), 'Below average']),
      ]),
      chart,
    ]);
  }

  function drawColumns(width, points, options, tip) {
    var height = options.height || 190;
    var pad = { top: 14, right: 14, bottom: 26, left: 44 };
    var plotW = Math.max(40, width - pad.left - pad.right);
    var plotH = height - pad.top - pad.bottom;
    var format = options.format || function (v) { return UI.num(v); };
    var ref = options.reference || null;

    var top = points.reduce(function (max, p) { return Math.max(max, p.value); }, ref ? ref.value : 0);
    var domain = [0, niceDomain(0, top || 1)[1]];
    function y(value) { return pad.top + plotH - (value / (domain[1] || 1)) * plotH; }

    var svg = node('svg', {
      width: width, height: height, viewBox: '0 0 ' + width + ' ' + height,
      role: 'img', 'aria-label': options.label || 'Chart',
    });

    ticks(domain, true).forEach(function (value) {
      var ty = y(value);
      svg.appendChild(node('line', {
        class: 'chart-grid-line', x1: pad.left, x2: pad.left + plotW, y1: ty, y2: ty,
      }));
      var text = node('text', { class: 'chart-axis-label', x: pad.left - 8, y: ty + 4, 'text-anchor': 'end' });
      text.textContent = UI.num(value);
      svg.appendChild(text);
    });

    /* Equal slots, a surface gap between bars that narrows as they crowd. */
    var slot = plotW / points.length;
    var gap = slot >= 10 ? 2 : 1;
    var barW = Math.max(1.5, slot - gap);
    function left(i) { return pad.left + i * slot + (slot - barW) / 2; }
    var baseline = y(0);

    var labelled = [];
    points.forEach(function (point, i) {
      var text = point.axis != null ? point.axis : point.label;
      if (text !== '' && text != null) labelled.push({ index: i, text: text });
    });
    var step = Math.ceil(labelled.length / Math.max(1, Math.floor(plotW / 46)));
    var shown = labelled.filter(function (entry, n) { return n % step === 0; });
    /* The latest week is always labelled; it takes the place of a neighbour
       that would sit on top of it. */
    var latest = labelled[labelled.length - 1];
    if (shown[shown.length - 1] !== latest) {
      var prev = shown[shown.length - 1];
      if (prev && (latest.index - prev.index) * slot < 40) shown.pop();
      shown.push(latest);
    }
    shown.forEach(function (entry) {
      var text = node('text', {
        class: 'chart-axis-label', x: left(entry.index) + barW / 2, y: height - 8, 'text-anchor': 'middle',
      });
      text.textContent = entry.text;
      svg.appendChild(text);
    });

    var bars = points.map(function (point, i) {
      var h = Math.max(1, baseline - y(point.value));
      /* Rounded at the data-end only: the bar is square where it meets the axis. */
      var r = Math.min(3, barW / 2, h);
      var x0 = left(i), x1 = x0 + barW, top = baseline - h;
      var bar = node('path', {
        class: 'chart-col' + (ref ? (point.value >= ref.value ? ' is-above' : ' is-below') : ''),
        d: 'M' + x0 + ',' + baseline + 'V' + (top + r) + 'Q' + x0 + ',' + top + ' ' + (x0 + r) + ',' + top +
           'H' + (x1 - r) + 'Q' + x1 + ',' + top + ' ' + x1 + ',' + (top + r) + 'V' + baseline + 'Z',
      });
      svg.appendChild(bar);
      return bar;
    });

    /* The dotted average goes over the bars so it is never hidden by one. */
    if (ref) {
      var ry = y(ref.value);
      svg.appendChild(node('line', {
        class: 'chart-avg', x1: pad.left, x2: pad.left + plotW, y1: ry, y2: ry,
      }));
      var refText = node('text', {
        class: 'chart-avg-label', x: pad.left + plotW, y: ry - 7, 'text-anchor': 'end',
      });
      refText.textContent = ref.label;
      svg.appendChild(refText);
    }

    points.forEach(function (point, i) {
      var hit = node('rect', {
        class: 'chart-hit', x: pad.left + i * slot, y: pad.top, width: slot, height: plotH,
      });
      hit.addEventListener('mouseenter', function () {
        bars[i].classList.add('is-on');
        tip.textContent = '';
        tip.appendChild(el('strong', { text: point.label }));
        tip.appendChild(el('span', { text: format(point.value) }));
        var caption = point.caption || '';
        if (ref) {
          var diff = point.value - ref.value;
          caption = (diff === 0 ? 'on average' : Math.abs(Math.round(diff * 10) / 10) +
            (diff > 0 ? ' above' : ' below') + ' average') + (caption ? ' · ' + caption : '');
        }
        if (caption) tip.appendChild(el('small', { text: caption }));
        tip.classList.add('is-on');
        var w = tip.offsetWidth;
        tip.style.left = Math.max(2, Math.min(width - w - 2, left(i) + barW / 2 - w / 2)) + 'px';
        tip.style.top = Math.max(0, y(point.value) - tip.offsetHeight - 8) + 'px';
      });
      hit.addEventListener('mouseleave', function () {
        bars[i].classList.remove('is-on');
        tip.classList.remove('is-on');
      });
      svg.appendChild(hit);
    });

    return svg;
  }

  /* Charts are drawn at the container's real pixel width, so labels stay
     legible instead of being scaled by a viewBox, and redrawn on resize. */
  function responsive(drawAt) {
    var wrap = el('div', { class: 'chart' });
    var tip = el('div', { class: 'chart-tip', 'aria-hidden': 'true' });
    wrap.appendChild(tip);

    var lastWidth = 0;
    function render() {
      var width = wrap.clientWidth;
      if (!width || Math.abs(width - lastWidth) < 2) return;
      lastWidth = width;
      var svg = drawAt(width, tip);
      var old = wrap.querySelector('svg');
      if (old) wrap.removeChild(old);
      wrap.appendChild(svg);
    }

    /* The element is not measurable until it is in the document. */
    requestAnimationFrame(render);
    if (window.ResizeObserver) new ResizeObserver(render).observe(wrap);
    return wrap;
  }

  /* ---- standings race -------------------------------------------------
     Every team's league position over the season. Two dozen series is far
     past what categorical colour can separate, so they all share one muted
     stroke and hovering lifts a single team out and names it — identity
     comes from the tooltip, never from a hue.
     -------------------------------------------------------------------- */
  function race(options) {
    var series = (options.series || []).filter(function (s) { return s.values.length; });
    if (!series.length) {
      return el('div', { class: 'chart' }, UI.empty(options.empty || 'No standings yet.'));
    }
    return responsive(function (width, tip) {
      return drawRace(width, series, options, tip);
    });
  }

  function drawRace(width, series, options, tip) {
    var height = options.height || 240;
    var pad = { top: 14, right: 14, bottom: 26, left: 44 };
    var plotW = Math.max(40, width - pad.left - pad.right);
    var plotH = height - pad.top - pad.bottom;

    var weeks = [];
    series.forEach(function (s) {
      s.values.forEach(function (v) {
        if (weeks.indexOf(v.week) === -1) weeks.push(v.week);
      });
    });
    weeks.sort(function (a, b) { return a - b; });

    var places = options.of || series.length;
    function x(week) {
      var i = weeks.indexOf(week);
      return weeks.length === 1 ? pad.left + plotW / 2
        : pad.left + (i / (weeks.length - 1)) * plotW;
    }
    function y(rank) {
      return pad.top + ((rank - 1) / Math.max(1, places - 1)) * plotH;
    }

    var svg = node('svg', {
      width: width, height: height, viewBox: '0 0 ' + width + ' ' + height,
      role: 'img', 'aria-label': options.label || 'Standings over time',
    });

    [1, Math.round(places / 2), places].forEach(function (rank) {
      var ty = y(rank);
      svg.appendChild(node('line', {
        class: 'chart-grid-line', x1: pad.left, x2: pad.left + plotW, y1: ty, y2: ty,
      }));
      var text = node('text', { class: 'chart-axis-label', x: pad.left - 8, y: ty + 4, 'text-anchor': 'end' });
      text.textContent = '#' + rank;
      svg.appendChild(text);
    });

    var step = Math.ceil(weeks.length / Math.max(1, Math.floor(plotW / 46)));
    weeks.forEach(function (week, i) {
      if (i % step !== 0 && i !== weeks.length - 1) return;
      var text = node('text', {
        class: 'chart-axis-label', x: x(week), y: height - 8, 'text-anchor': 'middle',
      });
      text.textContent = String(week);
      svg.appendChild(text);
    });

    series.forEach(function (s) {
      var coords = s.values.map(function (v) { return x(v.week) + ',' + y(v.rank); });
      var group = node('g', { class: 'race-team' });
      if (coords.length > 1) {
        group.appendChild(node('polyline', { class: 'race-line', points: coords.join(' ') }));
        /* A fat transparent copy makes the line easy to hit. */
        group.appendChild(node('polyline', { class: 'race-hit', points: coords.join(' ') }));
      }
      s.values.forEach(function (v) {
        group.appendChild(node('circle', { class: 'race-dot', cx: x(v.week), cy: y(v.rank), r: 3.5 }));
        /* A 3.5px dot is far too small to aim at, and a single-week season
           has no line to hover at all, so every point gets a wide target. */
        group.appendChild(node('circle', {
          class: 'race-hit-dot', cx: x(v.week), cy: y(v.rank), r: 10,
        }));
      });

      var last = s.values[s.values.length - 1];
      group.addEventListener('mouseenter', function () {
        group.classList.add('is-on');
        tip.textContent = '';
        tip.appendChild(el('strong', { text: s.name }));
        tip.appendChild(el('span', { text: '#' + last.rank + ' after week ' + last.week }));
        if (s.caption) tip.appendChild(el('small', { text: s.caption }));
        tip.classList.add('is-on');
        var w = tip.offsetWidth;
        tip.style.left = Math.max(2, Math.min(width - w - 2, x(last.week) - w / 2)) + 'px';
        tip.style.top = Math.max(0, y(last.rank) - tip.offsetHeight - 12) + 'px';
      });
      group.addEventListener('mouseleave', function () {
        group.classList.remove('is-on');
        tip.classList.remove('is-on');
      });
      svg.appendChild(group);
    });

    return svg;
  }

  var NS = 'http://www.w3.org/2000/svg';

  function node(name, attrs) {
    var element = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (key) {
      if (attrs[key] != null) element.setAttribute(key, attrs[key]);
    });
    return element;
  }

  function draw(width, points, options, tip) {
    var height = options.height || 190;
    var pad = { top: 14, right: 14, bottom: 26, left: 44 };
    var plotW = Math.max(40, width - pad.left - pad.right);
    var plotH = height - pad.top - pad.bottom;
    var format = options.format || function (v) { return UI.num(v); };
    /* Gridlines read better as whole numbers even when the tooltip shows
       decimals, so the axis gets its own formatter. */
    var formatAxis = options.formatAxis || function (v) { return UI.num(v); };

    var values = points.map(function (p) { return p.value; });
    if (options.reference) values = values.concat([options.reference.value]);
    var domain = options.domain || niceDomain(Math.min.apply(null, values), Math.max.apply(null, values));

    function x(i) {
      return points.length === 1
        ? pad.left + plotW / 2
        : pad.left + (i / (points.length - 1)) * plotW;
    }
    function y(value) {
      var t = (value - domain[0]) / (domain[1] - domain[0] || 1);
      if (options.invert) t = 1 - t;
      return pad.top + plotH - t * plotH;
    }

    var svg = node('svg', {
      width: width, height: height, viewBox: '0 0 ' + width + ' ' + height,
      role: 'img', 'aria-label': options.label || 'Chart',
    });

    /* Recessive hairline grid, with the value axis labelled. */
    ticks(domain, options.integerTicks).forEach(function (value) {
      var ty = y(value);
      svg.appendChild(node('line', {
        class: 'chart-grid-line', x1: pad.left, x2: pad.left + plotW, y1: ty, y2: ty,
      }));
      var text = node('text', { class: 'chart-axis-label', x: pad.left - 8, y: ty + 4, 'text-anchor': 'end' });
      text.textContent = formatAxis(value);
      svg.appendChild(text);
    });

    if (options.reference) {
      var ry = y(options.reference.value);
      svg.appendChild(node('line', {
        class: 'chart-ref', x1: pad.left, x2: pad.left + plotW, y1: ry, y2: ry,
      }));
      var refText = node('text', {
        class: 'chart-ref-label', x: pad.left + plotW, y: ry - 6, 'text-anchor': 'end',
      });
      refText.textContent = options.reference.label;
      svg.appendChild(refText);
    }

    /* Only points that carry axis text are candidates for a label — a player's
       three games in one week share a single week marker — and those thin out
       further so they never collide. */
    var labelled = [];
    points.forEach(function (point, i) {
      var text = point.axis != null ? point.axis : point.label;
      if (text !== '' && text != null) labelled.push({ index: i, text: text });
    });
    var step = Math.ceil(labelled.length / Math.max(1, Math.floor(plotW / 46)));
    labelled.forEach(function (entry, n) {
      if (n % step !== 0 && n !== labelled.length - 1) return;
      var text = node('text', {
        class: 'chart-axis-label', x: x(entry.index), y: height - 8, 'text-anchor': 'middle',
      });
      text.textContent = entry.text;
      svg.appendChild(text);
    });

    if (points.length > 1) {
      svg.appendChild(node('polyline', {
        class: 'chart-line',
        points: points.map(function (p, i) { return x(i) + ',' + y(p.value); }).join(' '),
      }));
    }

    points.forEach(function (point, i) {
      svg.appendChild(node('circle', { class: 'chart-dot', cx: x(i), cy: y(point.value), r: 4 }));
    });

    /* Hit targets are wider than the marks so hovering is forgiving. */
    var band = points.length === 1 ? plotW : plotW / (points.length - 1);
    points.forEach(function (point, i) {
      var hit = node('rect', {
        class: 'chart-hit',
        x: x(i) - band / 2, y: pad.top, width: band, height: plotH,
      });
      hit.addEventListener('mouseenter', function () { show(point, x(i), y(point.value)); });
      hit.addEventListener('mouseleave', hide);
      svg.appendChild(hit);
    });
    svg.addEventListener('mouseleave', hide);

    function show(point, px, py) {
      tip.textContent = '';
      tip.appendChild(el('strong', { text: point.label }));
      tip.appendChild(el('span', { text: format(point.value) }));
      if (point.caption) tip.appendChild(el('small', { text: point.caption }));
      tip.classList.add('is-on');
      var w = tip.offsetWidth;
      tip.style.left = Math.max(2, Math.min(width - w - 2, px - w / 2)) + 'px';
      tip.style.top = Math.max(0, py - tip.offsetHeight - 12) + 'px';
    }
    function hide() { tip.classList.remove('is-on'); }

    return svg;
  }

  /* Rounds a domain out to readable gridlines rather than the raw min/max. */
  function niceDomain(min, max) {
    if (min === max) return [min - 10, max + 10];
    var span = max - min;
    var step = Math.pow(10, Math.floor(Math.log(span / 3) / Math.LN10));
    [1, 2, 2.5, 5, 10].some(function (m) {
      if (span / (step * m) <= 4) { step = step * m; return true; }
      return false;
    });
    return [Math.floor(min / step) * step, Math.ceil(max / step) * step];
  }

  function ticks(domain, integers) {
    var count = 4;
    var out = [];
    for (var i = 0; i <= count; i++) {
      var value = domain[0] + (domain[1] - domain[0]) * (i / count);
      if (integers) value = Math.round(value);
      if (out.indexOf(value) === -1) out.push(value);
    }
    return out;
  }

  window.Charts = { bars: bars, diverging: diverging, line: line, columns: columns, race: race };
})();
