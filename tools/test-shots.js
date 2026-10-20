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

// --- fixing a wrong ball afterwards --------------------------------------------------------
(() => {
  let g = S.newGame({ ball: 'A', spareBall: 'C' });
  g = S.addShot(g, { standing: [10], ball: 'A' });
  g = S.addShot(g, { standing: [], ball: 'C' });
  g = S.addShot(g, { standing: [], ball: 'B' });
  const fixed = S.replaceBall(g, 'A', 'B');
  check('replaceBall swaps the ball on every shot that used it', S.ballsInGame(fixed).join() === 'B,C' && fixed.ball === 'B', S.ballsInGame(fixed).join());
  check('and leaves the original untouched', g.ball === 'A' && g.frames[0].shots[0].ball === 'A', '');
  check('replacing the spare ball with the strike ball clears the spare ball', S.replaceBall(g, 'C', 'A').spareBall === null, '');
  check('replacing with the same ball changes nothing', JSON.stringify(S.replaceBall(g, 'A', 'A')) === JSON.stringify(g), '');
  check('the game now counts toward the corrected ball', S.primaryBall(fixed) === 'B', S.primaryBall(fixed));
  const legacy = S.addShot(S.newGame({ ball: 'A' }), { standing: [] });
  check('a game with no per-shot balls follows the game ball', S.primaryBall(S.replaceBall(legacy, 'A', 'Z')) === 'Z', '');
})();

// --- editing a series ---------------------------------------------------------------------
(() => {
  const mk = (id, no, extra) => Object.assign({ id, setId: 'S', gameNo: no, setSize: 3, createdAt: '2026-10-16T0' + no, status: 'done', frames: [] }, extra);
  const set = [mk('a', 1), mk('b', 2), mk('c', 3), mk('d', 4)];
  const dropped = S.dropFromSet(set, 'b');
  check('deleting a game marks it deleted', dropped[0].id === 'b' && dropped[0].deleted === true, '');
  check('and the rest close up to 1..n', dropped.slice(1).map(g => g.id + g.gameNo).join() === 'c2,d3', dropped.slice(1).map(g => g.id + g.gameNo).join());
  // the double-tap duplicate: two open "game 2"s next to a real one
  const dupes = [mk('a', 1), mk('x', 2, { status: 'open', createdAt: '2026-10-16T05' }), mk('y', 2, { status: 'open', createdAt: '2026-10-16T06' }), mk('z', 2, { createdAt: '2026-10-16T07' })];
  check('removing duplicates leaves a clean 1, 2', S.renumber([dupes[0], dupes[3]]).length === 0, '');
  const left = S.leaveSet(set, 'b');
  check('leaving a series keeps the game as a single game', left[0].id === 'b' && left[0].setId === null && left[0].gameNo === null && left[0].setSize === null, JSON.stringify(left[0]));
  check('and renumbers the others', left.slice(1).map(g => g.id + g.gameNo).join() === 'c2,d3', left.slice(1).map(g => g.id + g.gameNo).join());
  check('renumbering leaves games that are already right alone', S.renumber([mk('a', 1), mk('b', 2)]).length === 0, '');
  const full = [mk('a', 1), mk('b', 2), mk('c', 3)];
  const joined = S.joinSet(full, { id: 'x', setId: null, gameNo: null, setSize: null });
  check('joining a full series makes it one game longer', joined[0].gameNo === 4 && joined[0].setSize === 4 && joined[0].setId === 'S', JSON.stringify(joined[0]));
  check('and updates the size on every game', joined.length === 4 && joined.slice(1).every(g => g.setSize === 4), '');
  const roomy = S.joinSet([mk('a', 1), mk('b', 2)], { id: 'x' });
  check('joining a series with room keeps its size', roomy[0].gameNo === 3 && roomy[0].setSize === 3 && roomy.length === 1, JSON.stringify(roomy));
  check('resizing changes every game', S.resizeSet(full, 4).length === 3 && S.resizeSet(full, 4).every(g => g.setSize === 4), '');
  check('a series cannot shrink below its games', (() => { try { S.resizeSet(full, 2); return false; } catch (e) { return true; } })(), '');
  const shrunk = S.setsOf([mk('a', 1), mk('b', 2)].map(g => Object.assign(g, { setSize: 2 })), { all: true })[0];
  check('a 2-game series is complete once both are done', shrunk.size === 2 && shrunk.games.length === 2, '');
})();

// --- makeable spares: splits are left out ---------------------------------------------------
(() => {
  let g = S.newGame({ ball: 'A' });
  const shot = (standing) => { g = S.addShot(g, { standing, ball: 'A' }); };
  shot([10]); shot([]);          // single pin, made
  shot([7, 10]); shot([7, 10]);  // a split, missed
  shot([4, 5]); shot([5]);       // two pins that touch, missed
  shot([2, 3]); shot([]);        // two pins that touch, made
  shot([4, 6]); shot([]);        // a split, made
  for (let f = 5; f < 9; f++) shot([]);
  shot([]); shot([]); shot([]);
  g.status = 'done';
  const a = S.analyze([g]);
  check('all spare tries are counted for the plain spare %', a.attempts === 5 && a.spares === 3 && Math.abs(a.sparePct - 0.6) < 1e-9, a.attempts + '/' + a.spares);
  check('makeable leaves out the splits', a.makeable.attempts === 3 && a.makeable.made === 2, JSON.stringify(a.makeable));
  check('and the makeable % is made over makeable', Math.abs(a.makeablePct - 2 / 3) < 1e-9, a.makeablePct);
  check('a split that was converted is not a makeable spare', a.split.attempts === 2 && a.split.made === 1, JSON.stringify(a.split));
  check('with no spare tries there is no makeable %', S.analyze([]).makeablePct === null, '');
})();

// --- trailing weeks -------------------------------------------------------------------------
(() => {
  const perfect2 = d => Object.assign(fromCard(['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'XXX'], { date: d }), { status: 'done' });
  const normal = d => {                                           // spare every frame with a single-pin leave: 9 + / each
    let g = S.newGame({ date: d, ball: 'A' });
    for (let f = 0; f < 9; f++) { g = S.addShot(g, { standing: [10], ball: 'A' }); g = S.addShot(g, { standing: [], ball: 'A' }); }
    g = S.addShot(g, { standing: [10], ball: 'A' }); g = S.addShot(g, { standing: [], ball: 'A' }); g = S.addShot(g, { standing: [], ball: 'A' });
    g.status = 'done'; return g;
  };
  const nScore = S.score(normal('2026-10-20')).total;
  const today = '2026-10-21';                                     // a Wednesday: this week starts Mon Oct 19
  const w = S.weekly([perfect2('2026-10-19'), normal('2026-10-20'), normal('2026-10-14'), perfect2('2026-07-27'), perfect2('2026-07-26')], { today, weeks: 12 });
  check('weekly returns 12 weeks, oldest first, ending with this one', w.weeks.length === 12 && w.weeks[11].start === '2026-10-19' && w.weeks[0].start === '2026-08-03', w.weeks[0].start + ' ' + w.weeks[11].start);
  check('this week has the two games and their averages', w.weeks[11].games === 2 && w.weeks[11].average === (300 + nScore) / 2 && w.weeks[11].strikesPerGame === (12 + 1) / 2, JSON.stringify(w.weeks[11]));
  check('makeable spares per game counts the converted non-split spares', w.weeks[11].makeablePerGame === (0 + 10) / 2, w.weeks[11].makeablePerGame);
  check('last week has one game', w.weeks[10].games === 1 && w.weeks[10].start === '2026-10-12', JSON.stringify(w.weeks[10]));
  check('a week with no games has no figures', w.weeks[5].games === 0 && w.weeks[5].average === null, JSON.stringify(w.weeks[5]));
  check('games before the window are left out', w.window.games === 3, w.window.games);
  check('the window figures cover everything in it', Math.abs(w.window.average - (300 + 2 * nScore) / 3) < 1e-9, w.window.average);
  check('an empty list gives empty weeks', S.weekly([], { today }).weeks.every(x => x.games === 0) && S.weekly([], { today }).window.average === null, '');
  check('a Sunday belongs to the week that began the Monday before', S.weekly([perfect2('2026-10-25')], { today: '2026-10-25' }).weeks[11].games === 1 && S.weekly([perfect2('2026-10-25')], { today: '2026-10-26' }).weeks[10].games === 1, '');
})();

// --- games dated differently from their set -------------------------------------------------
(() => {
  const mk = (id, no, date, extra) => Object.assign({ id, setId: 'S', gameNo: no, setSize: 3, date, createdAt: '2026-10-19T0' + no, status: 'done', frames: [] }, extra);
  const set = [mk('a', 1, '2026-10-16'), mk('b', 2, '2026-10-19'), mk('c', 3, '2026-10-19')];
  const m = S.dateMismatches(set);
  check('later games dated differently from the first game are found', m.length === 2 && m.map(x => x.game.id).join() === 'b,c' && m.every(x => x.to === '2026-10-16' && x.from === '2026-10-19'), JSON.stringify(m.map(x => [x.game.id, x.from, x.to])));
  check('a set with one date has nothing to fix', S.dateMismatches([mk('a', 1, '2026-10-16'), mk('b', 2, '2026-10-16')]).length === 0, '');
  check('single games are never touched', S.dateMismatches([Object.assign(mk('z', 1, '2026-10-16'), { setId: null, gameNo: null })]).length === 0, '');
  check('the first game is the reference even when listed last', S.dateMismatches([set[2], set[1], set[0]]).length === 2, '');
  check('deleted games are ignored', S.dateMismatches([set[0], Object.assign({}, set[1], { deleted: true })]).length === 0, '');
})();

// --- strike streaks and badges ---------------------------------------------------------------
(() => {
  // X X X 9/ X X 81 X X X (tenth: X X 9)  -> runs: 3, 2, then frames 8-10 and fills: X X X X(?)...
  const card = (frames) => fromCard(frames);
  const g1 = card(['X', 'X', 'X', '9/', 'X', 'X', '81', '9-', '9-', '9-']);
  const runs = S.strikeRuns(g1).map(r => r.length);
  check('strike runs are the maximal runs of two or more', runs.join() === '3,2', runs.join());
  const b1 = S.badges(g1);
  check('three in a row earns a Turkey with one flame', b1.some(b => b.key === 'hot' && b.length === 3 && b.label === 'Turkey' && b.level === 1), JSON.stringify(b1));
  check('a game with open frames is not clean', !b1.some(b => b.key === 'clean'), '');
  check('heat covers the frames of the turkey only, warming along the run', (() => { const h = S.heatFrames(g1); return Object.keys(h).join() === '0,1,2' && h[0].heat < h[1].heat && h[1].heat < h[2].heat && h[0].first === true && h[1].first === false; })(), JSON.stringify(S.heatFrames(g1)));
  const perfectG = card(['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'XXX']);
  const bp = S.badges(perfectG);
  check('twelve in a row is a perfect game, three flames, and clean', bp.some(b => b.key === 'hot' && b.length === 12 && b.label === 'Perfect game' && b.level === 3) && bp.some(b => b.key === 'clean'), JSON.stringify(bp));
  check('a four is a Hambone with two flames', (() => { const g = card(['X', 'X', 'X', 'X', '9-', '9-', '9-', '9-', '9-', '9-']); const h = S.badges(g).find(b => b.key === 'hot'); return h.length === 4 && h.label === 'Hambone' && h.level === 2; })(), '');
  check('six is a Six-pack with three flames', (() => { const g = card(['X', 'X', 'X', 'X', 'X', 'X', '9-', '9-', '9-', '9-']); const h = S.badges(g).find(b => b.key === 'hot'); return h.length === 6 && h.label === 'Six-pack' && h.level === 3; })(), '');
  check('two in a row is not a hot streak', S.badges(card(['X', 'X', '9-', '9-', '9-', '9-', '9-', '9-', '9-', '9-'])).every(b => b.key !== 'hot'), '');
  const clean = card(['9/', '9/', '9/', '9/', '9/', '9/', '9/', '9/', '9/', '9/9']);
  check('a game of strikes and spares is clean', S.badges(clean).some(b => b.key === 'clean') && !S.badges(clean).some(b => b.key === 'hot'), JSON.stringify(S.badges(clean)));
  check('a game still in progress cannot be clean', S.badges(S.newGame({})).length === 0, '');
  check('several hot streaks are counted in the title', (() => { const g = card(['X', 'X', 'X', '9/', 'X', 'X', 'X', '9-', '9-', '9-']); const h = S.badges(g).find(b => b.key === 'hot'); return h.count === 2 && /2 hot streaks/.test(h.title); })(), '');

  // across games
  const pool = [g1, perfectG, clean];
  const a = S.analyze(pool);
  check('analyze lists every run, and the longest per game', a.runs.slice().sort((x, y) => x - y).join() === '2,3,12' && a.runGames.join() === '3,12,0', a.runs.join() + ' | ' + a.runGames.join());
  check('best streak and turkeys still count as before', a.bestStreak === 12 && a.streaks3 === 2, a.bestStreak + ' ' + a.streaks3);
  const tab = S.streakTable(a);
  check('the streak table has a row per length that happened, with "or longer" counts', tab.map(r => r.length).join() === '2,3,12' && tab[0].atLeast === 3 && tab[1].atLeast === 2 && tab[2].atLeast === 1, JSON.stringify(tab.map(r => [r.length, r.times, r.atLeast])));
  check('and one game in N that had one', tab[1].games === 2 && Math.abs(tab[1].oneIn - 1.5) < 1e-9 && tab[2].oneIn === 3, JSON.stringify(tab.map(r => [r.games, r.oneIn])));
  check('a strike after a strike is counted apart from a strike after anything else', a.afterStrike.n > 0 && a.afterOther.n > 0 && a.afterStrike.pct > a.afterOther.pct, JSON.stringify([a.afterStrike, a.afterOther]));
  check('the pairs of first balls add up', a.afterStrike.n + a.afterOther.n === a.racks - 3, a.afterStrike.n + '+' + a.afterOther.n + ' vs ' + a.racks);
})();

// --- personal records and honor scores ---------------------------------------------------------
(() => {
  const nine = ['9-', '9-', '9-', '9-', '9-', '9-', '9-', '9-', '9-', '9-'];                      // 90
  const spares = ['9/', '9/', '9/', '9/', '9/', '9/', '9/', '9/', '9/', '9/9'];                    // 190
  const strong = ['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', '9/', '9/9'];                            // well over 250
  const mk = (card, date, setId, no) => fromCard(card, { date, setId: setId || null, gameNo: setId ? no : null, setSize: setId ? 3 : null });
  const gs = [
    mk(nine, '2026-09-01', 's1', 1), mk(spares, '2026-09-01', 's1', 2), mk(nine, '2026-09-01', 's1', 3),
    mk(spares, '2026-09-08', 's2', 1), mk(strong, '2026-09-08', 's2', 2), mk(spares, '2026-09-08', 's2', 3),
  ];
  const ctx = S.context(gs, {});
  const top = gs[4];
  check('the highest game holds the game record', ctx.gameRecord === top.id && ctx.gameBest === total(top), JSON.stringify(ctx));
  check('only that game gets the PR game badge', gs.filter(g => S.badges(g, ctx).some(b => b.key === 'pr')).map(g => g.id).join() === top.id, '');
  check('a PR badge says what it is and the score', (() => { const b = S.badges(top, ctx).find(x => x.key === 'pr'); return b.kind === 'game' && b.total === total(top) && /best game/.test(b.title); })(), '');
  check('without a context there are no record or honor badges', S.badges(top).every(b => b.key !== 'pr' && b.key !== 'honor'), '');

  const sets = S.setsOf(gs);
  const best = sets.reduce((a, b) => (b.total > a.total ? b : a));
  check('the highest series holds the series record', ctx.seriesRecords[best.id] === true && Object.keys(ctx.seriesRecords).length === 1 && ctx.seriesBest[3] === best.total, JSON.stringify(ctx));
  check('and gets a PR series badge, the other does not', S.setBadges(best, ctx).some(b => b.key === 'pr' && b.kind === 'series' && b.total === best.total) && !S.setBadges(sets.find(x => x !== best), ctx).some(b => b.key === 'pr'), '');
  check('a record needs a few games behind it: two games, no PR', S.context(gs.slice(0, 2), {}).gameRecord === null, '');
  check('and two series before one is a record', Object.keys(S.context(gs.slice(0, 3), {}).seriesRecords).length === 0, '');
  check('an unfinished series has no series badges', S.setBadges({ standalone: false, complete: false, total: 900, size: 3, id: 'x' }, ctx).length === 0, '');
  check('a tie goes to whoever got there first', (() => {
    const a = mk(strong, '2026-09-08', null), b = mk(strong, '2026-09-10', null), c = mk(nine, '2026-09-12', null), d = mk(nine, '2026-09-13', null);
    return S.context([b, a, c, d], {}).gameRecord === a.id;
  })(), '');

  // honor scores: 250 a game and 700 a series unless the settings say otherwise
  check('a game at or over the honor line earns the honor badge', S.badges(top, ctx).some(b => b.key === 'honor' && b.kind === 'game' && b.level === 1 && b.total === total(top)) && total(top) >= 250 && total(top) < 300, String(total(top)));
  check('a game under it does not', gs.filter(g => g !== top).every(g => !S.badges(g, ctx).some(b => b.key === 'honor')), '');
  check('300 is the top honor', (() => { const p = fromCard(['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'XXX']); const b = S.badges(p, S.context([p, gs[0], gs[1]], {})).find(x => x.key === 'honor'); return b && b.level === 2; })(), '');
  check('the lines come from settings', S.badges(gs[1], S.context(gs, { honorGame: 190 })).some(b => b.key === 'honor') && !S.badges(top, S.context(gs, { honorGame: total(top) + 1 })).some(b => b.key === 'honor'), '');
  check('bad settings fall back to 250 and 700', JSON.stringify(S.honorLimits({ honorGame: 'x', honorSeries: -3 })) === JSON.stringify({ game: 250, series: 700 }), '');
  const hi = S.context(gs, { honorSeries: best.total });
  check('a series at the honor line earns the honor series badge', S.setBadges(best, hi).some(b => b.key === 'honor' && b.kind === 'series' && b.total === best.total), '');
  check('one point under it does not', !S.setBadges(best, S.context(gs, { honorSeries: best.total + 1 })).some(b => b.key === 'honor'), '');
  check('the series line is scaled for other lengths', S.setBadges({ standalone: false, complete: true, total: 467, size: 2, id: 'y' }, S.context(gs, {})).some(b => b.key === 'honor') && !S.setBadges({ standalone: false, complete: true, total: 466, size: 2, id: 'y' }, S.context(gs, {})).some(b => b.key === 'honor'), '');
  check('honor comes first, then the record', S.badges(top, ctx).map(b => b.key).slice(0, 2).join() === 'honor,pr', S.badges(top, ctx).map(b => b.key).join());
})();

// --- ball changes, counted by night -------------------------------------------------------------
(() => {
  const withBall = (g, id, fromFrame) => { g.ball = fromFrame ? g.ball : id; g.frames.forEach((fr, i) => { if (i >= (fromFrame || 0)) fr.shots.forEach(sh => { sh.ball = id; }); }); return g; };
  const card = ['9/', '9/', '9/', '9/', '9/', '9/', '9/', '9/', '9/', '9/9'];
  const mk = (setId, no, ball, date) => withBall(fromCard(card, { date: date || '2026-10-01', setId, gameNo: no, setSize: 3 }), ball);
  // night one: same ball all night; night two: a different ball for game 3; night three: one game switched halfway
  const n1 = [mk('a', 1, 'X'), mk('a', 2, 'X'), mk('a', 3, 'X')];
  const n2 = [mk('b', 1, 'X', '2026-10-08'), mk('b', 2, 'X', '2026-10-08'), mk('b', 3, 'Y', '2026-10-08')];
  const n3 = [withBall(mk('c', 1, 'X', '2026-10-15'), 'Y', 5), mk('c', 2, 'Y', '2026-10-15')];
  const c1 = S.ballChanges(n1), c2 = S.ballChanges(n2), c3 = S.ballChanges(n3);
  check('a night with one ball has no change', c1.nights === 1 && c1.nightsChanged === 0 && c1.changesBetween === 0 && c1.changesWithin === 0, JSON.stringify(c1));
  check('a different ball for a later game is a change between games', c2.changesBetween === 1 && c2.changesWithin === 0 && c2.nightsChanged === 1, JSON.stringify(c2));
  check('a switch partway through a game is a change within it, and the next game starts on the new ball', c3.changesWithin === 1 && c3.changesBetween === 0 && c3.nightsChanged === 1, JSON.stringify(c3));
  const all = S.analyze(n1.concat(n2, n3));
  check('analyze counts nights and the nights that changed', all.nights === 3 && all.nightsChanged === 2 && all.changesBetween === 1 && all.changesWithin === 1, JSON.stringify([all.nights, all.nightsChanged, all.changesBetween, all.changesWithin]));
  check('the old count of games switched midway is unchanged', all.switched === 1, String(all.switched));
  check('games on their own are a night each', S.ballChanges([fromCard(card), fromCard(card)]).nights === 2, '');
})();

console.log(ok.map(s => '  ok  ' + s).join('\n'));
console.log(fails.length ? '\nFAILED:\n' + fails.map(s => '  x  ' + s).join('\n')
                         : '\nall shot-tracker assertions passed');
process.exit(fails.length ? 1 : 0);
