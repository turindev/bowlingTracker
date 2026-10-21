/*
 * Shareable pictures: a series scorecard and a ball report, both drawn as SVG
 * (plain shapes and text, no external files) so they look the same everywhere,
 * then turned into a PNG, a PDF, or the phone's share sheet.
 *
 * Nothing here touches the vault or the network. It is given the games, the
 * balls and a name, and returns pictures.
 */
(function () {
  'use strict';

  var S = typeof module === 'object' && module.exports ? require('./shots.js') : window.Shots;

  var SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  var MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

  /* ---------- a tiny SVG writer ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function r1(n) { return Math.round(n * 10) / 10; }

  function attrs(o) {
    return Object.keys(o || {}).filter(function (k) { return o[k] != null; }).map(function (k) {
      return ' ' + k.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }) + '="' + esc(typeof o[k] === 'number' ? r1(o[k]) : o[k]) + '"';
    }).join('');
  }

  function Svg(w, h) {
    var out = [];
    var ids = 0;
    var api = {
      w: w, h: h,
      add: function (s) { out.push(s); return api; },
      rect: function (x, y, rw, rh, a) { out.push('<rect x="' + r1(x) + '" y="' + r1(y) + '" width="' + r1(Math.max(0, rw)) + '" height="' + r1(Math.max(0, rh)) + '"' + attrs(a) + '/>'); return api; },
      line: function (x1, y1, x2, y2, a) { out.push('<line x1="' + r1(x1) + '" y1="' + r1(y1) + '" x2="' + r1(x2) + '" y2="' + r1(y2) + '"' + attrs(a) + '/>'); return api; },
      circle: function (cx, cy, r, a) { out.push('<circle cx="' + r1(cx) + '" cy="' + r1(cy) + '" r="' + r1(r) + '"' + attrs(a) + '/>'); return api; },
      path: function (d, a) { out.push('<path d="' + d + '"' + attrs(a) + '/>'); return api; },
      text: function (x, y, t, a) { out.push('<text x="' + r1(x) + '" y="' + r1(y) + '"' + attrs(a) + '>' + esc(t) + '</text>'); return api; },
      id: function (p) { return (p || 'i') + (++ids); },
      toString: function () {
        return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' + w + '" height="' + h +
          '" viewBox="0 0 ' + w + ' ' + h + '" font-family="' + esc(SANS) + '">' + out.join('') + '</svg>';
      },
    };
    return api;
  }

  /* Greedy word wrap by an average glyph width, for the plain-English blurbs. */
  function wrap(text, size, width) {
    var maxChars = Math.max(8, Math.floor(width / (size * 0.52)));
    var lines = [], line = '';
    String(text).split(/\s+/).forEach(function (word) {
      if ((line + ' ' + word).trim().length > maxChars && line) { lines.push(line); line = word; }
      else line = (line + ' ' + word).trim();
    });
    if (line) lines.push(line);
    return lines;
  }

  function textBlock(svg, x, y, text, size, width, a, lead) {
    var lines = wrap(text, size, width);
    lines.forEach(function (l, i) { svg.text(x, y + i * (lead || size * 1.4), l, Object.assign({ fontSize: size }, a)); });
    return lines.length * (lead || size * 1.4);
  }

  /* ======================================================================
     Series scorecard
     ====================================================================== */

  var SC = {
    /* A plain dark mode: near-black with neutral greys, the bright marks doing the colouring. */
    bg: '#121212', panel: '#1b1b1b', line: '#2e2e2e', soft: '#8c8c8c', text: '#ffffff', blue: '#27b4ff',
    amber: '#e8b53c', green: '#2fd39a', red: '#f0605d', grey: '#404040', tenth: '#232323', white: '#f5f5f5',
    disc: '#2a2a2a', sub: '#b8b8b8', foot: '#666666',
    flame: ['#ff9a2e', '#ff7a18', '#ff4a2a'], flameCore: '#ffd34d', ember: '#ff7a18',
    gold: ['#ffe58f', '#f4b822', '#b9790a'], goldInk: '#2b1a00',
  };

  var DECK_ROWS = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]];

  /* Ten dots in a triangle. Grey: knocked by the first ball. Green: picked up by
     the spare try. Red: still standing at the end of the frame. */
  function drawDeck(svg, cx, cy, colors, scale) {
    var dx = 12 * scale, dy = 11 * scale, r = 4.6 * scale;
    DECK_ROWS.forEach(function (row, i) {
      row.forEach(function (pin, j) {
        var x = cx + (j - (row.length - 1) / 2) * dx;
        var y = cy + (i - 1.5) * dy;
        svg.circle(x, y, r, { fill: colors[pin] || SC.grey });
      });
    });
  }

  /* One colour per pin for a rack: its first ball's leave, then what the spare
     try did with it. */
  function rackColors(first, attempt, bonus) {
    var colors = {};
    /* The balls thrown after a strike or spare in the tenth are bonus balls: pins they leave are
       not an open frame, so they are shown plain, not red. A spare picked up is still green. */
    var left = bonus ? SC.soft : SC.red;
    (first ? first.standing : []).forEach(function (p) {
      colors[p] = attempt ? (attempt.standing.indexOf(p) === -1 ? SC.green : left) : left;
    });
    return colors;
  }

  function frameRacks(game, f) {
    var racks = [];
    S.walk({ frames: [game.frames[f]] }).forEach(function (c) {
      if (c.fresh) racks.push({ first: c, attempt: null });
      else if (racks.length) racks[racks.length - 1].attempt = c;
    });
    return racks;
  }

  function markFill(text) {
    return text === 'X' ? SC.blue : text === '/' ? SC.amber : text === '-' ? SC.soft : SC.white;
  }

  /* A flame badge icon: the shared 24x24 shapes, scaled and placed. */
  function drawFlame(svg, x, y, size, level) {
    var k = size / 24;
    var t = 'translate(' + r1(x) + ' ' + r1(y) + ') scale(' + r1(k * 100) / 100 + ')';
    svg.path(S.ART.flame, { fill: SC.flame[Math.min(2, Math.max(0, (level || 1) - 1))], transform: t });
    svg.path(S.ART.flameCore, { fill: SC.flameCore, transform: t });
  }

  /* A trophy outline (a personal record), scaled and placed. */
  function drawTrophy(svg, x, y, size, color) {
    var k = size / 24;
    svg.path(S.ART.trophy, { fill: 'none', stroke: color, strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round',
      transform: 'translate(' + r1(x) + ' ' + r1(y) + ') scale(' + r1(k * 100) / 100 + ')' });
  }

  /* An honor score: a gold pill, a star (two for the top honors) and the word, with a couple of sparkles. */
  function drawHonor(svg, b, x, y) {
    var stars = b.level >= 2 ? 2 : 1;
    var w = 20 + stars * 34 + 5 * 21 + 22, top = y - 38, h = 56;
    var gid = svg.id('hg');
    svg.add('<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + SC.gold[0] + '"/><stop offset="0.55" stop-color="' + SC.gold[1] + '"/><stop offset="1" stop-color="' + SC.gold[2] + '"/></linearGradient></defs>');
    svg.rect(x, top, w, h, { rx: 28, fill: 'url(#' + gid + ')' });
    svg.rect(x + 3, top + 3, w - 6, h - 6, { rx: 25, fill: 'none', stroke: '#fff3c4', strokeWidth: 1.5, opacity: 0.7 });
    for (var i = 0; i < stars; i++) {
      var k = 44 / 24;
      svg.path(S.ART.star, { fill: SC.goldInk, transform: 'translate(' + r1(x + 10 + i * 34) + ' ' + r1(top + 2) + ') scale(' + r1(k * 100) / 100 + ')' });
    }
    svg.text(x + 16 + stars * 34, y - 1, 'HONOR', { fontSize: 25, fontWeight: 800, fill: SC.goldInk, letterSpacing: 1.2 });
    svg.path('M' + r1(x + w + 8) + ' ' + r1(top - 2) + 'l3 7l7 3l-7 3l-3 7l-3 -7l-7 -3l7 -3z', { fill: SC.gold[0] });
    svg.path('M' + r1(x + w + 22) + ' ' + r1(top + 26) + 'l2 5l5 2l-5 2l-2 5l-2 -5l-5 -2l5 -2z', { fill: SC.gold[1] });
    return w + 38;
  }

  /* Badges in a row from x on the baseline y: flames and the streak name, a tick for a clean game,
     a trophy and PR for a record, and the gold pill for an honor score. */
  function drawBadgeList(svg, list, x, y) {
    list.forEach(function (b) {
      if (b.key === 'honor') {
        x += drawHonor(svg, b, x, y);
      } else if (b.key === 'pr') {
        drawTrophy(svg, x, y - 32, 34, SC.blue);
        x += 44;
        svg.text(x, y, 'PR', { fontSize: 25, fontWeight: 800, fill: SC.blue, letterSpacing: 1.2 });
        x += 2 * 17 + 30;
      } else if (b.key === 'hot') {
        for (var i = 0; i < b.level; i++) drawFlame(svg, x + i * 26, y - 30, 32, b.level);
        x += b.level * 26 + 14;
        svg.text(x, y, b.label.toUpperCase(), { fontSize: 25, fontWeight: 800, fill: SC.ember, letterSpacing: 1.2 });
        x += b.label.length * 17 + 30;
      } else {
        svg.path('M' + r1(x + 6 * 1.33) + ' ' + r1(y - 30 + 12.8 * 1.33) + 'L' + r1(x + 10.4 * 1.33) + ' ' + r1(y - 30 + 17.2 * 1.33) + 'L' + r1(x + 18.2 * 1.33) + ' ' + r1(y - 30 + 8.2 * 1.33),
          { fill: 'none', stroke: SC.green, strokeWidth: 4.5, strokeLinecap: 'round', strokeLinejoin: 'round' });
        x += 40;
        svg.text(x, y, 'CLEAN', { fontSize: 25, fontWeight: 800, fill: SC.green, letterSpacing: 1.2 });
        x += 5 * 17 + 30;
      }
    });
  }

  /* The badges a game earned, in a row after its title. */
  function drawBadges(svg, game, x, y, ctx) {
    drawBadgeList(svg, S.badges(game, ctx), x, y);
  }

  /* One game's card: ten frames, the marks, a leave diagram and the running total. */
  function drawGame(svg, game, n, x0, y0, width, ctx) {
    var sc = S.score(game);
    var hot = S.heatFrames(game);
    svg.text(x0 + 12, y0 + 30, 'GAME ' + n, { fontSize: 36, fontWeight: 700, fill: SC.blue, letterSpacing: 1.5 });
    drawBadges(svg, game, x0 + 12 + 190, y0 + 28, ctx);
    svg.text(x0 + width - 12, y0 + 34, sc.complete ? String(sc.total) : String(sc.running), { fontSize: 50, fontWeight: 700, fill: SC.text, textAnchor: 'end' });

    var top = y0 + 56, h = 222;
    svg.rect(x0, top, width, h, { rx: 26, fill: SC.panel, stroke: SC.line, strokeWidth: 2 });
    var unit = width / 11;                         /* nine single frames and a double-width tenth */
    var clip = svg.id('c');
    svg.add('<clipPath id="' + clip + '"><rect x="' + x0 + '" y="' + top + '" width="' + width + '" height="' + h + '" rx="26"/></clipPath><g clip-path="url(#' + clip + ')">');

    for (var f = 0; f < 10; f++) {
      var fx = x0 + f * unit, fw = f === 9 ? unit * 2 : unit, cx = fx + fw / 2;
      if (f === 9) svg.rect(fx, top, fw, h, { fill: SC.tenth });
      if (hot[f]) svg.rect(fx, top, fw, h, { fill: '#ff6a00', opacity: 0.10 + 0.30 * hot[f].heat });
      if (f > 0) svg.line(fx, top, fx, top + h, { stroke: SC.line, strokeWidth: 2 });
      svg.text(cx, top + 31, String(f + 1), { fontSize: 20, fill: hot[f] ? SC.ember : SC.soft, fontWeight: hot[f] ? 700 : 400, textAnchor: 'middle' });

      var frame = sc.frames[f];
      if (!frame || !frame.marks.length) continue;
      var marks = frame.marks;
      var strikeAlone = f < 9 && marks[0].text === 'X';
      var spacing = f === 9 ? 40 : 28;
      marks.forEach(function (m, i) {
        var mx = strikeAlone ? cx : cx + (i - (marks.length - 1) / 2) * spacing;
        if (m.split) svg.circle(mx, top + 70, 17, { fill: 'none', stroke: SC.red, strokeWidth: 3 });
        svg.text(mx, top + 79, m.text, { fontSize: 27, fontWeight: m.text === 'X' ? 700 : 500, fill: markFill(m.text), textAnchor: 'middle', fontFamily: MONO });
      });

      var racks = frameRacks(game, f);
      if (f < 9) {
        drawDeck(svg, cx, top + 126, racks[0] ? rackColors(racks[0].first, racks[0].attempt) : {}, 1);
      } else {
        var shown = racks.slice(0, 3);
        var scale = shown.length > 2 ? 0.8 : 1;
        shown.forEach(function (rk, i) {
          drawDeck(svg, fx + fw * (i + 0.5) / shown.length, top + 126, rackColors(rk.first, rk.attempt, i > 0), scale);
        });
      }
      svg.line(fx, top + h - 56, fx + fw, top + h - 56, { stroke: SC.line, strokeWidth: 2 });
      if (frame.total != null) {
        svg.text(cx, top + h - 20, String(frame.total), { fontSize: 27, fontWeight: 600, fill: SC.white, textAnchor: 'middle', fontFamily: MONO });
      }
    }
    svg.add('</g>');
    svg.rect(x0, top, width, h, { rx: 26, fill: 'none', stroke: SC.line, strokeWidth: 2 });
  }

  function ballDisc(svg, cx, cy, r, ball) {
    var clip = svg.id('b');
    svg.add('<clipPath id="' + clip + '"><circle cx="' + r1(cx) + '" cy="' + r1(cy) + '" r="' + r1(r) + '"/></clipPath>');
    if (ball && ball.image) {
      svg.add('<image href="' + esc(ball.image) + '" x="' + r1(cx - r) + '" y="' + r1(cy - r) + '" width="' + r1(r * 2) + '" height="' + r1(r * 2) +
        '" preserveAspectRatio="xMidYMid slice" clip-path="url(#' + clip + ')"/>');
    } else {
      svg.circle(cx, cy, r, { fill: SC.disc, stroke: SC.line, strokeWidth: 2 });
      svg.text(cx, cy + r * 0.3, ball && ball.name ? ball.name.charAt(0).toUpperCase() : '', { fontSize: r * 0.9, fontWeight: 700, fill: SC.soft, textAnchor: 'middle' });
    }
  }

  /*
   * games: the games of one set, or a single game.
   * opts: { name, ballInfo(id) -> { name, image }, brand }
   */
  function scorecard(games, opts) {
    opts = opts || {};
    var list = games.filter(function (g) { return g && g.frames && g.frames.length; });
    var W = 1260, X = 85, CW = W - X * 2;
    var series = list.length > 1;
    var H = 430 + list.length * 336 + (series ? 314 : 200);
    var svg = Svg(W, H);
    svg.rect(0, 0, W, H, { fill: SC.bg });

    var first = list[0] || {};
    var name = (opts.name || '').trim();
    svg.text(X, 140, name || (series ? 'Series scorecard' : 'Game scorecard'), { fontSize: 66, fontWeight: 800, fill: SC.text, letterSpacing: -1 });
    var where = [first.location, first.pattern ? 'Oil: ' + first.pattern : null].filter(Boolean).join(' · ');
    svg.circle(X + 7, 178, 7, { fill: SC.soft });
    svg.text(X + 38, 192, where || (first.event ? first.event.charAt(0).toUpperCase() + first.event.slice(1) : ''), { fontSize: 34, fill: SC.sub });
    svg.text(X, 236, longDate(first.date), { fontSize: 30, fill: SC.soft });

    /* The balls: one large, or a row of up to three. */
    var ids = [];
    list.forEach(function (g) { S.ballsInGame(g).forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); }); });
    var info = function (id) { return (opts.ballInfo && opts.ballInfo(id)) || { name: '' }; };
    if (ids.length === 1) {
      ballDisc(svg, X + 60, 348, 60, info(ids[0]));
      svg.text(X + 156, 360, info(ids[0]).name || 'Ball', { fontSize: 42, fontWeight: 700, fill: SC.text });
    } else if (ids.length > 1) {
      var shown = ids.slice(0, 3), slot = CW / shown.length;
      shown.forEach(function (id, i) {
        ballDisc(svg, X + slot * i + 42, 346, 42, info(id));
        wrap(info(id).name || 'Ball', 28, slot - 120).slice(0, 2).forEach(function (l, k) {
          svg.text(X + slot * i + 100, 346 + (k ? 34 : 0) - (wrap(info(id).name, 28, slot - 120).length > 1 ? 12 : -9), l, { fontSize: 28, fontWeight: 700, fill: SC.text });
        });
      });
    }

    var y = 430;
    list.forEach(function (g, i) {
      drawGame(svg, g, g.gameNo || i + 1, X, y, CW, opts.context);
      y += 336;
    });

    var total = list.reduce(function (a, g) { return a + (S.score(g).total || 0); }, 0);
    if (series) {
      svg.line(X, y + 8, W - X, y + 8, { stroke: SC.line, strokeWidth: 3 });
      svg.text(X, y + 152, 'SERIES TOTAL', { fontSize: 42, fontWeight: 800, fill: SC.green, letterSpacing: 1.5 });
      if (opts.set && opts.context) drawBadgeList(svg, S.setBadges(opts.set, opts.context), X + 400, y + 150);
      svg.text(W - X - 4, y + 168, String(total), { fontSize: 128, fontWeight: 800, fill: SC.text, textAnchor: 'end', letterSpacing: -3 });
      y += 236;
    } else {
      y += 40;
    }
    svg.text(W / 2, H - 56, 'Shared from ' + (opts.brand || 'LeagueCraft'), { fontSize: 26, fill: SC.foot, textAnchor: 'middle' });
    return { svg: svg.toString(), width: W, height: H, total: total };
  }

  function longDate(iso) {
    if (!iso) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return iso;
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[Number(m[2]) - 1] + ' ' + Number(m[3]) + ', ' + m[1];
  }

  /* ======================================================================
     Ball report
     ====================================================================== */

  var R = {
    bg: '#f3eee4', card: '#fcfaf5', edge: '#e4dccb', ink: '#1b1a17', soft: '#6a655b', faint: '#a29b8c',
    dark: '#0d1b2a', grid: '#e9e2d3',
    series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'],
  };

  function niceStep(span, target) {
    var raw = span / target;
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var f = raw / mag;
    return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * mag;
  }

  function scale(d0, d1, r0, r1) {
    var k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
    return function (v) { return r0 + (v - d0) * k; };
  }

  function pct(v, digits) { return v == null ? '—' : (v * 100).toFixed(digits || 0) + '%'; }
  function fix(v, d) { return v == null || !isFinite(v) ? '—' : v.toFixed(d == null ? 1 : d); }

  function ballReport(report, opts) {
    opts = opts || {};
    var balls = report.balls;
    var W = 1240, M = 44, CWID = W - M * 2;
    var cursor = { y: 0 };
    var pieces = [];               /* each: function(svg, y) -> height; measured by a dry run */

    function color(i) { return R.series[i % R.series.length]; }

    /* A card with a title and a blurb; `body(svg, x, y, w)` draws and returns its height. */
    function section(title, blurb, body) {
      pieces.push(function (svg, y, dry) {
        var x = M, pad = 28, inner = CWID - pad * 2;
        var cvs = dry ? Svg(W, 10) : svg;
        var h = 0;
        var tmp = Svg(W, 10);
        var lead = textBlock(tmp, 0, 0, blurb || '', 19, inner, {}, 27);
        var bodyH = body(tmp, x + pad, 0, inner);
        h = 28 + 34 + (blurb ? lead + 14 : 8) + bodyH + 30;
        if (dry) return h;
        svg.rect(x, y, CWID, h, { rx: 22, fill: R.card, stroke: R.edge, strokeWidth: 1.5 });
        svg.text(x + pad, y + 52, title, { fontSize: 31, fontWeight: 800, fill: R.ink, letterSpacing: -0.4 });
        if (blurb) textBlock(svg, x + pad, y + 86, blurb, 19, inner, { fill: R.soft }, 27);
        body(svg, x + pad, y + 28 + 34 + (blurb ? lead + 14 : 8) + 6, inner);
        return h;
      });
    }

    function legend(svg, x, y, items) {
      var cx = x;
      items.forEach(function (it) {
        svg.rect(cx, y - 13, 16, 16, { rx: 4, fill: it.color });
        svg.text(cx + 24, y, it.label, { fontSize: 18, fill: R.ink });
        cx += 24 + it.label.length * 10.2 + 28;
      });
      return 30;
    }
    function ballLegend(svg, x, y) {
      return legend(svg, x, y, balls.map(function (b, i) { return { color: color(i), label: b.label }; }));
    }

    /* ---- header, drawn separately ---- */
    var headerH = 292;

    /* ---- 1. ball cards ---- */
    pieces.push(function (svg, y, dry) {
      var gap = 18, n = balls.length, cw = (CWID - gap * (n - 1)) / n, h = 356;
      if (dry) return h;
      balls.forEach(function (b, i) {
        var x = M + i * (cw + gap);
        svg.rect(x, y, cw, h, { rx: 20, fill: R.card, stroke: R.edge, strokeWidth: 1.5 });
        svg.rect(x, y, cw, 8, { fill: color(i) });
        svg.text(x + 22, y + 44, b.label, { fontSize: 20, fontWeight: 700, fill: R.ink });
        svg.text(x + 22, y + 108, fix(b.mean, 1), { fontSize: 62, fontWeight: 800, fill: R.ink, letterSpacing: -2 });
        svg.text(x + 22, y + 134, 'average score · ' + b.n + ' games', { fontSize: 17, fill: R.soft });
        var rows = [
          ['Median', fix(b.median, 0)],
          ['Std dev', fix(b.sd, 1)],
          ['200+ games', pct(b.over200)],
          ['Strike rate', pct(b.shots.strikePct)],
          ['Spare rate', pct(b.shots.sparePct)],
          ['Makeable spares', pct(b.shots.makeablePct)],
          ['95% CI', b.ci ? Math.round(b.ci[0]) + '–' + Math.round(b.ci[1]) : '—'],
        ];
        rows.forEach(function (row, k) {
          var ry = y + 168 + k * 25;
          svg.line(x + 22, ry - 18, x + cw - 22, ry - 18, { stroke: R.grid, strokeWidth: 1 });
          svg.text(x + 22, ry, row[0], { fontSize: 17, fill: R.soft });
          svg.text(x + cw - 22, ry, row[1], { fontSize: 17, fontWeight: 700, fill: R.ink, textAnchor: 'end' });
        });
      });
      return h;
    });

    /* ---- 2. every game, every ball ---- */
    section('Every game, every ball',
      'Each dot is one game. The black bar is the 95% confidence interval for the average, and the thick tick is the mean. Where the intervals overlap, the average alone cannot tell the balls apart.',
      function (svg, x, y, w) {
        var h = 400, pl = 54, top = y + 10, bot = y + h - 70;
        var all = [].concat.apply([], balls.map(function (b) { return b.scores; }));
        var lo = Math.floor((Math.min.apply(null, all) - 8) / 20) * 20, hi = Math.ceil((Math.max.apply(null, all) + 8) / 20) * 20;
        var sy = scale(lo, hi, bot, top);
        for (var v = lo; v <= hi; v += 20) {
          svg.line(x + pl, sy(v), x + w, sy(v), { stroke: R.grid, strokeWidth: 1 });
          svg.text(x + pl - 10, sy(v) + 5, String(v), { fontSize: 16, fill: R.faint, textAnchor: 'end' });
        }
        var slot = (w - pl) / balls.length;
        balls.forEach(function (b, i) {
          var cx = x + pl + slot * (i + 0.5);
          b.scores.forEach(function (s, k) {
            var jx = (((k * 53) % 17) / 16 - 0.5) * Math.min(slot * 0.55, 150);
            svg.circle(cx + jx, sy(s), 6, { fill: color(i), fillOpacity: 0.78, stroke: R.card, strokeWidth: 1.5 });
          });
          if (b.ci) {
            svg.line(cx, sy(b.ci[0]), cx, sy(b.ci[1]), { stroke: R.ink, strokeWidth: 3 });
            svg.line(cx - 12, sy(b.ci[0]), cx + 12, sy(b.ci[0]), { stroke: R.ink, strokeWidth: 3 });
            svg.line(cx - 12, sy(b.ci[1]), cx + 12, sy(b.ci[1]), { stroke: R.ink, strokeWidth: 3 });
          }
          svg.line(cx - 20, sy(b.mean), cx + 20, sy(b.mean), { stroke: R.ink, strokeWidth: 6 });
          svg.text(cx + 28, sy(b.mean) + 6, fix(b.mean, 1), { fontSize: 20, fontWeight: 800, fill: R.ink });
          svg.text(cx, bot + 34, b.label, { fontSize: 18, fontWeight: 700, fill: R.ink, textAnchor: 'middle' });
          svg.text(cx, bot + 56, 'n=' + b.n, { fontSize: 16, fill: R.soft, textAnchor: 'middle' });
        });
        return h;
      });

    /* ---- 3. spread and typical score ---- */
    section('Spread and typical score',
      'The box is the middle half of each ball’s games, the line inside is the median, and the whiskers reach the highest and lowest ordinary games. Hollow dots are unusual games. A short box means a steadier ball.',
      function (svg, x, y, w) {
        var h = 380, pl = 54, top = y + 10, bot = y + h - 64;
        var all = [].concat.apply([], balls.map(function (b) { return b.scores; }));
        var lo = Math.floor((Math.min.apply(null, all) - 8) / 20) * 20, hi = Math.ceil((Math.max.apply(null, all) + 8) / 20) * 20;
        var sy = scale(lo, hi, bot, top);
        for (var v = lo; v <= hi; v += 20) {
          svg.line(x + pl, sy(v), x + w, sy(v), { stroke: R.grid, strokeWidth: 1 });
          svg.text(x + pl - 10, sy(v) + 5, String(v), { fontSize: 16, fill: R.faint, textAnchor: 'end' });
        }
        var slot = (w - pl) / balls.length;
        balls.forEach(function (b, i) {
          var cx = x + pl + slot * (i + 0.5), bw = Math.min(90, slot * 0.4);
          svg.line(cx, sy(b.whiskerHi), cx, sy(b.whiskerLo), { stroke: color(i), strokeWidth: 2.5 });
          svg.line(cx - bw / 4, sy(b.whiskerHi), cx + bw / 4, sy(b.whiskerHi), { stroke: color(i), strokeWidth: 2.5 });
          svg.line(cx - bw / 4, sy(b.whiskerLo), cx + bw / 4, sy(b.whiskerLo), { stroke: color(i), strokeWidth: 2.5 });
          svg.rect(cx - bw / 2, sy(b.q3), bw, Math.max(2, sy(b.q1) - sy(b.q3)), { rx: 6, fill: color(i), fillOpacity: 0.25, stroke: color(i), strokeWidth: 2.5 });
          svg.line(cx - bw / 2, sy(b.median), cx + bw / 2, sy(b.median), { stroke: R.ink, strokeWidth: 4 });
          b.scores.forEach(function (s) {
            if (s < b.whiskerLo || s > b.whiskerHi) svg.circle(cx, sy(s), 6, { fill: 'none', stroke: color(i), strokeWidth: 2.5 });
          });
          svg.text(cx + bw / 2 + 14, sy(b.median) + 6, fix(b.median, 0), { fontSize: 19, fontWeight: 800, fill: R.ink });
          svg.text(cx, bot + 34, b.label, { fontSize: 18, fontWeight: 700, fill: R.ink, textAnchor: 'middle' });
          svg.text(cx, bot + 56, 'SD ' + fix(b.sd, 1), { fontSize: 16, fill: R.soft, textAnchor: 'middle' });
        });
        return h;
      });

    /* ---- 4. where the scores land ---- */
    section('Where the scores land',
      'The share of each ball’s games in each score band. Bars of the same height in the same band mean the balls score alike there.',
      function (svg, x, y, w) {
        var h = 360, pl = 54, top = y + 34, bot = y + h - 50;
        var labels = ['Under 180', '180–199', '200–219', '220–239', '240+'];
        var max = Math.max.apply(null, [].concat.apply([], balls.map(function (b) { return b.bands; })).concat([0.1]));
        var topV = Math.ceil(max * 10) / 10 + 0.05;
        var sy = scale(0, topV, bot, top);
        for (var v = 0; v <= topV + 1e-9; v += 0.1) {
          svg.line(x + pl, sy(v), x + w, sy(v), { stroke: R.grid, strokeWidth: 1 });
          svg.text(x + pl - 10, sy(v) + 5, Math.round(v * 100) + '%', { fontSize: 16, fill: R.faint, textAnchor: 'end' });
        }
        var slot = (w - pl) / labels.length, bw = Math.min(40, (slot * 0.8) / balls.length);
        labels.forEach(function (lab, k) {
          var cx = x + pl + slot * (k + 0.5);
          balls.forEach(function (b, i) {
            var bx = cx + (i - (balls.length - 1) / 2) * (bw + 4) - bw / 2;
            svg.path('M' + r1(bx) + ',' + r1(bot) + 'V' + r1(sy(b.bands[k]) + Math.min(5, bot - sy(b.bands[k]))) +
              'Q' + r1(bx) + ',' + r1(sy(b.bands[k])) + ' ' + r1(bx + 5) + ',' + r1(sy(b.bands[k])) + 'H' + r1(bx + bw - 5) +
              'Q' + r1(bx + bw) + ',' + r1(sy(b.bands[k])) + ' ' + r1(bx + bw) + ',' + r1(sy(b.bands[k]) + Math.min(5, bot - sy(b.bands[k]))) + 'V' + r1(bot) + 'Z', { fill: color(i) });
            if (b.bands[k] > 0) svg.text(bx + bw / 2, sy(b.bands[k]) - 8, Math.round(b.bands[k] * 100), { fontSize: 14, fill: R.soft, textAnchor: 'middle' });
          });
          svg.text(cx, bot + 30, lab, { fontSize: 17, fill: R.ink, textAnchor: 'middle' });
        });
        ballLegend(svg, x, y + 16);
        return h;
      });

    /* ---- 5. odds of reaching a score ---- */
    section('Odds of reaching a score',
      'The share of each ball’s games at or above a score. A line that stays high for longer is a ball that clears that score more often.',
      function (svg, x, y, w) {
        var h = 380, pl = 54, top = y + 36, bot = y + h - 52;
        var all = [].concat.apply([], balls.map(function (b) { return b.scores; }));
        var lo = Math.floor(Math.min.apply(null, all) / 20) * 20, hi = Math.ceil(Math.max.apply(null, all) / 20) * 20;
        var sx = scale(lo, hi, x + pl, x + w - 10), sy = scale(0, 1, bot, top);
        [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
          svg.line(x + pl, sy(v), x + w, sy(v), { stroke: R.grid, strokeWidth: 1 });
          svg.text(x + pl - 10, sy(v) + 5, Math.round(v * 100) + '%', { fontSize: 16, fill: R.faint, textAnchor: 'end' });
        });
        for (var s = lo; s <= hi; s += 20) svg.text(sx(s), bot + 28, String(s), { fontSize: 16, fill: R.faint, textAnchor: 'middle' });
        var ref = sy(0.5);
        balls.forEach(function (b, i) {
          var d = '';
          var share = function (t) { return b.scores.filter(function (v) { return v >= t; }).length / b.n; };
          var ts = [];
          for (var t = lo; t <= hi; t += 2) ts.push(t);
          ts.forEach(function (t, k) { d += (k ? 'L' : 'M') + r1(sx(t)) + ',' + r1(sy(share(t))); });
          svg.path(d, { fill: 'none', stroke: color(i), strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' });
        });
        svg.line(sx(200), top, sx(200), bot, { stroke: R.ink, strokeWidth: 1.5, strokeDasharray: '4 5' });
        svg.text(sx(200) + 6, top + 14, '200', { fontSize: 15, fontWeight: 700, fill: R.ink });
        ballLegend(svg, x, y + 16);
        return h;
      });

    /* ---- 6. averages settle slowly ---- */
    section('Averages settle slowly',
      'The running average after each game for that ball. Early averages swing hard and only calm down after a dozen or so games, so a short run says little.',
      function (svg, x, y, w) {
        var h = 400, pl = 54, top = y + 36, bot = y + h - 52;
        var maxN = Math.max.apply(null, balls.map(function (b) { return b.n; }));
        var vals = [].concat.apply([], balls.map(function (b) { return b.running; }));
        var lo = Math.floor((Math.min.apply(null, vals) - 4) / 10) * 10, hi = Math.ceil((Math.max.apply(null, vals) + 4) / 10) * 10;
        var sx = scale(1, Math.max(2, maxN), x + pl, x + w - 40), sy = scale(lo, hi, bot, top);
        for (var v = lo; v <= hi; v += 10) {
          svg.line(x + pl, sy(v), x + w, sy(v), { stroke: R.grid, strokeWidth: 1 });
          svg.text(x + pl - 10, sy(v) + 5, String(v), { fontSize: 16, fill: R.faint, textAnchor: 'end' });
        }
        var step = niceStep(maxN, 8);
        for (var g = step; g <= maxN; g += step) svg.text(sx(g), bot + 28, String(g), { fontSize: 16, fill: R.faint, textAnchor: 'middle' });
        svg.text(x + w, bot + 50, 'game number', { fontSize: 15, fill: R.faint, textAnchor: 'end' });
        balls.forEach(function (b, i) {
          var d = '';
          b.running.forEach(function (m, k) { d += (k ? 'L' : 'M') + r1(sx(k + 1)) + ',' + r1(sy(m)); });
          svg.path(d, { fill: 'none', stroke: color(i), strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' });
          svg.circle(sx(b.n), sy(b.running[b.n - 1]), 6, { fill: color(i), stroke: R.card, strokeWidth: 2 });
          svg.text(sx(b.n) + 12, sy(b.running[b.n - 1]) + 6, fix(b.mean, 1), { fontSize: 17, fontWeight: 800, fill: R.ink });
        });
        ballLegend(svg, x, y + 16);
        return h;
      });

    /* ---- 7. what the ball does: strike, spare, pocket ---- */
    section('What each ball does on the pins',
      'Shot by shot, not game by game: how often the first ball struck, how often spares were made (and the makeable ones, which leave out splits), and how often the first ball hit the pocket (of the first balls where you recorded it).',
      function (svg, x, y, w) {
        var h = 330, pl = 54, top = y + 38, bot = y + h - 50;
        var metrics = [
          ['Strike %', function (b) { return b.shots.strikePct; }],
          ['Spare %', function (b) { return b.shots.sparePct; }],
          ['Makeable spare %', function (b) { return b.shots.makeablePct; }],
          ['Pocket % of hits', function (b) { return b.shots.hits.pocket.pct; }],
        ];
        var sy = scale(0, 1, bot, top);
        [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
          svg.line(x + pl, sy(v), x + w, sy(v), { stroke: R.grid, strokeWidth: 1 });
          svg.text(x + pl - 10, sy(v) + 5, Math.round(v * 100) + '%', { fontSize: 16, fill: R.faint, textAnchor: 'end' });
        });
        var slot = (w - pl) / metrics.length, bw = Math.min(56, (slot * 0.8) / balls.length);
        metrics.forEach(function (m, k) {
          var cx = x + pl + slot * (k + 0.5);
          balls.forEach(function (b, i) {
            var v = m[1](b);
            var bx = cx + (i - (balls.length - 1) / 2) * (bw + 6) - bw / 2;
            if (v == null) { svg.text(bx + bw / 2, bot - 8, '—', { fontSize: 16, fill: R.faint, textAnchor: 'middle' }); return; }
            svg.rect(bx, sy(v), bw, bot - sy(v), { rx: 5, fill: color(i) });
            svg.text(bx + bw / 2, sy(v) - 8, Math.round(v * 100) + '%', { fontSize: 15, fontWeight: 700, fill: R.ink, textAnchor: 'middle' });
          });
          svg.text(cx, bot + 30, m[0], { fontSize: 17, fill: R.ink, textAnchor: 'middle' });
        });
        ballLegend(svg, x, y + 16);
        return h;
      });

    /* ---- 8. ball by oil pattern ---- */
    var patternTotals = {};
    balls.forEach(function (b) { b.patterns.forEach(function (p) { patternTotals[p.pattern] = (patternTotals[p.pattern] || 0) + p.n; }); });
    var patternList = Object.keys(patternTotals).sort(function (a, b) { return patternTotals[b] - patternTotals[a]; }).slice(0, 5);
    if (patternList.length) {
      section('Ball by oil pattern',
        'Average score for each ball on each pattern, with the number of games in brackets. Darker is higher. A blank means that pair was never bowled.',
        function (svg, x, y, w) {
          var rowH = 58, head = 56, h = head + balls.length * rowH + 10, labelW = 220;
          var cellW = (w - labelW) / patternList.length;
          var vals = [];
          balls.forEach(function (b) { b.patterns.forEach(function (p) { vals.push(p.mean); }); });
          var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
          patternList.forEach(function (p, k) {
            svg.text(x + labelW + cellW * (k + 0.5), y + 30, p.length > 16 ? p.slice(0, 15) + '…' : p, { fontSize: 17, fontWeight: 700, fill: R.ink, textAnchor: 'middle' });
          });
          balls.forEach(function (b, i) {
            var ry = y + head + i * rowH;
            svg.rect(x, ry + 12, 12, 12, { rx: 3, fill: color(i) });
            svg.text(x + 24, ry + 24, b.label, { fontSize: 18, fontWeight: 700, fill: R.ink });
            patternList.forEach(function (name, k) {
              var cell = b.patterns.filter(function (p) { return p.pattern === name; })[0];
              var cx = x + labelW + cellW * k;
              if (!cell) { svg.rect(cx + 4, ry, cellW - 8, rowH - 8, { rx: 10, fill: 'none', stroke: R.grid, strokeWidth: 1.5, strokeDasharray: '4 4' }); return; }
              var t = hi === lo ? 0.6 : (cell.mean - lo) / (hi - lo);
              var fill = 'rgb(' + Math.round(222 - t * 150) + ',' + Math.round(233 - t * 105) + ',' + Math.round(248 - t * 45) + ')';
              svg.rect(cx + 4, ry, cellW - 8, rowH - 8, { rx: 10, fill: fill });
              svg.text(cx + cellW / 2, ry + 27, fix(cell.mean, 0), { fontSize: 24, fontWeight: 800, fill: t > 0.55 ? '#ffffff' : R.ink, textAnchor: 'middle' });
              svg.text(cx + cellW / 2, ry + 44, '(' + cell.n + ')', { fontSize: 14, fill: t > 0.55 ? '#e8f0fb' : R.soft, textAnchor: 'middle' });
            });
          });
          return h;
        });
    }

    /* ---- 9. league vs everything else ---- */
    var hasBoth = balls.some(function (b) { return b.league.n && b.other.n; });
    if (hasBoth) {
      section('League vs open play',
        'Average on league nights (coloured) against practice and tournament games (grey). League conditions are usually fresher oil, so a ball can look different between the two.',
        function (svg, x, y, w) {
          var rowH = 64, h = balls.length * rowH + 50, labelW = 200, pr = 60;
          var vals = [];
          balls.forEach(function (b) { if (b.league.n) vals.push(b.league.mean); if (b.other.n) vals.push(b.other.mean); });
          var lo = Math.floor(Math.min.apply(null, vals) / 10) * 10 - 10, hi = Math.ceil(Math.max.apply(null, vals) / 10) * 10 + 10;
          var sx = scale(lo, hi, x + labelW, x + w - pr);
          for (var v = lo; v <= hi; v += 10) {
            svg.line(sx(v), y + 4, sx(v), y + balls.length * rowH, { stroke: R.grid, strokeWidth: 1 });
            svg.text(sx(v), y + balls.length * rowH + 28, String(v), { fontSize: 15, fill: R.faint, textAnchor: 'middle' });
          }
          balls.forEach(function (b, i) {
            var cy = y + 30 + i * rowH;
            svg.text(x, cy + 5, b.label, { fontSize: 18, fontWeight: 700, fill: R.ink });
            svg.text(x, cy + 26, b.league.n + ' league · ' + b.other.n + ' other', { fontSize: 14, fill: R.soft });
            if (b.league.n && b.other.n) svg.line(sx(b.other.mean), cy, sx(b.league.mean), cy, { stroke: R.faint, strokeWidth: 4 });
            if (b.other.n) { svg.circle(sx(b.other.mean), cy, 9, { fill: '#9a9486', stroke: R.card, strokeWidth: 2 }); svg.text(sx(b.other.mean), cy - 16, fix(b.other.mean, 1), { fontSize: 15, fontWeight: 700, fill: R.soft, textAnchor: 'middle' }); }
            if (b.league.n) { svg.circle(sx(b.league.mean), cy, 9, { fill: color(i), stroke: R.card, strokeWidth: 2 }); svg.text(sx(b.league.mean), cy + 30, fix(b.league.mean, 1), { fontSize: 15, fontWeight: 800, fill: R.ink, textAnchor: 'middle' }); }
          });
          return h;
        });
    }

    /* ---- 10. correcting for noise ---- */
    if (report.shrunk) {
      section('Correcting for noise',
        'The raw average (hollow) against an estimate pulled toward the overall average in proportion to how noisy it is. A ball with few games moves a lot; one with many barely moves.',
        function (svg, x, y, w) {
          var rowH = 64, h = balls.length * rowH + 50, labelW = 200, pr = 60;
          var vals = [];
          balls.forEach(function (b) { vals.push(b.mean); if (report.shrunk.balls[b.id] != null) vals.push(report.shrunk.balls[b.id]); });
          var lo = Math.floor(Math.min.apply(null, vals) / 10) * 10 - 10, hi = Math.ceil(Math.max.apply(null, vals) / 10) * 10 + 10;
          var sx = scale(lo, hi, x + labelW, x + w - pr);
          for (var v = lo; v <= hi; v += 10) {
            svg.line(sx(v), y + 4, sx(v), y + balls.length * rowH, { stroke: R.grid, strokeWidth: 1 });
            svg.text(sx(v), y + balls.length * rowH + 28, String(v), { fontSize: 15, fill: R.faint, textAnchor: 'middle' });
          }
          balls.forEach(function (b, i) {
            var cy = y + 30 + i * rowH, s = report.shrunk.balls[b.id];
            svg.text(x, cy + 5, b.label, { fontSize: 18, fontWeight: 700, fill: R.ink });
            svg.text(x, cy + 26, b.n + ' games', { fontSize: 14, fill: R.soft });
            if (s == null) return;
            svg.line(sx(b.mean), cy, sx(s), cy, { stroke: R.faint, strokeWidth: 3 });
            svg.circle(sx(b.mean), cy, 9, { fill: R.card, stroke: R.soft, strokeWidth: 3 });
            svg.circle(sx(s), cy, 9, { fill: color(i), stroke: R.card, strokeWidth: 2 });
            svg.text(sx(s), cy + 32, fix(s, 1), { fontSize: 15, fontWeight: 800, fill: R.ink, textAnchor: 'middle' });
            svg.text(sx(b.mean), cy - 16, fix(b.mean, 1), { fontSize: 15, fill: R.soft, textAnchor: 'middle' });
          });
          return h;
        });

      section('Odds each ball is truly best',
        'Resample every ball’s games 4,000 times and count how often each ball comes out on top. This is the honest version of "which ball is best".',
        function (svg, x, y, w) {
          var order = balls.map(function (b, i) { return { b: b, i: i, p: report.bootstrap[b.id] || 0 }; }).sort(function (a, c) { return c.p - a.p; });
          var rowH = 54, h = order.length * rowH + 14, labelW = 250, maxW = w - labelW - 90;
          order.forEach(function (o, k) {
            var cy = y + 24 + k * rowH;
            svg.text(x, cy + 6, o.b.label, { fontSize: 19, fontWeight: 700, fill: R.ink });
            svg.rect(x + labelW, cy - 16, maxW, 32, { rx: 8, fill: R.grid });
            svg.rect(x + labelW, cy - 16, Math.max(4, maxW * o.p), 32, { rx: 8, fill: color(o.i) });
            svg.text(x + labelW + maxW + 14, cy + 7, (o.p * 100).toFixed(1) + '%', { fontSize: 21, fontWeight: 800, fill: R.ink });
          });
          return h;
        });
    }

    /* ---- 11. a three-game series ---- */
    section('What a 3-game series looks like',
      'Expected series for each ball: the box is one standard deviation either side of three times the average, the tick is the average. The percentages are the chance of reaching 600 or 700 in a series, assuming games are independent.',
      function (svg, x, y, w) {
        var rowH = 76, h = balls.length * rowH + 56, labelW = 190, pr = 190;
        var lo = Math.floor((Math.min.apply(null, balls.map(function (b) { return b.series.lo == null ? b.series.mean - 40 : b.series.lo; })) - 30) / 50) * 50;
        var hi = Math.ceil((Math.max.apply(null, balls.map(function (b) { return b.series.hi == null ? b.series.mean + 40 : b.series.hi; })) + 30) / 50) * 50;
        var sx = scale(lo, hi, x + labelW, x + w - pr);
        for (var v = lo; v <= hi; v += 50) {
          svg.line(sx(v), y + 4, sx(v), y + balls.length * rowH, { stroke: R.grid, strokeWidth: 1 });
          svg.text(sx(v), y + balls.length * rowH + 30, String(v), { fontSize: 15, fill: R.faint, textAnchor: 'middle' });
        }
        [600, 700].forEach(function (t) {
          if (t >= lo && t <= hi) {
            svg.line(sx(t), y + 4, sx(t), y + balls.length * rowH, { stroke: R.ink, strokeWidth: 1.5, strokeDasharray: '4 5' });
          }
        });
        svg.text(x + w, y + 16, '600+   700+', { fontSize: 14, fontWeight: 700, fill: R.soft, textAnchor: 'end' });
        balls.forEach(function (b, i) {
          var cy = y + 38 + i * rowH, s = b.series;
          svg.text(x, cy + 5, b.label, { fontSize: 18, fontWeight: 700, fill: R.ink });
          svg.text(x, cy + 26, 'avg ' + fix(b.mean, 1) + ' × 3', { fontSize: 14, fill: R.soft });
          if (s.lo != null) svg.rect(sx(s.lo), cy - 16, sx(s.hi) - sx(s.lo), 32, { rx: 8, fill: color(i), fillOpacity: 0.3, stroke: color(i), strokeWidth: 2.5 });
          svg.line(sx(s.mean), cy - 22, sx(s.mean), cy + 22, { stroke: R.ink, strokeWidth: 4 });
          svg.text(sx(s.mean), cy - 28, String(Math.round(s.mean)), { fontSize: 16, fontWeight: 800, fill: R.ink, textAnchor: 'middle' });
          svg.text(x + w - 90, cy + 7, pct(s.p600), { fontSize: 19, fontWeight: 800, fill: R.ink, textAnchor: 'end' });
          svg.text(x + w, cy + 7, pct(s.p700), { fontSize: 19, fontWeight: 800, fill: R.ink, textAnchor: 'end' });
        });
        return h;
      });

    /* ---- 12. the statistical tests ---- */
    if (report.tests) {
      section('The statistical tests',
        'Scores for each ball are compared three ways. A p-value under 0.05 would mean the difference is unlikely to be luck. Over that, the data cannot separate the balls yet.',
        function (svg, x, y, w) {
          var t = report.tests, tileW = (w - 36) / 3, th = 150;
          var tiles = [
            ['ANOVA', t.anova, 'One-way ANOVA across all balls', function (p) { return p < 0.05 ? 'Averages differ' : 'No real difference in averages'; }],
            ['Kruskal–Wallis', t.kruskal, 'No normal distribution assumed', function (p) { return p < 0.05 ? 'Scores differ' : 'No real difference in scores'; }],
            ['Levene', t.levene, 'Are the spreads the same?', function (p) { return p < 0.05 ? 'Spreads differ' : 'Spreads are statistically similar'; }],
          ];
          tiles.forEach(function (tl, k) {
            var tx = x + k * (tileW + 18);
            svg.rect(tx, y, tileW, th, { rx: 16, fill: '#f5f1e7', stroke: R.edge, strokeWidth: 1.5 });
            var p = tl[1] ? tl[1].p : null;
            svg.text(tx + 20, y + 72, p == null ? 'n/a' : (p < 0.001 ? '<0.001' : p.toFixed(2)), { fontSize: 54, fontWeight: 800, fill: R.ink, letterSpacing: -1.5 });
            svg.text(tx + 20, y + 100, 'p-value · ' + tl[0], { fontSize: 16, fontWeight: 700, fill: R.ink });
            svg.text(tx + 20, y + 122, tl[2], { fontSize: 14, fill: R.soft });
            svg.text(tx + 20, y + 142, p == null ? '' : tl[3](p), { fontSize: 15, fontWeight: 700, fill: p != null && p < 0.05 ? '#c2410c' : R.soft });
          });
          var rowH = 40, y0 = y + th + 40;
          var cols = [0, 0.43, 0.58, 0.72, 0.87];
          ['Pairwise (Welch)', 'Avg diff', 'Cohen d', 'Welch p', 'Holm p'].forEach(function (c, k) {
            svg.text(x + (k === 0 ? 0 : w * cols[k] + 40), y0, c, { fontSize: 15, fontWeight: 700, fill: R.soft, textAnchor: k === 0 ? 'start' : 'end' });
          });
          t.pairs.forEach(function (p, i) {
            var ry = y0 + 32 + i * rowH;
            svg.line(x, ry - 26, x + w, ry - 26, { stroke: R.grid, strokeWidth: 1 });
            svg.text(x, ry, p.aLabel + '  vs  ' + p.bLabel, { fontSize: 17, fontWeight: 600, fill: R.ink });
            [[1, (p.diff >= 0 ? '+' : '') + p.diff.toFixed(1)], [2, p.d.toFixed(2)], [3, B(p.p)], [4, B(p.holm)]].forEach(function (c) {
              svg.text(x + w * cols[c[0]] + 40, ry, c[1], { fontSize: 17, fontWeight: c[0] === 4 && p.holm < 0.05 ? 800 : 500, fill: c[0] === 4 && p.holm < 0.05 ? '#c2410c' : R.ink, textAnchor: 'end' });
            });
          });
          return th + 40 + 32 + t.pairs.length * rowH + 6;
        });
    }

    function B(p) { return p == null ? 'n/a' : p < 0.001 ? '<0.001' : p.toFixed(3); }

    /* ---- 13. what it all means ---- */
    pieces.push(function (svg, y, dry) {
      var items = report.takeaways;
      var colW = (CWID - 18) / 2, boxH = 190;
      var rows = Math.ceil(items.length / 2);
      var h = 70 + rows * (boxH + 18) + 190;
      if (dry) return h;
      svg.text(M, y + 44, 'What it all means', { fontSize: 36, fontWeight: 800, fill: R.ink, letterSpacing: -0.5 });
      items.forEach(function (it, k) {
        var bx = M + (k % 2) * (colW + 18), by = y + 70 + Math.floor(k / 2) * (boxH + 18);
        svg.rect(bx, by, colW, boxH, { rx: 18, fill: R.card, stroke: R.edge, strokeWidth: 1.5 });
        svg.text(bx + 24, by + 38, String(k + 1).padStart(2, '0'), { fontSize: 17, fontWeight: 800, fill: R.faint });
        var ty = by + 74;
        wrap(it.title, 26, colW - 48).forEach(function (l, i) { svg.text(bx + 24, ty + i * 32, l, { fontSize: 26, fontWeight: 800, fill: R.ink }); ty += i ? 0 : 0; });
        var tl = wrap(it.title, 26, colW - 48).length;
        textBlock(svg, bx + 24, by + 74 + tl * 32 + 6, it.body, 18, colW - 48, { fill: R.soft }, 25);
      });
      var cy = y + 70 + rows * (boxH + 18);
      svg.rect(M, cy, CWID, 150, { rx: 20, fill: R.dark });
      svg.text(M + 28, cy + 40, 'THE CAVEAT THAT MATTERS', { fontSize: 15, fontWeight: 800, fill: '#8fa6bf', letterSpacing: 1.5 });
      var cav = report.tests && report.tests.anova && report.tests.anova.p >= 0.05
        ? 'With this many games per ball, the differences between balls are within the range that luck alone produces. Keep logging games, and let the intervals shrink before choosing a favourite.'
        : 'These differences are large enough to stand out from chance, but they still mix ball with lane, pattern and form on the night. Treat them as guidance, not proof.';
      textBlock(svg, M + 28, cy + 74, cav, 20, CWID - 56, { fill: '#ffffff', fontWeight: 600 }, 28);
      return h;
    });

    /* ---- assemble: measure, then draw ---- */
    var gap = 20;
    var body = pieces.map(function (p) { return p(null, 0, true); });
    var total = headerH + 24 + body.reduce(function (a, h) { return a + h + gap; }, 0) + 170;
    var svg = Svg(W, total);
    svg.rect(0, 0, W, total, { fill: R.bg });

    /* header */
    svg.rect(M, 40, CWID, headerH - 40, { rx: 26, fill: R.dark });
    svg.text(M + 40, 92, 'LEAGUECRAFT BALL REPORT', { fontSize: 16, fontWeight: 800, fill: '#8fa6bf', letterSpacing: 2 });
    var title = balls.length + (balls.length === 1 ? ' ball. ' : ' balls. ') + report.games + ' games.';
    svg.text(M + 40, 158, title, { fontSize: 54, fontWeight: 800, fill: '#ffffff', letterSpacing: -1.2 });
    svg.text(M + 40, 218, report.headline, { fontSize: 54, fontWeight: 800, fill: '#ffffff', letterSpacing: -1.2 });
    var pText = report.tests && report.tests.anova ? '  ·  p=' + report.tests.anova.p.toFixed(2) + ' overall difference' : '';
    svg.text(M + 40, 258, report.games + ' games analysed' + (report.excluded ? '  ·  ' + report.excluded + ' ball' + (report.excluded === 1 ? '' : 's') + ' with too few games left out' : '') + pText,
      { fontSize: 19, fontWeight: 600, fill: '#c7d3e0' });

    var y = headerH + 24;
    pieces.forEach(function (p, i) {
      p(svg, y, false);
      y += body[i] + gap;
    });
    var method = 'Method. Each game counts toward the ball that threw most of its first balls. Intervals are 95% t-intervals. Tests: one-way ANOVA, Kruskal–Wallis, Brown–Forsythe (Levene), pairwise Welch with Holm correction. ' +
      'Odds of being best: 4,000 bootstrap resamples. Noise correction: empirical-Bayes shrinkage. Ball is confounded with lane, pattern and form, so treat this as guidance, not proof.';
    textBlock(svg, M, y + 30, method, 15, CWID, { fill: R.soft }, 22);
    svg.text(W / 2, total - 28, 'Made with LeagueCraft', { fontSize: 15, fill: R.faint, textAnchor: 'middle' });
    return { svg: svg.toString(), width: W, height: total };
  }

  /* ======================================================================
     Turning a picture into files
     ====================================================================== */

  /* The browser limits how big a canvas can be; stay under the smallest limit. */
  function pickScale(w, h, want) {
    return Math.max(0.5, Math.min(want || 2, Math.sqrt(14000000 / (w * h))));
  }

  function rasterize(picture, type, quality, want) {
    return new Promise(function (resolve, reject) {
      var scale = pickScale(picture.width, picture.height, want);
      var url = URL.createObjectURL(new Blob([picture.svg], { type: 'image/svg+xml;charset=utf-8' }));
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(picture.width * scale);
        canvas.height = Math.round(picture.height * scale);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (!blob) return reject(new Error('This browser could not make the image.'));
          resolve({ blob: blob, width: canvas.width, height: canvas.height });
        }, type || 'image/png', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('This browser could not draw the picture.')); };
      img.src = url;
    });
  }

  /* A one-page PDF that holds the picture as a JPEG. */
  function pdfFromJpeg(bytes, pxW, pxH) {
    var enc = new TextEncoder();
    var W = Math.round(pxW * 0.75 * 100) / 100, H = Math.round(pxH * 0.75 * 100) / 100;
    var chunks = [], offsets = [], size = 0;
    function put(x) { var b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); size += b.length; }
    function obj(n, body) { offsets[n] = size; put(n + ' 0 obj\n'); body(); put('\nendobj\n'); }
    put('%PDF-1.4\n');
    obj(1, function () { put('<< /Type /Catalog /Pages 2 0 R >>'); });
    obj(2, function () { put('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'); });
    obj(3, function () { put('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'); });
    obj(4, function () {
      put('<< /Type /XObject /Subtype /Image /Width ' + pxW + ' /Height ' + pxH + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + bytes.length + ' >>\nstream\n');
      put(bytes);
      put('\nendstream');
    });
    var content = 'q ' + W + ' 0 0 ' + H + ' 0 0 cm /Im0 Do Q';
    obj(5, function () { put('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream'); });
    var xref = size;
    put('xref\n0 6\n0000000000 65535 f \n');
    for (var i = 1; i <= 5; i++) put(String(offsets[i]).padStart(10, '0') + ' 00000 n \n');
    put('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    var out = new Uint8Array(size), at = 0;
    chunks.forEach(function (c) { out.set(c, at); at += c.length; });
    return out;
  }

  function toPdf(picture) {
    return rasterize(picture, 'image/jpeg', 0.92, 1.5).then(function (r) {
      return r.blob.arrayBuffer().then(function (buf) {
        return new Blob([pdfFromJpeg(new Uint8Array(buf), r.width, r.height)], { type: 'application/pdf' });
      });
    });
  }

  function download(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* The phone's share sheet where there is one, a download everywhere else. */
  function shareOrSave(blob, filename, title) {
    try {
      var file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: title || filename }).then(function () { return 'shared'; }, function (e) {
          if (e && e.name === 'AbortError') return 'cancelled';
          download(blob, filename);
          return 'saved';
        });
      }
    } catch (e) { /* fall through to a download */ }
    download(blob, filename);
    return Promise.resolve('saved');
  }

  var api = {
    scorecard: scorecard, ballReport: ballReport,
    rasterize: rasterize, toPdf: toPdf, pdfFromJpeg: pdfFromJpeg, shareOrSave: shareOrSave, download: download,
    esc: esc, wrap: wrap,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.Cards = api;
})();
