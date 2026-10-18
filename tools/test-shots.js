/* The shot tracker's rules: scoring, the 10th frame, leaves and splits, and
   the statistics, checked against hand-worked games. */
const S = require('../js/shots.js');

const fails = [], ok = [];
const check = (l, c, d) => (c ? ok : fails).push(l + (c ? '' : '  →  ' + d));

/* Builds a game from scorecard notation: "X", "7/", "9-", "-8", and the 10th
   as "X8/" or "XXX". Pins knocked are taken off the front of the rack, which
   is enough for scoring; leaves are tested separately. */
function fromCard(frames, extra) {
  let game = S.newGame(Object.assign({ date: '2026-10-18', ball: 'A', pattern: 'House', location: 'LTB' }, extra));
  const hit = { hit: 'pocket', ball: game.ball };
  const take = (pos, n) => S.ALL.filter(p => pos.before.indexOf(p) !== -1).slice(n);
  frames.forEach(card => {
    const marks = card.split('');
    marks.forEach(m => {
      const pos = S.position(game);
      let down;
      if (m === 'X') down = pos.before.length;
      else if (m === '/') down = pos.before.length;
      else if (m === '-') down = 0;
      else down = Number(m);
      const standing = take(pos, down);
      const input = { standing, ball: 'A' };
      if (pos.fresh) input.hit = 'pocket';
      else if (standing.length) input.miss = 'left';
      game = S.addShot(game, input);
    });
  });
  game.status = 'done';
  return game;
}
const total = g => S.score(g).total;

// --- scoring ----------------------------------------------------------------
const perfect = fromCard(['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'XXX']);
check('twelve strikes score 300', total(perfect) === 300, total(perfect));
check('and the game is complete', S.isComplete(perfect), '');

const worked = fromCard(['X', '7/', '9-', 'X', '-8', '8/', '-6', 'X', 'X', 'X8/']);
check('a worked game scores 168', total(worked) === 168, total(worked));
check('with running totals 20,39,48,66,74,84,90,120,148,168',
      S.score(worked).frames.map(f => f.total).join(',') === '20,39,48,66,74,84,90,120,148,168',
      S.score(worked).frames.map(f => f.total).join(','));

const spares = fromCard(['5/', '5/', '5/', '5/', '5/', '5/', '5/', '5/', '5/', '5/5']);
check('all 5-spares with a 5 fill score 150', total(spares) === 150, total(spares));

const gutter = fromCard(['--', '--', '--', '--', '--', '--', '--', '--', '--', '--']);
check('twenty gutter balls score 0', total(gutter) === 0, total(gutter));

const marksOf = g => S.score(g).frames.map(f => f.marks.map(m => m.text).join(''));
check('the card reads X 7/ 9- X -8 8/ -6 X X X8/',
      marksOf(worked).join(' ') === 'X 7/ 9- X -8 8/ -6 X X X8/', marksOf(worked).join(' '));

// 10th frame variants
check('10th: 9/ then a strike fill = 20 in the frame',
      total(fromCard(['--', '--', '--', '--', '--', '--', '--', '--', '--', '9/X'])) === 20, '');
check('10th: an open frame has only two shots',
      S.isComplete(fromCard(['--', '--', '--', '--', '--', '--', '--', '--', '--', '72'])), '');
check('10th: X then X then 7 scores 27',
      total(fromCard(['--', '--', '--', '--', '--', '--', '--', '--', '--', 'XX7'])) === 27, '');
const tenthFills = fromCard(['--', '--', '--', '--', '--', '--', '--', '--', '--', 'X9/']);
check('10th: X, 9, / marks the fill ball as a spare',
      marksOf(tenthFills)[9] === 'X9/', marksOf(tenthFills)[9]);

// Partial games
let part = S.newGame({ ball: 'A' });
const shoot = (g, standing, extra) => S.addShot(g, Object.assign({ standing, ball: 'A' }, extra));
part = shoot(part, [], { hit: 'pocket' });
check('a strike alone has no total yet', S.score(part).frames[0].total === null, '');
part = shoot(part, [], { hit: 'pocket' });
check('nor after a second strike', S.score(part).frames[0].total === null, '');
part = shoot(part, [10], { hit: 'high' });
check('three rolls settle the first frame: 10+10+9', S.score(part).frames[0].total === 29, S.score(part).frames[0].total);
check('the second frame waits on its bonus', S.score(part).frames[1].total === null, '');
check('the game is not complete', !S.isComplete(part) && S.score(part).total === null, '');

// --- where the next shot goes ------------------------------------------------
let p = S.newGame({ ball: 'A' });
check('a new game starts on frame 1, a fresh rack',
      S.position(p).frame === 0 && S.position(p).fresh && S.position(p).before.length === 10, '');
p = shoot(p, [10], { hit: 'pocket' });
let pos = S.position(p);
check('after a 10-pin leave the same frame takes a spare shot at the 10',
      pos.frame === 0 && !pos.fresh && pos.before.join() === '10', JSON.stringify(pos));
p = shoot(p, [], {});
check('a converted spare moves to the next frame', S.position(p).frame === 1 && S.position(p).fresh, '');
p = shoot(p, [], { hit: 'pocket' });
check('a strike moves on after one shot', S.position(p).frame === 2, '');

const tenth = fromCard(['--', '--', '--', '--', '--', '--', '--', '--', '--', 'X']);
pos = S.position(tenth);
check('10th after a strike: a fresh rack for the next shot', pos.tenth && pos.fresh && pos.shot === 1, JSON.stringify(pos));
const tenthB = S.addShot(tenth, { standing: [7, 10], hit: 'light', ball: 'A' });
pos = S.position(tenthB);
check('10th X then 7-10: the third shot is a spare try at 7-10',
      !pos.fresh && pos.before.join() === '7,10', JSON.stringify(pos));

// --- validation and editing -----------------------------------------------------
const throws = fn => { try { fn(); return null; } catch (e) { return e.message; } };
check('how a first ball hit is optional', !throws(() => S.addShot(S.newGame({}), { standing: [] })), '');
check('a first ball saved with no hit has none recorded', S.walk(S.addShot(S.newGame({}), { standing: [] }))[0].shot.hit === undefined, '');
check('which way a spare was missed is optional',
      !throws(() => S.addShot(shoot(S.newGame({}), [10], { hit: 'pocket' }), { standing: [10] })), '');
check('but a side that is given has to be left or right',
      !!throws(() => S.addShot(shoot(S.newGame({}), [10], { hit: 'pocket' }), { standing: [10], miss: 'middle' })), '');
const noSide = S.addShot(shoot(S.newGame({}), [10], { hit: 'pocket' }), { standing: [10] });
check('a miss with no side is saved without one', S.walk(noSide)[1].shot.miss === undefined && S.position(noSide).frame === 1, '');
check('a miss with no side still counts as an open frame, with no left or right',
      (() => {
        let g = S.newGame({ ball: 'A' });
        g = S.addShot(g, { standing: [10], hit: 'light', ball: 'A' });
        g = S.addShot(g, { standing: [10], ball: 'A' });
        for (let f = 1; f < 9; f++) g = S.addShot(g, { standing: [], hit: 'pocket', ball: 'A' });
        for (let k = 0; k < 3; k++) g = S.addShot(g, { standing: [], hit: 'pocket', ball: 'A' });
        g.status = 'done';
        const a = S.analyze([g]);
        return a.opens === 1 && a.misses.total === 0 && a.single.unrecorded === 1 && a.single.attempts === 1;
      })(), '');
// Hit types are optional, so the figures count only the first balls that have one.
const half = fromCard(['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'XXX']);
half.frames.forEach((fr, i) => { if (i % 2) delete fr.shots[0].hit; });
const halfStats = S.analyze([half]);
check('first balls with no hit are left out of the hit figures', halfStats.hitsRecorded === 7 && halfStats.racks === 12 && halfStats.hits.pocket.n === 7, halfStats.hitsRecorded + '/' + halfStats.racks);
check('but they still count as strikes and first balls', halfStats.strikes === 12 && halfStats.strikePct === 1, '');
check('hit shares are of the recorded ones', halfStats.hits.pocket.pct === 1, halfStats.hits.pocket.pct);

// --- editing one frame in place ---------------------------------------------------------
const fix = (g, index, shots) => S.replaceFrame(g, index, shots);
const strikeShot = { standing: [], hit: 'pocket', ball: 'A' };
// frame 3 of the worked game was 9-: make it a strike instead. Everything after it recalculates.
const edited = fix(worked, 2, [strikeShot]);
check('redoing a frame keeps every frame after it', edited.frames.length === 10 && edited.frames[3].shots.length === 1, '');
check('and the card recalculates: frame 2 gains a bonus (7/ then X = 20, total 40)',
      S.score(edited).frames[1].total === 40, JSON.stringify(S.score(edited).frames[1]));
check('and frame 3 is a strike worth 10 + 10 + 0, total 60',
      S.score(edited).frames[2].marks.map(m => m.text).join('') === 'X' && S.score(edited).frames[2].total === 60, JSON.stringify(S.score(edited).frames[2]));
check('the game total moves with it, from 168 to 180', total(edited) === 180, total(edited));
check('and the original game is untouched', total(worked) === 168 && worked.frames[2].shots.length === 2, '');
// a frame can change shape: strike (1 shot) to open (2 shots)
const opened = fix(perfect, 4, [{ standing: [1, 2], hit: 'high', ball: 'A' }, { standing: [2], miss: 'left', ball: 'A' }]);
check('a frame can change from one shot to two', opened.frames[4].shots.length === 2 && S.isComplete(opened), '');
check('the 10th frame can be redone, to a different length',
      S.isComplete(fix(perfect, 9, [{ standing: [3], hit: 'light', ball: 'A' }, { standing: [3], miss: 'right', ball: 'A' }])) &&
      S.walk(fix(perfect, 9, [{ standing: [3], hit: 'light', ball: 'A' }, { standing: [3], miss: 'right', ball: 'A' }])).length === 11, '');
check('and a 10th with a strike and fills is accepted',
      total(fix(worked, 9, [strikeShot, strikeShot, strikeShot])) === 180, total(fix(worked, 9, [strikeShot, strikeShot, strikeShot])));
check('a frame that is not finished is refused',
      !!throws(() => fix(worked, 2, [{ standing: [10], hit: 'light', ball: 'A' }])), '');
check('a frame with too many shots is refused', !!throws(() => fix(worked, 2, [strikeShot, strikeShot])), '');
check('an impossible shot is refused', !!throws(() => fix(worked, 2, [{ standing: [10], hit: 'light' }, { standing: [9], miss: 'left' }])), '');
check('a frame that does not exist is refused', !!throws(() => fix(worked, 12, [strikeShot])), '');
check('a corrected first ball needs no hit', !throws(() => fix(worked, 2, [{ standing: [] }])), '');

// --- sets: games bowled together ------------------------------------------------------------
const inSet = (g, setId, no, extra) => Object.assign(g, { setId: setId, gameNo: no, setSize: 3 }, extra || {});
const g1 = inSet(fromCard(['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'XXX']), 'S1', 1, { date: '2026-10-18' });   // 300
const g2 = inSet(fromCard(['5/', '5/', '5/', '5/', '5/', '5/', '5/', '5/', '5/', '5/5']), 'S1', 2, { date: '2026-10-18' }); // 150
const g3 = inSet(fromCard(['--', '--', '--', '--', '--', '--', '--', '--', '--', '--']), 'S1', 3, { date: '2026-10-18' });   // 0
const setA = S.setsOf([g3, g1, g2])[0];
check('games are grouped by set and put in order', setA.games.map(g => g.gameNo).join() === '1,2,3', '');
check('a set has its totals, series and average', setA.totals.join() === '300,150,0' && setA.total === 450 && setA.average === 150, JSON.stringify(setA.totals));
check('a set with every game bowled is complete', setA.complete && setA.size === 3, '');
const partial = S.setsOf([g1, g2])[0];
check('a set short of its games is not complete', !partial.complete && partial.finished === 2, '');
const openGame = inSet(S.addShot(S.newGame({ ball: 'A' }), { standing: [], hit: 'pocket', ball: 'A' }), 'S2', 1);
check('an unfinished game never counts toward a set in statistics', S.setsOf([g1, g2, g3, openGame]).length === 1, '');
check('but the list can show everything, a lone game by itself',
      S.setsOf([g1, g2, g3, openGame, perfect], { all: true }).length === 3 && S.setsOf([perfect], { all: true })[0].standalone === true, '');
check('a game with no set has no series', S.setsOf([perfect]).length === 0, '');

const ser = S.seriesStats(S.setsOf([g1, g2, g3]));
check('one complete series, average 450, high 450', ser.count === 1 && ser.average === 450 && ser.high === 450 && ser.low === 450, JSON.stringify([ser.count, ser.average]));
check('a series of 450 is not a 600', ser.over600 === 0 && ser.over700 === 0, '');
check('per game it averaged 150', ser.perGame === 150, ser.perGame);
check('the spread within the set is 300, and it faded by 300 from game 1 to 3', ser.spread === 300 && ser.fade === -300, ser.spread + '/' + ser.fade);
check('each place in the set has its own average: 300, 150, 0',
      ser.slots.map(x => x.average).join() === '300,150,0' && ser.slots.map(x => x.slot).join() === '1,2,3', JSON.stringify(ser.slots.map(x => x.average)));
check('a half-finished set does not count as a series', S.seriesStats(S.setsOf([g1, g2])).count === 0, '');
check('but its games still count in the place-in-set averages', S.seriesStats(S.setsOf([g1, g2])).slots.length === 2, '');
const big = [1, 2, 3].map(n => inSet(fromCard(['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'XXX']), 'S3', n));
check('three 300s is a 900, counted as 600+ and 700+', (() => { const x = S.seriesStats(S.setsOf(big)); return x.high === 900 && x.over600 === 1 && x.over700 === 1; })(), '');
const twoSets = S.seriesStats(S.setsOf([g1, g2, g3, ...big]));
check('two series average 675', twoSets.count === 2 && twoSets.average === 675, twoSets.average);
const fiveGame = [1, 2].map(n => inSet(fromCard(['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'XXX']), 'S5', n, { setSize: 2 }));
check('a set of another length is complete at its own length and scales 600+ to it',
      (() => { const x = S.seriesStats(S.setsOf(fiveGame)); return x.count === 1 && x.over600 === 1 && x.high === 600; })(), '');

const byPat = S.compare([g1, g2, g3, ...big.map(g => Object.assign(g, { pattern: 'Sport' }))], 'pattern');
const house = byPat.filter(r => r.key === 'House')[0], sport = byPat.filter(r => r.key === 'Sport')[0];
check('compare gives each pattern its own series figures', house.series.count === 1 && house.series.average === 450 && sport.series.average === 900, JSON.stringify([house.series.average, sport.series.average]));
check('the lane comparison has no series, since lanes change each game', S.compare([g1, g2, g3], 'lane').every(r => r.series === null), '');
const ballSeries = S.compare([g1, g2, g3], 'ball', id => id)[0];
check('the ball comparison credits a series to the ball that threw most of its first balls', ballSeries.series.count === 1 && ballSeries.key === 'A', '');
check('a new set game records its place and length', (() => { const n = S.newGame({ setId: 'X', gameNo: 2, setSize: 3 }); return n.setId === 'X' && n.gameNo === 2 && n.setSize === 3; })() &&
      S.newGame({}).setId === null, '');

console.log(ok.map(s => '  ok  ' + s).join('\n'));
console.log(fails.length ? '\nFAILED:\n' + fails.map(s => '  x  ' + s).join('\n')
                         : '\nall shot-tracker assertions passed');
process.exit(fails.length ? 1 : 0);
