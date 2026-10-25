/*
 * The shot tracker's "At a glance" landing page and the performance calendar.
 *
 * The calendar colours each day you bowled by how that session went against your own average
 * (blue above, orange below) and opens a day into its full session: the scores, the balls and the
 * pins left. The glance page pulls the main figures from every other part of the stats into one
 * long infographic.
 *
 * create(h) takes what it needs from the page: h.ui (shared state), h.allGames, h.library,
 * h.ballName, h.thumb, h.leaveDeck, h.badgeCtx, h.badgeIcons, h.setBadgeChips, h.scorecard,
 * h.head, h.subnav, h.draw, h.rerender, h.shareName, h.periodRange, h.button.
 */
(function () {
  'use strict';

  var el = UI.el;
  var S = window.Shots;
  var T = window.Trends;

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function pct(v) { return v == null ? '—' : Math.round(v * 100) + '%'; }
  function pct1(v) { return v == null ? '—' : (v * 100).toFixed(1) + '%'; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function signed(v, d) {
    if (v == null || !isFinite(v)) return '—';
    var t = Math.abs(v).toFixed(d == null ? 0 : d);
    return (v > 0.0001 ? '+' : v < -0.0001 ? '−' : '') + t;
  }
  function ymd(date) { return /^\d{4}-\d{2}-\d{2}/.test(String(date || '')) ? String(date).slice(0, 10) : null; }
  function monthOf(date) { return String(date).slice(0, 7); }
  function longDay(date) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!m) return date;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return DAYS[d.getUTCDay()] + ' ' + MONTHS[+m[2] - 1].slice(0, 3) + ' ' + (+m[3]) + ', ' + m[1];
  }
  function byOrder(a, b) {
    return (a.gameNo || 0) - (b.gameNo || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  }

  /* ---------- sessions: the games of one day ---------- */

  function sessions(pool) {
    var by = {};
    S.finished(pool).forEach(function (g) {
      var d = ymd(g.date);
      if (d) (by[d] = by[d] || []).push(g);
    });
    return Object.keys(by).sort().map(function (d) {
      var gs = by[d].slice().sort(byOrder);
      var a = S.analyze(gs);
      var total = gs.reduce(function (t, g) { return t + S.score(g).total; }, 0);
      return { date: d, games: gs, a: a, avg: a.average, total: total };
    });
  }

  /* How far each session sits from the bowler's own average, and the size of a "big" swing. */
  function performance(list, overall) {
    list.forEach(function (s) { s.delta = s.avg - overall; });
    var deltas = list.map(function (s) { return s.delta; });
    var mean = deltas.reduce(function (a, b) { return a + b; }, 0) / (deltas.length || 1);
    var sd = Math.sqrt(deltas.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / (deltas.length || 1));
    return Math.max(12, sd * 1.4);
  }

  function tone(delta, scale) {
    var t = Math.max(-1, Math.min(1, delta / scale));
    var base = t >= 0 ? 'var(--div-pos)' : 'var(--div-neg)';
    return 'color-mix(in srgb, ' + base + ' ' + Math.round(16 + 56 * Math.abs(t)) + '%, var(--surface))';
  }

  function create(h) {
    var ui = h.ui;

    /* ====================================================================
       The performance calendar
       ==================================================================== */

    function calendarCard(sess, overall, scale, options) {
      options = options || {};
      var compact = !!options.compact;
      if (!sess.length) {
        return UI.card('Performance calendar', null, UI.empty('Finish a game and the days you bowled light up here.'));
      }
      var months = {};
      sess.forEach(function (s) { months[monthOf(s.date)] = true; });
      var keys = Object.keys(months).sort();
      var key = keys.indexOf(ui.calMonth) !== -1 ? ui.calMonth : keys[keys.length - 1];
      var idx = keys.indexOf(key);
      var year = +key.slice(0, 4), month = +key.slice(5, 7) - 1;
      var byDate = {};
      sess.forEach(function (s) { byDate[s.date] = s; });
      var todayKey = h.today();

      function go(k) { ui.calMonth = k; ui.calDay = null; h.rerender(); }
      var nav = el('div', { class: 'cal-nav' }, [
        el('button', { type: 'button', class: 'cal-step', 'aria-label': 'Earlier month', disabled: idx <= 0, onclick: function () { go(keys[idx - 1]); } }, '‹'),
        el('strong', { class: 'cal-title', text: MONTHS[month] + ' ' + year }),
        el('button', { type: 'button', class: 'cal-step', 'aria-label': 'Later month', disabled: idx >= keys.length - 1, onclick: function () { go(keys[idx + 1]); } }, '›'),
      ]);

      var cells = DAYS.map(function (d) { return el('span', { class: 'cal-dow', text: d.charAt(0), 'aria-hidden': 'true' }); });
      var first = new Date(Date.UTC(year, month, 1)).getUTCDay();
      var count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      for (var i = 0; i < first; i++) cells.push(el('span', { class: 'cal-cell is-pad', 'aria-hidden': 'true' }));
      for (var day = 1; day <= count; day++) {
        (function (d) {
          var date = key + '-' + (d < 10 ? '0' : '') + d;
          var s = byDate[date];
          var cls = 'cal-cell' + (date === todayKey ? ' is-today' : '');
          if (!s) { cells.push(el('span', { class: cls, 'aria-hidden': 'true' }, el('span', { class: 'cal-d', text: String(d) }))); return; }
          var label = longDay(date) + ': ' + plural(s.games.length, 'game') + ', average ' + Math.round(s.avg) + ' (' + signed(s.delta) + ' against your average)';
          cells.push(el('button', {
            type: 'button', class: cls + ' has-session' + (ui.calDay === date && !compact ? ' is-open' : ''),
            style: 'background:' + tone(s.delta, scale), title: label, 'aria-label': label, 'aria-pressed': ui.calDay === date ? 'true' : 'false',
            onclick: function () {
              if (compact) { ui.statsTab = 'calendar'; ui.calMonth = key; ui.calDay = date; location.hash = '#/shots/stats'; h.rerender(); return; }
              ui.calDay = ui.calDay === date ? null : date;
              h.rerender();
            },
          }, [el('span', { class: 'cal-d', text: String(d) }), el('span', { class: 'cal-v', text: String(Math.round(s.avg)) })]));
        })(day);
      }

      var inMonth = sess.filter(function (s) { return monthOf(s.date) === key; });
      var monthGames = inMonth.reduce(function (t, s) { return t + s.games.length; }, 0);
      var monthPins = inMonth.reduce(function (t, s) { return t + s.total; }, 0);
      var bestDay = inMonth.slice().sort(function (a, b) { return b.avg - a.avg; })[0];
      var summary = el('p', { class: 'sh-note cal-sum', text: plural(inMonth.length, 'session') + ' · ' + plural(monthGames, 'game') +
        ' · average ' + UI.avg(monthPins / monthGames) + (bestDay ? ' · best day ' + longDay(bestDay.date).replace(/^\w+ /, '') + ' (' + Math.round(bestDay.avg) + ')' : '') });

      var legend = el('div', { class: 'cal-legend', 'aria-hidden': 'true' }, [
        el('span', { text: 'Below your ' + Math.round(overall) }),
        el('i', { class: 'cal-ramp' }),
        el('span', { text: 'Above' }),
      ]);

      var detail = !compact && ui.calDay && byDate[ui.calDay] && monthOf(ui.calDay) === key ? dayDetail(byDate[ui.calDay], overall) : null;
      return UI.card('Performance calendar', compact ? 'Latest month, tap a day for its session' : 'Each day coloured by how that session went against your average',
        el('div', null, [
          el('div', { class: 'card-body' }, [nav, el('div', { class: 'cal', role: 'group', 'aria-label': 'Calendar of ' + MONTHS[month] + ' ' + year }, cells), legend, summary,
            compact ? null : el('p', { class: 'sh-hint', text: detail ? 'Tap the day again to close it.' : 'Tap a coloured day to open that session.' })]),
          detail,
        ]),
        'Every day with a finished game is coloured by that day’s average game against your overall average: blue when it was above, orange when it was below, stronger the further from usual. The number is the day’s average. Opening a day shows its scores, the balls you used and the pins you left.');
    }

    /* One day opened up: scores, balls, pin leaves. */
    function dayDetail(s, overall) {
      var gs = s.games, a = s.a;
      var first = gs[0];
      var meta = [first.event ? first.event.charAt(0).toUpperCase() + first.event.slice(1) : null, first.location, first.pattern, first.lane ? 'lane ' + first.lane : null].filter(Boolean).join(' · ');

      var sets = S.setsOf(gs, { all: true });
      var setIds = sets.filter(function (x) { return !x.standalone; });
      var scores = el('div', { class: 'cal-scores' }, gs.map(function (g) {
        var total = S.score(g).total;
        return el('a', { class: 'cal-score', href: '#/shots/game/' + g.id, title: 'Open this game' }, [
          el('small', { text: 'Game ' + (g.gameNo || gs.indexOf(g) + 1) }),
          el('strong', { text: String(total) }),
          el('small', { class: total >= overall ? 'is-up' : 'is-down', text: signed(total - overall) }),
          h.badgeIcons(g),
        ]);
      }));

      var tiles = UI.statGrid([
        UI.stat('Total', String(s.total), plural(gs.length, 'game') + ' bowled that day.'),
        UI.stat('Average', UI.avg(a.average), signed(s.delta, 1) + ' against your overall ' + UI.avg(overall) + '.'),
        UI.stat('Strike %', pct1(a.strikePct)),
        UI.stat('Spare %', pct1(a.sparePct)),
        UI.stat('Makeable spare %', pct1(a.makeablePct)),
        UI.stat('Open frames', String(a.opens)),
      ]);

      /* the balls used that day */
      var ids = [];
      gs.forEach(function (g) { S.ballsInGame(g).forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); }); });
      var ballRows = ids.map(function (id) {
        var mine = gs.filter(function (g) { return S.ballsInGame(g).indexOf(id) !== -1; });
        var led = gs.filter(function (g) { return S.primaryBall(g) === id; });
        var shots = S.analyze(gs, { ball: id });
        return { id: id, games: mine.length, led: led.length, avg: led.length ? led.reduce(function (t, g) { return t + S.score(g).total; }, 0) / led.length : null,
          strike: shots.racks ? shots.strikePct : null, spare: shots.attempts ? shots.sparePct : null, racks: shots.racks };
      });
      var ballTable = ballRows.length ? UI.table({
        columns: [
          { key: 'b', label: 'Ball', sortable: false, className: 'col-name', render: function (r) { return el('span', { class: 'sh-ballrow' }, [h.thumb(r.id, 'sm'), h.ballName(r.id)]); } },
          { key: 'g', label: 'Games', sortable: false, render: function (r) { return String(r.games); } },
          { key: 'a', label: 'Avg', sortable: false, className: 'num-strong', render: function (r) { return r.avg == null ? '—' : UI.avg(r.avg); } },
          { key: 's', label: 'Strike %', sortable: false, render: function (r) { return pct(r.strike); } },
          { key: 'p', label: 'Spare %', sortable: false, render: function (r) { return pct(r.spare); } },
        ], rows: ballRows, state: null, onSort: function () {},
      }) : UI.empty('No ball recorded.');

      /* the pins left that day */
      var leaves = a.leaves.slice(0, 8);
      var leaveBlock = leaves.length ? el('div', null, [
        UI.table({
          columns: [
            { key: 'n', label: 'Leave', sortable: false, className: 'col-name', render: function (r) { return h.leaveDeck(r.key, r.label); } },
            { key: 's', label: 'Seen', sortable: false, render: function (r) { return String(r.seen); } },
            { key: 'm', label: 'Made', sortable: false, render: function (r) { return r.made + '/' + r.attempts; } },
            { key: 'p', label: 'Spare %', sortable: false, className: 'num-strong', render: function (r) { return pct(r.pct); } },
          ], rows: leaves, state: null, onSort: function () {},
        }),
        a.leaves.length > 8 ? el('p', { class: 'sh-note sh-pad', text: 'The 8 most common of ' + a.leaves.length + ' different leaves.' }) : null,
      ]) : UI.empty('Every first ball was a strike. Nothing left standing.');

      var cards = el('details', { class: 'sh-details' }, [el('summary', { text: 'Scorecards' }), el('div', { class: 'sh-stack cal-cards' }, gs.map(function (g) {
        return el('div', null, [el('p', { class: 'sh-note', text: 'Game ' + (g.gameNo || gs.indexOf(g) + 1) + ': ' + S.score(g).total }), h.scorecard(g, null, { editable: true })]);
      }))]);

      return el('section', { class: 'cal-day', 'aria-label': longDay(s.date) }, [
        el('div', { class: 'card-body sh-stack' }, [
          el('div', { class: 'cal-dayhead' }, [el('h3', { text: longDay(s.date) }), meta ? el('p', { class: 'sh-note', text: meta }) : null]),
          scores,
          setIds.length ? el('div', { class: 'sh-stack' }, setIds.map(function (set) {
            return el('div', { class: 'cal-setrow' }, [el('a', { href: '#/shots/set/' + set.id, text: set.complete ? 'Series ' + set.total : 'Set so far ' + set.total }), h.setBadgeChips(set)]);
          })) : null,
          tiles,
        ]),
        el('h4', { class: 'sh-subhead sh-pad', text: 'Balls that day' }), ballTable,
        el('h4', { class: 'sh-subhead sh-pad', text: 'Pins left that day' }), leaveBlock,
        el('div', { class: 'card-body' }, cards),
      ]);
    }

    /* The calendar as a stats tab. */
    function calendarCards(ctx) {
      var pool = S.finished(ctx.pool);
      var overall = S.analyze(pool).average;
      var list = sessions(pool);
      var scale = list.length ? performance(list, overall) : 12;
      return [calendarCard(list, overall, scale)];
    }

    /* ====================================================================
       At a glance
       ==================================================================== */

    function periodChips() {
      var periods = [['all', 'All time'], ['365', 'Last year'], ['90', 'Last 90 days'], ['30', 'Last 30 days']];
      var cur = ui.glancePeriod || 'all';
      return el('div', { class: 'sh-chips is-inline', role: 'group', 'aria-label': 'Period' }, periods.map(function (p) {
        return el('button', { type: 'button', class: 'sh-chip' + (cur === p[0] ? ' is-on' : ''), 'aria-pressed': cur === p[0] ? 'true' : 'false',
          onclick: function () { ui.glancePeriod = p[0]; h.rerender(); } }, p[1]);
      }));
    }

    function section(title, hint, body, explain) {
      return UI.card(title, hint, body, explain);
    }

    function glancePage() {
      var everything = S.finished(h.allGames());
      var period = ui.glancePeriod || 'all';
      var pool = period === 'all' ? everything : S.filter(everything, h.periodRange(period));
      var name = h.shareName();

      if (!everything.length) {
        h.draw([
          h.head(name || 'Bowler at a glance', 'Everything about your game in one place'),
          h.subnav('glance'),
          UI.card(null, null, el('div', { class: 'card-body sh-stack' }, [
            UI.empty('Finish a game, or import your history, and this page fills with your averages, form, balls, pins left and records.'),
            el('div', { class: 'sh-actions' }, [
              el('a', { class: 'sh-btn is-primary', href: '#/shots/new', text: 'Start a game' }),
              el('a', { class: 'sh-btn', href: '#/shots/import', text: 'Import games' }),
            ]),
          ])),
        ]);
        return;
      }

      var a = S.analyze(pool);
      var all = S.analyze(everything);
      var ordered = pool.slice().sort(function (x, y) { return String(x.date || '').localeCompare(String(y.date || '')) || String(x.createdAt || '').localeCompare(String(y.createdAt || '')); });
      var list = sessions(pool);
      var overall = a.average;
      var cards = [];

      /* ---- the headline ---- */
      var recent = ordered.slice(-10);
      var recentAvg = recent.length ? recent.reduce(function (t, g) { return t + S.score(g).total; }, 0) / recent.length : null;
      var formDelta = recent.length >= 5 && overall != null ? recentAvg - overall : null;
      var firstDate = ordered[0] && ordered[0].date, lastDate = ordered[ordered.length - 1] && ordered[ordered.length - 1].date;
      var verdict = formDelta == null ? 'Not enough games for a form read yet'
        : formDelta >= 6 ? 'Running hot: the last ' + recent.length + ' games are ' + signed(formDelta, 1) + ' above your average'
        : formDelta <= -6 ? 'A cold patch: the last ' + recent.length + ' games are ' + signed(formDelta, 1) + ' against your average'
        : 'Steady: the last ' + recent.length + ' games are right around your average (' + signed(formDelta, 1) + ')';
      cards.push(el('section', { class: 'card gl-hero' }, [
        el('div', { class: 'gl-hero-main' }, [
          el('p', { class: 'gl-kicker', text: name ? name : 'Bowler at a glance' }),
          el('div', { class: 'gl-big', text: UI.avg(overall) }),
          el('p', { class: 'gl-sub', text: 'average over ' + plural(a.games, 'game') + ' in ' + plural(list.length, 'session') }),
        ]),
        el('div', { class: 'gl-hero-side' }, [
          el('div', { class: 'gl-pill' }, [el('span', { text: 'High game' }), el('strong', { text: UI.num(a.high) })]),
          el('div', { class: 'gl-pill' }, [el('span', { text: '200+ games' }), el('strong', { text: a.over200 + ' of ' + a.games })]),
          el('div', { class: 'gl-pill' }, [el('span', { text: 'Since' }), el('strong', { text: firstDate ? UI.shortDate(firstDate) : '—' })]),
        ]),
        el('p', { class: 'gl-verdict', text: verdict + '.' }),
        el('div', { class: 'gl-period' }, periodChips()),
      ]));

      /* ---- form: the rolling average ---- */
      var prog = T.progress(pool, { window: 10 });
      var pts = prog.games.slice(-40);
      cards.push(section('Form', 'Average of the last 10 games, after each game',
        el('div', { class: 'card-body' }, Charts.timeseries({
          series: [{ key: 's1', name: 'Rolling average of 10', points: pts.map(function (r) { return { t: r.t, v: r.average, label: UI.shortDate(r.date), caption: 'scored ' + r.score }; }),
            dots: pts.map(function (r) { return { t: r.t, v: r.score }; }) }],
          tFormat: function (d) { return UI.shortDate(new Date(d * 86400000).toISOString().slice(0, 10)); },
          format: function (v) { return v.toFixed(1); }, formatEnd: function (v) { return v.toFixed(0); },
          integerTicks: false, formatAxis: function (v) { return v.toFixed(0); }, legend: false, label: 'Rolling average',
        })),
        'The line is your average over the 10 games up to that point; the faint dots are single games.'));

      /* ---- how the frames go ---- */
      var frames = a.strikes + a.spares + a.opens;
      if (frames) {
        var seg = function (cls, label, n) { return n ? el('span', { class: 'gl-seg ' + cls, style: 'flex:' + n, title: label + ': ' + n }, el('b', { text: Math.round(n / frames * 100) + '%' })) : null; };
        cards.push(section('How your frames go', plural(frames, 'frame') + ' counted',
          el('div', { class: 'card-body sh-stack' }, [
            el('div', { class: 'gl-bar', role: 'img', 'aria-label': 'Strikes ' + a.strikes + ', spares ' + a.spares + ', open frames ' + a.opens }, [seg('is-strike', 'Strikes', a.strikes), seg('is-spare', 'Spares', a.spares), seg('is-open', 'Open', a.opens)]),
            el('div', { class: 'gl-key' }, [
              el('span', null, [el('i', { class: 'gl-dot is-strike' }), 'Strike ' + pct1(a.strikePct)]),
              el('span', null, [el('i', { class: 'gl-dot is-spare' }), 'Spare ' + pct1(a.sparePct) + ' of tries']),
              el('span', null, [el('i', { class: 'gl-dot is-open' }), 'Open ' + UI.avg(a.opensPerGame) + ' a game']),
            ]),
            UI.statGrid([
              UI.stat('Makeable spare %', pct1(a.makeablePct), a.makeable.made + ' of ' + a.makeable.attempts + ' spare tries that were not splits.'),
              UI.stat('First-ball average', UI.avg(a.firstBallAvg), 'Pins on the first ball, on average. Ten is a strike.'),
              UI.stat('Strikes a game', UI.avg(a.strikesPerGame)),
              UI.stat('Clean games', a.clean + ' of ' + a.games, 'Games with no open frame.'),
            ]),
          ])));
      }

      /* ---- series ---- */
      var sets = S.setsOf(pool);
      var sizes = S.seriesSizes(sets);
      if (sizes.length) {
        var sz = sizes[0].size;
        var ser = S.seriesStats(sets, { size: sz });
        cards.push(section('Series', plural(ser.count, 'set') + ' of ' + sz + ' games',
          el('div', { class: 'card-body' }, UI.statGrid([
            UI.stat('Average series', UI.num(ser.average)),
            UI.stat('High series', UI.num(ser.high)),
            UI.stat('Low series', UI.num(ser.low)),
            UI.stat('600+ series', String(ser.over600), 'Sets averaging 200 or more a game.'),
            UI.stat('Game to game', UI.avg(ser.spread, 0) + ' pins', 'How far apart your best and worst game of a set are, on average.'),
            UI.stat('Finish vs start', (ser.fade > 0 ? '+' : '') + UI.avg(ser.fade, 0), 'Your last game of a set against your first. Positive means you finish stronger.'),
          ])),
          'Series only compare with series of the same length, so this is your usual length' + (sizes.length > 1 ? '. The Stats page has the others.' : '.')));
      }

      /* ---- strong start or fade ---- */
      var byFrame = a.byFrame.filter(function (x) { return x.racks; });
      if (byFrame.length > 2 && a.strikePct != null) {
        cards.push(section('Start strong or fade?', 'Strike % by frame',
          el('div', { class: 'card-body' }, Charts.columns({
            points: byFrame.map(function (x) { return { label: 'Frame ' + x.frame, axis: String(x.frame), value: (x.pct || 0) * 100, caption: x.strikes + ' strikes in ' + plural(x.racks, 'first ball') }; }),
            reference: { value: a.strikePct * 100, label: 'overall ' + (a.strikePct * 100).toFixed(0) + '%' },
            format: function (v) { return v.toFixed(0) + '%'; }, formatAxis: function (v) { return v + '%'; },
            keys: { above: 'Above your overall strike %', below: 'Below your overall strike %' }, referenceName: 'your overall',
            domain: [0, 100], label: 'Strike percentage by frame',
          }))));
      }

      /* ---- oil patterns ---- */
      var pats = S.compare(pool, 'pattern').filter(function (r) { return r.key && r.stats.games >= 3; }).sort(function (x, y) { return y.stats.average - x.stats.average; }).slice(0, 5);
      if (pats.length > 1) {
        cards.push(section('By oil pattern', 'Average game on each (three games or more)',
          el('div', { class: 'card-body' }, Charts.bars({
            wideLabel: true,
            rows: pats.map(function (r) { return { label: r.label, value: r.stats.average, display: UI.avg(r.stats.average), title: r.label + ': ' + plural(r.stats.games, 'game') + ', strike ' + pct(r.stats.strikePct) }; }),
          }))));
      }

      /* ---- records and streaks ---- */
      var ctx = h.badgeCtx();
      var record = null;
      if (ctx.gameRecord) { var rg = everything.filter(function (g) { return g.id === ctx.gameRecord; })[0]; if (rg) record = { game: rg, total: S.score(rg).total }; }
      var seriesBest = S.setsOf(everything).filter(function (x) { return ctx.seriesRecords[x.id]; })[0];
      var honors = everything.filter(function (g) { return S.score(g).total >= ctx.honor.game; }).length;
      var chips = [];
      if (record) chips.push(['PR game', String(record.total), UI.shortDate(record.game.date), '#/shots/game/' + record.game.id]);
      if (seriesBest) chips.push(['PR series', String(seriesBest.total), UI.shortDate(seriesBest.date), '#/shots/set/' + seriesBest.id]);
      chips.push(['Honor games', String(honors), ctx.honor.game + '+ games', null]);
      chips.push(['Best strike run', String(a.bestStreak), a.bestStreak ? S.runName(a.bestStreak) : 'no streak yet', null]);
      chips.push(['Turkeys or better', String(a.streaks3), 'runs of 3+ strikes', null]);
      chips.push(['250+ games', String(a.over250), 'of ' + plural(a.games, 'game'), null]);
      cards.push(section('Records and streaks', 'Your best, all time where it says so',
        el('div', { class: 'gl-medals' }, chips.map(function (c) {
          var inner = [el('span', { class: 'gl-medal-k', text: c[0] }), el('strong', { text: c[1] }), el('small', { text: c[2] })];
          return c[3] ? el('a', { class: 'gl-medal', href: c[3] }, inner) : el('div', { class: 'gl-medal' }, inner);
        })),
        'Personal records and honor lines cover every game you have finished, whatever period is chosen above. The honor line is set under Settings.'));

      /* ---- arsenal ---- */
      var balls = T.balls(pool, { label: h.ballName, minGames: 1 }).slice(0, 4);
      if (balls.length) {
        var top = balls.filter(function (b) { return b.n >= 3; }).sort(function (x, y) { return y.mean - x.mean; })[0];
        var carry = balls.filter(function (b) { return b.offPocketN >= 5; }).sort(function (x, y) { return y.offPocketStrikePct - x.offPocketStrikePct; })[0];
        cards.push(section('Arsenal', 'Your most used balls',
          el('div', { class: 'gl-balls' }, balls.map(function (b, i) {
            var tags = [i === 0 ? 'Most used' : null, top && top.id === b.id ? 'Highest average' : null, carry && carry.id === b.id ? 'Carries when off-pocket' : null].filter(Boolean);
            return el('div', { class: 'gl-ball' }, [
              h.thumb(b.id, 'md'),
              el('div', { class: 'gl-ball-main' }, [
                el('strong', { text: b.label }),
                el('span', { class: 'sh-note', text: plural(b.n, 'game') + ' · avg ' + UI.avg(b.mean) + ' · strike ' + pct(b.strikePct) }),
                tags.length ? el('span', { class: 'gl-tags' }, tags.map(function (t) { return el('em', { text: t }); })) : null,
              ]),
            ]);
          })),
          'A game counts toward the ball that threw most of its first balls. Highest average needs three games; carrying off-pocket needs five off-pocket hits.'));
      }

      /* ---- the pins left ---- */
      var leaves = a.leaves;
      if (leaves.length || a.racks) {
        var common = leaves.slice(0, 4);
        var hard = leaves.filter(function (l) { return l.attempts >= 4; }).sort(function (x, y) { return x.pct - y.pct || y.attempts - x.attempts; }).slice(0, 4);
        var row = function (l) {
          return el('div', { class: 'gl-leave' }, [h.leaveDeck(l.key, l.label), el('div', null, [el('strong', { text: l.label }), el('span', { class: 'sh-note', text: l.seen + ' seen · ' + pct(l.pct) + ' converted' })])]);
        };
        cards.push(section('Pins left', 'What the first ball leaves',
          el('div', { class: 'card-body sh-stack' }, [
            UI.statGrid([
              UI.stat('Splits', pct1(a.splitPct), 'How often the first ball left a split.'),
              UI.stat('Pocket %', pct1(a.hits.pocket.pct), 'Share of first balls that hit the pocket, of those where the hit was recorded.'),
            ]),
            common.length ? el('div', null, [el('h4', { class: 'sh-subhead', text: 'Most common' }), el('div', { class: 'gl-leaves' }, common.map(row))]) : null,
            hard.length ? el('div', null, [el('h4', { class: 'sh-subhead', text: 'Hardest to pick up' }), el('div', { class: 'gl-leaves' }, hard.map(row))]) : null,
          ]),
          'Hardest to pick up needs at least four tries at the leave.'));
      }

      /* ---- calendar and months ---- */
      var scale = list.length ? performance(list, overall) : 12;
      cards.push(calendarCard(list, overall, scale, { compact: true }));

      var months = {};
      pool.forEach(function (g) { var k = String(g.date || '').slice(0, 7); if (k) (months[k] = months[k] || []).push(g); });
      var gridRows = Object.keys(months).sort().map(function (k) { var m = S.analyze(months[k]); return { key: k, games: m.games, average: m.average, high: m.high, low: m.low }; });
      if (gridRows.length) {
        cards.push(section('Month by month', 'Games, average, high and low game',
          UI.monthGrid({ rows: gridRows, empty: 'No finished games yet.' }),
          'Each figure is shaded in proportion to your best month for it, with a tab on the best.'));
      }

      cards.push(UI.card(null, null, el('div', { class: 'sh-actions' }, [
        el('a', { class: 'sh-btn', href: '#/shots/stats', text: 'All the stats' }),
        el('a', { class: 'sh-btn', href: '#/shots/games', text: 'Your games' }),
      ])));

      h.draw([h.head(name || 'Bowler at a glance', all.games + ' games recorded' + (lastDate ? ', latest ' + UI.shortDate(lastDate) : '')), h.subnav('glance')].concat(cards));
    }

    return { glance: glancePage, calendarCards: calendarCards };
  }

  window.ShotsGlance = { create: create };
})();
