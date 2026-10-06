/* Loads the real stats engine under a window shim and checks league rule 9:
   book average for the first 12 games, bowled average after. */
const fs = require('fs');
const vm = require('vm');

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, '..', 'js', 'stats.js'), 'utf8'), ctx);
const { build, handicapFor } = ctx.window.LeagueStats;

const fails = [], ok = [];
const check = (l, c, d) => (c ? ok : fails).push(l + (c ? '' : '  →  ' + d));

// One bowler, book average 150, who bowls a flat 180 every game.
// Book handicap    = floor((220-150) * .9) = 63
// Bowled handicap  = floor((220-180) * .9) = 36
const WEEKS = 6;
const fixture = {
  league: { name: 'T', weeksInSeason: 32 },
  scoring: { gamesPerWeek: 3, useHandicap: true, handicapBasis: 220,
             handicapPercent: 90, pointsPerGame: 1, pointsForSeries: 1 },
  teams: [{ id: 't1', name: 'A' }, { id: 't2', name: 'B' }],
  players: [{ id: 'p1', name: 'Flat', teamId: 't1', entryAverage: 150 },
            { id: 'p2', name: 'Rival', teamId: 't2', entryAverage: 200 }],
  weeks: Array.from({ length: WEEKS }, (_, i) => ({
    number: i + 1, date: '2026-09-0' + ((i % 8) + 1),
    scores: [{ playerId: 'p1', games: [180, 180, 180] },
             { playerId: 'p2', games: [200, 200, 200] }],
    matches: [{ homeTeamId: 't1', awayTeamId: 't2', lanes: '1-2' }],
  })),
};

check('book handicap is 63', handicapFor(150, fixture.scoring) === 63, handicapFor(150, fixture.scoring));
check('bowled handicap is 36', handicapFor(180, fixture.scoring) === 36, handicapFor(180, fixture.scoring));

const m = build(fixture);
const p = m.players.find(x => x.id === 'p1');
const byWeek = p.weeks.map(w => w.handicap);

// Weeks 1-4 are games 1-12, so they stay on the book average. Week 5 is the
// first bowled on the adjusted one.
check('weeks 1-4 use the book average',
      byWeek.slice(0, 4).every(h => h === 63), JSON.stringify(byWeek));
check('week 5 switches to the bowled average', byWeek[4] === 36, JSON.stringify(byWeek));
check('week 6 stays on the bowled average', byWeek[5] === 36, JSON.stringify(byWeek));
check('the switch is at game 13, not week 5 by name', byWeek.indexOf(36) === 4, JSON.stringify(byWeek));
check('current handicap is the adjusted one', p.handicap === 36, p.handicap);
check('established flag set', p.established === true, p.established);
check('nothing left to establish', p.gamesToEstablish === 0, p.gamesToEstablish);

// A team's night must be scored on that night's handicap, not today's.
const t1 = m.teams.find(t => t.id === 't1');
const wk1 = t1.weeks.find(w => w.number === 1);
const wk5 = t1.weeks.find(w => w.number === 5);
check('week 1 team handicap uses the book number', wk1.handicap === 63, wk1.handicap);
check('week 5 team handicap uses the adjusted number', wk5.handicap === 36, wk5.handicap);
check('week 1 hdcp series is scratch + 3 x book',
      wk1.hdcpSeries === 540 + 63 * 3, wk1.hdcpSeries);
check('week 5 hdcp series is scratch + 3 x adjusted',
      wk5.hdcpSeries === 540 + 36 * 3, wk5.hdcpSeries);
check('week 1 was not retroactively rescored', wk1.hdcpSeries !== 540 + 36 * 3, wk1.hdcpSeries);

// A bowler who misses weeks establishes later: games, not weeks, are counted.
const sparse = JSON.parse(JSON.stringify(fixture));
sparse.weeks.forEach((w, i) => {
  if (i % 2 === 1) w.scores = w.scores.filter(s => s.playerId !== 'p1');
});
const sp = build(sparse).players.find(x => x.id === 'p1');
const spWeeks = sp.weeks.map(w => w.number + ':' + w.handicap);
check('a bowler who misses weeks stays on book longer',
      sp.weeks.every(w => w.handicap === 63), JSON.stringify(spWeeks));
check('and still owes games to establish', sp.gamesToEstablish === 3, sp.gamesToEstablish);

// Averages are whole pins, the fraction dropped, before the handicap is taken.
// 2111 over 12 is 175.92: kept as 175, that is 40; unrounded it would be 39.
const trunc = {
  scoring: fixture.scoring,
  teams: [{ id: 't1', name: 'T' }],
  players: [{ id: 'p1', name: 'P', teamId: 't1', entryAverage: 200 }],
  weeks: [1, 2, 3, 4].map(n => ({ number: n, date: '2026-09-0' + n, matches: [],
    scores: [{ playerId: 'p1', games: n === 4 ? [176, 176, 175] : [176, 176, 176] }] })),
};
const tp = build(trunc).players[0];
check('an established average drops its fraction: 2111/12 gives handicap 40',
      tp.handicap === 40, tp.handicap);

// The real league data, against the week-4 sheet: bowlers with 12 games are
// on what they have bowled, everyone else is still on book.
const real = fs.readFileSync(require('path').join(__dirname, '..', 'data', 'league.js'), 'utf8');
const rctx = { window: {} };
vm.createContext(rctx);
vm.runInContext(real, rctx);
const live = build(rctx.window.LEAGUE_DATA);
const who = n => live.players.find(x => x.name === n);
check('real league: under 12 games is still on book',
      live.players.filter(x => x.games < 12)
        .every(x => x.handicap === handicapFor(x.entryAverage, live.scoring)),
      'a handicap drifted before 12 games');
for (const [n, h] of [['Marty Tate', 46], ['Jon Boxwell', 37], ['Spencer Foutz', 0],
                      ['Aaron Jones', 72], ['Butch Finkbeiner', 80], ['Thomas Woody', 56],
                      ['Kamus Thompson', 22], ['Oliver Lawson', 0]]) {
  check('real league: ' + n + ' carries ' + h + ' into week 5, as printed',
        who(n).handicap === h, who(n).handicap);
}

console.log(ok.map(s => '  ok  ' + s).join('\n'));
console.log(fails.length ? '\nFAILED:\n' + fails.map(s => '  x  ' + s).join('\n')
                         : '\nall handicap assertions passed');
process.exit(fails.length ? 1 : 0);
