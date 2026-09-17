/* Small DOM + formatting helpers shared by every view. */
(function () {
  'use strict';

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value == null || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? '' : value);
      });
    }
    append(node, children);
    return node;
  }

  function append(parent, children) {
    if (children == null) return parent;
    (Array.isArray(children) ? children : [children]).forEach(function (child) {
      if (child == null || child === false) return;
      parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
    });
    return parent;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
  }

  /* Averages read as 183.4; everything else stays a whole number. */
  function avg(value, digits) {
    if (value == null || !isFinite(value)) return '—';
    return value.toFixed(digits == null ? 1 : digits);
  }

  function num(value) {
    if (value == null || !isFinite(value)) return '—';
    return String(Math.round(value));
  }

  /* Grouped for headline tiles — 51,203 reads faster than 51203. Tables keep
     the ungrouped form so columns of figures stay easy to scan. */
  function big(value) {
    if (value == null || !isFinite(value)) return '—';
    return Math.round(value).toLocaleString();
  }

  /* Points can be halves when a game is tied, so 7 stays "7" but 7.5 shows. */
  function points(value) {
    if (value == null || !isFinite(value)) return '—';
    return value % 1 === 0 ? String(value) : value.toFixed(1);
  }

  function shortDate(iso) {
    if (!iso) return '';
    var parts = String(iso).split('-');
    if (parts.length !== 3) return iso;
    var date = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  function longDate(iso) {
    if (!iso) return '';
    var parts = String(iso).split('-');
    if (parts.length !== 3) return iso;
    var date = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleDateString(undefined, {
      weekday: 'short', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    });
  }

  /* Which tile explanations are open, keyed by label. Like the card notes,
     this has to outlive the element because views rebuild on sort. */
  var openStats = {};

  /* stat(label, value, explain)
     With an explanation the whole tile becomes the button - a small circle
     would be a poor target on a phone, and there are a dozen tiles per page,
     so twelve of them would be clutter. Tapping reveals the note under the
     value; the value stays visible. */
  function stat(label, value, explain) {
    var parts = [
      el('span', { class: 'stat-label', text: label }),
      el('span', { class: 'stat-value' }, value),
    ];

    if (!explain) return el('div', { class: 'stat' }, parts);

    var open = !!openStats[label];
    var note = el('span', { class: 'stat-note', text: explain });
    if (!open) note.hidden = true;
    parts.push(note);

    var tile = el('button', {
      type: 'button',
      class: 'stat stat-button',
      'aria-expanded': open ? 'true' : 'false',
      title: explain,
      onclick: function () {
        var nowOpen = note.hidden;
        note.hidden = !nowOpen;
        tile.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
        openStats[label] = nowOpen;
      },
    }, parts);

    return tile;
  }

  function statGrid(items) {
    return el('div', { class: 'stat-grid' }, items);
  }

  /* Which explanations are open, keyed by card title. Views rebuild
     themselves on every sort, so this has to outlive the element. */
  var openNotes = {};

  /* card(title, hint, body, explain)
     `hint` is the terse subtitle; `explain` is a plain-English sentence behind
     an info button. The button is a tap-toggle rather than a hover tooltip, so
     it works the same on a phone, with a mouse, and from the keyboard. */
  function card(title, hint, body, explain) {
    var children = [];

    if (title) {
      var heading = [el('h2', { text: title })];
      var note = null;

      if (explain) {
        var id = 'note-' + title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        var open = !!openNotes[title];

        note = el('p', { class: 'card-note', id: id, text: explain });
        if (!open) note.hidden = true;

        var button = el('button', {
          type: 'button',
          class: 'card-info',
          'aria-expanded': open ? 'true' : 'false',
          'aria-controls': id,
          title: explain,
          onclick: function () {
            var nowOpen = note.hidden;
            note.hidden = !nowOpen;
            button.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
            openNotes[title] = nowOpen;
          },
        }, [
          el('span', { 'aria-hidden': 'true', text: 'i' }),
          el('span', { class: 'sr-only', text: 'What does ' + title + ' show?' }),
        ]);
        heading.push(button);
      }

      children.push(el('div', { class: 'card-head' }, [
        el('div', { class: 'card-title' }, heading),
        hint ? el('span', { class: 'hint', text: hint }) : null,
      ]));
      if (note) children.push(note);
    }

    children.push(body);
    return el('section', { class: 'card' }, children);
  }

  function empty(message) {
    return el('p', { class: 'empty', text: message });
  }

  /* ---- sortable table ----------------------------------------------
     columns: { key, label, className, optional, sortable, defaultDir,
                value(row) -> sort key, render(row) -> cell content }
     `state` is owned by the caller so a sort survives a re-render.
     `limit` trims the rendered rows after sorting, for a collapsed list.
     `rowClass(row, i)` marks individual rows — a scoreboard uses it to keep
     the two sides of a match visually paired.
     ------------------------------------------------------------------ */
  function table(options) {
    var columns = options.columns;
    var state = options.state;
    var rows = options.rows.slice();

    if (state && state.key) {
      var column = columns.filter(function (c) { return c.key === state.key; })[0];
      if (column) {
        var dir = state.dir === 'asc' ? 1 : -1;
        rows.sort(function (a, b) {
          return compare(column.value(a), column.value(b)) * dir || tieBreak(a, b);
        });
      }
    }

    /* Trim after sorting, never before, so a collapsed table still shows the
       top of whatever column the reader picked. */
    if (options.limit != null) rows = rows.slice(0, options.limit);

    var head = el('tr', null, columns.map(function (column) {
      var className = [column.className, column.optional ? 'col-optional' : null, column.sortable === false ? null : 'sortable']
        .filter(Boolean).join(' ');
      var attrs = { class: className, scope: 'col' };
      var sorted = state && state.key === column.key;
      if (sorted) attrs['aria-sort'] = state.dir === 'asc' ? 'ascending' : 'descending';

      if (column.sortable === false) return el('th', attrs, column.label);

      return el('th', attrs, el('button', {
        type: 'button',
        title: 'Sort by ' + column.label,
        onclick: function () {
          if (state.key === column.key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
          else { state.key = column.key; state.dir = column.defaultDir || 'desc'; }
          options.onSort();
        },
      }, column.label));
    }));

    var body = el('tbody', null, rows.map(function (row, i) {
      var rowClass = options.rowClass ? options.rowClass(row, i) : null;
      return el('tr', { class: rowClass || null }, columns.map(function (column) {
        var className = [column.className, column.optional ? 'col-optional' : null]
          .filter(Boolean).join(' ');
        return el('td', { class: className || null }, column.render(row, i));
      }));
    }));

    return el('div', { class: 'table-scroll' }, el('table', null, [el('thead', null, head), body]));
  }

  function compare(a, b) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;   /* blanks sink to the bottom either way */
    if (b == null) return -1;
    if (typeof a === 'string' || typeof b === 'string') {
      return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
    }
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function tieBreak(a, b) {
    return compare(a.name, b.name);
  }

  window.UI = {
    el: el, clear: clear, append: append,
    avg: avg, num: num, big: big, points: points,
    shortDate: shortDate, longDate: longDate,
    stat: stat, statGrid: statGrid, card: card, empty: empty,
    table: table,
  };
})();
