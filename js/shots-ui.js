/*
 * The private shot tracker's pages, mounted by app.js at #/shots.
 *
 * Nothing here is linked from the public site. Games live in the encrypted
 * vault (vault.js); this file only draws them and edits them through
 * Vault.commit, so every shot is saved on the device the moment it is entered.
 */
(function () {
  'use strict';

  var el = UI.el;
  var S = window.Shots;
  var NEW = '__new';

  var ui = {
    root: null, parts: [], token: 0,
    draft: null, picks: {},
    filters: { pattern: '', location: '', event: '', ball: '', period: 'all' },
    compareBy: 'ball', compareState: { key: 'games', dir: 'desc' },
    gamesState: { key: 'date', dir: 'desc' },
    editingBall: null, allLeaves: false, panel: null, game: null,
    status: '', syncing: false,
  };

  var vault = null;
  function getVault() {
    if (!vault) {
      vault = Vault.create({ storage: Vault.browserStorage(), keystore: Vault.browserKeystore() });
    }
    return vault;
  }

  /* ---------- small helpers ---------- */

  function now() { return new Date().toISOString(); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function pct(v) { return v == null ? '—' : Math.round(v * 100) + '%'; }
  function pct1(v) { return v == null ? '—' : (v * 100).toFixed(1) + '%'; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

  function library() { return getVault().library() || { balls: [], games: [] }; }
  function allGames() { return library().games.filter(function (g) { return !g.deleted; }); }
  function allBalls() { return library().balls.filter(function (b) { return !b.deleted; }); }
  function activeBalls() { return allBalls().filter(function (b) { return !b.retired; }); }
  function ballName(id) {
    var b = library().balls.filter(function (x) { return x.id === id; })[0];
    return b ? b.name : (id ? 'Unknown ball' : '—');
  }
  function gameById(id) { return allGames().filter(function (g) { return g.id === id; })[0] || null; }

  function draw(children) {
    UI.clear(ui.root);
    UI.append(ui.root, children.filter(Boolean));
  }

  function head(title, subtitle) {
    return el('div', { class: 'page-head' }, [
      el('h1', { text: title }),
      subtitle ? el('p', { text: subtitle }) : null,
    ]);
  }

  function subnav(active) {
    function link(key, href, text) {
      return el('a', { href: href, 'aria-current': active === key ? 'page' : null }, text);
    }
    return el('nav', { class: 'tabs', 'aria-label': 'Shot tracker sections' }, [
      link('games', '#/shots', 'Games'),
      link('stats', '#/shots/stats', 'Stats'),
      link('balls', '#/shots/balls', 'Balls'),
      link('settings', '#/shots/settings', 'Settings'),
    ]);
  }

  function field(label, control, hint) {
    return el('label', { class: 'sh-field' }, [
      el('span', { class: 'sh-label', text: label }),
      control,
      hint ? el('span', { class: 'sh-hint', text: hint }) : null,
    ]);
  }

  function button(text, onclick, kind, attrs) {
    return el('button', Object.assign({
      type: 'button', class: 'sh-btn' + (kind ? ' is-' + kind : ''), onclick: onclick,
    }, attrs || {}), text);
  }

  function datalist(id, values) {
    return el('datalist', { id: id }, values.map(function (v) { return el('option', { value: v }); }));
  }

  function errorLine() { return el('p', { class: 'sh-error', role: 'alert', hidden: true }); }
  function showError(node, message) {
    node.textContent = message || '';
    node.hidden = !message;
  }

  function rerender() { mount(ui.root, ui.parts); }

  /* ---------- entry point ---------- */

  function mount(root, parts) {
    ui.root = root;
    ui.parts = parts || [];
    var token = ++ui.token;
    var v = getVault();
    if (v.isUnlocked()) return route(token);

    draw([head('Shot tracker'), UI.card(null, null, el('p', { class: 'sh-note', text: 'Opening…' }))]);
    v.unlockRemembered().then(function (opened) {
      if (token !== ui.token) return;
      if (opened) { route(token); backgroundSync(); } else lockScreen(token);
    }, function () { if (token === ui.token) lockScreen(token); });
  }

  function route(token) {
    if (token !== ui.token) return;
    var p = ui.parts;
    var page = p[0] || 'games';
    if (page === 'games') return gamesPage();
    if (page === 'new') return newGamePage();
    if (page === 'game') return gamePage(p[1]);
    if (page === 'stats') return statsPage();
    if (page === 'balls') return ballsPage();
    if (page === 'settings') return settingsPage();
    draw([head('Not found'), UI.card(null, null, el('p', { class: 'sh-note' }, [
      'There is no such page. ', el('a', { href: '#/shots', text: 'Back to games' }), '.',
    ]))]);
  }

  /* Pull in changes from other devices and push this one's, quietly. */
  function backgroundSync() {
    var v = getVault();
    if (ui.syncing || !v.isUnlocked()) return Promise.resolve();
    ui.syncing = true;
    return v.sync().then(function () {
      ui.status = '';
    }, function (e) {
      ui.status = e.message;
    }).then(function () {
      ui.syncing = false;
      var page = ui.parts[0] || 'games';
      var open = page === 'game' && gameById(ui.parts[1]) && gameById(ui.parts[1]).status === 'open';
      if (!open && getVault().isUnlocked() && page !== 'settings') rerender();
    });
  }

  /* ---------- lock screen ---------- */

  function lockScreen(token) {
    var v = getVault();
    draw([head('Shot tracker', 'Private'), UI.card(null, null, el('p', { class: 'sh-note', text: 'Looking for your vault…' }))]);
    v.probe().then(function (found) {
      if (token !== ui.token) return;
      var mode = found.remote || found.local ? 'unlock' : (found.reachable ? 'setup' : 'offline');
      draw([head('Shot tracker', 'Private'), mode === 'setup' ? setupCard() : mode === 'offline' ? offlineCard() : unlockCard(found)]);
    }, function (e) {
      if (token !== ui.token) return;
      draw([head('Shot tracker', 'Private'), UI.card(null, null, el('p', { class: 'sh-error', text: e.message }))]);
    });
  }

  function offlineCard() {
    return UI.card('No connection', null, el('div', { class: 'card-body' }, [
      el('p', { class: 'sh-note', text: 'This device has no saved copy of your vault yet, and GitHub cannot be reached. Try again with a connection.' }),
      button('Try again', rerender, 'primary'),
    ]));
  }

  function unlockCard(found) {
    var pass = el('input', { type: 'password', autocomplete: 'current-password', autocapitalize: 'off', required: true });
    var remember = el('input', { type: 'checkbox', checked: true });
    var err = errorLine();
    var go = el('button', { type: 'submit', class: 'sh-btn is-primary', text: 'Unlock' });
    var form = el('form', {
      class: 'sh-form',
      onsubmit: function (e) {
        e.preventDefault();
        showError(err, '');
        go.disabled = true;
        go.textContent = 'Unlocking…';
        getVault().unlock(pass.value).then(function () {
          return remember.checked ? getVault().remember(30) : getVault().forget();
        }).then(function () {
          pass.value = '';
          route(ui.token);
          backgroundSync();
        }).catch(function (ex) {
          go.disabled = false;
          go.textContent = 'Unlock';
          showError(err, ex.message);
        });
      },
    }, [
      field('Passphrase', pass),
      el('label', { class: 'sh-check' }, [remember, el('span', { text: 'Stay unlocked on this device for 30 days' })]),
      err, go,
    ]);
    var where = found.remote ? 'Your encrypted vault is on GitHub.' : 'Using the copy saved on this device.';
    return UI.card('Unlock', null, el('div', { class: 'card-body' }, [
      el('p', { class: 'sh-note', text: where + ' Only your passphrase can open it.' }), form,
    ]));
  }

  function setupCard() {
    var one = el('input', { type: 'password', autocomplete: 'new-password', autocapitalize: 'off', required: true, minlength: Vault.MIN_PASSPHRASE });
    var two = el('input', { type: 'password', autocomplete: 'new-password', autocapitalize: 'off', required: true });
    var err = errorLine();
    var go = el('button', { type: 'submit', class: 'sh-btn is-primary', text: 'Create my vault' });
    var form = el('form', {
      class: 'sh-form',
      onsubmit: function (e) {
        e.preventDefault();
        showError(err, '');
        if (one.value !== two.value) return showError(err, 'The two passphrases do not match.');
        go.disabled = true;
        go.textContent = 'Creating…';
        getVault().setup(one.value).then(function () {
          return getVault().remember(30);
        }).then(function () {
          one.value = two.value = '';
          location.hash = '#/shots/settings';
          rerender();
        }).catch(function (ex) {
          go.disabled = false;
          go.textContent = 'Create my vault';
          showError(err, ex.message);
        });
      },
    }, [
      field('Choose a passphrase', one, 'At least ' + Vault.MIN_PASSPHRASE + ' characters. Four unrelated words works well. There is no reset: if it is lost, the data cannot be recovered.'),
      field('Type it again', two),
      err, go,
    ]);
    return UI.card('Set up your private shot tracker', null, el('div', { class: 'card-body' }, [
      el('p', { class: 'sh-note', text: 'Your shots are encrypted on this device with your passphrase before anything is stored. The site is public, but the data it holds is unreadable without the passphrase.' }),
      form,
    ]));
  }

  /* ---------- games ---------- */

  function syncLine() {
    var v = getVault();
    var bits = [];
    if (v.info.dirty) bits.push('Some games are only on this device so far.');
    else if (v.info.lastSync) bits.push('Synced at ' + new Date(v.info.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '.');
    if (ui.status) bits.push(ui.status);
    return bits.join(' ');
  }

  function gamesPage() {
    var games = allGames().slice().sort(function (a, b) {
      return (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || '');
    });
    var open = games.filter(function (g) { return g.status === 'open'; })[0];
    var done = games.filter(function (g) { return g.status === 'done'; });

    var top = [];
    if (open) {
      var pos = S.position(open);
      top.push(el('div', { class: 'sh-resume' }, [
        el('div', null, [
          el('strong', { text: 'Game in progress' }),
          el('span', { text: ' · ' + (pos ? 'frame ' + (pos.frame + 1) : 'ready to save') + ' · ' + UI.shortDate(open.date) }),
        ]),
        el('a', { class: 'sh-btn is-primary', href: '#/shots/game/' + open.id, text: 'Resume' }),
      ]));
    }
    top.push(el('div', { class: 'sh-actions' }, [
      el('a', { class: 'sh-btn ' + (open ? '' : 'is-primary'), href: '#/shots/new', text: 'Start a game' }),
      button('Sync now', function () {
        ui.status = '';
        backgroundSync();
      }),
    ]));
    var line = syncLine();
    if (line) top.push(el('p', { class: 'sh-note', text: line }));

    var rows = done.map(function (g) {
      var s = S.analyze([g]);
      return { name: g.date || '', game: g, total: S.score(g).total, stats: s };
    });
    var columns = [
      { key: 'date', label: 'Date', className: 'col-tight', defaultDir: 'desc', value: function (r) { return r.game.date; },
        render: function (r) { return el('a', { href: '#/shots/game/' + r.game.id, text: UI.shortDate(r.game.date) }); } },
      { key: 'score', label: 'Score', className: 'num-strong', value: function (r) { return r.total; },
        render: function (r) { return String(r.total); } },
      { key: 'x', label: 'X', value: function (r) { return r.stats.strikes; }, render: function (r) { return String(r.stats.strikes); } },
      { key: 'sp', label: '/', value: function (r) { return r.stats.spares; }, render: function (r) { return String(r.stats.spares); } },
      { key: 'ball', label: 'Ball', optional: true, value: function (r) { return ballName(r.game.ball); },
        render: function (r) { return ballName(r.game.ball); } },
      { key: 'pattern', label: 'Pattern', optional: true, value: function (r) { return r.game.pattern || ''; },
        render: function (r) { return r.game.pattern || '—'; } },
      { key: 'location', label: 'Location', optional: true, value: function (r) { return r.game.location || ''; },
        render: function (r) { return r.game.location || '—'; } },
    ];
    draw([
      head('Shot tracker', plural(done.length, 'game') + ' recorded'),
      subnav('games'),
      UI.card(null, null, el('div', { class: 'card-body sh-stack' }, top)),
      UI.card('Games', done.length ? 'Newest first' : null, done.length
        ? UI.table({ columns: columns, rows: rows, state: ui.gamesState, onSort: rerender })
        : UI.empty('Start a game and finish it to see it here.')),
    ]);
  }

  /* ---------- starting a game ---------- */

  function ballPicker(label, noneLabel, value) {
    var balls = activeBalls();
    var select = el('select');
    if (noneLabel) select.appendChild(el('option', { value: '' }, noneLabel));
    balls.forEach(function (b) { select.appendChild(el('option', { value: b.id }, b.name)); });
    select.appendChild(el('option', { value: NEW }, '＋ New ball…'));
    var input = el('input', { type: 'text', placeholder: 'Ball name', autocapitalize: 'words' });
    function sync() { input.hidden = select.value !== NEW; }
    select.addEventListener('change', sync);
    select.value = value && balls.some(function (b) { return b.id === value; }) ? value : (noneLabel ? '' : (balls[0] ? balls[0].id : NEW));
    sync();
    return {
      node: field(label, el('div', { class: 'sh-pair' }, [select, input])),
      /* Resolves to { id } or { name } for a ball that still has to be created. */
      read: function () {
        if (select.value === NEW) return input.value.trim() ? { name: input.value.trim() } : { missing: true };
        return { id: select.value || null };
      },
    };
  }

  function newGamePage() {
    var games = allGames().slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    var last = games[0] || {};

    var date = el('input', { type: 'date', value: today(), required: true });
    var where = el('input', { type: 'text', list: 'sh-locations', value: last.location || '', autocapitalize: 'words', placeholder: 'e.g. Leisure Time Bowling' });
    var pattern = el('input', { type: 'text', list: 'sh-patterns', value: last.pattern || '', autocapitalize: 'words', placeholder: 'e.g. Kegel Flagship, house shot' });
    var event = el('select', null, S.EVENTS.map(function (e) {
      return el('option', { value: e, selected: e === (last.event || 'league') }, e.charAt(0).toUpperCase() + e.slice(1));
    }));
    var lane = el('input', { type: 'text', inputmode: 'numeric', placeholder: 'e.g. 23', value: '' });
    var strike = ballPicker('Ball', null, last.ball);
    var spare = ballPicker('Spare ball (if different)', 'Same ball', last.spareBall);
    var err = errorLine();

    var form = el('form', {
      class: 'sh-form',
      onsubmit: function (e) {
        e.preventDefault();
        var a = strike.read();
        var b = spare.read();
        if (a.missing || (b.missing)) return showError(err, 'Name the new ball, or pick one from the list.');
        var id;
        getVault().commit(function (lib) {
          function resolve(pick) {
            if (pick.name) {
              var ball = { id: uid('b'), name: pick.name, updatedAt: now() };
              lib.balls.push(ball);
              return ball.id;
            }
            return pick.id;
          }
          var ballId = resolve(a);
          var spareId = b.name || b.id ? resolve(b) : null;
          var g = S.newGame({
            date: date.value || today(), location: where.value.trim(), pattern: pattern.value.trim(),
            event: event.value, lane: lane.value.trim(), ball: ballId, spareBall: spareId === ballId ? null : spareId,
          });
          lib.games.push(g);
          id = g.id;
        }).then(function () {
          ui.draft = null;
          location.hash = '#/shots/game/' + id;
        }, function (ex) { showError(err, ex.message); });
      },
    }, [
      el('div', { class: 'sh-grid' }, [
        field('Date', date),
        field('Event', event),
        field('Location', where),
        field('Lane', lane),
      ]),
      field('Oil pattern', pattern, 'Whatever you call it: the name on the sheet, or house / sport / flat.'),
      el('div', { class: 'sh-grid' }, [strike.node, spare.node]),
      err,
      el('div', { class: 'sh-actions' }, [
        el('button', { type: 'submit', class: 'sh-btn is-primary', text: 'Start game' }),
        el('a', { class: 'sh-btn', href: '#/shots', text: 'Cancel' }),
      ]),
    ]);

    draw([
      head('New game', 'Set the conditions once; every shot is tagged with them.'),
      subnav('games'),
      UI.card(null, null, el('div', { class: 'card-body' }, [
        datalist('sh-locations', S.distinct(allGames(), 'location')),
        datalist('sh-patterns', S.distinct(allGames(), 'pattern')),
        form,
      ])),
    ]);
  }

  /* ---------- the scorecard ---------- */

  function scorecard(game, pos) {
    var sc = S.score(game);
    var cells = [];
    for (var f = 0; f < 10; f++) {
      var frame = sc.frames[f] || { marks: [], total: null };
      var boxes = f === 9 ? 3 : 2;
      var marks = [];
      /* The usual card: a strike in frames 1-9 sits in the right-hand box. */
      var shifted = f < 9 && frame.marks[0] && frame.marks[0].text === 'X';
      for (var b = 0; b < boxes; b++) {
        var m = shifted ? (b === 1 ? frame.marks[0] : null) : frame.marks[b];
        var current = pos && pos.frame === f && pos.shot === b;
        marks.push(el('span', {
          class: 'sh-mark' + (m && m.split ? ' is-split' : '') + (current ? ' is-now' : '') +
                 (m && m.text === 'X' ? ' is-strike' : ''),
          text: m ? m.text : '',
        }));
      }
      cells.push(el('div', { class: 'sh-frame' + (f === 9 ? ' is-tenth' : '') + (pos && pos.frame === f ? ' is-current' : '') }, [
        el('span', { class: 'sh-fno', text: String(f + 1) }),
        el('div', { class: 'sh-marks' }, marks),
        el('span', { class: 'sh-total', text: frame.total == null ? '' : String(frame.total) }),
      ]));
    }
    return el('div', { class: 'sh-card', role: 'group', 'aria-label': 'Scorecard' }, cells);
  }

  /* ---------- pin deck ---------- */

  function pinDeck(before, standing, onToggle) {
    return el('div', { class: 'sh-deck', role: 'group', 'aria-label': 'Pin deck' }, S.DECK.map(function (row) {
      return el('div', { class: 'sh-row' }, row.map(function (pin) {
        var live = before.indexOf(pin) !== -1;
        var up = standing.indexOf(pin) !== -1;
        return el('button', {
          type: 'button',
          class: 'sh-pin' + (live ? '' : ' is-gone') + (up ? ' is-up' : ''),
          disabled: !live,
          'aria-pressed': live ? (up ? 'true' : 'false') : null,
          'aria-label': 'Pin ' + pin + (live ? (up ? ', standing' : ', down') : ', already down'),
          onclick: function () { onToggle(pin); },
        }, String(pin));
      }));
    }));
  }

  /* ---------- a game ---------- */

  function gamePage(id) {
    var game = gameById(id);
    if (!game) {
      draw([head('Game not found'), subnav('games'), UI.card(null, null, el('p', { class: 'sh-note' }, [
        'That game is not in your vault. ', el('a', { href: '#/shots', text: 'Back to games' }), '.',
      ]))]);
      return;
    }
    if (game.status === 'open') return entryPage(game);
    return reviewPage(game);
  }

  function saveGame(game) {
    game.updatedAt = now();
    return getVault().commit(function (lib) {
      var i = lib.games.map(function (g) { return g.id; }).indexOf(game.id);
      if (i === -1) lib.games.push(game); else lib.games[i] = game;
    });
  }

  function shotCount(game) { return S.walk(game).length; }

  function freshDraft(game, pos) {
    var picks = ui.picks[game.id] || {};
    var ball = pos.fresh ? (picks.strike || game.ball) : (picks.spare || game.spareBall || game.ball);
    ui.draft = { id: game.id, shots: shotCount(game), standing: [], hit: null, miss: null, ball: ball };
  }

  function entryPage(game) {
    ui.game = game;
    var pos = S.position(game);
    var nodes = [
      head(game.pattern || 'Game', [UI.shortDate(game.date), game.location, game.lane ? 'lane ' + game.lane : null]
        .filter(Boolean).join(' · ')),
      subnav('games'),
      el('section', { class: 'card sh-cardwrap' }, scorecard(game, pos)),
    ];

    if (!pos) {
      nodes.push(finishCard(game));
    } else {
      if (!ui.draft || ui.draft.id !== game.id || ui.draft.shots !== shotCount(game)) freshDraft(game, pos);
      ui.panel = el('section', { class: 'card sh-entry' });
      fillPanel(game, pos);
      nodes.push(ui.panel);
    }
    nodes.push(el('p', { class: 'sh-note' }, [
      el('a', { href: '#/shots', text: 'Leave this game for now' }),
      ' — it is saved on this device after every shot and picks up where you left off.',
    ]));
    draw(nodes);
  }

  function chips(options, current, onPick, label) {
    return el('div', { class: 'sh-chips', role: 'group', 'aria-label': label }, options.map(function (o) {
      return el('button', {
        type: 'button', class: 'sh-chip' + (current === o.value ? ' is-on' : ''),
        'aria-pressed': current === o.value ? 'true' : 'false',
        onclick: function () { onPick(o.value); },
      }, o.label);
    }));
  }

  function fillPanel(game, pos) {
    var d = ui.draft;
    var panel = ui.panel;
    UI.clear(panel);

    var kind = pos.fresh ? (pos.tenth && pos.shot > 0 ? 'Fill ball' : 'First ball') : 'Spare try';
    var title = 'Frame ' + (pos.frame + 1) + ' · ' + kind;

    function refresh() { fillPanel(game, pos); }

    var children = [
      el('div', { class: 'card-head' }, [el('div', { class: 'card-title' }, el('h2', { text: title }))]),
    ];
    var body = [];

    body.push(el('p', { class: 'sh-note', text: pos.fresh
      ? 'Tap the pins still standing after the shot; they fill in. Tap none for a strike.'
      : 'Pins left: ' + pos.before.join(', ') + '. Tap any still standing; they fill in. None means you made it.' }));

    body.push(pinDeck(pos.before, d.standing, function (pin) {
      var i = d.standing.indexOf(pin);
      if (i === -1) d.standing.push(pin); else d.standing.splice(i, 1);
      d.standing.sort(function (a, b) { return a - b; });
      if (d.standing.length === 0) d.miss = null;
      refresh();
    }));

    body.push(el('div', { class: 'sh-actions sh-center' }, [
      button('Strike / spare (none standing)', function () { d.standing = []; d.miss = null; refresh(); }, null, { disabled: d.standing.length === 0 }),
      button('Missed everything', function () { d.standing = pos.before.slice(); refresh(); }, null,
        { disabled: d.standing.length === pos.before.length }),
    ]));

    if (pos.fresh) {
      body.push(el('div', { class: 'sh-group' }, [
        el('span', { class: 'sh-label', text: 'How did it hit?' }),
        chips(S.HITS.map(function (h) { return { value: h, label: S.HIT_LABELS[h] }; }), d.hit,
          function (v) { d.hit = v; refresh(); }, 'How the shot hit'),
      ]));
    } else if (d.standing.length) {
      body.push(el('div', { class: 'sh-group' }, [
        el('span', { class: 'sh-label', text: 'Which way did you miss?' }),
        chips([{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }], d.miss,
          function (v) { d.miss = v; refresh(); }, 'Which way the spare was missed'),
      ]));
    }

    var balls = activeBalls();
    if (balls.length > 1) {
      var select = el('select', {
        onchange: function () {
          d.ball = select.value;
          var picks = ui.picks[game.id] = ui.picks[game.id] || {};
          picks[pos.fresh ? 'strike' : 'spare'] = d.ball;
        },
      }, balls.map(function (b) { return el('option', { value: b.id, selected: b.id === d.ball }, b.name); }));
      body.push(field('Ball', select));
    } else {
      body.push(el('p', { class: 'sh-note', text: 'Ball: ' + ballName(d.ball) }));
    }

    var ready = pos.fresh ? !!d.hit : (d.standing.length === 0 || !!d.miss);
    var err = errorLine();
    body.push(el('p', { class: 'sh-summary', text: S.describeShot(pos, d.standing) +
      (pos.fresh && d.hit ? ' · ' + S.HIT_LABELS[d.hit] : '') +
      (!pos.fresh && d.standing.length && d.miss ? ' · missed ' + d.miss : '') }));
    body.push(err);
    body.push(el('div', { class: 'sh-actions' }, [
      button('Save shot', function () {
        var input = { standing: d.standing, ball: d.ball };
        if (pos.fresh) input.hit = d.hit; else if (d.standing.length) input.miss = d.miss;
        var next;
        try { next = S.addShot(game, input); } catch (e) { return showError(err, e.message); }
        saveGame(next).then(function () { ui.draft = null; entryPage(gameById(game.id)); },
          function (e) { showError(err, e.message); });
      }, 'primary', { disabled: !ready }),
      button('Undo last shot', function () {
        saveGame(S.undo(game)).then(function () { ui.draft = null; entryPage(gameById(game.id)); });
      }, null, { disabled: shotCount(game) === 0 }),
    ]));
    if (!ready) {
      body.push(el('p', { class: 'sh-hint', text: pos.fresh ? 'Choose how the ball hit to save.' : 'Choose left or right to save.' }));
    }

    children.push(el('div', { class: 'card-body sh-stack' }, body));
    UI.append(panel, children);
  }

  function finishCard(game) {
    var sc = S.score(game);
    var notes = el('textarea', { rows: 3, placeholder: 'Anything worth remembering: how the lanes played, what you changed…' }, game.notes || '');
    var err = errorLine();
    return el('section', { class: 'card' }, el('div', { class: 'card-body sh-stack' }, [
      el('h2', { class: 'sh-big', text: 'Game complete: ' + sc.total }),
      field('Notes', notes),
      err,
      el('div', { class: 'sh-actions' }, [
        button('Save game', function () {
          var done = JSON.parse(JSON.stringify(game));
          done.status = 'done';
          done.notes = notes.value.trim();
          saveGame(done).then(function () {
            ui.draft = null;
            backgroundSync();
            location.hash = '#/shots/game/' + game.id;
            rerender();
          }, function (e) { showError(err, e.message); });
        }, 'primary'),
        button('Undo last shot', function () {
          saveGame(S.undo(game)).then(function () { ui.draft = null; entryPage(gameById(game.id)); });
        }),
      ]),
    ]));
  }

  /* ---------- a finished game ---------- */

  function reviewPage(game) {
    var sc = S.score(game);
    var s = S.analyze([game]);
    var tiles = UI.statGrid([
      UI.stat('Score', String(sc.total)),
      UI.stat('Strikes', String(s.strikes), 'Strikes out of ' + s.racks + ' first balls, fill balls included.'),
      UI.stat('Spares', s.attempts ? s.spares + ' of ' + s.attempts : '—', 'Spares made out of the spare tries.'),
      UI.stat('Open frames', String(s.opens)),
      UI.stat('First-ball avg', UI.avg(s.firstBallAvg), 'Pins knocked down by the first ball, on average.'),
      UI.stat('Pocket', pct(s.hits.pocket.pct), 'Share of first balls that hit the pocket.'),
    ]);

    var rows = [];
    S.walk(game).forEach(function (c) {
      rows.push({
        name: String(c.f * 10 + c.s), frame: c.f + 1, shot: c.s + 1, c: c,
      });
    });
    var columns = [
      { key: 'f', label: 'Fr', sortable: false, render: function (r) { return String(r.frame); } },
      { key: 'r', label: 'Result', sortable: false, className: 'col-name', render: function (r) {
        var c = r.c;
        return S.describeShot({ fresh: c.fresh, before: c.before }, c.standing);
      } },
      { key: 'h', label: 'How', sortable: false, className: 'col-name', render: function (r) {
        var c = r.c;
        if (c.shot.hit) return S.HIT_LABELS[c.shot.hit];
        if (c.shot.miss) return 'Missed ' + c.shot.miss;
        return c.spare ? 'Made' : '—';
      } },
    ];
    /* A column of the same ball name says nothing. */
    var ballsInGame = {};
    rows.forEach(function (r) { ballsInGame[r.c.ball] = true; });
    if (Object.keys(ballsInGame).length > 1) {
      columns.push({ key: 'b', label: 'Ball', sortable: false, className: 'muted', render: function (r) { return ballName(r.c.ball); } });
    }

    var detail = [
      ['Date', UI.longDate(game.date)],
      ['Location', game.location || '—'],
      ['Oil pattern', game.pattern || '—'],
      ['Event', game.event ? game.event.charAt(0).toUpperCase() + game.event.slice(1) : '—'],
      ['Lane', game.lane || '—'],
      ['Ball', ballName(game.ball)],
      game.spareBall ? ['Spare ball', ballName(game.spareBall)] : null,
      game.notes ? ['Notes', game.notes] : null,
    ].filter(Boolean);

    var frameSelect = el('select', null, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) {
      return el('option', { value: String(n - 1) }, 'Frame ' + n);
    }));

    draw([
      head('Game: ' + sc.total, [UI.shortDate(game.date), game.pattern].filter(Boolean).join(' · ')),
      subnav('games'),
      el('section', { class: 'card sh-cardwrap' }, scorecard(game, null)),
      UI.card(null, null, el('div', { class: 'card-body' }, tiles)),
      UI.card('Conditions', null, el('dl', { class: 'sh-detail' }, detail.reduce(function (acc, row) {
        acc.push(el('dt', { text: row[0] }), el('dd', { text: row[1] }));
        return acc;
      }, []))),
      UI.card('Shot by shot', null, UI.table({ columns: columns, rows: rows, state: null, onSort: function () {} })),
      UI.card('Fix or remove', null, el('div', { class: 'card-body sh-stack' }, [
        el('p', { class: 'sh-note', text: 'Entered something wrong? Re-bowl from a frame: that frame and everything after it is cleared and the game reopens.' }),
        el('div', { class: 'sh-actions' }, [
          field('From', frameSelect),
          button('Re-bowl from here', function () {
            if (!window.confirm('Clear frame ' + (Number(frameSelect.value) + 1) + ' onwards and reopen this game?')) return;
            var reopened = S.truncate(game, Number(frameSelect.value));
            reopened.status = 'open';
            saveGame(reopened).then(function () { ui.draft = null; rerender(); });
          }),
          button('Delete game', function () {
            if (!window.confirm('Delete this game? This cannot be undone.')) return;
            var gone = JSON.parse(JSON.stringify(game));
            gone.deleted = true;
            saveGame(gone).then(function () { backgroundSync(); location.hash = '#/shots'; });
          }, 'danger'),
        ]),
      ])),
    ]);
  }

  /* ---------- stats ---------- */

  function periodRange(period) {
    if (period === 'all') return {};
    var d = new Date();
    d.setDate(d.getDate() - Number(period));
    return { from: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) };
  }

  function filterSelect(label, key, values, labelOf) {
    var select = el('select', {
      onchange: function () { ui.filters[key] = select.value; rerender(); },
    }, [el('option', { value: '' }, 'All')].concat(values.map(function (v) {
      return el('option', { value: v, selected: ui.filters[key] === v }, labelOf ? labelOf(v) : v);
    })));
    select.value = ui.filters[key];
    return el('div', { class: 'control-field' }, [el('span', { class: 'sh-label', text: label }), select]);
  }

  function statsPage() {
    var f = ui.filters;
    var pool = S.finished(allGames());
    var filtered = S.filter(pool, Object.assign({ pattern: f.pattern, location: f.location, event: f.event }, periodRange(f.period)));
    var stats = S.analyze(filtered, { ball: f.ball || null });

    var controls = el('div', { class: 'sh-filters' }, [
      filterSelect('Ball', 'ball', S.ballsUsed(pool), ballName),
      filterSelect('Oil pattern', 'pattern', S.distinct(pool, 'pattern')),
      filterSelect('Location', 'location', S.distinct(pool, 'location')),
      filterSelect('Event', 'event', S.EVENTS, function (e) { return e.charAt(0).toUpperCase() + e.slice(1); }),
      (function () {
        var select = el('select', { onchange: function () { f.period = select.value; rerender(); } }, [
          ['all', 'All time'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['365', 'Last year'],
        ].map(function (p) { return el('option', { value: p[0], selected: f.period === p[0] }, p[1]); }));
        select.value = f.period;
        return el('div', { class: 'control-field' }, [el('span', { class: 'sh-label', text: 'Period' }), select]);
      })(),
    ]);

    if (!stats.games && !stats.racks) {
      draw([
        head('Stats', 'Everything you record, sliced any way you like'),
        subnav('stats'),
        UI.card(null, null, el('div', { class: 'card-body sh-stack' }, [controls])),
        UI.card(null, null, UI.empty(pool.length ? 'No games match these filters.' : 'Finish a game and its statistics appear here.')),
      ]);
      return;
    }

    var h = stats.hits;
    var tiles = UI.statGrid([
      UI.stat('Games', String(stats.games)),
      UI.stat('Average', UI.avg(stats.average), 'Total pins over the games shown.'),
      UI.stat('High game', UI.num(stats.high)),
      UI.stat('Strike %', pct1(stats.strikePct), 'Strikes out of every first ball: ' + stats.strikes + ' of ' + stats.racks + '. A perfect game is twelve strikes in twelve.'),
      UI.stat('Spare %', pct1(stats.sparePct), 'Spares made out of the spare tries: ' + stats.spares + ' of ' + stats.attempts + '.'),
      UI.stat('Pocket %', pct1(h.pocket.pct), 'Share of first balls that hit the pocket, of those where you recorded how it hit.'),
      UI.stat('First-ball avg', UI.avg(stats.firstBallAvg), 'Pins knocked down by the first ball, on average. Ten is a strike.'),
      UI.stat('Opens / game', UI.avg(stats.opensPerGame), 'Frames where the spare was missed. Splits missed count.'),
      UI.stat('Clean games', stats.games ? stats.clean + ' of ' + stats.games : '—', 'Games with no open frame.'),
      UI.stat('200+ games', stats.games ? stats.over200 + ' of ' + stats.games : '—'),
      UI.stat('Best strike run', String(stats.bestStreak), 'Most strikes in a row, fill balls included. Three in a row is a turkey: ' + stats.streaks3 + ' so far.'),
      UI.stat('Splits', pct1(stats.splitPct), 'How often the first ball left a split.'),
    ]);

    /* first-ball hits */
    var hitRows = S.HITS.filter(function (k) { return h[k].n; }).map(function (k) {
      return { name: S.HIT_LABELS[k], key: k, hit: h[k] };
    });
    var hitBars = hitRows.map(function (r) {
      return { label: r.name, value: (r.hit.pct || 0) * 100, display: pct(r.hit.pct),
        title: r.name + ': ' + r.hit.n + ' shots, ' + pct(r.hit.strikePct) + ' were strikes' };
    });
    var hitCard = UI.card('How the first ball hits', stats.hitsRecorded + ' first balls',
      stats.hitsRecorded ? el('div', null, [
        el('div', { class: 'card-body' }, Charts.bars({ rows: hitBars })),
        UI.table({
          columns: [
            { key: 'n', label: 'Hit', sortable: false, className: 'col-name', render: function (r) { return r.name; } },
            { key: 'c', label: 'Shots', sortable: false, render: function (r) { return String(r.hit.n); } },
            { key: 'p', label: 'Share', sortable: false, render: function (r) { return pct(r.hit.pct); } },
            { key: 's', label: 'Strike %', sortable: false, className: 'num-strong', render: function (r) { return pct(r.hit.strikePct); } },
            { key: 'a', label: 'Avg pins', sortable: false, render: function (r) { return UI.avg(r.hit.avgPins); } },
          ], rows: hitRows, state: null, onSort: function () {},
        }),
      ]) : UI.empty('No first balls recorded yet.'),
      'Where the ball met the pins, and what it did to them. Strike % is the share of that kind of hit that carried for a strike, so a low number on pocket hits means carry, not accuracy.');

    /* spares */
    function spareRow(name, b) {
      return { name: name, b: b };
    }
    var spareRows = [
      spareRow('Single pin', stats.single),
      spareRow('Several pins', stats.cluster),
      spareRow('Splits', stats.split),
      spareRow('All spare tries', {
        attempts: stats.attempts, made: stats.spares, pct: stats.sparePct,
        left: stats.misses.left, right: stats.misses.right,
      }),
    ];
    var spareCard = UI.card('Spares', stats.attempts + (stats.attempts === 1 ? ' try' : ' tries'),
      stats.attempts ? el('div', null, [
        UI.table({
          columns: [
            { key: 'n', label: 'Leave', sortable: false, className: 'col-name', render: function (r) { return r.name; } },
            { key: 't', label: 'Tries', sortable: false, render: function (r) { return String(r.b.attempts); } },
            { key: 'm', label: 'Made', sortable: false, render: function (r) { return String(r.b.made); } },
            { key: 'p', label: 'Spare %', sortable: false, className: 'num-strong', render: function (r) { return pct(r.b.pct); } },
            { key: 'l', label: 'Missed left', sortable: false, render: function (r) { return String(r.b.left); } },
            { key: 'r', label: 'Missed right', sortable: false, render: function (r) { return String(r.b.right); } },
          ], rows: spareRows, state: null, onSort: function () {},
        }),
        el('p', { class: 'sh-note sh-pad', text: stats.misses.total
          ? 'Of ' + plural(stats.misses.total, 'missed spare') + ' where you said which way: ' + pct(stats.misses.leftPct) + ' left, ' + pct(stats.misses.rightPct) + ' right.'
          : 'Say which way each missed spare went and a left/right pattern shows up here.' }),
      ]) : UI.empty('No spare tries yet.'),
      'Spare tries split by how hard the leave is. Left and right say which side of the pin the ball went when you missed.');

    /* leaves */
    var leaves = stats.leaves;
    var shown = ui.allLeaves ? leaves : leaves.slice(0, 10);
    var leaveCard = UI.card('Leaves', plural(leaves.length, 'different leave'),
      leaves.length ? el('div', null, [
        UI.table({
          columns: [
            { key: 'n', label: 'Leave', sortable: false, className: 'col-name', render: function (r) { return r.label; } },
            { key: 's', label: 'Seen', sortable: false, render: function (r) { return String(r.seen); } },
            { key: 'a', label: 'Tries', sortable: false, render: function (r) { return String(r.attempts); } },
            { key: 'm', label: 'Made', sortable: false, render: function (r) { return String(r.made); } },
            { key: 'p', label: 'Spare %', sortable: false, className: 'num-strong', render: function (r) { return pct(r.pct); } },
            { key: 'l', label: 'L', sortable: false, render: function (r) { return String(r.left); } },
            { key: 'r', label: 'R', sortable: false, render: function (r) { return String(r.right); } },
          ], rows: shown, state: null, onSort: function () {},
        }),
        leaves.length > 10 ? el('div', { class: 'sh-pad' }, button(ui.allLeaves ? 'Show fewer' : 'Show all ' + leaves.length, function () {
          ui.allLeaves = !ui.allLeaves; rerender();
        })) : null,
      ]) : UI.empty('No leaves yet: every first ball so far was a strike.'),
      'Every pin combination the first ball left, how often, and how often you picked it up. L and R are the misses to each side.');

    /* by frame */
    var overall = stats.strikePct == null ? null : stats.strikePct * 100;
    var frameChart = Charts.columns({
      points: stats.byFrame.filter(function (x) { return x.racks; }).map(function (x) {
        return { label: 'Frame ' + x.frame, axis: String(x.frame), value: (x.pct || 0) * 100,
          caption: x.strikes + ' strikes in ' + plural(x.racks, 'first ball') };
      }),
      reference: overall == null ? null : { value: overall, label: 'overall ' + overall.toFixed(0) + '%' },
      format: function (v) { return v.toFixed(0) + '%'; },
      formatAxis: function (v) { return v + '%'; },
      keys: { above: 'Above your overall strike %', below: 'Below your overall strike %' },
      referenceName: 'your overall',
      domain: [0, 100],
      label: 'Strike percentage by frame',
    });

    /* trend */
    var ordered = S.filter(pool, Object.assign({ pattern: f.pattern, location: f.location, event: f.event }, periodRange(f.period)))
      .filter(function (g) { return !f.ball || g.ball === f.ball; })
      .sort(function (a, b) { return (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''); });
    var trend = Charts.line({
      points: ordered.map(function (g, i) {
        return { label: UI.shortDate(g.date) + (g.pattern ? ' · ' + g.pattern : ''), axis: UI.shortDate(g.date),
          value: S.score(g).total, caption: ballName(g.ball) };
      }),
      reference: stats.average == null ? null : { value: stats.average, label: 'avg ' + UI.avg(stats.average) },
      label: 'Game scores over time',
    });

    draw([
      head('Stats', plural(stats.games, 'game') + (f.ball ? ' with ' + ballName(f.ball) : '')),
      subnav('stats'),
      UI.card(null, null, el('div', { class: 'card-body sh-stack' }, [controls])),
      UI.card(null, null, el('div', { class: 'card-body' }, tiles)),
      compareCard(filtered),
      hitCard,
      spareCard,
      UI.card('Strike % by frame', 'Do you start strong or fade?', el('div', { class: 'card-body' }, frameChart)),
      leaveCard,
      UI.card('Scores', 'Every game, in order', el('div', { class: 'card-body' }, trend)),
    ]);
  }

  function compareCard(games) {
    var dims = [['ball', 'Ball'], ['pattern', 'Oil pattern'], ['location', 'Location'], ['lane', 'Lane'], ['event', 'Event']];
    var picker = el('div', { class: 'sh-chips sh-pad', role: 'group', 'aria-label': 'Compare by' }, dims.map(function (d) {
      return el('button', {
        type: 'button', class: 'sh-chip' + (ui.compareBy === d[0] ? ' is-on' : ''),
        'aria-pressed': ui.compareBy === d[0] ? 'true' : 'false',
        onclick: function () { ui.compareBy = d[0]; ui.compareState = { key: 'games', dir: 'desc' }; rerender(); },
      }, d[1]);
    }));

    var rows = S.compare(games, ui.compareBy, ballName).map(function (r) {
      return { name: r.label, key: r.key, s: r.stats };
    });
    function col(key, label, get, render, opts) {
      return Object.assign({ key: key, label: label, value: get, render: render }, opts || {});
    }
    var columns = [
      col('name', ui.compareBy === 'ball' ? 'Ball' : dims.filter(function (d) { return d[0] === ui.compareBy; })[0][1],
        function (r) { return r.name; }, function (r) { return r.name; }, { className: 'col-name', defaultDir: 'asc' }),
      col('games', 'Games', function (r) { return r.s.games; }, function (r) { return String(r.s.games); }),
      col('avg', 'Avg', function (r) { return r.s.average; }, function (r) { return UI.avg(r.s.average); }, { className: 'num-strong' }),
      col('high', 'High', function (r) { return r.s.high; }, function (r) { return UI.num(r.s.high); }),
      col('strike', 'Strike %', function (r) { return r.s.strikePct; }, function (r) { return pct(r.s.strikePct); }),
      col('spare', 'Spare %', function (r) { return r.s.sparePct; }, function (r) { return pct(r.s.sparePct); }),
      col('pocket', 'Pocket', function (r) { return r.s.hits.pocket.pct; }, function (r) { return pct(r.s.hits.pocket.pct); }, { optional: true }),
      col('high%', 'High', function (r) { return r.s.hits.high.pct; }, function (r) { return pct(r.s.hits.high.pct); }, { optional: true }),
      col('light', 'Light', function (r) { return r.s.hits.light.pct; }, function (r) { return pct(r.s.hits.light.pct); }, { optional: true }),
      col('brooklyn', 'Brooklyn', function (r) { return r.s.hits.brooklyn.pct; }, function (r) { return pct(r.s.hits.brooklyn.pct); }, { optional: true }),
      col('fb', '1st ball', function (r) { return r.s.firstBallAvg; }, function (r) { return UI.avg(r.s.firstBallAvg); }, { optional: true }),
      col('opens', 'Opens/g', function (r) { return r.s.opensPerGame; }, function (r) { return UI.avg(r.s.opensPerGame); }, { optional: true }),
    ];
    return UI.card('Compare', 'Pocket, high, light and Brooklyn are shares of first balls',
      el('div', null, [picker, rows.length
        ? UI.table({ columns: columns, rows: rows, state: ui.compareState, onSort: rerender })
        : UI.empty('Nothing to compare yet.')]),
      'The same numbers for each ball, oil pattern, location, lane or event. Ball rows count the shots thrown with that ball: first balls on the strike ball, spare tries on the spare ball. Averages and highs are for games where it was the strike ball.');
  }

  /* ---------- balls ---------- */

  function ballsPage() {
    var pool = S.finished(allGames());
    var balls = library().balls.filter(function (b) { return !b.deleted; });
    var stats = {};
    balls.forEach(function (b) { stats[b.id] = S.analyze(pool, { ball: b.id }); });

    var name = el('input', { type: 'text', placeholder: 'e.g. Hammer Black Widow 2.0', autocapitalize: 'words', required: true });
    var notes = el('input', { type: 'text', placeholder: 'Weight, coverstock, surface (optional)' });
    var err = errorLine();
    var add = el('form', {
      class: 'sh-form',
      onsubmit: function (e) {
        e.preventDefault();
        if (!name.value.trim()) return showError(err, 'Give the ball a name.');
        getVault().commit(function (lib) {
          lib.balls.push({ id: uid('b'), name: name.value.trim(), notes: notes.value.trim(), updatedAt: now() });
        }).then(rerender, function (ex) { showError(err, ex.message); });
      },
    }, [
      el('div', { class: 'sh-grid' }, [field('New ball', name), field('Notes', notes)]),
      err,
      el('div', { class: 'sh-actions' }, el('button', { type: 'submit', class: 'sh-btn is-primary', text: 'Add ball' })),
    ]);

    function update(id, change) {
      return getVault().commit(function (lib) {
        var b = lib.balls.filter(function (x) { return x.id === id; })[0];
        if (b) { change(b); b.updatedAt = now(); }
      }).then(rerender);
    }

    var list = balls.length ? el('div', { class: 'sh-balls' }, balls.map(function (b) {
      var s = stats[b.id];
      if (ui.editingBall === b.id) {
        var n = el('input', { type: 'text', value: b.name });
        var m = el('input', { type: 'text', value: b.notes || '' });
        return el('div', { class: 'sh-ball is-editing' }, [
          el('div', { class: 'sh-grid' }, [field('Name', n), field('Notes', m)]),
          el('div', { class: 'sh-actions' }, [
            button('Save', function () {
              if (!n.value.trim()) return;
              ui.editingBall = null;
              update(b.id, function (x) { x.name = n.value.trim(); x.notes = m.value.trim(); });
            }, 'primary'),
            button('Cancel', function () { ui.editingBall = null; rerender(); }),
          ]),
        ]);
      }
      return el('div', { class: 'sh-ball' + (b.retired ? ' is-retired' : '') }, [
        el('div', { class: 'sh-ball-main' }, [
          el('strong', { text: b.name }),
          b.notes ? el('span', { class: 'sh-hint', text: b.notes }) : null,
          el('span', { class: 'sh-hint', text: s.racks
            ? plural(s.games, 'game') + ' as strike ball · strike ' + pct(s.strikePct) + ' · spare ' + pct(s.sparePct) + (s.average != null ? ' · avg ' + UI.avg(s.average) : '')
            : 'Not used yet' }),
        ]),
        el('div', { class: 'sh-actions' }, [
          button('Edit', function () { ui.editingBall = b.id; rerender(); }),
          button(b.retired ? 'Bring back' : 'Retire', function () { update(b.id, function (x) { x.retired = !x.retired; }); }),
        ]),
      ]);
    })) : UI.empty('No balls yet. Add the ones in your bag.');

    draw([
      head('Balls', 'Everything you bowl with'),
      subnav('balls'),
      UI.card('Your bag', 'Retiring a ball hides it from the pickers but keeps its history', el('div', { class: 'card-body sh-stack' }, [list])),
      UI.card('Add a ball', null, el('div', { class: 'card-body' }, add)),
    ]);
  }

  /* ---------- settings ---------- */

  function settingsPage() {
    var v = getVault();
    var token = el('input', { type: 'password', autocomplete: 'off', autocapitalize: 'off', placeholder: v.hasToken() ? 'A token is saved on this device' : 'github_pat_…' });
    var err = errorLine();
    var note = el('p', { class: 'sh-note', text: syncLine() });

    var tokenForm = el('form', {
      class: 'sh-form',
      onsubmit: function (e) {
        e.preventDefault();
        if (!token.value.trim()) return showError(err, 'Paste the token first.');
        v.setToken(token.value).then(function () {
          token.value = '';
          ui.status = '';
          rerender();
        }, function (ex) { showError(err, ex.message); });
      },
    }, [
      field('GitHub token', token, v.hasToken() ? 'Saved, encrypted, on this device only.' : 'Needed only to save to GitHub. Viewing never needs it.'),
      err,
      el('div', { class: 'sh-actions' }, [
        el('button', { type: 'submit', class: 'sh-btn is-primary', text: 'Save token' }),
        v.hasToken() ? button('Remove token', function () { v.setToken('').then(rerender); }) : null,
      ]),
    ]);

    var steps = el('ol', { class: 'sh-steps' }, [
      el('li', null, ['Open ', el('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener', text: 'GitHub › New fine-grained token' }), '.']),
      el('li', { text: 'Name it anything, set a short expiry (90 days is sensible), and under Repository access choose Only select repositories › turindev/bowlingTracker.' }),
      el('li', { text: 'Under Repository permissions set Contents to Read and write. Nothing else.' }),
      el('li', { text: 'Generate it, copy it, paste it above.' }),
    ]);

    var remembered = el('input', { type: 'checkbox' });
    v.isRemembered().then(function (on) { remembered.checked = on; });
    remembered.addEventListener('change', function () {
      (remembered.checked ? v.remember(30) : v.forget());
    });

    draw([
      head('Settings', 'Sync, access and backup'),
      subnav('settings'),
      UI.card('Sync', null, el('div', { class: 'card-body sh-stack' }, [
        note,
        el('div', { class: 'sh-actions' }, [
          button('Sync now', function () {
            note.textContent = 'Syncing…';
            v.sync().then(function () { ui.status = ''; }, function (ex) { ui.status = ex.message; }).then(function () { rerender(); });
          }, 'primary'),
        ]),
      ])),
      UI.card('GitHub token', 'Lets this device save your games to the repo', el('div', { class: 'card-body sh-stack' }, [tokenForm, steps])),
      UI.card('Access', null, el('div', { class: 'card-body sh-stack' }, [
        el('label', { class: 'sh-check' }, [remembered, el('span', { text: 'Stay unlocked on this device for 30 days' })]),
        el('div', { class: 'sh-actions' }, [
          button('Lock now', function () { v.lock(); v.forget().then(rerender); }),
        ]),
      ])),
      UI.card('Backup and privacy', null, el('div', { class: 'card-body sh-stack' }, [
        el('p', { class: 'sh-note', text: 'Your games are encrypted before they leave this device, and the file on GitHub is unreadable without your passphrase. The history of that file on the bowling-data branch is also your backup.' }),
        el('div', { class: 'sh-actions' }, [
          button('Download encrypted backup', function () {
            var blob = new Blob([v.exportEncrypted() || ''], { type: 'application/json' });
            var a = el('a', { href: URL.createObjectURL(blob), download: 'shot-tracker-backup.enc.json' });
            document.body.appendChild(a);
            a.click();
            a.remove();
          }),
          button('Forget this device', function () {
            if (!window.confirm('Remove the saved copy, token and key from this device? Anything not yet synced to GitHub is lost.')) return;
            v.wipeLocal().then(function () { location.hash = '#/shots'; rerender(); });
          }, 'danger'),
        ]),
      ])),
    ]);
  }

  window.ShotsView = { mount: mount };
})();
