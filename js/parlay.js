/* JJ Props — parlay.js
 * Auto Parlay: picks the best 5–10 legs from today's real sportsbook lines and prices the slip.
 *
 *  candidates  every bettable leg on games that haven't started: player props on a real line
 *              (DraftKings or a line you typed) plus spread / total / moneyline game bets
 *  build       "best" mode  → the legs with the biggest edge over their price
 *              "safe" mode  → the legs most likely to hit (that aren't clearly bad bets)
 *              one leg per player, one per game when possible (same-game legs move together)
 *  stats       chance all legs hit = multiply the leg chances (legs from different games are close
 *              to independent); payout = multiply the decimal odds; value = chance × payout − 1
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var HE = (root.HE = root.HE || {});
  var U = HE.util, M = HE.model, X = HE.explain;
  var P = (HE.parlay = {});

  P.LEGS = [5, 6, 7, 8, 9, 10];
  P.STD_ODDS = -110;            // price assumed for a line you typed yourself

  /** American odds → decimal odds (−110 → 1.909, +150 → 2.5) */
  P.decimal = function (am) {
    am = U.num(am, NaN);
    if (!Number.isFinite(am) || am === 0 || (am > -100 && am < 100)) return NaN;
    return am > 0 ? 1 + am / 100 : 1 + 100 / -am;
  };
  /** decimal odds → American odds (2.5 → +150, 1.5 → −200) */
  P.american = function (dec) {
    if (!(dec > 1)) return NaN;
    return dec >= 2 ? Math.round((dec - 1) * 100) : -Math.round(100 / (dec - 1));
  };

  function propLeg(r) {
    var an = r.an, side = an.side;
    var p = side === 'over' ? an.cOver : an.cUnder;
    var book = r.lineSource === 'book' && r.bookLine;
    var odds = book ? (side === 'over' ? r.bookLine.over : r.bookLine.under) : P.STD_ODDS;
    var dec = P.decimal(odds);
    return {
      id: 'p:' + r.key, kind: 'prop', gameId: r.gameId, playerId: r.prof.id, row: r,
      p: p, odds: odds, dec: dec, edge: p - 1 / dec, strength: an.strength, side: side, priced: !!book,
      title: r.prof.name, team: r.team.abbr, opp: r.oppTeam.abbr, isHome: r.isHome,
      pick: (side === 'over' ? 'OVER ' : 'UNDER ') + U.fmtLine(r.line) + ' ' + M.STAT_SHORT[r.stat],
      long: (side === 'over' ? 'Over ' : 'Under ') + U.fmtLine(r.line) + ' ' + X.NOUN[r.stat],
      book: book ? r.book : 'your line'
    };
  }

  function gameLegs(G) {
    var g = G.g, pred = G.pred, o = G.odds, mk = pred.markets || {}, out = [];
    var title = g.away.abbr + ' @ ' + g.home.abbr, book = o.provider || 'Sportsbook';
    function add(kind, m, p, odds, pick) {
      var dec = P.decimal(Number.isFinite(odds) ? odds : P.STD_ODDS);
      if (!(dec > 1) || !Number.isFinite(p)) return;
      out.push({
        id: 'g:' + g.id + ':' + kind, kind: kind, gameId: g.id, playerId: null, G: G,
        p: p, odds: Number.isFinite(odds) ? odds : P.STD_ODDS, dec: dec, edge: p - 1 / dec, strength: m.strength,
        side: m.side, priced: Number.isFinite(odds), title: title, pick: pick, long: pick, book: book
      });
    }
    if (mk.spread) {
      var hs = mk.spread.side === 'home';
      add('spread', mk.spread, hs ? mk.spread.pHome : mk.spread.pAway, hs ? o.homeSpreadOdds : o.awaySpreadOdds, X.spreadText(g, pred, mk.spread).pick);
    }
    if (mk.total) {
      var ov = mk.total.side === 'over';
      add('total', mk.total, ov ? mk.total.pOver : mk.total.pUnder, ov ? o.overOdds : o.underOdds, (ov ? 'OVER ' : 'UNDER ') + U.fmtLine(mk.total.line) + ' total points');
    }
    if (mk.ml) {
      var hm = mk.ml.side === 'home';
      add('ml', mk.ml, hm ? mk.ml.pHome : 1 - mk.ml.pHome, hm ? o.homeML : o.awayML, (hm ? g.home.short || g.home.abbr : g.away.short || g.away.abbr) + ' to win');
    }
    return out;
  }

  /** every leg you could bet right now, with our chance and the real price */
  P.candidates = function (rows, games) {
    var out = [];
    (rows || []).forEach(function (r) {
      if (!r || !r.game || r.game.status.state !== 'pre') return;   // can't bet games that started
      if (r.lineSource === 'est') return;                          // only lines you can actually bet
      if (M.isGTD(r.prof.status)) return;                          // skip game-time decisions
      if (!(r.prof.minBase >= 16)) return;                         // real rotation players only
      var leg = propLeg(r);
      if (leg.dec > 1 && Number.isFinite(leg.p)) out.push(leg);
    });
    (games || []).forEach(function (G) {
      if (!G || !G.g || G.g.status.state !== 'pre' || !G.pred || !G.odds) return;
      out = out.concat(gameLegs(G));
    });
    return out;
  };

  /**
   * Pick n legs. mode "best" = biggest edge first, "safe" = most likely to hit first.
   * Legs we have no edge on are only used to fill the slip, and are marked.
   */
  P.build = function (cands, n, mode, excluded) {
    excluded = excluded || {};
    var pool = (cands || []).filter(function (c) { return !excluded[c.id]; });
    var ok = pool.filter(function (c) { return mode === 'safe' ? c.edge >= -0.01 && c.p >= 0.5 : c.edge > 0.005; });
    ok.sort(mode === 'safe'
      ? function (a, b) { return (b.p - a.p) || (b.edge - a.edge); }
      : function (a, b) { return (b.edge - a.edge) || (b.p - a.p); });
    var rest = pool.filter(function (c) { return ok.indexOf(c) < 0; })
      .sort(function (a, b) { return (b.edge - a.edge) || (b.p - a.p); });
    var legs = [], players = {}, perGame = {}, filler = {};
    function fits(c, cap) {
      if (legs.indexOf(c) >= 0) return false;
      if (c.playerId && players[c.playerId]) return false;
      return (perGame[c.gameId] || 0) < cap;
    }
    function take(list, isFiller) {
      for (var cap = 1; cap <= 3 && legs.length < n; cap++) {
        for (var i = 0; i < list.length && legs.length < n; i++) {
          var c = list[i];
          if (!fits(c, cap)) continue;
          legs.push(c);
          if (c.playerId) players[c.playerId] = 1;
          perGame[c.gameId] = (perGame[c.gameId] || 0) + 1;
          if (isFiller) filler[c.id] = 1;
        }
      }
    }
    take(ok, false);
    take(rest, true);
    var games = {};
    legs.forEach(function (c) { games[c.gameId] = (games[c.gameId] || 0) + 1; });
    return {
      legs: legs, want: n, mode: mode,
      filler: filler, nFiller: Object.keys(filler).length,
      sameGame: Object.keys(games).filter(function (k) { return games[k] > 1; }),
      available: pool.length, withEdge: ok.length
    };
  };

  /** price and chance of the whole slip */
  P.stats = function (legs) {
    var pAll = 1, dec = 1, bookP = 1;
    (legs || []).forEach(function (l) { pAll *= l.p; dec *= l.dec; bookP *= 1 / l.dec; });
    var n = (legs || []).length;
    return {
      n: n, pAll: n ? pAll : 0, dec: n ? dec : 1, american: n ? P.american(dec) : NaN,
      bookP: n ? bookP : 0, ev: n ? pAll * dec - 1 : 0, payout10: n ? 10 * dec : 0, oneIn: n && pAll > 0 ? 1 / pAll : Infinity
    };
  };

  /** "about 1 in 43" */
  P.oneIn = function (p) {
    if (!(p > 0)) return '–';
    var k = 1 / p;
    if (k < 10) return '1 in ' + (Math.round(k * 10) / 10);
    if (k < 1000) return '1 in ' + Math.round(k);
    return '1 in ' + Math.round(k / 100) * 100;
  };

  /** plain-text slip to paste into a notes app or a group chat */
  P.slipText = function (slip, st, dateLabel) {
    var lines = ['JJ Props · Auto Parlay (' + slip.legs.length + ' legs)' + (dateLabel ? ' · ' + dateLabel : '')];
    slip.legs.forEach(function (l, i) {
      lines.push((i + 1) + '. ' + l.title + ' — ' + l.long + ' (' + U.fmtAm(l.odds) + ') · our chance ' + U.pctc(l.p));
    });
    lines.push('Parlay odds ≈ ' + U.fmtAm(st.american) + ' · $10 pays $' + st.payout10.toFixed(2) + ' · chance all hit ' + pctSmall(st.pAll) + ' (' + P.oneIn(st.pAll) + ')');
    lines.push('Estimates, not guarantees. 21+. Bet responsibly.');
    return lines.join('\n');
  };

  function pctSmall(p) {
    if (!(p > 0)) return '0%';
    var v = p * 100;
    return (v >= 10 ? Math.round(v) : v >= 1 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100) + '%';
  }
  P.pctSmall = pctSmall;
})();
