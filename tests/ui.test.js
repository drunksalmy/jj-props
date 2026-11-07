/* Browser test: node tests/ui.test.js  (opens index.html from disk, ESPN answered by the mock) */
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const mock = require('./mock-espn');
const OUT = process.env.SHOTS || path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const PNG1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  let apiCalls = 0;
  async function newPage(opts) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Manila', locale: 'en-PH' }, opts || {}));
    await ctx.route(/espn(cdn)?\.com/, async (route) => {
      const url = route.request().url();
      if (/espncdn\.com/.test(url)) {
        if (/headshots/.test(url) && /[13579]\.png/.test(url)) return route.fulfill({ status: 404, body: '' }); // test fallback initials
        return route.fulfill({ status: 200, contentType: 'image/png', body: PNG1 });
      }
      apiCalls++;
      const data = mock.respond(url);
      if (!data) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      await new Promise((r) => setTimeout(r, 5 + Math.random() * 20));
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(data) });
    });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date('2026-10-21T06:00:00Z'));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    return page;
  }
  const url = 'file://' + path.join(__dirname, '..', 'index.html');
  const ready = (page) => page.waitForFunction(() => window.HE && HE.state && HE.state.date && !HE.state.loading.active && HE.state.rows.length > 0, null, { timeout: 60000 });

  // ---------- desktop, light ----------
  let page = await newPage({ colorScheme: 'light' });
  await page.goto(url + '#picks');
  await ready(page);
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => ({
    date: HE.state.date, games: HE.state.games.length, rows: HE.state.rows.length,
    picks: HE.ui.topProps(HE.state.rows, 9).length, gamePicks: HE.ui.topGamePicks(HE.state.games, 6).length,
    preds: HE.state.games.filter((G) => G.pred).length, live: HE.state.games.filter((G) => G.live).length,
    strengths: HE.state.rows.reduce((a, r) => { a[r.an.strength || 'none'] = (a[r.an.strength || 'none'] || 0) + 1; return a; }, {}),
    b2b: Object.keys(HE.state.b2b).length,
    sample: HE.state.rows.filter((r) => r.stat === 'pts').slice(0, 3).map((r) => r.prof.name + ' ' + r.line + ' proj ' + r.an.mean.toFixed(1) + ' ' + r.an.side + ' ' + (r.an.strength || '-') + ' ' + (r.an.side === 'over' ? r.an.cOver : r.an.cUnder).toFixed(2))
  }));
  console.log('state', JSON.stringify(st, null, 1));
  // ---- Auto Parlay ----
  const slip = async () => page.evaluate(() => ({
    legs: document.querySelectorAll('.parlay .leg').length,
    title: (document.querySelector('.parlay h2') || {}).textContent,
    chance: (document.querySelector('.parlay .psum b') || {}).textContent,
    ids: Array.from(document.querySelectorAll('.parlay .leg-x')).map((b) => b.getAttribute('data-parlay-drop'))
  }));
  let sl = await slip();
  console.log('parlay', JSON.stringify(sl));
  if (!(sl.legs >= 5)) errors.push('auto parlay should fill 5 legs: ' + JSON.stringify(sl));
  if (!/%/.test(sl.chance || '')) errors.push('parlay chance missing');
  await page.click('.parlay [data-parlay-legs="7"]');
  await page.waitForTimeout(150);
  sl = await slip();
  if (!/7-leg/.test(sl.title)) errors.push('legs selector did not apply: ' + sl.title);
  const before = sl.ids[0];
  await page.click('.parlay .leg-x');
  await page.waitForTimeout(150);
  sl = await slip();
  if (sl.ids.includes(before)) errors.push('swap did not replace the leg');
  await page.click('.parlay [data-parlay-mode="safe"]');
  await page.waitForTimeout(150);
  await page.click('.parlay [data-parlay-copy]');
  await page.waitForTimeout(300);
  const toastTxt = await page.$eval('#toast', (el) => el.textContent);
  if (!/copied|couldn/i.test(toastTxt)) errors.push('copy slip gave no feedback: ' + toastTxt);
  await page.click('.parlay [data-parlay-legs="5"]');
  await page.click('.parlay [data-parlay-mode="best"]');
  await page.waitForTimeout(150);
  // sportsbook lines: DraftKings lines where posted, pre-game lines only for started games, estimates elsewhere
  const src = await page.evaluate(() => {
    const by = {};
    HE.state.rows.forEach((r) => { const k = r.gameId; by[k] = by[k] || { book: 0, est: 0, user: 0 }; by[k][r.lineSource]++; });
    const b = HE.state.rows.find((r) => r.lineSource === 'book');
    return { by, sample: b && { line: b.line, over: b.bookLine.over, under: b.bookLine.under, beO: b.an.beO, mkt: b.an.mktOver, priced: b.an.priced, book: b.book } };
  });
  console.log('line sources', JSON.stringify(src));
  if (!(src.by['401909842'] && src.by['401909842'].book >= 20)) errors.push('pre-game DraftKings lines missing');
  if (src.by['401909843'] && src.by['401909843'].book) errors.push('game without lines shows book lines');
  const liveG = src.by['401909835'];
  if (!(liveG && liveG.book > 0 && liveG.est > 0)) errors.push('started game should keep only pre-game lines: ' + JSON.stringify(liveG));
  if (!(src.sample && src.sample.priced && src.sample.book === 'DraftKings' && Math.abs(src.sample.beO - (src.sample.over < 0 ? -src.sample.over / (100 - src.sample.over) : 100 / (src.sample.over + 100))) < 1e-9)) errors.push('book line pricing wrong ' + JSON.stringify(src.sample));
  await page.screenshot({ path: path.join(OUT, '1-picks.png'), fullPage: true });

  await page.click('.tabs [data-tab="games"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '2-games.png'), fullPage: true });

  // live game sheet
  await page.click('[data-open-game="401909835"].btn');
  await page.waitForSelector('.sheet');
  await page.waitForTimeout(300);
  const flowBox = await page.$('.sheet svg.flow');
  if (flowBox) { const b = await flowBox.boundingBox(); await page.mouse.move(b.x + b.width * 0.6, b.y + b.height / 2); await page.waitForTimeout(150); }
  await page.screenshot({ path: path.join(OUT, '3-game-sheet-live.png') });
  await page.evaluate(() => { const b = document.querySelector('.sheet-body'); b.scrollTop = b.scrollHeight; });
  await page.screenshot({ path: path.join(OUT, '3b-game-sheet-bottom.png') });
  await page.keyboard.press('Escape');

  // props tab + editing a line
  await page.click('.tabs [data-tab="props"]');
  await page.waitForSelector('table.props');
  const dkTags = await page.$$eval('table.props .lsrc.book', (els) => els.length);
  if (!dkTags) errors.push('no DK line tags in the props table');
  const firstKey = await page.getAttribute('table.props tbody tr .line-in', 'data-line');
  await page.fill('table.props tbody tr .line-in', '30.5');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  const edited = await page.evaluate((k) => { const r = HE.state.rows.find((x) => x.key === k); return r && { line: r.line, src: r.lineSource }; }, firstKey);
  console.log('edited line', JSON.stringify(edited));
  if (!edited || edited.line !== 30.5 || edited.src !== 'user') errors.push('line edit did not apply: ' + JSON.stringify(edited));
  await page.click('table.props tbody tr .lstep[data-step="0.5"]');
  await page.waitForTimeout(200);
  const stepped = await page.evaluate((k) => HE.state.rows.find((x) => x.key === k).line, firstKey);
  if (stepped !== 31) errors.push('step failed: ' + stepped);
  await page.click('.filters [data-val="reb"]');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '4-props-reb.png'), fullPage: false });
  await page.fill('input[data-filter="q"]', 'zzzz');
  await page.waitForTimeout(400);
  const none = await page.$eval('main', (m) => m.textContent.includes('No props match'));
  if (!none) errors.push('search filter did not filter');
  await page.fill('input[data-filter="q"]', '');
  await page.waitForTimeout(300);
  await page.click('.filters [data-val="pts"]');
  await page.waitForTimeout(200);

  // player sheet
  await page.click('table.props tbody tr td.pl');
  await page.waitForSelector('.sheet .verdict-box');
  await page.waitForTimeout(250);
  const bar = await page.$('.sheet .bar-g');
  if (bar) { await bar.hover(); await page.waitForTimeout(100); }
  await page.screenshot({ path: path.join(OUT, '5-player-sheet.png') });
  await page.evaluate(() => { const b = document.querySelector('.sheet-body'); b.scrollTop = 700; });
  await page.screenshot({ path: path.join(OUT, '5b-player-sheet-mid.png') });
  // switch to another stat this player has a prop for (low-rebound guards have no rebounds prop)
  const otherStat = await page.getAttribute('.sheet [data-sheet-stat]:not(.on)', 'data-sheet-stat');
  await page.click('.sheet [data-sheet-stat="' + otherStat + '"]');
  await page.waitForTimeout(200);
  const nowStat = await page.getAttribute('.sheet [data-sheet-stat].on', 'data-sheet-stat');
  if (nowStat !== otherStat) errors.push('player sheet stat switch failed: ' + otherStat + ' -> ' + nowStat);
  await page.click('.sheet [data-chart-n="20"]');
  await page.waitForTimeout(200);
  await page.evaluate(() => { const b = document.querySelector('.sheet-body'); b.scrollTop = 0; });
  await page.screenshot({ path: path.join(OUT, '5c-player-sheet-reb.png') });
  await page.keyboard.press('Escape');

  // combo props: PR (points + rebounds) and PA (points + assists) with real DraftKings lines
  for (const s of ['pr', 'pa', 'ar']) {
    await page.click('.filters [data-val="' + s + '"]');
    await page.waitForTimeout(250);
    const info = await page.evaluate((stat) => {
      const rows = HE.state.rows.filter((r) => r.stat === stat);
      const bad = rows.filter((r) => {
        const parts = HE.model.COMBOS[stat];
        return Math.abs(r.proj.stats[stat].mean - parts.reduce((t, k) => t + r.proj.stats[k].mean, 0)) > 1e-9;
      });
      return { n: rows.length, book: rows.filter((r) => r.lineSource === 'book').length, bad: bad.length, shown: document.querySelectorAll('table.props tbody tr').length,
        btn: (document.querySelector('.filters [data-val="' + stat + '"]') || {}).textContent };
    }, s);
    console.log(s, JSON.stringify(info));
    if (!(info.n > 20 && info.book >= 10 && info.bad === 0 && info.shown > 0)) errors.push(s + ' props missing or wrong: ' + JSON.stringify(info));
    if (info.btn !== s.toUpperCase()) errors.push(s + ' button label: ' + info.btn);
    if (s === 'pr') await page.screenshot({ path: path.join(OUT, '4b-props-pr.png'), fullPage: false });
    await page.click('table.props tbody tr td.pl');
    await page.waitForSelector('.sheet .verdict-box');
    await page.waitForTimeout(250);
    const sh = await page.evaluate(() => ({
      on: (document.querySelector('.sheet [data-sheet-stat].on') || {}).textContent,
      combo: (document.querySelector('.sheet .pb-combo') || {}).textContent,
      tot: Array.from(document.querySelectorAll('.sheet th.tot')).map((t) => t.textContent),
      win: (document.querySelector('.sheet .verdict-box .win') || {}).textContent,
      adds: Array.from(document.querySelectorAll('.sheet .reasons li')).some((li) => /^How it adds up/.test(li.textContent)),
      logTot: document.querySelectorAll('.sheet table.log td.tot').length
    }));
    console.log('sheet ' + s, JSON.stringify(sh));
    const words = { pr: 'points \\+ rebounds', pa: 'points \\+ assists', ar: 'assists \\+ rebounds' }[s];
    if (sh.on !== s.toUpperCase() || !new RegExp(words, 'i').test(sh.combo || '') || sh.tot.join() !== s.toUpperCase() + ',' + s.toUpperCase() ||
      !new RegExp(words + ' add up to').test(sh.win || '') || !sh.adds || !(sh.logTot > 0)) errors.push('combo player sheet ' + s + ': ' + JSON.stringify(sh));
    if (s === 'pr') {
      await page.screenshot({ path: path.join(OUT, '5d-player-sheet-pr.png') });
      await page.evaluate(() => { const b = document.querySelector('.sheet-body'); b.scrollTop = b.scrollHeight; });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(OUT, '5e-player-sheet-pr-log.png') });
    }
    await page.keyboard.press('Escape');
  }
  await page.click('.filters [data-val="pts"]');
  await page.waitForTimeout(200);

  await page.click('.tabs [data-tab="guide"]');
  await page.waitForTimeout(200);
  await page.click('details.faq summary');
  await page.click('details.faq summary:has-text("What are PR, PA, AR and PRA?")');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(OUT, '6-guide.png'), fullPage: true });

  // settings sheet
  await page.click('[data-act="settings"]');
  await page.waitForSelector('.sheet');
  await page.screenshot({ path: path.join(OUT, '7-settings.png') });
  await page.keyboard.press('Escape');

  // refresh tick (live loop) keeps working
  await page.evaluate(() => HE.app.tick());
  await page.waitForTimeout(600);
  // date switch to yesterday (all finals) and back
  await page.click('.tabs [data-tab="picks"]');
  await page.click('.date[data-date="20261020"]');
  await ready(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '8-yesterday-results.png'), fullPage: true });
  // a date with no games
  await page.evaluate(() => HE.app.loadDate('20261225'));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '9-no-games.png') });
  await page.context().close();

  // ---------- phone, dark ----------
  page = await newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.goto(url);
  await ready(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'm1-picks-dark.png'), fullPage: false });
  await page.screenshot({ path: path.join(OUT, 'm1b-picks-dark-full.png'), fullPage: true });
  await page.tap('.pick-card');
  await page.waitForSelector('.sheet');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'm2-player-dark.png') });
  // all the stat buttons (up to 8: PTS REB AST PR PA AR PRA 3PM) fit on one row on a phone
  const segRow = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.sheet .seg.wide button'));
    return { n: b.length, rows: new Set(b.map((x) => Math.round(x.getBoundingClientRect().top))).size, labels: b.map((x) => x.textContent).join(' ') };
  });
  console.log('phone stat buttons', JSON.stringify(segRow));
  if (segRow.rows !== 1) errors.push('stat buttons wrap on phone: ' + JSON.stringify(segRow));
  if (await page.$('.sheet [data-sheet-stat="pa"]')) {
    await page.tap('.sheet [data-sheet-stat="pa"]');
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(OUT, 'm2b-player-pa-dark.png') });
    await page.evaluate(() => { const b = document.querySelector('.sheet-body'); b.scrollTop = 640; });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, 'm2c-player-pa-dark-mid.png') });
  } else errors.push('top pick player has no PA prop on phone');
  await page.keyboard.press('Escape');
  await page.tap('.tabs [data-tab="games"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'm3-games-dark.png'), fullPage: true });
  await page.tap('.tabs [data-tab="props"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'm4-props-dark.png') });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) errors.push('horizontal overflow on phone: ' + overflow + 'px');
  await page.context().close();

  // ---------- daylight look ----------
  page = await newPage({ colorScheme: 'light' });
  await page.addInitScript(() => { try { localStorage.setItem('he.set.theme', '"light"'); } catch (e) {} });
  await page.goto(url + '#picks');
  await ready(page);
  await page.waitForTimeout(400);
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  if (theme !== 'light') errors.push('daylight theme not applied: ' + theme);
  await page.screenshot({ path: path.join(OUT, 'l1-picks-light.png'), fullPage: false });
  await page.click('.tabs [data-tab="props"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'l2-props-light.png'), fullPage: false });
  await page.context().close();

  await browser.close();
  console.log('api calls', apiCalls);
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('UI test passed');
})().catch((e) => { console.error(e); process.exit(1); });
