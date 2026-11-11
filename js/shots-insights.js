/*
 * The Progress and Balls tabs of the shot tracker's stats: charts and tables
 * for seeing how you are improving and how your balls compare, especially how
 * forgiving each one is on a given oil pattern. The figures come from
 * trends.js; this file only draws them.
 *
 * create(h) takes the few things it needs from the page (h.ballName, h.thumb,
 * h.rerender, h.state, h.today) and returns { progress(ctx), balls(ctx) },
 * each giving a list of cards.
 */
(function () {
  'use strict';

  var el = UI.el;
  var S = window.Shots;
  var T = window.Trends;

  function iso(day) { return new Date(day * 86400000).toISOString().slice(0, 10); }
  function tLabel(day) { return UI.shortDate(iso(day)); }
  function pct(v) { return v == null ? '—' : Math.round(v * 100) + '%'; }
  function pct1(v) { return v == null ? '—' : (v * 100).toFixed(1) + '%'; }
  function fix(v, d) { return v == null || !isFinite(v) ? '—' : v.toFixed(d == null ? 1 : d); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  function create(h) {
    /* ---------- colours: a ball keeps its colour everywhere ---------- */

    /* Balls ranked by games as the main ball across everything, so a ball's
       colour does not change when a filter removes another ball. */
    function slots(pool, chosen) {
      var count = {};
      S.finished(pool).forEach(function (g) { var id = S.primaryBall(g); if (id) count[id] = (count[id] || 0) + 1; });
      var rank = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; });
      var out = {}, used = {};
      chosen.slice().sort(function (a, b) { return rank.indexOf(a) - rank.indexOf(b); }).forEach(function (id) {
        var s = rank.indexOf(id);
        if (s > -1 && s < 4 && !used[s]) { out[id] = 's' + (s + 1); used[s] = true; }
      });
      chosen.forEach(function (id) {
        if (out[id]) return;
        for (var s = 0; s < 4; s++) if (!used[s]) { out[id] = 's' + (s + 1); used[s] = true; return; }
      });
      return out;
    }

    function shortDay(g) { return UI.shortDate(g.date) + (g.pattern ? ' · ' + g.pattern : ''); }

    function detailsTable(table) {
      return el('details', { class: 'sh-details' }, [el('summary', { text: 'Show the numbers' }), table]);
    }

    /* ============================ PROGRESS ============================ */

    function progress(ctx) {
      var games = ctx.games;                     /* finished, filtered, ball filter applied */
      if (!games.length) return [UI.card('Progress', null, UI.empty('Finish a few games and your progress shows up here.'))];
      var P = T.progress(games, { window: 10 });
      var rows = P.games;
      var byId = {};
      games.forEach(function (g) { byId[g.id] = g; });
      var cards = [];
      var win = rows.length >= 10 ? 'last 10 games' : 'games so far';

      function point(r, v) {
        var g = byId[r.id];
        return { t: r.t, v: v, label: shortDay(g), caption: 'game ' + r.n + ' · scored ' + r.score + (g.lane ? ' · lane ' + g.lane : '') };
      }

      /* 1. score */
      var overall = rows.reduce(function (a, r) { return a + r.score; }, 0) / rows.length;
      cards.push(UI.card('Score over time', plural(rows.length, 'game') + ', average ' + UI.avg(overall),
        el('div', { class: 'card-body sh-stack' }, [
          Charts.timeseries({
            series: [{ key: 's1', name: 'Average of the ' + win, points: rows.map(function (r) { return point(r, r.average); }),
              dots: rows.map(function (r) { return { t: r.t, v: r.score }; }) }],
            reference: { value: overall, label: 'All-time average ' + UI.avg(overall) },
            tFormat: tLabel, format: function (v) { return fix(v, 1); }, formatEnd: function (v) { return fix(v, 0); },
            legend: true, label: 'Score over time',
          }),
          el('p', { class: 'sh-note', text: 'Each faint dot is a game; the line is your average over the ' + win + '. Progress is the line climbing above the dashed all-time average.' }),
        ]),
        'The rolling line smooths out one-off nights, so it moves slowly and honestly. A real improvement shows as the line staying above where it used to be, not as one big game.'));

      /* 2. shot quality */
      cards.push(UI.card('Strikes and spares over time', 'Rolling ' + win,
        el('div', { class: 'card-body sh-stack' }, [
          Charts.timeseries({
            series: [
              { key: 's1', name: 'Strike %', points: rows.map(function (r) { return r.strikePct == null ? null : point(r, r.strikePct * 100); }).filter(Boolean) },
              { key: 's2', name: 'Spare %', points: rows.map(function (r) { return r.sparePct == null ? null : point(r, r.sparePct * 100); }).filter(Boolean) },
              { key: 's3', name: 'Makeable spare %', points: rows.map(function (r) { return r.makeablePct == null ? null : point(r, r.makeablePct * 100); }).filter(Boolean) },
            ],
            domain: [0, 100], formatAxis: function (v) { return v + '%'; }, format: function (v) { return v.toFixed(0) + '%'; },
            tFormat: tLabel, label: 'Strike, spare and makeable spare percentage over time',
          }),
          el('p', { class: 'sh-note', text: 'Makeable spares leave out splits, so that line sits at or above the spare line. If it is flat while your score climbs, the gain came from strikes.' }),
        ])));

      /* 3. consistency and opens */
      var sdRows = rows.filter(function (r) { return r.sd != null; });
      if (sdRows.length > 1) {
        cards.push(UI.card('Consistency', 'How much your scores swing from game to game',
          el('div', { class: 'card-body sh-stack' }, [
            Charts.timeseries({
              series: [{ key: 's2', name: 'Spread of scores (standard deviation)', points: sdRows.map(function (r) { return point(r, r.sd); }) }],
              tFormat: tLabel, format: function (v) { return fix(v, 1) + ' pins'; }, formatEnd: function (v) { return fix(v, 0); },
              legend: true, label: 'Rolling standard deviation of scores',
            }),
            el('p', { class: 'sh-note', text: 'Lower is steadier. A falling line means fewer disasters and fewer miracles: a more repeatable game.' }),
          ])));
      }
      cards.push(UI.card('Open frames per game', 'Rolling ' + win,
        el('div', { class: 'card-body sh-stack' }, [
          Charts.timeseries({
            series: [{ key: 's3', name: 'Open frames per game', points: rows.map(function (r) { return point(r, r.opens); }) }],
            tFormat: tLabel, format: function (v) { return fix(v, 1); }, formatEnd: function (v) { return fix(v, 1); },
            integerTicks: false, formatAxis: function (v) { return fix(v, 1); }, legend: true, label: 'Rolling open frames per game',
          }),
          el('p', { class: 'sh-note', text: 'Every open frame is a missed spare, usually 8 to 10 pins left on the table. Fewer is the quickest way up the scoreboard.' }),
        ])));

      /* 4. distribution: all games against the last 12 weeks */
      var cutoff = T.dayNumber(h.today()) - 84;
      var recent = rows.filter(function (r) { return r.t != null && r.t > cutoff; }).map(function (r) { return r.score; });
      var allScores = rows.map(function (r) { return r.score; });
      var binsAll = T.distribution(allScores, 20);
      var recentCount = recent.length;
      var groupsData = binsAll.map(function (b) {
        var rn = recent.filter(function (v) { return v >= b.lo && v <= b.hi; }).length;
        return { label: String(b.lo), bars: [
          { key: 's1', name: 'All ' + plural(allScores.length, 'game'), value: b.share * 100, text: Math.round(b.share * 100) + '%', caption: plural(b.n, 'game') },
        ].concat(recentCount >= 3 ? [{ key: 's2', name: 'Last 12 weeks (' + recentCount + ')', value: rn / recentCount * 100, text: Math.round(rn / recentCount * 100) + '%', caption: plural(rn, 'game') }] : []) };
      });
      var top = Math.max.apply(null, groupsData.map(function (g) { return Math.max.apply(null, g.bars.map(function (b) { return b.value; })); }));
      cards.push(UI.card('Where your scores land', 'Share of games in each 20-pin band',
        el('div', { class: 'card-body sh-stack' }, [
          Charts.groups({ groups: groupsData, domain: [0, Math.max(10, Math.ceil(top / 10) * 10)], formatAxis: function (v) { return v + '%'; }, label: 'Score distribution' }),
          el('p', { class: 'sh-note', text: recentCount >= 3
            ? 'Blue is every game you have bowled, orange is the last 12 weeks. Progress is the orange bars sitting to the right of the blue ones.'
            : 'Bars are the share of your games in each band. Once you have bowled at least three games in the last 12 weeks they are drawn alongside for comparison.' }),
        ])));

      /* 5. by month */
      var months = {};
      games.forEach(function (g) { var k = String(g.date || '').slice(0, 7); if (k) (months[k] = months[k] || []).push(g); });
      var monthRows = Object.keys(months).sort().reverse().map(function (k) {
        var a = S.analyze(months[k]);
        return { name: k, a: a };
      });
      var monthTable = UI.table({
        columns: [
          { key: 'm', label: 'Month', sortable: false, className: 'col-name', render: function (r) { var d = new Date(r.name + '-15T12:00:00Z'); return d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }); } },
          { key: 'g', label: 'Games', sortable: false, render: function (r) { return String(r.a.games); } },
          { key: 'a', label: 'Avg', sortable: false, className: 'num-strong', render: function (r) { return UI.avg(r.a.average); } },
          { key: 'h', label: 'High', sortable: false, render: function (r) { return UI.num(r.a.high); } },
          { key: 's', label: 'Strike %', sortable: false, render: function (r) { return pct(r.a.strikePct); } },
          { key: 'p', label: 'Spare %', sortable: false, render: function (r) { return pct(r.a.sparePct); } },
          { key: 'k', label: 'Makeable %', sortable: false, render: function (r) { return pct(r.a.makeablePct); } },
          { key: 'o', label: 'Opens', sortable: false, render: function (r) { return fix(r.a.opensPerGame, 1); } },
        ], rows: monthRows, state: null, onSort: function () {},
      });
      var gridRows = monthRows.slice().reverse().map(function (r) { return { key: r.name, games: r.a.games, average: r.a.average, high: r.a.high, low: r.a.low }; });
      cards.push(UI.card('Month by month', plural(monthRows.length, 'month') + (monthRows.length > 12 ? ', the last 12 shown' : ''),
        el('div', null, [UI.monthGrid({ rows: gridRows, empty: 'No finished games yet.' }), detailsTable(monthTable)]),
        'Each figure is shaded in proportion to your best month for it, and the tab in a corner marks that best month. The numbers below it add strike, spare and makeable-spare percentages and open frames for every month.'));
      return cards;
    }

    /* ============================== BALLS ============================== */

    function ballCards(ctx) {
      var pool = ctx.pool;                       /* every finished game, for stable colours */
      var f = ctx.f;
      var scoped = ctx.scoped;                   /* location / event / period applied, any pattern */
      var patterned = ctx.patterned;             /* the page's pattern filter on top of that */
      var label = h.ballName;
      var cards = [];

      var all = T.balls(patterned, { label: label, minGames: 2 });
      var allIds = all.map(function (b) { return b.id; });
      if (!allIds.length) {
        return [UI.card('Balls', null, UI.empty('Ball comparisons need at least two finished games with each ball' +
          (f.pattern ? ' on ' + f.pattern : '') + '. Keep logging games and this fills in.'))];
      }

      /* the balls shown: a pick of up to four, most-played by default */
      var picked = (h.state.ballPick || []).filter(function (id) { return allIds.indexOf(id) !== -1; });
      if (!picked.length) picked = allIds.slice(0, 4);
      var color = slots(pool, picked);
      var chosen = all.filter(function (b) { return picked.indexOf(b.id) !== -1; });
      var key = function (b) { return color[b.id]; };

      var chips = el('div', { class: 'sh-chips sh-pad', role: 'group', 'aria-label': 'Balls to compare' }, all.map(function (b) {
        var on = picked.indexOf(b.id) !== -1;
        return el('button', {
          type: 'button', class: 'sh-chip sh-ballchip' + (on ? ' is-on' : ''), 'aria-pressed': on ? 'true' : 'false',
          onclick: function () {
            var next = picked.slice();
            var i = next.indexOf(b.id);
            if (i !== -1) { if (next.length > 1) next.splice(i, 1); }
            else if (next.length < 4) next.push(b.id);
            h.state.ballPick = next;
            h.rerender();
          },
        }, [on ? el('i', { class: 'chart-swatch ml-' + color[b.id], 'aria-hidden': 'true' }) : null, h.thumb(b.id, 'sm'), el('span', { text: b.label + ' · ' + b.n })]);
      }));
      cards.push(UI.card('Balls to compare', 'Up to four, ' + (f.pattern ? 'on ' + f.pattern : 'on every pattern'),
        el('div', null, [chips, el('p', { class: 'sh-note sh-pad', text: 'Pick the balls to put side by side. The oil pattern filter above narrows every chart here to one pattern, which is how to compare balls fairly. Each game counts toward the ball that threw most of its first balls.' })])));

      if (chosen.length < 2) {
        cards.push(UI.card('Ball against ball', null, UI.empty('Pick a second ball to compare.')));
      } else {
        /* verdict */
        cards.push(verdictCard(chosen, f));

        /* ranges */
        var rangeRows = chosen.map(function (b) {
          var floor = b.p10 != null ? b.p10 : b.low, ceil = b.p90 != null ? b.p90 : b.high;
          return { key: key(b), label: b.label, lo: floor, hi: ceil, min: b.low, max: b.high, mid: b.median, mean: b.mean,
            sub: 'avg ' + fix(b.mean, 0) + ' \u00b7 ' + plural(b.n, 'game'),
            text: 'avg ' + fix(b.mean, 1) + ' · ' + (b.p10 != null ? 'bad nights ' + Math.round(floor) : 'lowest ' + Math.round(floor)) + ' · good nights ' + Math.round(ceil) + ' · best game ' + Math.round(b.high) + ' · lowest ' + Math.round(b.low),
            caption: plural(b.n, 'game') + (b.sd == null ? '' : ' · spread ' + fix(b.sd, 1)) };
        });
        var rangeTable = UI.table({
          columns: [
            { key: 'n', label: 'Ball', sortable: false, className: 'col-name', render: function (r) { return el('span', { class: 'sh-ballrow' }, [h.thumb(r.id, 'sm'), r.label]); } },
            { key: 'g', label: 'Games', sortable: false, render: function (r) { return String(r.n); } },
            { key: 'a', label: 'Avg', sortable: false, className: 'num-strong', render: function (r) { return fix(r.mean, 1); } },
            { key: 'c', label: 'Avg 95% range', sortable: false, render: function (r) { return r.ci ? Math.round(r.ci[0]) + '–' + Math.round(r.ci[1]) : '—'; } },
            { key: 'l', label: 'Bad night', sortable: false, render: function (r) { return r.p10 != null ? String(Math.round(r.p10)) : '—'; } },
            { key: 'd', label: 'Spread', sortable: false, render: function (r) { return fix(r.sd, 1); } },
            { key: 'h', label: 'High', sortable: false, render: function (r) { return String(r.high); } },
          ], rows: chosen, state: null, onSort: function () {},
        });
        cards.push(UI.card('How steady each ball is', f.pattern || 'All patterns',
          el('div', null, [
            el('div', { class: 'card-body sh-stack' }, [
              Charts.ranges({ rows: rangeRows, label: 'Typical score range for each ball' }),
              el('p', { class: 'sh-note', text: 'The band runs from a bad night (the worst 1 game in 10) to a good one (the best 1 in 10), so one standout game can sit past its end. The thin line runs from your lowest game to your best, with both scores at its ends. The black tick is the median and the dot is the average. A narrow band that sits high is a forgiving ball: it keeps you out of trouble when you are off.' }),
            ]),
            detailsTable(rangeTable),
          ]),
          'Bad and good nights need at least five games with a ball; with fewer the band runs from the lowest to the highest game. Treat balls with few games as a hint. In the table, Avg 95% range is where your true average with the ball probably sits, not a range of scores: with only a few games it is wide and can run past your best game.'));

        /* carry by how the ball hit */
        var perHit = {};
        chosen.forEach(function (b) { perHit[b.id] = S.analyze(b.games).hits; });
        var gdata = S.HITS.filter(function (k) { return chosen.some(function (b) { return perHit[b.id][k].n >= 3; }); }).map(function (k) {
          return { label: S.HIT_LABELS[k], bars: chosen.map(function (b) {
            var hit = perHit[b.id][k];
            return { key: key(b), name: b.label, value: hit.n >= 3 ? hit.strikePct * 100 : null, text: hit.n >= 3 ? Math.round(hit.strikePct * 100) + '%' : '',
              caption: plural(hit.n, 'shot') };
          }) };
        });
        cards.push(UI.card('Carry when you miss the pocket', 'Strike % by how the first ball hit',
          el('div', { class: 'card-body sh-stack' }, [
            gdata.length ? Charts.groups({ groups: gdata, domain: [0, 100], formatAxis: function (v) { return v + '%'; }, label: 'Strike percentage by hit type and ball' })
              : UI.empty('Record how the first ball hit (pocket, high, light, Brooklyn) in at least three shots per ball to see this.'),
            el('p', { class: 'sh-note', text: 'Pocket is the target. The other bars show how often the ball still strikes when you are a little high, light or across. A forgiving ball keeps those bars high. Hit types with fewer than three shots for a ball are left out.' }),
          ]),
          'This is the cleanest read on forgiveness, because it compares balls on the same kind of imperfect shot. It needs the optional "how did it hit" to have been recorded.'));

        /* scorecard */
        cards.push(forgivenessTable(chosen, key));

        /* over time */
        var tl = T.ballTimeline(patterned, chosen.map(function (b) { return b.id; }), { window: 5 });
        cards.push(UI.card('Ball form through time', 'Each ball’s average over its own last 5 games',
          el('div', { class: 'card-body sh-stack' }, [
            Charts.timeseries({
              series: chosen.map(function (b, i) {
                var line = tl.filter(function (x) { return x.id === b.id; })[0];
                return { key: key(b), name: b.label,
                  points: line.points.map(function (p) { return { t: p.t, v: p.average, label: UI.shortDate(p.date), caption: 'game ' + p.n + ' with it · scored ' + p.score }; }),
                  dots: line.points.map(function (p) { return { t: p.t, v: p.score }; }) };
              }),
              tFormat: tLabel, format: function (v) { return fix(v, 1); }, formatEnd: function (v) { return fix(v, 0); }, label: 'Each ball’s average over time',
            }),
            el('p', { class: 'sh-note', text: 'Faint dots are single games. A ball whose line climbs as you keep using it is one you are learning; a flat or falling one has probably told you what it can do.' }),
          ])));
      }

      /* strike percentage by ball, every ball */
      cards.push(strikeBallCard(all, f));

      /* strike streaks by ball */
      cards.push(streakBallCard(all, chosen, key, f));

      /* ball x pattern */
      cards.push(patternCard(scoped, pool, label));

      /* every game with a ball, to dive into its history */
      cards.push(historyCard(patterned, f));
      return cards;
    }

    /* How often each ball strikes: strikes out of every first ball thrown with it. */
    function strikeBallCard(all, f) {
      var THIN = 30;                                    /* first balls before a share is worth reading */
      var ranked = all.filter(function (b) { return b.racks > 0; }).slice().sort(function (a, b) {
        return b.strikePct - a.strikePct || b.racks - a.racks;
      });
      var scope = f.pattern ? 'on ' + f.pattern : 'on every pattern';
      function range(b) { return b.strikeRange ? Math.round(b.strikeRange[0] * 100) + '–' + Math.round(b.strikeRange[1] * 100) + '%' : '—'; }
      var steady = ranked.filter(function (b) { return b.racks >= THIN; });
      var lead = null;
      if (steady.length >= 2) {
        var a = steady[0], b = steady[1];
        var apart = a.strikeRange[0] > b.strikeRange[1];
        lead = a.label + ' strikes most often: ' + pct(a.strikePct) + ' (' + a.strikes + ' of ' + plural(a.racks, 'first ball') + '), against ' + pct(b.strikePct) + ' for ' + b.label + '. ' +
          (apart ? 'Their 95% ranges do not overlap, so that gap is probably real.' : 'Their 95% ranges overlap, so with this many shots the gap could still be luck.');
      } else if (steady.length === 1) {
        lead = steady[0].label + ' is the only ball with ' + THIN + ' or more first balls so far: ' + pct(steady[0].strikePct) + ' strikes (' + steady[0].strikes + ' of ' + steady[0].racks + ').';
      }

      var parts = [];
      if (lead) parts.push(el('p', { class: 'sh-verdict', text: lead }));
      parts.push(Charts.bars({
        wideLabel: true,
        empty: 'No finished games with these balls yet.',
        rows: ranked.map(function (b) {
          var thin = b.racks < THIN;
          return { label: b.label, value: b.strikePct * 100, display: pct(b.strikePct) + (thin ? '*' : ''),
            title: b.label + ': ' + b.strikes + ' strikes in ' + plural(b.racks, 'first ball') + ', 95% range ' + range(b) + (thin ? ' (few shots, a hint only)' : '') };
        }),
      }));
      parts.push(el('p', { class: 'sh-note', text: 'Strikes out of every first ball thrown with the ball, all of its games.' + (ranked.some(function (b) { return b.racks < THIN; }) ? ' A star marks a ball with fewer than ' + THIN + ' first balls: a hint, not a result.' : '') }));

      var table = UI.table({
        columns: [
          { key: 'n', label: 'Ball', sortable: false, className: 'col-name', render: function (r) { return el('span', { class: 'sh-ballrow' }, [h.thumb(r.id, 'sm'), r.label]); } },
          { key: 'g', label: 'Games', sortable: false, render: function (r) { return String(r.n); } },
          { key: 'f', label: 'First balls', sortable: false, className: 'muted', render: function (r) { return String(r.racks); } },
          { key: 'k', label: 'Strikes', sortable: false, className: 'muted', render: function (r) { return String(r.strikes); } },
          { key: 'p', label: 'Strike %', sortable: false, className: 'num-strong', render: function (r) { return pct(r.strikePct); } },
          { key: 'c', label: 'Strike % range', sortable: false, render: range },
          { key: 'a', label: 'Per game', sortable: false, render: function (r) { return fix(r.strikesPerGame, 1); } },
        ], rows: ranked, state: null, onSort: function () {},
      });
      return UI.card('Strike % by ball', scope,
        el('div', null, [el('div', { class: 'card-body sh-stack' }, parts), detailsTable(table)]),
        'Strike % is strikes out of first balls, so every rack counts, including the extra racks in the tenth. The 95% range is how far the true rate could plausibly sit from the one measured: wide for a ball with few shots, narrow with many. A ball also gets the fresh oil, the better lanes and the patterns you chose for it, so use the oil pattern filter above to compare balls on the same pattern.');
    }

    /* Every game with one ball (or all of them), newest first, each linking to the game itself. */
    function historyCard(patterned, f) {
      var fin = S.finished(patterned);
      var by = {};
      fin.forEach(function (g) { var id = S.primaryBall(g); if (id) (by[id] = by[id] || []).push(g); });
      var ids = Object.keys(by).sort(function (a, b) {
        return by[b].length - by[a].length || String(h.ballName(a)).localeCompare(String(h.ballName(b)));
      });
      var scope = f.pattern ? 'on ' + f.pattern : 'on every pattern';
      if (!ids.length) return UI.card('Games by ball', scope, UI.empty('Finish a game with a ball and its history appears here.'));

      var sel = h.state.historyBall;
      if (sel == null || (sel !== 'all' && ids.indexOf(sel) === -1)) sel = ids[0];
      var list = sel === 'all' ? ids.reduce(function (all, id) { return all.concat(by[id]); }, []) : by[sel];
      if (!h.state.historySort) h.state.historySort = { key: 'date', dir: 'desc' };

      var chips = el('div', { class: 'sh-chips sh-pad', role: 'group', 'aria-label': 'Ball to list' },
        [['all', null, 'All balls', fin.filter(function (g) { return S.primaryBall(g); }).length]].concat(ids.map(function (id) { return [id, id, h.ballName(id), by[id].length]; })).map(function (c) {
          var on = sel === c[0];
          return el('button', { type: 'button', class: 'sh-chip sh-ballchip' + (on ? ' is-on' : ''), 'aria-pressed': on ? 'true' : 'false',
            onclick: function () { h.state.historyBall = c[0]; h.state.historyAll = false; h.rerender(); } },
            [c[1] ? h.thumb(c[1], 'sm') : null, el('span', { text: c[2] + ' · ' + c[3] })]);
        }));

      var a = S.analyze(list);
      var tiles = UI.statGrid([
        UI.stat('Games', String(a.games)),
        UI.stat('Average', UI.avg(a.average)),
        UI.stat('High game', UI.num(a.high)),
        UI.stat('Low game', UI.num(a.low)),
        UI.stat('Strike %', pct1(a.strikePct)),
        UI.stat('Opens per game', fix(a.opensPerGame, 1)),
      ]);

      function dateText(iso) {
        var d = String(iso || '').split('-');
        var dt = new Date(Date.UTC(+d[0], +d[1] - 1, +d[2]));
        return d.length === 3 && !isNaN(dt.getTime()) ? dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : (iso || '—');
      }
      function cap(s) { return s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '—'; }
      var rows = list.map(function (g) {
        var ga = S.analyze([g]);
        var id = S.primaryBall(g);
        return { g: g, a: ga, id: id, name: h.ballName(id), score: S.score(g).total, when: String(g.date || '') + ' ' + String(g.createdAt || '') };
      });
      var href = function (r) { return '#/shots/game/' + r.g.id; };
      var columns = [
        { key: 'date', label: 'Date', className: 'col-name', value: function (r) { return r.when; },
          render: function (r) { return el('a', { href: href(r), text: dateText(r.g.date) }); } },
        { key: 'score', label: 'Score', className: 'num-strong', value: function (r) { return r.score; },
          render: function (r) { return el('a', { class: 'sh-score', href: href(r), text: String(r.score) }); } },
      ];
      if (sel === 'all') {
        columns.push({ key: 'ball', label: 'Ball', className: 'col-name', defaultDir: 'asc', value: function (r) { return r.name; },
          render: function (r) { return el('span', { class: 'sh-ballrow' }, [h.thumb(r.id, 'sm'), r.name]); } });
      }
      columns = columns.concat([
        { key: 'game', label: 'Game', className: 'muted', defaultDir: 'asc', value: function (r) { return r.g.gameNo || null; },
          render: function (r) { return r.g.gameNo ? r.g.gameNo + (r.g.setSize ? ' of ' + r.g.setSize : '') : '\u2014'; } },
        { key: 'strikes', label: 'Strikes', value: function (r) { return r.a.strikes; }, render: function (r) { return String(r.a.strikes); } },
        { key: 'spares', label: 'Spares', value: function (r) { return r.a.spares; }, render: function (r) { return String(r.a.spares); } },
        { key: 'opens', label: 'Opens', defaultDir: 'asc', value: function (r) { return r.a.opens; }, render: function (r) { return String(r.a.opens); } },
        { key: 'fb', label: '1st ball', optional: true, value: function (r) { return r.a.firstBallAvg; }, render: function (r) { return fix(r.a.firstBallAvg, 1); } },
        { key: 'pattern', label: 'Pattern', optional: true, defaultDir: 'asc', value: function (r) { return r.g.pattern || null; }, render: function (r) { return r.g.pattern || '\u2014'; } },
        { key: 'event', label: 'Event', optional: true, defaultDir: 'asc', value: function (r) { return r.g.event || null; }, render: function (r) { return cap(r.g.event); } },
        { key: 'lane', label: 'Lane', optional: true, defaultDir: 'asc', value: function (r) { return r.g.lane || null; }, render: function (r) { return r.g.lane || '\u2014'; } },
      ]);

      var LIMIT = 15;
      var more = rows.length > LIMIT;
      var table = UI.table({ columns: columns, rows: rows, state: h.state.historySort, onSort: h.rerender, limit: more && !h.state.historyAll ? LIMIT : null });
      var toggle = more ? el('p', { class: 'sh-pad' }, el('button', { type: 'button', class: 'sh-btn',
        onclick: function () { h.state.historyAll = !h.state.historyAll; h.rerender(); },
        text: h.state.historyAll ? 'Show only the first ' + LIMIT : 'Show all ' + rows.length + ' games' })) : null;

      return UI.card('Games by ball', scope,
        el('div', null, [chips, el('div', { class: 'card-body' }, tiles), table, toggle]),
        'Every finished game, listed under the ball that threw most of its first balls, so a game where you switched shows under one ball only. Tap a date or score to open the game. Sort by any column: score to find a ball’s best games, opens to find where it let you down. The oil pattern filter above narrows the list.');
    }

    /* Which balls string strikes together: a hot streak is the plainest sign a ball is reading the lanes. */
    function streakBallCard(all, chosen, key, f) {
      var ranked = all.filter(function (b) { return b.streaks.games > 0; }).slice().sort(function (a, b) {
        return (b.streaks.turkeysPerGame || 0) - (a.streaks.turkeysPerGame || 0) || b.streaks.longest - a.streaks.longest || b.n - a.n;
      });
      var scope = f.pattern ? 'on ' + f.pattern : 'on every pattern';
      var steady = ranked.filter(function (b) { return b.n >= 5; });
      var lead = steady.length >= 2 && steady[0].streaks.turkeysPerGame > 0 && steady[0].streaks.turkeysPerGame > steady[1].streaks.turkeysPerGame
        ? steady[0].label + ' strings strikes together most: ' + fix(steady[0].streaks.turkeysPerGame, 2) + ' turkeys or better a game (' + plural(steady[0].streaks.turkeys, 'streak') + ' in ' + plural(steady[0].n, 'game') + '), against ' + fix(steady[1].streaks.turkeysPerGame, 2) + ' for ' + steady[1].label + '.'
        : null;

      var parts = [];
      if (lead) parts.push(el('p', { class: 'sh-verdict', text: lead }));
      parts.push(Charts.bars({
        wideLabel: true,
        empty: 'No finished games with these balls yet.',
        rows: ranked.map(function (b) {
          var sf = b.streaks;
          return { label: b.label, value: sf.turkeysPerGame || 0,
            display: fix(sf.turkeysPerGame, 2),
            title: b.label + ': ' + plural(sf.turkeys, 'turkey or better') + ' in ' + plural(b.n, 'game') + ', best streak ' + sf.longest };
        }),
      }));
      parts.push(el('p', { class: 'sh-note', text: 'Turkeys or better per game, for every ball. Hover or tap a bar for the count and the longest streak. A streak counts once however long it runs.' }));

      if (chosen.length >= 2) {
        var lengths = [[3, 'Turkey (3)'], [4, 'Hambone (4)'], [5, '5 or more']];
        var data = lengths.map(function (L) {
          return { label: L[1], bars: chosen.map(function (b) {
            var sf = b.streaks, per10 = sf.games ? sf.byLength[L[0]] / sf.games * 10 : null;
            return { key: key(b), name: b.label, value: per10, text: per10 == null ? '' : fix(per10, 1), caption: plural(sf.byLength[L[0]], 'time') + ' in ' + plural(sf.games, 'game') };
          }) };
        });
        var top = Math.max.apply(null, data.map(function (g) { return Math.max.apply(null, g.bars.map(function (b) { return b.value || 0; })); }));
        parts.push(el('h3', { class: 'sh-subhead', text: 'How long the streaks run, balls picked above' }));
        parts.push(Charts.groups({ groups: data, domain: [0, Math.max(2, Math.ceil(top / (top > 10 ? 5 : 2)) * (top > 10 ? 5 : 2))], formatAxis: function (v) { return String(v); }, label: 'Strike streaks per ten games, by length and ball' }));
        parts.push(el('p', { class: 'sh-note', text: 'Streaks per ten games. A ball that keeps its strikes going for four and five is carrying well, not just landing the odd three.' }));
      }

      var table = UI.table({
        columns: [
          { key: 'n', label: 'Ball', sortable: false, className: 'col-name', render: function (r) { return el('span', { class: 'sh-ballrow' }, [h.thumb(r.id, 'sm'), r.label]); } },
          { key: 'g', label: 'Games', sortable: false, render: function (r) { return String(r.n); } },
          { key: 't', label: 'Turkeys+', sortable: false, className: 'num-strong', render: function (r) { return String(r.streaks.turkeys); } },
          { key: 'p', label: 'Per game', sortable: false, render: function (r) { return fix(r.streaks.turkeysPerGame, 2); } },
          { key: 'w', label: 'Games with one', sortable: false, render: function (r) { return pct(r.streaks.turkeyGamePct); } },
          { key: 'l', label: 'Longest', sortable: false, render: function (r) { return String(r.streaks.longest || 0); } },
          { key: 'a', label: 'Strike after strike', sortable: false, render: function (r) { return r.streaks.afterStrikeN >= 5 ? pct(r.streaks.afterStrikePct) : '\u2014'; } },
        ], rows: ranked, state: null, onSort: function () {},
      });
      return UI.card('Strike streaks by ball', scope,
        el('div', null, [el('div', { class: 'card-body sh-stack' }, parts), detailsTable(table)]),
        'Streaks are streaky: a few games can fake a hot ball, so lean on balls with five or more games, and remember a ball also gets the fresh oil and the better lanes. Strike after strike is how often a strike followed a strike (shown with at least five such shots).');
    }

    /* A plain-language read of who is most forgiving, with its caveats. */
    function verdictCard(chosen, f) {
      var withCarry = chosen.filter(function (b) { return b.offPocketStrikePct != null && b.offPocketN >= 5; });
      var lines = [];
      var floors = chosen.filter(function (b) { return b.p10 != null; });
      if (withCarry.length >= 2) {
        var best = withCarry.slice().sort(function (a, b) { return b.offPocketStrikePct - a.offPocketStrikePct; })[0];
        lines.push(best.label + ' carries best when you miss the pocket: it still strikes ' + pct(best.offPocketStrikePct) + ' of off-pocket hits (' + plural(best.offPocketN, 'shot') + ').');
      }
      if (floors.length >= 2) {
        var steady = floors.slice().sort(function (a, b) { return b.p10 - a.p10; })[0];
        lines.push(steady.label + ' has the highest floor: its worst 1 game in 10 is still ' + Math.round(steady.p10) + ' or better.');
      }
      var spread = chosen.filter(function (b) { return b.sd != null; });
      if (spread.length >= 2) {
        var tight = spread.slice().sort(function (a, b) { return a.sd - b.sd; })[0];
        lines.push(tight.label + ' is the steadiest, with scores swinging about ' + fix(tight.sd, 0) + ' pins either side.');
      }
      var top = chosen.slice().sort(function (a, b) { return b.mean - a.mean; });
      if (top.length >= 2 && top[0].ci && top[1].ci && top[0].ci[0] > top[1].ci[1]) {
        lines.push(top[0].label + ' really does score higher than ' + top[1].label + ': their 95% ranges do not overlap.');
      } else if (top.length >= 2) {
        lines.push('On average ' + top[0].label + ' leads by ' + fix(top[0].mean - top[1].mean, 1) + ' pins, but with this many games that gap could still be luck.');
      }
      if (!lines.length) lines.push('Not enough games per ball yet to say. Five or more with each, and some with how the shot hit recorded, will fill this in.');
      return UI.card('Which is more forgiving' + (f.pattern ? ' on ' + f.pattern : '') + '?', 'The short answer',
        el('div', { class: 'card-body sh-stack' }, lines.map(function (l) { return el('p', { class: 'sh-verdict', text: l }); }).concat([
          el('p', { class: 'sh-note', text: 'Forgiving here means two things: how well a ball strikes when the shot is not perfect, and how high your bad nights stay with it. Small samples are flagged rather than guessed at.' }),
        ])));
    }

    function forgivenessTable(chosen, key) {
      function best(field, dir) {
        var vals = chosen.map(function (b) { return b[field]; }).filter(function (v) { return v != null; });
        if (vals.length < 2) return null;
        return dir === 'low' ? Math.min.apply(null, vals) : Math.max.apply(null, vals);
      }
      var marks = {
        strike: best('strikePct'), off: best('offPocketStrikePct'), floor: best('p10'), sd: best('sd', 'low'), mk: best('makeablePct'),
        sp: best('sparePct'), opens: best('opensPerGame', 'low'), gap: best('carryGap', 'low'),
      };
      function cell(text, v, mark) {
        return v != null && mark != null && v === mark ? el('strong', { class: 'sh-best', text: text, title: 'Best of these balls' }) : text;
      }
      /* Balls across, measures down: it stays readable on a phone. */
      var measures = [
        ['Strike %', 'k', function (r) { return pct(r.strikePct); }, 'strikePct', 'strike', 'Strikes out of every first ball thrown with the ball.'],
        ['Off-pocket strike %', 'o', function (r) { return pct(r.offPocketStrikePct); }, 'offPocketStrikePct', 'off', 'Strike rate on first balls that were high, light or across.'],
        ['Carry gap', 'g', function (r) { return r.carryGap == null ? '\u2014' : Math.round(r.carryGap * 100) + ' pts'; }, 'carryGap', 'gap', 'Pocket strike % minus off-pocket strike %. Smaller is more forgiving.'],
        ['Bad night', 'f', function (r) { return r.p10 == null ? '\u2014' : String(Math.round(r.p10)); }, 'p10', 'floor', 'The score you beat 9 games in 10.'],
        ['Spread', 'd', function (r) { return fix(r.sd, 1); }, 'sd', 'sd', 'Standard deviation of scores. Lower is steadier.'],
        ['Makeable spare %', 'm', function (r) { return pct(r.makeablePct); }, 'makeablePct', 'mk', 'Spares made on leaves that were not splits.'],
        ['Spare %', 's', function (r) { return pct(r.sparePct); }, 'sparePct', 'sp', 'All spare tries.'],
        ['Opens per game', 'p', function (r) { return fix(r.opensPerGame, 1); }, 'opensPerGame', 'opens', 'Missed spares per game. Lower is better.'],
      ];
      var table = el('div', { class: 'sh-scorewrap' }, el('table', { class: 'sh-scoretable' }, [
        el('thead', null, el('tr', null, [el('th', { text: '' })].concat(chosen.map(function (b) {
          return el('th', { scope: 'col' }, el('span', { class: 'sh-ballhead' }, [el('i', { class: 'chart-swatch ml-' + key(b), 'aria-hidden': 'true' }), b.label]));
        })))),
        el('tbody', null, measures.map(function (m) {
          return el('tr', null, [el('th', { scope: 'row', title: m[5], text: m[0] })].concat(chosen.map(function (b) {
            var text = m[2](b);
            var shared = chosen.filter(function (o) { return m[2](o) === text; }).length > 1;   /* a tie as displayed is not a win */
            return el('td', null, shared ? text : cell(text, b[m[3]], marks[m[4]]));
          })));
        })),
      ]));
      return UI.card('Forgiveness scorecard', 'Bold green is the best of the balls shown',
        el('div', { class: 'sh-stack' }, [table, el('p', { class: 'sh-note sh-pad', text: 'Off-pocket strike % is how often a first ball that was high, light or across still struck. Carry gap is pocket strike % minus that: smaller means the ball cares less about your miss. Bad night is the score you beat 9 games in 10. Spread is the standard deviation of your scores.' })]));
    }

    /* every ball on every pattern, and who wins where */
    function patternCard(scoped, pool, label) {
      var bp = T.ballPattern(scoped, { label: label, minCell: 3 });
      if (!bp.balls.length || bp.patterns.length < 1) return UI.card('Ball by oil pattern', null, UI.empty('No finished games yet.'));
      var vals = Object.keys(bp.cells).map(function (k) { return bp.cells[k].mean; });
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
      function shade(c) {
        var t = hi === lo ? 0.5 : (c.mean - lo) / (hi - lo);
        var strength = c.n >= 3 ? 14 + t * 34 : 6;
        return 'background: color-mix(in srgb, var(--accent) ' + strength + '%, var(--surface))';
      }
      var rows = bp.balls.map(function (id) {
        return el('tr', null, [el('th', { scope: 'row', class: 'sh-heat-ball' }, el('span', { class: 'sh-ballrow' }, [h.thumb(id, 'sm'), label(id)]))]
          .concat(bp.patterns.map(function (p) {
            var c = bp.cells[id + '\u0001' + p];
            if (!c) return el('td', { class: 'sh-heat-empty', text: '—' });
            var win = bp.rows.filter(function (r) { return r.pattern === p; })[0].best;
            var best = win && win.id === id;
            return el('td', { class: 'sh-heat' + (c.n < 3 ? ' is-thin' : '') + (best ? ' is-best' : ''), style: shade(c),
              title: label(id) + ' on ' + p + ': ' + plural(c.n, 'game') + (c.n < 3 ? ' (too few to trust)' : '') + (c.sd != null ? ', spread ' + c.sd.toFixed(1) : '') }, [
              el('strong', { text: String(Math.round(c.mean)) }),
              el('small', { text: (best ? '★ ' : '') + c.n }),
            ]);
          })));
      });
      var heat = el('div', { class: 'sh-heatwrap' }, el('table', { class: 'sh-heatmap' }, [
        el('thead', null, el('tr', null, [el('th', { text: '' })].concat(bp.patterns.map(function (p) { return el('th', { scope: 'col', text: p }); })))),
        el('tbody', null, rows),
      ]));
      var best = UI.table({
        columns: [
          { key: 'p', label: 'Pattern', sortable: false, className: 'col-name', render: function (r) { return r.pattern; } },
          { key: 'g', label: 'Games', sortable: false, render: function (r) { return String(r.games); } },
          { key: 'b', label: 'Highest average', sortable: false, className: 'col-name', render: function (r) { return r.best ? el('span', { class: 'sh-ballrow' }, [h.thumb(r.best.id, 'sm'), r.best.label + ' ' + Math.round(r.best.mean) + ' (' + r.best.n + ')']) : '—'; } },
          { key: 's', label: 'Highest floor', sortable: false, className: 'col-name', render: function (r) { return r.steadiest ? el('span', { class: 'sh-ballrow' }, [h.thumb(r.steadiest.id, 'sm'), r.steadiest.label + ' ' + Math.round(r.steadiest.floor) + ' (' + r.steadiest.n + ')']) : '—'; } },
        ], rows: bp.rows, state: null, onSort: function () {},
      });
      return UI.card('Ball by oil pattern', 'Average score and games, every ball on every pattern',
        el('div', { class: 'sh-stack' }, [
          heat,
          el('p', { class: 'sh-note sh-pad', text: 'Each cell is the average (bold) and the number of games (small). Darker is higher. A star marks the best average on that pattern, and faded cells have fewer than three games, so do not read much into them. This ignores the oil pattern filter, so every pattern shows.' }),
          el('div', null, [el('h3', { class: 'sh-subhead sh-pad', text: 'Who wins on each pattern' }), best]),
        ]),
        'Highest floor is the ball whose bad nights are least bad on that pattern (the tenth percentile, or the lowest game when there are fewer than five). Only balls with at least three games on the pattern are named.');
    }

    return { progress: progress, balls: ballCards };
  }

  window.ShotsInsights = { create: create };
})();
