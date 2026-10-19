/*
 * The import page of the shot tracker: choose a games file, check it, see what
 * would be added, then add it. Reading and checking the file is importer.js;
 * this draws the page and saves the result through the vault.
 *
 * create(h) takes what it needs from the page: h.head, h.subnav, h.draw,
 * h.field, h.button, h.getVault, h.library, h.backgroundSync, h.now, h.uid.
 */
(function () {
  'use strict';

  var el = UI.el;

  var EXAMPLE = window.Importer.EXAMPLE;

  function create(h) {
    var state = { text: '', name: '', aliases: {}, done: null, replace: false, defaults: { location: '', pattern: '', event: 'practice', lane: '' }, address: '', loading: false, loadError: '' };

    /* A change event can fire as a field loses focus; redrawing from inside it trips the browser. */
    function later() { setTimeout(h.rerender, 0); }

    function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

    /* The "Imported" message belongs to that visit: leaving the page clears it. */
    window.addEventListener('hashchange', function () {
      if (location.hash.indexOf('#/shots/import') !== 0) state.done = null;
    });

    function result() {
      if (!state.text) return null;
      var lib = h.library();
      return window.Importer.parse(state.text, {
        balls: lib.balls,
        existingKeys: lib.games.map(function (g) { return g.importKey; }).filter(Boolean),
        aliases: state.aliases,
        defaults: state.defaults,
        replace: state.replace,
        makeId: h.uid,
      });
    }

    function readFile(file) {
      var reader = new FileReader();
      reader.onload = function () {
        state.text = String(reader.result || '');
        state.name = file.name;
        state.aliases = {};
        state.done = null;
        h.rerender();
      };
      reader.onerror = function () { state.text = ''; state.name = ''; h.rerender(); };
      reader.readAsText(file);
    }

    function loadAddress(url) {
      state.loadError = '';
      if (!/^(https?:\/\/|\/|\.\/|[\w-]+\/)/.test(url)) { state.loadError = 'Enter a web address, like https://\u2026/file.json'; return h.rerender(); }
      state.loading = true;
      h.rerender();
      fetch(url, { cache: 'no-store' }).then(function (res) {
        if (!res.ok) throw new Error('The address answered ' + res.status + '.');
        return res.text();
      }).then(function (text) {
        state.text = text; state.name = url.split('/').pop() || url; state.aliases = {}; state.done = null; state.loading = false;
        h.rerender();
      }, function (e) {
        state.loading = false; state.loadError = 'Could not load that: ' + e.message;
        h.rerender();
      });
    }

    function download(name, text) {
      var a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    function commit(res) {
      var keys = {};
      return h.getVault().commit(function (lib) {
        lib.games.forEach(function (g, i) { if (g.importKey && !g.deleted) keys[g.importKey] = i; });
        res.newBalls.forEach(function (b) { lib.balls.push({ id: b.id, name: b.name, notes: 'Added by import', updatedAt: h.now() }); });
        res.games.forEach(function (g) {
          g.updatedAt = h.now();
          if (keys[g.importKey] != null) {
            if (!state.replace) return;                  /* it arrived by another route since the preview */
            g.id = lib.games[keys[g.importKey]].id;      /* the corrected game keeps the old game's identity */
            lib.games[keys[g.importKey]] = g;
            return;
          }
          lib.games.push(g);
        });
      }).then(function () {
        state.done = { games: res.games.length, balls: res.newBalls.length };
        state.text = ''; state.name = ''; state.aliases = {};
        h.backgroundSync();
        h.rerender();
      });
    }

    /* LaneTalk pictures show neither where nor on what oil, so say it once for the whole file. */
    function detailFields(res) {
      var m = res.missing;
      if (!m || !(m.location || m.pattern || m.event || m.lane)) return null;
      function text(key, label, placeholder) {
        var input = el('input', { type: 'text', value: state.defaults[key], placeholder: placeholder, autocapitalize: 'words' });
        input.addEventListener('change', function () { state.defaults[key] = input.value.trim(); later(); });
        return h.field(label, input);
      }
      var event = el('select', { 'aria-label': 'Event' }, [['practice', 'Practice'], ['league', 'League'], ['tournament', 'Tournament']].map(function (e) {
        return el('option', { value: e[0], selected: state.defaults.event === e[0] }, e[1]);
      }));
      event.addEventListener('change', function () { state.defaults.event = event.value; later(); });
      return el('div', { class: 'sh-stack' }, [
        el('p', { class: 'sh-note', text: 'The file does not say these for some nights. What you enter here is used for those nights.' }),
        el('div', { class: 'sh-grid' }, [m.event ? h.field('Event', event) : null, m.location ? text('location', 'Location', 'e.g. Leisure Time Bowling') : null,
          m.pattern ? text('pattern', 'Oil pattern', 'e.g. House') : null, m.lane ? text('lane', 'Lane', 'e.g. 23') : null].filter(Boolean)),
      ]);
    }

    function ballChoices(res) {
      if (!res.ballMap.length) return null;
      var arsenal = h.library().balls.filter(function (b) { return !b.deleted; });
      return el('div', { class: 'sh-stack' }, res.ballMap.map(function (m) {
        var select = el('select', {
          'aria-label': 'Which ball is "' + m.name + '"',
          onchange: function () { state.aliases[m.key] = select.value; later(); },
        }, [el('option', { value: 'new' }, 'Add "' + m.name + '" to my arsenal')].concat(arsenal.map(function (b) {
          return el('option', { value: b.id, selected: m.id === b.id }, b.name);
        })));
        if (m.how !== 'new') select.value = m.id;
        return h.field('"' + m.name + '" in the file is', select,
          m.how === 'close' ? 'Matched to ' + m.match + ' by name. Change it if that is wrong.'
            : m.how === 'new' ? 'Not in your arsenal yet, so it will be added.' : null);
      }));
    }

    function preview(res) {
      var cards = [];
      if (res.errors.length) {
        cards.push(UI.card('Nothing imported yet', plural(res.errors.length, 'problem') + ' to fix in the file',
          el('div', { class: 'card-body sh-stack' }, [
            el('ul', { class: 'sh-problems' }, res.errors.map(function (e) { return el('li', { text: e }); })),
            el('p', { class: 'sh-note', text: 'Fix these in the file and choose it again. Games that were fine are not imported until the whole file is clean.' }),
          ])));
        return cards;
      }
      var fresh = res.games.length;
      var replaceBox = el('input', { type: 'checkbox' });
      replaceBox.checked = state.replace;
      replaceBox.addEventListener('change', function () { state.replace = replaceBox.checked; later(); });
      var rows = res.sets.map(function (s) { return s; });
      var table = UI.table({
        columns: [
          { key: 'd', label: 'Night', sortable: false, className: 'col-name', render: function (r) { return UI.shortDate(r.date) + (r.location ? ' · ' + r.location : ''); } },
          { key: 'g', label: 'Games', sortable: false, className: 'col-name', render: function (r) {
            return r.games.length ? r.games.map(function (g) { return g.total; }).join(' · ') : 'all already in your vault';
          } },
          { key: 's', label: 'Series', sortable: false, className: 'num-strong', render: function (r) {
            return r.games.length > 1 || (r.games.length === 1 && !r.duplicate) ? String(r.games.reduce(function (t, g) { return t + g.total; }, 0)) : '—';
          } },
        ], rows: rows, state: null, onSort: function () {},
      });
      var summary = fresh
        ? plural(fresh, 'game') + (res.replacing ? ' ready, ' + res.replacing + ' of them replacing games imported before' : ' ready to add') + (res.newBalls.length ? ', and ' + plural(res.newBalls.length, 'new ball') : '') + (res.duplicates.length ? '. ' + plural(res.duplicates.length, 'game') + ' already in your vault will be skipped' : '')
        : 'Everything in this file is already in your vault.';
      var err = el('p', { class: 'sh-error', role: 'alert', hidden: true });
      var go = h.button('Import ' + plural(fresh, 'game'), function () {
        go.disabled = true;
        commit(res).then(null, function (e) { go.disabled = false; err.textContent = e.message; err.hidden = false; });
      }, 'primary', { disabled: !fresh });
      cards.push(UI.card('What will be added', summary, el('div', null, [
        table,
        el('div', { class: 'card-body sh-stack' }, [
          el('label', { class: 'sh-check' }, [replaceBox, el('span', { text: 'Replace games I already imported from this file (use after the file was corrected)' })]),
          detailFields(res),
          ballChoices(res),
          res.warnings.length ? el('ul', { class: 'sh-notes-list' }, res.warnings.map(function (w) { return el('li', { text: w }); })) : null,
          err,
          el('div', { class: 'sh-actions' }, [go]),
          el('p', { class: 'sh-note', text: 'Every game was played through frame by frame, and each total was checked against the file. Importing the same file again is safe: games already added are skipped.' }),
        ]),
      ])));
      return cards;
    }

    function page() {
      var res = result();
      var file = el('input', {
        type: 'file', accept: '.json,.txt,application/json,text/plain', 'aria-label': 'Games file',
        onchange: function () { if (file.files && file.files[0]) readFile(file.files[0]); },
      });
      var paste = el('textarea', { rows: 5, placeholder: 'Or paste the file’s contents here', 'aria-label': 'Paste the file contents' }, state.name ? '' : state.text);
      var nodes = [
        h.head('Import games', 'Bring in old games from a file'),
        h.subnav('games'),
      ];
      if (state.done) {
        nodes.push(UI.card('Imported', null, el('div', { class: 'card-body sh-stack' }, [
          el('p', { class: 'sh-verdict', text: plural(state.done.games, 'game') + ' added' + (state.done.balls ? ' with ' + plural(state.done.balls, 'new ball') : '') + '.' }),
          el('div', { class: 'sh-actions' }, [
            el('a', { class: 'sh-btn is-primary', href: '#/shots', text: 'See your games' }),
            h.button('Import another file', function () { state.done = null; h.rerender(); }),
          ]),
        ])));
      } else {
        nodes.push(UI.card('Choose a file', state.name ? state.name : 'A LeagueCraft games file (.json)', el('div', { class: 'card-body sh-stack' }, [
          h.field('File', file),
          paste,
          (function () {
            var url = el('input', { type: 'url', value: state.address, placeholder: 'https://\u2026/file.json', autocapitalize: 'off', 'aria-label': 'Web address of a games file' });
            return el('div', { class: 'sh-stack' }, [
              h.field('Or load it from a web address', url, state.loadError || null),
              h.button(state.loading ? 'Loading\u2026' : 'Load', function () { state.address = url.value.trim(); loadAddress(state.address); }, null, { disabled: state.loading }),
            ]);
          })(),
          el('div', { class: 'sh-actions' }, [
            h.button('Check what I pasted', function () {
              state.text = paste.value.trim(); state.name = ''; state.aliases = {}; h.rerender();
            }),
            h.button('Download an example', function () { download('leaguecraft-example.json', EXAMPLE); }),
          ]),
          el('details', { class: 'sh-details sh-inline' }, [el('summary', { text: 'How the file looks' }), el('div', { class: 'sh-stack' }, [
            el('p', { class: 'sh-note', text: 'One entry per night, with the games bowled. A frame is the pins still standing after each ball: "." for none (a strike or a spare), "10" or "7-10" for the pins left, "?1" when you know how many were left but not which. Games marked warmup are skipped, and the total of each game is checked against the pins.' }),
            el('pre', { class: 'sh-code', text: EXAMPLE }),
          ])]),
        ])));
        if (res) nodes = nodes.concat(preview(res));
      }
      h.draw(nodes);
    }

    return { page: page };
  }

  window.ShotsImport = { create: create };
})();
