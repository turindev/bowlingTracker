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

check('a blind is not one of the bowler\'s games', P('p1').games === 0, P('p1').games);
check('so the bowler has no average from it', P('p1').average == null, P('p1').average);
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
check('Lawson\'s average ignores his week-2 blind', lawson.games === 3 && lawson.pins === 683,
      lawson.games + ' games, ' + lawson.pins);
const white = live.players.find(p => p.name === 'Aaron White');
check('Aaron White\'s week-1 blind stays out of his average', white.games === 3 && white.pins === 651,
      white.games + ' games, ' + white.pins);

check('Week 1 rescored with the corrected books: Strike Scratch Fever 3 - Warriors 1',
      night(1, 1).points === 3 && night(2, 1).points === 1,
      night(1, 1).points + '-' + night(2, 1).points);

console.log(ok.map(s => '  ok  ' + s).join('\n'));
console.log(fails.length ? '\nFAILED:\n' + fails.map(s => '  x  ' + s).join('\n')
                         : '\nall line-rule assertions passed');
process.exit(fails.length ? 1 : 0);
