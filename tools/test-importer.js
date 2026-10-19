/* Importing games from a file: the format, the checks, ball matching, repeat imports. */
const fs = require('fs');
const S = require('../js/shots.js');
const I = require('../js/importer.js');

const fails = [], ok = [];
const check = (l, c, d) => (c ? ok : fails).push(l + (c ? '' : '  →  ' + d));
const sample = fs.readFileSync(__dirname + '/import-sample.json', 'utf8');
let n = 0;
const makeId = p => p + (++n);
const run = (text, opts) => I.parse(typeof text === 'string' ? text : JSON.stringify(text), Object.assign({ makeId }, opts));
const doc = (games, extra) => ({ format: 'leaguecraft-games', version: 1, sets: [Object.assign({ date: '2026-09-19', ball: 'Storm Bionic', games }, extra)] });
const STRIKES = new Array(10).fill('.');
const TEN_STRIKES = STRIKES.slice(0, 9).concat(['. . .']);

// --- the sample from a LaneTalk screenshot ---------------------------------------------------
const r = run(sample, { balls: [{ id: 'b1', name: 'Motiv Supra Sport' }] });
check('the sample imports without errors', r.errors.length === 0, r.errors.join(' | '));
check('it holds three games with the printed totals 166, 209, 214', r.games.map(g => S.score(g).total).join() === '166,209,214', r.games.map(g => S.score(g).total).join());
check('and the series is 589, as on the screenshot', r.games.reduce((t, g) => t + S.score(g).total, 0) === 589, '');
check('the warm-up game is skipped, the rest numbered 1 to 3', r.games.map(g => g.gameNo).join() === '1,2,3' && r.games.every(g => g.setSize === 3), JSON.stringify(r.games.map(g => [g.gameNo, g.setSize])));
check('the games are one set, finished, with the ball on every shot', new Set(r.games.map(g => g.setId)).size === 1 && r.games.every(g => g.status === 'done' && S.walk(g).every(c => c.ball === 'b1')), '');
check('"Supra Sport" is matched to "Motiv Supra Sport" and says so', r.newBalls.length === 0 && r.ballMap[0].how === 'close' && r.ballMap[0].match === 'Motiv Supra Sport', JSON.stringify(r.ballMap));
check('every game carries its import key', r.games.map(g => g.importKey).join() === '2026-09-19/1,2026-09-19/2,2026-09-19/3', r.games.map(g => g.importKey).join());
check('games come back in the order bowled', r.games.map(g => g.createdAt).join() === r.games.map(g => g.createdAt).slice().sort().join(), '');
const leaves = S.analyze(r.games).leaves.map(l => l.key);
check('the leaves from the pictures are real leaves', leaves.indexOf('1-2-8-10') !== -1 && leaves.indexOf('4-8') !== -1, leaves.join());
check('the guessed pins on the last ball stay out of the leave table', S.analyze(r.games).leaves.reduce((t, l) => t + l.seen, 0) === S.analyze(r.games).racks - S.analyze(r.games).strikes - 1 /* the ?1 fill ball in game 2 */, JSON.stringify([S.analyze(r.games).racks, S.analyze(r.games).strikes]));
const a = S.analyze(r.games);
const exact = run(sample.replace('"4 . ?1"', '"4 . 10"'), { balls: [{ id: 'b1', name: 'Motiv Supra Sport' }] });
check('but those balls still count for the pins knocked down', Math.abs(S.analyze(exact.games).firstBallAvg - a.firstBallAvg) < 1e-12, a.firstBallAvg + ' vs ' + S.analyze(exact.games).firstBallAvg);

// --- the same file again ---------------------------------------------------------------------
const again = run(sample, { balls: [{ id: 'b1', name: 'Motiv Supra Sport' }], existingKeys: r.games.map(g => g.importKey) });
check('importing the same file again adds nothing', again.games.length === 0 && again.duplicates.length === 3 && again.sets[0].duplicate === true, JSON.stringify([again.games.length, again.duplicates.length]));
const part = run(sample, { balls: [{ id: 'b1', name: 'Motiv Supra Sport' }], existingKeys: [r.games[0].importKey] });
check('a partly imported night only adds the missing games', part.games.length === 2 && part.games[0].setId === r.games[0].setId, '');

// --- balls -------------------------------------------------------------------------------------
const named = run(doc([{ frames: TEN_STRIKES, total: 300 }]), { balls: [{ id: 'x', name: 'storm  bionic' }] });
check('names match ignoring case and spacing', named.newBalls.length === 0 && named.games[0].ball === 'x' && named.ballMap[0].how === 'same', JSON.stringify(named.ballMap));
const fresh = run(doc([{ frames: TEN_STRIKES, total: 300 }]), { balls: [{ id: 'x', name: 'Hammer' }] });
check('an unknown ball becomes a new ball', fresh.newBalls.length === 1 && fresh.newBalls[0].name === 'Storm Bionic' && fresh.games[0].ball === fresh.newBalls[0].id, JSON.stringify(fresh.newBalls));
const two = run(doc([{ frames: TEN_STRIKES, total: 300 }]), { balls: [{ id: 'x', name: 'Storm Bionic Pearl' }, { id: 'y', name: 'Storm Bionic Solid' }] });
check('two close matches are not guessed between', two.newBalls.length === 1 && two.ballMap[0].how === 'new', JSON.stringify(two.ballMap));
const pick = run(doc([{ frames: TEN_STRIKES, total: 300 }]), { balls: [{ id: 'x', name: 'Storm Bionic Pearl' }, { id: 'y', name: 'Storm Bionic Solid' }], aliases: { 'storm bionic': 'y' } });
check('a chosen ball wins', pick.newBalls.length === 0 && pick.games[0].ball === 'y' && pick.ballMap[0].how === 'chosen', JSON.stringify(pick.ballMap));
const forced = run(doc([{ frames: TEN_STRIKES, total: 300 }]), { balls: [{ id: 'x', name: 'Storm Bionic' }], aliases: { 'storm bionic': 'new' } });
check('"new" forces a new ball even when the name is taken', forced.newBalls.length === 1, '');
const perGame = run(doc([{ frames: TEN_STRIKES, total: 300 }, { frames: TEN_STRIKES, total: 300, ball: 'Hammer' }]), { balls: [] });
check('a game can use another ball than the set', perGame.newBalls.length === 2 && perGame.games[1].ball !== perGame.games[0].ball, '');
check('a set with no ball is an error', run(doc([{ frames: TEN_STRIKES }], { ball: undefined })).errors.length === 1, '');

// --- mistakes are caught with where they are ---------------------------------------------------
const bad = (games, extra) => run(doc(games, extra), { balls: [] });
const wrongTotal = bad([{ frames: TEN_STRIKES, total: 299 }]);
check('a wrong total names the game and the sum it found', wrongTotal.errors.length === 1 && /game 1/.test(wrongTotal.errors[0]) && /300/.test(wrongTotal.errors[0]) && wrongTotal.games.length === 0, wrongTotal.errors.join());
const wrongRun = bad([{ frames: TEN_STRIKES, total: 300, scores: [30, 60, 90, 120, 150, 180, 210, 240, 270, 299] }]);
check('a wrong running total names the frame', /after frame 10/.test(wrongRun.errors[0] || ''), wrongRun.errors.join());
check('a pin that was already down is refused', /Frame 1, ball 2: Pin 2 was already down/.test(bad([{ frames: ['4 2'].concat(STRIKES.slice(1, 9), ['. . .']) }]).errors.join()), bad([{ frames: ['4 2'].concat(STRIKES.slice(1, 9), ['. . .']) }]).errors.join());
check('too few balls in a frame is caught', /Frame 1 has too few balls/.test(bad([{ frames: ['4', '.', '.', '.', '.', '.', '.', '.', '.', '. . .'] }]).errors.join()), bad([{ frames: ['4', '.'] }]).errors.join());
check('too many balls in a frame is caught', bad([{ frames: ['. .', '.', '.', '.', '.', '.', '.', '.', '.', '. . .'] }]).errors.length === 1, '');
check('nine frames is not a game', /needs ten/.test(bad([{ frames: STRIKES.slice(0, 9) }]).errors.join()), '');
check('a nonsense ball is explained', /not a ball/.test(bad([{ frames: ['abc'].concat(STRIKES.slice(1, 9), ['. . .']) }]).errors.join()), '');
check('pin 11 does not exist', /no pin 11/.test(bad([{ frames: ['11 .'].concat(STRIKES.slice(1, 9), ['. . .']) }]).errors.join()), '');
check('"?1" can come before another ball: one pin left is a single whichever pin it is', bad([{ frames: ['?1 .'].concat(STRIKES.slice(1, 9), ['. . .']) }]).errors.length === 0, bad([{ frames: ['?1 .'] }]).errors.join());
const noDeck = bad([{ frames: ['?1 .'].concat(STRIKES.slice(1, 9), ['. . .']), total: 290 }]);
check('a spare after an unknown pin counts as a single-pin spare but names no leave', (() => { const a = S.analyze(noDeck.games); return a.single.attempts === 1 && a.single.made === 1 && a.leaves.length === 0; })(), noDeck.errors.join());
check('the leave table is not credited for a spare try at an unknown pin', (() => { const g = bad([{ frames: ['10 .', '?1 .'].concat(STRIKES.slice(2, 9), ['. . .']) }]).games[0]; const l = S.analyze([g]).leaves; return l.length === 1 && l[0].key === '10' && l[0].seen === 1 && l[0].attempts === 1; })(), '');
check('a missed everything frame is all ten pins, written out', bad([{ frames: ['1-2-3-4-5-6-7-8-9-10 1-2-3-4-5-6-7-8-9-10'].concat(STRIKES.slice(1, 9), ['. . .']), total: 270 }]).errors.length === 0, bad([{ frames: ['1-2-3-4-5-6-7-8-9-10 1-2-3-4-5-6-7-8-9-10'].concat(STRIKES.slice(1, 9), ['. . .']) }]).errors.join());
const dflt = run(doc([{ frames: TEN_STRIKES }], { event: undefined, location: undefined }), { balls: [], defaults: { location: 'LTB', pattern: 'Flat', lane: '7', event: 'tournament' } });
check('details missing from the file come from the defaults', dflt.games[0].location === 'LTB' && dflt.games[0].pattern === 'Flat' && dflt.games[0].lane === '7' && dflt.games[0].event === 'tournament', JSON.stringify(dflt.games[0]));
check('with no event anywhere a night is practice', bad([{ frames: TEN_STRIKES }], { event: undefined }).games[0].event === 'practice', '');
check('what the file says beats the defaults', run(doc([{ frames: TEN_STRIKES }], { location: 'Here' }), { balls: [], defaults: { location: 'There' } }).games[0].location === 'Here', '');
check('"?" is refused where the next ball depends on it', /last ball of a frame/.test(bad([{ frames: ['?2 .'].concat(STRIKES.slice(1, 9), ['. . .']) }]).errors.join()), bad([{ frames: ['?2 .'] }]).errors.join());
check('"?" is allowed on the last ball of a frame', bad([{ frames: ['10 ?1'].concat(STRIKES.slice(1, 9), ['. . .']) }]).errors.length === 0, '');
check('a bad date is explained', /date must look like/.test(bad([{ frames: TEN_STRIKES }], { date: '13/10/2026' }).errors.join()), '');
check('a bad event is explained', /event must be one of/.test(bad([{ frames: TEN_STRIKES }], { event: 'party' }).errors.join()), '');
check('not JSON is explained', run('hello').errors.length === 1 && /not a valid file/.test(run('hello').errors[0]), run('hello').errors.join());
check('a different kind of JSON file is refused', /not a LeagueCraft games file/.test(run('{"a":1}').errors.join()), '');
check('a future version is refused', /version 2/.test(run('{"format":"leaguecraft-games","version":2,"sets":[]}').errors.join()), '');
check('one bad game does not hide the problems in the next', bad([{ frames: TEN_STRIKES, total: 1 }, { frames: STRIKES.slice(0, 9) }]).errors.length === 2, '');

// --- shapes ------------------------------------------------------------------------------------
const single = bad([{ frames: TEN_STRIKES, total: 300 }]);
check('a lone game is not made part of a set', single.games[0].setId === null && single.games[0].gameNo === 1 === false || single.games[0].setId === null, JSON.stringify([single.games[0].setId, single.games[0].gameNo]));
const noTotal = bad([{ frames: TEN_STRIKES }]);
check('a game with no total still imports, with a warning', noTotal.errors.length === 0 && noTotal.warnings.length === 1, noTotal.warnings.join());
check('arrays of balls work as well as strings', bad([{ frames: STRIKES.slice(0, 9).map(() => ['.']).concat([['.', '.', '.']]), total: 300 }]).errors.length === 0, bad([{ frames: [['.']] }]).errors.join());
check('location, pattern, event and lane travel with the game', (() => { const g = bad([{ frames: TEN_STRIKES }], { location: 'LTB', pattern: 'Sport', event: 'tournament', lane: '14' }).games[0]; return g.location === 'LTB' && g.pattern === 'Sport' && g.event === 'tournament' && g.lane === '14'; })(), '');
check('imported games are scored and listed like any other', (() => { const g = r.games[0]; return S.finished([g]).length === 1 && S.setsOf(r.games)[0].complete === true && S.setsOf(r.games)[0].total === 589; })(), '');

const ex = run(I.EXAMPLE, { balls: [] });
check('the example file in the app imports cleanly', ex.errors.length === 0 && ex.games.length === 2 && ex.games.map(g => S.score(g).total).join() === '300,191', ex.errors.join() + ' ' + ex.games.map(g => S.score(g).total).join());

// --- the history transcribed from LaneTalk screenshots ----------------------------------------
const hist = run(fs.readFileSync(__dirname + '/../imports/lanetalk-2026.json', 'utf8'), { balls: [] });
check('the LaneTalk history imports with every total and running total matching', hist.errors.length === 0 && hist.games.length === 13, hist.errors.join(' | '));
check('and the series are the ones printed on the screenshots', hist.sets.map(x => x.games.reduce((t, g) => t + g.total, 0)).join() === '589,599,576,660,233', hist.sets.map(x => x.games.reduce((t, g) => t + g.total, 0)).join());
check('the sample and the history agree about the night they share, so importing both adds it once', (() => { const smp = run(sample, { balls: [] }); return smp.games.map(g => g.importKey).join() === hist.games.slice(0, 3).map(g => g.importKey).join(); })(), '');

console.log(ok.map(s => '  ok  ' + s).join('\n'));
console.log(fails.length ? '\nFAILED:\n' + fails.map(s => '  x  ' + s).join('\n') : '\nall importer assertions passed');
process.exit(fails.length ? 1 : 0);
