/* The Progress and Balls figures: rolling averages, distribution, balls and patterns. */
const S = require('../js/shots.js');
const B = require('../js/ballstats.js');
const T = require('../js/trends.js');

const fails = [], ok = [];
const check = (l, c, d) => (c ? ok : fails).push(l + (c ? '' : '  →  ' + d));

/* A finished game bowled with the given first-ball results: 'X' strike, a leave, or a spare ('/' appended). */
function game(date, ball, pattern, plan, extra) {
  let g = S.newGame(Object.assign({ date, ball, pattern, event: 'league' }, extra));
  const rest = plan.slice();
  while (S.position(g)) {
    const pos = S.position(g);
    if (pos.fresh) {
      const next = rest.shift() || { standing: [], hit: 'pocket' };
      g = S.addShot(g, Object.assign({ ball }, next));
    } else {
      g = S.addShot(g, { standing: [], ball });
    }
  }
  g.status = 'done';
  g.createdAt = date + 'T12:00:00Z';
  return g;
}
const strike = (hit) => ({ standing: [], hit: hit || 'pocket' });
const leave = (pins, hit) => ({ standing: pins, hit: hit || 'pocket' });
const perfect = (d, b, p) => game(d, b, p, []);
const nines = (d, b, p, hit) => game(d, b, p, new Array(12).fill(0).map(() => leave([10], hit)));   // 9 and spare every frame

// --- progress -----------------------------------------------------------------------------
const gs = [perfect('2026-10-01', 'A', 'House'), nines('2026-10-02', 'A', 'House'), perfect('2026-10-03', 'A', 'House'), nines('2026-10-04', 'A', 'House')];
const n = S.score(nines('2026-10-02', 'A', 'House')).total;
const p = T.progress(gs, { window: 2 });
check('progress has one entry per finished game, in date order', p.games.length === 4 && p.games.map(x => x.date).join() === '2026-10-01,2026-10-02,2026-10-03,2026-10-04', '');
check('the rolling average covers the last two games', p.games[1].average === (300 + n) / 2 && p.games[2].average === (n + 300) / 2 && p.games[0].average === 300, JSON.stringify(p.games.map(x => x.average)));
check('and the first entry only has itself to average', p.games[0].window === 1 && p.games[3].window === 2, '');
check('strike % pools the shots in the window', p.games[0].strikePct === 1 && p.games[1].strikePct < 1 && p.games[1].strikePct > 0, p.games[1].strikePct);
check('spare % is null until there is a spare try', p.games[0].sparePct === null && p.games[1].sparePct === 1, JSON.stringify([p.games[0].sparePct, p.games[1].sparePct]));
check('sd needs three games in the window', p.games[1].sd === null && T.progress(gs, { window: 3 }).games[2].sd !== null, '');
check('unfinished games are left out', T.progress(gs.concat([Object.assign({}, gs[0], { id: 'x', status: 'open' })])).games.length === 4, '');
check('no games gives no progress', T.progress([]).games.length === 0, '');

// --- distribution -------------------------------------------------------------------------
const d = T.distribution([150, 155, 171, 200, 239, 240, 299], 20);
check('distribution bins start at the floor of the lowest score', d[0].lo === 140 && d[d.length - 1].lo === 280, JSON.stringify(d.map(x => x.lo)));
check('every score is counted once', d.reduce((t, x) => t + x.n, 0) === 7 && Math.abs(d.reduce((t, x) => t + x.share, 0) - 1) < 1e-9, '');
check('a bin holds lo..hi inclusive', d.find(x => x.lo === 220).n === 1 && d.find(x => x.lo === 240).n === 1 && d.find(x => x.lo === 140).n === 2, '');
check('an empty list has no bins', T.distribution([]).length === 0, '');

// --- balls --------------------------------------------------------------------------------
// ball A: strikes with pocket hits (carries even when off); ball B: lots of off-pocket misses
const A = [], Bg = [];
for (let i = 0; i < 6; i++) A.push(game('2026-10-0' + (i + 1), 'A', 'House', [strike('pocket'), strike('light'), strike('high'), leave([10], 'pocket'), strike('pocket')]));
for (let i = 0; i < 6; i++) Bg.push(game('2026-10-1' + i, 'B', 'House', [strike('pocket'), leave([10], 'light'), leave([7], 'high'), leave([10], 'pocket')]));
const rows = T.balls(A.concat(Bg), { label: id => 'Ball ' + id });
const rA = rows.find(r => r.id === 'A'), rB = rows.find(r => r.id === 'B');
check('one row per ball with its games', rows.length === 2 && rA.n === 6 && rB.n === 6 && rA.label === 'Ball A', '');
check('off-pocket strike rate is the carry on light, high and Brooklyn hits', rA.offPocketStrikePct > rB.offPocketStrikePct && rB.offPocketStrikePct !== null, JSON.stringify([rA.offPocketStrikePct, rB.offPocketStrikePct]));
check('the carry gap is pocket minus off-pocket strike rate', Math.abs(rA.carryGap - (rA.pocketStrikePct - rA.offPocketStrikePct)) < 1e-12, '');
check('the forgiving ball has the higher mean and a higher floor', rA.mean > rB.mean && rA.p10 >= rB.p10, JSON.stringify([rA.mean, rB.mean, rA.p10, rB.p10]));
check('a ball needs the minimum games to appear', T.balls(A.concat(Bg), { minGames: 7 }).length === 0, '');
check('the 95% interval brackets the mean', rA.ci && rA.ci[0] <= rA.mean && rA.ci[1] >= rA.mean, JSON.stringify(rA.ci));
check('with fewer than five games there is no tenth percentile', T.balls(A.slice(0, 3), {})[0].p10 === null, '');

// --- ball x pattern -----------------------------------------------------------------------
const mix = [];
for (let i = 0; i < 4; i++) mix.push(game('2026-09-0' + (i + 1), 'A', 'House', [strike(), leave([10]), strike()]));
for (let i = 0; i < 4; i++) mix.push(game('2026-09-1' + i, 'B', 'House', [leave([7]), leave([10]), strike()]));
for (let i = 0; i < 2; i++) mix.push(game('2026-09-2' + i, 'A', 'Sport', [leave([7]), leave([10])]));
for (let i = 0; i < 4; i++) mix.push(game('2026-09-3' + (i % 10), 'B', 'Sport', [strike(), strike(), leave([10])]));
const bp = T.ballPattern(mix, { label: id => 'Ball ' + id });
check('patterns and balls are listed most-played first', bp.patterns[0] === 'House' && bp.balls.length === 2, JSON.stringify([bp.patterns, bp.balls]));
check('each ball-pattern cell has its games and mean', bp.cells['A\u0001House'].n === 4 && bp.cells['B\u0001Sport'].n === 4 && bp.cells['A\u0001Sport'].n === 2, '');
const house = bp.rows.find(r => r.pattern === 'House'), sport = bp.rows.find(r => r.pattern === 'Sport');
check('the best ball on a pattern is the highest mean with enough games', house.best.id === 'A' && sport.best.id === 'B', JSON.stringify([house.best, sport.best]));
check('a ball with too few games on a pattern is never named', sport.best.id !== 'A' && sport.steadiest.id === 'B', '');
check('a pattern with no ball past the minimum names nobody', T.ballPattern(mix.slice(0, 2), {}).rows[0].best === null, '');

// --- timeline -----------------------------------------------------------------------------
const tl = T.ballTimeline(mix, ['A', 'B'], { window: 2 });
check('the timeline has a point per game for each ball, in time order', tl[0].points.length === 6 && tl[1].points.length === 8 && tl[0].points.every((pt, i, a) => !i || a[i - 1].t <= pt.t), '');
check('and a rolling average of that ball\'s own recent games', Math.abs(tl[0].points[1].average - (tl[0].points[0].score + tl[0].points[1].score) / 2) < 1e-9, '');

// games on one night are spread along the axis, in order
const night = T.progress([perfect('2026-10-01', 'A', 'House'), nines('2026-10-01', 'A', 'House'), nines('2026-10-01', 'A', 'House'), perfect('2026-10-02', 'A', 'House')]);
check('three games on one night get three increasing times inside that day', night.games[0].t < night.games[1].t && night.games[1].t < night.games[2].t && night.games[2].t < night.games[0].t + 1, JSON.stringify(night.games.map(x => x.t)));
check('a lone game that day sits on the day itself', night.games[3].t === T.dayNumber('2026-10-02'), '');

// strike streaks by ball
const Cg = [nines('2026-10-20', 'C', 'House'), nines('2026-10-21', 'C', 'House')];
const sRows = T.balls(A.concat(Cg), { label: id => id });
const sA = sRows.find(r => r.id === 'A').streaks, sC = sRows.find(r => r.id === 'C').streaks;
check('each ball row carries its streak figures', sA && sC && sA.games === 6 && sC.games === 2, JSON.stringify(sA));
check('a turkey or better is counted once per run, and per game', sA.turkeys === 12 && sA.turkeysPerGame === 2 && sA.gamesWithTurkey === 6 && sA.turkeyGamePct === 1, JSON.stringify(sA));
check('the longest streak and the runs by length', sA.longest === 8 && sA.byLength[3] === 6 && sA.byLength[4] === 0 && sA.byLength[5] === 6, JSON.stringify(sA));
check('a ball that never strings strikes has none', sC.turkeys === 0 && sC.turkeysPerGame === 0 && sC.longest <= 1 && sC.turkeyGamePct === 0, JSON.stringify(sC));
check('strike after strike is reported with its sample', sA.afterStrikeN > 0 && sA.afterStrikePct >= 0.9, JSON.stringify(sA));

console.log(ok.map(s => '  ok  ' + s).join('\n'));
console.log(fails.length ? '\nFAILED:\n' + fails.map(s => '  x  ' + s).join('\n') : '\nall trends assertions passed');
process.exit(fails.length ? 1 : 0);
