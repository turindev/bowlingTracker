# `data/league.js` reference

The file sets one global:

```js
window.LEAGUE_DATA = { league, scoring, teams, players, weeks };
```

Everything inside is plain JSON. Nothing else in the project needs editing to
add a week of scores.

## `league`

| Field | Example | Notes |
|---|---|---|
| `name` | `"Championship League 2026-27"` | Shown in the header and page titles. |
| `season` | `"2026-27"` | |
| `venue` | `"Leisure Time Bowling"` | Optional. |
| `night` | `"Tuesdays, 6:30 PM"` | Optional. |
| `weeksInSeason` | `32` | Optional — drives "through week 4 of 32". |
| `sampleData` | `true` | Optional. Shows a "placeholder data" banner. Delete for real seasons. |

## `scoring`

| Field | Default | Notes |
|---|---|---|
| `gamesPerWeek` | `3` | |
| `useHandicap` | `false` | |
| `handicapBasis` | `220` | |
| `handicapPercent` | `90` | Handicap = `floor((basis − average) × percent/100)`, never below 0. |
| `pointsPerGame` | `1` | Points for winning a single game. |
| `pointsForSeries` | `1` | Points for winning total pinfall. |

## `teams`

```json
{ "id": "t7", "name": "Team 7" }
```

`id` is any stable string. It shows up in URLs (`#/team/t7`), so keep it short
and never reuse one for a different team.

## `players`

```json
{ "id": "p25", "name": "Steve Smith", "teamId": "t8", "entryAverage": 191 }
```

| Field | Notes |
|---|---|
| `entryAverage` | The book average handicap is calculated from. Without it, the season-to-date average is used instead. |
| `placeholder` | `true` for vacant spots and absentee scores. They count toward team totals but are kept off the bowler leaderboard and get no player page. |
| `substitute` | `true` for a fill-in bowler. Their games are real, so they keep a place on the bowler leaderboard, tagged "sub". |
| `role` | `"vacant"` or `"absentee"` — why a `placeholder` line exists. It picks the marker shown beside the name and the sentence in the legend under the table. A `substitute` is tagged from its own flag and needs no `role`. |

## `weeks`

```json
{
  "number": 1,
  "date": "2026-09-08",
  "scores": [
    { "playerId": "p25", "games": [204, 178, 193] }
  ],
  "matches": [
    { "homeTeamId": "t7", "awayTeamId": "t8", "lanes": "7-8" }
  ]
}
```

- A bowler who missed a week simply has no entry in `scores`. Averages only
  count games actually bowled.
- `lanes` is the pair the match was bowled on, taken from the **Lanes** column
  of the sheet's "Review of Last Week's Bowling". It is optional and affects no
  calculation — it is recorded so that scoring by lane pair can be charted once
  enough weeks have accumulated for the teams to have rotated around the house.
  The validator rejects a malformed pair and a pair used twice in one week.
- `matches` drives the points. By default each match is scored from the
  handicap totals: `pointsPerGame` for each game won, `pointsForSeries` for
  total pinfall, and a split on a tie.
- To override the calculation — a forfeit, a pre-bowl, a league adjustment —
  put the points in directly:

  ```json
  { "homeTeamId": "t7", "awayTeamId": "t8", "homePoints": 4, "awayPoints": 0 }
  ```

  Set both or neither.

## Adding a week

1. Append a new object to `weeks` with the next `number`, the date, every
   bowler's three games, and that week's matches — including the `lanes` each
   was bowled on, which the sheet lists beside the matchup.
2. Add any new bowlers to `players` first.
3. Run `node tools/validate.js`.
4. Open `index.html` and spot-check one team against the printed sheet.

### Checking a transcription

The quickest way to prove a week was typed in correctly: pick any team and
confirm the **Hdcp Ser** figure on its page matches the handicap total on the
league sheet. If every team matches, the individual scores underneath are
almost certainly right too, and the computed points will agree with the
standings.
