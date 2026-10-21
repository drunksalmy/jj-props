# JJ Props tests

Three automated checks. They use a **mock ESPN feed** (`mock-espn.js`): the same JSON shapes as the
real ESPN endpoints, filled with made-up players, so the tests run offline and give the same result
every time.

| Test | What it checks | Run |
|---|---|---|
| `unit.test.js` | Math (probabilities, odds, dates), every ESPN parser (incl. DraftKings player-prop lines), the team/player models, live calculations, the plain-English text (no `NaN`/`undefined`), and the charts. | `node tests/unit.test.js` |
| `calibration.test.js` | Back-tests the prop model on simulated seasons where the truth is known: when we say 62%, does it hit about 62% of the time? Runs twice — against estimated lines, and against a simulated sportsbook line with real odds — and fails if any bucket is off by more than 6 points or picks promise much more than they win. | `node tests/calibration.test.js` |
| `ui.test.js` | Opens `index.html` in a real (headless) browser, straight from the folder, and clicks through every screen: picks, games, DraftKings lines (pre-game only for started games), the live lead tracker, props, typing a line, filters, the player sheet, settings, other dates, phone size, dark mode. Saves screenshots to `tests/shots/`. | `npm i playwright` then `node tests/ui.test.js` |

The unit and calibration tests need only Node.js. The UI test also needs Playwright.
