/*
 * The numbers behind the Progress and Balls tabs of the shot tracker's stats.
 *
 * Pure functions over finished games: rolling averages through time, the shape
 * of your scores, and how each ball behaves, overall and on each oil pattern.
 * "Forgiving" is measured two ways: how well the ball still carries when the
 * first ball is not in the pocket, and how high the bad nights stay (the tenth
 * percentile of its scores). Nothing here touches the page.
 */
(function () {
  'use strict';

  var S = typeof module === 'object' && module.exports ? require('./shots.js') : window.Shots;
  var B = typeof module === 'object' && module.exports ? require('./ballstats.js') : window.BallStats;

  function byDate(a, b) {
    return String(a.date || '').localeCompare(String(b.date || '')) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  }

  function dayNumber(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null;
  }

  function ratio(n, d) { return d ? n / d : null; }

  /* Games on the same night get slightly different times, in order, so a night
     of three draws as three steps along the axis and not one stack. */
  function spread(list) {
    var perDay = {};
    list.forEach(function (g) { perDay[g.date] = (perDay[g.date] || 0) + 1; });
    var seen = {};
    return list.map(function (g) {
      var k = seen[g.date] = (seen[g.date] || 0) + 1;
      var base = dayNumber(g.date);
      return base == null ? null : base + (perDay[g.date] > 1 ? (k - 1) / perDay[g.date] * 0.8 : 0);
    });
  }

  /* ---------- progress through time ---------- */

  /*
   * Every game in order, with figures over the last `window` games ending at
   * it (fewer at the start). Percentages pool the shots in the window, so a
   * game with few shots does not count the same as a long one.
   */
  function progress(games, options) {
    var win = (options && options.window) || 10;
    var list = S.finished(games).slice().sort(byDate);
    var per = list.map(function (g) {
      var a = S.analyze([g]);
      return { game: g, a: a, score: S.score(g).total };
    });
    var times = spread(list);
    var out = per.map(function (row, i) {
      var from = Math.max(0, i - win + 1);
      var slice = per.slice(from, i + 1);
      var sum = function (f) { return slice.reduce(function (t, r) { return t + f(r.a); }, 0); };
      var scores = slice.map(function (r) { return r.score; });
      var racks = sum(function (a) { return a.racks; });
      return {
        id: row.game.id, date: row.game.date, t: times[i], n: i + 1, window: slice.length,
        score: row.score,
        average: B.mean(scores),
        sd: scores.length >= 3 ? B.sd(scores) : null,
        strikePct: ratio(sum(function (a) { return a.strikes; }), racks),
        sparePct: ratio(sum(function (a) { return a.spares; }), sum(function (a) { return a.attempts; })),
        makeablePct: ratio(sum(function (a) { return a.makeable.made; }), sum(function (a) { return a.makeable.attempts; })),
        opens: B.mean(slice.map(function (r) { return r.a.opens; })),
        firstBall: ratio(sum(function (a) { return (a.firstBallAvg || 0) * a.racks; }), racks),
      };
    });
    return { games: out, window: win };
  }

  /* How the scores are spread: counts in bins of `size` pins. */
  function distribution(scores, size) {
    size = size || 20;
    var vals = (scores || []).filter(function (v) { return v != null && isFinite(v); });
    if (!vals.length) return [];
    var lo = Math.floor(Math.min.apply(null, vals) / size) * size;
    var hi = Math.floor(Math.max.apply(null, vals) / size) * size;
    var bins = [];
    for (var b = lo; b <= hi; b += size) bins.push({ lo: b, hi: b + size - 1, n: 0, share: 0 });
    vals.forEach(function (v) { bins[Math.floor((v - lo) / size)].n++; });
    bins.forEach(function (x) { x.share = x.n / vals.length; });
    return bins;
  }

  /* ---------- balls ---------- */

  function scoreFigures(scores) {
    var n = scores.length;
    var m = B.mean(scores);
    var sd = n > 1 ? B.sd(scores) : null;
    var se = n > 1 ? sd / Math.sqrt(n) : null;
    var half = n > 1 ? B.tCritical(0.05, n - 1) * se : null;
    var sorted = scores.slice().sort(function (a, b) { return a - b; });
    return {
      n: n, mean: m, sd: sd,
      median: B.median(scores),
      p10: n >= 5 ? B.quantile(sorted, 0.1) : null,
      p90: n >= 5 ? B.quantile(sorted, 0.9) : null,
      low: Math.min.apply(null, scores), high: Math.max.apply(null, scores),
      ci: half == null ? null : [m - half, m + half],
    };
  }

  /* Strike rate on first balls that were not in the pocket (high, light, Brooklyn, other). */
  function offPocket(a) {
    var n = 0, strikes = 0;
    ['high', 'light', 'brooklyn', 'other'].forEach(function (k) {
      if (a.hits[k]) { n += a.hits[k].n; strikes += a.hits[k].strikes; }
    });
    return { n: n, strikes: strikes, pct: ratio(strikes, n), share: ratio(n, a.hitsRecorded) };
  }

  /*
   * One row per ball (by the ball that threw most of each game's first balls):
   * score figures plus shot figures. games must already be filtered (pattern,
   * location, event, period) as wanted. Rows are most-played first.
   */
  function balls(games, options) {
    options = options || {};
    var label = options.label || function (id) { return id; };
    var minGames = options.minGames == null ? 2 : options.minGames;
    var by = {};
    S.finished(games).forEach(function (g) {
      var id = S.primaryBall(g);
      if (id) (by[id] = by[id] || []).push(g);
    });
    return Object.keys(by).filter(function (id) { return by[id].length >= minGames; }).map(function (id) {
      var list = by[id];
      var scores = list.map(function (g) { return S.score(g).total; });
      var a = S.analyze(list);
      var f = scoreFigures(scores);
      var off = offPocket(a);
      return {
        id: id, label: label(id), games: list, scores: scores,
        n: f.n, mean: f.mean, sd: f.sd, median: f.median, p10: f.p10, p90: f.p90, low: f.low, high: f.high, ci: f.ci,
        strikePct: a.strikePct, sparePct: a.sparePct, makeablePct: a.makeablePct,
        opensPerGame: a.opensPerGame, firstBallAvg: a.firstBallAvg, strikesPerGame: a.strikesPerGame,
        pocketStrikePct: a.hits.pocket.strikePct, pocketN: a.hits.pocket.n,
        offPocketStrikePct: off.pct, offPocketN: off.n, offPocketShare: off.share,
        hitsRecorded: a.hitsRecorded,
        /* Pins lost between a pocket hit and an off-pocket one, in strike rate. Smaller means more forgiving. */
        carryGap: a.hits.pocket.strikePct != null && off.pct != null ? a.hits.pocket.strikePct - off.pct : null,
      };
    }).sort(function (a, b) { return b.n - a.n || String(a.label).localeCompare(String(b.label)); });
  }

  /*
   * Every ball on every oil pattern: the average (and spread) of the games
   * where that ball was the main ball on that pattern, plus for each pattern
   * the best ball and the most forgiving one. A cell needs `minCell` games to
   * be named best, because two games say very little.
   */
  function ballPattern(games, options) {
    options = options || {};
    var label = options.label || function (id) { return id; };
    var minCell = options.minCell || 3;
    var cells = {}, ballIds = {}, patterns = {};
    S.finished(games).forEach(function (g) {
      var id = S.primaryBall(g);
      if (!id) return;
      var p = g.pattern || 'No pattern';
      var key = id + '\u0001' + p;
      (cells[key] = cells[key] || { ball: id, pattern: p, scores: [] }).scores.push(S.score(g).total);
      ballIds[id] = (ballIds[id] || 0) + 1;
      patterns[p] = (patterns[p] || 0) + 1;
    });
    Object.keys(cells).forEach(function (k) {
      var c = cells[k];
      var f = scoreFigures(c.scores);
      c.n = f.n; c.mean = f.mean; c.sd = f.sd; c.p10 = f.p10; c.low = f.low;
    });
    var ballList = Object.keys(ballIds).sort(function (a, b) { return ballIds[b] - ballIds[a]; });
    var patternList = Object.keys(patterns).sort(function (a, b) { return patterns[b] - patterns[a]; });
    var rows = patternList.map(function (p) {
      var here = ballList.map(function (id) { return cells[id + '\u0001' + p]; }).filter(Boolean);
      var enough = here.filter(function (c) { return c.n >= minCell; });
      var best = enough.slice().sort(function (a, b) { return b.mean - a.mean; })[0] || null;
      /* Forgiving: the highest low-end (tenth percentile, or the lowest game when there are few). */
      var floor = function (c) { return c.p10 != null ? c.p10 : c.low; };
      var steady = enough.slice().sort(function (a, b) { return floor(b) - floor(a); })[0] || null;
      return {
        pattern: p, games: patterns[p], cells: here.length,
        best: best && { id: best.ball, label: label(best.ball), mean: best.mean, n: best.n },
        steadiest: steady && { id: steady.ball, label: label(steady.ball), floor: floor(steady), n: steady.n },
      };
    });
    return { balls: ballList, patterns: patternList, cells: cells, rows: rows, minCell: minCell };
  }

  /*
   * Each ball's form through time: for every game that ball was the main ball
   * in, the average of its last `window` games. Points carry the real date so
   * balls can be drawn on one time axis even though they were bowled on
   * different nights.
   */
  function ballTimeline(games, ids, options) {
    var win = (options && options.window) || 5;
    var pool = S.finished(games).slice().sort(byDate);
    return ids.map(function (id) {
      var mine = pool.filter(function (g) { return S.primaryBall(g) === id; });
      var scores = mine.map(function (g) { return S.score(g).total; });
      var times = spread(mine);
      return {
        id: id,
        points: mine.map(function (g, i) {
          var slice = scores.slice(Math.max(0, i - win + 1), i + 1);
          return { t: times[i], date: g.date, score: scores[i], average: B.mean(slice), n: i + 1, window: slice.length };
        }),
      };
    });
  }

  var api = {
    progress: progress, distribution: distribution, balls: balls, ballPattern: ballPattern, ballTimeline: ballTimeline,
    dayNumber: dayNumber,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.Trends = api;
})();
