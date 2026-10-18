/*
 * Ball statistics: how each ball's scores compare, and how much of any
 * difference could just be luck. Pure functions, no DOM; works in the browser
 * (window.BallStats) and under Node (module.exports) so the numbers can be
 * checked against known values.
 *
 * A game counts toward the ball that threw most of its first balls. With the
 * handful of games a bowler has per ball, the honest question is not "which
 * average is highest" but "is that gap bigger than chance", so alongside the
 * averages this works out confidence intervals, a one-way ANOVA, a
 * Kruskal-Wallis test (no normality assumed), Levene's test for spread,
 * Welch's pairwise t-tests with Holm's correction, a bootstrap for the odds
 * each ball is truly best, and an empirical-Bayes shrinkage of each average.
 */
(function () {
  'use strict';

  var Shots = (typeof module === 'object' && module.exports) ? require('./shots.js') : window.Shots;

  /* ---------- special functions ---------- */

  function lnGamma(x) {
    var c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
             -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = x;
    var tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    var ser = 1.000000000190015;
    for (var j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  /* Continued fraction for the incomplete beta function. */
  function betacf(a, b, x) {
    var MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
    var qab = a + b, qap = a + 1, qam = a - 1;
    var c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    var h = d;
    for (var m = 1; m <= MAXIT; m++) {
      var m2 = 2 * m;
      var aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      var del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  /* Regularised incomplete beta I_x(a, b). */
  function betainc(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2)
      ? bt * betacf(a, b, x) / a
      : 1 - bt * betacf(b, a, 1 - x) / b;
  }

  /* Upper regularised incomplete gamma Q(a, x). */
  function gammaQ(a, x) {
    if (x <= 0) return 1;
    if (x < a + 1) {
      var ap = a, sum = 1 / a, del = sum;
      for (var n = 0; n < 500; n++) {
        ap += 1; del *= x / ap; sum += del;
        if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
      }
      return 1 - sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
    }
    var b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d;
    for (var i = 1; i < 500; i++) {
      var an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d;
      var delta = d * c;
      h *= delta;
      if (Math.abs(delta - 1) < 1e-15) break;
    }
    return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
  }

  function normCdf(z) {
    var q = 0.5 * gammaQ(0.5, z * z / 2);   /* P(Z > |z|) */
    return z >= 0 ? 1 - q : q;
  }

  /* Two-sided p for a t statistic. */
  function tTwoSided(t, df) { return betainc(df / (df + t * t), df / 2, 0.5); }
  /* Upper-tail p for an F statistic. */
  function fSf(F, d1, d2) { return betainc(d2 / (d2 + d1 * F), d2 / 2, d1 / 2); }
  function chi2Sf(x, k) { return gammaQ(k / 2, x / 2); }

  /* The t value with two-sided tail probability `alpha`. */
  function tCritical(alpha, df) {
    var lo = 0, hi = 1000;
    for (var i = 0; i < 100; i++) {
      var mid = (lo + hi) / 2;
      if (tTwoSided(mid, df) > alpha) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* ---------- descriptive ---------- */

  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  function mean(a) { return a.length ? sum(a) / a.length : null; }
  function variance(a) {
    if (a.length < 2) return null;
    var m = mean(a);
    return sum(a.map(function (x) { return (x - m) * (x - m); })) / (a.length - 1);
  }
  function sd(a) { var v = variance(a); return v == null ? null : Math.sqrt(v); }
  function quantile(sorted, q) {
    if (!sorted.length) return null;
    var pos = (sorted.length - 1) * q;
    var lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function median(a) { return quantile(a.slice().sort(function (x, y) { return x - y; }), 0.5); }

  /* A small seeded generator, so a report reads the same every time it is made. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- hypothesis tests ---------- */

  function anova(groups) {
    var k = groups.length;
    var all = [].concat.apply([], groups);
    var N = all.length;
    if (k < 2 || N - k < 1) return null;
    var grand = mean(all);
    var ssb = sum(groups.map(function (g) { return g.length * Math.pow(mean(g) - grand, 2); }));
    var ssw = sum(groups.map(function (g) {
      var m = mean(g);
      return sum(g.map(function (x) { return (x - m) * (x - m); }));
    }));
    var df1 = k - 1, df2 = N - k;
    var msb = ssb / df1, msw = ssw / df2;
    if (msw === 0) return { F: ssb > 0 ? Infinity : 0, p: ssb > 0 ? 0 : 1, df1: df1, df2: df2, ssb: ssb, ssw: ssw };
    var F = msb / msw;
    return { F: F, p: fSf(F, df1, df2), df1: df1, df2: df2, ssb: ssb, ssw: ssw };
  }

  function ranks(values) {
    var order = values.map(function (v, i) { return { v: v, i: i }; }).sort(function (a, b) { return a.v - b.v; });
    var out = new Array(values.length);
    var ties = [];
    for (var i = 0; i < order.length;) {
      var j = i;
      while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
      var r = (i + j) / 2 + 1;
      for (var k = i; k <= j; k++) out[order[k].i] = r;
      ties.push(j - i + 1);
      i = j + 1;
    }
    return { ranks: out, ties: ties };
  }

  function kruskal(groups) {
    var k = groups.length;
    var all = [].concat.apply([], groups);
    var N = all.length;
    if (k < 2 || N < 3) return null;
    var rk = ranks(all);
    var at = 0;
    var total = 0;
    groups.forEach(function (g) {
      var r = sum(rk.ranks.slice(at, at + g.length));
      total += r * r / g.length;
      at += g.length;
    });
    var H = 12 / (N * (N + 1)) * total - 3 * (N + 1);
    var tieTerm = sum(rk.ties.map(function (t) { return t * t * t - t; }));
    var C = 1 - tieTerm / (N * N * N - N);
    if (C <= 0) return { H: 0, p: 1, df: k - 1 };
    H /= C;
    return { H: H, p: chi2Sf(H, k - 1), df: k - 1 };
  }

  /* Brown-Forsythe: an ANOVA on each game's distance from its ball's median. */
  function levene(groups) {
    return anova(groups.map(function (g) {
      var m = median(g);
      return g.map(function (x) { return Math.abs(x - m); });
    }));
  }

  function welch(a, b) {
    var na = a.length, nb = b.length;
    var va = variance(a), vb = variance(b);
    var diff = mean(a) - mean(b);
    var se2 = va / na + vb / nb;
    var pooled = Math.sqrt(((na - 1) * va + (nb - 1) * vb) / (na + nb - 2));
    if (se2 === 0) return { diff: diff, t: diff === 0 ? 0 : Infinity, df: na + nb - 2, p: diff === 0 ? 1 : 0, d: pooled ? diff / pooled : 0 };
    var t = diff / Math.sqrt(se2);
    var df = se2 * se2 / (Math.pow(va / na, 2) / (na - 1) + Math.pow(vb / nb, 2) / (nb - 1));
    return { diff: diff, t: t, df: df, p: tTwoSided(t, df), d: pooled ? diff / pooled : 0 };
  }

  /* Holm's step-down correction for the family of pairwise tests. */
  function holm(ps) {
    var order = ps.map(function (p, i) { return { p: p, i: i }; }).sort(function (a, b) { return a.p - b.p; });
    var out = new Array(ps.length);
    var running = 0;
    order.forEach(function (o, rank) {
      running = Math.max(running, Math.min(1, (ps.length - rank) * o.p));
      out[o.i] = running;
    });
    return out;
  }

  /* ---------- the report ---------- */

  var BANDS = [
    { label: 'Under 180', lo: -Infinity, hi: 180 },
    { label: '180–199', lo: 180, hi: 200 },
    { label: '200–219', lo: 200, hi: 220 },
    { label: '220–239', lo: 220, hi: 240 },
    { label: '240+', lo: 240, hi: Infinity },
  ];

  function byDate(a, b) {
    return String(a.date || '').localeCompare(String(b.date || '')) ||
      String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  }

  function describe(id, games, pool, label) {
    var scores = games.map(function (g) { return Shots.score(g).total; });
    var n = scores.length;
    var sorted = scores.slice().sort(function (a, b) { return a - b; });
    var m = mean(scores);
    var s = sd(scores);
    var q1 = quantile(sorted, 0.25), q3 = quantile(sorted, 0.75);
    var iqr = q3 - q1;
    var inside = sorted.filter(function (x) { return x >= q1 - 1.5 * iqr && x <= q3 + 1.5 * iqr; });
    var tcrit = n > 1 ? tCritical(0.05, n - 1) : null;

    var shots = Shots.analyze(pool, { ball: id });

    var lo = Math.floor(sorted[0] / 10) * 10, hi = Math.ceil(sorted[n - 1] / 10) * 10;
    var survival = [];
    for (var t = lo; t <= hi; t += 10) {
      survival.push({ score: t, share: scores.filter(function (x) { return x >= t; }).length / n });
    }
    var run = 0;
    var running = scores.map(function (x, i) { run += x; return run / (i + 1); });

    var league = [], other = [];
    games.forEach(function (g, i) { (g.event === 'league' ? league : other).push(scores[i]); });
    var patterns = {};
    games.forEach(function (g, i) {
      var key = g.pattern || 'Not recorded';
      (patterns[key] = patterns[key] || []).push(scores[i]);
    });

    var m3 = m * 3;
    var s3 = s == null ? null : s * Math.sqrt(3);
    function chance(threshold) {
      if (s3 == null || s3 === 0) return s3 === 0 ? (m3 >= threshold ? 1 : 0) : null;
      return 1 - normCdf((threshold - 0.5 - m3) / s3);
    }

    return {
      id: id, label: label(id), n: n, scores: scores, games: games,
      mean: m, median: median(scores), sd: s, min: sorted[0], max: sorted[n - 1],
      q1: q1, q3: q3, whiskerLo: inside[0], whiskerHi: inside[inside.length - 1],
      ci: s == null ? null : [m - tcrit * s / Math.sqrt(n), m + tcrit * s / Math.sqrt(n)],
      over200: scores.filter(function (x) { return x >= 200; }).length / n,
      bands: BANDS.map(function (b) {
        return scores.filter(function (x) { return x >= b.lo && x < b.hi; }).length / n;
      }),
      survival: survival, running: running,
      shots: shots,
      league: { n: league.length, mean: mean(league) },
      other: { n: other.length, mean: mean(other) },
      patterns: Object.keys(patterns).map(function (p) {
        return { pattern: p, n: patterns[p].length, mean: mean(patterns[p]) };
      }).sort(function (a, b) { return b.n - a.n || a.pattern.localeCompare(b.pattern); }),
      series: { mean: m3, sd: s3, lo: s3 == null ? null : m3 - s3, hi: s3 == null ? null : m3 + s3, p600: chance(600), p700: chance(700) },
    };
  }

  /*
   * games: every finished game; options:
   *   label(id) -> name, ids: only these balls, minGames (default 2),
   *   maxBalls (default 4), bootstrap (default 4000)
   */
  function build(games, options) {
    options = options || {};
    var label = options.label || function (id) { return id; };
    var done = Shots.finished(games).slice().sort(byDate);
    var by = {};
    done.forEach(function (g) {
      var id = Shots.primaryBall(g);
      if (!id) return;
      (by[id] = by[id] || []).push(g);
    });
    var minGames = options.minGames == null ? 2 : options.minGames;
    var ids = Object.keys(by).filter(function (id) {
      return by[id].length >= minGames && (!options.ids || options.ids.indexOf(id) !== -1);
    }).sort(function (a, b) {
      return by[b].length - by[a].length || String(label(a)).localeCompare(String(label(b)));
    }).slice(0, options.maxBalls || 4);

    var balls = ids.map(function (id) { return describe(id, by[id], done, label); });
    var all = [].concat.apply([], balls.map(function (b) { return b.scores; }));
    var out = {
      balls: balls, games: all.length, mean: mean(all),
      excluded: Object.keys(by).length - balls.length,
      excludedGames: done.length - all.length,
      tests: null, bootstrap: null, shrunk: null, headline: '', takeaways: [],
    };
    var testable = balls.filter(function (b) { return b.n >= 2; });
    if (testable.length >= 2) {
      var groups = testable.map(function (b) { return b.scores; });
      out.tests = { anova: anova(groups), kruskal: kruskal(groups), levene: levene(groups), pairs: [] };
      for (var i = 0; i < testable.length; i++) {
        for (var j = i + 1; j < testable.length; j++) {
          var w = welch(testable[i].scores, testable[j].scores);
          out.tests.pairs.push({ a: testable[i].id, b: testable[j].id, aLabel: testable[i].label, bLabel: testable[j].label,
            diff: w.diff, d: w.d, t: w.t, df: w.df, p: w.p });
        }
      }
      var adj = holm(out.tests.pairs.map(function (p) { return p.p; }));
      out.tests.pairs.forEach(function (p, k) { p.holm = adj[k]; });

      /* Bootstrap: how often each ball has the highest average in a resample. */
      var B = options.bootstrap == null ? 4000 : options.bootstrap;
      var rand = rng(20261018);
      var wins = testable.map(function () { return 0; });
      for (var r = 0; r < B; r++) {
        var means = groups.map(function (g) {
          var total = 0;
          for (var q = 0; q < g.length; q++) total += g[Math.floor(rand() * g.length)];
          return total / g.length;
        });
        var best = Math.max.apply(null, means);
        var tied = means.filter(function (x) { return x === best; }).length;
        means.forEach(function (x, k) { if (x === best) wins[k] += 1 / tied; });
      }
      out.bootstrap = {};
      testable.forEach(function (b, k) { out.bootstrap[b.id] = wins[k] / B; });

      /* Shrinkage: pull each average toward the overall one by how noisy it is. */
      var withVar = testable.filter(function (b) { return b.n >= 2; });
      var pooledVar = sum(withVar.map(function (b) { return (b.n - 1) * variance(b.scores); })) /
        sum(withVar.map(function (b) { return b.n - 1; }));
      var v = testable.map(function (b) { return pooledVar / b.n; });
      var w8 = v.map(function (x) { return x ? 1 / x : 0; });
      var mw = sum(testable.map(function (b, k) { return w8[k] * b.mean; })) / sum(w8 || [1]);
      var Q = sum(testable.map(function (b, k) { return w8[k] * Math.pow(b.mean - mw, 2); }));
      var sw = sum(w8), sw2 = sum(w8.map(function (x) { return x * x; }));
      var tau2 = sw && sw > 0 ? Math.max(0, (Q - (testable.length - 1)) / (sw - sw2 / sw)) : 0;
      out.shrunk = { center: mw, tau2: tau2, balls: {} };
      testable.forEach(function (b, k) {
        var weight = tau2 + v[k] > 0 ? tau2 / (tau2 + v[k]) : 0;
        out.shrunk.balls[b.id] = mw + weight * (b.mean - mw);
      });
    }
    out.headline = headline(out);
    out.takeaways = takeaways(out);
    return out;
  }

  function fmtP(p) { return p == null ? 'n/a' : p < 0.001 ? '<0.001' : p.toFixed(2); }

  function headline(rep) {
    if (rep.balls.length < 2) return 'Not enough games to compare yet.';
    var p = rep.tests && rep.tests.anova ? rep.tests.anova.p : null;
    if (p == null) return 'Not enough games to compare yet.';
    return p < 0.05 ? 'The balls really do score differently.' : 'One honest answer: too close to call.';
  }

  /* Plain-English readings, written from the numbers. */
  function takeaways(rep) {
    var balls = rep.balls;
    if (balls.length < 2) return [];
    var out = [];
    var byMean = balls.slice().sort(function (a, b) { return b.mean - a.mean; });
    var top = byMean[0], second = byMean[1];
    var p = rep.tests && rep.tests.anova ? rep.tests.anova.p : null;
    out.push({
      title: top.label + ' leads on average',
      body: 'Highest average (' + top.mean.toFixed(1) + ') and ' + Math.round(top.over200 * 100) + '% of games at 200 or better. ' +
        (p != null && p >= 0.05
          ? 'But the gap to ' + second.label + ' (' + (top.mean - second.mean).toFixed(1) + ' pins) is within what luck produces over this many games.'
          : 'The gap to ' + second.label + ' is ' + (top.mean - second.mean).toFixed(1) + ' pins, and it holds up statistically.'),
    });
    var spread = balls.filter(function (b) { return b.sd != null; });
    if (spread.length) {
      var steady = spread.slice().sort(function (a, b) { return a.sd - b.sd; })[0];
      out.push({
        title: steady.label + ' is the steady one',
        body: 'Tightest spread (SD ' + steady.sd.toFixed(1) + '). A typical 3-game series lands between ' +
          Math.round(steady.series.lo) + ' and ' + Math.round(steady.series.hi) + '.',
      });
      var wide = spread.slice().sort(function (a, b) { return b.sd - a.sd; })[0];
      if (wide.id !== steady.id) {
        out.push({
          title: wide.label + ' is boom or bust',
          body: 'Widest spread (SD ' + wide.sd.toFixed(1) + '): ' + Math.round(wide.bands[0] * 100) + '% of games under 180 and ' +
            Math.round(wide.bands[4] * 100) + '% at 240 or more.',
        });
      }
    }
    var thin = balls.filter(function (b) { return b.n < 8; });
    if (thin.length) {
      out.push({
        title: thin.map(function (b) { return b.label; }).join(' and ') + ' cannot be judged yet',
        body: 'Only ' + thin.map(function (b) { return b.n; }).join(' and ') + ' games, so the confidence interval is wide. ' +
          'A few more games would tell you far more than another average.',
      });
    }
    return out.slice(0, 4);
  }

  var api = {
    build: build, fmtP: fmtP,
    anova: anova, kruskal: kruskal, levene: levene, welch: welch, holm: holm,
    tTwoSided: tTwoSided, fSf: fSf, chi2Sf: chi2Sf, normCdf: normCdf, tCritical: tCritical, betainc: betainc,
    mean: mean, sd: sd, median: median, quantile: quantile, variance: variance, rng: rng,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.BallStats = api;
})();
