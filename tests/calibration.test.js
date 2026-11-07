/* Calibration backtest on simulated seasons (truth known): node tests/calibration.test.js
 * For every player and every game after the 15th, project the game from earlier games only,
 * set the estimated line, and compare our predicted chance with what actually happened. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const mock = require('./mock-espn');
const ctx = { console, Intl, Date, Math, JSON, URL, setTimeout, clearTimeout, Promise }; ctx.window = ctx; vm.createContext(ctx);
['util', 'model'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx));
ctx.HE.espn = {}; vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'espn.js'), 'utf8'), ctx);
const { util: U, model: M, espn: E } = ctx.HE;
const stCur = E.parseStandings(mock.respond('https://x/apis/v2/sports/basketball/nba/standings?season=2027'));
const stPrev = E.parseStandings(mock.respond('https://x/apis/v2/sports/basketball/nba/standings?season=2026'));
const L = M.buildLeague(stCur, stPrev);
const bins = {}; let n = 0, brier = 0, picks = { strong: [0, 0, 0, 0], good: [0, 0, 0, 0], lean: [0, 0, 0, 0] };
// a simulated sportsbook: knows each player's true average within ~5%, sets a .5 line, charges ~4.8% vig
let mr = 7; const mrand = () => { mr = (mr * 16807) % 2147483647; return (mr - 1) / 2147483646; };
const mnorm = () => { let u = 0, v = 0; while (!u) u = mrand(); while (!v) v = mrand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const mk = { n: 0, brier: 0, bins: {}, picks: { strong: [0, 0, 0, 0], good: [0, 0, 0, 0], lean: [0, 0, 0, 0] } };
const PHI = { pts: 2.0, reb: 1.3, ast: 1.25, fg3m: 1.0, pr: 2.2, pa: 2.2, ar: 1.4, pra: 2.2 };
const perStat = {};   // stat → [predictions, sum of predicted, sum of actual] against the simulated sportsbook
Object.keys(mock.PLAYERS).forEach((id) => {
  const pl = mock.PLAYERS[id];
  const logs = E.parseGamelog(mock.respond('https://x/apis/common/v3/sports/basketball/nba/athletes/' + id + '/gamelog?season=2026'), 2026);
  const asc = logs.slice().reverse();
  for (let k = 15; k < asc.length; k++) {
    const hist = asc.slice(0, k).reverse(); // newest first
    const prof = M.buildProfile({ id, name: pl.name, teamId: pl.teamId }, hist, [], { cur: 2026, prev: 2025 }, asc[k].ms);
    if (prof.minBase < 14) continue;
    const g = asc[k];
    const c = { lg: L.lg, team: L.ratings[pl.teamId], opp: L.ratings[g.oppId], home: g.home, neutral: false, b2b: false, absMargin: 3, tc: null, teamGamesCur: k };
    const proj = M.projectPlayer(prof, c);
    M.STATS.forEach((s) => {
      const line = M.defaultLine(prof, s);
      if (!Number.isFinite(line) || !(prof.base[s] >= M.MIN_BASE_FOR_PROP[s])) return;
      const an = M.analyzeProp(proj, prof, s, line, { estimated: true });
      const actual = M.val(g, s) > line ? 1 : 0;
      const p = an.cOver;  // calibrated chance
      const b = Math.min(9, Math.floor(p * 10));
      bins[b] = bins[b] || [0, 0, 0]; bins[b][0]++; bins[b][1] += actual; bins[b][2] += p;
      brier += (p - actual) * (p - actual); n++;
      if (an.strength) { const won = (an.side === 'over') === (actual === 1); const P = picks[an.strength]; P[0]++; P[1] += won ? 1 : 0; P[2] += an.side === 'over' ? an.cOver : an.cUnder; P[3] += an.side === 'over' ? an.beO : an.beU; }

      // ---- the same prop against the simulated sportsbook line ----
      const trueMean = pl.min * (M.COMBOS[s] || [s]).reduce((t, k) => t + pl.rate[k], 0);
      const bookMean = trueMean * (1 + 0.05 * mnorm());
      const bl = U.halfLine(bookMean);
      const bv = Math.max(bookMean, 0.05) * PHI[s] + Math.pow(0.08 * bookMean, 2);
      const q = U.probLine(bookMean, bv, bl).over;
      if (q < 0.15 || q > 0.85) return;
      const oo = U.probToAm(Math.min(0.97, q + 0.024)), uo = U.probToAm(Math.min(0.97, 1 - q + 0.024));
      const am = M.analyzeProp(proj, prof, s, bl, { market: { line: bl, over: oo, under: uo }, overOdds: oo, underOdds: uo });
      const act2 = M.val(g, s) > bl ? 1 : 0;
      const b2 = Math.min(9, Math.floor(am.cOver * 10));
      mk.bins[b2] = mk.bins[b2] || [0, 0, 0]; mk.bins[b2][0]++; mk.bins[b2][1] += act2; mk.bins[b2][2] += am.cOver;
      mk.brier += (am.cOver - act2) * (am.cOver - act2); mk.n++;
      const ps = (perStat[s] = perStat[s] || [0, 0, 0, 0, 0]); ps[0]++; ps[1] += am.cOver; ps[2] += act2;
      if (am.strength) { ps[3]++; ps[4] += ((am.side === 'over') === (act2 === 1)) ? 1 : 0; }
      if (am.strength) { const won = (am.side === 'over') === (act2 === 1); const P = mk.picks[am.strength]; P[0]++; P[1] += won ? 1 : 0; P[2] += am.side === 'over' ? am.cOver : am.cUnder; P[3] += am.side === 'over' ? am.beO : am.beU; }
    });
  }
});
console.log('predictions', n, 'brier', (brier / n).toFixed(4), '(coin flip = 0.25)');
console.log('predicted over%  -> actual over%   (count)');
let worst = 0;
Object.keys(bins).sort().forEach((b) => {
  const [c, a, ps] = bins[b];
  const pred = ps / c, act = a / c;
  if (c > 200) worst = Math.max(worst, Math.abs(pred - act));
  console.log('  ' + (pred * 100).toFixed(1).padStart(5) + '%  ->  ' + (act * 100).toFixed(1).padStart(5) + '%   (' + c + ')');
});
const f1 = (x) => (x * 100).toFixed(1) + '%';
Object.keys(picks).forEach((k) => { const P = picks[k]; console.log('  ' + k.padEnd(6) + ' picks: ' + P[0] + ' (' + (P[0] / n * 100).toFixed(1) + '% of props)  won ' + (P[0] ? f1(P[1] / P[0]) : '-') + '  (we said ' + (P[0] ? f1(P[2] / P[0]) : '-') + ', needed ' + (P[0] ? f1(P[3] / P[0]) : '-') + ')'); });
console.log('worst bin gap (bins with >200): ' + (worst * 100).toFixed(1) + ' pts');
console.log('\nagainst a simulated sportsbook that knows each true average within ~5% (+4.8% vig):');
console.log('predictions', mk.n, 'brier', (mk.brier / mk.n).toFixed(4));
let worst2 = 0;
Object.keys(mk.bins).sort().forEach((b) => {
  const [c, a, ps] = mk.bins[b];
  if (c > 200) worst2 = Math.max(worst2, Math.abs(ps / c - a / c));
  console.log('  ' + (ps / c * 100).toFixed(1).padStart(5) + '%  ->  ' + (a / c * 100).toFixed(1).padStart(5) + '%   (' + c + ')');
});
Object.keys(mk.picks).forEach((k) => { const P = mk.picks[k]; console.log('  ' + k.padEnd(6) + ' picks: ' + P[0] + ' (' + (P[0] / mk.n * 100).toFixed(1) + '% of props)  won ' + (P[0] ? f1(P[1] / P[0]) : '-') + '  (we said ' + (P[0] ? f1(P[2] / P[0]) : '-') + ', needed ' + (P[0] ? f1(P[3] / P[0]) : '-') + ')'); });
console.log('worst bin gap: ' + (worst2 * 100).toFixed(1) + ' pts');
console.log('by stat (avg predicted over% vs actual over%, picks won):');
let statBad = [];
Object.keys(perStat).forEach((s) => {
  const [c, p, a, np, nw] = perStat[s];
  console.log('  ' + s.padEnd(5) + ' ' + f1(p / c).padStart(6) + ' -> ' + f1(a / c).padStart(6) + '   (' + c + ')   picks ' + np + (np ? ' won ' + f1(nw / np) : ''));
  if (c > 300 && Math.abs(p / c - a / c) > 0.04) statBad.push(s);
});
if (statBad.length) { console.log('FAIL: biased stats: ' + statBad.join(', ')); process.exit(1); }
// picks must not promise much more than they deliver, and must clear the break-even they quote
const bad = Object.keys(mk.picks).filter((k) => { const P = mk.picks[k]; return P[0] >= 300 && (P[1] / P[0] < P[2] / P[0] - 0.05 || P[1] / P[0] < P[3] / P[0]); });
if (worst2 > 0.06 || bad.length) { console.log('FAIL: overconfident against sportsbook lines: ' + bad.join(', ')); process.exit(1); }
console.log('OK');
process.exit(worst > 0.06 ? 1 : 0);
