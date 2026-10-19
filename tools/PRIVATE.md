# The private shot tracker

An unlisted page at `#/shots`, for one person's shot-by-shot records. Nothing on
the public site links to it.

## What is and is not private

The repo and site are public, so the page's code is public too. A password on a
page cannot hide anything from someone who can read the code. What protects the
data is that it is **encrypted in the browser before it is stored anywhere**:

- The library (balls, games, every shot) is encrypted with AES-256-GCM, using a
  key derived from a passphrase with PBKDF2-SHA256 (600,000 rounds).
- Only the ciphertext is stored: on this device, and as `bowling.enc.json` on the
  `bowling-data` branch. Reading it needs no token; opening it needs the
  passphrase. Without the passphrase it is noise.
- Someone who finds `#/shots` sees an unlock screen and nothing else. A wrong
  passphrase opens nothing, and without the token they cannot write.

What is still visible on the public branch: that the file exists, its size, and
the commit times, so roughly when games were saved and how many. The strength of
the passphrase is the whole defence, because the ciphertext can be guessed
against offline. Use four or more unrelated words.

## How it saves

- Each shot is saved on the device (encrypted) the moment it is entered, so a
  game can be bowled with no signal.
- Finishing a game, or pressing Sync, pulls the vault from GitHub, merges, and
  pushes. Two devices merge by game id; the later edit wins; deletions are
  records (`deleted: true`).
- The first save creates the `bowling-data` branch as an orphan commit holding
  only the one file, so it carries none of the site and never redeploys it.
- Writing needs a fine-grained GitHub token with **Contents: read and write on
  this repository only**, short expiry. It is stored on the device, encrypted
  with the passphrase key. Optionally protect `main` with a branch rule so that
  even a stolen token could not change the site.

## Files

| File | What it is |
|---|---|
| `js/shots.js` | Scoring, leaves and splits, every statistic. Pure; tested by `tools/test-shots.js`. |
| `js/ballstats.js` | The ball report's statistics: confidence intervals, ANOVA, Kruskal–Wallis, Levene, Welch with Holm, bootstrap odds, shrinkage. Pure; tested by `tools/test-ballstats.js`. |
| `js/trends.js` | Rolling averages, score distribution, balls and ball-by-pattern figures, forgiveness measures. Pure; tested by `tools/test-trends.js`. |
| `js/shots-insights.js` | The Progress and Balls tabs of Stats: draws the figures from `trends.js`. |
| `js/importer.js` | The games-file format (see the header comment), its checks, ball matching and repeat-import safety. Pure; tested by `tools/test-importer.js` against `tools/import-sample.json`. |
| `js/shots-import.js` | The Import games page. |
| `js/cards.js` | Draws the series scorecard and the ball report as SVG, and turns a picture into PNG, PDF or a share-sheet file. |
| `js/shots-share.js` | The preview / Share / Save / PDF panel. |
| `js/vault.js` | Encryption, device storage, GitHub sync, merging. Tested by `tools/test-vault.js` against `tools/fake-github.js`. |
| `js/shots-ui.js` | The pages: unlock, new game, pin-deck entry, scorecard, stats, balls, settings. |

Ball photos are shrunk in the browser (about 256px) and stored inside the
encrypted library with the ball, so what is in the bag is as private as the
scores.

A shot records the pins **still standing** after it, plus `hit` (pocket / high /
light / brooklyn / other) on a first ball, or `miss` (left / right) on a missed
spare. Pins knocked, strikes, spares, splits and the scorecard are all derived.
