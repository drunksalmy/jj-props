/* JJ Props — model.js
 * The prediction engine. Everything here is plain math on the stats ESPN provides.
 *
 *  TEAM GAMES
 *    team strength  = points scored / allowed per game (this season, blended with last season early on)
 *    expected score = league average + our offense edge + their defense weakness ± home court
 *    adjustments    = missing players (injuries), tired legs (2nd night of a back-to-back)
 *    win chance     = normal curve around the expected margin (NBA margins vary ~12 pts)
 *
 *  PLAYER PROPS (points, rebounds, assists, 3-pointers, and the combos PR = pts+reb, PA = pts+ast, AR = ast+reb, PRA = all three)
 *    projection     = expected minutes × per-minute production × matchup × home/away × teammate injuries
 *    over/under %   = negative-binomial curve around the projection, width from the player's own game-to-game swings
 *    the market     = our chance blends our model with the market's view: DraftKings' own odds when it has a
 *                     line; 50/50 at a line you typed (books set lines near even); his usual average for an
 *                     estimated line. Half and half normally; early in a player's season (and on a new team) the
 *                     book counts 80–90%. Sportsbooks are usually close to right — this keeps edges honest.
 *
 *  LIVE
 *    win chance     = current margin + pre-game edge for the time left (uncertainty shrinks as the clock runs)
 *    live props     = stat so far + expected production in the minutes he has left
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var HE = (root.HE = root.HE || {});
  var U = HE.util;
  var M = (HE.model = {});

  var C = (M.CONFIG = {
    HCA: 2.4,                // home-court advantage (points)
    MARGIN_SD: 12.0,         // how much final margins swing around the expectation
    TOTAL_SD: 17.5,          // how much total points swing
    PRIOR_GAMES: 12,         // last season counts like this many games of this season
    PRIOR_REGRESS: 0.65,     // keep 65% of last season's edge (rosters change in summer)
    LG_PRIOR_TEAMGAMES: 60,
    B2B_MARGIN: 1.2,         // margin lost on the 2nd night of a back-to-back
    B2B_MIN_FACTOR: 0.97,
    ESPN_BLEND: 0.4,         // weight on ESPN's own matchup predictor when it is available
    BREAKEVEN: 0.5238,       // win rate needed to profit at standard -110 odds
    MIN_DECAY: 0.88, RATE_DECAY: 0.96,
    MIN_PRIOR_GAMES: 5,      // last season's minutes count like 5 games of this season
    RATE_PRIOR_PREV_MIN: 300,// last season's per-minute production counts like ~10 games
    PROJ_UNCERT: 0.1,        // our projection itself can be ~10% off
    PREV_WEIGHT_MIN: 0.55, PREV_WEIGHT_RATE: 0.7, POST_WEIGHT: 0.6,
    RATE_PRIOR: { pts: 0.46, reb: 0.19, ast: 0.11, fg3m: 0.045 },
    RATE_PRIOR_MIN: 12,      // tiny pull toward league-typical rates (matters only for players with very few minutes)
    PHI_PRIOR: { pts: 2.0, reb: 1.3, ast: 1.3, fg3m: 1.05, pr: 2.2, pa: 2.2, ar: 1.5, pra: 2.3 },
    PROP_CALIB: 0.8,         // shrink prop chances toward 50/50 — honest about model error
    MKT_W: 0.5,              // weight on the market's view (sportsbook odds / even line / his usual average)
    MKT_W_EARLY: 0.8,        // ...before a player has games this season (our numbers are last season's)
    MKT_EARLY_GAMES: 12,     // ...easing back to MKT_W over his first ~12 games
    MKT_W_NEWTEAM: 0.9,      // new team this season: his old role tells us even less
    TEAM_CALIB: 0.6,         // team bets: trust the sportsbook more than our simple team model
    VIG: 0.0238,             // bookmaker margin on each side at standard odds
    STRONG: 0.08, GOOD: 0.045, LEAN: 0.02,              // prop edges
    TEAM_STRONG: 0.07, TEAM_GOOD: 0.045, TEAM_LEAN: 0.025,
    MIN_MINUTES_FOR_PROPS: 14,
    INJ_CAP: 6,              // most margin a team can lose to injuries (backups still play)
    CROWD_TRIM: 0.3, CROWD_MAX_CUT: 0.12,
    ESPN_BLEND_EARLY: 0.85,  // early season our team numbers are last season's — lean on ESPN's predictor
    EARLY_GAMES: 15          // ...until teams have played about this many games
  });

  M.STATS = ['pts', 'reb', 'ast', 'pr', 'pa', 'ar', 'pra', 'fg3m'];
  M.BASE_STATS = ['pts', 'reb', 'ast', 'fg3m'];
  /** combo props: the stats that get added together */
  M.COMBOS = { pr: ['pts', 'reb'], pa: ['pts', 'ast'], ar: ['ast', 'reb'], pra: ['pts', 'reb', 'ast'] };
  M.STAT_LABEL = { pts: 'Points', reb: 'Rebounds', ast: 'Assists', pr: 'Pts + Reb', pa: 'Pts + Ast', ar: 'Ast + Reb', pra: 'Pts + Reb + Ast', fg3m: '3-Pointers Made' };
  M.STAT_SHORT = { pts: 'PTS', reb: 'REB', ast: 'AST', pr: 'PR', pa: 'PA', ar: 'AR', pra: 'PRA', fg3m: '3PM' };
  M.MIN_BASE_FOR_PROP = { pts: 5, reb: 2, ast: 1.5, pr: 7, pa: 6.5, ar: 3.5, pra: 9, fg3m: 0.7 };

  M.val = function (g, s) {
    var parts = M.COMBOS[s];
    if (!parts) return g[s];
    var t = 0;
    for (var i = 0; i < parts.length; i++) t += g[parts[i]];
    return t;
  };

  M.injuryWeight = function (status) {
    var s = String(status || '').toLowerCase();
    if (!s) return 0;
    if (s.indexOf('out') >= 0 || s.indexOf('susp') >= 0 || s.indexOf('inactive') >= 0) return 1;
    if (s.indexOf('doubt') >= 0) return 0.75;
    if (s.indexOf('question') >= 0) return 0.4;
    if (s.indexOf('day') >= 0) return 0.35;
    if (s.indexOf('prob') >= 0) return 0.05;
    return 0.3;
  };
  M.isGTD = function (status) { var w = M.injuryWeight(status); return w > 0 && w < 1; };

  M.tier = function (edge, kind) {
    var t = kind === 'team' ? [C.TEAM_STRONG, C.TEAM_GOOD, C.TEAM_LEAN] : [C.STRONG, C.GOOD, C.LEAN];
    return edge >= t[0] ? 'strong' : edge >= t[1] ? 'good' : edge >= t[2] ? 'lean' : null;
  };

  /* ------------------------------------------------------------------ */
  /* league + team strength                                             */
  /* ------------------------------------------------------------------ */
  M.buildLeague = function (stCur, stPrev) {
    var tc = (stCur && stCur.teams) || {}, tp = (stPrev && stPrev.teams) || {};
    function lgOf(teams) {
      var pts = 0, gp = 0;
      Object.keys(teams).forEach(function (k) {
        var t = teams[k];
        if (t.gp > 0 && Number.isFinite(t.ppg) && t.ppg > 0) { pts += t.ppg * t.gp; gp += t.gp; }
      });
      return { avg: gp ? pts / gp : NaN, gp: gp };
    }
    var lc = lgOf(tc), lp = lgOf(tp);
    var lgPrev = Number.isFinite(lp.avg) ? lp.avg : 114.5;
    var lg = Number.isFinite(lc.avg) ? (lc.avg * lc.gp + lgPrev * C.LG_PRIOR_TEAMGAMES) / (lc.gp + C.LG_PRIOR_TEAMGAMES) : lgPrev;
    var ids = {};
    Object.keys(tc).forEach(function (k) { ids[k] = 1; });
    Object.keys(tp).forEach(function (k) { ids[k] = 1; });
    var ratings = {};
    Object.keys(ids).forEach(function (id) {
      var c = tc[id], p = tp[id];
      var gp = c && c.gp > 0 && c.ppg > 0 ? c.gp : 0;
      var curOff = gp ? c.ppg - lc.avg : 0, curDef = gp ? c.oppg - lc.avg : 0;
      var pgp = p && p.gp > 0 && p.ppg > 0 ? p.gp : 0;
      var prOff = pgp ? C.PRIOR_REGRESS * (p.ppg - lgPrev) : 0, prDef = pgp ? C.PRIOR_REGRESS * (p.oppg - lgPrev) : 0;
      var K = pgp ? C.PRIOR_GAMES : 4;   // no history → pull toward average
      var relOff = (gp * curOff + K * prOff) / (gp + K), relDef = (gp * curDef + K * prDef) / (gp + K);
      var info = c || p || {};
      ratings[id] = {
        id: id, abbr: info.abbr, name: info.name, short: info.short,
        gp: gp, prevGp: pgp, relOff: relOff, relDef: relDef,
        off: lg + relOff, def: lg + relDef, net: relOff - relDef,
        paceRel: (relOff + relDef) / (2 * lg),
        cur: c || null, prev: p || null, rank: {}
      };
    });
    var arr = Object.keys(ratings).map(function (k) { return ratings[k]; });
    function rank(key, desc, name) {
      arr.slice().sort(function (a, b) { return desc ? b[key] - a[key] : a[key] - b[key]; })
        .forEach(function (t, i) { t.rank[name || key] = i + 1; });
    }
    rank('off', true, 'off');          // 1 = scores the most
    rank('def', false, 'def');         // 1 = allows the fewest (best defense)
    rank('def', true, 'allows');       // 1 = allows the most (easiest matchup)
    rank('net', true, 'net');
    rank('paceRel', true, 'pace');     // 1 = highest-scoring games
    return { lg: lg, lgPrev: lgPrev, ratings: ratings, nTeams: arr.length, curTeamGames: lc.gp };
  };

  /* ------------------------------------------------------------------ */
  /* player profiles                                                     */
  /* ------------------------------------------------------------------ */
  M.buildProfile = function (who, logsCur, logsPrev, seasons, nowMs) {
    var cur = seasons.cur, prev = seasons.prev;
    nowMs = nowMs || Date.now();
    var seen = {}, games = [];
    [].concat(logsCur || [], logsPrev || []).forEach(function (g) {
      if (!g || seen[g.id]) return;
      seen[g.id] = 1;
      if (g.min > 0) games.push(g);
    });
    games.sort(function (a, b) { return b.ms - a.ms; });
    var p = {
      id: who.id, name: who.name, short: who.short, pos: who.pos, headshot: who.headshot, teamId: who.teamId,
      status: who.status || null, statusDetail: who.statusDetail || '',
      curSeason: cur, prevSeason: prev, games: games
    };
    var curG = games.filter(function (g) { return g.season === cur; });
    var prevG = games.filter(function (g) { return g.season === prev && g.st === 'reg'; });
    p.nCur = curG.length; p.nPrev = prevG.length;
    p.lastMs = games.length ? games[0].ms : 0;
    p.daysSinceLast = p.lastMs ? (nowMs - p.lastMs) / 86400000 : Infinity;
    if (!games.length) { p.empty = true; p.minBase = 0; return p; }
    // changed teams since last season? (his old role may not carry over)
    var lastOld = games.filter(function (g) { return g.season !== cur; })[0];
    p.prevTeamId = lastOld && lastOld.teamId ? String(lastOld.teamId) : null;
    p.newTeam = !!(p.prevTeamId && who.teamId && p.prevTeamId !== String(who.teamId) && p.nCur < 10);
    // missed (nearly) all of last season — e.g. a long injury
    p.longAbsence = p.daysSinceLast > 300;

    // MINUTES: recent games of THIS season, anchored to last season's full-season average
    // (the end of last season is distorted by resting starters, tanking and playoffs)
    var mCur = NaN, wS = 0, mS = 0;
    curG.slice(0, 20).forEach(function (g, i) {
      var w = Math.pow(C.MIN_DECAY, i) * (g.st === 'post' ? C.POST_WEIGHT : 1);
      wS += w; mS += w * g.min;
    });
    if (wS) mCur = mS / wS;
    var mPrev = prevG.length ? U.mean(prevG.map(function (g) { return g.min; })) : NaN;
    if (Number.isFinite(mCur) && Number.isFinite(mPrev)) p.minBase = (p.nCur * mCur + C.MIN_PRIOR_GAMES * mPrev) / (p.nCur + C.MIN_PRIOR_GAMES);
    else if (Number.isFinite(mCur)) p.minBase = mCur;
    else if (Number.isFinite(mPrev)) p.minBase = mPrev;
    else p.minBase = U.mean(games.slice(0, 10).map(function (g) { return g.min; }));   // only playoff/other games

    // PER-MINUTE PRODUCTION: this season (recent games count a bit more) blended with last season
    p.rates = {};
    var rgC = curG.filter(function (g) { return g.min >= 4; }).slice(0, 40);
    var rgP = prevG.filter(function (g) { return g.min >= 4; });
    var rgO = (rgC.length || rgP.length) ? [] : games.filter(function (g) { return g.min >= 4; });
    M.BASE_STATS.forEach(function (s) {
      var ws = 0, wm = 0;
      rgC.forEach(function (g, i) { var w = Math.pow(C.RATE_DECAY, i); ws += w * g[s]; wm += w * g.min; });
      var ps = 0, pm = 0;
      rgP.concat(rgO).forEach(function (g) { ps += g[s]; pm += g.min; });
      var prevRate = pm > 0 ? ps / pm : C.RATE_PRIOR[s];
      var priorMin = pm > 0 ? Math.min(pm, C.RATE_PRIOR_PREV_MIN) : C.RATE_PRIOR_MIN;
      p.rates[s] = (ws + prevRate * priorMin) / (wm + priorMin);
    });

    p.phi = {};
    var dg = games.filter(function (g) { return g.min >= 10; }).slice(0, 30);
    M.STATS.forEach(function (s) {
      var vals = dg.map(function (g) { return M.val(g, s); });
      var n = vals.length, prior = C.PHI_PRIOR[s], obs = prior;
      if (n >= 4) {
        var m = U.mean(vals), v = U.variance(vals);
        if (m > 0.3 && Number.isFinite(v)) obs = v / m;
      }
      p.phi[s] = U.clamp((n * obs + 10 * prior) / (n + 10), 0.8, 4.5);
    });

    function avgOf(arr, s) {
      return arr.length ? U.mean(arr.map(function (g) { return s === 'min' ? g.min : M.val(g, s); })) : NaN;
    }
    p.avg = {}; p.base = {};
    M.STATS.concat(['min']).forEach(function (s) {
      p.avg[s] = {
        l5: avgOf(games.slice(0, 5), s), l10: avgOf(games.slice(0, 10), s), l20: avgOf(games.slice(0, 20), s),
        cur: avgOf(curG, s), prev: avgOf(prevG, s)
      };
      var nC = curG.length, K = nC >= 15 ? 0 : 8;
      var mC = nC ? p.avg[s].cur : 0;
      var mP = prevG.length ? p.avg[s].prev : (nC ? mC : NaN);
      p.base[s] = (Number.isFinite(mP) || nC) ? (nC * mC + K * (Number.isFinite(mP) ? mP : mC)) / (nC + K) : NaN;
    });

    function gmsc(g) {
      return g.pts + 0.4 * g.fgm - 0.7 * g.fga - 0.4 * (g.fta - g.ftm) + 0.4 * g.reb + g.stl + 0.7 * g.ast + 0.7 * g.blk - 0.4 * g.pf - g.tov;
    }
    var wv = 0, wmin = 0;
    games.slice(0, 30).forEach(function (g, i) {
      var w = Math.pow(0.95, i) * (g.season !== cur ? 0.7 : 1);
      wv += w * gmsc(g); wmin += w * g.min;
    });
    p.gmsc36 = wmin > 0 ? 36 * wv / wmin : 0;
    p.impact = U.clamp((p.gmsc36 - 8) * (p.minBase / 36) * 0.33, 0, 7);
    p.perGame = {};
    M.BASE_STATS.forEach(function (s) { p.perGame[s] = p.rates[s] * p.minBase; });
    return p;
  };

  /**
   * How a team is affected by its missing players, and how its 240 minutes get shared.
   *  - marginLoss: points of margin lost to injuries (with diminishing returns — backups play)
   *  - projMin: expected minutes for each available player (missing minutes go mostly to
   *    rotation players with room to play more; a crowded roster cuts the end of the bench first)
   */
  /**
   * opts.partial: only the key players are loaded so far (the ones with sportsbook lines and the injured).
   * Then we don't reshuffle minutes — that needs the whole roster.
   */
  M.teamContext = function (profiles, teamGamesCur, opts) {
    var partial = !!(opts && opts.partial);
    var out = {
      marginLoss: 0, rawLoss: 0, missingMin: 0, missingShare: { pts: 0, reb: 0, ast: 0, fg3m: 0 },
      missing: [], projMin: {}, minNote: {}
    };
    var miss = { pts: 0, reb: 0, ast: 0, fg3m: 0 }, tot = { pts: 0, reb: 0, ast: 0, fg3m: 0 };
    var pool = [];
    profiles.forEach(function (p) {
      if (!p || p.empty || !(p.minBase > 0)) return;
      var w = M.injuryWeight(p.status);
      if (p.minBase >= 3) pool.push({ p: p, w: w });
      if (p.minBase < 6) return;
      var avail;
      if (teamGamesCur >= 3) avail = U.clamp(p.nCur / teamGamesCur, 0, 1);
      else avail = U.clamp(p.nPrev / 45, 0.25, 1);
      M.BASE_STATS.forEach(function (s) { tot[s] += p.perGame[s] * avail; });
      if (w > 0) {
        M.BASE_STATS.forEach(function (s) { miss[s] += p.perGame[s] * w * avail; });
        out.rawLoss += p.impact * w * avail;
        out.missingMin += p.minBase * w * avail;
        out.missing.push({ id: p.id, name: p.name, short: p.short, status: p.status, detail: p.statusDetail, w: w, impact: p.impact * w * avail, min: p.minBase, pts: p.perGame.pts });
      }
    });
    out.marginLoss = C.INJ_CAP * (1 - Math.exp(-out.rawLoss / C.INJ_CAP));
    M.BASE_STATS.forEach(function (s) { out.missingShare[s] = tot[s] > 0 ? Math.min(0.35, miss[s] / tot[s]) : 0; });
    out.missing.sort(function (a, b) { return b.impact - a.impact; });

    // share the 240 minutes
    pool.sort(function (a, b) { return b.p.minBase - a.p.minBase; });
    if (partial) {
      pool.forEach(function (x) { if (x.w < 1) out.projMin[x.p.id] = x.p.minBase; });
      return out;
    }
    var expSum = 0;
    pool.forEach(function (x) { expSum += x.p.minBase * (1 - x.w); });
    if (expSum <= 240) {
      var deficit = (240 - expSum) * 0.8, head = 0;
      pool.forEach(function (x) { if (x.w < 1) head += (1 - x.w) * x.p.minBase * Math.max(0, 40 - x.p.minBase); });
      pool.forEach(function (x) {
        if (x.w >= 1) return;
        var extra = head > 0 ? Math.min(8, deficit * x.p.minBase * Math.max(0, 40 - x.p.minBase) / head) : 0;
        out.projMin[x.p.id] = Math.min(40, x.p.minBase + extra);
        if (extra >= 0.8) out.minNote[x.p.id] = { k: 'minUp', v: extra };
      });
    } else {
      // more usual minutes than the game has (new signings, deep roster). Mostly that means someone
      // won't play at all (and props on players who don't play are refunded), so only a small trim,
      // mostly on the bench and never more than 12% for anyone — we don't know the rotation yet
      var excess = (expSum - 240) * C.CROWD_TRIM, wsum = 0;
      pool.forEach(function (x) { if (x.w < 1) { x.cw = x.p.minBase * Math.pow(1 - x.p.minBase / 48, 2); wsum += x.cw; } });
      pool.forEach(function (x) {
        if (x.w >= 1) return;
        var cut = wsum > 0 ? Math.min(C.CROWD_MAX_CUT * x.p.minBase, excess * x.cw / wsum) : 0;
        out.projMin[x.p.id] = x.p.minBase - cut;
        if (cut >= 1.5) out.minNote[x.p.id] = { k: 'minDown', v: cut };
      });
    }
    return out;
  };

  /* ------------------------------------------------------------------ */
  /* game predictions                                                    */
  /* ------------------------------------------------------------------ */
  M.predictGame = function (game, league, extra) {
    extra = extra || {};
    var H = league.ratings[game.home.id], A = league.ratings[game.away.id];
    if (!H || !A) return null;
    var hca = game.neutral ? 0 : C.HCA;
    var anchor = league.anchor || 0;   // tonight's scoring level, read from the sportsbooks' totals
    var home = league.lg + anchor + H.relOff + A.relDef + hca / 2;
    var away = league.lg + anchor + A.relOff + H.relDef - hca / 2;
    var injH = extra.injHome ? extra.injHome.marginLoss : 0, injA = extra.injAway ? extra.injAway.marginLoss : 0;
    home += (injA - injH) / 2; away += (injH - injA) / 2;
    if (extra.b2bHome) { home -= C.B2B_MARGIN / 2; away += C.B2B_MARGIN / 2; }
    if (extra.b2bAway) { away -= C.B2B_MARGIN / 2; home += C.B2B_MARGIN / 2; }
    var marginModel = home - away;
    var pModel = U.normCdf(marginModel / C.MARGIN_SD);
    var pEspn = extra.predictor && Number.isFinite(extra.predictor.home) ? extra.predictor.home : null;
    var early = Math.max(0, 1 - Math.min(H.gp, A.gp) / C.EARLY_GAMES);
    var wEspn = C.ESPN_BLEND + (C.ESPN_BLEND_EARLY - C.ESPN_BLEND) * early;
    var pHome = pEspn != null ? (1 - wEspn) * pModel + wEspn * pEspn : pModel;
    pHome = U.clamp(pHome, 0.02, 0.98);
    var margin = C.MARGIN_SD * U.normInv(pHome);
    var total = home + away;
    var pred = {
      home: (total + margin) / 2, away: (total - margin) / 2, total: total, margin: margin,
      marginModel: marginModel, pHome: pHome, pModel: pModel, pEspn: pEspn,
      hca: hca, injH: injH, injA: injA, b2bHome: !!extra.b2bHome, b2bAway: !!extra.b2bAway,
      H: H, A: A, lg: league.lg, early: early, wEspn: pEspn != null ? wEspn : 0
    };
    pred.winner = M.winnerPick(pred);
    pred.markets = M.gameMarkets(pred, extra.odds);
    return pred;
  };

  /**
   * Where tonight's sportsbooks set the totals vs our raw numbers — shifts the league scoring
   * level so a league-wide trend (more points this year) doesn't masquerade as an UNDER edge.
   */
  M.marketAnchor = function (games, league) {
    var sum = 0, n = 0;
    games.forEach(function (x) {
      var g = x.g || x, o = x.odds || g.odds;
      var H = league.ratings[g.home.id], A = league.ratings[g.away.id];
      if (!o || !Number.isFinite(o.total) || !H || !A) return;
      var raw = 2 * league.lg + H.relOff + A.relDef + A.relOff + H.relDef;
      sum += (o.total - raw) / 2; n++;
    });
    return n ? U.clamp(sum / (n + 2), -6, 6) : 0;
  };

  M.winnerPick = function (pred) {
    var side = pred.pHome >= 0.5 ? 'home' : 'away';
    var p = Math.max(pred.pHome, 1 - pred.pHome);
    return { side: side, p: p, strength: p >= 0.72 ? 'strong' : p >= 0.62 ? 'good' : p >= 0.54 ? 'lean' : 'tossup' };
  };

  M.gameMarkets = function (pred, odds) {
    var out = { ml: null, spread: null, total: null };
    if (!odds) return out;
    var CAL = C.TEAM_CALIB * (1 - 0.5 * (pred.early || 0));   // trust our team model less in the first weeks
    var ih = U.amToProb(odds.homeML), ia = U.amToProb(odds.awayML);
    if (Number.isFinite(ih) && Number.isFinite(ia)) {
      var fair = ih / (ih + ia);
      var pAdj = fair + CAL * (pred.pHome - fair);
      var eH = pAdj - ih, eA = (1 - pAdj) - ia;
      var mside = eH >= eA ? 'home' : 'away', medge = Math.max(eH, eA);
      out.ml = { side: mside, edge: medge, strength: M.tier(medge, 'team'), pHome: pAdj, impliedHome: ih, impliedAway: ia, fairHome: fair, homeML: odds.homeML, awayML: odds.awayML };
    }
    if (Number.isFinite(odds.spread)) {
      var S = odds.spread, sd = C.MARGIN_SD, m = pred.margin, pH, pPush = 0;
      if (Number.isInteger(S)) {
        var hi = U.normCdf((-S + 0.5 - m) / sd), lo = U.normCdf((-S - 0.5 - m) / sd);
        pPush = hi - lo; pH = 1 - hi;
      } else pH = U.normCdf((m + S) / sd);
      var pA = Math.max(0, 1 - pH - pPush), cH = 0.5 + CAL * (pH / Math.max(1e-9, pH + pA) - 0.5), cA = 1 - cH;
      var beH = U.amToProb(odds.homeSpreadOdds) || C.BREAKEVEN, beA = U.amToProb(odds.awaySpreadOdds) || C.BREAKEVEN;
      var sH = cH - beH, sA = cA - beA, sside = sH >= sA ? 'home' : 'away', sedge = Math.max(sH, sA);
      out.spread = { line: S, side: sside, edge: sedge, strength: M.tier(sedge, 'team'), pHome: cH, pAway: cA, pPush: pPush, beH: beH, beA: beA };
    }
    if (Number.isFinite(odds.total)) {
      var L = odds.total, tsd = C.TOTAL_SD, pO, tPush = 0;
      if (Number.isInteger(L)) {
        var thi = U.normCdf((L + 0.5 - pred.total) / tsd), tlo = U.normCdf((L - 0.5 - pred.total) / tsd);
        tPush = thi - tlo; pO = 1 - thi;
      } else pO = 1 - U.normCdf((L - pred.total) / tsd);
      var pU = Math.max(0, 1 - pO - tPush), cO = 0.5 + CAL * (pO / Math.max(1e-9, pO + pU) - 0.5), cU = 1 - cO;
      var beO = U.amToProb(odds.overOdds) || C.BREAKEVEN, beU = U.amToProb(odds.underOdds) || C.BREAKEVEN;
      var tO = cO - beO, tU = cU - beU, tside = tO >= tU ? 'over' : 'under', tedge = Math.max(tO, tU);
      out.total = { line: L, side: tside, edge: tedge, strength: M.tier(tedge, 'team'), pOver: cO, pUnder: cU, pPush: tPush, beO: beO, beU: beU };
    }
    return out;
  };

  /* ------------------------------------------------------------------ */
  /* player props                                                        */
  /* ------------------------------------------------------------------ */
  M.projectPlayer = function (p, ctx) {
    var notes = [];
    var mins = p.minBase;
    if (ctx.tc && ctx.tc.projMin && ctx.tc.projMin[p.id] != null) {
      mins = ctx.tc.projMin[p.id];
      if (ctx.tc.minNote[p.id]) notes.push(ctx.tc.minNote[p.id]);
    }
    if ((ctx.teamGamesCur >= 3 && p.nCur === 0 && p.games.length) || p.longAbsence) {
      mins *= 0.85; notes.push({ k: 'returning', long: !!p.longAbsence });
    }
    if (ctx.b2b) { var cut = mins * (1 - C.B2B_MIN_FACTOR); mins -= cut; notes.push({ k: 'b2b', v: cut }); }
    if (ctx.absMargin > 9 && p.minBase >= 26) {
      var bc = Math.min(3, 0.25 * (ctx.absMargin - 9));
      mins -= bc; notes.push({ k: 'blowout', v: bc });
    }
    mins = U.clamp(mins, 0, 42);
    var lg = ctx.lg;
    var oppDefRel = (ctx.opp.def - lg) / lg;
    var paceRel = (ctx.team.paceRel + ctx.opp.paceRel) / 2;
    var f = { pts: 1 + 0.85 * oppDefRel, ast: 1 + 0.55 * oppDefRel, fg3m: 1 + 0.65 * oppDefRel, reb: 1 + 0.6 * paceRel };
    var ha = ctx.neutral ? 1 : (ctx.home ? 1.012 : 0.988);
    var share = (ctx.tc && ctx.tc.missingShare) || {};
    var bw = { pts: 0.25, reb: 0.2, ast: 0.2, fg3m: 0.2 };
    var out = { mins: mins, notes: notes, stats: {}, oppDefRel: oppDefRel, paceRel: paceRel, f: f, ha: ha };
    M.BASE_STATS.forEach(function (s) {
      var boost = 1 + bw[s] * (share[s] || 0);
      var rate = p.rates[s] * f[s] * ha * boost;
      var mean = mins * rate;
      out.stats[s] = { mean: mean, var: Math.max(mean, 0.05) * p.phi[s] + Math.pow(C.PROJ_UNCERT * mean, 2), boost: boost, rate: rate };
    });
    // combos (PR, PA, PRA): add up the parts; the swing comes from his own game-to-game swings in that total
    Object.keys(M.COMBOS).forEach(function (s) {
      var mean = 0, rate = 0;
      M.COMBOS[s].forEach(function (k) { mean += out.stats[k].mean; rate += out.stats[k].rate; });
      var phi = (p.phi && p.phi[s]) || C.PHI_PRIOR[s];
      out.stats[s] = { mean: mean, var: Math.max(mean, 0.05) * phi + Math.pow(C.PROJ_UNCERT * mean, 2), rate: rate, boost: out.stats.pts.boost };
    });
    return out;
  };

  /**
   * Estimated line when we don't have the sportsbook's: the .5 line that makes his usual
   * average a coin flip (that's how books set lines). Rounding alone never creates a "pick".
   */
  M.defaultLine = function (p, stat) {
    var b = p && p.base ? p.base[stat] : NaN;
    if (!Number.isFinite(b) || b <= 0) return NaN;
    var phi = (p.phi && p.phi[stat]) || C.PHI_PRIOR[stat];
    var v = b * phi + Math.pow(C.PROJ_UNCERT * b, 2);
    var best = NaN, bestD = Infinity;
    for (var L = Math.max(0.5, Math.floor(b) - 1.5); L <= Math.floor(b) + 1.5; L += 1) {
      var d = Math.abs(U.probLine(b, v, L).over - 0.5);
      if (d < bestD - 1e-9) { bestD = d; best = L; }
    }
    return best;
  };

  M.hitRates = function (p, stat, line, oppId) {
    function rate(arr) {
      if (!arr.length) return null;
      var over = 0, push = 0;
      arr.forEach(function (g) { var x = M.val(g, stat); if (x > line) over++; else if (x === line) push++; });
      return { over: over, push: push, n: arr.length, pct: over / arr.length };
    }
    var g = p.games || [];
    return {
      l5: rate(g.slice(0, 5)), l10: rate(g.slice(0, 10)), l20: rate(g.slice(0, 20)),
      cur: rate(g.filter(function (x) { return x.season === p.curSeason; })),
      prev: rate(g.filter(function (x) { return x.season === p.prevSeason && x.st === 'reg'; })),
      h2h: oppId ? rate(g.filter(function (x) { return x.oppId === oppId; }).slice(0, 8)) : null
    };
  };

  /** chance of over/under if he just plays to his usual average (how a book would price the line) */
  M.baseProb = function (p, stat, line) {
    var b = p && p.base ? p.base[stat] : NaN;
    if (!Number.isFinite(b) || b <= 0) return null;
    var phi = (p.phi && p.phi[stat]) || C.PHI_PRIOR[stat];
    var pr = U.probLine(b, b * phi + Math.pow(C.PROJ_UNCERT * b, 2), line);
    var d = Math.max(1e-9, pr.over + pr.under);
    return { over: pr.over / d, under: pr.under / d };
  };

  /** over chance (pushes left out) for a given mean, using this player's own game-to-game spread */
  function overAt(p, stat, mu, line) {
    var phi = (p.phi && p.phi[stat]) || C.PHI_PRIOR[stat];
    var v = Math.max(mu, 0.05) * phi + Math.pow(C.PROJ_UNCERT * mu, 2);
    var r = U.probLine(mu, v, line);
    return r.over / Math.max(1e-9, r.over + r.under);
  }

  /**
   * What a sportsbook's line + odds say he'll average: the mean that makes the book's no-vig
   * over chance come out right. ("DraftKings' price implies about 22.4 points.")
   */
  M.marketMean = function (p, stat, line, pOver) {
    if (!(pOver > 0.02 && pOver < 0.98) || !Number.isFinite(line)) return NaN;
    var lo = 0.01, hi = Math.max(6, line * 3 + 12);
    for (var i = 0; i < 45; i++) {
      var mid = (lo + hi) / 2;
      if (overAt(p, stat, mid, line) < pOver) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };

  /** a sportsbook's two prices → its fair (no-vig) over chance */
  M.noVigOver = function (overOdds, underOdds) {
    var po = U.amToProb(overOdds), pu = U.amToProb(underOdds);
    return po > 0 && pu > 0 ? po / (po + pu) : NaN;
  };

  /**
   * opts: oppId, gtd, estimated (no real line), overOdds/underOdds (prices for THIS line),
   *       market {line, over, under, book} (the sportsbook's line for this player & stat, if any)
   */
  M.analyzeProp = function (proj, p, stat, line, opts) {
    opts = opts || {};
    var s = proj.stats[stat];
    var pr = U.probLine(s.mean, s.var, line);
    var denom = Math.max(1e-9, pr.over + pr.under);
    var rawO = pr.over / denom;
    // the market's view of this line:
    //   DraftKings line → its no-vig odds (moved to your line if you typed a different one)
    //   your own line   → about 50/50 (that's how books set lines)
    //   estimated line  → what his usual average says
    var mk = opts.market, mktO = NaN, mktMean = NaN, nv = NaN, mSrc = null;
    var q = opts.estimated ? M.baseProb(p, stat, line) : null;
    if (mk && Number.isFinite(mk.line)) {
      nv = M.noVigOver(mk.over, mk.under);
      mktMean = M.marketMean(p, stat, mk.line, nv);
      if (Number.isFinite(mktMean)) { mktO = Math.abs(mk.line - line) < 1e-9 ? nv : overAt(p, stat, mktMean, line); mSrc = 'book'; }
    }
    if (!Number.isFinite(mktO) && !opts.estimated) { mktO = 0.5; mSrc = 'line'; }
    if (!Number.isFinite(mktO) && q) { mktO = q.over; mSrc = 'avg'; }
    // early in his season (and on a new team) our numbers are mostly last season's → trust the market more
    var W = C.MKT_W;
    if (mSrc === 'book' || mSrc === 'line') {
      var early = U.clamp(1 - (p.nCur || 0) / C.MKT_EARLY_GAMES, 0, 1);
      W = C.MKT_W + (C.MKT_W_EARLY - C.MKT_W) * early;
      if (p.newTeam) W = Math.max(W, C.MKT_W_NEWTEAM);
    }
    var cO = Number.isFinite(mktO) ? W * mktO + (1 - W) * rawO : 0.5 + C.PROP_CALIB * (rawO - 0.5);
    cO = U.clamp(cO, 0.01, 0.99);
    var cU = 1 - cO;
    var beO, beU;
    if (opts.estimated) {
      // no real line: assume the book prices it fairly from his average, plus its margin
      var fairO = q ? q.over : 0.5;
      beO = fairO + C.VIG; beU = (1 - fairO) + C.VIG;
    } else {
      beO = U.amToProb(opts.overOdds) || C.BREAKEVEN;
      beU = U.amToProb(opts.underOdds) || C.BREAKEVEN;
    }
    var eO = cO - beO, eU = cU - beU;
    var side = eO >= eU ? 'over' : 'under', edge = Math.max(eO, eU);
    var strength = M.tier(edge, 'prop');
    var caution = [];
    if (p.games.length < 6) { caution.push('fewData'); if (strength) strength = 'lean'; }
    // without a real line we can't promise a big edge against an actual sportsbook
    if (opts.estimated && strength === 'strong') strength = 'good';
    if (p.newTeam) {
      caution.push('newTeam');
      if (strength === 'strong') strength = 'good';
      if (opts.estimated && strength) strength = 'lean';
    }
    if (opts.gtd) { caution.push('gtd'); if (strength === 'strong') strength = 'good'; }
    if (proj.notes.some(function (n) { return n.k === 'returning'; })) { caution.push('returning'); if (strength === 'strong') strength = 'good'; }
    return {
      stat: stat, line: line, mean: s.mean, sd: Math.sqrt(s.var), estimated: !!opts.estimated,
      pOver: pr.over, pUnder: pr.under, pPush: pr.push, cOver: cO, cUnder: cU,
      rawOver: rawO, mktOver: mktO, mktMean: mktMean, mktSrc: mSrc, mktW: Number.isFinite(mktO) ? W : 0, market: mk || null, priced: !opts.estimated && Number.isFinite(U.amToProb(opts.overOdds)),
      side: side, edge: edge, strength: strength, beO: beO, beU: beU, caution: caution,
      hr: M.hitRates(p, stat, line, opts.oppId)
    };
  };

  /* ------------------------------------------------------------------ */
  /* live                                                                */
  /* ------------------------------------------------------------------ */
  M.liveGame = function (pred, live, odds) {
    var post = live.state === 'post';
    var rem = post ? 0 : U.remainingSec(live.period, live.clockSec);
    var el = U.elapsedSec(live.period, live.clockSec);
    var f = rem / 2880;
    var mNow = live.homeScore - live.awayScore;
    var preM = pred ? pred.margin : 0;
    var expM = mNow + preM * f;
    var sd = Math.max(0.6, C.MARGIN_SD * Math.sqrt(f));
    var pHome = post ? (mNow > 0 ? 1 : 0) : U.normCdf(expM / sd);
    var preH = (pred ? pred.home : 114) / 2880, preA = (pred ? pred.away : 114) / 2880;
    var w = el >= 360 ? Math.min(0.4, 0.5 * el / 2880) : 0;
    var curH = el > 0 ? live.homeScore / el : preH, curA = el > 0 ? live.awayScore / el : preA;
    var rH = (1 - w) * preH + w * curH, rA = (1 - w) * preA + w * curA;
    var out = {
      rem: rem, el: el, f: f, mNow: mNow, expMargin: expM, sd: sd, pHome: pHome,
      projHome: live.homeScore + rH * rem, projAway: live.awayScore + rA * rem
    };
    out.projTotal = out.projHome + out.projAway;
    if (odds && Number.isFinite(odds.spread)) {
      var x = mNow + odds.spread;
      out.pHomeCover = post ? (x > 0 ? 1 : x === 0 ? 0.5 : 0) : U.normCdf((expM + odds.spread) / sd);
    }
    if (odds && Number.isFinite(odds.total)) {
      var tsd = Math.max(0.6, C.TOTAL_SD * Math.sqrt(f));
      var tot = live.homeScore + live.awayScore;
      out.pOver = post ? (tot > odds.total ? 1 : 0) : 1 - U.normCdf((odds.total - out.projTotal) / tsd);
    }
    return out;
  };

  M.livePlayer = function (proj, prof, box, live, stat, line) {
    var cur = M.val(box, stat);
    var res = { cur: cur, min: box.min, pf: box.pf, line: line };
    if (live.state === 'post') {
      res.final = true; res.hit = cur > line; res.push = cur === line;
      res.pOver = res.hit ? 1 : 0; res.pUnder = (!res.hit && !res.push) ? 1 : 0;
      res.projFinal = cur;
      return res;
    }
    var remGame = U.remainingSec(live.period, live.clockSec) / 60;
    var share = U.clamp(proj.mins / 48, 0, 0.92);
    var remMin = share * remGame;
    if (box.pf >= 6 || box.ejected) remMin = 0;
    else if (box.pf >= 5) remMin *= 0.7;
    else if (box.pf >= 4 && live.period <= 3) remMin *= 0.85;
    var margin = Math.abs(live.homeScore - live.awayScore);
    if ((live.period >= 4 && margin >= 18) || (live.period === 3 && margin >= 26)) remMin *= proj.mins >= 26 ? 0.45 : 1.25;
    var rate = proj.stats[stat].rate;
    if (box.min >= 10) rate = 0.8 * rate + 0.2 * (cur / box.min);
    var remMean = rate * remMin;
    var phi = (prof.phi && prof.phi[stat]) || 1.5;
    res.remMin = remMin; res.remMean = remMean; res.projFinal = cur + remMean;
    res.need = Math.floor(line) + 1 - cur;
    if (cur > line) { res.hit = true; res.pOver = 1; res.pUnder = 0; res.pPush = 0; }
    else {
      var pr = U.probLine(remMean, Math.max(remMean, 0.01) * phi, line - cur);
      res.pOver = pr.over; res.pUnder = pr.under; res.pPush = pr.push;
    }
    return res;
  };
})();
