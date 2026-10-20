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
const raw = rctx.window.LEAGUE_DATA;
const upTo = n => build(Object.assign({}, raw, { weeks: raw.weeks.filter(w => w.number <= n) }));
let live = upTo(4);
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

// And against the week-5 sheet, for the handicaps bowled on in week 6. Kamus
// Thompson's 16 comes off 2434 over 12, an average of 202.
live = upTo(5);
check('real league, week 5: under 12 games is still on book',
      live.players.filter(x => x.games < 12)
        .every(x => x.handicap === handicapFor(x.entryAverage, live.scoring)),
      'a handicap drifted before 12 games');
for (const [n, h] of [['Marty Tate', 46], ['Jon Boxwell', 34], ['Aaron Jones', 67],
                      ['Butch Finkbeiner', 77], ['Kamus Thompson', 16], ['Matt Rayfield', 82],
                      ['Michael Eisel', 24], ['Don Speer', 59], ['Michael Kimble', 1],
                      ['Jaydon Phan', 20], ['Mike Davis', 74], ['Steve Smith', 20]]) {
  check('real league: ' + n + ' carries ' + h + ' into week 6, as printed',
        who(n).handicap === h, who(n).handicap);
}

// And against the week-6 sheet: every bowler's pins, games and the handicap
// they carry into week 7, as printed in the roster blocks.
live = upTo(6);
const ROSTER6 = [
  ['Ken Grizzard', 52, 2431, 15], ['Ed Curtis', 59, 2314, 15], ['Marty Tate', 47, 2519, 15],
  ['Rick Goodwin', 63, 2262, 15], ['Paul Presswood', 33, 2199, 12], ['Leon Farmer', 21, 3532, 18],
  ['Jon Boxwell', 34, 3282, 18], ['Terry Cranfield', 34, 2737, 15], ['Tony Bullington', 14, 1810, 9],
  ['Wesley Hicks', 36, 1915, 11], ['Toby Crisp', 13, 3078, 15], ['Wendell Defriece', 14, 3681, 18],
  ['Robbie Defriece', 11, 3731, 18], ['Keith White', 0, 3357, 15], ['Jason Thompson', 52, 2930, 18],
  ['Ben Deloach', 0, 4051, 18], ['Jason Seda-Haas', 23, 2920, 15], ['Darius Thompson', 0, 4204, 18],
  ['Michael Eisel', 24, 1171, 6], ['Steven Monroe', 13, 664, 3], ['Aaron Jones', 63, 2712, 18],
  ['Dale Dutcher', 41, 3139, 18], ['Daryl Blair', 45, 3068, 18], ['Spencer Foutz', 0, 4092, 18],
  ['Cam Miller', 18, 3614, 18], ['Worm Davis', 10, 3745, 18], ['Alex Davis', 0, 4256, 18],
  ['Davis Segui', 17, 3016, 15], ['Jim Sedgwick', 57, 2812, 18], ['James Gruver', 29, 2255, 12],
  ['James Duffee', 27, 2864, 15], ['Steve Smith', 17, 3634, 18], ['Nick Grabe', 47, 3015, 18],
  ['Mike Davis', 72, 2528, 18], ['Starr Jensen', 60, 2764, 18], ['Rodney Benefield', 47, 3023, 18],
  ['Tim Charleson', 31, 3336, 18], ['Darrell Smith', 17, 3629, 18], ['Bobby Bryant', 36, 3224, 18],
  ['Jeremy Malek', 13, 3704, 18], ['Kamus Thompson', 13, 3086, 15], ['John Jenner', 18, 3606, 18],
  ['Derek Banther', 11, 3742, 18], ['Josh Bomboy', 15, 3664, 18], ['Josh Malek', 32, 2767, 15],
  ['Jimmy Malek', 18, 3002, 15], ['John Smeltzer', 27, 2850, 15], ['Randy Dockery', 33, 2750, 15],
  ['Cody LaCroix', 8, 3814, 18], ['Jayson Scoggins', 12, 3099, 15], ['Shayne Terry', 8, 3807, 18],
  ['Scott Shafer', 11, 621, 3], ['Josh Rodda', 43, 516, 3], ['Chad Green', 5, 3223, 15],
  ['Lynn Collins', 18, 3604, 18], ['Chris Neal', 0, 2674, 12], ['Steven Adler', 0, 3962, 18],
  ['Zach Price', 10, 624, 3], ['Yogi Cabrera', 48, 2998, 18], ['Mitchell Mayo', 9, 3795, 18],
  ['Duane Mayo', 50, 2961, 18], ['Mark Youngblood', 9, 3786, 18], ['Hunter Moffitt', 10, 3754, 18],
  ['Chris Daughtry', 0, 4010, 18], ['Cameron Compton', 10, 3752, 18], ['Briton Helton', 6, 1280, 6],
  ['John Linan', 66, 2633, 18], ['Stan Stinnett', 46, 3024, 18], ['Matt Linan', 25, 2892, 15],
  ['Stonewall Stinnett', 14, 3682, 18], ['Hamilton Hickman', 39, 2117, 12], ['Ken Ellis', 51, 2940, 18],
  ['Richard Simpson', 36, 2699, 15], ['Joey Zinn', 36, 3232, 18], ['Butch Finkbeiner', 77, 2423, 18],
  ['Treifor Grant', 69, 2591, 18], ['Paul Queen', 70, 2563, 18], ['Jerry Lance', 48, 1994, 12],
  ['Bill Rogers', 52, 945, 6], ['Tanner Collins', 29, 2809, 15], ['Chuck Broesche', 59, 2789, 18],
  ['Mark Thompson', 18, 2409, 12], ['Jared King', 0, 3331, 15], ['Jacob Brown', 11, 729, 3],
  ['Jesse Cabrera', 53, 2904, 18], ['Thomas Woody', 58, 2806, 18], ['Tim Berthianne', 26, 3453, 18],
  ['Joe Morgan', 14, 3063, 15], ['Coty Rymer', 0, 4057, 18], ['Sam Hunter', 32, 3321, 18],
  ['Todd Deluca', 35, 3270, 18], ['Matt Clark', 50, 2462, 15], ['Porky Davis', 13, 3696, 18],
  ['Bryant Johns', 29, 2812, 15], ['Tanner Kincaid', 13, 580, 3], ['Lenny Kersten', 19, 2982, 15],
  ['Al Vietor', 54, 2896, 18], ['Matt Rayfield', 82, 2319, 18], ['Jimmy Campbell', 45, 3061, 18],
  ['Tyler Green', 55, 2848, 18], ['Aaron White', 5, 3218, 15], ['Michael Shipley', 0, 4071, 18],
  ['Oliver Lawson', 0, 3362, 15], ['Jason Day', 0, 4157, 18], ['Grant Benton', 10, 648, 3],
  ['Chad Clark', 31, 1646, 9], ['Don Dansby', 37, 1070, 6], ['John Hancock', 0, 2857, 12],
  ['Michael Kimble', 1, 654, 3], ['Bryan Martin', 11, 2487, 12], ['Jaydon Phan', 20, 591, 3],
  ['Matthew Spicer', 0, 3388, 15], ['Dave Terhune', 46, 506, 3],
];
const off7 = ROSTER6.filter(([n, h, pins, g]) => {
  const p = who(n);
  return !p || p.handicap !== h || p.pins !== pins || p.games !== g;
});
check('real league, week 6: all ' + ROSTER6.length + ' bowlers\' pins, games and week-7 handicaps match the sheet',
      !off7.length, off7.map(([n, h, pins, g]) => n + ' ' + (who(n) ? [who(n).handicap, who(n).pins, who(n).games] : 'missing') + ' v ' + [h, pins, g]).join('; '));

console.log(ok.map(s => '  ok  ' + s).join('\n'));
console.log(fails.length ? '\nFAILED:\n' + fails.map(s => '  x  ' + s).join('\n')
                         : '\nall handicap assertions passed');
process.exit(fails.length ? 1 : 0);
