/* League rules 1 and 2: two 16-week halves, each with a position round, and
   the top four of each half go to the roll-off. Checked against a synthetic
   season, because the real one is on week 1. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'stats.js'), 'utf8'), ctx);
const { build } = ctx.window.LeagueStats;

const fails = [], ok = [];
const check = (l, c, d) => (c ? ok : fails).push(l + (c ? '' : '  →  ' + d));

const TEAMS = 8;
const ids = Array.from({ length: TEAMS }, (_, i) => 't' + (i + 1));

/* Team n bowls n * 40 pins a game, so the finishing order is known up front.
   In the second half the order is reversed, which is the case that matters:
   season points and half points must not agree. */
function season(weeks) {
  return {
    league: { name: 'T', weeksInSeason: 32, halfLength: 16,
              positionRounds: [16, 32], rollOff: { teamsPerHalf: 4 } },
    scoring: { gamesPerWeek: 3, useHandicap: false, pointsPerGame: 1, pointsForSeries: 1 },
    teams: ids.map((id, i) => ({ id, name: 'Team ' + (i + 1) })),
    players: ids.map((id, i) => ({ id: 'p' + (i + 1), name: 'B' + (i + 1), teamId: id, entryAverage: 150 })),
    weeks: Array.from({ length: weeks }, (_, w) => {
      const n = w + 1;
      const strength = i => (n <= 16 ? i + 1 : TEAMS - i);
      return {
        number: n, date: '2026-09-08',
        scores: ids.map((id, i) => ({
          playerId: 'p' + (i + 1), games: [1, 2, 3].map(() => 40 * strength(i)),
        })),
        matches: Array.from({ length: TEAMS / 2 }, (_, m) => ({
          homeTeamId: ids[m * 2], awayTeamId: ids[m * 2 + 1], lanes: (m * 2 + 1) + '-' + (m * 2 + 2),
        })),
      };
    }),
  };
}

// --- one week in: only the first half exists ------------------------------
let m = build(season(1));
check('two halves are built', m.halves.length === 2, m.halves.length);
check('first half is under way', m.halves[0].started === true, '');
check('first half is not complete', m.halves[0].complete === false, '');
check('second half has not started', m.halves[1].started === false, '');
check('first half spans weeks 1-16',
      m.halves[0].from === 1 && m.halves[0].to === 16, JSON.stringify(m.halves[0]));
check('second half spans weeks 17-32',
      m.halves[1].from === 17 && m.halves[1].to === 32, JSON.stringify(m.halves[1]));
check('position rounds are week 16 and 32',
      m.halves[0].positionRound === 16 && m.halves[1].positionRound === 32, '');
check('exactly four teams hold a seat',
      m.halves[0].standings.filter(r => r.qualifies).length === 4, '');
check('seats go to the top four by rank',
      m.halves[0].standings.filter(r => r.qualifies).every(r => r.rank <= 4), '');

// --- past the split: the two tables must disagree -------------------------
m = build(season(18));
const h1 = m.halves[0], h2 = m.halves[1];
check('first half now complete', h1.complete === true, '');
check('second half now started', h2.started === true, '');
check('second half is not complete', h2.complete === false, '');
check('first half counted all 16 weeks', h1.weeksBowled === 16, h1.weeksBowled);
check('second half counted only 2', h2.weeksBowled === 2, h2.weeksBowled);

const top1 = h1.standings[0].team.name, top2 = h2.standings[0].team.name;
check('the strongest team won the first half', top1 === 'Team 8', top1);
check('the reversal flipped the second half', top2 === 'Team 1', top2);
check('the two halves have different leaders', top1 !== top2, top1 + ' / ' + top2);

/* The point of splitting: a half table is not a slice of the season table. */
const seasonOrder = m.teams.slice()
  .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name))
  .map(t => t.name);
check('half standings differ from season standings',
      h2.standings.map(r => r.team.name).join() !== seasonOrder.join(),
      'second half matched the season order');

/* Half points have to add up to the season's, or one of them is wrong. */
for (const t of m.teams) {
  const a = h1.standings.find(r => r.team.id === t.id).points;
  const b = h2.standings.find(r => r.team.id === t.id).points;
  check(t.name + ': halves sum to the season total', a + b === t.points,
        a + ' + ' + b + ' != ' + t.points);
}

/* Nobody can be counted in the wrong half. */
const weeksIn = (team, lo, hi) => team.weeks.filter(w => w.number >= lo && w.number <= hi).length;
check('no week is counted in both halves',
      m.teams.every(t => weeksIn(t, 1, 16) + weeksIn(t, 17, 32) === t.weeks.length), '');

// --- the real league ------------------------------------------------------
const rctx = { window: {} };
vm.createContext(rctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'data', 'league.js'), 'utf8'), rctx);
const live = build(rctx.window.LEAGUE_DATA);
check('real league: first half running, second not',
      live.halves[0].started && !live.halves[1].started, '');
check('real league: half-one points match season points so far',
      live.teams.every(t =>
        live.halves[0].standings.find(r => r.team.id === t.id).points === t.points), '');

console.log(ok.map(s => '  ok  ' + s).join('\n'));
console.log(fails.length ? '\nFAILED:\n' + fails.map(s => '  x  ' + s).join('\n')
                         : '\nall split-season assertions passed');
process.exit(fails.length ? 1 : 0);
