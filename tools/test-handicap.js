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
// Later corrections (pin adjustments, book changes) stay out of earlier sheets.
const upTo = n => build(Object.assign({}, raw, {
  weeks: raw.weeks.filter(w => w.number <= n),
  players: raw.players.map(p => {
    if (!p.pinAdjustments && !p.bookChanges) return p;
    const q = Object.assign({}, p);
    if (p.pinAdjustments) q.pinAdjustments = p.pinAdjustments.filter(a => a.afterWeek < n);
    if (p.bookChanges) q.bookChanges = p.bookChanges.filter(b => b.afterWeek < n - 1);
    return q;
  }),
}));
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

// And against the week-7 sheet.
live = upTo(7);
const ROSTER7 = [
  ['Ken Grizzard', 51, 2947, 18], ['Ed Curtis', 59, 2314, 15], ['Marty Tate', 51, 2948, 18],
  ['Rick Goodwin', 62, 2733, 18], ['Paul Presswood', 38, 2667, 15], ['Leon Farmer', 23, 4090, 21],
  ['Jon Boxwell', 33, 3844, 21], ['Terry Cranfield', 36, 3225, 18], ['Tony Bullington', 14, 1810, 9],
  ['Wesley Hicks', 40, 2635, 15], ['Toby Crisp', 13, 3696, 18], ['Wendell Defriece', 14, 4297, 21],
  ['Robbie Defriece', 14, 4290, 21], ['Keith White', 0, 4070, 18], ['Jason Thompson', 52, 3409, 21],
  ['Ben Deloach', 0, 4749, 21], ['Jason Seda-Haas', 18, 3616, 18], ['Darius Thompson', 0, 4738, 21],
  ['Michael Eisel', 24, 1171, 6], ['Aaron Jones', 63, 2712, 18], ['Dale Dutcher', 44, 3600, 21],
  ['Daryl Blair', 45, 3565, 21], ['Spencer Foutz', 0, 4786, 21], ['Cam Miller', 22, 4104, 21],
  ['Worm Davis', 12, 4343, 21], ['Alex Davis', 0, 4983, 21], ['Davis Segui', 18, 3610, 18],
  ['Jim Sedgwick', 55, 3318, 21], ['James Gruver', 34, 2743, 15], ['James Duffee', 27, 2864, 15],
  ['Steve Smith', 17, 3634, 18], ['Nick Grabe', 46, 3534, 21], ['Mike Davis', 70, 2999, 21],
  ['Starr Jensen', 59, 3251, 21], ['Rodney Benefield', 50, 3460, 21], ['Tim Charleson', 35, 3810, 21],
  ['Darrell Smith', 21, 4125, 21], ['Bobby Bryant', 35, 3801, 21], ['Jeremy Malek', 16, 4249, 21],
  ['Kamus Thompson', 11, 3735, 18], ['John Jenner', 18, 4218, 21], ['Derek Banther', 10, 4376, 21],
  ['Josh Bomboy', 13, 4319, 21], ['Josh Malek', 39, 3185, 18], ['Jimmy Malek', 15, 3664, 18],
  ['John Smeltzer', 23, 3509, 18], ['Randy Dockery', 36, 3233, 18], ['Cody LaCroix', 8, 4433, 21],
  ['Jayson Scoggins', 10, 3761, 18], ['Shayne Terry', 8, 4443, 21], ['Scott Shafer', 11, 621, 3],
  ['Josh Rodda', 43, 516, 3], ['Chad Green', 5, 3861, 18], ['Lynn Collins', 10, 4375, 21],
  ['Chris Neal', 0, 3165, 14], ['Steven Adler', 0, 4240, 19], ['Zach Price', 10, 624, 3],
  ['Yogi Cabrera', 46, 3534, 21], ['Mitchell Mayo', 7, 4468, 21], ['Duane Mayo', 48, 3492, 21],
  ['Mark Youngblood', 10, 4373, 21], ['Hunter Moffitt', 11, 4359, 21], ['Chris Daughtry', 0, 4622, 21],
  ['Cameron Compton', 6, 4493, 21], ['Briton Helton', 6, 1894, 9], ['John Linan', 64, 3109, 21],
  ['Stan Stinnett', 45, 3554, 21], ['Matt Linan', 25, 2892, 15], ['Stonewall Stinnett', 13, 4312, 21],
  ['Hamilton Hickman', 45, 2559, 15], ['Ken Ellis', 48, 3503, 21], ['Richard Simpson', 35, 3258, 18],
  ['Joey Zinn', 38, 3723, 21], ['Butch Finkbeiner', 75, 2859, 21], ['Treifor Grant', 69, 3003, 21],
  ['Paul Queen', 72, 2936, 21], ['Jerry Lance', 46, 2522, 15], ['Bill Rogers', 52, 945, 6],
  ['Tanner Collins', 26, 3455, 18], ['Chuck Broesche', 60, 3226, 21], ['Mark Thompson', 15, 3049, 15],
  ['Jared King', 5, 3864, 18], ['Jacob Brown', 11, 729, 3], ['Jesse Cabrera', 53, 3394, 21],
  ['Thomas Woody', 56, 3307, 21], ['Tim Berthianne', 26, 3453, 18], ['Joe Morgan', 18, 3607, 18],
  ['Keith Jackson', 14, 613, 3], ['Coty Rymer', 0, 4729, 21], ['Sam Hunter', 29, 3935, 21],
  ['Todd Deluca', 35, 3813, 21], ['Matt Clark', 51, 2934, 18], ['Porky Davis', 14, 4297, 21],
  ['Bryant Johns', 30, 3355, 18], ['Dave Terhune', 19, 1102, 6], ['Lenny Kersten', 16, 3649, 18],
  ['John Hancock', 0, 2857, 12], ['Al Vietor', 51, 3423, 21], ['Matt Rayfield', 80, 2760, 21],
  ['Jimmy Campbell', 45, 3586, 21], ['Tyler Green', 58, 3271, 21], ['Aaron White', 9, 3786, 18],
  ['Michael Shipley', 0, 4777, 21], ['Jason Day', 0, 4821, 21], ['Oliver Lawson', 0, 4076, 18],
  ['Grant Benton', 10, 1283, 6], ['John Brogdon', 21, 588, 3], ['Chad Clark', 31, 1646, 9],
  ['Don Dansby', 28, 1692, 9], ['Michael Kimble', 1, 654, 3], ['Tanner Kincaid', 13, 580, 3],
  ['Bryan Martin', 11, 2487, 12], ['Steven Monroe', 13, 664, 3], ['Jaydon Phan', 20, 591, 3],
  ['Matthew Spicer', 0, 3968, 18],
];
const offR7 = ROSTER7.filter(([n, h, pins, g]) => {
  const p = who(n);
  return !p || p.handicap !== h || p.pins !== pins || p.games !== g;
});
check('real league, week 7: all ' + ROSTER7.length + ' bowlers\' pins, games and week-8 handicaps match the sheet',
      !offR7.length, offR7.map(([n, h, pins, g]) => n + ' ' + (who(n) ? [who(n).handicap, who(n).pins, who(n).games] : 'missing') + ' v ' + [h, pins, g]).join('; '));

// And against the week-8 sheet.
live = upTo(8);
const ROSTER8 = [
  ['Ken Grizzard', 52, 3405, 21], ['Ed Curtis', 59, 2314, 15], ['Marty Tate', 53, 3399, 21],
  ['Rick Goodwin', 65, 3103, 21], ['Paul Presswood', 38, 3202, 18], ['Leon Farmer', 23, 4090, 21],
  ['Jon Boxwell', 31, 4460, 24], ['Terry Cranfield', 36, 3776, 21], ['Tony Bullington', 16, 2432, 12],
  ['Wesley Hicks', 36, 3235, 18], ['Toby Crisp', 13, 4312, 21], ['Wendell Defriece', 17, 4846, 24],
  ['Robbie Defriece', 13, 4930, 24], ['Keith White', 0, 4761, 21], ['Jason Thompson', 52, 3891, 24],
  ['Ben Deloach', 0, 5392, 24], ['Jason Seda-Haas', 16, 4248, 21], ['Darius Thompson', 0, 5325, 24],
  ['Michael Eisel', 24, 1171, 6], ['Aaron Jones', 59, 3243, 21], ['Dale Dutcher', 44, 4121, 24],
  ['Daryl Blair', 48, 3994, 24], ['Spencer Foutz', 0, 5460, 24], ['Cam Miller', 24, 4637, 24],
  ['Worm Davis', 11, 4970, 24], ['Alex Davis', 0, 5694, 24], ['Davis Segui', 18, 4207, 21],
  ['Jim Sedgwick', 57, 3758, 24], ['James Gruver', 34, 3284, 18], ['James Duffee', 27, 2864, 15],
  ['Steve Smith', 17, 4224, 21], ['Nick Grabe', 48, 3984, 24], ['Mike Davis', 69, 3433, 24],
  ['Starr Jensen', 56, 3788, 24], ['Rodney Benefield', 50, 3942, 24], ['Tim Charleson', 33, 4405, 24],
  ['Darrell Smith', 23, 4663, 24], ['Bobby Bryant', 34, 4383, 24], ['Jeremy Malek', 15, 4895, 24],
  ['Kamus Thompson', 10, 4372, 21], ['John Jenner', 19, 4758, 24], ['Derek Banther', 14, 4918, 24],
  ['Josh Bomboy', 10, 5006, 24], ['Josh Malek', 39, 3185, 18], ['Jimmy Malek', 14, 4293, 21],
  ['John Smeltzer', 22, 4115, 21], ['Randy Dockery', 34, 3839, 21], ['Cody LaCroix', 6, 5135, 24],
  ['Jayson Scoggins', 10, 3761, 18], ['Shayne Terry', 6, 5135, 24], ['Scott Shafer', 11, 621, 3],
  ['Josh Rodda', 43, 516, 3], ['Chad Green', 1, 4579, 21], ['Lynn Collins', 8, 5076, 24],
  ['Chris Neal', 0, 3816, 17], ['Steven Adler', 0, 4240, 19], ['Zach Price', 10, 624, 3],
  ['Yogi Cabrera', 45, 4072, 24], ['Mitchell Mayo', 3, 5193, 24], ['Duane Mayo', 49, 3971, 24],
  ['Mark Youngblood', 9, 5019, 24], ['Hunter Moffitt', 11, 4359, 21], ['Chris Daughtry', 0, 5280, 24],
  ['Cameron Compton', 6, 5132, 24], ['Briton Helton', 6, 2561, 12], ['John Linan', 64, 3559, 24],
  ['Stan Stinnett', 47, 4024, 24], ['Matt Linan', 25, 3458, 18], ['Stonewall Stinnett', 17, 4837, 24],
  ['Hamilton Hickman', 44, 3079, 18], ['Ken Ellis', 49, 3972, 24], ['Richard Simpson', 35, 3817, 21],
  ['Joey Zinn', 39, 4226, 24], ['Butch Finkbeiner', 76, 3242, 24], ['Treifor Grant', 69, 3447, 24],
  ['Paul Queen', 76, 3256, 24], ['Jerry Lance', 46, 2522, 15], ['Bill Rogers', 52, 945, 6],
  ['Shane Armstrong', 51, 489, 3], ['Tanner Collins', 18, 4179, 21], ['Chuck Broesche', 60, 3694, 24],
  ['Mark Thompson', 14, 3673, 18], ['Jared King', 1, 4593, 21], ['Jacob Brown', 11, 729, 3],
  ['Jesse Cabrera', 53, 3871, 24], ['Thomas Woody', 56, 3791, 24], ['Tim Berthianne', 26, 3453, 18],
  ['Joe Morgan', 20, 4152, 21], ['Keith Jackson', 11, 1243, 6], ['Coty Rymer', 0, 5540, 24],
  ['Sam Hunter', 30, 4469, 24], ['Todd Deluca', 34, 4371, 24], ['Matt Clark', 48, 3495, 21],
  ['Porky Davis', 14, 4297, 21], ['Bryant Johns', 31, 3898, 21], ['Dave Terhune', 19, 1648, 9],
  ['Lenny Kersten', 16, 4252, 21], ['John Hancock', 0, 3613, 15], ['Al Vietor', 52, 3907, 24],
  ['Matt Rayfield', 77, 3230, 24], ['Jimmy Campbell', 45, 3586, 21], ['Tyler Green', 58, 3735, 24],
  ['Aaron White', 7, 4458, 21], ['Michael Shipley', 0, 5412, 24], ['Jason Day', 0, 5523, 24],
  ['Oliver Lawson', 0, 4770, 21], ['Grant Benton', 10, 1778, 9], ['John Brogdon', 21, 588, 3],
  ['Chad Clark', 38, 2128, 12], ['Don Dansby', 30, 2237, 12], ['Michael Kimble', 16, 1214, 6],
  ['Tanner Kincaid', 13, 580, 3], ['Bryan Martin', 16, 3031, 15], ['Steven Monroe', 13, 664, 3],
  ['Jaydon Phan', 20, 591, 3], ['Matthew Spicer', 0, 4613, 21],
];
const offR8 = ROSTER8.filter(([n, h, pins, g]) => {
  const p = who(n);
  return !p || p.handicap !== h || p.pins !== pins || p.games !== g;
});
check('real league, week 8: all ' + ROSTER8.length + ' bowlers\' pins, games and week-9 handicaps match the sheet',
      !offR8.length, offR8.map(([n, h, pins, g]) => n + ' ' + (who(n) ? [who(n).handicap, who(n).pins, who(n).games] : 'missing') + ' v ' + [h, pins, g]).join('; '));

console.log(ok.map(s => '  ok  ' + s).join('\n'));
console.log(fails.length ? '\nFAILED:\n' + fails.map(s => '  x  ' + s).join('\n')
                         : '\nall handicap assertions passed');
process.exit(fails.length ? 1 : 0);
