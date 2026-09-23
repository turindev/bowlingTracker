/*
 * Turns the raw league data into everything the views need: season averages,
 * handicaps, team game totals, and head-to-head points.
 *
 * Everything is computed once at load and cached on the returned model, so the
 * views can sort and re-render without recomputing.
 */
(function () {
  'use strict';

  /* Scores worth calling out. Bowlers count these. */
  var GAME_MILESTONES = [200, 250];
  var SERIES_MILESTONES = [600, 700];

  var DEFAULT_SCORING = {
    gamesPerWeek: 3,
    useHandicap: false,
    handicapBasis: 220,
    handicapPercent: 90,
    /* League rule 9: last season's book average carries the first 12 games,
       then handicap is recalculated from the games actually bowled. */
    establishAfterGames: 12,
    pointsPerGame: 1,
    pointsForSeries: 1,
  };

  function isScore(v) {
    return typeof v === 'number' && isFinite(v) && v >= 0;
  }

  function sum(nums) {
    var total = 0;
    for (var i = 0; i < nums.length; i++) total += nums[i];
    return total;
  }

  /* A bowler's handicap off a given average, e.g. 90% of (220 - avg). */
  function handicapFor(average, scoring) {
    if (!scoring.useHandicap || average == null) return 0;
    var diff = scoring.handicapBasis - average;
    if (diff <= 0) return 0;
    return Math.floor(diff * (scoring.handicapPercent / 100));
  }

  /* Which average a bowler's handicap comes off, given the games already
     behind them. Before the league establishes an average it is the book one;
     after, it is what they have bowled. */
  function handicapBase(player, games, pins, establish) {
    if (games >= establish && games > 0) return pins / games;
    if (player.entryAverage != null) return player.entryAverage;
    return player.average;
  }

  /* The handicap in force for a week the bowler has no line of their own in,
     such as one covered by a blind. */
  function handicapAt(player, weekNumber, scoring) {
    var games = 0;
    var pins = 0;
    player.weeks.forEach(function (w) {
      if (w.number >= weekNumber) return;
      games += w.games.length;
      pins += w.series;
    });
    return handicapFor(handicapBase(player, games, pins, scoring.establishAfterGames), scoring);
  }

  function build(raw) {
    var scoring = Object.assign({}, DEFAULT_SCORING, raw.scoring || {});
    var league = Object.assign({}, raw.league || {});

    var players = (raw.players || []).map(function (p) {
      return {
        id: p.id,
        name: p.name,
        teamId: p.teamId,
        entryAverage: isScore(p.entryAverage) ? p.entryAverage : null,
        /* Vacant spots and absentee scores count for the team but are not
           real bowlers, so they stay off the individual leaderboard. */
        placeholder: !!p.placeholder,
        substitute: !!p.substitute,
        /* vacant | absentee | substitute — what the page shows beside the
           name. Substitutes bowl for real, so they keep their own flag. */
        role: p.role || (p.substitute ? 'substitute' : null),
        weeks: [],
        games: 0,
        pins: 0,
        average: null,
        handicap: 0,
        highGame: null,
        highSeries: null,
        trend: [],
        vsBook: null,
        spread: null,
        recent: null,
        slots: [],
        milestones: { games: {}, series: {} },
      };
    });

    var rawTeams = raw.teams || [];
    var teams = rawTeams.map(function (t) {
      return {
        id: t.id,
        name: t.name,
        players: [],
        weeks: [],
        points: 0,
        trend: [],
        hdcpPins: 0,
        hdcpAverage: null,
        pace: null,
        opponentAverage: null,
        headToHead: [],
        highHdcpGame: null,
        highHdcpSeries: null,
        wins: 0,
        losses: 0,
        ties: 0,
        games: 0,
        pins: 0,
        average: null,
        highGame: null,
        highSeries: null,
      };
    });

    var playersById = index(players);
    var teamsById = index(teams);

    /* The league numbers its teams (1-24) and people say "team 8" as often as
       the name. An explicit number wins; otherwise it comes from the id. */
    teams.forEach(function (t, i) {
      var raw = (rawTeams[i] || {}).number;
      var fromId = parseInt(String(t.id).replace(/\D+/g, ''), 10);
      t.number = raw != null ? raw : (isFinite(fromId) ? fromId : null);
    });

    players.forEach(function (p) {
      var team = teamsById[p.teamId];
      p.teamNumber = team ? team.number : null;
      /* A substitute belongs to no team; each of their lines says which
         team they bowled for that night. */
      p.teamName = team ? team.name : (p.substitute ? 'Substitute' : 'Unassigned');
      if (team) team.players.push(p);
    });

    var weeks = (raw.weeks || [])
      .slice()
      .sort(function (a, b) { return a.number - b.number; });

    /* Pass 1: per-bowler lines, week by week. */
    weeks.forEach(function (week) {
      (week.scores || []).forEach(function (line) {
        var player = playersById[line.playerId];
        if (!player) return;
        var games = (line.games || []).filter(isScore);
        if (!games.length) return;
        /* A blind (rule 7: ten under the bowler's average) counts for the
           team, which pass 2 handles, but it is not a game the bowler threw,
           so it stays out of their average, highs and trend. */
        if (line.blind) return;

        var series = sum(games);
        player.weeks.push({
          number: week.number,
          date: week.date,
          games: games,
          series: series,
          average: series / games.length,
          /* Who they bowled for that night, when it was not their own team. */
          teamId: line.teamId || player.teamId,
        });
        player.games += games.length;
        player.pins += series;
        player.highGame = Math.max(player.highGame || 0, Math.max.apply(null, games));
        player.highSeries = Math.max(player.highSeries || 0, series);
      });
    });

    players.forEach(function (p) {
      if (p.games > 0) p.average = p.pins / p.games;

      /* Average per game slot — does this bowler start hot or finish strong? */
      var slotPins = [];
      var slotCount = [];
      p.weeks.forEach(function (week) {
        week.games.forEach(function (score, i) {
          slotPins[i] = (slotPins[i] || 0) + score;
          slotCount[i] = (slotCount[i] || 0) + 1;
        });
      });
      p.slots = slotPins.map(function (total, i) {
        return { game: i + 1, average: total / slotCount[i], games: slotCount[i] };
      });

      GAME_MILESTONES.forEach(function (mark) {
        p.milestones.games[mark] = p.weeks.reduce(function (count, week) {
          return count + week.games.filter(function (g) { return g >= mark; }).length;
        }, 0);
      });
      SERIES_MILESTONES.forEach(function (mark) {
        p.milestones.series[mark] = p.weeks.filter(function (week) {
          return week.series >= mark;
        }).length;
      });

      /* Consistency: how far a typical game sits from the bowler's own
         average. A low number is a steady bowler, a high one is streaky. */
      var allGames = [];
      p.weeks.forEach(function (week) {
        week.games.forEach(function (score) { allGames.push(score); });
      });
      if (allGames.length > 1) {
        var mean = sum(allGames) / allGames.length;
        var variance = allGames.reduce(function (acc, g) {
          return acc + (g - mean) * (g - mean);
        }, 0) / allGames.length;
        p.spread = Math.sqrt(variance);
      }

      /* Recent form: the last three weeks against the season as a whole. */
      var lastThree = p.weeks.slice(-3);
      if (lastThree.length) {
        var recentPins = 0;
        var recentGames = 0;
        lastThree.forEach(function (week) {
          recentPins += week.series;
          recentGames += week.games.length;
        });
        p.recent = {
          average: recentPins / recentGames,
          weeks: lastThree.length,
          delta: p.average == null ? null : recentPins / recentGames - p.average,
        };
      }

      /* Against the book average handicap is set from — the number bowlers
         actually argue about. */
      if (p.entryAverage != null && p.average != null) {
        p.vsBook = p.average - p.entryAverage;
      }
      /* Handicap is not one number for the season. Rule 9 puts every bowler
         on last year's book average for their first 12 games, then moves them
         onto the average they have actually bowled. A week is scored with the
         handicap that was in force when it was bowled, which is set by the
         games completed BEFORE it — the league adjusts between weeks, never
         part way through one. */
      var establish = scoring.establishAfterGames;
      var doneGames = 0;
      var donePins = 0;
      p.handicapByWeek = {};
      p.weeks.forEach(function (week) {
        week.handicap = handicapFor(handicapBase(p, doneGames, donePins, establish), scoring);
        p.handicapByWeek[week.number] = week.handicap;
        doneGames += week.games.length;
        donePins += week.series;
      });

      /* What the next week will be bowled on, and the number the tables show. */
      p.handicap = handicapFor(handicapBase(p, doneGames, donePins, establish), scoring);
      p.established = doneGames >= establish;
      p.gamesToEstablish = Math.max(establish - doneGames, 0);
      p.handicapAverage = p.average == null ? null : p.average + p.handicap;
      p.weeksBowled = p.weeks.length;
    });

    buildTrend(players, weeks);

    /* Pass 2: team totals per week, then head-to-head points. */
    var matches = [];
    weeks.forEach(function (week) {
      var byTeam = {};
      teams.forEach(function (t) {
        byTeam[t.id] = { lines: [], gameTotals: [], handicap: 0 };
      });

      (week.scores || []).forEach(function (line) {
        var player = playersById[line.playerId];
        /* A line counts for the team it names, else the bowler's own. That
           covers a substitute, and a rostered bowler filling in elsewhere. */
        var teamId = line.teamId || player && player.teamId;
        if (!player || !byTeam[teamId]) return;
        var games = (line.games || []).filter(isScore);
        if (!games.length) return;
        /* The handicap this bowler carried that night, not today's. A blind
           never reaches pass 1, so it is worked out from the games before. */
        var hdcp = player.handicapByWeek[week.number];
        if (hdcp == null) hdcp = handicapAt(player, week.number, scoring);
        byTeam[teamId].lines.push({
          playerId: player.id,
          name: player.name,
          placeholder: player.placeholder,
          substitute: player.substitute || teamId !== player.teamId,
          blind: !!line.blind,
          /* A rostered bowler filling in for another team is that team's
             substitute for the night, and should be marked as one there. */
          role: line.blind ? 'absentee'
            : teamId !== player.teamId ? 'substitute' : player.role,
          games: games,
          series: sum(games),
          handicap: hdcp,
          hdcpSeries: sum(games) + hdcp * games.length,
        });
        byTeam[teamId].handicap += hdcp;
      });

      Object.keys(byTeam).forEach(function (teamId) {
        var bucket = byTeam[teamId];
        var gameCount = bucket.lines.reduce(function (max, l) {
          return Math.max(max, l.games.length);
        }, 0);
        for (var g = 0; g < gameCount; g++) {
          var total = 0;
          for (var i = 0; i < bucket.lines.length; i++) {
            if (isScore(bucket.lines[i].games[g])) total += bucket.lines[i].games[g];
          }
          bucket.gameTotals.push(total);
        }
      });

      (week.matches || []).forEach(function (match) {
        var home = teamsById[match.homeTeamId];
        var away = teamsById[match.awayTeamId];
        if (!home || !away) return;
        var hb = byTeam[home.id];
        var ab = byTeam[away.id];
        var result = scoreMatch(hb, ab, match, scoring);
        var lanes = match.lanes || null;
        var hTotals = totalsOf(hb, scoring);
        var aTotals = totalsOf(ab, scoring);
        attach(home, away, hb, result.home, result.away, week, aTotals, lanes);
        attach(away, home, ab, result.away, result.home, week, hTotals, lanes);
        matches.push({
          week: week.number, date: week.date,
          home: home, away: away,
          homeTotals: hTotals, awayTotals: aTotals,
          homePoints: result.home, awayPoints: result.away,
          lanes: lanes,
          margin: Math.abs(hTotals.hdcpSeries - aTotals.hdcpSeries),
          homeWeek: home.weeks[home.weeks.length - 1],
          awayWeek: away.weeks[away.weeks.length - 1],
          note: match.note || null,
        });
        if (match.note) {
          home.weeks[home.weeks.length - 1].note = match.note;
          away.weeks[away.weeks.length - 1].note = match.note;
        }
      });

      /* Teams that bowled but have no match recorded still get their week
         listed, so nothing silently disappears from a drill-down. */
      teams.forEach(function (team) {
        var alreadyLogged = team.weeks.some(function (w) { return w.number === week.number; });
        if (alreadyLogged || !byTeam[team.id].lines.length) return;
        attach(team, null, byTeam[team.id], null, null, week, null, null);
      });
    });

    teams.forEach(function (t) {
      t.weeks.sort(function (a, b) { return a.number - b.number; });
      if (t.games > 0) {
        t.average = t.pins / t.games;
        t.hdcpAverage = t.hdcpPins / t.games;
      }
      t.players.sort(function (a, b) { return (b.average || 0) - (a.average || 0); });
    });

    buildTeamTrend(teams, weeks);
    buildTeamContext(teams, league);

    return {
      league: league,
      scoring: scoring,
      summary: summarise(players, teams, weeks, matches),
      matches: matches,
      halves: buildHalves(teams, league, weeks),
      teams: teams,
      players: players,
      weeks: weeks,
      teamsById: teamsById,
      playersById: playersById,
      lastWeek: weeks.length ? weeks[weeks.length - 1] : null,
      hasScores: players.some(function (p) { return p.games > 0; }),
    };
  }

  /* Walks the season once, week by week, recording where each bowler's average
     and league rank stood after every night. This is what the trend charts on
     the profile pages plot. */
  function buildTrend(players, weeks) {
    var real = players.filter(function (p) { return !p.placeholder; });
    var running = {};
    real.forEach(function (p) { running[p.id] = { pins: 0, games: 0 }; });

    weeks.forEach(function (week) {
      var bowledThisWeek = {};
      (week.scores || []).forEach(function (line) {
        if (!running[line.playerId]) return;
        var games = (line.games || []).filter(isScore);
        if (!games.length) return;
        running[line.playerId].pins += sum(games);
        running[line.playerId].games += games.length;
        bowledThisWeek[line.playerId] = sum(games);
      });

      var standing = real.filter(function (p) { return running[p.id].games > 0; });
      standing.sort(function (a, b) {
        return running[b.id].pins / running[b.id].games - running[a.id].pins / running[a.id].games;
      });

      standing.forEach(function (p, i) {
        p.trend.push({
          week: week.number,
          date: week.date,
          average: running[p.id].pins / running[p.id].games,
          rank: i + 1,
          of: standing.length,
          series: bowledThisWeek[p.id] != null ? bowledThisWeek[p.id] : null,
        });
      });
    });
  }

  /* The same walk for teams: cumulative points and standings position after
     each week, which is what the team dashboard plots. */
  function buildTeamTrend(teams, weeks) {
    var running = {};
    teams.forEach(function (t) { running[t.id] = { points: 0, pins: 0 }; });

    weeks.forEach(function (week) {
      var thisWeek = {};
      teams.forEach(function (team) {
        var entry = team.weeks.filter(function (w) { return w.number === week.number; })[0];
        if (!entry) return;
        thisWeek[team.id] = entry;
        if (entry.points != null) running[team.id].points += entry.points;
        running[team.id].pins += entry.series;
      });

      var standing = teams.slice().sort(function (a, b) {
        return running[b.id].points - running[a.id].points || running[b.id].pins - running[a.id].pins;
      });

      standing.forEach(function (team, i) {
        var entry = thisWeek[team.id];
        team.trend.push({
          week: week.number,
          date: week.date,
          points: running[team.id].points,
          rank: i + 1,
          of: teams.length,
          series: entry ? entry.series : null,
          hdcpSeries: entry ? entry.hdcpSeries : null,
          weekPoints: entry ? entry.points : null,
        });
      });
    });
  }

  /* Projected finish, schedule strength and head-to-head, all of which need
     every team's season totals in place first. */
  function buildTeamContext(teams, league) {
    var byId = index(teams);

    teams.forEach(function (team) {
      var played = team.weeks.filter(function (w) { return w.points != null; });
      if (played.length && league.weeksInSeason) {
        team.pace = team.points / played.length * league.weeksInSeason;
      }

      /* Strength of schedule: the average team game of everyone faced. */
      var opponents = played.filter(function (w) { return w.opponentId; });
      if (opponents.length) {
        var total = 0;
        var counted = 0;
        opponents.forEach(function (w) {
          var opponent = byId[w.opponentId];
          if (opponent && opponent.average != null) { total += opponent.average; counted++; }
        });
        if (counted) team.opponentAverage = total / counted;
      }

      var records = {};
      opponents.forEach(function (w) {
        var record = records[w.opponentId] || (records[w.opponentId] = {
          opponentId: w.opponentId,
          name: w.opponentName,
          played: 0, wins: 0, losses: 0, ties: 0, points: 0, opponentPoints: 0,
        });
        record.played++;
        record.points += w.points;
        record.opponentPoints += w.opponentPoints;
        if (w.result === 'W') record.wins++;
        else if (w.result === 'L') record.losses++;
        else record.ties++;
      });
      team.headToHead = Object.keys(records).map(function (k) { return records[k]; })
        .sort(function (a, b) { return b.points - a.points || a.name.localeCompare(b.name); });
    });
  }

  /* League-wide totals and record scores for the overview page. Placeholder
     entries (vacant spots, absentee scores) are team bookkeeping, not people,
     so they stay out of every count and average here. */
  function summarise(players, teams, weeks, matches) {
    var real = players.filter(function (p) { return !p.placeholder && p.games > 0; });

    var pins = 0;
    var games = 0;
    var highGame = null;
    var highSeries = null;

    real.forEach(function (p) {
      pins += p.pins;
      games += p.games;
      p.weeks.forEach(function (week) {
        week.games.forEach(function (score) {
          if (!highGame || score > highGame.value) {
            highGame = { value: score, player: p, week: week.number };
          }
        });
        if (!highSeries || week.series > highSeries.value) {
          highSeries = { value: week.series, player: p, week: week.number };
        }
      });
    });

    var best = null;
    function consider(current, value, team, number) {
      if (value == null) return current;
      return !current || value > current.value
        ? { value: value, team: team, week: number }
        : current;
    }
    var teamGame = null, teamSeries = null, teamHdcpGame = null, teamHdcpSeries = null;
    teams.forEach(function (t) {
      t.weeks.forEach(function (w) {
        w.gameTotals.forEach(function (total) {
          teamGame = consider(teamGame, total, t, w.number);
        });
        w.hdcpGameTotals.forEach(function (total) {
          teamHdcpGame = consider(teamHdcpGame, total, t, w.number);
        });
        teamSeries = consider(teamSeries, w.series, t, w.number);
        teamHdcpSeries = consider(teamHdcpSeries, w.hdcpSeries, t, w.number);
      });
      if (!best || (t.points || 0) > best.points) best = t;
    });

    var byWeek = weeks.map(function (week) {
      var pins = 0;
      var count = 0;
      (week.scores || []).forEach(function (line) {
        var player = real.filter(function (p) { return p.id === line.playerId; })[0];
        if (!player) return;
        var games = (line.games || []).filter(function (g) { return isScore(g); });
        pins += games.reduce(function (a, b) { return a + b; }, 0);
        count += games.length;
      });
      return {
        week: week.number, date: week.date, pins: pins, games: count,
        average: count ? pins / count : null,
      };
    });

    /* League-wide average per game slot: lanes usually open up late. */
    var slotPins = [];
    var slotCount = [];
    real.forEach(function (p) {
      p.weeks.forEach(function (week) {
        week.games.forEach(function (score, i) {
          slotPins[i] = (slotPins[i] || 0) + score;
          slotCount[i] = (slotCount[i] || 0) + 1;
        });
      });
    });
    var slots = slotPins.map(function (total, i) {
      return { game: i + 1, average: total / slotCount[i], games: slotCount[i] };
    });

    var milestones = { games: {}, series: {} };
    GAME_MILESTONES.forEach(function (mark) {
      milestones.games[mark] = real.reduce(function (count, p) {
        return count + (p.milestones.games[mark] || 0);
      }, 0);
    });
    SERIES_MILESTONES.forEach(function (mark) {
      milestones.series[mark] = real.reduce(function (count, p) {
        return count + (p.milestones.series[mark] || 0);
      }, 0);
    });

    /* Scoring by lane pair, across every week bowled there. Teams rotate
       around the house, so this only starts measuring the lanes rather than
       the rosters once several weeks have accumulated. */
    var byLanes = {};
    matches.forEach(function (m) {
      if (!m.lanes) return;
      var entry = byLanes[m.lanes] || (byLanes[m.lanes] = {
        lanes: m.lanes,
        first: parseInt(m.lanes, 10),
        pins: 0,
        games: 0,
        weeks: 0,
      });
      [m.home, m.away].forEach(function (team) {
        var week = team.weeks.filter(function (w) { return w.number === m.week; })[0];
        if (!week) return;
        week.lines.forEach(function (line) {
          entry.pins += line.series;
          entry.games += line.games.length;
        });
      });
      entry.weeks++;
    });

    var lanePairs = Object.keys(byLanes).map(function (key) {
      var entry = byLanes[key];
      entry.average = entry.games ? entry.pins / entry.games : null;
      return entry;
    }).sort(function (a, b) { return a.first - b.first; });

    var swings = matches.filter(function (m) {
      if (m.homePoints == null || m.homePoints === m.awayPoints) return false;
      var pointsWinner = m.homePoints > m.awayPoints ? 'home' : 'away';
      var scratchWinner = m.homeTotals.series > m.awayTotals.series ? 'home' : 'away';
      return pointsWinner !== scratchWinner;
    });

    return {
      byWeek: byWeek,
      lanePairs: lanePairs,
      slots: slots,
      milestones: milestones,
      matches: matches,
      handicapSwings: swings,
      vsBook: real.filter(function (p) { return p.vsBook != null; })
                  .sort(function (a, b) { return b.vsBook - a.vsBook; }),
      bowlers: real.length,
      teams: teams.length,
      weeks: weeks.length,
      games: games,
      pins: pins,
      average: games ? pins / games : null,
      averages: real.map(function (p) { return p.average; }),
      topAverage: real.slice().sort(function (a, b) { return b.average - a.average; })[0] || null,
      highGame: highGame,
      highSeries: highSeries,
      highTeamGame: teamGame,
      highTeamSeries: teamSeries,
      highTeamHdcpGame: teamHdcpGame,
      highTeamHdcpSeries: teamHdcpSeries,
    };
  }

  /* Awards points for one match: a point per game won plus one for total
     pinfall, unless the week's data spells the points out explicitly. */
  function scoreMatch(homeBucket, awayBucket, match, scoring) {
    if (isScore(match.homePoints) && isScore(match.awayPoints)) {
      return { home: match.homePoints, away: match.awayPoints };
    }

    var homeHdcp = scoring.useHandicap ? homeBucket.handicap : 0;
    var awayHdcp = scoring.useHandicap ? awayBucket.handicap : 0;
    var gameCount = Math.max(homeBucket.gameTotals.length, awayBucket.gameTotals.length);
    if (!gameCount) return { home: null, away: null };

    var home = 0;
    var away = 0;
    for (var g = 0; g < gameCount; g++) {
      var h = (homeBucket.gameTotals[g] || 0) + homeHdcp;
      var a = (awayBucket.gameTotals[g] || 0) + awayHdcp;
      if (h > a) home += scoring.pointsPerGame;
      else if (a > h) away += scoring.pointsPerGame;
      else { home += scoring.pointsPerGame / 2; away += scoring.pointsPerGame / 2; }
    }

    var homeSeries = sum(homeBucket.gameTotals) + homeHdcp * gameCount;
    var awaySeries = sum(awayBucket.gameTotals) + awayHdcp * gameCount;
    if (homeSeries > awaySeries) home += scoring.pointsForSeries;
    else if (awaySeries > homeSeries) away += scoring.pointsForSeries;
    else { home += scoring.pointsForSeries / 2; away += scoring.pointsForSeries / 2; }

    return { home: home, away: away };
  }

  /* Scratch and handicap series for one team's night. */
  function totalsOf(bucket, scoring) {
    var series = sum(bucket.gameTotals);
    var handicap = scoring.useHandicap ? bucket.handicap : 0;
    return {
      series: series,
      hdcpSeries: series + handicap * bucket.gameTotals.length,
    };
  }

  function attach(team, opponent, bucket, points, oppPoints, week, oppTotals, lanes) {
    var series = sum(bucket.gameTotals);
    var result = null;
    if (points != null && oppPoints != null) {
      result = points > oppPoints ? 'W' : points < oppPoints ? 'L' : 'T';
      if (result === 'W') team.wins++;
      else if (result === 'L') team.losses++;
      else team.ties++;
      team.points += points;
    }

    var gamesBowled = bucket.gameTotals.length;
    team.weeks.push({
      number: week.number,
      date: week.date,
      /* Points are decided on handicap totals, so carry them alongside
         scratch — that is also what the printed league sheet reports. */
      hdcpSeries: series + bucket.handicap * gamesBowled,
      hdcpGameTotals: bucket.gameTotals.map(function (total) {
        return total + bucket.handicap;
      }),
      opponentId: opponent ? opponent.id : null,
      opponentName: opponent ? opponent.name : null,
      gameTotals: bucket.gameTotals.slice(),
      series: series,
      handicap: bucket.handicap,
      points: points,
      opponentPoints: oppPoints,
      result: result,
      lanes: lanes,
      opponentSeries: oppTotals ? oppTotals.series : null,
      opponentHdcpSeries: oppTotals ? oppTotals.hdcpSeries : null,
      margin: oppTotals ? series + bucket.handicap * gamesBowled - oppTotals.hdcpSeries : null,
      /* Won the points despite being out-pinned on scratch — the handicap
         did the work. */
      wonOnHandicap: !!(oppTotals && result === 'W' && series < oppTotals.series),
      lostOnHandicap: !!(oppTotals && result === 'L' && series > oppTotals.series),
      lines: bucket.lines.slice().sort(function (a, b) { return b.series - a.series; }),
    });

    team.games += bucket.gameTotals.length;
    team.pins += series;
    if (gamesBowled) {
      var hdcpGames = bucket.gameTotals.map(function (total) {
        return total + bucket.handicap;
      });
      team.highGame = Math.max(team.highGame || 0, Math.max.apply(null, bucket.gameTotals));
      team.highSeries = Math.max(team.highSeries || 0, series);
      team.highHdcpGame = Math.max(team.highHdcpGame || 0, Math.max.apply(null, hdcpGames));
      team.highHdcpSeries = Math.max(team.highHdcpSeries || 0, series + bucket.handicap * gamesBowled);
      team.hdcpPins += series + bucket.handicap * gamesBowled;
    }
  }

  /* The season is bowled in two 16-week halves, each with its own position
     round, and the top teams from each half go to the roll-off (rules 1 and
     2). That makes "the standings" two tables once week 17 arrives, so the
     points are tallied per half as well as for the season. */
  function buildHalves(teams, league, weeks) {
    var length = league.halfLength;
    if (!length || !league.weeksInSeason) return [];

    var count = Math.ceil(league.weeksInSeason / length);
    var rounds = league.positionRounds || [];
    var qualify = (league.rollOff || {}).teamsPerHalf || 0;
    var last = weeks.length ? weeks[weeks.length - 1].number : 0;

    var halves = [];
    for (var i = 0; i < count; i++) {
      var from = i * length + 1;
      var to = Math.min((i + 1) * length, league.weeksInSeason);

      var standings = teams.map(function (team) {
        var mine = team.weeks.filter(function (w) {
          return w.number >= from && w.number <= to && w.points != null;
        });
        return {
          team: team,
          weeks: mine.length,
          points: mine.reduce(function (t, w) { return t + w.points; }, 0),
          wins: mine.filter(function (w) { return w.result === 'W'; }).length,
          losses: mine.filter(function (w) { return w.result === 'L'; }).length,
          ties: mine.filter(function (w) { return w.result === 'T'; }).length,
          pins: mine.reduce(function (t, w) { return t + w.series; }, 0),
        };
      });

      /* Points first, then handicap pinfall, the way the sheet breaks ties. */
      standings.sort(function (a, b) {
        return b.points - a.points || b.pins - a.pins ||
               a.team.name.localeCompare(b.team.name);
      });
      standings.forEach(function (row, at) {
        row.rank = at + 1;
        row.qualifies = qualify > 0 && at < qualify;
      });

      halves.push({
        number: i + 1,
        name: count === 2 ? (i === 0 ? 'First half' : 'Second half') : 'Weeks ' + from + '-' + to,
        from: from,
        to: to,
        positionRound: rounds[i] || to,
        weeksBowled: standings.length ? standings[0].weeks : 0,
        started: last >= from,
        complete: last >= to,
        qualifiers: qualify,
        standings: standings,
      });
    }
    return halves;
  }

  function index(list) {
    var map = {};
    list.forEach(function (item) { map[item.id] = item; });
    return map;
  }

  window.LeagueStats = { build: build, handicapFor: handicapFor };
})();
