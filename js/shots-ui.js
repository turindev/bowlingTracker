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
    draft: null,
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
  /* The name printed on shared pictures. */
  function shareName() { var st = library().settings; return st && st.name ? st.name : ''; }
  function ballInfo(id) {
    var b = library().balls.filter(function (x) { return x.id === id; })[0];
    return { name: b ? b.name : '', image: b && b.image ? b.image : null };
  }
  function sharePanel(label, games, filename, kind) {
    var done = games.filter(function (g) { return g.status === 'done'; });
    return window.ShotsShare.panel({
      label: label, kind: kind, filename: filename, title: label,
      make: function () {
        return window.Cards.scorecard(done, { name: shareName(), ballInfo: ballInfo });
      },
    });
  }
  function allGames() { return library().games.filter(function (g) { return !g.deleted; }); }
  function allBalls() { return library().balls.filter(function (b) { return !b.deleted; }); }
  function activeBalls() { return allBalls().filter(function (b) { return !b.retired; }); }
  function ballName(id) {
    var b = library().balls.filter(function (x) { return x.id === id; })[0];
    return b ? b.name : (id ? 'Unknown ball' : '—');
  }
  /* "Hammer \u2192 Storm" when the ball changed during the game. */
  function ballNames(game) {
    var ids = S.ballsInGame(game);
    return ids.length ? ids.map(ballName).join(' \u2192 ') : '\u2014';
  }

  function gameById(id) { return allGames().filter(function (g) { return g.id === id; })[0] || null; }

  /* A ball's photo, or a plain disc with its initial until it has one. */
  function thumb(id, size) {
    var b = library().balls.filter(function (x) { return x.id === id; })[0];
    var cls = 'sh-thumb' + (size ? ' is-' + size : '');
    if (b && b.image) return el('img', { class: cls, src: b.image, alt: '' });
    return el('span', { class: cls + ' sh-thumb-empty', 'aria-hidden': 'true',
      text: b && b.name ? b.name.charAt(0).toUpperCase() : '' });
  }

  /* Shrinks a chosen photo to a small data URI. The photo is stored inside the
     encrypted library, so it is kept small: a stock image of a ball loses
     nothing at this size, and a transparent background stays transparent. */
  function shrinkImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type || '')) {
        return reject(new Error('That file is not an image.'));
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var best = null;
        [256, 192, 144].some(function (max) {
          var scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          var out = canvas.toDataURL('image/webp', 0.82);
          /* Safari cannot write webp and answers with a png instead. */
          if (out.indexOf('data:image/webp') !== 0) out = canvas.toDataURL('image/png');
          best = out;
          return out.length <= 90000;
        });
        URL.revokeObjectURL(url);
        resolve(best);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('This browser could not read that image. A JPEG, PNG or WebP works.'));
      };
      img.src = url;
    });
  }

  /* A photo chooser: value() is undefined if untouched, null if removed, or the new image. */
  function photoField(current) {
    var state = { value: undefined };
    var preview = el('div', { class: 'sh-photo' });
    var note = el('span', { class: 'sh-hint' });
    var input = el('input', { type: 'file', accept: 'image/*', 'aria-label': 'Choose a photo' });
    var remove = button('Remove photo', function () {
      state.value = null;
      input.value = '';
      show();
    });
    function show() {
      var src = state.value === undefined ? current : state.value;
      UI.clear(preview);
      preview.appendChild(src
        ? el('img', { class: 'sh-thumb is-big', src: src, alt: 'Ball photo' })
        : el('span', { class: 'sh-thumb is-big sh-thumb-empty', 'aria-hidden': 'true', text: '+' }));
      remove.hidden = !src;
    }
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      note.textContent = 'Preparing photo\u2026';
      shrinkImage(file).then(function (uri) {
        state.value = uri;
        note.textContent = '';
        show();
      }, function (e) { note.textContent = e.message; });
    });
    show();
    return {
      node: el('div', { class: 'sh-field' }, [
        el('span', { class: 'sh-label', text: 'Photo' }),
        el('div', { class: 'sh-photo-row' }, [preview, el('div', { class: 'sh-stack' }, [input, remove, note])]),
        el('span', { class: 'sh-hint', text: 'A stock image from the maker\u2019s website works well. Save it to your phone, then choose it here. It is kept inside your encrypted vault.' }),
      ]),
      value: function () { return state.value; },
    };
  }

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
      link('arsenal', '#/shots/arsenal', 'Arsenal'),
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
    if (page === 'new') return newGamePage(p[1]);
    if (page === 'set') return setPage(p[1]);
    if (page === 'game') return gamePage(p[1], p.slice(2));
    if (page === 'stats') return statsPage();
    if (page === 'arsenal' || page === 'balls') return arsenalPage();
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

  /* "Hammer, Storm" across every game in a set. */
  function setBalls(set) {
    var seen = [];
    set.games.forEach(function (g) {
      S.ballsInGame(g).forEach(function (id) { if (seen.indexOf(id) === -1) seen.push(id); });
    });
    return seen.length ? seen.map(ballName).join(', ') : '—';
  }

  function gamesPage() {
    var all = allGames();
    var open = all.filter(function (g) { return g.status === 'open'; })
      .sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); })[0];
    var sets = S.setsOf(all, { all: true });
    var shown = sets.filter(function (x) { return x.games.some(function (g) { return g.status === 'done'; }); });
    var doneCount = all.filter(function (g) { return g.status === 'done'; }).length;
    var pending = !open && sets.filter(function (x) { return !x.standalone && x.games.length < x.size; }).slice(-1)[0];

    var top = [];
    if (open) {
      var pos = S.position(open);
      top.push(el('div', { class: 'sh-resume' }, [
        el('div', null, [
          el('strong', { text: 'Game in progress' }),
          el('span', { text: ' · ' + [setLabel(open), pos ? 'frame ' + (pos.frame + 1) : 'ready to save'].filter(Boolean).join(' · ') }),
        ]),
        el('a', { class: 'sh-btn is-primary', href: '#/shots/game/' + open.id, text: 'Resume' }),
      ]));
    } else if (pending) {
      top.push(el('div', { class: 'sh-resume' }, [
        el('div', null, [
          el('strong', { text: 'Set in progress' }),
          el('span', { text: ' · ' + pending.games.length + ' of ' + pending.size + ' games · ' + pending.total + ' so far' }),
        ]),
        el('a', { class: 'sh-btn is-primary', href: '#/shots/new/' + pending.id, text: 'Bowl game ' + (pending.games.length + 1) }),
      ]));
    }
    top.push(el('div', { class: 'sh-actions' }, [
      el('a', { class: 'sh-btn ' + (open || pending ? '' : 'is-primary'), href: '#/shots/new', text: 'Start a game' }),
      button('Sync now', function () {
        ui.status = '';
        backgroundSync();
      }),
    ]));
    var line = syncLine();
    if (line) top.push(el('p', { class: 'sh-note', text: line }));

    var rows = shown.map(function (set) { return { name: set.date || '', set: set }; });
    var columns = [
      { key: 'date', label: 'Date', className: 'col-tight', defaultDir: 'desc', value: function (r) { return r.set.date; },
        render: function (r) {
          var set = r.set;
          var tag = set.event === 'league' || set.event === 'tournament'
            ? el('span', { class: 'sh-tag is-' + set.event, text: set.event === 'league' ? 'L' : 'T',
              title: set.event === 'league' ? 'League' : 'Tournament', role: 'img', 'aria-label': set.event === 'league' ? 'League' : 'Tournament' }) : null;
          return el('span', { class: 'sh-datecell' }, [
            el('a', { href: set.standalone ? '#/shots/game/' + set.games[0].id : '#/shots/set/' + set.id, text: UI.shortDate(set.date) }),
            tag,
          ]);
        } },
      { key: 'games', label: 'Games', sortable: false, className: 'col-name',
        render: function (r) {
          var out = [];
          r.set.games.forEach(function (g, i) {
            if (i) out.push(el('span', { class: 'sh-dot', text: ' · ' }));
            out.push(g.status === 'done'
              ? el('a', { class: 'sh-score', href: '#/shots/game/' + g.id, text: String(S.score(g).total) })
              : el('a', { class: 'sh-score is-open', href: '#/shots/game/' + g.id, text: 'open' }));
          });
          return el('span', { class: 'sh-scores' }, out);
        } },
      { key: 'series', label: 'Series', className: 'num-strong', value: function (r) { return r.set.standalone ? null : r.set.total; },
        render: function (r) {
          var set = r.set;
          if (set.standalone) return el('span', { class: 'muted', text: '—' });
          return set.complete ? String(set.total)
            : el('span', { class: 'muted', title: set.finished + ' of ' + set.size + ' games bowled', text: set.total + ' (' + set.finished + '/' + set.size + ')' });
        } },
      { key: 'avg', label: 'Avg', value: function (r) { return r.set.average; }, render: function (r) { return UI.avg(r.set.average); } },
      { key: 'ball', label: 'Ball', optional: true, value: function (r) { return setBalls(r.set); }, render: function (r) { return setBalls(r.set); } },
      { key: 'pattern', label: 'Pattern', optional: true, value: function (r) { return r.set.pattern || ''; },
        render: function (r) { return r.set.pattern || '—'; } },
      { key: 'location', label: 'Location', optional: true, value: function (r) { return r.set.location || ''; },
        render: function (r) { return r.set.location || '—'; } },
    ];
    draw([
      head('Shot tracker', plural(doneCount, 'game') + ' recorded'),
      subnav('games'),
      UI.card(null, null, el('div', { class: 'card-body sh-stack' }, top)),
      UI.card('Sets and games', shown.length ? 'Newest first. Tap a date for the set.' : null, shown.length
        ? UI.table({ columns: columns, rows: rows, state: ui.gamesState, onSort: rerender })
        : UI.empty('Start a game and finish it to see it here.')),
    ]);
  }

  /* One set: its games together, with the series figures. */
  function setPage(id) {
    var set = S.setsOf(allGames(), { all: true }).filter(function (x) { return x.id === id; })[0];
    if (!set || set.standalone) {
      draw([head('Set not found'), subnav('games'), UI.card(null, null, el('p', { class: 'sh-note' }, [
        'That set is not in your vault. ', el('a', { href: '#/shots', text: 'Back to games' }), '.',
      ]))]);
      return;
    }
    var done = set.games.filter(function (g) { return g.status === 'done'; });
    var a = S.analyze(done);
    var heading = set.complete ? 'Series: ' + set.total : 'Set in progress: ' + set.total + ' so far';
    var tiles = UI.statGrid([
      UI.stat(set.complete ? 'Series' : 'So far', String(set.total)),
      UI.stat('Average', UI.avg(set.average)),
      UI.stat('High game', UI.num(a.high)),
      UI.stat('Low game', UI.num(a.low)),
      UI.stat('Strike %', pct1(a.strikePct), a.strikes + ' strikes in ' + a.racks + ' first balls.'),
      UI.stat('Spare %', pct1(a.sparePct), a.spares + ' of ' + a.attempts + ' spare tries.'),
      UI.stat('Makeable spare %', pct1(a.makeablePct), a.makeable.made + ' of ' + a.makeable.attempts + ' tries that were not splits.'),
      UI.stat('Open frames', String(a.opens)),
      UI.stat('First-ball avg', UI.avg(a.firstBallAvg)),
    ]);
    var next = set.games.length < set.size;
    var blocks = set.games.map(function (g, i) {
      var sc = S.score(g);
      return UI.card('Game ' + (g.gameNo || i + 1) + (g.status === 'done' ? ': ' + sc.total : ' (open)'),
        [g.lane ? 'lane ' + g.lane : null, ballNames(g)].filter(Boolean).join(' · '),
        el('div', { class: 'sh-cardwrap' }, [
          scorecard(g, null, { editable: true }),
          el('p', { class: 'sh-hint sh-tapnote' }, el('a', { href: '#/shots/game/' + g.id, text: g.status === 'done' ? 'Open this game' : 'Resume this game' })),
          el('div', { class: 'sh-actions sh-center' }, [
            set.games.length > 1 ? button('Remove from series', once(function () {
              if (!window.confirm('Take game ' + (g.gameNo || i + 1) + ' out of this series? It stays as a single game and the others are renumbered.')) return;
              return saveGames(S.leaveSet(set.games, g.id)).then(function () { backgroundSync(); rerender(); });
            })) : null,
            button('Delete', once(function () {
              if (!window.confirm('Delete game ' + (g.gameNo || i + 1) + '? This cannot be undone.')) return;
              return deleteGame(g).then(function () { location.hash = set.games.length > 1 ? '#/shots/set/' + set.id : '#/shots'; rerender(); });
            }), 'danger'),
          ]),
        ]));
    });
    /* Change the length of the series, or bring in a game that was entered on its own. */
    var sizeSelect = el('select', null, [2, 3, 4, 5, 6, 7, 8].filter(function (n) { return n >= set.games.length; }).map(function (n) {
      return el('option', { value: String(n), selected: n === set.size }, n + ' games');
    }));
    var singles = S.setsOf(allGames(), { all: true }).filter(function (x) { return x.standalone; }).map(function (x) { return x.games[0]; })
      .sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    var pickSingle = el('select', null, singles.map(function (g) {
      return el('option', { value: g.id }, UI.shortDate(g.date) + ' · ' + (g.status === 'done' ? S.score(g).total : 'open') +
        (g.lane ? ' · lane ' + g.lane : '') + (S.ballsInGame(g).length ? ' · ' + ballName(S.ballsInGame(g)[0]) : ''));
    }));
    var manage = UI.card('Manage this series', 'Games in it, and which games belong', el('div', { class: 'card-body sh-stack' }, [
      el('div', { class: 'sh-actions' }, [
        field('Games in the series', sizeSelect),
        button('Set length', once(function () {
          var size = Number(sizeSelect.value);
          if (size === set.size) return;
          return saveGames(S.resizeSet(set.games, size)).then(function () { backgroundSync(); rerender(); });
        })),
      ]),
      next ? null : el('div', { class: 'sh-actions' }, el('a', { class: 'sh-btn', href: '#/shots/new/' + set.id, text: 'Add another game to this series' })),
      singles.length ? el('div', { class: 'sh-actions' }, [
        field('Add a game you already entered', pickSingle),
        button('Add to series', once(function () {
          var picked = singles.filter(function (g) { return g.id === pickSingle.value; })[0];
          if (!picked) return;
          return saveGames(S.joinSet(set.games, picked)).then(function () { backgroundSync(); rerender(); });
        })),
      ]) : el('p', { class: 'sh-note', text: 'Games that are not in a series show up here to add. None right now.' }),
    ]));

    draw([
      head(heading, [UI.shortDate(set.date), set.pattern, set.location].filter(Boolean).join(' · ')),
      subnav('games'),
      UI.card(null, null, el('div', { class: 'card-body sh-stack' }, [
        tiles,
        next ? el('div', { class: 'sh-actions' }, el('a', { class: 'sh-btn is-primary', href: '#/shots/new/' + set.id, text: 'Bowl game ' + (set.games.length + 1) + ' of ' + set.size })) : null,
        done.length ? sharePanel(set.complete ? 'Share series scorecard' : 'Share scorecard so far', done, 'series-' + (set.date || today())) : null,
        set.games.length > 1 ? el('p', { class: 'sh-note', text: 'Games: ' + set.games.map(function (g) {
          return g.status === 'done' ? S.score(g).total : 'open';
        }).join(' · ') }) : null,
      ])),
    ].concat(blocks).concat([manage]));
  }

  /* ---------- starting a game ---------- */

  function ballPicker(label, noneLabel, value) {
    var balls = activeBalls();
    var select = el('select');
    if (noneLabel) select.appendChild(el('option', { value: '' }, noneLabel));
    balls.forEach(function (b) { select.appendChild(el('option', { value: b.id }, b.name)); });
    select.appendChild(el('option', { value: NEW }, '＋ New ball…'));
    var input = el('input', { type: 'text', placeholder: 'Ball name', autocapitalize: 'words' });
    var pic = thumb(null, 'md');
    function sync() {
      input.hidden = select.value !== NEW;
      var next = thumb(select.value, 'md');
      pic.replaceWith(next);
      pic = next;
    }
    select.addEventListener('change', sync);
    select.value = value && balls.some(function (b) { return b.id === value; }) ? value : (noneLabel ? '' : (balls[0] ? balls[0].id : NEW));
    sync();
    return {
      node: field(label, el('div', { class: 'sh-pair' }, [el('div', { class: 'sh-ballrow' }, [pic, select]), input])),
      /* Resolves to { id } or { name } for a ball that still has to be created. */
      /* Moves the picker to a ball (or "same ball" when there is none). */
      set: function (id) {
        var ok = !id || balls.some(function (b) { return b.id === id; });
        if (!ok) return;
        select.value = id || (noneLabel ? '' : select.value);
        sync();
      },
      read: function () {
        if (select.value === NEW) return input.value.trim() ? { name: input.value.trim() } : { missing: true };
        return { id: select.value || null };
      },
    };
  }

  function newGamePage(wanted) {
    var all = allGames();
    var games = all.slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    var last = games[0] || {};

    /* A set with games still to bowl can be carried on. The newest one is the
       default when it is recent, or when the page was opened for it. */
    var openSets = S.setsOf(all, { all: true }).filter(function (x) { return !x.standalone && (x.games.length < x.size || x.id === wanted); })
      .sort(function (a, b) { return (b.games[b.games.length - 1].createdAt || '').localeCompare(a.games[a.games.length - 1].createdAt || ''); });
    var recent = openSets.filter(function (x) {
      var at = Date.parse(x.games[x.games.length - 1].createdAt || '');
      return at && Date.now() - at < 36 * 3600 * 1000;
    })[0];
    var chosen = wanted ? openSets.filter(function (x) { return x.id === wanted; })[0] : recent;
    var base = chosen ? chosen.games[chosen.games.length - 1] : last;

    var carry = base.id ? S.currentBalls(base) : {};
    /* A set is bowled on one date and starts on one lane, so the rest of it follows the first game. */
    var starter = chosen ? chosen.games[0] : null;
    var date = el('input', { type: 'date', value: starter && starter.date ? starter.date : today(), required: true });
    var meta0 = starter || base;
    var where = el('input', { type: 'text', list: 'sh-locations', value: meta0.location || '', autocapitalize: 'words', placeholder: 'e.g. Leisure Time Bowling' });
    var pattern = el('input', { type: 'text', list: 'sh-patterns', value: meta0.pattern || '', autocapitalize: 'words', placeholder: 'e.g. Kegel Flagship, house shot' });
    var event = el('select', null, S.EVENTS.map(function (e) {
      return el('option', { value: e, selected: e === (meta0.event || 'league') }, e.charAt(0).toUpperCase() + e.slice(1));
    }));
    var lane = el('input', { type: 'text', inputmode: 'numeric', placeholder: 'e.g. 23', value: starter && starter.lane ? starter.lane : '' });
    var strike = ballPicker('Ball', null, carry.strike);
    var spare = ballPicker('Spare ball (if different)', 'Same ball', base.spareBall);
    var err = errorLine();

    /* Which set this game belongs to. */
    var setSelect = el('select', null, [
      el('option', { value: 'new' }, 'A new set'),
      el('option', { value: 'single' }, 'A single game, not in a set'),
    ].concat(openSets.map(function (x) {
      return el('option', { value: x.id }, (x.games.length < x.size ? 'Game ' + (x.games.length + 1) + ' of ' + x.size + ' in' : 'Add game ' + (x.games.length + 1) + ' to') + ' the set from ' + UI.shortDate(x.date) +
        ' (' + x.games.map(function (g) { return g.status === 'done' ? S.score(g).total : 'open'; }).join(', ') + ')');
    })));
    var sizeSelect = el('select', null, [2, 3, 4, 5, 6].map(function (n) {
      return el('option', { value: String(n), selected: n === 3 }, n + ' games');
    }));
    var sizeField = field('Games in the set', sizeSelect, 'Three is the usual night.');
    setSelect.value = chosen ? chosen.id : 'new';
    function syncSet() { sizeField.hidden = setSelect.value !== 'new'; }
    setSelect.addEventListener('change', function () {
      syncSet();
      var picked = openSets.filter(function (x) { return x.id === setSelect.value; })[0];
      if (picked) {
        /* Everything about the night comes from the first game; the ball from the last. */
        var first = picked.games[0], last = picked.games[picked.games.length - 1];
        var balls = S.currentBalls(last);
        where.value = first.location || '';
        pattern.value = first.pattern || '';
        event.value = first.event || event.value;
        date.value = first.date || date.value;
        lane.value = first.lane || '';
        strike.set(balls.strike);
        spare.set(last.spareBall || '');
      }
    });
    syncSet();

    var form = el('form', {
      class: 'sh-form',
      onsubmit: once(function (e) {
        e.preventDefault();
        /* A game in this set that nothing has been bowled in yet is the one to carry on with. */
        var waiting = (openSets.filter(function (x) { return x.id === setSelect.value; })[0] || { games: [] }).games
          .filter(function (g) { return g.status === 'open' && !(g.frames || []).length; })[0];
        if (waiting) { location.hash = '#/shots/game/' + waiting.id; return; }
        var a = strike.read();
        var b = spare.read();
        if (a.missing || (b.missing)) return showError(err, 'Name the new ball, or pick one from the list.');
        var id;
        return getVault().commit(function (lib) {
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
          var meta = {
            date: date.value || today(), location: where.value.trim(), pattern: pattern.value.trim(),
            event: event.value, lane: lane.value.trim(), ball: ballId, spareBall: spareId === ballId ? null : spareId,
          };
          var picked = openSets.filter(function (x) { return x.id === setSelect.value; })[0];
          if (picked) {
            meta.setId = picked.id;
            meta.setSize = picked.size;
            meta.gameNo = Math.max.apply(null, picked.games.map(function (g) { return g.gameNo || 0; })) + 1;
            /* Adding to a full series makes it one game longer. */
            if (meta.gameNo > picked.size) {
              meta.setSize = meta.gameNo;
              lib.games.forEach(function (x, i) {
                if (x.setId === picked.id) { x.setSize = meta.gameNo; x.updatedAt = now(); }
              });
            }
          } else if (setSelect.value === 'new') {
            meta.setId = uid('s');
            meta.gameNo = 1;
            meta.setSize = Number(sizeSelect.value) || 3;
          }
          var g = S.newGame(meta);
          lib.games.push(g);
          id = g.id;
        }).then(function () {
          ui.draft = null;
          location.hash = '#/shots/game/' + id;
        }, function (ex) { showError(err, ex.message); });
      }),
    }, [
      el('div', { class: 'sh-grid' }, [field('Part of', setSelect), sizeField]),
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
      head('New game', chosen ? 'Carrying on the set. Conditions and ball are as you left them.' : 'Set the conditions once; every shot is tagged with them.'),
      subnav('games'),
      UI.card(null, null, el('div', { class: 'card-body' }, [
        datalist('sh-locations', S.distinct(allGames(), 'location')),
        datalist('sh-patterns', S.distinct(allGames(), 'pattern')),
        form,
      ])),
    ]);
  }

  /* ---------- the scorecard ---------- */

  /* opts.editable: a finished frame is a link to correct just that frame.
     opts.editing: the frame being redone, shown highlighted. */
  function scorecard(game, pos, opts) {
    opts = opts || {};
    var sc = S.score(game);
    var changed = {};
    S.switches(game).forEach(function (x) { changed[x.frame - 1] = true; });
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
      var bowled = (game.frames || [])[f] && S.frameDone(f, game.frames[f].shots || []);
      var link = opts.editable && bowled;
      cells.push(el(link ? 'a' : 'div', {
        class: 'sh-frame' + (f === 9 ? ' is-tenth' : '') + (pos && pos.frame === f ? ' is-current' : '') +
               (changed[f] ? ' has-switch' : '') + (opts.editing === f ? ' is-editing' : '') + (link ? ' is-link' : ''),
        href: link ? '#/shots/game/' + game.id + '/frame/' + (f + 1) : null,
        'aria-label': link ? 'Edit frame ' + (f + 1) : null,
        title: link ? 'Tap to correct frame ' + (f + 1) : (changed[f] ? 'Ball changed in this frame' : null),
      }, [
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

  function gamePage(id, rest) {
    var game = gameById(id);
    if (!game) {
      draw([head('Game not found'), subnav('games'), UI.card(null, null, el('p', { class: 'sh-note' }, [
        'That game is not in your vault. ', el('a', { href: '#/shots', text: 'Back to games' }), '.',
      ]))]);
      return;
    }
    if (rest && rest[0] === 'frame') return editFramePage(game, Number(rest[1]) - 1);
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

  /* Saves several games at once (a series being edited), each stamped as changed. */
  function saveGames(changed) {
    return getVault().commit(function (lib) {
      changed.forEach(function (g) {
        g.updatedAt = now();
        var i = lib.games.map(function (x) { return x.id; }).indexOf(g.id);
        if (i === -1) lib.games.push(g); else lib.games[i] = g;
      });
    });
  }

  /* All the games of the series this one belongs to, itself included. */
  function seriesOf(game) {
    var set = game.setId ? S.setsOf(allGames(), { all: true }).filter(function (x) { return x.id === game.setId; })[0] : null;
    return set ? set.games : [game];
  }

  /* Deleting a game from a series closes the gap in its numbering. */
  function deleteGame(game) {
    var changed = game.setId ? S.dropFromSet(seriesOf(game), game.id)
      : [Object.assign(JSON.parse(JSON.stringify(game)), { deleted: true })];
    return saveGames(changed).then(function () { backgroundSync(); });
  }

  /* A tap that arrives while the last one is still being saved is ignored, so
     a slow device cannot record the same thing twice. */
  function once(fn) {
    return function (ev) {
      /* Even a tap that is ignored must not fall through to a native form submit. */
      if (ev && ev.type === 'submit') ev.preventDefault();
      if (ui.busy) return;
      ui.busy = true;
      var release = function () { ui.busy = false; };
      var timer = setTimeout(release, 15000);
      var done = function () { clearTimeout(timer); release(); };
      var result;
      try { result = fn.apply(this, arguments); } catch (e) { done(); throw e; }
      Promise.resolve(result).then(done, done);
    };
  }

  function shotCount(game) { return S.walk(game).length; }

  /* "Game 2 of 3" for a game in a set. */
  function setLabel(game) {
    return game.setId ? 'Game ' + (game.gameNo || 1) + ' of ' + (game.setSize || 3) : null;
  }

  /* The ball in hand is whatever the game last used, so a switch carries on
     into the next shot, and survives leaving the game and coming back. */
  function freshDraft(game, pos) {
    var carrying = S.currentBalls(game);
    ui.draft = {
      id: game.id, shots: shotCount(game), standing: [], hit: null, miss: null, ballOpen: false,
      ball: pos.fresh ? carrying.strike : carrying.spare,
    };
  }

  function entryPage(game) {
    ui.game = game;
    var pos = S.position(game);
    /* One short line instead of the title and tabs, so the entry controls
       and Save stay on screen without scrolling. */
    var nodes = [
      el('div', { class: 'sh-minihead' }, [
        el('a', { href: '#/shots', class: 'sh-back', text: '\u2039 Games' }),
        el('span', { class: 'sh-minititle', text: [game.pattern, setLabel(game), UI.shortDate(game.date), game.lane ? 'lane ' + game.lane : null]
          .filter(Boolean).join(' \u00b7 ') }),
      ]),
      el('section', { class: 'card sh-cardwrap sh-cardwrap-tight' }, [
        scorecard(game, pos, { editable: true }),
      ]),
    ];

    if (!pos) {
      nodes.push(finishCard(game));
    } else {
      if (!ui.draft || ui.draft.id !== game.id || ui.draft.shots !== shotCount(game)) freshDraft(game, pos);
      ui.panel = el('section', { class: 'card sh-entry' });
      fillPanel(game, pos, liveIO(game));
      nodes.push(ui.panel);
    }
    nodes.push(el('p', { class: 'sh-note sh-leave' }, [
      shotCount(game) ? 'Tap a frame on the card to correct it. ' : null,
      'Saved on this device after every shot, so ',
      el('a', { href: '#/shots', text: 'leave any time' }),
      ' and pick up later.',
    ]));
    nodes.push(el('p', { class: 'sh-note sh-leave' }, [
      button('Delete this game', once(function () {
        if (!window.confirm('Delete this game and everything entered in it?')) return;
        var series = game.setId ? seriesOf(game) : [];
        return deleteGame(game).then(function () {
          ui.draft = null;
          location.hash = series.filter(function (g) { return g.id !== game.id; }).length ? '#/shots/set/' + game.setId : '#/shots';
        });
      }), 'danger'),
    ]));
    draw(nodes);
  }

  /* How the panel saves, for a live game... */
  function liveIO(game) {
    function done() { ui.draft = null; entryPage(gameById(game.id)); }
    return {
      canUndo: shotCount(game) > 0,
      commit: function (next, pos, d) {
        /* A spare ball chosen here stays until you change it. Choosing the
           strike ball again puts spares back on it. */
        if (!pos.fresh) next.spareBall = d.ball === S.currentBalls(next).strike ? null : d.ball;
        return saveGame(next).then(done);
      },
      undo: function () { return saveGame(S.undo(game)).then(done); },
    };
  }

  /* ...and for redoing one frame of a game that is already bowled. */
  function editIO(game, f) {
    return {
      canUndo: shotCount(ui.edit.work) > f,
      commit: function (next) {
        ui.edit.work = next;
        var frame = next.frames[f];
        if (frame && S.frameDone(f, frame.shots)) {
          var fixed = S.replaceFrame(game, f, frame.shots);
          return saveGame(fixed).then(function () {
            ui.edit = null;
            ui.draft = null;
            location.hash = '#/shots/game/' + game.id;
          });
        }
        ui.draft = null;
        editFramePage(game, f);
        return Promise.resolve();
      },
      undo: function () {
        ui.edit.work = S.undo(ui.edit.work);
        ui.draft = null;
        editFramePage(game, f);
        return Promise.resolve();
      },
    };
  }

  /* A scratch game that holds only the frame being redone, with the balls it
     was bowled with, so the panel can do its usual job. */
  function scratchFor(game, f) {
    var old = (game.frames[f] && game.frames[f].shots) || [];
    var work = { id: game.id + '~' + (f + 1), frames: [], ball: game.ball, spareBall: game.spareBall || null };
    for (var i = 0; i < f; i++) work.frames.push({ shots: [{ standing: [] }] });
    var rack = S.walk({ frames: [game.frames[f]] });
    if (rack[0] && rack[0].ball) work.ball = rack[0].ball;
    var spare = rack.filter(function (c) { return !c.fresh && c.ball; })[0];
    if (spare && spare.ball !== work.ball) work.spareBall = spare.ball;
    return work;
  }

  function editFramePage(game, f) {
    var frames = game.frames || [];
    if (!(f >= 0 && f < frames.length && S.frameDone(f, frames[f].shots || []))) {
      location.hash = '#/shots/game/' + game.id;
      return;
    }
    if (!ui.edit || ui.edit.id !== game.id || ui.edit.frame !== f) {
      ui.edit = { id: game.id, frame: f, work: scratchFor(game, f) };
      ui.draft = null;
    }
    var work = ui.edit.work;
    var pos = S.position(work);
    var was = S.score(game).frames[f].marks.map(function (m) { return m.text; }).join(' ');
    if (!ui.draft || ui.draft.id !== work.id || ui.draft.shots !== shotCount(work)) freshDraft(work, pos);
    ui.panel = el('section', { class: 'card sh-entry' });
    fillPanel(work, pos, editIO(game, f));
    draw([
      head('Correct frame ' + (f + 1), 'Enter the frame again. The frames after it stay as they are, and the card recalculates.'),
      subnav('games'),
      el('section', { class: 'card sh-cardwrap' }, [
        scorecard(game, null, { editing: f }),
        el('p', { class: 'sh-hint sh-tapnote', text: 'Frame ' + (f + 1) + ' is recorded as: ' + was }),
      ]),
      ui.panel,
      el('p', { class: 'sh-note' }, [
        el('a', { href: '#/shots/game/' + game.id, onclick: function () { ui.edit = null; ui.draft = null; }, text: 'Cancel and keep it as it was' }),
        '.',
      ]),
    ]);
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

  var BOLT = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.5 2 5 13.5h5.6L9.5 22 19 9.8h-5.7z"/></svg>';

  /* The entry panel. `work` is the game being bowled (or the one-frame scratch
     for a correction); `io` says how a saved shot is kept. */
  function fillPanel(work, pos, io) {
    var d = ui.draft;
    var panel = ui.panel;
    UI.clear(panel);

    var kind = pos.fresh ? (pos.tenth && pos.shot > 0 ? 'Fill ball' : 'First ball') : 'Spare try';
    var title = 'Frame ' + (pos.frame + 1) + ' · ' + kind;

    function refresh() { fillPanel(work, pos, io); }

    var err = errorLine();
    /* One tap that records the shot and moves on. */
    function quick(input) {
      var next;
      try { next = S.addShot(work, input); } catch (e) { return showError(err, e.message); }
      return io.commit(next, pos, d).then(null, function (e) { showError(err, e.message); });
    }

    var body = [];

    /* The ball: one quiet line beside the title, opened only to switch. */
    var carrying = S.currentBalls(work);
    var inHand = pos.fresh ? carrying.strike : carrying.spare;
    var ids = activeBalls().map(function (b) { return b.id; });
    [inHand, d.ball].forEach(function (id) { if (id && ids.indexOf(id) === -1) ids.push(id); });
    var role = pos.fresh ? 'Ball' : 'Spare ball';
    var switching = d.ball !== inHand;
    var children = [
      el('div', { class: 'card-head sh-entry-head' }, [
        el('div', { class: 'card-title' }, el('h2', { text: title })),
        el('div', { class: 'sh-ballsum' }, [
          el('span', { class: 'sh-ballrow', title: role + ': ' + ballName(d.ball) }, [
            thumb(d.ball, 'sm'),
            el('span', { class: 'sh-note sh-ballname' + (switching ? ' sh-switch' : ''), text: ballName(d.ball) + (switching ? ' (switching)' : '') }),
          ]),
          ids.length > 1 ? el('button', {
            type: 'button', class: 'link-button', 'aria-expanded': d.ballOpen ? 'true' : 'false',
            onclick: function () { d.ballOpen = !d.ballOpen; refresh(); },
          }, d.ballOpen ? 'Done' : 'Change') : null,
        ]),
      ]),
    ];

    /* Changing the ball opens a row above the controls. */
    if (d.ballOpen && ids.length > 1) {
      body.push(el('div', { class: 'sh-chips', role: 'group', 'aria-label': role }, ids.map(function (id) {
        return el('button', {
          type: 'button', class: 'sh-chip sh-ballchip' + (d.ball === id ? ' is-on' : ''),
          'aria-pressed': d.ball === id ? 'true' : 'false',
          onclick: function () { d.ball = id; refresh(); },
        }, [thumb(id, 'sm'), el('span', { text: ballName(id) })]);
      })));
      if (switching) {
        body.push(el('p', { class: 'sh-note sh-switch', text: pos.fresh
          ? 'Switching from ' + ballName(inHand) + ' to ' + ballName(d.ball) + '. First balls from here on use it' +
            (work.spareBall ? '.' : ', and so do spares.')
          : 'Switching spare ball from ' + ballName(inHand) + ' to ' + ballName(d.ball) + ' from here on.' }));
      }
    }

    /* The fast path: a strike, or the spare, in one tap, beside the deck. */
    var noPins = d.standing.length === 0;
    var quickBtn = el('button', {
      type: 'button',
      class: 'sh-btn is-primary sh-quick',
      disabled: !noPins,
      onclick: once(function () {
        if (pos.fresh) return quick({ standing: [], hit: d.hit || undefined, ball: d.ball });
        return quick({ standing: [], ball: d.ball });
      }),
      title: pos.fresh ? 'Saves a strike right now' : 'Saves the spare right now',
    }, [
      el('span', { class: 'sh-bolt', html: BOLT }),
      el('span', { class: 'sh-quick-text' }, [
        el('span', { text: pos.fresh ? 'Strike' : 'Spare' }),
        pos.fresh && d.hit ? el('small', { text: S.HIT_LABELS[d.hit].toLowerCase() }) : null,
      ]),
    ]);

    var deck = pinDeck(pos.before, d.standing, function (pin) {
      var i = d.standing.indexOf(pin);
      if (i === -1) d.standing.push(pin); else d.standing.splice(i, 1);
      d.standing.sort(function (a, b) { return a - b; });
      if (d.standing.length === 0) d.miss = null;
      refresh();
    });

    body.push(el('div', { class: 'sh-entrygrid' }, [
      el('div', { class: 'sh-deckcol' }, [
        el('span', { class: 'sh-hint', text: pos.fresh ? 'Tap the pins still up' : 'Left: ' + pos.before.join(', ') + ' · tap what is still up' }),
        deck,
      ]),
      el('div', { class: 'sh-sidecol' }, [
        quickBtn,
        button('Missed all', function () { d.standing = pos.before.slice(); refresh(); }, null,
          { disabled: d.standing.length === pos.before.length, title: 'Every pin still standing' }),
        button('Clear pins', function () { d.standing = []; d.miss = null; refresh(); }, null, { disabled: !d.standing.length }),
      ]),
    ]));

    if (pos.fresh) {
      body.push(el('div', { class: 'sh-group' }, [
        el('span', { class: 'sh-label', text: 'How did it hit? (optional)' }),
        chips(S.HITS.map(function (h) { return { value: h, label: S.HIT_LABELS[h] }; }), d.hit,
          function (v) { d.hit = d.hit === v ? null : v; refresh(); }, 'How the shot hit'),
      ]));
    } else {
      /* Always drawn, so the Save button does not jump when a pin is tapped. */
      body.push(el('div', { class: 'sh-group' + (d.standing.length ? '' : ' is-idle') }, [
        el('span', { class: 'sh-label', text: 'Which way did you miss? (optional)' }),
        chips([{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }], d.miss,
          function (v) { d.miss = d.miss === v ? null : v; refresh(); }, 'Which way the spare was missed'),
      ]));
    }

    /* Nothing is required: pins, how it hit and which way a spare went are all optional. */
    var ready = true;
    body.push(el('p', { class: 'sh-summary', text: S.describeShot(pos, d.standing) +
      (pos.fresh && d.hit ? ' · ' + S.HIT_LABELS[d.hit] : '') +
      (!pos.fresh && d.standing.length && d.miss ? ' · missed ' + d.miss : '') }));
    body.push(err);
    body.push(el('div', { class: 'sh-actions sh-saverow' }, [
      button('Save shot', once(function () {
        var input = { standing: d.standing, ball: d.ball };
        if (pos.fresh) input.hit = d.hit; else if (d.standing.length && d.miss) input.miss = d.miss;
        var next;
        try { next = S.addShot(work, input); } catch (e) { return showError(err, e.message); }
        return io.commit(next, pos, d).then(null, function (e) { showError(err, e.message); });
      }), d.standing.length || !pos.fresh ? 'primary' : null, { disabled: !ready }),
      button('Undo', once(function () { return io.undo(); }), null, { disabled: !io.canUndo, title: 'Undo the last shot' }),
    ]));

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
        button('Save game', once(function () {
          var done = JSON.parse(JSON.stringify(game));
          done.status = 'done';
          done.notes = notes.value.trim();
          return saveGame(done).then(function () {
            ui.draft = null;
            backgroundSync();
            location.hash = '#/shots/game/' + game.id;
            rerender();
          }, function (e) { showError(err, e.message); });
        }), 'primary'),
        button('Undo last shot', once(function () {
          return saveGame(S.undo(game)).then(function () { ui.draft = null; entryPage(gameById(game.id)); });
        })),
      ]),
    ]));
  }

  /* ---------- a finished game ---------- */

  /* Picked the wrong ball? Swap it, on this game or every game in the set that used it. */
  function fixBallCard(game, mySet) {
    var used = S.ballsInGame(game);
    if (!used.length) return null;
    var picks = used.map(function (id) { return { id: id, picker: ballPicker('Change ' + ballName(id) + ' to', 'Keep ' + ballName(id), '') }; });
    var others = mySet ? mySet.games.filter(function (g) { return g.id !== game.id; }) : [];
    var wholeSet = el('input', { type: 'checkbox' });
    var err = errorLine();

    function apply() {
      var changes = [];
      for (var i = 0; i < picks.length; i++) {
        var to = picks[i].picker.read();
        if (to.missing) return showError(err, 'Name the new ball, or pick one from the list.');
        if (to.name || (to.id && to.id !== picks[i].id)) changes.push({ from: picks[i].id, to: to });
      }
      if (!changes.length) return showError(err, 'Pick a different ball first.');
      showError(err, '');
      getVault().commit(function (lib) {
        var targets = wholeSet.checked ? others.map(function (g) { return g.id; }).concat(game.id) : [game.id];
        changes.forEach(function (c) {
          var to = c.to.id;
          if (c.to.name) {
            var ball = { id: uid('b'), name: c.to.name, updatedAt: now() };
            lib.balls.push(ball);
            to = ball.id;
          }
          lib.games.forEach(function (g, i) {
            if (targets.indexOf(g.id) === -1 || g.deleted || S.ballsInGame(g).indexOf(c.from) === -1) return;
            var fixed = S.replaceBall(g, c.from, to);
            fixed.updatedAt = now();
            lib.games[i] = fixed;
          });
        });
      }).then(function () {
        backgroundSync();
        rerender();
      }, function (ex) { showError(err, ex.message); });
    }

    return UI.card('Wrong ball?', 'Fix which ball was used. Your stats by ball follow the change', el('div', { class: 'card-body sh-stack' }, [
      el('div', { class: 'sh-stack' }, picks.map(function (p) { return p.picker.node; })),
      others.length ? el('label', { class: 'sh-check' }, [wholeSet, el('span', { text: 'Also fix the other ' + plural(others.length, 'game') + ' in this set that used it' })]) : null,
      el('p', { class: 'sh-note', text: 'This changes the ball on every shot it threw. To change the ball for just one frame, tap that frame on the card.' }),
      err,
      el('div', { class: 'sh-actions' }, button('Change ball', apply, 'primary')),
    ]));
  }

  function reviewPage(game) {
    var mySet = game.setId ? S.setsOf(allGames(), { all: true }).filter(function (x) { return x.id === game.setId; })[0] : null;
    var sc = S.score(game);
    var s = S.analyze([game]);
    var tiles = UI.statGrid([
      UI.stat('Score', String(sc.total)),
      UI.stat('Strikes', String(s.strikes), 'Strikes out of ' + s.racks + ' first balls, fill balls included.'),
      UI.stat('Spares', s.attempts ? s.spares + ' of ' + s.attempts : '—', 'Spares made out of the spare tries.'),
      UI.stat('Makeable spares', s.makeable.attempts ? s.makeable.made + ' of ' + s.makeable.attempts : '—', 'Spares made out of the tries that were not splits.'),
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
      columns.push({ key: 'b', label: 'Ball', sortable: false, className: 'col-tight',
        render: function (r) {
          return el('span', { title: ballName(r.c.ball), 'aria-label': ballName(r.c.ball) }, thumb(r.c.ball, 'sm'));
        } });
    }

    var detail = [
      ['Date', UI.longDate(game.date)],
      ['Location', game.location || '—'],
      ['Oil pattern', game.pattern || '—'],
      ['Event', game.event ? game.event.charAt(0).toUpperCase() + game.event.slice(1) : '—'],
      ['Lane', game.lane || '—'],
      [S.ballsInGame(game).length > 1 ? 'Balls' : 'Ball', el('span', { class: 'sh-ballrow sh-wrap' },
        S.ballsInGame(game).reduce(function (acc, id, i) {
          if (i) acc.push(el('span', { class: 'sh-arrow', 'aria-hidden': 'true', text: '\u2192' }));
          acc.push(el('span', { class: 'sh-ballrow' }, [thumb(id, 'sm'), ballName(id)]));
          return acc;
        }, []))],
      S.switches(game).length ? ['Ball changes', S.switches(game).map(function (x) {
        return 'Frame ' + x.frame + ': ' + ballName(x.from) + ' \u2192 ' + ballName(x.to) + (x.role === 'spare' ? ' (spares)' : '');
      }).join('; ')] : null,
      game.notes ? ['Notes', game.notes] : null,
    ].filter(Boolean);

    var frameSelect = el('select', null, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(function (n) {
      return el('option', { value: String(n - 1) }, 'Frame ' + n);
    }));

    draw([
      head('Game: ' + sc.total, [setLabel(game), UI.shortDate(game.date), game.pattern].filter(Boolean).join(' · ')),
      subnav('games'),
      el('section', { class: 'card sh-cardwrap' }, [
        scorecard(game, null, { editable: true }),
        el('p', { class: 'sh-hint sh-tapnote', text: 'Tap a frame on the card to correct just that frame.' }),
      ]),
      UI.card(null, null, el('div', { class: 'card-body sh-stack' }, [
        tiles,
        sharePanel('Share game scorecard', [game], 'game-' + (game.date || today())),
        mySet ? el('p', { class: 'sh-note sh-switch', text: mySet.complete
          ? 'Series complete: ' + mySet.total + ' (' + mySet.totals.join(' \u00b7 ') + ')'
          : setLabel(game) + ' bowled. Series so far: ' + mySet.total + '.' }) : null,
        el('div', { class: 'sh-actions' }, [
          el('a', { class: 'sh-btn is-primary', href: mySet && mySet.games.length < mySet.size ? '#/shots/new/' + mySet.id : '#/shots/new',
            text: mySet && mySet.games.length < mySet.size ? 'Bowl game ' + (mySet.games.length + 1) + ' of ' + mySet.size : 'Start a new set' }),
          mySet ? el('a', { class: 'sh-btn', href: '#/shots/set/' + mySet.id, text: 'See the set' }) : null,
        ]),
        S.switches(game).length ? el('p', { class: 'sh-note', text: 'A dot over a frame number on the card marks where the ball changed.' }) : null,
      ])),
      UI.card('Conditions', null, el('dl', { class: 'sh-detail' }, detail.reduce(function (acc, row) {
        acc.push(el('dt', { text: row[0] }), typeof row[1] === 'object' ? el('dd', null, row[1]) : el('dd', { text: row[1] }));
        return acc;
      }, []))),
      fixBallCard(game, mySet),
      UI.card('Shot by shot', null, UI.table({ columns: columns, rows: rows, state: null, onSort: function () {} })),
      UI.card('Fix or remove', null, el('div', { class: 'card-body sh-stack' }, [
        el('p', { class: 'sh-note', text: 'Entered one frame wrong? Tap it on the card above and enter just that frame again. To redo the whole rest of the game, re-bowl from a frame: that frame and everything after it is cleared and the game reopens.' }),
        el('div', { class: 'sh-actions' }, [
          field('From', frameSelect),
          button('Re-bowl from here', function () {
            if (!window.confirm('Clear frame ' + (Number(frameSelect.value) + 1) + ' onwards and reopen this game?')) return;
            var reopened = S.truncate(game, Number(frameSelect.value));
            reopened.status = 'open';
            saveGame(reopened).then(function () { ui.draft = null; rerender(); });
          }),
          mySet ? button('Remove from series', once(function () {
            if (!window.confirm('Take this game out of its series? It stays as a single game and the others are renumbered.')) return;
            return saveGames(S.leaveSet(seriesOf(game), game.id)).then(function () { backgroundSync(); rerender(); });
          })) : null,
          button('Delete game', once(function () {
            if (!window.confirm('Delete this game? This cannot be undone.')) return;
            return deleteGame(game).then(function () { location.hash = mySet && mySet.games.length > 1 ? '#/shots/set/' + mySet.id : '#/shots'; });
          }), 'danger'),
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
      UI.stat('Makeable spare %', pct1(stats.makeablePct), 'Spares made out of the tries that were not splits: ' + stats.makeable.made + ' of ' + stats.makeable.attempts + '. The ones you are expected to get.'),
      UI.stat('Pocket %', pct1(h.pocket.pct), 'Share of first balls that hit the pocket, of those where you recorded how it hit.'),
      UI.stat('First-ball avg', UI.avg(stats.firstBallAvg), 'Pins knocked down by the first ball, on average. Ten is a strike.'),
      UI.stat('Opens / game', UI.avg(stats.opensPerGame), 'Frames where the spare was missed. Splits missed count.'),
      UI.stat('Clean games', stats.games ? stats.clean + ' of ' + stats.games : '—', 'Games with no open frame.'),
      UI.stat('200+ games', stats.games ? stats.over200 + ' of ' + stats.games : '—'),
      UI.stat('Best strike run', String(stats.bestStreak), 'Most strikes in a row, fill balls included. Three in a row is a turkey: ' + stats.streaks3 + ' so far.'),
      UI.stat('Splits', pct1(stats.splitPct), 'How often the first ball left a split.'),
      UI.stat('Strikes / game', UI.avg(stats.strikesPerGame), 'Strikes in an average game, fill balls included.'),
      UI.stat('Ball changes', stats.games ? stats.switched + ' of ' + stats.games : '\u2014', 'Games where you switched balls partway through.'),
    ]);

    /* first-ball hits */
    var hitRows = S.HITS.filter(function (k) { return h[k].n; }).map(function (k) {
      return { name: S.HIT_LABELS[k], key: k, hit: h[k] };
    });
    var hitBars = hitRows.map(function (r) {
      return { label: r.name, value: (r.hit.pct || 0) * 100, display: pct(r.hit.pct),
        title: r.name + ': ' + r.hit.n + ' shots, ' + pct(r.hit.strikePct) + ' were strikes' };
    });
    var hitCard = UI.card('How the first ball hits', stats.hitsRecorded + ' of ' + plural(stats.racks, 'first ball') + ' recorded',
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
      'Where the ball met the pins, and what it did to them. Strike % is the share of that kind of hit that carried for a strike, so a low number on pocket hits means carry, not accuracy.' +
        ' Only first balls where you chose a hit are counted here, so the more you record, the more this tells you.');

    /* spares */
    function spareRow(name, b) {
      return { name: name, b: b };
    }
    var spareRows = [
      spareRow('Single pin', stats.single),
      spareRow('Several pins', stats.cluster),
      spareRow('Splits', stats.split),
      spareRow('Makeable (no splits)', {
        attempts: stats.makeable.attempts, made: stats.makeable.made, pct: stats.makeablePct,
        left: stats.single.left + stats.cluster.left, right: stats.single.right + stats.cluster.right,
      }),
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
      .filter(function (g) { return !f.ball || S.primaryBall(g) === f.ball; })
      .sort(function (a, b) { return (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''); });
    var trend = Charts.line({
      points: ordered.map(function (g, i) {
        return { label: UI.shortDate(g.date) + (g.pattern ? ' · ' + g.pattern : ''), axis: UI.shortDate(g.date),
          value: S.score(g).total, caption: ballNames(g) };
      }),
      reference: stats.average == null ? null : { value: stats.average, label: 'avg ' + UI.avg(stats.average) },
      label: 'Game scores over time',
    });

    draw([
      head('Stats', plural(stats.games, 'game') + (f.ball ? ' with ' + ballName(f.ball) : '')),
      subnav('stats'),
      UI.card(null, null, el('div', { class: 'card-body sh-stack' }, [controls])),
      UI.card(null, null, el('div', { class: 'card-body' }, tiles)),
      seriesCard(filtered, f.ball),
      compareCard(filtered),
      hitCard,
      spareCard,
      UI.card('Strike % by frame', 'Do you start strong or fade?', el('div', { class: 'card-body' }, frameChart)),
      leaveCard,
      UI.card('Scores', 'Every game, in order', el('div', { class: 'card-body' }, trend)),
    ]);
  }

  /* Games bowled together, measured together. */
  function seriesCard(games, ballFilter) {
    var sets = S.setsOf(games).filter(function (x) { return !ballFilter || S.setBall(x) === ballFilter; });
    var ser = S.seriesStats(sets);
    if (!ser.count) {
      return UI.card('Series', 'Games bowled together', UI.empty(
        ser.slots.length ? 'Finish every game of a set and its series figures appear here.' : 'Start a game as part of a set to see series figures.'));
    }
    var tiles = UI.statGrid([
      UI.stat('Series bowled', String(ser.count)),
      UI.stat('Average series', UI.num(ser.average), 'The total of a set, averaged over every complete set shown. Only sets with every game bowled count.'),
      UI.stat('High series', UI.num(ser.high)),
      UI.stat('Low series', UI.num(ser.low)),
      UI.stat('600+ series', String(ser.over600), 'Sets averaging 200 or more a game, which is 600 over three.'),
      UI.stat('700+ series', String(ser.over700), 'Sets averaging 233 or more a game, which is 700 over three.'),
      UI.stat('Game to game', UI.avg(ser.spread, 0) + ' pins', 'How far apart your best and worst game of a set are, on average. Smaller is steadier.'),
      UI.stat('Finish vs start', (ser.fade > 0 ? '+' : '') + UI.avg(ser.fade, 0), 'Your last game of a set against your first, on average. Positive means you finish stronger.'),
    ]);
    var slotRows = ser.slots.map(function (x) { return { name: 'Game ' + x.slot, x: x }; });
    var slotTable = UI.table({
      columns: [
        { key: 'n', label: 'Place in set', sortable: false, className: 'col-name', render: function (r) { return r.name; } },
        { key: 'g', label: 'Games', sortable: false, render: function (r) { return String(r.x.games); } },
        { key: 'a', label: 'Avg', sortable: false, className: 'num-strong', render: function (r) { return UI.avg(r.x.average); } },
        { key: 'h', label: 'High', sortable: false, render: function (r) { return UI.num(r.x.high); } },
        { key: 's', label: 'Strike %', sortable: false, render: function (r) { return pct(r.x.strikePct); } },
        { key: 'p', label: 'Spare %', sortable: false, render: function (r) { return pct(r.x.sparePct); } },
      ], rows: slotRows, state: null, onSort: function () {},
    });
    var trend = Charts.line({
      points: ser.sets.map(function (x) {
        return { label: UI.shortDate(x.date) + (x.pattern ? ' \u00b7 ' + x.pattern : ''), axis: UI.shortDate(x.date),
          value: x.total, caption: x.totals.join(' \u00b7 ') };
      }),
      reference: { value: ser.average, label: 'avg ' + UI.num(ser.average) },
      label: 'Series over time',
    });
    return UI.card('Series', plural(ser.count, 'set') + ' of games bowled together',
      el('div', null, [
        el('div', { class: 'card-body' }, tiles),
        slotTable,
        ser.sets.length > 1 ? el('div', { class: 'card-body' }, trend) : null,
      ]),
      'Games bowled in one sitting, added up. A set only counts once every game in it is bowled, so a half-finished night never pulls the average down. The table shows whether you start strong or tire as the night goes on.');
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
      return { name: r.label, key: r.key, s: r.stats, series: r.series };
    });
    function col(key, label, get, render, opts) {
      return Object.assign({ key: key, label: label, value: get, render: render }, opts || {});
    }
    var columns = [
      col('name', ui.compareBy === 'ball' ? 'Ball' : dims.filter(function (d) { return d[0] === ui.compareBy; })[0][1],
        function (r) { return r.name; }, function (r) {
          return ui.compareBy === 'ball'
            ? el('span', { class: 'sh-ballrow' }, [thumb(r.key, 'sm'), r.name])
            : r.name;
        }, { className: 'col-name', defaultDir: 'asc' }),
      col('games', 'Games', function (r) { return r.s.games; }, function (r) { return String(r.s.games); }),
      col('avg', 'Avg', function (r) { return r.s.average; }, function (r) { return UI.avg(r.s.average); }, { className: 'num-strong' }),
      col('high', 'High', function (r) { return r.s.high; }, function (r) { return UI.num(r.s.high); }),
      col('strike', 'Strike %', function (r) { return r.s.strikePct; }, function (r) { return pct(r.s.strikePct); }),
      col('spare', 'Spare %', function (r) { return r.s.sparePct; }, function (r) { return pct(r.s.sparePct); }),
      col('makeable', 'Makeable %', function (r) { return r.s.makeablePct; }, function (r) { return pct(r.s.makeablePct); }),
      col('pocket', 'Pocket', function (r) { return r.s.hits.pocket.pct; }, function (r) { return pct(r.s.hits.pocket.pct); }, { optional: true }),
      col('high%', 'High', function (r) { return r.s.hits.high.pct; }, function (r) { return pct(r.s.hits.high.pct); }, { optional: true }),
      col('light', 'Light', function (r) { return r.s.hits.light.pct; }, function (r) { return pct(r.s.hits.light.pct); }, { optional: true }),
      col('brooklyn', 'Brooklyn', function (r) { return r.s.hits.brooklyn.pct; }, function (r) { return pct(r.s.hits.brooklyn.pct); }, { optional: true }),
      col('fb', '1st ball', function (r) { return r.s.firstBallAvg; }, function (r) { return UI.avg(r.s.firstBallAvg); }, { optional: true }),
      col('opens', 'Opens/g', function (r) { return r.s.opensPerGame; }, function (r) { return UI.avg(r.s.opensPerGame); }, { optional: true }),
      col('series', 'Avg series', function (r) { return r.series && r.series.count ? r.series.average : null; },
        function (r) { return r.series && r.series.count ? UI.num(r.series.average) : '\u2014'; }, { optional: true }),
      col('hs', 'High series', function (r) { return r.series && r.series.count ? r.series.high : null; },
        function (r) { return r.series && r.series.count ? UI.num(r.series.high) : '\u2014'; }, { optional: true }),
    ];
    return UI.card('Compare', 'Pocket, high, light and Brooklyn are shares of first balls',
      el('div', null, [picker, rows.length
        ? UI.table({ columns: columns, rows: rows, state: ui.compareState, onSort: rerender })
        : UI.empty('Nothing to compare yet.')]),
      'The same numbers for each ball, oil pattern, location, lane or event. Ball rows count the shots thrown with that ball: first balls on the strike ball, spare tries on the spare ball. Averages and highs are for games bowled mostly with it, meaning it threw the most first balls; a game where you switched counts toward one ball only.');
  }

  /* ---------- arsenal ---------- */

  function arsenalPage() {
    var pool = S.finished(allGames());
    var balls = library().balls.filter(function (b) { return !b.deleted; });
    var stats = {};
    balls.forEach(function (b) { stats[b.id] = S.analyze(pool, { ball: b.id }); });

    var name = el('input', { type: 'text', placeholder: 'e.g. Storm Bionic', autocapitalize: 'words', required: true });
    var notes = el('input', { type: 'text', placeholder: 'Weight, coverstock, surface (optional)' });
    var photo = photoField(null);
    var err = errorLine();
    var add = el('form', {
      class: 'sh-form',
      onsubmit: function (e) {
        e.preventDefault();
        if (!name.value.trim()) return showError(err, 'Give the ball a name.');
        var image = photo.value();
        getVault().commit(function (lib) {
          var ball = { id: uid('b'), name: name.value.trim(), notes: notes.value.trim(), updatedAt: now() };
          if (image) ball.image = image;
          lib.balls.push(ball);
        }).then(rerender, function (ex) { showError(err, ex.message); });
      },
    }, [
      el('div', { class: 'sh-grid' }, [field('Ball', name), field('Notes', notes)]),
      photo.node,
      err,
      el('div', { class: 'sh-actions' }, el('button', { type: 'submit', class: 'sh-btn is-primary', text: 'Add to arsenal' })),
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
        var pic = photoField(b.image || null);
        return el('div', { class: 'sh-ball is-editing' }, [
          el('div', { class: 'sh-stack' }, [
            el('div', { class: 'sh-grid' }, [field('Name', n), field('Notes', m)]),
            pic.node,
            el('div', { class: 'sh-actions' }, [
              button('Save', function () {
                if (!n.value.trim()) return;
                var image = pic.value();
                ui.editingBall = null;
                update(b.id, function (x) {
                  x.name = n.value.trim();
                  x.notes = m.value.trim();
                  if (image === null) delete x.image; else if (image) x.image = image;
                });
              }, 'primary'),
              button('Cancel', function () { ui.editingBall = null; rerender(); }),
            ]),
          ]),
        ]);
      }
      return el('div', { class: 'sh-ball' + (b.retired ? ' is-retired' : '') }, [
        thumb(b.id),
        el('div', { class: 'sh-ball-main' }, [
          el('strong', { text: b.name }),
          b.notes ? el('span', { class: 'sh-hint', text: b.notes }) : null,
          el('span', { class: 'sh-hint', text: s.racks
            ? plural(s.games, 'game') + ' as main ball · strike ' + pct(s.strikePct) + ' · spare ' + pct(s.sparePct) + (s.average != null ? ' · avg ' + UI.avg(s.average) : '')
            : 'Not used yet' }),
        ]),
        el('div', { class: 'sh-actions' }, [
          button('Edit', function () { ui.editingBall = b.id; rerender(); }),
          button(b.retired ? 'Bring back' : 'Retire', function () { update(b.id, function (x) { x.retired = !x.retired; }); }),
        ]),
      ]);
    })) : UI.empty('Nothing here yet. Add the balls in your bag.');

    draw([
      head('Arsenal', 'Everything you bowl with'),
      subnav('arsenal'),
      UI.card('Your arsenal', 'Retiring a ball hides it from the pickers but keeps its history', el('div', { class: 'card-body sh-stack' }, [list])),
      reportCard(pool),
      UI.card('Add to your arsenal', null, el('div', { class: 'card-body' }, add)),
    ]);
  }

  /* The ball report: pick balls, get a long infographic and a PDF. */
  function reportCard(pool) {
    var counts = {};
    pool.forEach(function (g) { var id = S.primaryBall(g); if (id) counts[id] = (counts[id] || 0) + 1; });
    var ready = allBalls().filter(function (b) { return counts[b.id] >= 2; })
      .sort(function (a, b) { return counts[b.id] - counts[a.id]; });
    var MAX = 4;
    if (ready.length < 2) {
      return UI.card('Ball report', 'A shareable infographic comparing your balls', el('div', { class: 'card-body' },
        el('p', { class: 'sh-note', text: 'It needs at least two balls with two finished games each as the main ball. ' +
          (ready.length ? ready[0].name + ' is the only one so far.' : 'None qualify yet.') })));
    }
    var boxes = ready.map(function (b, i) {
      var box = el('input', { type: 'checkbox', value: b.id });
      box.checked = i < MAX;
      return box;
    });
    var err = el('p', { class: 'sh-note', hidden: true });
    boxes.forEach(function (box) {
      box.addEventListener('change', function () {
        var on = boxes.filter(function (x) { return x.checked; }).length;
        if (on > MAX) { box.checked = false; on--; }
        err.hidden = on >= 2;
        err.textContent = on >= 2 ? '' : 'Pick at least two balls.';
      });
    });
    var panel = window.ShotsShare.panel({
      label: 'Make ball report', kind: 'primary', filename: 'ball-report-' + today(), title: 'Ball report', pdf: true, tall: true,
      make: function () {
        var ids = boxes.filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
        if (ids.length < 2) return { error: 'Pick at least two balls.' };
        var report = window.BallStats.build(pool, { ids: ids, maxBalls: MAX, label: ballName });
        return window.Cards.ballReport(report, { name: shareName() });
      },
    });
    return UI.card('Ball report', 'A shareable infographic comparing your balls',
      el('div', { class: 'card-body sh-stack' }, [
        el('p', { class: 'sh-note', text: 'Pick up to ' + MAX + ' balls. Every game counts toward the ball that threw most of its first balls. Differences between balls are tested, so small samples are called out as luck.' }),
        el('div', { class: 'sh-stack' }, ready.map(function (b, i) {
          return el('label', { class: 'sh-check' }, [boxes[i], thumb(b.id, 'sm'), el('span', { text: b.name + ' \u00b7 ' + plural(counts[b.id], 'game') })]);
        })),
        err,
        panel,
      ]));
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

    var nameInput = el('input', { type: 'text', value: shareName(), autocapitalize: 'words', placeholder: 'e.g. Steven Smith' });
    var nameNote = el('p', { class: 'sh-note', text: 'Printed on shared scorecards and reports.' });
    var nameForm = el('form', {
      class: 'sh-form',
      onsubmit: function (e) {
        e.preventDefault();
        var value = nameInput.value.trim();
        v.commit(function (lib) { lib.settings = { name: value, updatedAt: now() }; }).then(function () {
          nameNote.textContent = value ? 'Saved.' : 'Cleared.';
          backgroundSync();
        }, function (ex) { nameNote.textContent = ex.message; });
      },
    }, [
      field('Name on shared cards', nameInput),
      nameNote,
      el('div', { class: 'sh-actions' }, el('button', { type: 'submit', class: 'sh-btn is-primary', text: 'Save name' })),
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
      UI.card('Sharing', 'Scorecards and reports', el('div', { class: 'card-body sh-stack' }, nameForm)),
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
