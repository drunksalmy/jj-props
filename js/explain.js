/* JJ Props — explain.js
 * Turns the numbers into short, plain-English reasons anyone can follow.
 * Every pick gets: a verdict, a "you win if…" sentence, the reasons for it,
 * the risks against it, and a bottom line comparing our chance with the break-even chance.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var HE = (root.HE = root.HE || {});
  var U = HE.util, M = HE.model;
  var X = (HE.explain = {});

  X.NOUN = { pts: 'points', reb: 'rebounds', ast: 'assists', pr: 'points + rebounds', pa: 'points + assists', pra: 'points + rebounds + assists', fg3m: '3-pointers' };
  X.NOUN1 = { pts: 'point', reb: 'rebound', ast: 'assist', pr: 'point or rebound', pa: 'point or assist', pra: 'point, rebound or assist', fg3m: '3-pointer' };
  X.VERB = { pts: 'scores', reb: 'grabs', ast: 'dishes out', pr: 'totals', pa: 'totals', pra: 'totals', fg3m: 'makes' };
  /** "PR = points + rebounds added together" — shown on combo props */
  X.comboNote = function (stat) {
    var parts = M.COMBOS && M.COMBOS[stat];
    if (!parts) return '';
    return M.STAT_SHORT[stat] + ' = ' + parts.map(function (k) { return X.NOUN[k]; }).join(' + ') + ', added together.';
  };
  /**
   * The parts of a combo projection, rounded to one decimal so they add up exactly to the rounded
   * total we show (10.14 + 1.54 = 11.68 → "10.1 + 1.6 = 11.7", never "10.1 + 1.5 = 11.7").
   */
  X.comboParts = function (proj, stat) {
    var parts = M.COMBOS && M.COMBOS[stat];
    if (!parts || !proj || !proj.stats || !proj.stats[stat]) return null;
    var raw = parts.map(function (k) { return proj.stats[k].mean * 10; });
    var fl = raw.map(Math.floor);
    var left = Math.round(proj.stats[stat].mean * 10) - fl.reduce(function (a, b) { return a + b; }, 0);
    raw.map(function (v, i) { return i; })
      .sort(function (a, b) { return (raw[b] - fl[b]) - (raw[a] - fl[a]); })
      .forEach(function (i) { if (left > 0) { fl[i]++; left--; } });
    return parts.map(function (k, i) { return { stat: k, v: fl[i] / 10 }; });
  };
  X.STRENGTH = { strong: 'Strong pick', good: 'Good pick', lean: 'Slight lean', tossup: 'Toss-up' };

  X.strengthLabel = function (s) { return X.STRENGTH[s] || 'No clear edge'; };

  /** "You win if Tatum scores 27 or more points." */
  X.winCondition = function (name, stat, side, line) {
    var who = U.lastName(name) || name, noun = X.NOUN[stat], verb = X.VERB[stat];
    if (M.COMBOS && M.COMBOS[stat]) {
      // "You win if Tatum's points + rebounds add up to 35 or more."
      var lead = 'You win if ' + X.poss(who) + ' ' + noun + ' add up to ';
      if (Number.isInteger(line)) {
        return lead + (side === 'over' ? (line + 1) + ' or more' : Math.max(0, line - 1) + ' or fewer') + '. Exactly ' + line + ' = money back.';
      }
      var kk = Math.floor(line) + 1;
      return lead + (side === 'over' ? kk + ' or more' : (kk - 1) + ' or fewer') + '.';
    }
    if (Number.isInteger(line)) {
      return side === 'over'
        ? 'You win if ' + who + ' ' + verb + ' ' + (line + 1) + ' or more ' + noun + '. Exactly ' + line + ' = money back.'
        : 'You win if ' + who + ' ' + verb + ' ' + Math.max(0, line - 1) + ' or fewer ' + noun + '. Exactly ' + line + ' = money back.';
    }
    var k = Math.floor(line) + 1;
    return side === 'over'
      ? 'You win if ' + who + ' ' + verb + ' ' + k + ' or more ' + noun + '.'
      : 'You win if ' + who + ' ' + verb + ' ' + (k - 1) + ' or fewer ' + noun + '.';
  };

  X.sideWord = function (side) { return side === 'over' ? 'OVER' : 'UNDER'; };
  /** "DraftKings' odds", "the sportsbook's odds" */
  X.poss = function (name) { name = String(name || 'the sportsbook'); return /s$/i.test(name) ? name + '\'' : name + '\'s'; };

  function teamWord(t) { return (t && (t.short || t.abbr || t.name)) || 'They'; }
  function earlyNote(r) { return r && r.gp < 5 ? ', mostly from last season' : ''; }

  /**
   * Reasons for/against a prop pick.
   * row = { an, prof, proj, stat, line, opp (rating), oppId, nTeams, tc (team context), missingNames, game, isHome, b2b, absMargin, favShort }
   * returns { pros:[], cons:[], info:[] } each item {text, w}
   */
  X.propReasons = function (row) {
    var an = row.an, p = row.prof, s = row.stat, line = row.line, side = an.side;
    var noun = X.NOUN[s], who = U.lastName(p.name) || p.name;
    var dir = side === 'over' ? 1 : -1;
    var pros = [], cons = [], info = [];
    function add(sign, text, w) {
      var item = { text: text, w: w || 1 };
      if (sign === 0) info.push(item);
      else if (sign * dir > 0) pros.push(item);
      else cons.push(item);
    }

    // combos: show how the total adds up ("12.4 points + 6.1 rebounds = 18.5 PR")
    var cp = X.comboParts(row.proj, s);
    if (cp) {
      add(0, 'How it adds up: ' + cp.map(function (x) { return x.v.toFixed(1) + ' ' + X.NOUN[x.stat]; }).join(' + ') + ' = ' + U.fmt1(an.mean) + ' ' + M.STAT_SHORT[s] + '.', 2);
    }

    // our projection vs the sportsbook's
    if (Number.isFinite(an.mktMean) && an.market) {
      var bk = an.market.book || 'The sportsbook';
      var gap = an.mean - an.mktMean;
      if (Math.abs(gap) >= Math.max(0.25, 0.04 * an.mktMean)) {
        add(gap > 0 ? 1 : -1, 'We project ' + U.fmt1(an.mean) + ' ' + noun + ' — ' + X.poss(bk) + ' odds point to about ' + U.fmt1(an.mktMean) + '.', 3.2 + Math.min(4, Math.abs(gap) / Math.max(1, an.mktMean) * 25));
      } else {
        add(0, 'We project ' + U.fmt1(an.mean) + ' ' + noun + ', close to what ' + X.poss(bk) + ' odds point to (' + U.fmt1(an.mktMean) + ').', 1);
      }
    }

    // recent form
    var a = p.avg[s] || {};
    var ref = (p.nCur >= 6 && Number.isFinite(a.cur)) ? a.cur : p.base[s];
    if (p.games.length >= 5 && Number.isFinite(a.l5) && ref > 0) {
      var d = (a.l5 - ref) / ref;
      if (d >= 0.1) add(1, 'Hot lately: ' + U.fmt1(a.l5) + ' ' + noun + ' a game over his last 5 (his usual: ' + U.fmt1(ref) + ').', 3 + d * 10);
      else if (d <= -0.1) add(-1, 'Cold lately: ' + U.fmt1(a.l5) + ' ' + noun + ' a game over his last 5 (his usual: ' + U.fmt1(ref) + ').', 3 - d * 10);
    }

    // hit rate
    var hr = (an.hr.l10 && an.hr.l10.n >= 6) ? an.hr.l10 : an.hr.l5;
    if (hr && hr.n >= 3) {
      var label = hr.n === 10 ? 'last 10 games' : 'last ' + hr.n + ' games';
      var overShare = hr.over / hr.n;
      if (side === 'over') {
        add(overShare >= 0.5 ? 1 : -1, 'Went over ' + U.fmtLine(line) + ' in ' + hr.over + ' of his ' + label + '.', 2 + Math.abs(overShare - 0.5) * 8);
      } else {
        var under = hr.n - hr.over - hr.push;
        add(under / hr.n >= 0.5 ? -1 : 1, 'Stayed under ' + U.fmtLine(line) + ' in ' + under + ' of his ' + label + '.', 2 + Math.abs(under / hr.n - 0.5) * 8);
      }
    }

    // matchup
    var opp = row.opp, n = row.nTeams || 30;
    if (opp && opp.rank && s !== 'reb') {
      var r = opp.rank.allows, rel = row.proj.oppDefRel || 0;
      var oname = teamWord(row.oppTeam || opp);
      if (r <= 8) {
        add(1, oname + ' allow the ' + (r === 1 ? 'most' : U.ordinal(r) + '-most') + ' points in the NBA (' + U.fmt1(opp.def) + ' a game' + earlyNote(opp) + ') — an easier matchup.', 2 + Math.abs(rel) * 40);
      } else if (r >= n - 7) {
        var best = n - r + 1;
        add(-1, 'Tough matchup: ' + oname + ' allow the ' + (best === 1 ? 'fewest' : U.ordinal(best) + '-fewest') + ' points (' + U.fmt1(opp.def) + ' a game' + earlyNote(opp) + ').', 2 + Math.abs(rel) * 40);
      }
    }
    if (s === 'reb' || s === 'pr' || s === 'pra') {
      var pace = row.proj.paceRel || 0;
      if (pace >= 0.015) add(1, 'High-scoring teams on both sides — more shots and more misses to rebound.', 1.5 + pace * 30);
      else if (pace <= -0.015) add(-1, 'Slow, low-scoring matchup — fewer missed shots to rebound.', 1.5 - pace * 30);
    }

    // minutes & teammates
    var minUp = null, b2b = null, blow = null, returning = false, minDown = null;
    (row.proj.notes || []).forEach(function (nt) {
      if (nt.k === 'minUp') minUp = nt;
      if (nt.k === 'minDown') minDown = nt;
      if (nt.k === 'b2b') b2b = nt;
      if (nt.k === 'blowout') blow = nt;
      if (nt.k === 'returning') returning = nt.long ? 'long' : true;
    });
    var ms = row.tc && row.tc.missingShare;
    var names = row.missingNames || '';
    if (names && (minUp || (ms && ms.pts >= 0.06))) {
      var bits = [];
      if (minUp && minUp.v >= 0.8) bits.push('about ' + U.fmt1(minUp.v) + ' extra minutes');
      if (ms && ms.pts >= 0.06 && s !== 'reb') bits.push('more shots to go around');
      if (ms && ms.reb >= 0.08 && (s === 'reb' || s === 'pr' || s === 'pra')) bits.push('more rebounds up for grabs');
      if (bits.length) add(1, 'With ' + names + ' out, he should get ' + bits.join(' and ') + '.', 2.5 + (minUp ? minUp.v : 0) + (ms ? ms.pts * 10 : 0));
    }
    if (minDown && minDown.v >= 1.5) add(-1, 'Crowded rotation: we expect about ' + U.fmt1(minDown.v) + ' fewer minutes than his usual.', 2 + minDown.v / 2);
    if (b2b) add(-1, 'Second game in two nights — tired legs, maybe a few fewer minutes.', 1.4);
    if (blow) add(-1, 'Could be a lopsided game (' + (row.favShort || 'favorite') + ' by ' + U.fmt0(row.absMargin) + ') — starters often sit late.', 1.5 + blow.v);

    // head to head
    if (row.oppId) {
      var vs = p.games.filter(function (g) { return g.oppId === row.oppId; }).slice(0, 4);
      if (vs.length >= 2) {
        var vals = vs.map(function (g) { return M.val(g, s); });
        var avgH = U.mean(vals);
        add(avgH > line ? 1 : -1, 'Against ' + teamWord(row.oppTeam || opp) + ' lately: ' + vals.join(', ') + ' (' + vals.length + ' games).', 1 + Math.min(2, Math.abs(avgH - line) / Math.max(1, line) * 6));
      }
    }

    // consistency
    var cv = an.sd / Math.max(1, an.mean);
    if (an.mean >= 4 && cv <= 0.3) add(0, 'Steady: his numbers don\'t swing much from game to game.', 0.8);
    else if (cv >= 0.6) add(0, 'Streaky: big swings from game to game, so it\'s riskier either way.', 0.8);

    // cautions
    if (an.caution.indexOf('gtd') >= 0) cons.push({ text: who + ' is listed as ' + (p.status ? String(p.status).toLowerCase() : 'a game-time decision') + '. Make sure he plays before you bet.', w: 6 });
    if (returning) cons.push({ text: returning === 'long' ? 'Back after missing last season — his minutes could be limited at first.' : 'Hasn\'t played yet this season — his minutes could be limited.', w: 5 });
    if (an.caution.indexOf('newTeam') >= 0) cons.push({ text: 'New team this season — his role and minutes may not match last year\'s numbers.', w: 4.5 });
    if (an.caution.indexOf('fewData') >= 0) cons.push({ text: 'Only ' + p.games.length + ' NBA games to learn from, so this is less reliable.', w: 5 });
    if (p.nCur < 5 && p.nPrev >= 10) info.push({ text: 'Early season: based mostly on last season (' + p.nPrev + ' games) plus ' + p.nCur + ' this season.', w: 0.5 });

    function srt(a, b) { return b.w - a.w; }
    pros.sort(srt); cons.sort(srt); info.sort(srt);
    return { pros: pros, cons: cons, info: info };
  };

  X.propBottomLine = function (an) {
    var side = an.side, p = side === 'over' ? an.cOver : an.cUnder, be = side === 'over' ? an.beO : an.beU;
    var w = X.sideWord(side), mk = an.market, bk = (mk && mk.book) || 'the sportsbook';
    var mix = '';
    if (Number.isFinite(an.mktOver)) {
      var mine = side === 'over' ? an.rawOver : 1 - an.rawOver, theirs = side === 'over' ? an.mktOver : 1 - an.mktOver;
      var leanMore = an.mktW > 0.55;
      if (an.mktSrc === 'book') mix = ' (our model says ' + U.pctc(mine) + ', ' + X.poss(bk) + ' odds say ' + U.pctc(theirs) +
        (leanMore ? ' — this early in his season we trust ' + X.poss(bk) + ' odds more' : ' — we weigh both equally') + ')';
      else if (an.mktSrc === 'line') mix = ' (our model says ' + U.pctc(mine) + '; sportsbooks set lines near 50/50, so we ' + (leanMore ? 'lean toward 50/50 this early in his season' : 'meet in the middle') + ')';
      else if (an.mktSrc === 'avg') mix = ' (our model says ' + U.pctc(mine) + ', his usual average says ' + U.pctc(theirs) + ' — we weigh both equally)';
    }
    var beTxt;
    if (an.estimated) beTxt = 'With an estimated line, a sportsbook would likely price the ' + w + ' at about ' + U.pct(be) + ' (based on his usual average, plus its cut)';
    else if (an.priced && mk && Math.abs(mk.line - an.line) < 1e-9) beTxt = 'At ' + X.poss(bk) + ' price (' + U.fmtAm(side === 'over' ? mk.over : mk.under) + ') you need ' + U.pct(be) + ' to break even';
    else beTxt = 'At standard odds (−110) you need about ' + U.pct(be) + ' to break even';
    if (!an.strength) return 'Too close to call: we give the ' + w + ' about ' + U.pctc(p) + mix + '. ' + beTxt + ', so there\'s no real edge. Best to skip this one.';
    return 'We give the ' + w + ' a ' + U.pctc(p) + ' chance' + mix + '. ' + beTxt + ', so this rates as a ' + X.strengthLabel(an.strength).toLowerCase() + '.';
  };

  /* ---------------- team games ---------------- */
  X.gameReasons = function (g, pred, tcHome, tcAway) {
    var out = [];
    var favHome = pred.winner.side === 'home';
    var fav = favHome ? g.home : g.away, dog = favHome ? g.away : g.home;
    var fr = favHome ? pred.H : pred.A, dr = favHome ? pred.A : pred.H;
    var dn = fr.net - dr.net;
    var early = (pred.H.gp < 5 || pred.A.gp < 5) ? ' (mostly last season\'s numbers)' : '';
    if (dn >= 1.5) out.push(teamWord(fav) + ' are the better team: they outscore opponents by ' + U.signed(fr.net) + ' a game, ' + teamWord(dog) + ' by ' + U.signed(dr.net) + early + '.');
    else if (dn <= -1.5) out.push(teamWord(dog) + ' have the better numbers (' + U.signed(dr.net) + ' vs ' + U.signed(fr.net) + ' a game' + early + '), but other factors tip it to ' + teamWord(fav) + '.');
    else out.push('Evenly matched on paper: ' + teamWord(g.home) + ' ' + U.signed(pred.H.net) + ' vs ' + teamWord(g.away) + ' ' + U.signed(pred.A.net) + ' points a game' + early + '.');
    if (!g.neutral) out.push(teamWord(g.home) + ' are at home, which is worth about ' + U.fmt1(pred.hca) + ' points.');
    else out.push('Neutral court — no home advantage.');
    [[g.home, tcHome], [g.away, tcAway]].forEach(function (pair) {
      var tc = pair[1];
      if (!tc || !tc.missing.length) return;
      var big = tc.missing.filter(function (m) { return m.impact >= 0.6; }).slice(0, 3);
      if (!big.length) return;
      var nm = big.map(function (m) { return m.name + (m.w < 1 ? ' (' + String(m.status).toLowerCase() + ')' : ''); }).join(', ');
      out.push(teamWord(pair[0]) + ' are missing ' + nm + ' — costs them about ' + U.fmt1(tc.marginLoss) + ' points.');
    });
    if (pred.b2bHome) out.push(teamWord(g.home) + ' also played last night (tired legs).');
    if (pred.b2bAway) out.push(teamWord(g.away) + ' also played last night (tired legs).');
    if (pred.pEspn != null) {
      var espnFav = pred.pEspn >= 0.5 ? g.home : g.away, espnP = Math.max(pred.pEspn, 1 - pred.pEspn);
      var agree = (pred.pEspn >= 0.5) === favHome;
      if (pred.wEspn >= 0.6) {
        out.push('Early season, so we lean on ESPN\'s matchup predictor (' + teamWord(espnFav) + ' ' + U.pct(espnP) + ') — it knows about summer trades and signings; our own team numbers are mostly last season\'s.');
      } else {
        out.push('ESPN\'s matchup predictor has ' + teamWord(espnFav) + ' at ' + U.pct(espnP) + (agree ? ' — it agrees.' : ' — it sees it the other way, so this is closer than it looks.'));
      }
    }
    return out;
  };

  X.fmtSpread = function (x) { return x === 0 ? 'PK' : (x > 0 ? '+' : '−') + U.fmtLine(Math.abs(x)); };

  /** finishes the sentence "You win if …" */
  X.spreadCondition = function (team, pickLine) {
    var t = teamWord(team);
    if (pickLine === 0) return t + ' win the game';
    if (pickLine < 0) {
      var need = Math.floor(-pickLine) + 1;
      return t + ' win by ' + need + ' or more' + (Number.isInteger(pickLine) ? ' (win by exactly ' + (-pickLine) + ' = money back)' : '');
    }
    var lose = Number.isInteger(pickLine) ? pickLine - 1 : Math.floor(pickLine);
    return t + ' win, or lose by ' + lose + ' or fewer' + (Number.isInteger(pickLine) ? ' (lose by exactly ' + pickLine + ' = money back)' : '');
  };

  X.marginText = function (g, pred) {
    return pred.margin >= 0 ? teamWord(g.home) + ' by ' + U.fmt1(pred.margin) : teamWord(g.away) + ' by ' + U.fmt1(-pred.margin);
  };

  X.spreadText = function (g, pred, sp) {
    var S = sp.line;
    var favTeam = S < 0 ? g.home : g.away, favLine = S < 0 ? S : -S;
    var pickTeam = sp.side === 'home' ? g.home : g.away, pickLine = sp.side === 'home' ? S : -S;
    var p = sp.side === 'home' ? sp.pHome : sp.pAway, be = sp.side === 'home' ? sp.beH : sp.beA;
    var lineTxt = S === 0 ? 'a pick\'em (no points given)' : teamWord(favTeam) + ' ' + X.fmtSpread(favLine);
    return {
      pick: teamWord(pickTeam) + ' ' + X.fmtSpread(pickLine),
      cond: 'You win if ' + X.spreadCondition(pickTeam, pickLine) + '.',
      why: 'We project ' + X.marginText(g, pred) + '. The sportsbook says ' + lineTxt + '.',
      chance: 'Our chance: ' + U.pctc(p) + ' (break-even ' + U.pct(be) + ').'
    };
  };

  X.totalText = function (g, pred, tm) {
    var L = tm.line, side = tm.side, p = side === 'over' ? tm.pOver : tm.pUnder, be = side === 'over' ? tm.beO : tm.beU;
    var cond = side === 'over'
      ? 'You win if the teams combine for ' + (Math.floor(L) + 1) + ' or more points' + (Number.isInteger(L) ? ' (exactly ' + L + ' = money back)' : '') + '.'
      : 'You win if the teams combine for ' + (Number.isInteger(L) ? L - 1 : Math.floor(L)) + ' or fewer points' + (Number.isInteger(L) ? ' (exactly ' + L + ' = money back)' : '') + '.';
    var pace = (pred.H.paceRel + pred.A.paceRel) / 2;
    var feel = pace >= 0.015 ? 'Both teams play in high-scoring games. ' : pace <= -0.015 ? 'Both teams play in low-scoring games. ' : '';
    return {
      pick: X.sideWord(side) + ' ' + U.fmtLine(L),
      cond: cond,
      why: feel + 'We project ' + U.fmt0(pred.total) + ' total points (' + teamWord(g.home) + ' ' + U.fmt0(pred.home) + ', ' + teamWord(g.away) + ' ' + U.fmt0(pred.away) + ') vs the line of ' + U.fmtLine(L) + '.',
      chance: 'Our chance: ' + U.pctc(p) + ' (break-even ' + U.pct(be) + ').'
    };
  };

  X.mlText = function (g, pred, ml) {
    var home = ml.side === 'home';
    var team = home ? g.home : g.away, p = home ? ml.pHome : 1 - ml.pHome;
    var imp = home ? ml.impliedHome : ml.impliedAway, odds = home ? ml.homeML : ml.awayML;
    return {
      pick: teamWord(team) + ' to win (' + U.fmtAm(odds) + ')',
      cond: 'You win if ' + teamWord(team) + ' win the game (overtime counts).',
      why: 'The odds ' + U.fmtAm(odds) + ' mean you need ' + U.pct(imp) + ' to break even. We give ' + teamWord(team) + ' ' + U.pct(p) + '.',
      chance: 'Our chance: ' + U.pctc(p) + ' (break-even ' + U.pct(imp) + ').'
    };
  };

  /* ---------------- live ---------------- */
  X.liveGameText = function (g, lv) {
    var lead = lv.mNow, leader = lead > 0 ? g.home : g.away;
    var s1 = lead === 0 ? 'Tied at ' + g.home.score : teamWord(leader) + ' lead by ' + Math.abs(lead);
    var favHome = lv.pHome >= 0.5;
    var favT = favHome ? g.home : g.away, fp = favHome ? lv.pHome : 1 - lv.pHome;
    return s1 + '. Projected final: ' + teamWord(g.home) + ' ' + U.fmt0(lv.projHome) + ', ' + teamWord(g.away) + ' ' + U.fmt0(lv.projAway) + '. ' + teamWord(favT) + ' win chance: ' + U.pct(fp) + '.';
  };

  X.livePropText = function (row, lp) {
    var noun = X.NOUN[row.stat], side = row.an.side, sw = X.sideWord(side);
    if (lp.final) {
      if (lp.push) return 'Finished with exactly ' + lp.cur + ' — a push, money back.';
      var won = (lp.hit ? 'over' : 'under') === side;
      return 'Finished with ' + lp.cur + ' ' + noun + ' — the ' + sw + ' ' + (won ? 'won' : 'lost') + '.';
    }
    if (lp.hit) {
      return side === 'over'
        ? 'Already over: ' + lp.cur + ' ' + noun + ' — the OVER has won.'
        : 'Already went over (' + lp.cur + ' ' + noun + ') — the UNDER has lost.';
    }
    var need = Math.max(1, lp.need);
    var ch = side === 'over' ? 'Over chance now: ' + U.pctc(lp.pOver) : 'Under chance now: ' + U.pctc(lp.pUnder);
    return lp.cur + ' so far in ' + U.fmt0(lp.min) + ' min. Needs ' + need + ' more ' + (need === 1 ? X.NOUN1[row.stat] : noun) +
      ' to go over, with about ' + U.fmt0(lp.remMin) + ' min left for him. ' + ch + '.';
  };
  /** 'win' | 'loss' | 'push' | 'live' for a prop with a live/final result */
  X.liveOutcome = function (row, lp) {
    if (!lp) return null;
    if (lp.final) return lp.push ? 'push' : ((lp.hit ? 'over' : 'under') === row.an.side ? 'win' : 'loss');
    if (lp.hit) return row.an.side === 'over' ? 'win' : 'loss';
    return 'live';
  };
})();
