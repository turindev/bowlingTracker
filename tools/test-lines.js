/* How individual lines count, checked against the real week-2 data where the
   sheet proved the answer, and against a small fixture for the rules. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'stats.js'), 'utf8'), ctx);
const { build } = ctx.window.LeagueStats;

const fails = [], ok = [];
const check = (l, c, d) => (c ? ok : fails).push(l + (c ? '' : '  →  ' + d));

// --- the rules, on a fixture ----------------------------------------------
const fx = {
  league: { name: 'T', weeksInSeason: 32 },
  scoring: { gamesPerWeek: 3, useHandicap: true, handicapBasis: 220, handicapPercent: 90,
             pointsPerGame: 1, pointsForSeries: 1 },
  teams: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
  players: [
    { id: 'p1', name: 'Blind Bob', teamId: 'a', entryAverage: 200 },   // hdcp 18
    { id: 'p2', name: 'Lent Lou', teamId: 'a', entryAverage: 180 },    // hdcp 36
    { id: 'p3', name: 'Sub Sam', teamId: null, substitute: true, entryAverage: 160 }, // hdcp 54
    { id: 'p4', name: 'Home Hal', teamId: 'b', entryAverage: 220 },    // hdcp 0
  ],
  weeks: [{
    number: 1, date: '2026-09-08',
    scores: [
      { playerId: 'p1', games: [190, 190, 190], blind: true },
      { playerId: 'p2', teamId: 'b', games: [200, 200, 200] },
      { playerId: 'p3', teamId: 'a', games: [150, 150, 150] },
      { playerId: 'p4', games: [210, 210, 210] },
    ],
    matches: [{ homeTeamId: 'a', awayTeamId: 'b', lanes: '1-2' }],
  }],
};
let m = build(fx);
const P = id => m.players.find(p => p.id === id);
const T = id => m.teams.find(t => t.id === id);

// The league software counts a blind in the bowler's average (week 3 sheet:
// Lawson 2019 over 9 games, his week-2 blind included), so the site does too.
check('a blind counts toward the bowler\'s games, as the league counts it', P('p1').games === 3, P('p1').games);
check('and toward their average', P('p1').average === 190, P('p1').average);
check('but it is never one of their highs', P('p1').highGame == null && P('p1').highSeries == null,
      P('p1').highGame + '/' + P('p1').highSeries);
check('nor a night they bowled', P('p1').weeks.length === 0 && P('p1').blinds.length === 1, '');
check('but it counts for the team: A scratch includes 570', T('a').pins === 570 + 450, T('a').pins);
check('with the bowler\'s handicap: A hdcp is 18 + 54 per game',
      T('a').weeks[0].handicap === 18 + 54, T('a').weeks[0].handicap);
check('and it is marked absent on the team\'s night',
      T('a').weeks[0].lines.find(l => l.playerId === 'p1').role === 'absentee', '');

check('a lent bowler counts for the team they bowled for',
      T('b').pins === 600 + 630, T('b').pins);
check('not for their own roster', T('a').weeks[0].lines.every(l => l.playerId !== 'p2'), '');
check('their games still count toward their own average', P('p2').average === 200, P('p2').average);
check('their week records who they bowled for', P('p2').weeks[0].teamId === 'b', P('p2').weeks[0].teamId);
check('and they are marked sub on that team\'s night',
      T('b').weeks[0].lines.find(l => l.playerId === 'p2').role === 'substitute', '');

check('a teamless substitute is on no roster', m.teams.every(t => !t.players.includes(P('p3'))), '');
check('and is labelled a substitute', P('p3').teamName === 'Substitute', P('p3').teamName);
check('their line counts for the team it names',
      T('a').weeks[0].lines.some(l => l.playerId === 'p3'), '');

// Points from the sheet override the scores, and carry their note.
const fx2 = JSON.parse(JSON.stringify(fx));
fx2.weeks[0].matches[0] = Object.assign(fx2.weeks[0].matches[0],
  { homePoints: 0, awayPoints: 4, note: 'forfeit' });
m = build(fx2);
check('sheet points override the scores',
      T('a').points === 0 && T('b').points === 4, T('a').points + '/' + T('b').points);
check('the note travels with both sides',
      T('a').weeks[0].note === 'forfeit' && T('b').weeks[0].note === 'forfeit', '');

// --- the real week 2, where the printed totals proved the lineups ----------
const rctx = { window: {} };
vm.createContext(rctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'league.js'), 'utf8'), rctx);
const live = build(rctx.window.LEAGUE_DATA);
const team = n => live.teams.find(t => t.id === 't' + n);
const night = (n, wk) => team(n).weeks.find(w => w.number === wk);
const games = (n, wk) => night(n, wk).hdcpGameTotals.join(',');

// These are the printed "HDCP -1- -2- -3-" figures for week 2.
check('9 Pin City with Spicer subbing = 869,823,815', games(5, 2) === '869,823,815', games(5, 2));
check('Bowling Buddies with Hancock = 840,931,891', games(22, 2) === '840,931,891', games(22, 2));
check('Team 21 without Hancock = 849,915,841', games(21, 2) === '849,915,841', games(21, 2));
check('Team 24 with Lawson\'s blind = 911,958,927', games(24, 2) === '911,958,927', games(24, 2));
check('Team 10 with Thompson\'s blind = 850,866,838', games(10, 2) === '850,866,838', games(10, 2));
check('Nutz with the vacancy = 906,895,829', games(15, 2) === '906,895,829', games(15, 2));

const lawson = live.players.find(p => p.name === 'Oliver Lawson');
// From week 4 the sheet leaves Lawson's week-2 blind out: 2044 over 9.
check('Lawson\'s 2044 over 9 leaves out his week-2 blind, as printed', lawson.games === 9 && lawson.pins === 2044,
      lawson.games + ' games, ' + lawson.pins);
const white = live.players.find(p => p.name === 'Aaron White');
check('Aaron White\'s 1964 over 9 includes his week-1 blind, as printed', white.games === 9 && white.pins === 1964,
      white.games + ' games, ' + white.pins);
check('and his 289 is his high game, the blind never is', white.highGame === 289, white.highGame);

// Week 3 put Ken Grizzard back on 160 and Leon Farmer on 195; the printed
// standings show week 1 rescored with them, back to 4-0.
check('Week 1 rescored with the week-3 books: Strike Scratch Fever 4 - Warriors 0',
      night(1, 1).points === 4 && night(2, 1).points === 0,
      night(1, 1).points + '-' + night(2, 1).points);

// --- week 3: the printed standings are cumulative, so they prove weeks 1-3 --
check('We Got This with Bryant\'s blind = 890,858,900', games(9, 3) === '890,858,900', games(9, 3));
check('Hookers and Bowl with Terry\'s blind = 836,867,878', games(12, 3) === '836,867,878', games(12, 3));
check('Bowling Buddies with Spicer subbing = 920,892,914', games(22, 3) === '920,892,914', games(22, 3));
check('Team 21 = 853,1102,1006', games(21, 3) === '853,1102,1006', games(21, 3));
check('Week 2 on Gruver\'s 189 book: House Hacks 3 - NBO 1',
      night(6, 2).points === 3 && night(7, 2).points === 1, night(6, 2).points + '-' + night(7, 2).points);
check('Week 1 with Toby Crisp\'s corrected 204: Old School 1 - Team 4 3',
      night(3, 1).points === 1 && night(4, 1).points === 3, night(3, 1).points + '-' + night(4, 1).points);
check('Week 1 with the vacancy for Jesse\'s Gym: Big Orange Bowling 4 - 0',
      night(19, 1).points === 4 && night(20, 1).points === 0, night(19, 1).points + '-' + night(20, 1).points);
// Points won after week 3, as printed.
const WON3 = {1: 5, 2: 4, 3: 7, 4: 7, 5: 2, 6: 11, 7: 7, 8: 5, 9: 3, 10: 5, 11: 6, 12: 8.5,
  13: 5, 14: 7, 15: 6.5, 16: 7, 17: 5.5, 18: 3, 19: 9, 20: 0.5, 21: 7, 22: 9, 23: 7, 24: 7};
const through = (n, wk) => team(n).weeks.filter(w => w.number <= wk)
  .reduce((t, w) => t + (w.points || 0), 0);
const offPts = Object.keys(WON3).filter(n => through(n, 3) !== WON3[n]);
check('every team\'s points after week 3 match the sheet', !offPts.length,
      offPts.map(n => n + ': ' + through(n, 3) + ' v ' + WON3[n]).join(', '));

// --- week 4: points, scratch and pins + hdcp after week 4, as printed --------
const STAND4 = {6:[12,10621,11065],22:[12,9869,10712],12:[11.5,9622,10690],16:[11,8416,10672],
  24:[10.5,10708,10816],21:[10,9495,10989],19:[10,9285,10869],3:[10,10254,10686],4:[10,9627,10611],
  11:[10,9232,10345],15:[9.5,9463,10447],7:[9,8638,10591],1:[8,7921,10420],23:[8,7269,10029],
  14:[7,8999,10427],13:[6,10356,10620],10:[6,9755,10571],17:[6,8510,10463],18:[6,7011,10269],
  8:[6,7854,10242],2:[6,8876,10169],9:[3,8641,10357],5:[3,8153,10148],20:[1.5,8226,10098]};
const off4 = Object.keys(STAND4).filter(n => {
  const t = team(n), s = STAND4[n];
  return through(n, 4) !== s[0] || t.pins !== s[1] || t.hdcpPins !== s[2];
});
check('every team\'s points, scratch and pins + hdcp after week 4 match the sheet', !off4.length,
      off4.map(n => n + ': ' + [through(n, 4), team(n).pins, team(n).hdcpPins] + ' v ' + STAND4[n]).join('; '));
check('Old School with Spicer subbing = 906,1009,1003', games(3, 4) === '906,1009,1003', games(3, 4));
check('NBO with two blinds = 837,909,892', games(7, 4) === '837,909,892', games(7, 4));
check('9 Pin City with Eisel\'s blind = 804,875,783', games(5, 4) === '804,875,783', games(5, 4));
check('Ruthless with Martin subbing = 937,857,821', games(17, 4) === '937,857,821', games(17, 4));
const seda = live.players.find(p => p.name === 'Jason Seda-Haas');
check('a blind the league leaves out of the average stays out: Seda-Haas 1661 over 9',
      seda.pins === 1661 && seda.games === 9, seda.pins + '/' + seda.games);
const woody = live.players.find(p => p.name === 'Thomas Woody');
check('a pin adjustment counts: Woody 1892 over 12', woody.pins === 1892 && woody.games === 12,
      woody.pins + '/' + woody.games);

console.log(ok.map(s => '  ok  ' + s).join('\n'));
console.log(fails.length ? '\nFAILED:\n' + fails.map(s => '  x  ' + s).join('\n')
                         : '\nall line-rule assertions passed');
process.exit(fails.length ? 1 : 0);
