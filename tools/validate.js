#!/usr/bin/env node
/*
 * Sanity-checks data/league.js. Run it after adding a week:
 *
 *   node tools/validate.js
 *
 * Errors exit non-zero; warnings are things worth a second look (a bowler with
 * the wrong number of games, a suspiciously high score) but not breakage.
 */
'use strict';

var path = require('path');
var file = path.join(__dirname, '..', 'data', 'league.js');

global.window = {};
require(file);
var data = global.window.LEAGUE_DATA;

var errors = [];
var warnings = [];

function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

if (!data || typeof data !== 'object') {
  console.error('data/league.js did not set window.LEAGUE_DATA to an object.');
  process.exit(1);
}

var scoring = data.scoring || {};
var expectedGames = scoring.gamesPerWeek || 3;

/* ---- teams and players ---- */

var teamIds = {};
(data.teams || []).forEach(function (team, i) {
  var where = 'teams[' + i + ']';
  if (!team.id) err(where + ' has no id.');
  else if (teamIds[team.id]) err('Duplicate team id "' + team.id + '".');
  else teamIds[team.id] = team;
  if (!team.name) err(where + ' ("' + team.id + '") has no name.');
});

var playerIds = {};
(data.players || []).forEach(function (player, i) {
  var where = 'players[' + i + ']';
  if (!player.id) err(where + ' has no id.');
  else if (playerIds[player.id]) err('Duplicate player id "' + player.id + '".');
  else playerIds[player.id] = player;
  if (!player.name) err(where + ' ("' + player.id + '") has no name.');
  if (!player.teamId) err('Player "' + (player.name || player.id) + '" has no teamId.');
  else if (!teamIds[player.teamId]) {
    err('Player "' + (player.name || player.id) + '" is on unknown team "' + player.teamId + '".');
  }
});

if (!Object.keys(teamIds).length) err('No teams defined.');
if (!Object.keys(playerIds).length) err('No players defined.');

/* ---- weeks ---- */

var weekNumbers = {};
(data.weeks || []).forEach(function (week, i) {
  var label = 'Week ' + (week.number != null ? week.number : '[index ' + i + ']');

  if (typeof week.number !== 'number') err(label + ': "number" must be a number.');
  else if (weekNumbers[week.number]) err('Week ' + week.number + ' appears twice.');
  else weekNumbers[week.number] = true;

  if (week.date && !/^\d{4}-\d{2}-\d{2}$/.test(week.date)) {
    err(label + ': date "' + week.date + '" should be YYYY-MM-DD.');
  }

  var seen = {};
  (week.scores || []).forEach(function (line) {
    var who = line.playerId;
    if (!playerIds[who]) {
      err(label + ': score for unknown player "' + who + '".');
      return;
    }
    var name = playerIds[who].name;
    if (seen[who]) err(label + ': two score lines for ' + name + '.');
    seen[who] = true;

    if (!Array.isArray(line.games)) {
      err(label + ': ' + name + ' has no games array.');
      return;
    }
    line.games.forEach(function (score, g) {
      if (typeof score !== 'number' || !isFinite(score)) {
        err(label + ': ' + name + ' game ' + (g + 1) + ' is not a number (' + JSON.stringify(score) + ').');
      } else if (score < 0 || score > 300) {
        err(label + ': ' + name + ' game ' + (g + 1) + ' is ' + score + ' — outside 0–300.');
      } else if (score > 290) {
        warn(label + ': ' + name + ' game ' + (g + 1) + ' is ' + score + '. Nice, but double-check it.');
      }
    });
    if (line.games.length !== expectedGames) {
      warn(label + ': ' + name + ' has ' + line.games.length + ' games, expected ' + expectedGames + '.');
    }
  });

  var bowling = {};
  (week.matches || []).forEach(function (match, m) {
    var where = label + ' match ' + (m + 1);
    [match.homeTeamId, match.awayTeamId].forEach(function (id) {
      if (!id) err(where + ': missing a team id.');
      else if (!teamIds[id]) err(where + ': unknown team "' + id + '".');
      else if (bowling[id]) err(where + ': ' + teamIds[id].name + ' is already in another match this week.');
      else bowling[id] = true;
    });
    if (match.homeTeamId && match.homeTeamId === match.awayTeamId) {
      err(where + ': a team cannot bowl itself.');
    }
    var hasHome = typeof match.homePoints === 'number';
    var hasAway = typeof match.awayPoints === 'number';
    if (hasHome !== hasAway) {
      err(where + ': set both homePoints and awayPoints, or neither.');
    }
  });

  /* A roster that bowled but has no match is legal (a bye), just worth flagging. */
  Object.keys(teamIds).forEach(function (id) {
    var bowled = (week.scores || []).some(function (line) {
      return playerIds[line.playerId] && playerIds[line.playerId].teamId === id;
    });
    if (bowled && (week.matches || []).length && !bowling[id]) {
      warn(label + ': ' + teamIds[id].name + ' has scores but no match recorded.');
    }
  });
});

/* ---- report ---- */

warnings.forEach(function (w) { console.log('  warning  ' + w); });
errors.forEach(function (e) { console.log('  ERROR    ' + e); });

var weeks = (data.weeks || []).length;
console.log(
  '\n' + Object.keys(teamIds).length + ' teams, ' +
  Object.keys(playerIds).length + ' bowlers, ' + weeks + ' week' + (weeks === 1 ? '' : 's') + ' — ' +
  (errors.length ? errors.length + ' error(s), ' : '') +
  warnings.length + ' warning(s).'
);

process.exit(errors.length ? 1 : 0);
