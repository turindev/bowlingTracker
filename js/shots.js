/*
 * Shot tracker engine: pure functions, no DOM, no storage.
 *
 * A game is a list of frames, a frame a list of shots, and a shot records the
 * pins STILL STANDING after it (plus how it hit, or which way a spare was
 * missed). Everything else — pins knocked, strikes, spares, splits, the
 * scorecard, every statistic — is derived from that, so there is only one
 * thing to get right at the lanes.
 *
 *   game = {
 *     id, date, location, pattern, event, lane, notes,
 *     setId, gameNo, setSize,   // games bowled together (a 3-game set): shared id, 1-based place, length
 *     ball, spareBall,          // ball ids at the start; each shot carries the one it used,
 *                               // so a ball change mid-game is recorded shot by shot
 *     status: 'open' | 'done',
 *     frames: [{ shots: [{ standing: [..], hit?, miss?, ball? }] }],
 *     createdAt, updatedAt, deleted?
 *   }
 *
 * Works in the browser (window.Shots) and under Node (module.exports), so the
 * rules can be tested without a browser.
 */
(function () {
  'use strict';

  var HITS = ['pocket', 'high', 'light', 'brooklyn', 'other'];
  var HIT_LABELS = {
    pocket: 'Pocket', high: 'High', light: 'Light', brooklyn: 'Brooklyn', other: 'Other',
  };
  var MISSES = ['left', 'right'];
  var EVENTS = ['league', 'practice', 'tournament'];

  var ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  /* The deck as it is drawn from behind the ball: back row first. */
  var DECK = [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]];

  /* Pins that touch each other. Two standing pins that do not touch, with the
     headpin down, are a split. */
  var TOUCH = {
    1: [2, 3], 2: [1, 3, 4, 5], 3: [1, 2, 5, 6], 4: [2, 5, 7, 8], 5: [2, 3, 4, 6, 8, 9],
    6: [3, 5, 9, 10], 7: [4, 8], 8: [4, 5, 7, 9], 9: [5, 6, 8, 10], 10: [6, 9],
  };

  var SPLIT_NAMES = {
    '7-10': 'Bedposts', '4-6-7-10': 'Big four', '4-6-7-9-10': 'Greek church',
    '4-6-7-8-10': 'Greek church', '2-7': 'Baby split', '3-10': 'Baby split',
  };

  function byNumber(a, b) { return a - b; }

  function cleanPins(list) {
    var seen = {};
    return (list || []).map(Number).filter(function (p) {
      if (!(p >= 1 && p <= 10) || p % 1 !== 0 || seen[p]) return false;
      seen[p] = true;
      return true;
    }).sort(byNumber);
  }

  /* ---------- leaves ---------- */

  function leaveKey(standing) {
    return cleanPins(standing).join('-');
  }

  function components(pins) {
    var left = pins.slice();
    var count = 0;
    while (left.length) {
      count++;
      var queue = [left.shift()];
      while (queue.length) {
        var pin = queue.pop();
        TOUCH[pin].forEach(function (n) {
          var i = left.indexOf(n);
          if (i !== -1) { left.splice(i, 1); queue.push(n); }
        });
      }
    }
    return count;
  }

  /* A split: the headpin is down and the pins left are not all touching. */
  function isSplit(standing) {
    var pins = cleanPins(standing);
    return pins.length >= 2 && pins.indexOf(1) === -1 && components(pins) > 1;
  }

  /* single | split | cluster — what kind of spare it is to pick up. */
  function leaveType(standing) {
    var pins = cleanPins(standing);
    if (pins.length === 1) return 'single';
    return isSplit(pins) ? 'split' : 'cluster';
  }

  function leaveLabel(standing) {
    var pins = cleanPins(standing);
    if (!pins.length) return 'Strike';
    var key = pins.join('-');
    if (pins.length === 1) return pins[0] + ' pin';
    if (SPLIT_NAMES[key] && isSplit(pins)) return key + ' (' + SPLIT_NAMES[key] + ')';
    return key + (isSplit(pins) ? ' split' : '');
  }

  /* ---------- walking a game ---------- */

  /* Every shot in order, with the context it was bowled in. */
  function walk(game) {
    var out = [];
    var frames = (game && game.frames) || [];
    for (var f = 0; f < frames.length; f++) {
      var shots = frames[f].shots || [];
      var before = ALL;
      var fresh = true;
      for (var s = 0; s < shots.length; s++) {
        var shot = shots[s];
        var standing = cleanPins(shot.standing);
        out.push({
          f: f, s: s, shot: shot,
          fresh: fresh,
          before: before,
          standing: standing,
          knocked: before.length - standing.length,
          strike: fresh && standing.length === 0,
          spare: !fresh && standing.length === 0,
          ball: shot.ball || null,
        });
        if (standing.length === 0) { before = ALL; fresh = true; }
        else { before = standing; fresh = false; }
      }
    }
    return out;
  }

  /* How many shots a frame takes, given the shots so far. null = unknown yet. */
  function shotsNeeded(frameIndex, shots) {
    if (!shots.length) return null;
    var first = cleanPins(shots[0].standing).length === 0;
    if (frameIndex < 9) return first ? 1 : 2;
    if (first) return 3;
    if (shots.length < 2) return null;
    var second = cleanPins(shots[1].standing).length === 0;
    return second ? 3 : 2;
  }

  function frameDone(frameIndex, shots) {
    var need = shotsNeeded(frameIndex, shots || []);
    return need != null && shots.length >= need;
  }

  function isComplete(game) {
    var frames = (game && game.frames) || [];
    return frames.length === 10 && frameDone(9, frames[9].shots || []);
  }

  /* Where the next shot goes, and what is standing for it. null when done. */
  function position(game) {
    var frames = (game && game.frames) || [];
    var f = frames.length - 1;
    if (f < 0 || frameDone(f, frames[f].shots || [])) {
      if (frames.length >= 10) return null;
      return {
        frame: frames.length, shot: 0, fresh: true, before: ALL.slice(),
        tenth: frames.length === 9,
      };
    }
    var ctx = walk({ frames: [frames[f]] });
    var last = ctx[ctx.length - 1];
    var rackClear = last.standing.length === 0;
    return {
      frame: f, shot: ctx.length,
      fresh: rackClear,
      before: rackClear ? ALL.slice() : last.standing.slice(),
      tenth: f === 9,
    };
  }

  /* ---------- editing ---------- */

  function copy(game) { return JSON.parse(JSON.stringify(game)); }

  /* Adds a shot, or throws a plain-English error. Never mutates its input. */
  function addShot(game, input) {
    var pos = position(game);
    if (!pos) throw new Error('This game is already complete.');

    var standing = cleanPins(input.standing);
    var stray = standing.filter(function (p) { return pos.before.indexOf(p) === -1; });
    if (stray.length) {
      throw new Error('Pin ' + stray[0] + ' was already down before this shot.');
    }

    var shot = { standing: standing };
    if (pos.fresh) {
      /* How a first ball hit is worth knowing, never required. */
      if (input.hit) {
        if (HITS.indexOf(input.hit) === -1) throw new Error('A hit is pocket, high, light, Brooklyn or other.');
        shot.hit = input.hit;
      }
    } else if (standing.length && input.miss) {
      /* Which way a spare was missed is worth knowing, never required. */
      if (MISSES.indexOf(input.miss) === -1) throw new Error('A miss is left or right.');
      shot.miss = input.miss;
    }
    if (input.ball) shot.ball = input.ball;
    /* Pins known only by how many were left, from an import: kept for the score
       and the pin count, left out of the leave statistics. */
    if (input.approx) shot.approx = true;
    /* A spare try at a leave whose pins are not known exactly: still a try, but
       not evidence about that particular leave. */
    if (!pos.fresh) {
      var frames0 = game.frames || [];
      var inFrame = frames0.length ? frames0[frames0.length - 1].shots : [];
      if (inFrame.length && inFrame[inFrame.length - 1].approx) shot.approxBefore = true;
    }

    var next = copy(game);
    next.frames = next.frames || [];
    if (!next.frames.length || frameDone(next.frames.length - 1, next.frames[next.frames.length - 1].shots)) {
      next.frames.push({ shots: [] });
    }
    next.frames[next.frames.length - 1].shots.push(shot);
    return next;
  }

  /* Redoes one frame in place. Every frame starts on a fresh rack, so the frames
     after it stay as they were and the scorecard recalculates. The new shots
     are checked as if they were bowled in that frame, 10th included. */
  function replaceFrame(game, index, shots) {
    var frames = (game && game.frames) || [];
    if (!(index >= 0 && index < frames.length)) throw new Error('There is no such frame.');
    var probe = { frames: [] };
    for (var i = 0; i < index; i++) probe.frames.push({ shots: [{ standing: [] }] });
    (shots || []).forEach(function (shot) {
      probe = addShot(probe, {
        standing: shot.standing, hit: shot.hit, miss: shot.miss, ball: shot.ball, approx: shot.approx,
      });
    });
    var built = probe.frames[index];
    if (!built || !frameDone(index, built.shots)) throw new Error('That frame is not finished.');
    if (probe.frames.length > index + 1) throw new Error('That is more shots than one frame takes.');
    var next = copy(game);
    next.frames[index] = built;
    return next;
  }

  /* Takes back the last shot. */
  function undo(game) {
    var next = copy(game);
    var frames = next.frames || [];
    while (frames.length && !frames[frames.length - 1].shots.length) frames.pop();
    if (!frames.length) return next;
    frames[frames.length - 1].shots.pop();
    if (!frames[frames.length - 1].shots.length) frames.pop();
    return next;
  }

  /* The game with every use of ball `from` swapped for `to`: the ball it started
     with, the spare ball, and each shot. For fixing a wrong pick afterwards. */
  function replaceBall(game, from, to) {
    var next = copy(game);
    if (!to || from === to) return next;
    if (next.ball === from) next.ball = to;
    if (next.spareBall === from) next.spareBall = to;
    if (next.spareBall && next.spareBall === next.ball) next.spareBall = null;
    (next.frames || []).forEach(function (f) {
      (f.shots || []).forEach(function (s) { if (s.ball === from) s.ball = to; });
    });
    return next;
  }

  /* Drops frame `index` (0-based) and everything after, to re-bowl from there. */
  function truncate(game, index) {
    var next = copy(game);
    next.frames = (next.frames || []).slice(0, Math.max(0, index));
    return next;
  }

  /* ---------- scoring ---------- */

  /* The scorecard: marks for each shot and running totals. A frame's total is
     null until the shots its bonus depends on have been bowled. */
  function score(game) {
    var frames = (game && game.frames) || [];
    var ctx = walk(game);

    var rolls = [];
    var firstRoll = [];
    var marks = frames.map(function () { return []; });
    var byFrame = frames.map(function () { return []; });
    ctx.forEach(function (c) {
      if (c.s === 0) firstRoll[c.f] = rolls.length;
      rolls.push(c.knocked);
      byFrame[c.f].push(c.knocked);

      var text;
      if (c.strike) text = 'X';
      else if (c.spare) text = '/';
      else text = c.knocked === 0 ? '-' : String(c.knocked);
      marks[c.f].push({ text: text, split: c.fresh && isSplit(c.standing) });
    });

    var running = 0;
    var totals = [];
    var broke = false;
    frames.forEach(function (frame, f) {
      var own = byFrame[f];
      var value = null;
      if (!broke) {
        var start = firstRoll[f];
        if (f === 9) {
          if (frameDone(9, frame.shots || [])) value = own.reduce(function (a, b) { return a + b; }, 0);
        } else if (own[0] === 10) {
          if (rolls.length >= start + 3) value = 10 + rolls[start + 1] + rolls[start + 2];
        } else if (own.length === 2 && own[0] + own[1] === 10) {
          if (rolls.length >= start + 3) value = 10 + rolls[start + 2];
        } else if (own.length === 2) {
          value = own[0] + own[1];
        }
      }
      if (value == null) { broke = true; totals.push(null); return; }
      running += value;
      totals.push(running);
    });

    var complete = isComplete(game);
    return {
      frames: frames.map(function (frame, f) {
        return { marks: marks[f], total: totals[f], rolls: byFrame[f] };
      }),
      total: complete ? totals[9] : null,
      running: totals.filter(function (t) { return t != null; }).pop() || 0,
      complete: complete,
    };
  }

  /* ---------- balls within a game ---------- */

  /* The balls used, in the order they first appeared. */
  function ballsInGame(game) {
    var seen = [];
    walk(game).forEach(function (c) {
      if (c.ball && seen.indexOf(c.ball) === -1) seen.push(c.ball);
    });
    if (!seen.length && game && game.ball) seen.push(game.ball);
    return seen;
  }

  /* The ball a game counts toward: the one thrown for most first balls, and on
     a tie the one the game started with. A game bowled all the way with one
     ball is simply that ball. */
  function primaryBall(game) {
    var count = {};
    var best = null;
    walk(game).forEach(function (c) {
      if (c.fresh && c.ball) count[c.ball] = (count[c.ball] || 0) + 1;
    });
    Object.keys(count).forEach(function (id) {
      if (best == null || count[id] > count[best] ||
          (count[id] === count[best] && id === game.ball)) best = id;
    });
    return best || (game && game.ball) || null;
  }

  /* Each time the ball changed: the frame it happened in (1-based), what it
     changed from and to, and whether it was the strike ball or the spare ball. */
  function switches(game) {
    var out = [];
    var last = { strike: null, spare: null };
    walk(game).forEach(function (c) {
      if (!c.ball) return;
      var role = c.fresh ? 'strike' : 'spare';
      if (last[role] && last[role] !== c.ball) {
        out.push({ frame: c.f + 1, shot: c.s + 1, from: last[role], to: c.ball, role: role });
      }
      last[role] = c.ball;
    });
    return out;
  }

  /* The balls a game would carry on with: what the last first ball used (or
     the ball it started with), and the spare ball if there is a different one. */
  function currentBalls(game) {
    var strike = (game && game.ball) || null;
    walk(game).forEach(function (c) { if (c.fresh && c.ball) strike = c.ball; });
    return { strike: strike, spare: (game && game.spareBall) || strike };
  }

  /* ---------- statistics ---------- */

  function ratio(n, d) { return d ? n / d : null; }

  function emptyHit() { return { n: 0, strikes: 0, pins: 0 }; }

  function bucket() {
    return { attempts: 0, made: 0, left: 0, right: 0, unrecorded: 0 };
  }

  /* Matches games against a filter { pattern, location, event, lane, from, to }. */
  function filter(games, f) {
    f = f || {};
    return (games || []).filter(function (g) {
      if (g.deleted) return false;
      if (f.pattern && (g.pattern || '') !== f.pattern) return false;
      if (f.location && (g.location || '') !== f.location) return false;
      if (f.event && (g.event || '') !== f.event) return false;
      if (f.lane && String(g.lane || '') !== String(f.lane)) return false;
      if (f.from && (g.date || '') < f.from) return false;
      if (f.to && (g.date || '') > f.to) return false;
      return true;
    });
  }

  function finished(games) {
    return (games || []).filter(function (g) {
      return !g.deleted && g.status === 'done' && isComplete(g);
    });
  }

  /* Everything worth knowing about a set of games. `opts.ball` narrows the
     shot-level figures to one ball (and the game-level ones to games where
     it was the strike ball). */
  function analyze(games, opts) {
    opts = opts || {};
    var done = finished(games);
    var ballId = opts.ball || null;

    var totals = [];
    var out = {
      games: 0, average: null, high: null, low: null, sd: null,
      over200: 0, over250: 0, clean: 0, opens: 0, opensPerGame: null, switched: 0,
      racks: 0, strikes: 0, strikePct: null, strikesPerGame: null,
      attempts: 0, spares: 0, sparePct: null,
      firstBallAvg: null,
      single: bucket(), cluster: bucket(), split: bucket(),
      makeable: { attempts: 0, made: 0, pct: null }, makeablePct: null,
      splits: 0, splitPct: null,
      hits: {}, hitsRecorded: 0,
      misses: { left: 0, right: 0, total: 0, leftPct: null, rightPct: null },
      leaves: [], byFrame: [],
      bestStreak: 0, streaks3: 0, shots: 0,
      runs: [], runGames: [],
      afterStrike: { n: 0, strikes: 0, pct: null }, afterOther: { n: 0, strikes: 0, pct: null },
    };
    HITS.forEach(function (h) { out.hits[h] = emptyHit(); });
    for (var i = 1; i <= 10; i++) out.byFrame.push({ frame: i, racks: 0, strikes: 0, pct: null });

    var leaves = {};
    var firstPins = 0;

    done.forEach(function (game) {
      var ctx = walk(game);
      var mine = ballId ? ctx.filter(function (c) { return c.ball === ballId; }) : ctx;
      var gameIsMine = !ballId || primaryBall(game) === ballId;
      var opensThisGame = 0;

      mine.forEach(function (c) {
        out.shots++;
        if (c.fresh) {
          out.racks++;
          firstPins += c.knocked;
          var frameStat = out.byFrame[c.f];
          frameStat.racks++;
          if (c.strike) { out.strikes++; frameStat.strikes++; }

          var hit = out.hits[c.shot.hit];
          if (hit) {
            hit.n++;
            hit.pins += c.knocked;
            if (c.strike) hit.strikes++;
            out.hitsRecorded++;
          }

          if (!c.strike && !c.shot.approx) {
            var key = leaveKey(c.standing);
            var row = leaves[key] || (leaves[key] = {
              key: key, label: leaveLabel(c.standing), type: leaveType(c.standing),
              pins: c.standing.length, seen: 0, attempts: 0, made: 0, left: 0, right: 0,
            });
            row.seen++;
            if (c.standing.indexOf(1) === -1 && isSplit(c.standing)) out.splits++;
          }
        } else {
          /* A spare attempt, at the leave that was standing before it. */
          out.attempts++;
          var made = c.standing.length === 0;
          if (made) out.spares++; else { out.opens++; opensThisGame++; }

          var kind = out[leaveType(c.before)];
          kind.attempts++;
          if (made) kind.made++;
          else if (c.shot.miss === 'left') kind.left++;
          else if (c.shot.miss === 'right') kind.right++;
          else kind.unrecorded++;

          var leaveRow = c.shot.approxBefore ? null : leaves[leaveKey(c.before)];
          if (leaveRow) {
            leaveRow.attempts++;
            if (made) leaveRow.made++;
            else if (c.shot.miss === 'left') leaveRow.left++;
            else if (c.shot.miss === 'right') leaveRow.right++;
          }
          if (!made && c.shot.miss) {
            out.misses[c.shot.miss]++;
            out.misses.total++;
          }
        }
      });

      if (gameIsMine) {
        var total = score(game).total;
        totals.push(total);
        if (switches(game).length) out.switched++;
        if (opensThisGame === 0) out.clean++;

        /* Strike streaks run across frames and into the fill balls. */
        var gameRuns = strikeRuns(game);
        var longest = 0;
        gameRuns.forEach(function (r) {
          out.runs.push(r.length);
          if (r.length > longest) longest = r.length;
          if (r.length > out.bestStreak) out.bestStreak = r.length;
          if (r.length >= 3) out.streaks3++;
        });
        out.runGames.push(longest);
        if (ctx.some(function (c) { return c.strike; }) && !gameRuns.length && out.bestStreak < 1) out.bestStreak = 1;

        /* Is a strike likelier right after a strike? Pairs of first balls, in order. */
        var prev = null;
        ctx.forEach(function (c) {
          if (!c.fresh) return;
          if (prev != null) {
            var bucketKey = prev ? out.afterStrike : out.afterOther;
            bucketKey.n++;
            if (c.strike) bucketKey.strikes++;
          }
          prev = c.strike;
        });
      }
    });

    out.games = totals.length;
    if (totals.length) {
      var sum = totals.reduce(function (a, b) { return a + b; }, 0);
      out.average = sum / totals.length;
      out.high = Math.max.apply(null, totals);
      out.low = Math.min.apply(null, totals);
      out.over200 = totals.filter(function (t) { return t >= 200; }).length;
      out.over250 = totals.filter(function (t) { return t >= 250; }).length;
      if (totals.length > 1) {
        out.sd = Math.sqrt(totals.reduce(function (a, t) {
          return a + (t - out.average) * (t - out.average);
        }, 0) / totals.length);
      }
      out.opensPerGame = out.opens / totals.length;
      out.strikesPerGame = out.strikes / totals.length;
    }

    out.afterStrike.pct = ratio(out.afterStrike.strikes, out.afterStrike.n);
    out.afterOther.pct = ratio(out.afterOther.strikes, out.afterOther.n);
    out.strikePct = ratio(out.strikes, out.racks);
    out.sparePct = ratio(out.spares, out.attempts);
    out.firstBallAvg = ratio(firstPins, out.racks);
    out.splitPct = ratio(out.splits, out.racks);
    out.misses.leftPct = ratio(out.misses.left, out.misses.total);
    out.misses.rightPct = ratio(out.misses.right, out.misses.total);
    ['single', 'cluster', 'split'].forEach(function (k) {
      out[k].pct = ratio(out[k].made, out[k].attempts);
    });
    /* Makeable spares: every spare try that was not a split, since splits are
       mostly out of your hands and make the plain spare % look worse than the
       shot-making was. */
    out.makeable.attempts = out.single.attempts + out.cluster.attempts;
    out.makeable.made = out.single.made + out.cluster.made;
    out.makeable.pct = ratio(out.makeable.made, out.makeable.attempts);
    out.makeablePct = out.makeable.pct;
    HITS.forEach(function (h) {
      var hit = out.hits[h];
      hit.pct = ratio(hit.n, out.hitsRecorded);
      hit.strikePct = ratio(hit.strikes, hit.n);
      hit.avgPins = ratio(hit.pins, hit.n);
    });
    out.byFrame.forEach(function (f) { f.pct = ratio(f.strikes, f.racks); });

    out.leaves = Object.keys(leaves).map(function (k) {
      var row = leaves[k];
      row.pct = ratio(row.made, row.attempts);
      return row;
    }).sort(function (a, b) { return b.seen - a.seen || a.pins - b.pins || a.key.localeCompare(b.key); });

    return out;
  }

  /* ---------- grouping ---------- */

  function distinct(games, key) {
    var seen = {};
    (games || []).forEach(function (g) {
      if (g.deleted) return;
      var v = g[key];
      if (v != null && v !== '') seen[String(v)] = true;
    });
    return Object.keys(seen).sort(function (a, b) {
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  /* Balls that actually appear on a shot in these games. */
  function ballsUsed(games) {
    var seen = {};
    finished(games).forEach(function (g) {
      if (g.ball) seen[g.ball] = true;
      if (g.spareBall) seen[g.spareBall] = true;
      walk(g).forEach(function (c) { if (c.ball) seen[c.ball] = true; });
    });
    return Object.keys(seen);
  }

  /* One analysis per value of a dimension: pattern, location, event, lane or
     ball. Rows come back sorted by games bowled, most first. */
  function compare(games, dimension, labelOf) {
    var done = finished(games);
    var rows;
    if (dimension === 'ball') {
      rows = ballsUsed(done).map(function (id) {
        return { key: id, label: labelOf ? labelOf(id) : id, stats: analyze(done, { ball: id }) };
      });
    } else {
      var groups = {};
      done.forEach(function (g) {
        var v = g[dimension];
        var key = v == null || v === '' ? '' : String(v);
        (groups[key] = groups[key] || []).push(g);
      });
      rows = Object.keys(groups).map(function (key) {
        return {
          key: key,
          label: key || 'Not recorded',
          stats: analyze(groups[key]),
        };
      });
    }
    /* Series by the same grouping. A lane changes game to game, so it has none. */
    var sets = setsOf(done);
    rows.forEach(function (row) {
      if (dimension === 'lane') { row.series = null; return; }
      row.series = seriesStats(sets.filter(function (x) {
        return dimension === 'ball'
          ? setBall(x) === row.key
          : String(x.games[0][dimension] == null ? '' : x.games[0][dimension]) === row.key;
      }));
    });
    return rows.sort(function (a, b) {
      return b.stats.games - a.stats.games || String(a.label).localeCompare(String(b.label));
    });
  }

  /* ---------- sets (a series bowled together) ---------- */

  function setBall(set) {
    var count = {};
    var best = null;
    set.games.forEach(function (g) {
      walk(g).forEach(function (c) { if (c.fresh && c.ball) count[c.ball] = (count[c.ball] || 0) + 1; });
    });
    Object.keys(count).forEach(function (id) {
      if (best == null || count[id] > count[best] ||
          (count[id] === count[best] && id === set.games[0].ball)) best = id;
    });
    return best || set.games[0].ball || null;
  }

  /* ---------- trailing weeks ---------- */

  function dayNumber(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null;
  }
  function isoOf(day) {
    var d = new Date(day * 86400000);
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }

  /* The last `weeks` weeks (Monday to Sunday, ending with the one that holds
     `today`), oldest first, each with the per-game averages that week. A week
     with no games has nulls. `window` is the same figures over all of it, which
     is what each week is compared with. */
  function weekly(games, opts) {
    opts = opts || {};
    var count = opts.weeks || 12;
    var today = dayNumber(opts.today || new Date().toISOString().slice(0, 10));
    var monday = today - ((today + 3) % 7);          /* 1970-01-01 was a Thursday */
    var first = monday - (count - 1) * 7;
    var pool = finished(games);
    var rows = [];
    for (var i = 0; i < count; i++) {
      rows.push({ start: isoOf(first + i * 7), games: [] });
    }
    var inside = [];
    pool.forEach(function (g) {
      var d = dayNumber(g.date);
      if (d == null || d < first || d >= monday + 7) return;
      rows[Math.floor((d - first) / 7)].games.push(g);
      inside.push(g);
    });
    function figures(list) {
      if (!list.length) return { games: 0, average: null, strikesPerGame: null, makeablePerGame: null };
      var a = analyze(list);
      return { games: a.games, average: a.average, strikesPerGame: a.strikesPerGame, makeablePerGame: a.makeable.made / a.games };
    }
    return {
      weeks: rows.map(function (r) { var f = figures(r.games); f.start = r.start; return f; }),
      window: figures(inside),
    };
  }

  /* ---------- strike streaks and badges ---------- */

  /* Every run of two or more strikes in a row, fill balls included: how long, and
     which shots (frame index and shot number) made it up. */
  function strikeRuns(game) {
    var runs = [], run = null;
    walk(game).forEach(function (c) {
      if (!c.fresh) return;
      if (c.strike) {
        if (!run) run = { length: 0, strikes: [] };
        run.length++;
        run.strikes.push({ f: c.f, s: c.s });
      } else {
        if (run && run.length >= 2) runs.push(run);
        run = null;
      }
    });
    if (run && run.length >= 2) runs.push(run);
    return runs;
  }

  /* Frames inside a hot streak (three or more in a row), each with how hot it
     is: 0..1, rising along the run so the card warms up as it goes. */
  function heatFrames(game) {
    var out = {};
    strikeRuns(game).filter(function (r) { return r.length >= 3; }).forEach(function (r) {
      r.strikes.forEach(function (x, i) {
        var heat = (i + 1) / r.length;
        if (!out[x.f] || out[x.f].heat < heat) {
          out[x.f] = { heat: heat, first: i === 0 || (out[x.f] && out[x.f].first) || false, length: r.length };
        }
      });
    });
    return out;
  }

  /* The little pictures for badges, as 24x24 paths, shared by the page and the
     shareable card so they match. */
  var ART = {
    flame: 'M12 1.5C12.4 5 15.4 6.6 16.6 9.6C17.5 8.9 18 7.8 18.1 6.9C20.2 9.2 21.2 11.7 21.2 14.2C21.2 18.9 17 22.5 12 22.5C7 22.5 2.8 18.9 2.8 14.2C2.8 11.3 4.2 9.1 6 7.5C6.1 9 6.9 10.2 8 10.9C7.5 7.2 9.4 3.6 12 1.5Z',
    flameCore: 'M12 22C9.4 22 7.5 20.2 7.5 17.8C7.5 15.9 8.7 14.6 9.7 13.4C10.3 14.5 11 15 11.8 15.1C11.9 13.9 11.7 12.8 11.4 11.7C13.8 13.1 16.5 15.1 16.5 17.8C16.5 20.2 14.6 22 12 22Z',
    check: 'M6 12.8L10.4 17.2L18.2 8.2',
  };

  var RUN_NAMES = { 3: 'Turkey', 4: 'Hambone', 5: 'Five-bagger', 6: 'Six-pack' };
  function runName(n) {
    if (n >= 12) return 'Perfect game';
    return RUN_NAMES[n] || n + ' in a row';
  }

  /* What a game earned: a hot streak (3+ strikes in a row, named for the longest),
     and a clean game (finished with no open frame). */
  function badges(game) {
    var out = [];
    var runs = strikeRuns(game).filter(function (r) { return r.length >= 3; });
    if (runs.length) {
      var longest = Math.max.apply(null, runs.map(function (r) { return r.length; }));
      out.push({
        key: 'hot', length: longest, count: runs.length, level: longest >= 6 ? 3 : longest >= 4 ? 2 : 1,
        label: runName(longest),
        title: runName(longest) + (runs.length > 1 ? ' (' + runs.length + ' hot streaks: ' + runs.map(function (r) { return r.length; }).join(', ') + ')' : ''),
      });
    }
    if (isComplete(game) && !walk(game).some(function (c) { return !c.fresh && c.standing.length > 0; })) {
      out.push({ key: 'clean', label: 'Clean game', title: 'Clean game: no open frames' });
    }
    return out;
  }

  /* The streak table for a set of games: for each length of run that happened,
     how many times, how many times that long or longer, how many games had one,
     and how often (one game in N). */
  function streakTable(stats) {
    var lengths = {};
    stats.runs.forEach(function (n) { lengths[n] = (lengths[n] || 0) + 1; });
    var present = Object.keys(lengths).map(Number).sort(function (a, b) { return a - b; });
    return present.map(function (n) {
      var atLeast = stats.runs.filter(function (r) { return r >= n; }).length;
      var games = stats.runGames.filter(function (g) { return g >= n; }).length;
      return { length: n, name: n >= 3 ? runName(n) : 'Back-to-back', times: lengths[n], atLeast: atLeast, games: games,
        oneIn: games ? stats.games / games : null, perGame: stats.games ? atLeast / stats.games : null };
    });
  }

  /* ---------- tidying ---------- */

  /* Games dated differently from the first game of their set. A set is one night,
     so the first game's date is the one the rest should have. (An old bug gave
     the later games of a set today's date.) Returns { game, setId, gameNo, from, to }. */
  function dateMismatches(games) {
    var out = [];
    setsOf(games, { all: true }).forEach(function (set) {
      if (set.standalone || set.games.length < 2) return;
      var first = set.games[0];
      if (!first.date) return;
      set.games.slice(1).forEach(function (g) {
        if (g.date && g.date !== first.date) out.push({ game: g, setId: set.id, gameNo: g.gameNo, from: g.date, to: first.date });
      });
    });
    return out;
  }

  /* ---------- editing a set ---------- */

  function inOrder(games) {
    return games.slice().sort(function (a, b) {
      return (a.gameNo || 0) - (b.gameNo || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
  }

  /* Games 1..n in their current order. Returns copies of just the games whose
     number had to change. */
  function renumber(games) {
    var out = [];
    inOrder(games.filter(function (g) { return !g.deleted; })).forEach(function (g, i) {
      if (g.gameNo !== i + 1) { var c = copy(g); c.gameNo = i + 1; out.push(c); }
    });
    return out;
  }

  /* Takes one game out of its series: it stays as a single game and the rest
     close up. Returns every game that changed. `setGames` is the whole set. */
  function leaveSet(setGames, id) {
    var left = setGames.filter(function (g) { return g.id === id; })[0];
    if (!left) return [];
    var gone = copy(left);
    gone.setId = null; gone.gameNo = null; gone.setSize = null;
    return [gone].concat(renumber(setGames.filter(function (g) { return g.id !== id; })));
  }

  /* Deletes one game of a series and closes the gap. */
  function dropFromSet(setGames, id) {
    var left = setGames.filter(function (g) { return g.id === id; })[0];
    if (!left) return [];
    var gone = copy(left);
    gone.deleted = true;
    return [gone].concat(renumber(setGames.filter(function (g) { return g.id !== id; })));
  }

  /* Puts a game into a series as its next game. A full series grows by one. */
  function joinSet(setGames, game) {
    var live = setGames.filter(function (g) { return !g.deleted && g.id !== game.id; });
    var next = copy(game);
    next.setId = live[0].setId;
    next.gameNo = live.length + 1;
    next.setSize = Math.max(Number(live[0].setSize) || 3, live.length + 1);
    var others = live.filter(function (g) { return Number(g.setSize) !== next.setSize; }).map(function (g) {
      var c = copy(g); c.setSize = next.setSize; return c;
    });
    return [next].concat(others);
  }

  /* Changes how many games the series is meant to have. */
  function resizeSet(setGames, size) {
    var live = setGames.filter(function (g) { return !g.deleted; });
    size = Number(size);
    if (!(size >= live.length && size >= 1)) throw new Error('The series already has ' + live.length + ' games.');
    return live.filter(function (g) { return Number(g.setSize) !== size; }).map(function (g) {
      var c = copy(g); c.setSize = size; return c;
    });
  }

  /* Games bowled together, in order. For statistics only finished games count
     and a game with no set is left out; with { all: true } (for the list)
     everything appears, a game with no set standing alone. */
  function setsOf(games, opts) {
    var all = !!(opts && opts.all);
    var pool = all ? (games || []).filter(function (g) { return !g.deleted; }) : finished(games);
    var by = {};
    var order = [];
    pool.forEach(function (g) {
      var id = g.setId || (all ? g.id : null);
      if (!id) return;
      if (!by[id]) { by[id] = []; order.push(id); }
      by[id].push(g);
    });
    var sets = order.map(function (id) {
      var gs = by[id].sort(function (a, b) {
        return (a.gameNo || 0) - (b.gameNo || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
      });
      var done = gs.filter(function (g) { return g.status === 'done' && isComplete(g); });
      var totals = done.map(function (g) { return score(g).total; });
      var total = totals.reduce(function (a, b) { return a + b; }, 0);
      var standalone = !gs[0].setId;
      var size = standalone ? 1 : Math.max(1, Number(gs[0].setSize) || 3);
      return {
        id: id, standalone: standalone, date: gs[0].date, games: gs, size: size,
        totals: totals, total: total, average: totals.length ? total / totals.length : null,
        finished: done.length, complete: done.length >= size && done.length === gs.length,
        pattern: gs[0].pattern, location: gs[0].location, event: gs[0].event,
      };
    });
    return sets.sort(function (a, b) {
      return String(a.date || '').localeCompare(String(b.date || '')) ||
        String(a.games[0].createdAt || '').localeCompare(String(b.games[0].createdAt || ''));
    });
  }

  /* Series figures over finished sets. A series is only counted once every game
     in it is bowled, so a half-finished night never drags an average down. */
  function seriesStats(sets) {
    var done = (sets || []).filter(function (x) { return !x.standalone && x.complete; });
    var out = {
      count: done.length, average: null, perGame: null, high: null, low: null,
      over600: 0, over700: 0, spread: null, slots: [], fade: null, sets: done,
    };
    var slotGames = {};
    (sets || []).filter(function (x) { return !x.standalone; }).forEach(function (x) {
      x.games.forEach(function (g, i) {
        if (g.status === 'done' && isComplete(g)) (slotGames[i + 1] = slotGames[i + 1] || []).push(g);
      });
    });
    out.slots = Object.keys(slotGames).map(Number).sort(function (a, b) { return a - b; }).map(function (n) {
      var a = analyze(slotGames[n]);
      return { slot: n, games: a.games, average: a.average, high: a.high, strikePct: a.strikePct, sparePct: a.sparePct };
    });
    if (!done.length) return out;
    var totals = done.map(function (x) { return x.total; });
    out.average = totals.reduce(function (a, b) { return a + b; }, 0) / totals.length;
    out.high = Math.max.apply(null, totals);
    out.low = Math.min.apply(null, totals);
    var gamesTotal = done.reduce(function (a, x) { return a + x.totals.length; }, 0);
    out.perGame = done.reduce(function (a, x) { return a + x.total; }, 0) / gamesTotal;
    /* Scaled to the set's length, so 600 and 700 mean 200 and 233 a game. */
    out.over600 = done.filter(function (x) { return x.total >= x.size * 200; }).length;
    out.over700 = done.filter(function (x) { return x.total >= Math.ceil(x.size * 700 / 3); }).length;
    out.spread = done.reduce(function (a, x) {
      return a + (Math.max.apply(null, x.totals) - Math.min.apply(null, x.totals));
    }, 0) / done.length;
    /* Last game of the set against the first: positive means you finish stronger. */
    out.fade = done.reduce(function (a, x) { return a + (x.totals[x.totals.length - 1] - x.totals[0]); }, 0) / done.length;
    return out;
  }

  /* ---------- small helpers ---------- */

  function newGame(meta) {
    var now = new Date().toISOString();
    meta = meta || {};
    return {
      id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      date: meta.date || now.slice(0, 10),
      location: meta.location || '',
      pattern: meta.pattern || '',
      event: EVENTS.indexOf(meta.event) === -1 ? 'practice' : meta.event,
      lane: meta.lane == null ? '' : String(meta.lane),
      setId: meta.setId || null,
      gameNo: meta.setId ? (Number(meta.gameNo) || 1) : null,
      setSize: meta.setId ? (Number(meta.setSize) || 3) : null,
      ball: meta.ball || null,
      spareBall: meta.spareBall || null,
      notes: meta.notes || '',
      status: 'open',
      frames: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  function describeShot(pos, standing) {
    var pins = cleanPins(standing);
    var knocked = pos.before.length - pins.length;
    if (!pins.length) return pos.fresh ? 'Strike' : 'Spare';
    var base = knocked === 0 ? 'Miss' : knocked + (knocked === 1 ? ' pin' : ' pins');
    return pos.fresh ? base + ' · ' + leaveLabel(pins) : base + ' · ' + pins.join('-') + ' left';
  }

  var api = {
    HITS: HITS, HIT_LABELS: HIT_LABELS, MISSES: MISSES, EVENTS: EVENTS,
    ALL: ALL, DECK: DECK,
    cleanPins: cleanPins, leaveKey: leaveKey, leaveLabel: leaveLabel, leaveType: leaveType,
    isSplit: isSplit,
    walk: walk, position: position, isComplete: isComplete, frameDone: frameDone,
    addShot: addShot, undo: undo, replaceBall: replaceBall, truncate: truncate, replaceFrame: replaceFrame, newGame: newGame,
    score: score, analyze: analyze, compare: compare, filter: filter,
    distinct: distinct, finished: finished, ballsUsed: ballsUsed, describeShot: describeShot,
    ballsInGame: ballsInGame, primaryBall: primaryBall, switches: switches, currentBalls: currentBalls,
    setsOf: setsOf, seriesStats: seriesStats, setBall: setBall,
    weekly: weekly, dateMismatches: dateMismatches, ART: ART, strikeRuns: strikeRuns, heatFrames: heatFrames, badges: badges, streakTable: streakTable, runName: runName, renumber: renumber, leaveSet: leaveSet, dropFromSet: dropFromSet, joinSet: joinSet, resizeSet: resizeSet,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.Shots = api;
})();
