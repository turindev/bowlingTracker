/* Ball statistics: the special functions and tests against known values, and
   the report's structure on generated games. */
const S = require('../js/shots.js');
const B = require('../js/ballstats.js');

const fails = [], ok = [];
const check = (l, c, d) => (c ? ok : fails.push(l + '  →  ' + d), c && ok.push(l));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// --- distributions, against textbook values -------------------------------------------
check('normal CDF at 1.96 is 0.97500', near(B.normCdf(1.96), 0.9750021, 1e-6), B.normCdf(1.96));
check('normal CDF is symmetric', near(B.normCdf(-1.3) + B.normCdf(1.3), 1, 1e-12), '');
check('t two-sided p for t=2, df=8 is 0.0805', near(B.tTwoSided(2, 8), 0.0805, 5e-4), B.tTwoSided(2, 8));
check('t two-sided p for t=2.228, df=10 is 0.05', near(B.tTwoSided(2.228, 10), 0.05, 5e-4), B.tTwoSided(2.228, 10));
check('the t critical value for df=10 is 2.228', near(B.tCritical(0.05, 10), 2.2281, 1e-3), B.tCritical(0.05, 10));
check('the t critical value for df=3 is 3.182', near(B.tCritical(0.05, 3), 3.1824, 1e-3), B.tCritical(0.05, 3));
check('F upper tail at 3.4928 with (2,20) df is 0.05', near(B.fSf(3.4928, 2, 20), 0.05, 5e-4), B.fSf(3.4928, 2, 20));
check('F with 2 numerator df has the closed form (1 + 2F/d2)^(-d2/2)', near(B.fSf(13, 2, 6), Math.pow(1 + 26 / 6, -3), 1e-9), B.fSf(13, 2, 6));
check('chi-square upper tail at 3.841 with 1 df is 0.05', near(B.chi2Sf(3.841, 1), 0.05, 2e-4), B.chi2Sf(3.841, 1));
check('chi-square with 2 df is exp(-x/2)', near(B.chi2Sf(7.2, 2), Math.exp(-3.6), 1e-9), B.chi2Sf(7.2, 2));
check('chi-square upper tail at 9.488 with 4 df is 0.05', near(B.chi2Sf(9.488, 4), 0.05, 2e-4), B.chi2Sf(9.488, 4));

// --- tests, worked by hand -----------------------------------------------------------------
const a3 = B.anova([[1, 2, 3], [2, 3, 4], [5, 6, 7]]);
check('ANOVA: SSB 26, SSW 6, F 13 on (2, 6) df', near(a3.ssb, 26, 1e-9) && near(a3.ssw, 6, 1e-9) && near(a3.F, 13, 1e-9) && a3.df1 === 2 && a3.df2 === 6, JSON.stringify(a3));
check('ANOVA: p = 0.00659', near(a3.p, Math.pow(1 + 26 / 6, -3), 1e-9), a3.p);
check('ANOVA on identical groups gives p = 1', B.anova([[5, 5, 5], [5, 5, 5]]).p === 1, '');
check('ANOVA with no spread inside groups but a gap gives p = 0', B.anova([[1, 1, 1], [2, 2, 2]]).p === 0, '');
check('ANOVA needs two groups and a degree of freedom', B.anova([[1, 2, 3]]) === null && B.anova([[1], [2]]) === null, '');

const k3 = B.kruskal([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
check('Kruskal-Wallis: H = 7.2 on 2 df, p = exp(-3.6)', near(k3.H, 7.2, 1e-9) && near(k3.p, Math.exp(-3.6), 1e-9), JSON.stringify(k3));
const kTies = B.kruskal([[1, 1, 2], [2, 3, 3], [3, 4, 4]]);
check('Kruskal-Wallis copes with ties', kTies && isFinite(kTies.H) && kTies.p > 0 && kTies.p <= 1, JSON.stringify(kTies));

const w = B.welch([1, 2, 3, 4, 5], [3, 4, 5, 6, 7]);
check('Welch: t = -2 on 8 df, p = 0.0805', near(w.t, -2, 1e-9) && near(w.df, 8, 1e-9) && near(w.p, 0.0805, 5e-4), JSON.stringify(w));
check('Welch: Cohen d = diff / pooled SD = -1.265', near(w.d, -2 / Math.sqrt(2.5), 1e-9), w.d);
check('Welch is symmetric in sign', near(B.welch([3, 4, 5, 6, 7], [1, 2, 3, 4, 5]).p, w.p, 1e-12), '');

const h = B.holm([0.01, 0.04, 0.03]);
check('Holm: 0.01, 0.03, 0.04 become 0.03, 0.06, 0.06', near(h[0], 0.03, 1e-12) && near(h[2], 0.06, 1e-12) && near(h[1], 0.06, 1e-12), JSON.stringify(h));
check('Holm never goes above 1 or below the raw p', B.holm([0.6, 0.7]).every((p, i) => p <= 1 && p >= [0.6, 0.7][i]), '');

const lv = B.levene([[10, 10, 10, 10], [1, 20, 5, 30]]);
check('Levene sees a very different spread', lv.p < 0.05, lv.p);
check('Levene sees equal spreads as equal', B.levene([[1, 2, 3, 4], [11, 12, 13, 14]]).p > 0.99, B.levene([[1, 2, 3, 4], [11, 12, 13, 14]]).p);

check('mean, sample SD, median, quartile', B.mean([2, 4, 6]) === 4 && near(B.sd([2, 4, 6]), 2, 1e-12) && B.median([5, 1, 3, 2]) === 2.5 && B.quantile([1, 2, 3, 4, 5], 0.25) === 2, '');
const r1 = B.rng(7), r2 = B.rng(7);
check('the seeded generator repeats and stays in [0, 1)', [1, 2, 3].every(() => { const x = r1(); return x === r2() && x >= 0 && x < 1; }), '');

// --- generated games ----------------------------------------------------------------------------------
function bowl(ballId, rand, p, q, date, extra) {
  let g = S.newGame(Object.assign({ date, ball: ballId, event: 'league', pattern: 'House' }, extra));
  const hits = ['pocket', 'pocket', 'high', 'light', 'brooklyn'];
  const rack = (fresh) => {
    const strike = rand() < p;
    g = S.addShot(g, { standing: strike ? [] : [1 + Math.floor(rand() * 10)], hit: hits[Math.floor(rand() * 5)], ball: ballId });
    return strike;
  };
  for (let f = 0; f < 10; f++) {
    const pos = S.position(g);
    if (!pos) break;
    const strike = rack();
    if (!strike) {
      const left = S.walk(g).slice(-1)[0].standing;
      g = S.addShot(g, { standing: rand() < q ? [] : left, ball: ballId });
    }
  }
  while (S.position(g)) {
    const pos = S.position(g);
    g = S.addShot(g, pos.fresh ? { standing: rand() < p ? [] : [pos.before[0]], hit: 'pocket', ball: ballId }
                               : { standing: rand() < q ? [] : pos.before.slice(0, 1), ball: ballId });
  }
  g.status = 'done';
  return g;
}
const rand = B.rng(99);
const games = [];
const plan = [['A', 24, 0.55, 0.85], ['B', 18, 0.45, 0.8], ['C', 12, 0.35, 0.75], ['D', 3, 0.5, 0.8], ['E', 1, 0.5, 0.8]];
let day = 1;
plan.forEach(([id, n, p, q]) => { for (let i = 0; i < n; i++) games.push(bowl(id, rand, p, q, '2026-10-' + String(day++ % 28 + 1).padStart(2, '0'))); });

const rep = B.build(games, { label: id => 'Ball ' + id });
check('four balls at most, the ones with the most games', rep.balls.map(b => b.id).join() === 'A,B,C,D', rep.balls.map(b => b.id).join());
check('a ball with a single game is left out, and the report says so', rep.excluded === 1 && rep.excludedGames === 1, rep.excluded + '/' + rep.excludedGames);
check('the games analysed add up', rep.games === 24 + 18 + 12 + 3, rep.games);
const A = rep.balls[0];
check('each ball has its scores, count and mean', A.n === 24 && A.scores.length === 24 && near(A.mean, B.mean(A.scores), 1e-9), '');
check('the mean sits inside its own 95% interval', A.ci[0] < A.mean && A.mean < A.ci[1], JSON.stringify(A.ci));
check('the interval is the t interval', near(A.ci[1] - A.mean, B.tCritical(0.05, 23) * A.sd / Math.sqrt(24), 1e-9), '');
check('a ball with 3 games has a wider interval than one with 24', (rep.balls[3].ci[1] - rep.balls[3].ci[0]) / rep.balls[3].sd > (A.ci[1] - A.ci[0]) / A.sd, '');
check('score bands add up to 100%', near(A.bands.reduce((a, b) => a + b, 0), 1, 1e-9), A.bands.join());
check('whiskers sit inside the min and max, and the median inside the box', A.whiskerLo >= A.min && A.whiskerHi <= A.max && A.q1 <= A.median && A.median <= A.q3, '');
check('the survival curve starts at 100% and never rises', A.survival[0].share === 1 && A.survival.every((s, i) => i === 0 || s.share <= A.survival[i - 1].share), '');
check('the running average ends on the mean', near(A.running[A.running.length - 1], A.mean, 1e-9) && A.running.length === 24, '');
check('shot figures come from the shot engine', A.shots.racks > 0 && A.shots.strikePct != null && A.shots.hitsRecorded > 0, '');
check('league and open play are split by event', A.league.n === 24 && A.other.n === 0 && A.other.mean === null, JSON.stringify([A.league.n, A.other.n]));
check('patterns are listed with their games', A.patterns.length === 1 && A.patterns[0].pattern === 'House' && A.patterns[0].n === 24, '');
check('the series forecast is three times the mean, root-three times the SD',
      near(A.series.mean, 3 * A.mean, 1e-9) && near(A.series.sd, A.sd * Math.sqrt(3), 1e-9), '');
check('and the chance of a 600 and a 700 are probabilities, 600 at least as likely as 700',
      A.series.p600 >= 0 && A.series.p600 <= 1 && A.series.p700 <= A.series.p600, JSON.stringify(A.series));

check('every test ran', rep.tests && rep.tests.anova && rep.tests.kruskal && rep.tests.levene, JSON.stringify(rep.tests && Object.keys(rep.tests)));
check('ANOVA, Kruskal and Levene give p-values in [0, 1]', [rep.tests.anova.p, rep.tests.kruskal.p, rep.tests.levene.p].every(p => p >= 0 && p <= 1), '');
check('there is a pairwise test for each pair: 6 for four balls', rep.tests.pairs.length === 6, rep.tests.pairs.length);
check('Holm-adjusted p is never below the raw p', rep.tests.pairs.every(p => p.holm >= p.p - 1e-12 && p.holm <= 1), '');
const bsum = Object.values(rep.bootstrap).reduce((a, b) => a + b, 0);
check('the bootstrap odds of being best sum to 1', near(bsum, 1, 1e-9), bsum);
check('the ball with the highest average is the likeliest to be best',
      Object.keys(rep.bootstrap).sort((x, y) => rep.bootstrap[y] - rep.bootstrap[x])[0] === rep.balls.slice().sort((x, y) => y.mean - x.mean)[0].id, JSON.stringify(rep.bootstrap));
check('shrunk averages stay between the raw ones and the overall centre',
      rep.balls.every(b => { const s = rep.shrunk.balls[b.id]; const lo = Math.min(b.mean, rep.shrunk.center), hi = Math.max(b.mean, rep.shrunk.center); return s >= lo - 1e-9 && s <= hi + 1e-9; }), JSON.stringify(rep.shrunk));
check('a ball with fewer games is pulled harder toward the centre',
      (() => { const pull = b => Math.abs(b.mean - rep.shrunk.balls[b.id]) / (Math.abs(b.mean - rep.shrunk.center) || 1); return pull(rep.balls[3]) >= pull(rep.balls[0]) - 1e-9; })(), '');
check('there is a headline and takeaways', rep.headline.length > 10 && rep.takeaways.length >= 2 && rep.takeaways.length <= 4, rep.headline);
check('the takeaways name real balls', rep.takeaways.every(t => /Ball [A-D]/.test(t.title)), JSON.stringify(rep.takeaways.map(t => t.title)));
check('a ball with few games is flagged as unjudgeable', rep.takeaways.some(t => /cannot be judged/.test(t.title)), JSON.stringify(rep.takeaways.map(t => t.title)));
check('the same games give the same report every time', JSON.stringify(B.build(games, { label: id => 'Ball ' + id }).bootstrap) === JSON.stringify(rep.bootstrap), '');

const only = B.build(games.filter(g => g.ball === 'A'), { label: id => id });
check('one ball cannot be compared', only.balls.length === 1 && only.tests === null && /Not enough/.test(only.headline), only.headline);
check('ids picks the balls to compare', B.build(games, { ids: ['A', 'C'] }).balls.map(b => b.id).join() === 'A,C', '');
check('minGames raises the bar', B.build(games, { minGames: 15 }).balls.map(b => b.id).join() === 'A,B', '');
check('no games gives an empty report, not an error', B.build([], {}).balls.length === 0, '');
const switched = bowl('A', B.rng(1), 0.5, 0.8, '2026-10-30');
switched.frames.slice(5).forEach(fr => fr.shots.forEach(sh => { sh.ball = 'Z'; }));
check('a game counts toward the ball that threw most of its first balls', B.build([switched, switched, switched], { label: id => id, minGames: 1 }).balls.length === 1, '');

console.log(ok.map(s => '  ok  ' + s).join('\n'));
console.log(fails.length ? '\nFAILED:\n' + fails.map(s => '  x  ' + s).join('\n') : '\nall ball-statistics assertions passed');
process.exit(fails.length ? 1 : 0);
