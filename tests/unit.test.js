/* Unit tests: node tests/unit.test.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const mock = require('./mock-espn');

const ctx = { console, Intl, Date, Math, JSON, URL, setTimeout, clearTimeout, Promise };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
['util', 'store', 'espn', 'model', 'explain', 'parlay', 'charts', 'ui'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
});
const { util: U, espn: E, model: M, explain: X, charts: CH, ui: UI, parlay: P } = ctx.HE;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack || e).split('\n').slice(0, 3).join('\n       ')); }
}
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' expected ' + b + ' got ' + a);
function noBad(s, where) { assert.ok(!/NaN|undefined|null|\[object/.test(s), (where || '') + ' has bad text: ' + s); }

console.log('util');
test('normal cdf / inverse', () => {
  close(U.normCdf(0), 0.5, 1e-7); close(U.normCdf(1.96), 0.975, 1e-3); close(U.normInv(0.975), 1.96, 1e-3); close(U.normInv(0.2), -0.8416, 1e-3);
});
test('count pmf sums to 1 (NB + Poisson)', () => {
  close(U.sum(U.countPmf(22, 50, 200)), 1, 1e-6);
  close(U.sum(U.countPmf(3.2, 3.2, 60)), 1, 1e-6);
  close(U.sum(U.countPmf(0.4, 0.9, 40)), 1, 1e-6);
});
test('probLine half and whole lines', () => {
  const a = U.probLine(20, 40, 19.5); close(a.over + a.under, 1, 1e-9); assert.strictEqual(a.push, 0); assert.ok(a.over > 0.4 && a.over <= 0.5, 'NB skew'); assert.ok(U.probLine(20, 60, 19.5).over < 0.5);
  close(U.probLine(20, 20, 19.5).over, 0.5297, 2e-3);
  const b = U.probLine(20, 40, 20); assert.ok(b.push > 0.03); close(b.over + b.under + b.push, 1, 1e-9);
  const c = U.probLine(2.1, 2.3, 2.5); assert.ok(c.over < 0.45 && c.over > 0.2);
  assert.ok(U.probLine(25, 50, 30.5).over < U.probLine(25, 50, 24.5).over);
});
test('odds helpers', () => {
  close(U.amToProb(-110), 0.5238, 1e-4); close(U.amToProb(150), 0.4, 1e-9); close(U.amToProb('+124'), 100 / 224, 1e-9);
  assert.strictEqual(U.probToAm(0.6), -150); assert.strictEqual(U.fmtAm(124), '+124');
});
test('half lines', () => {
  assert.strictEqual(U.halfLine(24.3), 24.5); assert.strictEqual(U.halfLine(24.8), 24.5); assert.strictEqual(U.halfLine(25.1), 25.5); assert.strictEqual(U.halfLine(0.1), 0.5);
});
test('dates and clocks', () => {
  assert.strictEqual(U.etYmd(new Date('2026-10-21T04:50:00Z')), '20261021');
  assert.strictEqual(U.etYmd(new Date('2026-10-21T03:50:00Z')), '20261020');
  assert.strictEqual(U.addDays('20261031', 1), '20261101');
  assert.strictEqual(U.clockToSec('5:32'), 332); assert.strictEqual(U.clockToSec('45.3'), 45.3);
  assert.strictEqual(U.elapsedSec(3, 332), 1440 + 388); assert.strictEqual(U.remainingSec(3, 332), 720 + 332);
  assert.strictEqual(U.elapsedSec(5, 300), 2880); assert.strictEqual(U.periodName(6), '2OT');
});

console.log('espn parsers');
const sb = E.parseScoreboard(mock.respond('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261021'));
test('scoreboard', () => {
  assert.strictEqual(sb.games.length, 5); assert.strictEqual(sb.seasonYear, 2027);
  assert.ok(sb.calendar.length > 100 && /^\d{8}$/.test(sb.calendar[0]));
  const live = sb.games.find((g) => g.status.state === 'in');
  assert.strictEqual(live.status.period, 3); assert.strictEqual(live.status.clockSec, 332); assert.ok(live.home.score > 0);
  const pre = sb.games.find((g) => g.id === '401909842');
  assert.ok(pre.odds && Number.isFinite(pre.odds.spread) && Number.isFinite(pre.odds.total) && Number.isFinite(pre.odds.homeML));
  assert.strictEqual(sb.games.find((g) => g.id === '401909843').odds, null);
});
test('odds parsing — real ESPN shapes', () => {
  const real = { provider: { id: '100', name: 'Draft Kings', displayName: 'Draft Kings' }, details: 'ORL -3.5', overUnder: 235.5, spread: -3.5,
    awayTeamOdds: { favorite: false, underdog: true }, homeTeamOdds: { favorite: true, underdog: false },
    moneyline: { home: { close: { odds: '-148' }, open: { odds: '-135' } }, away: { close: { odds: '+124' }, open: { odds: '+114' } } },
    pointSpread: { home: { close: { line: '-3.5', odds: '-102' }, open: { line: '-2.5', odds: '-110' } }, away: { close: { line: '+3.5', odds: '-118' } } },
    total: { over: { close: { line: 'o235.5', odds: '-108' }, open: { line: 'o232.5' } }, under: { close: { line: 'u235.5', odds: '-112' } } } };
  const o = E.parseOdds(real, 'ORL', 'ATL');
  assert.strictEqual(o.spread, -3.5); assert.strictEqual(o.total, 235.5); assert.strictEqual(o.homeML, -148); assert.strictEqual(o.awayML, 124);
  assert.strictEqual(o.homeSpreadOdds, -102); assert.strictEqual(o.awaySpreadOdds, -118); assert.strictEqual(o.overOdds, -108); assert.strictEqual(o.underOdds, -112);
  assert.strictEqual(o.open.spread, -2.5); assert.strictEqual(o.open.total, 232.5); assert.strictEqual(o.provider, 'Draft Kings');
  // away favorite, flat pickcenter style
  const pc = { provider: { name: 'Draft Kings' }, details: 'MIL -6.5', overUnder: 228, spread: 6.5, overOdds: -110, underOdds: -110,
    awayTeamOdds: { favorite: true, moneyLine: -250, spreadOdds: -110 }, homeTeamOdds: { favorite: false, moneyLine: 205, spreadOdds: -110 } };
  const p = E.parseOdds(pc, 'WSH', 'MIL');
  assert.strictEqual(p.spread, 6.5); assert.strictEqual(p.homeML, 205); assert.strictEqual(p.awayML, -250); assert.strictEqual(p.total, 228);
  // details missing, only spread + favorite flag (away favorite)
  const q = E.parseOdds({ spread: 4, awayTeamOdds: { favorite: true }, homeTeamOdds: { favorite: false } }, 'A', 'B');
  assert.strictEqual(q.spread, 4);
  assert.strictEqual(E.parseOdds({}, 'A', 'B'), null);
});
const sumLive = E.parseSummary(mock.respond('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401909835'), '401909835');
const sumPre = E.parseSummary(mock.respond('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401909842'), '401909842');
test('summary live', () => {
  assert.strictEqual(sumLive.status.state, 'in'); assert.ok(sumLive.players.length >= 20);
  const p = sumLive.players.find((x) => !x.dnp); assert.ok(p.min > 0 && Number.isFinite(p.pts) && Number.isFinite(p.fg3m));
  assert.ok(sumLive.players.some((x) => x.dnp)); // injured player listed as DNP
  assert.ok(sumLive.flow && sumLive.flow.points.length > 10);
  assert.strictEqual(sumLive.flow.homeScore, sumLive.homeScore); assert.strictEqual(sumLive.flow.awayScore, sumLive.awayScore);
  const ts = sumLive.teamStats[sumLive.homeId]; assert.strictEqual(ts.leadChanges, sumLive.flow.leadChanges);
  assert.strictEqual(ts.largestLead, sumLive.flow.largestLead.home);
  assert.ok(sumLive.winprob && sumLive.winprob.series.length > 5 && sumLive.winprob.home >= 0 && sumLive.winprob.home <= 1);
  assert.ok(sumLive.injuries.length >= 1 && sumLive.injuries[0].status);
});
test('summary pregame', () => {
  assert.strictEqual(sumPre.status.state, 'pre'); assert.ok(sumPre.predictor && sumPre.predictor.home > 0 && sumPre.predictor.home < 1);
  assert.ok(sumPre.odds && Number.isFinite(sumPre.odds.spread)); assert.strictEqual(sumPre.flow, null); assert.strictEqual(sumPre.players.length, 0);
});
test('flow lead changes / ties', () => {
  const plays = [[0, 0], [2, 0], [2, 3], [5, 3], [5, 5], [5, 7], [9, 7]].map((s, i) => ({ id: 'p' + i, period: { number: 1 }, clock: { displayValue: (11 - i) + ':00' }, homeScore: s[0], awayScore: s[1] }));
  const f = E.computeFlow(plays);
  assert.strictEqual(f.leadChanges, 4); assert.strictEqual(f.timesTied, 1); assert.strictEqual(f.largestLead.home, 2); assert.strictEqual(f.largestLead.away, 2);
  assert.strictEqual(f.run.side, 'home'); assert.strictEqual(f.run.pts, 4);
});
const stCur = E.parseStandings(mock.respond('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=2027'));
const stPrev = E.parseStandings(mock.respond('https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=2026'));
test('standings', () => {
  assert.strictEqual(Object.keys(stPrev.teams).length, 30);
  const det = stPrev.teams['8']; assert.ok(det.gp === 82 && det.ppg > 100 && det.home && det.l10);
  assert.strictEqual(stCur.teams['1'].gp, 0);
});
const ros = E.parseRoster(mock.respond('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/19/roster'));
test('roster', () => {
  assert.strictEqual(ros.length, 13); assert.ok(ros[0].id && ros[0].name && ros[0].pos);
  assert.ok(ros.some((a) => a.injury === 'Out'));
});
const pid = ros[0].id;
const glPrev = E.parseGamelog(mock.respond('https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/' + pid + '/gamelog?season=2026'), 2026);
const glCur = E.parseGamelog(mock.respond('https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/' + pid + '/gamelog?season=2027'), 2027);
test('gamelog', () => {
  assert.ok(glPrev.length >= 70 && glPrev.length <= 80, 'prev games ' + glPrev.length);
  assert.ok(glPrev.every((g) => g.season === 2026 && g.st === 'reg' && g.min > 0 && g.oppId && Number.isFinite(g.pts)));
  assert.ok(glPrev[0].ms > glPrev[glPrev.length - 1].ms, 'newest first');
  assert.ok(glPrev.some((g) => g.home) && glPrev.some((g) => !g.home));
  assert.strictEqual(glCur.length, 0, 'preseason must be excluded');
  // wrong-season response is ignored
  assert.strictEqual(E.parseGamelog(mock.respond('https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/' + pid + '/gamelog?season=2026'), 2027).length, 0);
});

console.log('model');
const L = M.buildLeague(stCur, stPrev);
test('league ratings', () => {
  assert.strictEqual(L.nTeams, 30); assert.ok(L.lg > 100 && L.lg < 130);
  const r = L.ratings['19']; assert.ok(Number.isFinite(r.off) && Number.isFinite(r.def) && r.rank.allows >= 1 && r.rank.allows <= 30);
});
const seasons = { cur: 2027, prev: 2026 };
const profs = ros.map((a) => {
  const cur = E.parseGamelog(mock.respond('https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/' + a.id + '/gamelog?season=2027'), 2027);
  const prev = E.parseGamelog(mock.respond('https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/' + a.id + '/gamelog?season=2026'), 2026);
  return M.buildProfile({ id: a.id, name: a.name, short: a.short, pos: a.pos, teamId: '19', status: a.injury }, cur, prev, seasons, Date.parse('2026-10-21T20:00Z'));
});
const tc = M.teamContext(profs, 0);
test('profiles + team context', () => {
  const p = profs[0];
  assert.ok(p.minBase > 25 && p.rates.pts > 0.2 && p.phi.pts >= 0.8 && Number.isFinite(p.base.pts));
  assert.ok(Math.abs(p.base.pts - p.avg.pts.prev) < 0.01, 'no current games → base = last season');
  assert.ok(tc.missing.length >= 1 && tc.marginLoss > 0 && tc.missingShare.pts > 0 && tc.missingShare.pts < 0.5);
});
const game = sb.games.find((g) => g.id === '401909842');
const pred = M.predictGame(game, L, { injHome: tc, injAway: null, b2bHome: true, predictor: sumPre.predictor, odds: game.odds });
test('game prediction', () => {
  assert.ok(pred.pHome > 0.02 && pred.pHome < 0.98);
  assert.ok(Math.sign(pred.margin) === Math.sign(pred.pHome - 0.5) || Math.abs(pred.pHome - 0.5) < 1e-9);
  close(pred.home - pred.away, pred.margin, 1e-9); close(pred.home + pred.away, pred.total, 1e-9);
  assert.ok(pred.total > 190 && pred.total < 270);
  const mk = pred.markets; assert.ok(mk.spread && mk.total && mk.ml);
  close(mk.spread.pHome + mk.spread.pAway, 1, 1e-9); close(mk.total.pOver + mk.total.pUnder, 1, 1e-9);
  assert.ok(['home', 'away'].includes(mk.spread.side) && ['over', 'under'].includes(mk.total.side));
});
test('integer spread push', () => {
  const m2 = M.gameMarkets(Object.assign({}, pred, { margin: 3 }), { spread: -3, total: 220, homeML: -150, awayML: 130 });
  assert.ok(m2.spread.pPush > 0.02); close(m2.spread.pHome + m2.spread.pAway, 1, 1e-9);
});
const star = profs[0];
const ctxP = { lg: L.lg, team: L.ratings['19'], opp: L.ratings['1'], home: true, neutral: false, b2b: false, absMargin: 4, tc: tc, teamGamesCur: 0 };
const proj = M.projectPlayer(star, ctxP);
test('player projection + props', () => {
  assert.ok(proj.mins > 20 && proj.mins <= 42);
  M.STATS.forEach((s) => {
    const st = proj.stats[s]; assert.ok(st.mean > 0 && st.var > 0 && Number.isFinite(st.rate), s);
    const line = M.defaultLine(star, s);
    const an = M.analyzeProp(proj, star, s, line, { oppId: '1' });
    close(an.cOver + an.cUnder, 1, 1e-9); assert.ok(an.pOver >= 0 && an.pOver <= 1);
    assert.ok(['over', 'under'].includes(an.side)); assert.ok(an.hr.l10 && an.hr.l10.n === 10);
  });
  const mu = proj.stats.pts.mean; console.log("       (star pts mean " + mu.toFixed(1) + ", sd " + Math.sqrt(proj.stats.pts.var).toFixed(1) + ")");
  const lo = M.analyzeProp(proj, star, "pts", Math.floor(mu * 0.45) + 0.5, {}), hi = M.analyzeProp(proj, star, "pts", Math.floor(mu * 1.6) + 0.5, {});
  assert.ok(lo.pOver > 0.9 && hi.pOver < 0.1, 'monotonic');
  assert.strictEqual(lo.side, 'over'); assert.ok(lo.strength, 'a line far below him is still a pick');
  assert.strictEqual(hi.side, 'under');
});
test('combo props: PR = points + rebounds, PA = points + assists', () => {
  const g = { pts: 18, reb: 7, ast: 4, fg3m: 2 };
  assert.strictEqual(M.val(g, 'pr'), 25); assert.strictEqual(M.val(g, 'pa'), 22); assert.strictEqual(M.val(g, 'pra'), 29); assert.strictEqual(M.val(g, 'reb'), 7);
  close(proj.stats.pr.mean, proj.stats.pts.mean + proj.stats.reb.mean, 1e-9);
  close(proj.stats.pa.mean, proj.stats.pts.mean + proj.stats.ast.mean, 1e-9);
  close(proj.stats.pr.rate, proj.stats.pts.rate + proj.stats.reb.rate, 1e-12);
  ['pr', 'pa'].forEach((s) => {
    const st = proj.stats[s];
    assert.ok(star.phi[s] >= 0.8 && star.phi[s] <= 4.5, 'phi ' + s);
    close(st.var, st.mean * star.phi[s] + Math.pow(M.CONFIG.PROJ_UNCERT * st.mean, 2), 1e-9);
  });
  // a total swings less than its parts' swings added up
  const sd = (s) => Math.sqrt(proj.stats[s].var);
  assert.ok(sd('pr') < sd('pts') + sd('reb') && sd('pa') < sd('pts') + sd('ast'), 'sub-additive spread');
  // averages and hit rates use the added-up totals
  close(star.avg.pr.l10, star.avg.pts.l10 + star.avg.reb.l10, 1e-9);
  close(star.avg.pa.l20, star.avg.pts.l20 + star.avg.ast.l20, 1e-9); close(star.avg.pr.prev, star.avg.pts.prev + star.avg.reb.prev, 1e-9);
  const line = M.defaultLine(star, 'pr');
  assert.strictEqual(M.hitRates(star, 'pr', line).l10.over, star.games.slice(0, 10).filter((x) => x.pts + x.reb > line).length);
  // plain-English pieces
  assert.strictEqual(X.winCondition('Oso Ighodaro', 'pr', 'over', 16.5), "You win if Ighodaro's points + rebounds add up to 17 or more.");
  assert.strictEqual(X.winCondition('Oso Ighodaro', 'pa', 'under', 16.5), "You win if Ighodaro's points + assists add up to 16 or fewer.");
  assert.strictEqual(X.winCondition('Cam Thomas', 'pa', 'over', 20), "You win if Thomas' points + assists add up to 21 or more. Exactly 20 = money back.");
  assert.strictEqual(X.comboNote('pa'), 'PA = points + assists, added together.'); assert.strictEqual(X.comboNote('pts'), '');
  // the parts we show always add up to the total we show
  const fake = { stats: { pts: { mean: 10.14 }, ast: { mean: 1.54 }, pa: { mean: 11.68 } } };
  const cp = X.comboParts(fake, 'pa');
  assert.strictEqual(Math.round((cp[0].v + cp[1].v) * 10), 117, JSON.stringify(cp)); assert.strictEqual(X.comboParts(fake, 'pts'), null);
  for (let i = 0; i < 300; i++) {
    const r = () => Math.random() * 30;
    const f = { stats: { pts: { mean: r() }, reb: { mean: r() / 3 }, ast: { mean: r() / 4 } } };
    f.stats.pra = { mean: f.stats.pts.mean + f.stats.reb.mean + f.stats.ast.mean };
    const c3 = X.comboParts(f, 'pra');
    assert.strictEqual(Math.round(c3.reduce((t, x) => t + x.v * 10, 0)), Math.round(f.stats.pra.mean * 10));
    c3.forEach((x) => assert.ok(Math.abs(x.v - f.stats[x.stat].mean) < 0.1 + 1e-9, 'part stays within 0.1'));
  }
  const an = M.analyzeProp(proj, star, 'pr', line, { oppId: '1' });
  const rs = X.propReasons({ an, prof: star, proj, stat: 'pr', line, opp: L.ratings['1'], oppTeam: { short: 'Hawks' }, oppId: '1', nTeams: 30 });
  assert.ok(rs.info.some((r) => /^How it adds up: [\d.]+ points \+ [\d.]+ rebounds = [\d.]+ PR\.$/.test(r.text)), 'breakdown');
  assert.ok(/more point or rebound|more points \+ rebounds/.test(X.livePropText({ stat: 'pr', an: { side: 'over' } }, { cur: 10, min: 20, need: 3, remMin: 12, pOver: 0.4 })));
});
test('DraftKings prop lines: pairs, main line, types', () => {
  const pb = mock.respond('https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/401909842/competitions/401909842/odds/100/propBets?lang=en&region=us&limit=300');
  const lines = E.parsePropBets(pb.items);
  const ids = Object.keys(lines);
  assert.ok(ids.length >= 12, 'players ' + ids.length);
  const one = lines[ids[0]];
  ['pts', 'reb', 'ast', 'pr', 'pa', 'pra'].forEach((s) => { assert.ok(one[s] && one[s].line > 0 && Number.isFinite(one[s].over) && Number.isFinite(one[s].under), s); });
  // PR (type 88) and PA (type 87) map to the right stats; types we don't use (89 = assists + rebounds) are skipped
  const typeLine = (tid) => { const x = pb.items.find((it) => it.type.id === tid); return [x.athlete.$ref.match(/athletes\/(\d+)/)[1], x.current.target.value]; };
  let [a88, l88] = typeLine('88'); assert.strictEqual(lines[a88].pr.line, l88);
  let [a87, l87] = typeLine('87'); assert.strictEqual(lines[a87].pa.line, l87);
  assert.ok(pb.items.some((it) => it.type.id === '89') && ids.every((k) => Object.keys(lines[k]).every((s) => M.STATS.includes(s))), 'only known stats');
  // first entry is the over, second the under; milestones are ignored
  const it = pb.items.filter((x) => x.type.id === '1');
  const aid = it[0].athlete.$ref.match(/athletes\/(\d+)/)[1];
  assert.strictEqual(lines[aid].pts.over, U.num(it[0].odds.american.value)); assert.strictEqual(lines[aid].pts.under, U.num(it[1].odds.american.value));
  // two lines for the same player & stat → the one nearest even money wins
  const mk = (line, am) => ({ athlete: { $ref: 'x/athletes/77?x' }, type: { id: '3', name: 'Total Rebounds' }, odds: { american: { value: am } }, current: { target: { value: line } }, lastUpdated: '2026-10-21T05:00Z' });
  const alt = E.parsePropBets([mk(6.5, '-250'), mk(6.5, '+190'), mk(8.5, '-112'), mk(8.5, '-108')]);
  assert.strictEqual(alt['77'].reb.line, 8.5);
  assert.deepStrictEqual(Object.keys(E.parsePropBets([mk(6.5, '-110')])), []);   // half a pair is ignored
});
test('sportsbook line: implied mean, blend, real break-even', () => {
  const line = M.defaultLine(star, 'pts');
  // the book's odds → implied mean → back to the same over chance
  const mm = M.marketMean(star, 'pts', line, 0.5);
  assert.ok(Math.abs(mm - line) < 2.5, 'implied mean near the line ' + mm + ' vs ' + line);
  assert.ok(M.marketMean(star, 'pts', line, 0.62) > mm, 'more over money → higher implied mean');
  const nv = M.noVigOver(-125, 105); close(nv, U.amToProb(-125) / (U.amToProb(-125) + U.amToProb(105)), 1e-12);
  const mkt = { line: line, over: -125, under: 105, book: 'DraftKings' };
  const an = M.analyzeProp(proj, star, 'pts', line, { oppId: '1', market: mkt, overOdds: -125, underOdds: 105 });
  close(an.mktOver, nv, 1e-9);
  assert.ok(an.mktW >= M.CONFIG.MKT_W && an.mktW <= M.CONFIG.MKT_W_NEWTEAM, 'market weight ' + an.mktW);
  close(an.cOver, an.mktW * nv + (1 - an.mktW) * an.rawOver, 1e-9);
  close(an.beO, U.amToProb(-125), 1e-12); close(an.beU, U.amToProb(105), 1e-12);
  assert.ok(an.priced && !an.estimated && Number.isFinite(an.mktMean));
  assert.ok(/DraftKings' price \(-125\)|DraftKings' price \(\+105\)/.test(X.propBottomLine(an)), X.propBottomLine(an));
  // your own line 2 points higher: the book's view moves with it, break-even goes to standard odds
  const mine = M.analyzeProp(proj, star, 'pts', line + 2, { oppId: '1', market: mkt });
  assert.ok(mine.mktOver < nv, 'higher line → lower over chance from the book');
  close(mine.beO, M.CONFIG.BREAKEVEN, 1e-9); assert.ok(!mine.priced);
  assert.ok(/standard odds/.test(X.propBottomLine(mine)));
  // the model can't run away from the market: a huge model edge is halved
  const far = M.analyzeProp(proj, star, 'pts', Math.floor(proj.stats.pts.mean * 0.6) + 0.5, { market: { line: Math.floor(proj.stats.pts.mean * 0.6) + 0.5, over: -110, under: -110 }, overOdds: -110, underOdds: -110 });
  assert.ok(far.rawOver > 0.9 && far.cOver < 0.76, 'blended ' + far.cOver);
});
test('early season, new team, long absence → lean on the sportsbook', () => {
  const mkG = (k, season, teamId, ms) => ({ id: 'g' + season + k, ms: ms, season: season, st: 'reg', teamId: teamId, oppId: '1', home: k % 2 === 0, min: 30, pts: 20 + (k % 5), reb: 5, ast: 4, stl: 1, blk: 0, tov: 2, pf: 2, fgm: 8, fga: 16, fg3m: 2, fg3a: 5, ftm: 2, fta: 3 });
  const t0 = Date.UTC(2026, 3, 10);
  const prevLogs = Array.from({ length: 40 }, (_, k) => mkG(k, 2026, '2', t0 - k * 2 * 86400000));
  const curLogs = Array.from({ length: 12 }, (_, k) => mkG(k, 2027, '9', Date.UTC(2026, 10, 30) - k * 2 * 86400000));
  const seasons = { cur: 2027, prev: 2026 };
  const fresh = M.buildProfile({ id: 'a', name: 'New Guy', teamId: '9' }, [], prevLogs, seasons, Date.UTC(2026, 9, 21));
  const settled = M.buildProfile({ id: 'a', name: 'New Guy', teamId: '9' }, curLogs, prevLogs, seasons, Date.UTC(2026, 11, 2));
  const stayed = M.buildProfile({ id: 'b', name: 'Same Guy', teamId: '2' }, [], prevLogs, seasons, Date.UTC(2026, 9, 21));
  assert.ok(fresh.newTeam && !settled.newTeam && !stayed.newTeam, 'new-team flag');
  const c = { lg: L.lg, team: L.ratings['9'], opp: L.ratings['1'], home: true, neutral: false, b2b: false, absMargin: 3, tc: null, teamGamesCur: 0 };
  const mk = { line: 20.5, over: -110, under: -110, book: 'DraftKings' };
  const o = { market: mk, overOdds: -110, underOdds: -110 };
  const aF = M.analyzeProp(M.projectPlayer(fresh, c), fresh, 'pts', 20.5, o);
  const aS = M.analyzeProp(M.projectPlayer(stayed, c), stayed, 'pts', 20.5, o);
  const aL = M.analyzeProp(M.projectPlayer(settled, c), settled, 'pts', 20.5, o);
  close(aF.mktW, M.CONFIG.MKT_W_NEWTEAM, 1e-9); close(aS.mktW, M.CONFIG.MKT_W_EARLY, 1e-9); close(aL.mktW, M.CONFIG.MKT_W, 1e-9);
  assert.ok(aF.caution.includes('newTeam') && aF.strength !== 'strong');
  const rs = X.propReasons({ an: aF, prof: fresh, proj: M.projectPlayer(fresh, c), stat: 'pts', line: 20.5, opp: L.ratings['1'], oppTeam: { short: 'Hawks' }, oppId: '1', nTeams: 30 });
  assert.ok(rs.cons.some((x) => /New team/.test(x.text)));
  // missed all of last season → flagged and minutes trimmed
  const old = Array.from({ length: 30 }, (_, k) => mkG(k, 2025, '22', Date.UTC(2025, 3, 10) - k * 2 * 86400000));
  const back = M.buildProfile({ id: 'c', name: 'Back Again', teamId: '22' }, [], old, seasons, Date.UTC(2026, 9, 21));
  assert.ok(back.longAbsence && back.minBase > 25);
  const pj = M.projectPlayer(back, Object.assign({}, c, { team: L.ratings['22'] }));
  assert.ok(pj.notes.some((n) => n.k === 'returning' && n.long) && pj.mins < back.minBase);
});
test('teammates out: usage boost, minutes shared, crowded rotations trimmed', () => {
  const noInj = M.projectPlayer(star, Object.assign({}, ctxP, { tc: M.teamContext(profs.map((p) => Object.assign({}, p, { status: null })), 0) }));
  assert.ok(proj.stats.pts.mean > noInj.stats.pts.mean, 'boost');
  // an 8-man rotation (≈222 min) missing a 33-minute starter → the others share his minutes
  const eight = profs.slice(0, 8);
  const tc8 = M.teamContext(eight, 0);
  const total = Object.keys(tc8.projMin).reduce((a, k) => a + tc8.projMin[k], 0);
  assert.ok(total > 222 - 33 + 20 && total <= 240.01, 'minutes redistributed: ' + total.toFixed(1));
  assert.ok(Object.keys(tc8.minNote).some((k) => tc8.minNote[k].k === 'minUp'));
  Object.keys(tc8.projMin).forEach((k) => assert.ok(tc8.projMin[k] <= 40));
  // while only the key players are loaded, nobody's minutes get reshuffled
  const part = M.teamContext(eight, 0, { partial: true });
  Object.keys(part.projMin).forEach((k) => close(part.projMin[k], eight.find((p) => p.id === k).minBase, 1e-9));
  assert.strictEqual(Object.keys(part.minNote).length, 0);
  // 13 healthy players whose usual minutes add up to ~290 → the end of the bench loses minutes, starters keep theirs
  const full = M.teamContext(profs.map((p) => Object.assign({}, p, { status: null })), 0);
  const sumFull = Object.keys(full.projMin).reduce((a, k) => a + full.projMin[k], 0);
  const rawFull = profs.reduce((a, p) => a + (p.minBase >= 3 ? p.minBase : 0), 0);
  assert.ok(sumFull < rawFull && sumFull >= 240 - 1, 'crowded total ' + sumFull.toFixed(1) + ' of ' + rawFull.toFixed(1));
  assert.ok(rawFull - sumFull <= 0.3 * (rawFull - 240) + 1e-6, 'only a mild trim');
  const starCut = profs[0].minBase - full.projMin[profs[0].id];
  const benchP = profs.find((p) => p.minBase > 10 && p.minBase < 20);
  assert.ok(starCut / profs[0].minBase < (benchP.minBase - full.projMin[benchP.id]) / benchP.minBase, 'bench trimmed more than the star');
  Object.keys(full.projMin).forEach((k) => { const p = profs.find((x) => x.id === k); assert.ok(full.projMin[k] >= 0.88 * p.minBase - 1e-9); });
});
test('injury impact has diminishing returns', () => {
  const many = M.teamContext(profs.map((p, i) => Object.assign({}, p, { status: i < 5 ? 'Out' : null })), 0);
  assert.ok(many.rawLoss > many.marginLoss && many.marginLoss < M.CONFIG.INJ_CAP);
});
test('market anchor shifts league scoring to the books', () => {
  const games = [{ g: game, odds: Object.assign({}, game.odds, { total: 250 }) }];
  const a = M.marketAnchor(games, L);
  assert.ok(a > 0 && a <= 6);
  assert.strictEqual(M.marketAnchor([{ g: Object.assign({}, game, { odds: null }), odds: null }], L), 0);
});
test('live game', () => {
  const end = M.liveGame(pred, { state: 'in', period: 4, clockSec: 0.5, homeScore: 100, awayScore: 95 }, game.odds);
  assert.ok(end.pHome > 0.99);
  const half = M.liveGame(pred, { state: 'in', period: 2, clockSec: 0, homeScore: 50, awayScore: 60 }, game.odds);
  assert.ok(half.pHome < 0.5 && half.projTotal > 180 && half.projTotal < 280);
  const fin = M.liveGame(pred, { state: 'post', period: 4, clockSec: 0, homeScore: 90, awayScore: 99 }, game.odds);
  assert.strictEqual(fin.pHome, 0); assert.ok(fin.pOver === 0 || fin.pOver === 1);
});
test('live player', () => {
  const box = { pts: 20, reb: 4, ast: 3, fg3m: 2, min: 24, pf: 2 };
  const live = { state: 'in', period: 3, clockSec: 300, homeScore: 70, awayScore: 66 };
  const lp = M.livePlayer(proj, star, box, live, 'pts', 28.5);
  assert.ok(lp.pOver > 0 && lp.pOver < 1 && lp.remMin > 0 && lp.need === 9);
  const hit = M.livePlayer(proj, star, box, live, 'pts', 18.5); assert.ok(hit.hit && hit.pOver === 1);
  const fouled = M.livePlayer(proj, star, Object.assign({}, box, { pf: 6 }), live, 'pts', 28.5); assert.ok(fouled.pOver < 0.001);
  const fin = M.livePlayer(proj, star, box, { state: 'post' }, 'pts', 19.5); assert.ok(fin.final && fin.hit);
});

console.log('auto parlay');
test('odds conversions', () => {
  close(P.decimal(-110), 1 + 100 / 110, 1e-12); close(P.decimal(150), 2.5, 1e-12); close(P.decimal('+100'), 2, 1e-12);
  assert.ok(Number.isNaN(P.decimal(0)) && Number.isNaN(P.decimal(50)));
  assert.strictEqual(P.american(2.5), 150); assert.strictEqual(P.american(1.5), -200); assert.strictEqual(P.american(2), 100);
});
function fakeRow(i, o) {
  o = o || {};
  const side = o.side || (i % 2 ? 'under' : 'over');
  const c = o.c || 0.55;
  return {
    key: '20261021:' + (o.pid || 'p' + i) + ':' + (o.stat || 'pts'), gameId: o.gid || 'g' + (i % 6), stat: o.stat || 'pts', line: 20.5, isHome: i % 2 === 0,
    game: { status: { state: o.state || 'pre' }, startISO: '2026-10-21T23:00:00Z' },
    lineSource: o.src || 'book', book: 'DraftKings', bookLine: { line: 20.5, over: o.over || -110, under: o.under || -110 },
    prof: { id: o.pid || 'p' + i, name: 'Player ' + i, status: o.status || null, minBase: o.minBase || 30 },
    team: { abbr: 'AAA' }, oppTeam: { abbr: 'BBB' },
    an: { side: side, cOver: side === 'over' ? c : 1 - c, cUnder: side === 'over' ? 1 - c : c, strength: o.strength || null }
  };
}
test('parlay candidates: only real lines on games you can still bet', () => {
  const rows = [fakeRow(1), fakeRow(2, { src: 'est' }), fakeRow(3, { state: 'in' }), fakeRow(4, { status: 'Questionable' }), fakeRow(5, { minBase: 9 }), fakeRow(6, { src: 'user' })];
  const c = P.candidates(rows, []);
  assert.strictEqual(JSON.stringify(c.map((x) => x.playerId).sort()), JSON.stringify(['p1', 'p6']));
  const user = c.find((x) => x.playerId === 'p6');
  assert.strictEqual(user.odds, -110); assert.ok(!user.priced);
  const one = c.find((x) => x.playerId === 'p1');
  close(one.edge, one.p - 1 / P.decimal(one.odds), 1e-12); assert.ok(/UNDER 20.5 PTS|OVER 20.5 PTS/.test(one.pick));
});
test('parlay build: best value, one per player, spread across games, filler marked', () => {
  // 12 legs on 6 games: chances 0.50–0.61 at -110 (break-even 52.4%)
  const rows = []; for (let i = 0; i < 12; i++) rows.push(fakeRow(i, { c: 0.5 + i * 0.01, gid: 'g' + (i % 6) }));
  rows.push(fakeRow(99, { pid: 'p11', c: 0.7, stat: 'reb', gid: 'g5' }));   // same player as leg 11 → only one of them
  const c = P.candidates(rows, []);
  const s = P.build(c, 5, 'best', {});
  assert.strictEqual(s.legs.length, 5);
  const players = new Set(s.legs.map((l) => l.playerId)); assert.strictEqual(players.size, 5, 'one leg per player');
  const games = new Set(s.legs.map((l) => l.gameId)); assert.strictEqual(games.size, 5, 'different games first');
  assert.strictEqual(s.legs[0].p, 0.7, 'biggest edge first');
  for (let i = 1; i < s.legs.length; i++) assert.ok(s.legs[i - 1].edge >= s.legs[i].edge);
  assert.strictEqual(s.nFiller, 0);
  // 10 legs: only 8 legs beat the price → 2 fillers, and a second leg per game is allowed
  const t = P.build(c, 10, 'best', {});
  assert.strictEqual(t.legs.length, 10); assert.ok(t.nFiller >= 1); assert.ok(t.sameGame.length >= 1);
  // swapping a leg brings in the next one
  const u = P.build(c, 5, 'best', { [s.legs[0].id]: 1 });
  assert.ok(!u.legs.some((l) => l.id === s.legs[0].id) && u.legs.length === 5);
  // never two game bets on the same game (spread + moneyline would be nearly the same bet)
  const gl = (kind, p) => ({ id: 'g:x:' + kind, kind: kind, gameId: 'gx', playerId: null, p: p, odds: -110, dec: P.decimal(-110), edge: p - 1 / P.decimal(-110) });
  const w = P.build([gl('spread', 0.6), gl('ml', 0.6), gl('total', 0.59)].concat(c), 5, 'best', {});
  assert.strictEqual(w.legs.filter((l) => l.gameId === 'gx').length, 1, 'one game bet per game');
  // safest = highest chance first
  const v = P.build(c, 5, 'safe', {});
  for (let i = 1; i < v.legs.length; i++) assert.ok(v.legs[i - 1].p >= v.legs[i].p);
});
test('parlay stats', () => {
  const legs = [{ p: 0.6, dec: P.decimal(-110) }, { p: 0.55, dec: P.decimal(+120) }, { p: 0.5, dec: 2 }];
  const st = P.stats(legs);
  close(st.pAll, 0.6 * 0.55 * 0.5, 1e-12); close(st.dec, (1 + 100 / 110) * 2.2 * 2, 1e-12);
  close(st.ev, st.pAll * st.dec - 1, 1e-12); close(st.payout10, 10 * st.dec, 1e-9);
  assert.strictEqual(P.oneIn(0.05), '1 in 20'); assert.strictEqual(P.pctSmall(0.0234), '2.3%'); assert.strictEqual(P.pctSmall(0.0031), '0.31%');
  const txt = P.slipText({ legs: [Object.assign({ title: 'A B', long: 'Over 20.5 points', odds: -110 }, legs[0])] }, P.stats([legs[0]]), 'Wed, Oct 21');
  assert.ok(/JJ Props/.test(txt) && /Over 20.5 points/.test(txt) && !/NaN|undefined/.test(txt));
});

console.log('explain + ui');
test('win conditions', () => {
  assert.strictEqual(X.winCondition('Jayson Tatum', 'pts', 'over', 24.5), 'You win if Tatum scores 25 or more points.');
  assert.strictEqual(X.winCondition('Jayson Tatum', 'pts', 'under', 24.5), 'You win if Tatum scores 24 or fewer points.');
  assert.ok(/money back/.test(X.winCondition('A B', 'reb', 'over', 9)));
  assert.strictEqual(X.spreadCondition({ short: 'Magic' }, -3.5), 'Magic win by 4 or more');
  assert.strictEqual(X.spreadCondition({ short: 'Hawks' }, 3.5), 'Hawks win, or lose by 3 or fewer');
  assert.ok(/exactly 3/.test(X.spreadCondition({ short: 'Hawks' }, 3)));
});
test('reasons + texts have no NaN/undefined', () => {
  M.STATS.forEach((s) => {
    const line = M.defaultLine(star, s);
    [{ oppId: '1', gtd: true }, { oppId: '1', estimated: true }, { oppId: '1', market: { line: line, over: -118, under: -104, book: 'DraftKings' }, overOdds: -118, underOdds: -104 }].forEach((o) => {
      const an = M.analyzeProp(proj, star, s, line, o);
      const row = { an, prof: star, proj, stat: s, line, opp: L.ratings['1'], oppTeam: { short: 'Hawks', abbr: 'ATL' }, oppId: '1', nTeams: 30, tc, missingNames: 'Someone Out', favShort: 'Magic', absMargin: 12 };
      const rs = X.propReasons(row);
      rs.pros.concat(rs.cons, rs.info).forEach((r) => noBad(r.text, s));
      noBad(X.propBottomLine(an), 'bottom');
      if (o.market) assert.ok(rs.pros.concat(rs.cons, rs.info).some((r) => /DraftKings' odds point to/.test(r.text)), 'market reason');
    });
  });
  X.gameReasons(game, pred, tc, null).forEach((t) => noBad(t, 'game'));
  noBad(JSON.stringify(X.spreadText(game, pred, pred.markets.spread)), 'spread');
  noBad(JSON.stringify(X.totalText(game, pred, pred.markets.total)), 'total');
  noBad(JSON.stringify(X.mlText(game, pred, pred.markets.ml)), 'ml');
});
test('charts render', () => {
  const bars = CH.gameBars(star.games, 'pts', 20.5, { n: 10 });
  assert.ok(/<svg/.test(bars) && (bars.match(/class="bar-g"/g) || []).length === 10); noBad(bars.replace(/data-tip="[^"]*"/g, ''), 'bars');
  assert.ok(/<svg/.test(CH.spark(star.games, 'reb', 5.5)));
  const fl = CH.flow(sumLive.flow, { abbr: 'WSH' }, { abbr: 'MIL' }, { live: true }); assert.ok(/line-home/.test(fl)); noBad(fl, 'flow');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
