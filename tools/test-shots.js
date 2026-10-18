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
check('a first ball needs a hit', !!throws(() => S.addShot(S.newGame({}), { standing: [] })), '');
check('a missed spare needs a side',
      !!throws(() => S.addShot(shoot(S.newGame({}), [10], { hit: 'pocket' }), { standing: [10] })), '');
check('a pin that was already down cannot be left standing',
      !!throws(() => S.addShot(shoot(S.newGame({}), [10], { hit: 'pocket' }), { standing: [9], miss: 'left' })), '');
check('an unknown hit is refused', !!throws(() => S.addShot(S.newGame({}), { standing: [], hit: 'flush' })), '');
check('nothing can be added to a complete game', !!throws(() => S.addShot(perfect, { standing: [], hit: 'pocket' })), '');

const undone = S.undo(worked);
check('undo takes back the last shot', S.walk(undone).length === S.walk(worked).length - 1, '');
check('and the game is playable again', !S.isComplete(undone) && S.position(undone).frame === 9, JSON.stringify(S.position(undone)));
check('undo on an empty game is harmless', S.undo(S.newGame({})).frames.length === 0, '');
const cut = S.truncate(worked, 4);
check('truncate keeps the frames before the one you re-bowl', cut.frames.length === 4 && S.position(cut).frame === 4, '');
check('and the original is untouched', worked.frames.length === 10, '');

// --- leaves ----------------------------------------------------------------------
const type = pins => S.leaveType(pins);
check('7-10 is a split', type([7, 10]) === 'split' && S.isSplit([7, 10]), '');
check('4-6 is a split', S.isSplit([4, 6]), '');
check('2-7 and 3-10 are baby splits', S.isSplit([2, 7]) && S.isSplit([3, 10]), '');
check('5-7 is a split', S.isSplit([5, 7]), '');
check('2-4 is not a split: the pins touch', !S.isSplit([2, 4]) && type([2, 4]) === 'cluster', '');
check('a bucket, 2-4-5-8, is not a split', !S.isSplit([2, 4, 5, 8]), '');
check('a leave with the headpin standing is never a split', !S.isSplit([1, 7, 10]), '');
check('a single pin is single', type([10]) === 'single' && !S.isSplit([10]), '');
check('the Greek church is a split', S.isSplit([4, 6, 7, 9, 10]), '');
check('leaves are named', S.leaveLabel([10]) === '10 pin' && S.leaveLabel([7, 10]) === '7-10 (Bedposts)' &&
      S.leaveLabel([2, 4, 5, 8]) === '2-4-5-8' && S.leaveLabel([4, 6]) === '4-6 split', S.leaveLabel([7, 10]));
check('the key ignores order and duplicates', S.leaveKey([10, 7, 7]) === '7-10', '');

// --- statistics, on two games worked by hand --------------------------------------------
const game1 = fromCard(['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'XXX'], { ball: 'A' });
// Nine pins down then the 10 pin missed right, every frame: ten opens, 90.
let game2 = S.newGame({ date: '2026-10-19', ball: 'B', pattern: 'Sport', location: 'Other', event: 'league', lane: '12' });
for (let f = 0; f < 10; f++) {
  game2 = S.addShot(game2, { standing: [10], hit: 'light', ball: 'B' });
  game2 = S.addShot(game2, { standing: [10], miss: 'right', ball: 'B' });
}
game2.status = 'done';
check('the miss-every-frame game is 90', total(game2) === 90, total(game2));

const all = S.analyze([game1, game2]);
check('2 games, average 195', all.games === 2 && all.average === 195, all.games + '/' + all.average);
check('high 300, low 90', all.high === 300 && all.low === 90, '');
check('22 racks, 12 strikes', all.racks === 22 && all.strikes === 12, all.racks + '/' + all.strikes);
check('strike % is 12 of 22', Math.abs(all.strikePct - 12 / 22) < 1e-9, all.strikePct);
check('10 spare tries, none made', all.attempts === 10 && all.spares === 0 && all.sparePct === 0, '');
check('all ten were single-pin tries',
      all.single.attempts === 10 && all.single.made === 0 && all.cluster.attempts === 0, JSON.stringify(all.single));
check('every miss went right', all.single.right === 10 && all.misses.right === 10 && all.misses.rightPct === 1, '');
check('pocket: 12 shots, all strikes',
      all.hits.pocket.n === 12 && all.hits.pocket.strikePct === 1, JSON.stringify(all.hits.pocket));
check('light: 10 shots, no strikes, 9 pins a ball',
      all.hits.light.n === 10 && all.hits.light.strikePct === 0 && all.hits.light.avgPins === 9, JSON.stringify(all.hits.light));
check('pocket was 12 of 22 hits', Math.abs(all.hits.pocket.pct - 12 / 22) < 1e-9, all.hits.pocket.pct);
check('first-ball average: (120 + 90) / 22', Math.abs(all.firstBallAvg - 210 / 22) < 1e-9, all.firstBallAvg);
check('five opens a game; one clean game', all.opensPerGame === 5 && all.clean === 1, all.opensPerGame + '/' + all.clean);
check('one 200+ game, none over 250 apart from the 300', all.over200 === 1 && all.over250 === 1, '');
check('best streak is 12, one run of three or more', all.bestStreak === 12 && all.streaks3 === 1, all.bestStreak + '/' + all.streaks3);
check('frame 1: one strike in two', all.byFrame[0].racks === 2 && all.byFrame[0].pct === 0.5, JSON.stringify(all.byFrame[0]));
check('frame 10: three strikes in four fresh racks', all.byFrame[9].racks === 4 && all.byFrame[9].pct === 0.75, JSON.stringify(all.byFrame[9]));
check('the 10 pin leave was seen 10 times, tried 10, made none',
      all.leaves.length === 1 && all.leaves[0].label === '10 pin' && all.leaves[0].seen === 10 &&
      all.leaves[0].attempts === 10 && all.leaves[0].made === 0 && all.leaves[0].right === 10, JSON.stringify(all.leaves));

const onlyB = S.analyze([game1, game2], { ball: 'B' });
check('ball B: one game, 90, no strikes', onlyB.games === 1 && onlyB.average === 90 && onlyB.strikes === 0, JSON.stringify([onlyB.games, onlyB.average]));
check('ball A: one game, 300, no spare tries', S.analyze([game1, game2], { ball: 'A' }).attempts === 0, '');

// Spare ball: first balls on A, spare tries on B
let split = S.newGame({ ball: 'A', spareBall: 'B' });
split = S.addShot(split, { standing: [10], hit: 'pocket', ball: 'A' });
split = S.addShot(split, { standing: [], ball: 'B' });
for (let f = 1; f < 10; f++) split = S.addShot(split, { standing: [], hit: 'pocket', ball: 'A' });
split = S.addShot(split, { standing: [], hit: 'pocket', ball: 'A' });
split = S.addShot(split, { standing: [], hit: 'pocket', ball: 'A' });
split.status = 'done';
check('a spare shot counts for the spare ball, not the strike ball',
      S.analyze([split], { ball: 'B' }).spares === 1 && S.analyze([split], { ball: 'A' }).attempts === 0, '');

// Unfinished and deleted games are ignored
const open = S.addShot(S.newGame({ ball: 'A' }), { standing: [], hit: 'pocket', ball: 'A' });
const gone = Object.assign({}, game1, { deleted: true });
check('open and deleted games are left out', S.analyze([open, gone, game2]).games === 1, '');
check('an empty set has no average', S.analyze([]).average === null && S.analyze([]).strikePct === null, '');

// Grouping
const rows = S.compare([game1, game2], 'pattern');
check('compare by pattern gives one row each', rows.length === 2 && rows.map(r => r.label).sort().join() === 'House,Sport', '');
check('compare by ball gives A and B', S.compare([game1, game2], 'ball', id => 'Ball ' + id).map(r => r.label).sort().join() === 'Ball A,Ball B', '');
check('filter narrows by pattern and date',
      S.filter([game1, game2], { pattern: 'Sport' }).length === 1 &&
      S.filter([game1, game2], { from: '2026-10-19' }).length === 1 &&
      S.filter([game1, game2], { to: '2026-10-18' }).length === 1, '');
check('distinct lists what was recorded', S.distinct([game1, game2], 'lane').join() === '12', S.distinct([game1, game2], 'lane').join());

check('a shot is described in words',
      S.describeShot({ fresh: true, before: S.ALL }, [10]) === '9 pins · 10 pin' &&
      S.describeShot({ fresh: true, before: S.ALL }, []) === 'Strike' &&
      S.describeShot({ fresh: false, before: [10] }, []) === 'Spare', S.describeShot({ fresh: true, before: S.ALL }, [10]));

console.log(ok.map(s => '  ok  ' + s).join('\n'));
console.log(fails.length ? '\nFAILED:\n' + fails.map(s => '  x  ' + s).join('\n')
                         : '\nall shot-tracker assertions passed');
process.exit(fails.length ? 1 : 0);
