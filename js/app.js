/* Router and views. Hash routing keeps the whole thing hostable as static
   files — no server rewrites needed for the drill-down pages. */
(function () {
  'use strict';

  var el = UI.el;
  var model = null;
  var viewRoot = null;

  /* Sort and filter live outside the render so they survive tab switches. */
  var state = {
    players: { key: 'average', dir: 'desc' },
    teams: { key: 'points', dir: 'desc' },
    search: '',
    teamWeek: {},
    /* Drill-down tables re-render by rebuilding the whole view, so their sort
       has to live out here or every header click would reset it. */
    teamResults: { key: 'week', dir: 'asc' },
    teamRoster: { key: 'average', dir: 'desc' },
    teamLines: { key: 'series', dir: 'desc' },
    playerWeeks: { key: 'week', dir: 'asc' },
    /* Long league-wide lists start trimmed and expand on request. */
    showAllTeams: false,
    showAllBook: false,
  };

  /* ---------- helpers ---------- */

  function gameCount() {
    var fromData = 0;
    model.players.forEach(function (p) {
      p.weeks.forEach(function (w) { fromData = Math.max(fromData, w.games.length); });
    });
    return fromData || model.scoring.gamesPerWeek || 3;
  }

  function tabs(active) {
    return el('nav', { class: 'tabs', 'aria-label': 'League sections' }, [
      el('a', { href: '#/', 'aria-current': active === 'overview' ? 'page' : null }, 'Overview'),
      el('a', { href: '#/bowlers', 'aria-current': active === 'players' ? 'page' : null }, 'Bowlers'),
      el('a', { href: '#/teams', 'aria-current': active === 'teams' ? 'page' : null }, 'Teams'),
    ]);
  }

  function pageHead(title, subtitle, backHref, backText) {
    return el('div', { class: 'page-head' }, [
      backHref ? el('a', { class: 'back-link', href: backHref }, ['←', ' ' + backText]) : null,
      el('h1', { text: title }),
      subtitle ? el('p', { text: subtitle }) : null,
    ]);
  }

  /* Appends handicap columns only where the league actually uses handicap,
     so a scratch league never sees a column of duplicates. */
  function withHandicap(columns, extra) {
    return model.scoring.useHandicap ? columns.concat(extra) : columns;
  }

  function teamChip(name) {
    return el('span', {
      class: 'team-chip', 'aria-hidden': 'true',
      style: 'background:' + Avatars.colorFor(name),
    });
  }

  function nameCell(href, name, sub) {
    return [
      href ? el('a', { href: href, text: name }) : el('span', { class: 'muted', text: name }),
      sub ? el('span', { class: 'sub' }, sub) : null,
    ];
  }

  /* Placeholder lines get no link — there is no page behind them. */
  function bowlerCell(person, sub) {
    var href = person.placeholder ? null : '#/player/' + (person.id || person.playerId);
    return nameCell(href, person.name, sub);
  }

  function matches(player, query) {
    if (!query) return true;
    var q = query.toLowerCase();
    return player.name.toLowerCase().indexOf(q) > -1 ||
           (player.teamName || '').toLowerCase().indexOf(q) > -1;
  }

  function searchBox(placeholder, rerender) {
    var input = el('input', {
      type: 'search',
      id: 'search',
      placeholder: 'Type a name…',
      value: state.search,
      autocomplete: 'off',
      oninput: function (e) {
        state.search = e.target.value;
        rerender(true);
      },
    });
    return el('div', { class: 'card-body' }, el('div', { class: 'controls' }, [
      el('div', { class: 'control-field' }, [
        el('label', { for: 'search', text: placeholder }),
        input,
      ]),
    ]));
  }

  /* Re-focus the search field after a keystroke re-render, keeping the caret
     at the end so typing feels uninterrupted. */
  function restoreFocus(fromSearch) {
    if (!fromSearch) return;
    var input = document.getElementById('search');
    if (!input) return;
    var end = input.value.length;
    input.focus();
    input.setSelectionRange(end, end);
  }

  /* ---------- league overview ---------- */

  var MILESTONES = [220, 210, 200, 190, 180, 170];

  function overviewView() {
    document.title = 'Overview · ' + (model.league.name || 'Bowling League');
    var s = model.summary;

    if (!s.bowlers) {
      return draw([
        pageHead('League overview', leagueSubtitle()),
        tabs('overview'),
        el('section', { class: 'card' }, UI.empty('No scores recorded yet.')),
      ]);
    }

    var tiles = [
      UI.stat('Bowlers', UI.num(s.bowlers),
              "Everyone in the league with at least one recorded game. Vacant spots and absentee scores are not counted, since they are not people."),
      UI.stat('Teams', UI.num(s.teams),
              "How many teams are in the league this season."),
      UI.stat('Weeks bowled', UI.num(s.weeks) +
              (model.league.weeksInSeason ? ' / ' + model.league.weeksInSeason : ''),
              "Weeks completed out of the full season schedule."),
      UI.stat('League average', UI.avg(s.average),
              "Every pin knocked down by every bowler, divided by every game bowled."),
      UI.stat('Games bowled', UI.big(s.games),
              "The total number of individual games bowled across the league so far."),
      UI.stat('Pins toppled', UI.big(s.pins),
              "Every pin knocked down by every bowler this season, added up."),
      UI.stat('200+ bowlers', UI.num(countAtLeast(s.averages, 200)),
              "How many bowlers are carrying a season average of 200 or better."),
      UI.stat('Top average', UI.avg(s.topAverage.average),
              "The highest season average in the league right now."),
    ];

    /* How the league as a whole has scored, night by night. */
    var pace = Charts.line({
      points: s.byWeek.map(function (w) {
        return {
          label: 'Week ' + w.week,
          axis: String(w.week),
          value: w.average,
          caption: UI.big(w.pins) + ' pins over ' + w.games + ' games',
        };
      }),
      format: function (v) { return UI.avg(v); },
      reference: { value: s.average, label: 'season ' + UI.avg(s.average) },
      label: 'League scoring average by week',
    });

    var TEAM_PREVIEW = 12;
    var ranked = model.teams.slice()
      .sort(function (a, b) { return b.points - a.points || b.pins - a.pins; });
    var standings = (state.showAllTeams ? ranked : ranked.slice(0, TEAM_PREVIEW))
      .map(function (t) {
        return {
          label: t.name, value: t.points, display: UI.points(t.points),
          href: '#/team/' + t.id,
          title: t.name + ': ' + plural(UI.points(t.points), 'point') + ', ' + record(t),
        };
      });
    var standingsCard = [cardBody(Charts.bars({ rows: standings, wideLabel: true }))];
    if (ranked.length > TEAM_PREVIEW) {
      standingsCard.push(expandToggle(state.showAllTeams, ranked.length, 'teams', function () {
        state.showAllTeams = !state.showAllTeams;
        overviewView();
      }));
    }

    var bookRows = vsBookRows(s.vsBook, state.showAllBook);
    var bookCard = [cardBody(Charts.diverging({ rows: bookRows }))];
    if (s.vsBook.length > bookRows.length || state.showAllBook) {
      bookCard.push(expandToggle(state.showAllBook, s.vsBook.length, 'bowlers', function () {
        state.showAllBook = !state.showAllBook;
        overviewView();
      }));
    }

    var milestoneRows = MILESTONES.map(function (threshold) {
      var count = countAtLeast(s.averages, threshold);
      return { name: threshold + '+', threshold: threshold, count: count, share: count / s.bowlers };
    });

    var milestones = UI.table({
      columns: [
        { key: 'threshold', label: 'Average', className: 'col-name', sortable: false,
          render: function (r) { return el('span', { class: 'pill', text: r.name }); } },
        { key: 'count', label: 'Bowlers', className: 'num-strong', sortable: false,
          render: function (r) { return UI.num(r.count); } },
        { key: 'share', label: 'Share of league', className: 'muted', sortable: false,
          render: function (r) { return Math.round(r.share * 100) + '%'; } },
      ],
      rows: milestoneRows, state: null, onSort: function () {},
    });

    var bests = [
      ['High game', s.highGame, false],
      ['High series', s.highSeries, false],
      ['Team game', s.highTeamGame, true],
      ['Team series', s.highTeamSeries, true],
      ['Team game (hdcp)', s.highTeamHdcpGame, true],
      ['Team series (hdcp)', s.highTeamHdcpSeries, true],
    ].filter(function (row) { return row[1]; });

    var highs = UI.table({
      columns: [
        { key: 'label', label: 'Record', className: 'col-name', sortable: false,
          render: function (r) { return r[0]; } },
        { key: 'value', label: 'Score', className: 'num-strong', sortable: false,
          render: function (r) { return UI.num(r[1].value); } },
        { key: 'who', label: 'Held by', className: 'col-tight', sortable: false,
          render: function (r) {
            var holder = r[2] ? r[1].team : r[1].player;
            return el('a', { href: (r[2] ? '#/team/' : '#/player/') + holder.id, text: holder.name });
          } },
        { key: 'week', label: 'Wk', className: 'muted', sortable: false,
          render: function (r) { return String(r[1].week); } },
      ],
      rows: bests, state: null, onSort: function () {},
    });

    draw([
      masthead(),
      tabs('overview'),
      UI.statGrid(tiles),
      chartPair(
        UI.card('Scoring pace', 'League average each week', cardBody(pace),
              "How the league as a whole scored on each night, as pins per game across every bowler. The rule marks the season average, so you can see which weeks ran hot or cold."),
        UI.card('Standings',
                state.showAllTeams ? 'Points won so far'
                                   : 'Top ' + TEAM_PREVIEW + ' of ' + ranked.length,
                el('div', null, standingsCard),
              "Points won so far. Each match is worth four: one for each handicap game won, and one for total handicap pinfall.")
      ),
      UI.card('Average distribution', 'Bowlers in each 10-pin band',
              cardBody(Charts.bars({ rows: distributionRows(s.averages) })),
              "How many bowlers sit in each 10-pin band of season average. It shows the shape of the league - where most bowlers cluster and how long the tails run."),
      UI.card('Over and under book average',
              state.showAllBook ? 'Current average against book average'
                                : 'Furthest above and below book average',
              el('div', null, bookCard),
              "Each bowler's season average against the book average their handicap is set from. Blue is bowling above book, red below. Early in the season one good or bad night moves this a long way."),
      chartPair(
        UI.card('By game', 'Where the league scores its pins',
                slotTable(s.slots, s.average),
              "The league average for the first, second and third game of the night, against the overall average. Lanes tend to open up as the oil moves, so later games often score higher."),
        UI.card('Honour roll', 'Big scores so far', el('div', null, [
          el('div', { class: 'card-body' }, milestoneRow(s.milestones)),
          el('div', { class: 'card-body' }, el('p', { class: 'muted' }, [
            plural(s.handicapSwings.length, 'match') + ' of ' + s.matches.length +
            ' went to the team that was out-pinned on scratch.',
          ])),
        ]),
              "A running count of the big scores across the league, plus how often the handicap decided a match - that is, the winning team was out-pinned on scratch.")
      ),
      UI.card('Standings race',
              model.weeks.length < 2
                ? 'Every team\u2019s position each week \u00b7 hover to pick one out \u00b7 needs a few weeks to show movement'
                : 'Every team\u2019s position each week \u00b7 hover to pick one out',
              cardBody(Charts.race({
                of: model.teams.length,
                label: 'League position of every team by week',
                series: model.teams.map(function (t) {
                  return {
                    name: t.name,
                    caption: plural(UI.points(t.points), 'point'),
                    values: t.trend.map(function (x) {
                      return { week: x.week, rank: x.rank };
                    }),
                  };
                }),
              })),
              "Every team's position in the standings after each week. All teams are drawn the same; hover or tap a line to lift one out and name it. It needs several weeks before there is any movement to see."),
      laneCard(s),
      UI.card('Closest matches', 'Handicap pinfall between the two teams',
              closestMatches(s.matches),
              "The tightest results in the league, measured by the gap in total handicap pinfall between the two teams."),
      UI.card('Averages at a glance', 'Bowlers carrying each average or better', milestones,
              "How many bowlers are carrying each average or better, and what share of the league that is. The rows are cumulative, so everyone counted at 220+ is also counted at 210+."),
      UI.card('Season bests', 'Scratch unless marked', highs,
              "The highest single game and series of the season, for individuals and for teams. Scratch figures unless the row says handicap."),
    ]);
  }

  /* The landing page gets a face: the league's own banner, with how far
     through the season we are. */
  function masthead() {
    var name = model.league.name || 'Bowling League';
    var total = model.league.weeksInSeason;
    var done = model.weeks.length;

    var meta = [];
    if (model.league.venue) meta.push(model.league.venue);
    if (model.league.night) meta.push(model.league.night);

    var progress = null;
    if (total && done) {
      progress = el('div', { class: 'season' }, [
        el('div', {
          class: 'season-bar',
          role: 'img',
          'aria-label': 'Week ' + done + ' of ' + total,
        }, el('span', { style: 'width:' + Math.min(100, done / total * 100) + '%' })),
        el('span', { class: 'season-text', text: 'Week ' + done + ' of ' + total }),
      ]);
    }

    return el('section', { class: 'banner banner-lg' }, [
      Avatars.banner(name),
      el('div', { class: 'banner-text' }, [
        el('h1', { text: name }),
        el('p', { text: meta.join(' · ') }),
        progress,
      ]),
    ]);
  }

  /* Two cards side by side once there is room for them. */
  function chartPair(a, b) {
    return el('div', { class: 'chart-pair' }, [a, b]);
  }

  /* A "show everything" toggle for a card that only lists the top slice. */
  function expandToggle(expanded, total, noun, onToggle) {
    return el('div', { class: 'card-body card-action' },
      el('button', { class: 'link-button', type: 'button', onclick: onToggle },
        expanded ? 'Show fewer' : 'Show all ' + total + ' ' + noun));
  }

  function cardBody(content) {
    return el('div', { class: 'card-body' }, content);
  }

  function distributionRows(averages) {
    var low = Math.floor(Math.min.apply(null, averages) / 10) * 10;
    var high = Math.floor(Math.max.apply(null, averages) / 10) * 10;
    var rows = [];
    for (var floor = high; floor >= low; floor -= 10) {
      (function (f) {
        var count = averages.filter(function (v) { return v >= f && v < f + 10; }).length;
        rows.push({
          label: f + '–' + (f + 9), value: count, display: count,
          title: plural(count, 'bowler') + ' averaging ' + f + '–' + (f + 9),
        });
      })(floor);
    }
    return rows;
  }

  /* Scoring by lane pair, as a difference from the league average. A bar
     anchored at zero would squash 162-202 into a near-flat block and hide the
     very thing the card is for. Omitted entirely until lanes are recorded. */
  function laneCard(s) {
    var pairs = (s.lanePairs || []).filter(function (p) { return p.average != null; });
    if (!pairs.length) return null;

    var rows = pairs.map(function (p) {
      var delta = p.average - s.average;
      return {
        label: 'Lanes ' + p.lanes,
        value: delta,
        display: signed(delta),
        title: 'Lanes ' + p.lanes + ': ' + UI.avg(p.average) + ' average over ' +
               plural(p.games, 'game') + ' in ' + plural(p.weeks, 'week'),
      };
    });

    /* The caveat retires itself once there is enough data to trust. */
    var weeks = pairs.reduce(function (max, p) { return Math.max(max, p.weeks); }, 0);
    var hint = weeks < 6
      ? 'vs league average · after ' + plural(weeks, 'week') +
        ' this still mostly reflects who bowled there'
      : 'vs league average, across every week bowled on that pair';

    return UI.card('Scoring by lane pair', hint, el('div', null, [
      cardBody(Charts.diverging({ rows: rows })),
      el('div', { class: 'card-body' }, el('p', { class: 'muted', text:
        plural(pairs[0].games, 'game') + ' behind each pair so far. Teams move ' +
        'around the house every week, so this measures the lanes only once they ' +
        'have all bowled on most of them.' })),
    ]),
              "How each pair of lanes has scored, as a difference from the league average. Because teams move around the house every week, this only starts to measure the lanes themselves once most teams have bowled on most pairs.");
  }

  /* The extremes are the story; the middle of the pack is not. */
  function vsBookRows(ranked, expanded) {
    var edge = Math.min(6, Math.floor(ranked.length / 2));
    var shown = expanded || !edge
      ? ranked
      : ranked.slice(0, edge).concat(ranked.slice(-edge));
    return shown.map(function (p) {
      return {
        label: p.name,
        value: p.vsBook,
        display: signed(p.vsBook, 1),
        href: '#/player/' + p.id,
        title: p.name + ': ' + UI.avg(p.average) + ' now, ' + p.entryAverage + ' book',
      };
    });
  }

  function closestMatches(matches) {
    if (!matches.length) return UI.empty('No matches recorded yet.');
    var rows = matches.slice().sort(function (a, b) { return a.margin - b.margin; }).slice(0, 6);
    return UI.table({
      columns: [
        { key: 'margin', label: 'Margin', className: 'num-strong', sortable: false,
          render: function (r) { return UI.num(r.margin) + ' pins'; } },
        { key: 'winner', label: 'Winner', className: 'col-name link-cell', sortable: false,
          render: function (r) {
            var win = r.homePoints >= r.awayPoints ? r.home : r.away;
            return el('a', { href: '#/team/' + win.id, text: win.name });
          } },
        { key: 'loser', label: 'Opponent', className: 'col-tight', sortable: false,
          render: function (r) {
            var lose = r.homePoints >= r.awayPoints ? r.away : r.home;
            return el('a', { href: '#/team/' + lose.id, text: lose.name });
          } },
        { key: 'week', label: 'Wk', className: 'muted', optional: true, sortable: false,
          render: function (r) { return String(r.week); } },
      ],
      rows: rows, state: null, onSort: function () {},
    });
  }

  function countAtLeast(averages, threshold) {
    return averages.filter(function (value) { return value >= threshold; }).length;
  }


  /* ---------- individual leaderboard ---------- */

  function playersView() {
    function render(fromSearch) {
      var rows = model.players.filter(function (p) {
        return p.games > 0 && !p.placeholder && matches(p, state.search);
      });

      var columns = [
        { key: 'rank', label: '#', className: 'col-rank', sortable: false,
          render: function (row, i) { return rankMark(i); } },
        { key: 'name', label: 'Bowler', className: 'col-name', defaultDir: 'asc',
          value: function (r) { return r.name; },
          render: function (r) {
            return bowlerCell(r, [teamChip(r.teamName), r.teamName]);
          } },
        { key: 'average', label: 'Avg', className: 'num-strong',
          value: function (r) { return r.average; },
          render: function (r) { return UI.avg(r.average); } },
        { key: 'games', label: 'Gms', className: 'muted',
          value: function (r) { return r.games; },
          render: function (r) { return UI.num(r.games); } },
        { key: 'highGame', label: 'High',
          value: function (r) { return r.highGame; },
          render: function (r) { return UI.num(r.highGame); } },
        { key: 'highSeries', label: 'High Ser', optional: true,
          value: function (r) { return r.highSeries; },
          render: function (r) { return UI.num(r.highSeries); } },
        { key: 'pins', label: 'Pins', className: 'muted', optional: true,
          value: function (r) { return r.pins; },
          render: function (r) { return UI.num(r.pins); } },
        { key: 'spread', label: '+/-', className: 'muted', optional: true,
          defaultDir: 'asc',
          value: function (r) { return r.spread; },
          render: function (r) { return UI.avg(r.spread); } },
      ];

      columns = withHandicap(columns, [
        { key: 'handicap', label: 'Hdcp', className: 'muted', optional: true,
          value: function (r) { return r.handicap; },
          render: function (r) { return UI.num(r.handicap); } },
        { key: 'handicapAverage', label: 'Hdcp Avg', className: 'muted', optional: true,
          value: function (r) { return r.handicapAverage; },
          render: function (r) { return UI.avg(r.handicapAverage); } },
      ]);

      var body = rows.length
        ? UI.table({ columns: columns, rows: rows, state: state.players, onSort: render })
        : UI.empty(state.search ? 'No bowler matches “' + state.search + '”.' : 'No scores recorded yet.');

      draw([
        pageHead('Leaderboard', leagueSubtitle()),
        tabs('players'),
        sampleNotice(),
        UI.card('Individual standings', 'Tap a column to sort',
                el('div', null, [searchBox('Find a bowler or team', render), body]),
                "Every bowler in the league with a recorded score. Tap any column to sort by it, tap again to reverse, and tap a name for that bowler's own page. +/- is how far a typical game sits from their average, so a low number is a steady bowler."),
      ]);
      restoreFocus(fromSearch);
    }

    document.title = 'Leaderboard · ' + (model.league.name || 'Bowling League');
    render(false);
  }

  /* ---------- team leaderboard ---------- */

  function teamsView() {
    function render(fromSearch) {
      var query = state.search.toLowerCase();
      var rows = model.teams.filter(function (t) {
        return !query || t.name.toLowerCase().indexOf(query) > -1;
      });

      var columns = [
        { key: 'rank', label: '#', className: 'col-rank', sortable: false,
          render: function (row, i) { return rankMark(i); } },
        { key: 'name', label: 'Team', className: 'col-name', defaultDir: 'asc',
          value: function (r) { return r.name; },
          render: function (r) {
            /* The W-L column is hidden on phones, so carry the record here. */
            var sub = r.weeks.length ? record(r) + ' · ' : '';
            return [teamChip(r.name)].concat(
              nameCell('#/team/' + r.id, r.name, sub + plural(r.players.length, 'bowler')));
          } },
        { key: 'points', label: 'Pts', className: 'num-strong',
          value: function (r) { return r.points; },
          render: function (r) { return UI.points(r.points); } },
        { key: 'record', label: 'W-L', className: 'muted', optional: true,
          value: function (r) { return r.wins - r.losses; },
          render: function (r) { return record(r); } },
        { key: 'average', label: 'Team Avg',
          value: function (r) { return r.average; },
          render: function (r) { return UI.avg(r.average); } },
        { key: 'highGame', label: 'High', optional: true,
          value: function (r) { return r.highGame; },
          render: function (r) { return UI.num(r.highGame); } },
        { key: 'highSeries', label: 'High Ser', optional: true,
          value: function (r) { return r.highSeries; },
          render: function (r) { return UI.num(r.highSeries); } },
        { key: 'pins', label: 'Pins', className: 'muted', optional: true,
          value: function (r) { return r.pins; },
          render: function (r) { return UI.num(r.pins); } },
        { key: 'spread', label: '+/-', className: 'muted', optional: true,
          defaultDir: 'asc',
          value: function (r) { return r.spread; },
          render: function (r) { return UI.avg(r.spread); } },
      ];

      columns = withHandicap(columns, [
        { key: 'hdcpAverage', label: 'Hdcp Avg', className: 'muted', optional: true,
          value: function (r) { return r.hdcpAverage; },
          render: function (r) { return UI.avg(r.hdcpAverage); } },
        { key: 'highHdcpSeries', label: 'Hdcp Ser', className: 'muted', optional: true,
          value: function (r) { return r.highHdcpSeries; },
          render: function (r) { return UI.num(r.highHdcpSeries); } },
        { key: 'hdcpPins', label: 'Hdcp Pins', className: 'muted', optional: true,
          value: function (r) { return r.hdcpPins; },
          render: function (r) { return UI.num(r.hdcpPins); } },
      ]);

      var body = rows.length
        ? UI.table({ columns: columns, rows: rows, state: state.teams, onSort: render })
        : UI.empty(state.search ? 'No team matches “' + state.search + '”.' : 'No teams yet.');

      draw([
        pageHead('Leaderboard', leagueSubtitle()),
        tabs('teams'),
        sampleNotice(),
        UI.card('Team standings', 'Scratch unless marked Hdcp',
                el('div', null, [searchBox('Find a team', render), body]),
                "Every team in the league. Tap any column to sort by it and tap a name for that team's page. Team Avg is the average team game with all bowlers combined, not a per-bowler figure."),
      ]);
      restoreFocus(fromSearch);
    }

    document.title = 'Team standings · ' + (model.league.name || 'Bowling League');
    render(false);
  }

  /* ---------- team drill-down ---------- */

  function teamView(teamId) {
    var team = model.teamsById[teamId];
    if (!team) return notFound('That team is not in the league.');

    document.title = team.name + ' · ' + (model.league.name || 'Bowling League');

    var games = gameCount();

    var standing = team.trend.length ? team.trend[team.trend.length - 1] : null;
    var tightest = team.weeks.filter(function (w) { return w.margin != null; })
      .sort(function (a, b) { return Math.abs(a.margin) - Math.abs(b.margin); })[0];
    var summary = UI.statGrid([
      UI.stat('Points', UI.points(team.points),
              "Points won so far. Each match is worth four: one for each handicap game won, and one for total handicap pinfall."),
      UI.stat('Record', record(team),
              "Matches won and lost, and tied if there are any. A match is tied when the points split evenly."),
      UI.stat('League position', standing ? '#' + standing.rank : '—',
              "Where this team currently sits in the standings, out of every team in the league."),
      UI.stat('Team game avg', UI.avg(team.average),
              "The average single game for the whole team with all bowlers added together, before handicap."),
      UI.stat('High game', UI.num(team.highGame),
              "The team's best single game with all bowlers added together, before handicap."),
      UI.stat('High series', UI.num(team.highSeries),
              "The team's best three-game total with all bowlers added together, before handicap."),
      UI.stat('High series (hdcp)', UI.num(team.highHdcpSeries),
              "The team's best three-game total once each bowler's handicap is added. This is the figure match points are decided on."),
      UI.stat('Closest margin', tightest ? signed(tightest.margin, 0) + ' pins' : '—',
              "The tightest result this team has had, as the gap in handicap pinfall against the opponent. A minus means they lost by that much."),
      UI.stat('Season pace', team.pace == null ? '—' : UI.num(team.pace) + ' pts',
              "Points this team would finish on if they carried on at their current rate for the whole season."),
      UI.stat('Opponents faced', UI.avg(team.opponentAverage),
              "The average team game of every opponent this team has played - a measure of how hard the schedule has been."),
      UI.stat('Hdcp game avg', UI.avg(team.hdcpAverage),
              "The average single game for the whole team once every bowler's handicap is added."),
      UI.stat('Total pins', UI.big(team.pins),
              "Every pin this team has knocked down this season, before handicap."),
    ]);

    var hdcpAverage = team.weeks.length
      ? team.weeks.reduce(function (a, w) { return a + w.hdcpSeries; }, 0) / team.weeks.length
      : null;

    var seriesChart = Charts.line({
      points: team.weeks.map(function (w) {
        return {
          label: 'Week ' + w.number,
          axis: String(w.number),
          value: w.hdcpSeries,
          caption: UI.num(w.series) + ' scratch' +
                   (w.opponentName ? ' vs ' + w.opponentName : '') +
                   (w.points != null ? ' · ' + UI.points(w.points) + ' pts' : ''),
        };
      }),
      reference: hdcpAverage ? { value: hdcpAverage, label: 'avg ' + UI.num(hdcpAverage) } : null,
      label: 'Handicap series by week',
    });

    var positionChart = Charts.line({
      points: team.trend.map(function (t) {
        return {
          label: 'Week ' + t.week,
          axis: String(t.week),
          value: t.rank,
          caption: plural(UI.points(t.points), 'point') + ' of ' + t.of + ' teams',
        };
      }),
      domain: [1, team.trend.length ? team.trend[0].of : model.teams.length],
      invert: true,
      integerTicks: true,
      format: function (v) { return '#' + Math.round(v); },
      formatAxis: function (v) { return '#' + Math.round(v); },
      label: 'League position by week',
    });

    /* Share of the team's pins, which is what a roster average does not show:
       a high average matters less if the bowler misses weeks. */
    var contributors = team.players.filter(function (p) { return p.pins > 0; });
    var contributionChart = Charts.bars({
      wideLabel: true,
      rows: contributors.map(function (p) {
        var share = team.pins ? p.pins / team.pins * 100 : 0;
        return {
          label: p.name,
          value: share,
          display: share.toFixed(1) + '%',
          href: p.placeholder ? null : '#/player/' + p.id,
          title: p.name + ': ' + UI.big(p.pins) + ' of the team\u2019s ' +
                 UI.big(team.pins) + ' pins',
        };
      }),
    });

    var rosterChart = Charts.bars({
      wideLabel: true,
      rows: team.players.filter(function (p) { return p.games > 0; }).map(function (p) {
        return {
          label: p.name, value: p.average, display: UI.avg(p.average),
          href: p.placeholder ? null : '#/player/' + p.id,
          title: p.name + ': ' + UI.avg(p.average) + ' average over ' + plural(p.games, 'game'),
        };
      }),
    });

    /* Week-by-week team results. */
    var resultColumns = [
      { key: 'week', label: 'Wk', className: 'col-rank', defaultDir: 'asc',
        value: function (r) { return r.number; },
        render: function (r) { return String(r.number); } },
      { key: 'date', label: 'Date', className: 'col-tight muted', optional: true, defaultDir: 'asc',
        value: function (r) { return r.date; },
        render: function (r) { return UI.shortDate(r.date); } },
      { key: 'lanes', label: 'Lanes', className: 'col-tight muted', optional: true, defaultDir: 'asc',
        value: function (r) { return r.lanes; },
        render: function (r) {
          return r.lanes || el('span', { class: 'muted', text: '—' });
        } },
      { key: 'opponent', label: 'Opponent', className: 'col-name', defaultDir: 'asc',
        value: function (r) { return r.opponentName; },
        render: function (r) {
          if (!r.opponentName) return el('span', { class: 'muted', text: '—' });
          return el('a', { href: '#/team/' + r.opponentId, text: r.opponentName });
        } },
    ];

    for (var g = 0; g < games; g++) {
      (function (idx) {
        resultColumns.push({ key: 'g' + idx, label: 'G' + (idx + 1), optional: true,
          value: function (r) { return r.gameTotals[idx]; },
          render: function (r) {
            var value = r.gameTotals[idx];
            if (value == null) return el('span', { class: 'muted', text: '—' });
            return best(value === team.highGame, UI.num(value));
          } });
      })(g);
    }

    resultColumns.push(
      { key: 'series', label: 'Series', className: 'num-strong',
        value: function (r) { return r.series; },
        render: function (r) { return best(r.series === team.highSeries, UI.num(r.series)); } },
      { key: 'handicap', label: 'Hdcp', className: 'muted', optional: true,
        value: function (r) { return r.handicap; },
        render: function (r) { return UI.num(r.handicap); } },
      { key: 'hdcpSeries', label: 'Hdcp Ser', className: 'muted', optional: true,
        value: function (r) { return r.hdcpSeries; },
        render: function (r) { return UI.num(r.hdcpSeries); } },
      { key: 'margin', label: 'Margin',
        value: function (r) { return r.margin; },
        render: function (r) {
          if (r.margin == null) return el('span', { class: 'muted', text: '—' });
          return el('span', {
            class: r.margin > 0 ? 'result-W' : r.margin < 0 ? 'result-L' : 'muted',
            text: signed(r.margin, 0),
          });
        } },
      { key: 'points', label: 'Pts',
        value: function (r) { return r.points; },
        render: function (r) { return UI.points(r.points); } },
      { key: 'result', label: 'Res', sortable: false,
        render: function (r) {
          if (!r.result) return el('span', { class: 'muted', text: '—' });
          var mark = el('span', { class: 'result-' + r.result, text: r.result });
          /* Flag the nights the handicap decided it. */
          if (r.wonOnHandicap || r.lostOnHandicap) {
            return el('span', {
              title: r.wonOnHandicap
                ? 'Out-pinned on scratch, won on handicap'
                : 'Out-pinned the opponent, lost on handicap',
            }, [mark, el('span', { class: 'hdcp-mark', text: 'ᴴ' })]);
          }
          return mark;
        } }
    );

    var results = team.weeks.length
      ? UI.table({ columns: resultColumns, rows: team.weeks, state: state.teamResults,
                   onSort: function () { renderTeam(); } })
      : UI.empty('No results recorded for this team yet.');

    /* Roster averages. */
    var roster = team.players.length
      ? UI.table({
          columns: [
            { key: 'name', label: 'Bowler', className: 'col-name', defaultDir: 'asc',
              value: function (r) { return r.name; },
              render: function (r) {
                return bowlerCell(r, r.substitute ? 'substitute' : null);
              } },
            { key: 'games', label: 'Gms', className: 'muted', optional: true,
              value: function (r) { return r.games; },
              render: function (r) { return UI.num(r.games); } },
            { key: 'average', label: 'Avg', className: 'num-strong',
              value: function (r) { return r.average; },
              render: function (r) { return UI.avg(r.average); } },
            { key: 'highGame', label: 'High',
              value: function (r) { return r.highGame; },
              render: function (r) { return UI.num(r.highGame); } },
            { key: 'highSeries', label: 'High Ser', optional: true,
              value: function (r) { return r.highSeries; },
              render: function (r) { return UI.num(r.highSeries); } },
            { key: 'pins', label: 'Pins', className: 'muted', optional: true,
              value: function (r) { return r.pins; },
              render: function (r) { return UI.num(r.pins); } },
          ].concat(model.scoring.useHandicap ? [
            { key: 'handicap', label: 'Hdcp', className: 'muted', optional: true,
              value: function (r) { return r.handicap; },
              render: function (r) { return UI.num(r.handicap); } },
            { key: 'handicapAverage', label: 'Hdcp Avg', className: 'muted', optional: true,
              value: function (r) { return r.handicapAverage; },
              render: function (r) { return UI.avg(r.handicapAverage); } },
          ] : []),
          rows: team.players,
          state: state.teamRoster,
          onSort: function () { renderTeam(); },
        })
      : UI.empty('No bowlers on this roster yet.');

    /* One week's individual lines, chosen from a picker. */
    var weekNumbers = team.weeks.map(function (w) { return w.number; });
    var selected = state.teamWeek[team.id];
    if (weekNumbers.indexOf(selected) === -1) selected = weekNumbers[weekNumbers.length - 1];

    var weekSection;
    if (!weekNumbers.length) {
      weekSection = UI.empty('Weekly scores appear here once results are added.');
    } else {
      var week = team.weeks.filter(function (w) { return w.number === selected; })[0];
      var picker = el('div', { class: 'card-body' }, el('div', { class: 'controls' }, [
        el('div', { class: 'control-field' }, [
          el('label', { for: 'week-pick', text: 'Week' }),
          el('select', {
            id: 'week-pick',
            onchange: function (e) {
              state.teamWeek[team.id] = Number(e.target.value);
              renderTeam();
            },
          }, team.weeks.map(function (w) {
            return el('option', {
              value: w.number,
              selected: w.number === selected,
            }, 'Week ' + w.number + (w.date ? ' · ' + UI.shortDate(w.date) : ''));
          })),
        ]),
      ]));

      var lineColumns = [
        { key: 'name', label: 'Bowler', className: 'col-name', defaultDir: 'asc',
          value: function (r) { return r.name; },
          render: function (r) { return bowlerCell(r); } },
      ];
      for (var i = 0; i < games; i++) {
        (function (idx) {
          lineColumns.push({ key: 'g' + idx, label: 'G' + (idx + 1),
            value: function (r) { return r.games[idx]; },
            render: function (r) {
              return r.games[idx] == null
                ? el('span', { class: 'muted', text: '—' })
                : UI.num(r.games[idx]);
            } });
        })(i);
      }
      lineColumns.push({ key: 'series', label: 'Series', className: 'num-strong',
        value: function (r) { return r.series; },
        render: function (r) { return UI.num(r.series); } });
      lineColumns = withHandicap(lineColumns, [
        { key: 'handicap', label: 'Hdcp', className: 'muted', optional: true,
          value: function (r) { return r.handicap; },
          render: function (r) { return UI.num(r.handicap); } },
        { key: 'hdcpSeries', label: 'Hdcp Ser', className: 'muted', optional: true,
          value: function (r) { return r.hdcpSeries; },
          render: function (r) { return UI.num(r.hdcpSeries); } },
      ]);

      var lines = week.lines.length
        ? UI.table({ columns: lineColumns, rows: week.lines, state: state.teamLines,
                     onSort: function () { renderTeam(); } })
        : UI.empty('Nobody bowled for this team in week ' + selected + '.');

      var totals = el('div', { class: 'card-body' }, el('p', { class: 'muted' }, [
        'Team total: ',
        el('span', { class: 'pill', text: UI.num(week.series) + ' scratch' }),
        ' ',
        el('span', { class: 'pill', text: UI.num(week.hdcpSeries) + ' with handicap' }),
        week.opponentName ? ' vs ' + week.opponentName : '',
        week.points != null ? ' · ' + UI.points(week.points) + '–' + UI.points(week.opponentPoints) + ' points' : '',
        week.margin != null
          ? ' · ' + (week.margin >= 0 ? 'ahead by ' : 'short by ') +
            UI.num(Math.abs(week.margin)) + ' on handicap pinfall'
          : '',
      ]));

      weekSection = el('div', null, [picker, lines, totals]);
    }

    draw([
      el('a', { class: 'back-link', href: '#/teams' }, ['←', ' All teams']),
      el('section', { class: 'banner' }, [
        Avatars.banner(team.name),
        el('div', { class: 'banner-text' }, [
          el('h1', { text: team.name }),
          el('p', { text: describeTeam(team, standing) }),
        ]),
      ]),
      summary,
      chartPair(
        UI.card('Series by week', 'With handicap', cardBody(seriesChart),
              "This team's three-game total for each week with handicap added - the number the match points are decided on. The rule marks their own average."),
        UI.card('League position', 'Place in the standings each week', cardBody(positionChart),
              "Where this team sat in the standings after each week. Higher on the chart is a better position.")
      ),
      chartPair(
        UI.card('Roster averages', 'Season to date', cardBody(rosterChart),
              "Each bowler's season scratch average, so the shape of the roster reads at a glance."),
        UI.card('Share of team pins', 'Who is carrying the load',
                cardBody(contributionChart),
              "What proportion of the team's total pinfall each bowler has contributed. This catches something an average does not: a high average counts for less if the bowler misses weeks.")
      ),
      UI.card('Head to head', 'Every opponent faced so far', headToHead(team),
              "Every opponent this team has met, with the record against them and how the points split in those matches."),
      UI.card('Weekly results', 'Scratch unless marked Hdcp', results,
              "Every week this team has bowled: the lane pair, each game's team total, the series, and the margin against the opponent in handicap pinfall. An H beside the result means the handicap decided it."),
      UI.card('Scores by week', 'Scratch unless marked Hdcp', weekSection,
              "Every bowler's individual line for the week you pick, adding up to the team totals underneath."),
      UI.card('Roster', 'Scratch unless marked Hdcp', roster,
              "Season figures for every bowler on the team, scratch and with handicap."),
    ]);

    function renderTeam() { teamViewRedraw(team.id); }
  }

  /* teamView rebuilds from scratch on sort; this keeps the call site tidy. */
  function teamViewRedraw(teamId) { teamView(teamId); }

  function headToHead(team) {
    if (!team.headToHead.length) return UI.empty('No matches recorded yet.');
    return UI.table({
      columns: [
        { key: 'name', label: 'Opponent', className: 'col-name link-cell', sortable: false,
          render: function (r) {
            return el('a', { href: '#/team/' + r.opponentId, text: r.name });
          } },
        { key: 'played', label: 'Met', className: 'muted', sortable: false,
          render: function (r) { return UI.num(r.played); } },
        { key: 'record', label: 'W-L', className: 'num-strong', sortable: false,
          render: function (r) {
            return r.wins + '-' + r.losses + (r.ties ? '-' + r.ties : '');
          } },
        { key: 'points', label: 'Pts', sortable: false,
          render: function (r) {
            return UI.points(r.points) + '\u2013' + UI.points(r.opponentPoints);
          } },
      ],
      rows: team.headToHead, state: null, onSort: function () {},
    });
  }

  function describeTeam(team, standing) {
    var bits = [];
    if (standing) bits.push('#' + standing.rank + ' of ' + standing.of);
    bits.push(plural(UI.points(team.points), 'point'));
    if (team.weeks.length) bits.push(plural(team.weeks.length, 'week') + ' bowled');
    return bits.join(' · ');
  }

  /* ---------- player drill-down ---------- */

  function playerView(playerId) {
    var player = model.playersById[playerId];
    if (!player) return notFound('That bowler is not in the league.');

    document.title = player.name + ' · ' + (model.league.name || 'Bowling League');

    var games = gameCount();
    var standing = player.trend.length ? player.trend[player.trend.length - 1] : null;
    var tiles = [
      UI.stat('Average', UI.avg(player.average),
              "Total pins divided by games bowled, across the whole season. This is the number the leaderboard ranks on."),
      UI.stat('vs book', signed(player.vsBook),
              "How far the season average sits above or below the book average the handicap is set from. Early on, one good or bad night moves this a long way."),
      UI.stat('League rank', standing ? '#' + standing.rank : '—',
              "Position among every bowler in the league with a recorded score, by season average."),
      UI.stat('High game', UI.num(player.highGame),
              "The best single game this bowler has thrown this season."),
      UI.stat('High series', UI.num(player.highSeries),
              "The best three-game total this bowler has thrown in one night."),
      UI.stat('Games', UI.num(player.games),
              "How many individual games this bowler has thrown this season."),
      UI.stat('Total pins', UI.big(player.pins),
              "Every pin this bowler has knocked down this season."),
      model.scoring.useHandicap
        ? UI.stat('Handicap', UI.num(player.handicap),
              "Pins added to every game, worked out as 90% of the gap between the book average and 220. A higher book average means a smaller handicap.")
        : UI.stat('Book average', UI.avg(player.entryAverage),
              "The established average the handicap is calculated from, carried over rather than worked out from this season."),
      UI.stat('Consistency', player.spread == null ? '—' : '± ' + UI.avg(player.spread),
              "How far a typical game sits from this bowler's own average. A low number is a steady bowler, a high one is streaky."),
      UI.stat('Last ' + (player.recent ? plural(player.recent.weeks, 'week') : '3 weeks'),
              player.recent ? UI.avg(player.recent.average) : '—',
              "The average over the last three weeks bowled, or fewer if the season is younger than that. Compare it with the season average to see who is running hot or cold."),
      UI.stat('Recent form', player.recent ? signed(player.recent.delta) : '—',
              "The last three weeks against the season average. Positive means bowling better lately than the season as a whole."),
      model.scoring.useHandicap
        ? UI.stat('Hdcp average', UI.avg(player.handicapAverage),
              "The season average with the handicap added - what this bowler contributes to a team total in practice.")
        : UI.stat('Weeks', UI.num(player.weeksBowled),
              "How many weeks this bowler has bowled in. It can be fewer than games divided by three if they missed a night."),
    ];

    /* Running average after each week, so a hot or cold streak is visible. */
    var runningPins = 0;
    var runningGames = 0;
    var rows = player.weeks.map(function (week) {
      runningPins += week.series;
      runningGames += week.games.length;
      return {
        name: 'Week ' + week.number,
        number: week.number,
        date: week.date,
        games: week.games,
        series: week.series,
        average: week.average,
        running: runningPins / runningGames,
      };
    });

    var columns = [
      { key: 'week', label: 'Wk', className: 'col-rank', defaultDir: 'asc',
        value: function (r) { return r.number; },
        render: function (r) { return String(r.number); } },
      { key: 'date', label: 'Date', className: 'col-tight muted', optional: true, defaultDir: 'asc',
        value: function (r) { return r.date; },
        render: function (r) { return UI.shortDate(r.date); } },
    ];
    for (var i = 0; i < games; i++) {
      (function (idx) {
        columns.push({ key: 'g' + idx, label: 'G' + (idx + 1),
          value: function (r) { return r.games[idx]; },
          render: function (r) {
            var value = r.games[idx];
            if (value == null) return el('span', { class: 'muted', text: '—' });
            return best(value === player.highGame, UI.num(value));
          } });
      })(i);
    }
    columns.push(
      { key: 'series', label: 'Series', className: 'num-strong',
        value: function (r) { return r.series; },
        render: function (r) { return best(r.series === player.highSeries, UI.num(r.series)); } },
      { key: 'hdcpSeries', label: 'Hdcp Ser', className: 'muted', optional: true,
        value: function (r) { return r.series + player.handicap * r.games.length; },
        render: function (r) {
          if (!model.scoring.useHandicap) return el('span', { class: 'muted', text: '—' });
          return UI.num(r.series + player.handicap * r.games.length);
        } },
      { key: 'average', label: 'Avg', optional: true,
        value: function (r) { return r.average; },
        render: function (r) { return UI.avg(r.average); } },
      { key: 'running', label: 'Season Avg', className: 'muted', optional: true,
        value: function (r) { return r.running; },
        render: function (r) { return UI.avg(r.running); } }
    );

    var body = rows.length
      ? UI.table({ columns: columns, rows: rows, state: state.playerWeeks,
                   onSort: function () { playerView(playerId); } })
      : UI.empty('No scores recorded for ' + player.name + ' yet.');

    var subtitle = [];
    if (standing) subtitle.push('#' + standing.rank + ' of ' + plural(standing.of, 'bowler'));
    subtitle.push(UI.avg(player.average) + ' average');

    /* Every game in season order, measured against the bowler's own average. */
    var gameChart = Charts.line({
      points: player.weeks.reduce(function (acc, week) {
        week.games.forEach(function (score, i) {
          acc.push({
            label: 'Week ' + week.number + ', game ' + (i + 1),
            axis: i === 0 ? String(week.number) : '',
            value: score,
            caption: UI.num(week.series) + ' series that night',
          });
        });
        return acc;
      }, []),
      reference: player.average ? { value: player.average, label: 'avg ' + UI.avg(player.average) } : null,
      label: 'Every game bowled',
    });

    var averageChart = Charts.line({
      points: player.trend.map(function (t) {
        return {
          label: 'Week ' + t.week,
          axis: String(t.week),
          value: t.average,
          caption: t.series != null ? UI.num(t.series) + ' series' : 'did not bowl',
        };
      }),
      format: function (v) { return UI.avg(v); },
      reference: { value: model.summary.average, label: 'league ' + UI.avg(model.summary.average) },
      label: 'Season average by week',
    });

    var rankChart = Charts.line({
      points: player.trend.map(function (t) {
        return {
          label: 'Week ' + t.week,
          axis: String(t.week),
          value: t.rank,
          caption: UI.avg(t.average) + ' average, of ' + plural(t.of, 'bowler'),
        };
      }),
      domain: [1, standing ? standing.of : model.summary.bowlers],
      invert: true,
      integerTicks: true,
      format: function (v) { return '#' + Math.round(v); },
      formatAxis: function (v) { return '#' + Math.round(v); },
      label: 'League rank by week',
    });

    draw([
      el('a', { class: 'back-link', href: '#/bowlers' }, ['←', ' All bowlers']),
      el('section', { class: 'profile' }, [
        Avatars.player(player.name),
        el('div', { class: 'profile-text' }, [
          el('h1', { text: player.name }),
          el('p', { text: subtitle.join(' · ') }),
          el('p', { class: 'muted' }, [
            'Bowls for ',
            el('a', { href: '#/team/' + player.teamId, text: player.teamName }),
            player.substitute ? ' · substitute' : '',
          ]),
        ]),
      ]),
      UI.statGrid(tiles),
      UI.card('Every game', 'Each game this season, in order', cardBody(gameChart),
              "Every single game this bowler has thrown, in the order they were bowled. The rule across the middle is their season average, so peaks and troughs are easy to read."),
      chartPair(
        UI.card('Average by week', 'Season to date after each night', cardBody(averageChart),
              "This bowler's season average as it stood after each week, against the league average. It steadies as the season goes on."),
        UI.card('League rank by week', 'Against every bowler with a score', cardBody(rankChart),
              "Where this bowler ranked among everyone in the league after each week. Higher on the chart is a better rank.")
      ),
      UI.card('Scores by week',
              games + ' games per week · scratch unless marked Hdcp', body,
              "Every week this bowler has bowled, with each game, the series, that night's average, and the season average as it stood afterwards."),
      chartPair(
        UI.card('By game', 'Slow starter or strong finisher',
                slotTable(player.slots, player.average),
              "This bowler's average in the first, second and third game of the night, against their own overall average. It shows whether they warm up or fade."),
        UI.card('Milestones', 'Scores worth remembering', el('div', null, [
          el('div', { class: 'card-body' }, milestoneRow(player.milestones)),
          player.entryAverage != null
            ? el('div', { class: 'card-body' }, el('p', { class: 'muted', text:
                'Book average ' + player.entryAverage + ', carrying ' +
                UI.avg(player.average) + ' — ' + signed(player.vsBook) + '.' }))
            : null,
        ]),
              "A count of this bowler's notable scores - 200 and 250 games, 600 and 700 series - and how their season average compares with their book average.")
      ),
    ]);
  }

  /* ---------- shared bits ---------- */

  /* Signed numbers read better with an explicit +. */
  function signed(value, digits) {
    if (value == null || !isFinite(value)) return '—';
    var text = Math.abs(value).toFixed(digits == null ? 1 : digits);
    return (value > 0 ? '+' : value < 0 ? '\u2212' : '') + text;
  }

  function milestoneRow(milestones) {
    var pills = [];
    function add(counts, noun) {
      Object.keys(counts).forEach(function (mark) {
        if (!counts[mark]) return;
        pills.push(el('span', { class: 'pill',
          text: counts[mark] + ' \u00d7 ' + mark + '+ ' + noun }));
      });
    }
    add(milestones.games, 'game');
    add(milestones.series, 'series');
    if (!pills.length) {
      return el('p', { class: 'muted', text: 'No milestone scores yet.' });
    }
    return el('div', { class: 'pill-row' }, pills);
  }

  /* Game 1/2/3 averages against the overall average they belong to. */
  function slotTable(slots, baseline) {
    if (!slots.length) return UI.empty('No games recorded yet.');
    return UI.table({
      columns: [
        { key: 'game', label: 'Game', className: 'col-name', sortable: false,
          render: function (r) { return 'Game ' + r.game; } },
        { key: 'average', label: 'Average', className: 'num-strong', sortable: false,
          render: function (r) { return UI.avg(r.average); } },
        { key: 'delta', label: 'vs overall', sortable: false,
          render: function (r) {
            var delta = r.average - baseline;
            return el('span', {
              class: delta > 0 ? 'result-W' : delta < 0 ? 'result-L' : 'muted',
              text: signed(delta),
            });
          } },
        { key: 'games', label: 'Games', className: 'muted', optional: true, sortable: false,
          render: function (r) { return UI.num(r.games); } },
      ],
      rows: slots, state: null, onSort: function () {},
    });
  }

  function plural(count, word) {
    return count + ' ' + word + (Number(count) === 1 ? '' : 's');
  }

  function record(team) {
    return team.wins + '-' + team.losses + (team.ties ? '-' + team.ties : '');
  }

  /* The podium gets a medal; everyone else gets a plain number. Only ever a
     decoration on top of the number that is already there. */
  function rankMark(index) {
    var place = index + 1;
    if (place > 3) return String(place);
    return el('span', { class: 'medal medal-' + place, text: String(place) });
  }

  function best(isBest, content) {
    return isBest ? el('span', { class: 'best', title: 'Season best', text: content }) : content;
  }

  function leagueSubtitle() {
    var bits = [];
    if (model.league.season) bits.push('Season ' + model.league.season);
    if (model.weeks.length) {
      var last = model.weeks[model.weeks.length - 1];
      bits.push('through week ' + last.number +
                (model.league.weeksInSeason ? ' of ' + model.league.weeksInSeason : ''));
      if (last.date) bits.push(UI.longDate(last.date));
    } else {
      bits.push('no weeks recorded yet');
    }
    return bits.join(' · ');
  }

  function sampleNotice() {
    if (!model.league.sampleData) return null;
    return el('div', { class: 'notice' }, [
      el('span', { 'aria-hidden': 'true' }, '🎳'),
      el('div', null, [
        el('strong', { text: 'Showing placeholder data' }),
        'These are made-up bowlers and scores so you can see the layout. Replace data/league.js with the real league and drop the "sampleData" flag.',
      ]),
    ]);
  }

  function notFound(message) {
    document.title = 'Not found · ' + (model.league.name || 'Bowling League');
    draw([
      pageHead('Not found', message, '#/', 'Overview'),
      el('section', { class: 'card' }, UI.empty('Check the link, or head back to the overview.')),
    ]);
  }

  function draw(children) {
    UI.clear(viewRoot);
    UI.append(viewRoot, children.filter(Boolean));
  }

  /* ---------- routing ---------- */

  function route() {
    var hash = location.hash.replace(/^#\/?/, '');
    var parts = hash.split('/').filter(Boolean).map(decodeURIComponent);

    if (parts[0] === 'team' && parts[1]) return teamView(parts[1]);
    if (parts[0] === 'player' && parts[1]) return playerView(parts[1]);
    if (parts[0] === 'teams') return teamsView();
    if (parts[0] === 'bowlers') return playersView();
    return overviewView();
  }

  function navigated() {
    /* A name typed on the bowler tab would hide everything on the team tab. */
    state.search = '';
    route();
    window.scrollTo(0, 0);
  }

  /* ---------- theme ---------- */

  function initTheme() {
    var button = document.getElementById('theme-toggle');
    var saved = null;
    try { saved = localStorage.getItem('bowling-theme'); } catch (e) { /* private mode */ }
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
    button.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      if (!current) {
        current = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      var next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('bowling-theme', next); } catch (e) { /* ignore */ }
    });
  }

  /* ---------- boot ---------- */

  function start() {
    viewRoot = document.getElementById('view');
    initTheme();

    var raw = window.LEAGUE_DATA;
    if (!raw) {
      viewRoot.appendChild(UI.empty('Could not load data/league.js — check that the file is present and valid JavaScript.'));
      return;
    }

    model = window.LeagueStats.build(raw);

    document.getElementById('league-name').textContent = model.league.name || 'Bowling League';
    var meta = [model.league.venue, model.league.night].filter(Boolean).join(' · ');
    document.getElementById('league-meta').textContent = meta;

    var footer = [];
    if (model.scoring.useHandicap) {
      footer.push('Handicap: ' + model.scoring.handicapPercent + '% of ' +
                  model.scoring.handicapBasis + '.');
    }
    footer.push('Averages are season to date.');
    if (model.weeks.length) footer.push(plural(model.weeks.length, 'week') + ' recorded.');
    document.getElementById('footer-note').textContent = footer.join(' ');

    window.addEventListener('hashchange', navigated);
    route();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
