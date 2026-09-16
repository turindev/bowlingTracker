# Bowling League Tracker

A small, dependency-free website for following a bowling league: a league
dashboard, sortable bowler and team leaderboards, and a dashboard for every
team and every bowler with cards, charts and scores week by week.

Currently tracking **Championship League 2026-27** at Leisure Time Bowling —
24 teams, 92 bowlers, 32 weeks.

## Viewing it

Open `index.html`. That is the whole story — no build step, no server, no
`npm install`. It works just as well double-clicked off disk as it does hosted.

To serve it locally anyway:

```sh
npx http-server . -p 8080    # then open http://localhost:8080
```

## What's on it

| Page | URL | Contents |
|---|---|---|
| Overview | `#/` | League totals, scoring pace, standings, average distribution, over/under book average, scoring by game, honour roll, closest matches, milestone counts (200+, 220+ …), season bests |
| Bowlers | `#/bowlers` | Every bowler's average, high game, high series and pinfall |
| Teams | `#/teams` | Standings by points, record, team average and high games |
| Team | `#/team/t8` | Name banner, summary cards, series and league-position charts, roster averages, weekly results with margin and handicap-swing markers, every bowler's line for any week |
| Bowler | `#/player/p25` | Monogram, summary cards including over/under book, every game charted against the bowler's average, average and league rank by week, scores by week, game 1/2/3 splits, milestones |

Team banners and bowler monograms are generated from the name — deterministic
colours, drawn as SVG, no image files and no calls to an outside avatar
service. A team's banner colour follows it into the tables as a small chip
beside its name, so teammates are easy to pick out of a leaderboard; the chip
is always next to the name and never carries meaning by itself.

Every table sorts by any column — tap or click a heading, tap again to reverse.
The leaderboards also have a search box. The layout is built mobile-first and
follows the phone's light/dark setting, with a toggle in the header.

## Adding a week of scores

All league data lives in one file: **`data/league.js`**. Append the new week to
the `weeks` array, then:

```sh
node tools/validate.js
```

The validator catches duplicate weeks, unknown bowler ids, scores outside
0–300, a team entered in two matches, and similar transcription slips. See
[`tools/SCHEMA.md`](tools/SCHEMA.md) for the field reference and for the
fastest way to check a week was typed in correctly.

## Handicap and points

Every table carries both figures: scratch columns are unlabelled, handicap
columns are prefixed `Hdcp`, and each card says so in its heading. The handicap
columns are omitted entirely when `scoring.useHandicap` is false, so a scratch
league never sees a column of duplicates.

Handicap is 90% of 220, calculated from each bowler's book average
(`entryAverage`), floored, never negative — matching the league sheet. The book
average also drives the over/under figures: a bowler's season average measured
against the average their handicap is set from.

A result is flagged as a handicap swing when the team that took the points was
out-pinned on scratch.

Points are computed from the scores rather than copied in: one point per
handicap game won, plus one for handicap total pinfall, four per match. Week 1
reproduces the printed standings for all 24 teams exactly, along with every
figure in the sheet's "Top Scores" section.

Vacant roster spots and absentee scores are marked `placeholder` in the data.
They count toward team totals — otherwise the points wouldn't come out right —
but are kept off the bowler leaderboard.

## Layout

```
index.html          page shell
css/styles.css      all styling
js/stats.js         averages, handicaps, team totals, match points, weekly trends
js/ui.js            DOM helpers and the sortable table
js/charts.js        the bar and line charts (inline SVG)
js/avatars.js       generated monograms and team banners
js/app.js           routing and the five views
data/league.js      the league — the only file you edit week to week
tools/validate.js   data checks
tools/SCHEMA.md     data format reference
```

## Publishing

`.github/workflows/pages.yml` validates the league data and then publishes the
site to GitHub Pages on every push to `main`.

It needs Pages switched on once, by hand, under **Settings → Pages → Source →
GitHub Actions**. The workflow cannot do this for itself — the Actions token is
not permitted to create a Pages site — so until it is enabled the deploy job
fails with `Resource not accessible by integration`. Note that Pages on a
private repository requires a paid GitHub plan; on the free plan the repository
has to be public.

### Previewing without publishing

Open `index.html` directly, or serve the folder and load it on a phone on the
same network:

```sh
npx http-server . -p 8080    # then browse to http://<your-ip>:8080
```
