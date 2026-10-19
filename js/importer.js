/*
 * Importing games from a file.
 *
 * The file is JSON, written by hand or by a script from a scorecard picture
 * (for example a LaneTalk export). Each game is ten frames; a frame is the
 * pins still standing after each ball, so everything the tracker derives
 * (scores, strikes, spares, leaves, splits) comes out the same as if the game
 * had been bowled in the app.
 *
 *   {
 *     "format": "leaguecraft-games", "version": 1,
 *     "sets": [{
 *       "key": "2026-10-12",                 // names the night, so importing twice is safe
 *       "date": "2026-10-12", "location": "Leisure Time Bowling",
 *       "pattern": "House", "event": "league", "lane": "23",   // all optional; event defaults to practice
 *       "ball": "Motiv Supra Sport",
 *       "games": [
 *         { "warmup": true },                // skipped, not counted
 *         { "total": 166,
 *           "frames": ["10 .", "1-2-8-10 10", ".", ...] }
 *       ]
 *     }]
 *   }
 *
 * A frame is its balls separated by spaces. A ball is the pins left standing
 * after it: "." for none (a strike or a spare), "10", "7-10", "4-5-7". "?2"
 * means two pins were left but which ones is unknown; it counts for the score
 * but not for the leave statistics. Outside the last ball of a frame only "?1"
 * is allowed, because one pin left is a single-pin spare whichever pin it is.
 * (A game with no pin pictures, only the marks, can still be written down this
 * way: "9 /" is "?1 .", and a miss of everything is all ten pins.)
 * A strike in frames 1-9 is just ".". The tenth frame lists every ball.
 *
 * "total" and the optional "scores" (the ten running totals) are checked
 * against the score worked out from the pins, so a misread frame is caught.
 */
(function () {
  'use strict';

  var S = typeof module === 'object' && module.exports ? require('./shots.js') : window.Shots;

  var FORMAT = 'leaguecraft-games';
  var PLACEHOLDER = [10, 6, 3, 9, 5, 2, 8, 4, 1, 7];

  function norm(name) { return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase(); }

  /* One ball of a frame: "." | "7-10" | "?2". */
  function parseShot(token, before) {
    var t = String(token).trim();
    if (t === '.' || t === '0' || t.toLowerCase() === 'x') return { standing: [] };
    var unknown = /^\?(\d+)$/.exec(t);
    if (unknown) {
      var n = Number(unknown[1]);
      var pool = PLACEHOLDER.filter(function (p) { return before.indexOf(p) !== -1; });
      if (n < 1 || n > pool.length) throw new Error('"' + t + '" does not fit the pins that were up.');
      return { standing: pool.slice(0, n).sort(function (a, b) { return a - b; }), approx: true };
    }
    if (!/^\d+(-\d+)*$/.test(t)) throw new Error('"' + t + '" is not a ball. Use "." for none, pins like "7-10", or "?2".');
    var pins = t.split('-').map(Number);
    pins.forEach(function (p) { if (p < 1 || p > 10) throw new Error('There is no pin ' + p + '.'); });
    return { standing: pins };
  }

  /* Plays a game's frames through the engine, throwing a plain-English error on the first problem. */
  function buildGame(meta, frames) {
    var g = S.newGame(meta);
    if (!Array.isArray(frames) || !frames.length) throw new Error('No frames.');
    frames.forEach(function (frame, f) {
      var tokens = Array.isArray(frame) ? frame : String(frame).trim().split(/\s+/);
      if (!tokens.length || (tokens.length === 1 && tokens[0] === '')) throw new Error('Frame ' + (f + 1) + ' is empty.');
      tokens.forEach(function (token, i) {
        var pos = S.position(g);
        if (!pos) throw new Error('Frame ' + (f + 1) + ' has more balls than the game allows.');
        if (pos.frame !== f) throw new Error('Frame ' + (f + 1) + ' has too few balls (the frame before it is not finished).');
        var shot = parseShot(token, pos.before);
        try {
          g = S.addShot(g, Object.assign({ ball: meta.ball }, shot));
        } catch (e) { throw new Error('Frame ' + (f + 1) + ', ball ' + (i + 1) + ': ' + e.message); }
        /* An unknown leave of two or more pins would hide whether it was a split, so it can only end a frame. */
        if (shot.approx && shot.standing.length > 1) {
          var after = S.position(g);
          if (after && after.frame === f && !after.fresh) throw new Error('Frame ' + (f + 1) + ': "?' + shot.standing.length + '" can only be used on the last ball of a frame. Only "?1" can come before another ball.');
        }
      });
      var next = S.position(g);
      if (next && next.frame === f) throw new Error('Frame ' + (f + 1) + ' has too few balls.');
    });
    if (S.position(g)) throw new Error('The game has ' + g.frames.length + ' frames; it needs ten.');
    return g;
  }

  /*
   * text: the file's contents. opts:
   *   balls: [{ id, name }]            the arsenal as it is now
   *   existingKeys: [..]               importKeys already in the vault
 *   replace: true                    games already imported are replaced instead of skipped
   *   makeId(prefix)                   makes ids for new balls, sets and games
   * Returns { errors, warnings, sets, games, newBalls, duplicates }. If errors
   * is not empty nothing should be imported.
   */
  function parse(text, opts) {
    opts = opts || {};
    var makeId = opts.makeId || function (p) { return p + Math.random().toString(36).slice(2, 9); };
    var out = { errors: [], warnings: [], sets: [], games: [], newBalls: [], duplicates: [] };
    var data;
    try { data = JSON.parse(text); } catch (e) {
      out.errors.push('This is not a valid file: ' + e.message.replace(/^JSON\.parse: /, ''));
      return out;
    }
    if (data.format !== FORMAT) { out.errors.push('This is not a LeagueCraft games file (format should be "' + FORMAT + '").'); return out; }
    if (data.version !== 1) { out.errors.push('This file is version ' + data.version + '; this app reads version 1.'); return out; }
    if (!Array.isArray(data.sets) || !data.sets.length) { out.errors.push('The file has no sets.'); return out; }

    var known = {}, names = {};
    (opts.balls || []).forEach(function (b) { if (!b.deleted) { known[norm(b.name)] = b.id; names[b.id] = b.name; } });
    var aliases = opts.aliases || {};
    var defaults = opts.defaults || {};
    out.replacing = 0;
    out.ballMap = [];
    out.missing = { location: false, pattern: false, event: false, lane: false };
    var seenKeys = {};
    (opts.existingKeys || []).forEach(function (k) { seenKeys[k] = 'vault'; });

    /* A ball by name: the one chosen for it, the same name, a name that contains it
       or is contained by it (when only one does), or a new ball. */
    var resolved = {};
    function ballId(name) {
      var key = norm(name);
      if (!key) return null;
      if (resolved[key]) return resolved[key];
      var id, how, match = null;
      if (aliases[key] && aliases[key] !== 'new' && names[aliases[key]]) { id = aliases[key]; how = 'chosen'; match = names[id]; }
      else if (aliases[key] === 'new') { how = 'new'; }
      else if (known[key]) { id = known[key]; how = 'same'; match = names[id]; }
      else {
        var close = Object.keys(known).filter(function (k) { return k.indexOf(key) !== -1 || key.indexOf(k) !== -1; });
        if (close.length === 1) { id = known[close[0]]; how = 'close'; match = names[id]; }
      }
      if (!id) {
        id = makeId('b');
        out.newBalls.push({ id: id, name: String(name).trim().replace(/\s+/g, ' ') });
        how = how || 'new';
      }
      resolved[key] = id;
      out.ballMap.push({ name: String(name).trim(), key: key, id: id, how: how, match: match });
      return id;
    }

    data.sets.forEach(function (set, si) {
      var where = 'Set ' + (si + 1) + (set.date ? ' (' + set.date + ')' : '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(set.date || ''))) { out.errors.push(where + ': date must look like 2026-10-12.'); return; }
      if (!Array.isArray(set.games) || !set.games.length) { out.errors.push(where + ': no games.'); return; }
      /* A night with no event is practice unless the importer was told otherwise: league and tournament should be a decision. */
      if (!set.event) out.missing.event = true;
      if (set.location == null || set.location === '') out.missing.location = true;
      if (set.pattern == null || set.pattern === '') out.missing.pattern = true;
      if (set.lane == null || set.lane === '') out.missing.lane = true;
      var event = set.event || defaults.event || 'practice';
      var location = set.location != null && set.location !== '' ? set.location : (defaults.location || '');
      var pattern = set.pattern != null && set.pattern !== '' ? set.pattern : (defaults.pattern || '');
      var lane = set.lane != null && set.lane !== '' ? set.lane : (defaults.lane || '');
      if (S.EVENTS.indexOf(event) === -1) { out.errors.push(where + ': event must be one of ' + S.EVENTS.join(', ') + '.'); return; }

      var played = set.games.filter(function (g) { return !g.warmup; });
      if (!played.length) { out.warnings.push(where + ': only warm-up games, nothing to import.'); return; }
      var key = String(set.key || set.date + '#' + (si + 1));
      var setId = null;
      var size = played.length;
      var entry = { key: key, date: set.date, games: [], location: location, pattern: pattern, event: event, duplicate: false };

      played.forEach(function (g, gi) {
        var label = where + ', game ' + (set.games.indexOf(g) + 1);   /* as numbered in the file, warm-up included */
        var importKey = key + '/' + (gi + 1);
        if (seenKeys[importKey] === 'vault' && opts.replace) {
          out.replacing++;                    /* a corrected file: these take the place of the games imported before */
        } else if (seenKeys[importKey]) {
          entry.duplicate = true;
          out.duplicates.push(importKey);
          return;
        }
        seenKeys[importKey] = 'file';
        var ball = ballId(g.ball || set.ball);
        if (!ball) { out.errors.push(label + ': which ball? Put a "ball" on the set or the game.'); return; }
        var game;
        try {
          game = buildGame({
            date: set.date, location: location, pattern: pattern, event: event, lane: lane,
            ball: ball, spareBall: null, notes: g.notes || set.notes || '',
            setId: size > 1 ? (setId = 'imp_' + key.replace(/[^A-Za-z0-9_-]+/g, '-')) : null, gameNo: gi + 1, setSize: size,
          }, g.frames);
        } catch (e) { out.errors.push(label + ': ' + e.message); return; }

        var score = S.score(game);
        if (g.total != null && score.total !== Number(g.total)) {
          out.errors.push(label + ': the pins add up to ' + score.total + ' but the file says ' + g.total + '. A frame is probably misread.');
          return;
        }
        if (Array.isArray(g.scores)) {
          for (var f = 0; f < 10; f++) {
            var want = g.scores[f];
            var have = score.frames[f] && score.frames[f].total;
            if (want != null && have !== want) { out.errors.push(label + ': running total after frame ' + (f + 1) + ' is ' + have + ' but the file says ' + want + '.'); return; }
          }
        }
        if (g.total == null && !Array.isArray(g.scores)) out.warnings.push(label + ': no total to check the pins against.');

        game.status = 'done';
        game.importKey = importKey;
        /* Created in order, a minute apart, so a set lists its games in the order bowled. */
        game.createdAt = set.date + 'T19:' + ('0' + Math.min(59, gi * 3)).slice(-2) + ':00.000Z';
        game.updatedAt = game.createdAt;
        entry.games.push({ gameNo: gi + 1, total: score.total, importKey: importKey, ball: g.ball || set.ball });
        out.games.push(game);
      });
      out.sets.push(entry);
    });

    return out;
  }

  /* A small file that shows the shape: a perfect game and one with a spare in every frame. */
  var EXAMPLE = JSON.stringify({
    format: FORMAT, version: 1,
    sets: [{
      key: '2026-10-13', date: '2026-10-13', location: 'Leisure Time Bowling', pattern: 'House', event: 'league', lane: '23',
      ball: 'Storm Bionic',
      games: [
        { warmup: true },
        { total: 300, frames: ['.', '.', '.', '.', '.', '.', '.', '.', '.', '. . .'] },
        { total: 191, frames: ['10 .', '10 .', '10 .', '10 .', '10 .', '10 .', '10 .', '10 .', '10 .', '10 . .'] },
      ],
    }],
  }, null, 2);

  var api = { parse: parse, buildGame: buildGame, parseShot: parseShot, FORMAT: FORMAT, EXAMPLE: EXAMPLE };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else window.Importer = api;
})();
