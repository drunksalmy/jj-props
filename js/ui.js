/* JJ Props — ui.js
 * Builds every screen as HTML: Top Picks, Games, Player Props, How it works,
 * plus the player and game detail sheets. All text from the data feed is escaped.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var HE = (root.HE = root.HE || {});
  var U = HE.util, M = HE.model, X = HE.explain, CH = HE.charts, E = HE.espn, P = HE.parlay;
  var UI = (HE.ui = {});
  var esc = U.esc;

  /* ---------------- icons ---------------- */
  function svg(path, cls) { return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>'; }
  var I = UI.icons = {
    up: svg('<path d="M12 5l7 9H5z"/>', 'fill'),
    down: svg('<path d="M12 19l-7-9h14z"/>', 'fill'),
    refresh: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    x: svg('<path d="M7 7l10 10M17 7L7 17"/>'),
    alert: svg('<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17h.01"/>'),
    chev: svg('<path d="M9 6l6 6-6 6"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    minus: svg('<path d="M5 12h14"/>'),
    calendar: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    copy: svg('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
    swap: svg('<path d="M7 4L3 8l4 4M3 8h13M17 20l4-4-4-4M21 16H8"/>'),
    bolt: svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'),
    shield: svg('<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/>')
  };

  /* ---------------- tiny building blocks ---------------- */
  UI.logo = function (team, size) {
    size = size || 28;
    return '<img class="logo" src="' + esc(team.logo || E.logo(team.abbr)) + '" alt="" width="' + size + '" height="' + size + '" loading="lazy" onerror="this.style.visibility=\'hidden\'">';
  };
  UI.head = function (prof, size) {
    var cls = size === 'lg' ? 'hs hs-lg' : 'hs';
    return '<span class="' + cls + '"><img src="' + esc(E.headshot(prof.id)) + '" alt="" loading="lazy" onerror="this.parentNode.classList.add(\'noimg\');this.remove()"><i>' + esc(initials(prof.name)) + '</i></span>';
  };
  function initials(n) { return String(n || '?').split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase(); }
  UI.badge = function (strength) {
    if (!strength) return '<span class="badge b-none">No clear edge</span>';
    return '<span class="badge b-' + strength + '"><i class="sig" aria-hidden="true"><b></b><b></b><b></b></i>' + esc(X.strengthLabel(strength)) + '</span>';
  };
  /** chance ring: how often we think it wins, with a tick at the break-even ("needs") level */
  UI.ring = function (p, side, be, lg) {
    var r = 19, c = 2 * Math.PI * r, v = U.clamp(p, 0, 1);
    var tick = '';
    if (Number.isFinite(be)) {
      var a = 2 * Math.PI * U.clamp(be, 0, 1);
      var x1 = 22 + 15 * Math.cos(a), y1 = 22 + 15 * Math.sin(a), x2 = 22 + 23 * Math.cos(a), y2 = 22 + 23 * Math.sin(a);
      tick = '<line class="rb" x1="' + x1.toFixed(2) + '" y1="' + y1.toFixed(2) + '" x2="' + x2.toFixed(2) + '" y2="' + y2.toFixed(2) + '"/>';
    }
    var cls = side === 'under' ? 'r-under' : side === 'team' ? 'r-team' : 'r-over';
    return '<span class="ring ' + cls + (lg ? ' ring-lg' : '') + '" role="img" aria-label="' + U.pctc(p) + ' chance' + (Number.isFinite(be) ? ', needs ' + U.pct(be) : '') + '">' +
      '<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="rt" cx="22" cy="22" r="' + r + '"/>' +
      '<circle class="rv" cx="22" cy="22" r="' + r + '" stroke-dasharray="' + (v * c).toFixed(2) + ' ' + c.toFixed(2) + '"/>' + tick + '</svg>' +
      '<b>' + U.pctc(p) + '</b>' + (lg ? '<small>chance</small>' : '') + '</span>';
  };
  UI.side = function (side, line, stat, big) {
    var up = side === 'over';
    return '<span class="side ' + (up ? 'side-over' : 'side-under') + (big ? ' big' : '') + '">' + (up ? I.up : I.down) +
      (up ? 'OVER ' : 'UNDER ') + esc(U.fmtLine(line)) + (stat ? ' <small>' + esc(M.STAT_SHORT[stat]) + '</small>' : '') + '</span>';
  };
  UI.meter = function (p, side, be) {
    var w = Math.round(U.clamp(p, 0, 1) * 100);
    var tick = Number.isFinite(be) ? '<i style="left:' + Math.round(U.clamp(be, 0, 1) * 100) + '%"></i>' : '';
    return '<span class="meter ' + (side === 'under' ? 'm-under' : 'm-over') + '" aria-hidden="true"><span style="width:' + w + '%"></span>' + tick + '</span>';
  };
  /** the win rate a prop needs to be worth betting (break-even at the price, or fair price for estimated lines) */
  function need(an) { return an.side === 'over' ? an.beO : an.beU; }
  UI.need = function (an) {
    return '<small class="need" title="The win rate this bet needs to be worth it. We only call it a pick when our chance is clearly higher.">needs ' + U.pct(need(an)) + '</small>';
  };
  /** hit-rate chip for the pick's side */
  UI.hr = function (label, h, side) {
    if (!h || !h.n) return '<span class="hr hr-na"><em>' + esc(label) + '</em><b>–</b></span>';
    var k = side === 'under' ? h.n - h.over - h.push : h.over;
    var pct = k / h.n;
    var cls = pct >= 0.7 ? 'hr-5' : pct >= 0.55 ? 'hr-4' : pct >= 0.45 ? 'hr-3' : pct >= 0.3 ? 'hr-2' : 'hr-1';
    return '<span class="hr ' + cls + '" title="' + esc(label + ': ' + k + ' of ' + h.n + ' games') + '"><em>' + esc(label) + '</em><b>' + k + '/' + h.n + '</b></span>';
  };
  UI.status = function (g) {
    var st = g.status;
    if (st.state === 'in') {
      var lbl = st.name === 'STATUS_HALFTIME' ? 'Halftime' : (st.name === 'STATUS_END_PERIOD' ? 'End ' + U.periodName(st.period) : U.periodName(st.period) + ' ' + esc(st.displayClock));
      return '<span class="gstat live"><i class="dot"></i>' + lbl + '</span>';
    }
    if (st.state === 'post') return '<span class="gstat final">' + esc(st.shortDetail || 'Final') + '</span>';
    if (st.off || /postpon|cancel|delay|suspend/i.test(st.name + st.detail)) return '<span class="gstat warn">' + esc(st.shortDetail || st.detail || 'Postponed') + '</span>';
    return '<span class="gstat pre">' + esc(U.localDayTime(g.startISO)) + '</span>';
  };
  function teamShort(t) { return t.short || t.abbr; }
  function matchup(row) {
    var g = row.game;
    return (row.isHome ? 'vs ' : '@ ') + row.oppTeam.abbr + ' · ' + (g.status.state === 'pre' ? U.localDayTime(g.startISO) : (g.status.state === 'in' ? 'LIVE' : 'Final'));
  }
  function chance(an) { return an.side === 'over' ? an.cOver : an.cUnder; }

  /* ---------------- header pieces ---------------- */
  UI.statusPill = function (S) {
    var games = S.board ? S.board.games : [];
    var live = games.filter(function (g) { return g.status.state === 'in'; }).length;
    var secs = S.nextUpdateAt ? Math.max(0, Math.round((S.nextUpdateAt - Date.now()) / 1000)) : null;
    var txt;
    if (S.offline) txt = '<span class="pill off">' + I.alert + 'Offline<span class="long"> · showing saved data</span></span>';
    else if (live) txt = '<span class="pill on"><i class="dot"></i>LIVE<span class="long"> · ' + live + ' game' + (live > 1 ? 's' : '') + ' · updated ' + esc(U.ago(S.lastUpdate)) + '</span></span>';
    else if (!S.lastUpdate) txt = '<span class="pill">Connecting…</span>';
    else txt = '<span class="pill">Updated ' + esc(U.ago(S.lastUpdate)) + (secs != null && secs < 3600 ? '<span class="long"> · next check ' + fmtSecs(secs) + '</span>' : '') + '</span>';
    return txt;
  };
  function fmtSecs(s) { return s >= 120 ? Math.round(s / 60) + 'm' : s + 's'; }

  UI.dateBar = function (S) {
    var cal = S.calendar && S.calendar.length ? S.calendar : null;
    var sel = S.date, dates = [];
    if (cal) {
      var idx = cal.indexOf(sel);
      if (idx < 0) { idx = 0; while (idx < cal.length && cal[idx] < sel) idx++; }
      var from = Math.max(0, idx - 3), to = Math.min(cal.length, from + 9);
      dates = cal.slice(from, to);
      if (dates.indexOf(sel) < 0) dates.push(sel);
      dates.sort();
    } else {
      for (var i = -2; i <= 5; i++) dates.push(U.addDays(sel, i));
    }
    var h = '<div class="dates" role="tablist" aria-label="Game dates">';
    dates.forEach(function (d) {
      var isToday = d === S.todayEt;
      h += '<button class="date' + (d === sel ? ' on' : '') + '" data-date="' + d + '" role="tab" aria-selected="' + (d === sel) + '">' +
        '<small>' + (isToday ? 'Today' : esc(U.ymdLabel(d, { weekday: 'short', month: undefined, day: undefined }))) + '</small>' +
        '<b>' + esc(U.ymdLabel(d, { weekday: undefined })) + '</b></button>';
    });
    h += '<label class="date pick" title="Pick any date">' + I.calendar + '<input type="date" data-datepick value="' +
      sel.slice(0, 4) + '-' + sel.slice(4, 6) + '-' + sel.slice(6, 8) + '" aria-label="Pick a date"></label>';
    h += '</div><p class="tz-note">US game dates · tip-off times in your time zone</p>';
    return h;
  };

  UI.banner = function (S) {
    var h = '';
    if (S.loading && S.loading.active) {
      var pct = S.loading.total ? Math.round(100 * S.loading.done / S.loading.total) : 0;
      h += '<div class="banner load"><div><b>' + esc(S.loading.label || 'Loading…') + '</b>' +
        (S.loading.total ? ' <span class="muted">' + S.loading.done + ' / ' + S.loading.total + '</span>' : '') +
        '</div><div class="prog"><span style="width:' + pct + '%"></span></div></div>';
    }
    if (S.error) h += '<div class="banner err">' + I.alert + '<span>' + esc(S.error) + '</span><button class="btn sm" data-act="retry">Try again</button></div>';
    return h;
  };

  /* ---------------- TOP PICKS ---------------- */
  UI.picksView = function (S) {
    var games = S.games || [];
    var isToday = S.date === S.todayEt;
    var h = '<section class="hero"><div><span class="eyebrow">' + (isToday ? 'Tonight' : 'Game day') + ' · ' + esc(U.ymdLabel(S.date)) + '</span>' +
      '<h1>' + (isToday ? 'Tonight\'s best plays' : 'Best plays') + '</h1>' +
      '<p class="sub">' + heroLine(S) + '</p></div>' + heroStats(S) + '</section>';
    if (!games.length) return h + emptyState(S);

    var live = games.filter(function (G) { return G.g.status.state === 'in'; });
    if (live.length) {
      h += '<h2 class="sec">Live now</h2><div class="live-strip">';
      live.forEach(function (G) { h += liveMini(G); });
      h += '</div>';
    }

    h += UI.parlayBox(S);

    var top = UI.topProps(S.rows || [], 9);
    var bookRows = (S.rows || []).filter(function (r) { return r.lineSource === 'book'; });
    var earlyProps = bookRows.length > 0 && bookRows.filter(function (r) { return r.prof.nCur < 5; }).length > bookRows.length / 2;
    var earlyNote = 'It\'s early in the season: DraftKings\' lines already know about summer trades and new roles, while our numbers are mostly from last season — so we lean on DraftKings\' odds and only flag small edges. More picks show up as players log games.';
    h += '<div class="sec-head"><h2 class="sec">Player props</h2><button class="link" data-tab="props">See all props ' + I.chev + '</button></div>';
    if (top.length) {
      h += '<div class="pick-grid">' + top.map(UI.propCard).join('') + '</div>';
      if (earlyProps && top.length < 6) h += '<p class="muted small note-early">' + earlyNote + '</p>';
    } else if (S.loading && S.loading.active) {
      h += '<div class="card soft">Crunching player numbers… picks appear here as soon as each game is ready.</div>';
    } else {
      h += '<div class="card soft">' + (earlyProps ? 'No player props with a clear edge yet. ' + earlyNote :
        'No strong player props right now. Check back closer to tip-off, or type your sportsbook\'s lines in <button class="link" data-tab="props">Player Props</button>.') + '</div>';
    }

    var gp = UI.topGamePicks(games, 6);
    h += '<div class="sec-head"><h2 class="sec">Game bets</h2><button class="link" data-tab="games">All games ' + I.chev + '</button></div>';
    if (gp.length) h += '<div class="pick-grid">' + gp.map(UI.gamePickCard).join('') + '</div>';
    else {
      var early = games.some(function (G) { return G.pred && G.pred.early > 0.5; });
      h += '<div class="card soft">No game bets with a clear edge' +
        (early ? ' — it\'s early in the season, so our team numbers lean on ESPN\'s predictor and mostly agree with the sportsbooks. Edges show up as teams play more games.' :
          (games.some(function (G) { return !G.odds; }) ? ' yet (some games have no sportsbook line yet).' : ' right now.')) + '</div>';
    }

    h += '<div class="card soft howsure">' + I.info + '<div><b>How sure is "62%"?</b> It means: if this exact bet came up 100 times, we\'d expect it to win about 62. ' +
      'Even strong picks lose often — never bet money you can\'t afford to lose. <button class="link" data-tab="guide">How it works</button></div></div>';
    return h;
  };

  function heroStats(S) {
    var games = S.games || [];
    if (!games.length) return '';
    var live = games.filter(function (G) { return G.g.status.state === 'in'; }).length;
    var lines = (S.rows || []).filter(function (r) { return r.lineSource === 'book'; }).length;
    var picks = (S.rows || []).filter(function (r) { return r.an.strength && r.game.status.state === 'pre'; }).length;
    var h = '<div class="hero-stats">';
    h += '<div class="hstat"><b>' + games.length + '</b><small>Game' + (games.length > 1 ? 's' : '') + '</small></div>';
    if (live) h += '<div class="hstat live"><b>' + live + '</b><small>Live now</small></div>';
    h += '<div class="hstat"><b>' + lines + '</b><small>DK lines</small></div>';
    h += '<div class="hstat"><b>' + picks + '</b><small>Picks</small></div>';
    return h + '</div>';
  }

  function heroLine(S) {
    var games = S.games || [];
    if (!games.length) return 'No NBA games on this date.';
    var pre = games.filter(function (G) { return G.g.status.state === 'pre'; });
    var live = games.filter(function (G) { return G.g.status.state === 'in'; }).length;
    var fin = games.filter(function (G) { return G.g.status.state === 'post'; }).length;
    var bits = [games.length + ' game' + (games.length > 1 ? 's' : '')];
    if (live) bits.push(live + ' live');
    if (fin && fin < games.length) bits.push(fin + ' final');
    if (pre.length) bits.push('first tip ' + U.localDayTime(pre[0].g.startISO));
    if (fin === games.length) bits.push('all final — see how the picks did');
    return esc(bits.join(' · ')) + '. Tap any pick to see why.';
  }

  function emptyState(S) {
    var next = (S.calendar || []).filter(function (d) { return d > S.date; })[0];
    return '<div class="card empty"><h3>No games on this date</h3><p>The NBA doesn\'t play every day.</p>' +
      (next ? '<button class="btn" data-date="' + next + '">Go to next game day · ' + esc(U.ymdLabel(next)) + '</button>' : '') + '</div>';
  }

  /** best props, preferring games that haven't tipped off yet (you can still bet those) */
  UI.topProps = function (rows, n) {
    var upcoming = rows.filter(function (r) { return r.game.status.state === 'pre'; });
    var pool = upcoming.length ? upcoming : rows;
    // real sportsbook lines first: an edge against a real line is the one that matters
    var real = function (r) { return r.lineSource !== 'est'; };
    var cand = pool.filter(function (r) { return r.an.strength && real(r) && r.prof.minBase >= 18; });
    if (cand.length < 3) {
      var est = pool.filter(function (r) { return r.an.strength && !real(r) && r.an.strength !== 'lean' && r.prof.minBase >= 20; });
      if (est.length + cand.length < 3) est = pool.filter(function (r) { return r.an.strength && !real(r) && r.prof.minBase >= 18; });
      cand = cand.concat(est);
    }
    var order = { strong: 3, good: 2, lean: 1 };
    cand.sort(function (a, b) {
      return ((real(b) ? 1 : 0) - (real(a) ? 1 : 0)) || (order[b.an.strength] - order[a.an.strength]) || (b.an.edge - a.an.edge);
    });
    var perPlayer = {}, perGame = {}, out = [];
    for (var i = 0; i < cand.length && out.length < n; i++) {
      var r = cand[i];
      if ((perPlayer[r.prof.id] || 0) >= 1) continue;
      if ((perGame[r.gameId] || 0) >= 3) continue;
      perPlayer[r.prof.id] = (perPlayer[r.prof.id] || 0) + 1;
      perGame[r.gameId] = (perGame[r.gameId] || 0) + 1;
      out.push(r);
    }
    return out;
  };

  UI.topGamePicks = function (games, n) {
    var out = [];
    var upcoming = games.filter(function (G) { return G.g.status.state === 'pre'; });
    (upcoming.length ? upcoming : games).forEach(function (G) {
      if (!G.pred || !G.pred.markets) return;
      var mk = G.pred.markets;
      [['spread', mk.spread], ['total', mk.total], ['ml', mk.ml]].forEach(function (pair) {
        var m = pair[1];
        if (m && m.strength) out.push({ G: G, kind: pair[0], m: m });
      });
    });
    var order = { strong: 3, good: 2, lean: 1 };
    out.sort(function (a, b) { return (order[b.m.strength] - order[a.m.strength]) || (b.m.edge - a.m.edge); });
    var seen = {}, res = [];
    out.forEach(function (x) {
      if (res.length >= n) return;
      if ((seen[x.G.g.id] || 0) >= 2) return;
      seen[x.G.g.id] = (seen[x.G.g.id] || 0) + 1;
      res.push(x);
    });
    return res;
  };

  /* ---------------- AUTO PARLAY ---------------- */
  UI.currentSlip = function (S) {
    var cfg = S.parlay || { legs: 5, mode: 'best', excluded: {} };
    return P.build(P.candidates(S.rows || [], S.games || []), cfg.legs, cfg.mode, cfg.excluded);
  };

  UI.parlayBox = function (S) {
    var cfg = S.parlay || { legs: 5, mode: 'best', excluded: {} };
    var games = S.games || [];
    var upcoming = games.filter(function (G) { return G.g.status.state === 'pre'; });
    var h = '<section class="parlay" aria-labelledby="pl-title">';
    h += '<div class="pl-head"><div><span class="eyebrow">Auto Parlay</span><h2 id="pl-title">Your <span>' + cfg.legs + '-leg</span> slip</h2>' +
      '<p>We pick every leg for you from today\'s DraftKings lines — ' + (cfg.mode === 'safe' ? 'the ones most likely to hit' : 'the ones with the biggest edge') +
      '. One leg per player, spread across games. Tap a leg to see why, or swap it.</p></div>';
    h += '<div class="pl-ctrl"><div class="pl-row"><span class="lab">Legs</span><div class="seg legs" role="radiogroup" aria-label="Number of legs">' +
      P.LEGS.map(function (n) {
        return '<button class="' + (cfg.legs === n ? 'on' : '') + '" data-parlay-legs="' + n + '" role="radio" aria-checked="' + (cfg.legs === n) + '">' + n + '</button>';
      }).join('') + '</div></div>' +
      '<div class="pl-row"><span class="lab">Style</span><div class="seg" role="radiogroup" aria-label="Parlay style">' +
      [['best', 'Best value'], ['safe', 'Safest']].map(function (x) {
        return '<button class="' + (cfg.mode === x[0] ? 'on' : '') + '" data-parlay-mode="' + x[0] + '" role="radio" aria-checked="' + (cfg.mode === x[0]) + '">' + x[1] + '</button>';
      }).join('') + '</div></div></div></div>';

    if (!upcoming.length) {
      return h + '<div class="card soft pl-empty">' + (games.length ? 'This date\'s games have all started — parlays are built from games you can still bet. Pick another date above.' : 'No games on this date.') + '</div></section>';
    }
    if (S.loading && S.loading.active && !(S.rows || []).length) {
      return h + '<div class="card soft pl-empty">Building your slip as player numbers load…</div></section>';
    }
    var slip = UI.currentSlip(S);
    if (!slip.legs.length) {
      return h + '<div class="card soft pl-empty">DraftKings hasn\'t posted lines for these games yet (player lines usually go up on game day). Check back closer to tip-off — or type your sportsbook\'s lines in <button class="link" data-tab="props">Player Props</button>.</div></section>';
    }
    var st = P.stats(slip.legs);
    var evPct = Math.round(st.ev * 100);
    h += '<ol class="legs-list">' + slip.legs.map(function (l, i) { return legRow(l, i, slip); }).join('') + '</ol>';
    h += '<div class="pl-sum">' +
      '<div class="psum"><small>Chance all hit</small><b>' + P.pctSmall(st.pAll) + '</b><em>about ' + esc(P.oneIn(st.pAll)) + '</em></div>' +
      '<div class="psum"><small>$10 pays</small><b>$' + fmtMoney(st.payout10) + '</b><em>parlay odds ' + esc(U.fmtAm(st.american)) + '</em></div>' +
      '<div class="psum"><small>Expected return</small><b class="' + (st.ev >= 0 ? 'pos' : 'neg') + '">' + (evPct >= 0 ? '+' : '−') + Math.abs(evPct) + '%</b><em>' +
      (st.ev >= 0 ? 'if our chances are right' : 'you\'d lose this on average') + '</em></div>' +
      '<div class="ps-actions"><button class="btn" data-parlay-copy>' + I.copy + 'Copy slip</button>' +
      (Object.keys(cfg.excluded || {}).length ? '<button class="btn ghost sm" data-parlay-reset>Undo swaps</button>' : '') + '</div></div>';
    var notes = [];
    if (S.loading && S.loading.active) notes.push('Still loading some players — the slip can change as the rest finish.');
    if (slip.legs.length < slip.want) notes.push('Only ' + slip.legs.length + ' legs are available right now — we only use real DraftKings lines on games that haven\'t started.');
    if (slip.nFiller) notes.push(slip.nFiller + ' leg' + (slip.nFiller > 1 ? 's have' : ' has') + ' no real edge (we like only ' + slip.withEdge + ' leg' + (slip.withEdge === 1 ? '' : 's') + ' today), so a smaller slip is smarter.');
    if (slip.sameGame.length) notes.push('Some legs share a game; DraftKings prices same-game parlays differently, so that payout may be lower.');
    notes.push('Parlays are long shots: every leg has to win, so most of them lose even with good legs. The payout is big because the chance is small — bet only what you can afford to lose.');
    h += '<p class="pl-note">' + I.alert + '<span>' + notes.map(function (t) { return esc(t); }).join(' ') + '</span></p>';
    return h + '</section>';
  };

  function fmtMoney(x) { return x >= 1000 ? Math.round(x).toLocaleString('en-US') : (Math.round(x * 100) / 100).toFixed(2).replace(/\.00$/, ''); }

  function legRow(l, i, slip) {
    var head, open, sub;
    if (l.kind === 'prop') {
      head = UI.head(l.row.prof);
      open = 'data-open-player="' + esc(l.playerId) + '" data-stat="' + l.row.stat + '" data-game="' + esc(l.gameId) + '"';
      sub = l.team + (l.isHome ? ' vs ' : ' @ ') + l.opp + ' · ' + U.localDayTime(l.row.game.startISO);
    } else {
      head = '<span class="leg-logo">' + UI.logo(l.G.g.home, 28) + '</span>';
      open = 'data-open-game="' + esc(l.gameId) + '"';
      sub = { spread: 'Spread', total: 'Total points', ml: 'Moneyline' }[l.kind] + ' · ' + U.localDayTime(l.G.g.startISO);
    }
    var sideCls = l.kind === 'prop' ? (l.side === 'over' ? 'side-over' : 'side-under') : 'side-team';
    var arrow = l.kind === 'prop' ? (l.side === 'over' ? I.up : I.down) : '';
    return '<li class="leg' + (slip.filler[l.id] ? ' filler' : '') + '" ' + open + ' tabindex="0">' +
      '<span class="leg-n">' + (i + 1) + '</span>' + head +
      '<span class="leg-who"><b>' + esc(l.title) + '</b><small>' + esc(sub + (slip.filler[l.id] ? ' · no edge' : '')) + '</small></span>' +
      '<span class="side ' + sideCls + '">' + arrow + esc(l.pick) + '</span>' +
      '<span class="leg-p"><b>' + U.pctc(l.p) + '</b><small>' + esc(U.fmtAm(l.odds) + (l.priced ? '' : ' (std)')) + '</small></span>' +
      '<button class="leg-x" data-parlay-drop="' + esc(l.id) + '" aria-label="Swap this leg" title="Swap for the next best leg">' + I.swap + '</button></li>';
  }

  UI.propCard = function (row) {
    var an = row.an, p = row.prof, g = row.game;
    var rs = X.propReasons(row);
    var why = rs.pros.slice(0, 2).map(function (r) { return '<li>' + esc(r.text) + '</li>'; }).join('');
    var warn = rs.cons.length ? '<li class="con">' + esc(rs.cons[0].text) + '</li>' : '';
    var liveTag = row.live ? UI.liveResult(row) : row.dnp ? '<div class="result r-push">Did not play — sportsbooks usually refund this bet.</div>' : '';
    var cls = 'pick-card pc-' + an.side + (an.strength === 'strong' ? ' pc-strong' : '');
    return '<article class="' + cls + '" tabindex="0" data-open-player="' + esc(p.id) + '" data-stat="' + row.stat + '" data-game="' + esc(g.id) + '">' +
      '<header>' + UI.head(p) + '<div class="who"><b>' + esc(p.name) + '</b><small>' + esc(row.team.abbr + ' ' + matchup(row)) + '</small></div>' +
      (M.isGTD(p.status) ? '<span class="tag warn" title="Game-time decision">' + esc(p.status) + '</span>' : UI.logo(row.oppTeam, 26)) + '</header>' +
      '<div class="pc-play"><div class="pc-bet">' + UI.side(an.side, row.line, null, true) + '<span class="stat-name">' + esc(X.NOUN[row.stat]) + '</span>' + UI.need(an) + '</div>' +
      UI.ring(chance(an), an.side, need(an)) + '</div>' +
      '<div class="meta">' + UI.badge(an.strength) + '</div>' +
      '<p class="win">' + esc(X.winCondition(p.name, row.stat, an.side, row.line)) + '</p>' +
      '<ul class="why">' + why + warn + '</ul>' + liveTag +
      '<div class="foot">' + CH.spark(p.games, row.stat, row.line) +
      '<span class="hrs">' + UI.hr('L5', an.hr.l5, an.side) + UI.hr('L10', an.hr.l10, an.side) + '</span>' +
      '<span class="proj">Proj <b>' + U.fmt1(an.mean) + '</b></span></div>' +
      '<div class="line-src">' + lineSource(row) + '</div>' +
      '</article>';
  };
  function lineSource(row) {
    if (row.lineSource === 'user') return 'Using your line';
    if (row.lineSource === 'book') return esc(row.book) + ' line · ' + esc(oddsTxt(row.bookLine));
    return 'Estimated line · tap to enter your sportsbook\'s';
  }
  function oddsTxt(b) { return 'Over ' + U.fmtAm(b.over) + ' / Under ' + U.fmtAm(b.under); }
  function shortBook(name) { return /draftkings/i.test(name || '') ? 'DK' : (name || 'Book'); }
  /** tiny label under a line box: where the line came from */
  function lineTag(r) {
    if (r.lineSource === 'book') return '<small class="lsrc book" title="' + esc(r.book + ' line: ' + oddsTxt(r.bookLine)) + '">' + esc(shortBook(r.book)) + ' ' + esc(U.fmtAm(r.bookLine.over)) + ' / ' + esc(U.fmtAm(r.bookLine.under)) + '</small>';
    if (r.lineSource === 'user') return '<small class="lsrc user">Your line</small>';
    return '<small class="lsrc est" title="No sportsbook line for him yet — estimated from his average">Estimate</small>';
  }
  UI.lineTag = lineTag;

  /** result / live-tracking strip for a prop whose game has started */
  UI.liveResult = function (row) {
    var o = X.liveOutcome(row, row.live);
    var cls = { win: 'r-win', loss: 'r-loss', push: 'r-push', live: 'r-live' }[o];
    var icon = o === 'win' ? I.check : o === 'loss' ? I.x : o === 'live' ? '<i class="dot"></i>' : '';
    return '<div class="result ' + cls + '">' + icon + '<span>' + esc(X.livePropText(row, row.live)) + '</span></div>';
  };

  UI.gamePickCard = function (x) {
    var G = x.G, g = G.g, pred = G.pred, m = x.m, t;
    if (x.kind === 'spread') t = X.spreadText(g, pred, m);
    else if (x.kind === 'total') t = X.totalText(g, pred, m);
    else t = X.mlText(g, pred, m);
    var p = x.kind === 'spread' ? (m.side === 'home' ? m.pHome : m.pAway) : x.kind === 'total' ? (m.side === 'over' ? m.pOver : m.pUnder) : (m.side === 'home' ? m.pHome : 1 - m.pHome);
    var kindLabel = { spread: 'Spread', total: 'Total points', ml: 'Moneyline (to win)' }[x.kind];
    return '<article class="pick-card game' + (m.strength === 'strong' ? ' pc-strong' : '') + '" tabindex="0" data-open-game="' + esc(g.id) + '">' +
      '<header><span class="logos">' + UI.logo(g.away, 28) + UI.logo(g.home, 28) + '</span><div class="who"><b>' + esc(g.away.abbr + ' @ ' + g.home.abbr) + '</b><small>' + UI.status(g) + '</small></div><span class="tag">' + kindLabel + '</span></header>' +
      '<div class="pc-play"><div class="pc-bet"><span class="side side-team big">' + esc(t.pick) + '</span><span class="stat-name">' + esc(kindLabel) + '</span></div>' + UI.ring(p, 'team') + '</div>' +
      '<div class="meta">' + UI.badge(m.strength) + '</div>' +
      '<p class="win">' + esc(t.cond) + '</p>' +
      '<ul class="why"><li>' + esc(t.why) + '</li></ul>' +
      '<div class="line-src">' + esc((G.odds && G.odds.provider) || 'Sportsbook') + ' line via ESPN</div>' +
      '</article>';
  };

  function liveMini(G) {
    var g = G.g, lv = G.live;
    return '<button class="live-mini" data-open-game="' + esc(g.id) + '">' +
      '<span class="lm-row">' + UI.logo(g.away, 22) + '<b>' + esc(g.away.abbr) + '</b><span class="sc">' + g.away.score + '</span></span>' +
      '<span class="lm-row">' + UI.logo(g.home, 22) + '<b>' + esc(g.home.abbr) + '</b><span class="sc">' + g.home.score + '</span></span>' +
      '<span class="lm-foot">' + UI.status(g) + (lv ? '<span>' + esc((lv.pHome >= 0.5 ? g.home.abbr : g.away.abbr) + ' ' + U.pctc(Math.max(lv.pHome, 1 - lv.pHome))) + ' to win</span>' : '') + '</span></button>';
  }

  /* ---------------- GAMES ---------------- */
  UI.gamesView = function (S) {
    var games = S.games || [];
    var h = '<section class="hero"><div><span class="eyebrow">Matchups · ' + esc(U.ymdLabel(S.date)) + '</span><h1>Games</h1><p class="sub">Who wins, by how many, and how many total points — with the DraftKings line for comparison and a live lead tracker once they tip off.</p></div>' + heroStats(S) + '</section>';
    if (!games.length) return h + emptyState(S);
    h += '<div class="games">' + games.map(UI.gameCard).join('') + '</div>';
    return h;
  };

  UI.winBar = function (g, p) {
    var hp = Math.round(U.clamp(p, 0.01, 0.99) * 100), ap = 100 - hp;
    var favHome = p >= 0.5;
    return '<div class="winbar" role="img" aria-label="' + esc(g.away.abbr + ' ' + ap + '%, ' + g.home.abbr + ' ' + hp + '%') + '">' +
      '<span class="wb-l"><b>' + esc(g.away.abbr) + '</b> ' + ap + '%</span>' +
      '<span class="wb-track"><span class="wb-away' + (!favHome ? ' fav' : '') + '" style="width:' + ap + '%"></span><span class="wb-home' + (favHome ? ' fav' : '') + '" style="width:' + hp + '%"></span></span>' +
      '<span class="wb-r">' + hp + '% <b>' + esc(g.home.abbr) + '</b></span></div>';
  };

  function marketRow(label, value, sub, m, bet) {
    return '<div class="mk"><span class="mk-l">' + label + '</span><span class="mk-v">' + value + '</span>' +
      '<span class="mk-s">' + (sub || '') + '</span>' +
      (m && m.strength ? '<span class="mk-p">' + UI.badge(m.strength) + '</span><span class="mk-pick">Bet: ' + esc(bet) + '</span>' : '') + '</div>';
  }

  UI.gameCard = function (G) {
    var g = G.g, pred = G.pred, lv = G.live;
    var h = '<article class="card game-card" id="g-' + esc(g.id) + '">';
    h += '<div class="gc-top">' + teamBlock(g.away, g, 'away') + '<div class="gc-mid">' + UI.status(g) +
      (g.status.state !== 'pre' ? '<div class="score">' + g.away.score + ' <span>–</span> ' + g.home.score + '</div>' : '<div class="vs">@</div>') +
      '<small class="muted">' + esc([g.broadcasts && g.broadcasts[0], g.note].filter(Boolean).join(' · ')) + '</small></div>' + teamBlock(g.home, g, 'home') + '</div>';
    if (!pred) {
      h += '<div class="gc-body"><p class="muted">Loading team numbers…</p></div></article>';
      return h;
    }
    var p = lv && g.status.state === 'in' ? lv.pHome : pred.pHome;
    h += '<div class="gc-body">';
    h += '<div class="gc-label">' + (g.status.state === 'in' ? 'Live win chance' : g.status.state === 'post' ? 'Pre-game win chance' : 'Win chance') + '</div>' + UI.winBar(g, g.status.state === 'post' ? pred.pHome : p);
    var mk = pred.markets || {};
    var o = G.odds;
    var started = g.status.state !== 'pre';
    h += '<div class="mks">';
    var wt = pred.winner.side === 'home' ? g.home : g.away;
    h += marketRow(started ? 'Pre-game pick' : 'Winner', esc(teamShort(wt)) + ' <span class="muted">' + U.pctc(pred.winner.p) + '</span>',
      mk.ml ? 'Moneyline: ' + esc(g.away.abbr + ' ' + U.fmtAm(o.awayML) + ' · ' + g.home.abbr + ' ' + U.fmtAm(o.homeML)) : '', mk.ml,
      mk.ml ? X.mlText(g, pred, mk.ml).pick : '');
    h += marketRow('Winning margin', esc(X.marginText(g, pred)),
      mk.spread ? 'Sportsbook: ' + esc(spreadBook(g, mk.spread.line)) : (started ? 'Sportsbook line not available' : 'No sportsbook spread yet'), mk.spread,
      mk.spread ? X.spreadText(g, pred, mk.spread).pick : '');
    h += marketRow('Total points', U.fmt0(pred.total) + ' <span class="muted">(' + esc(g.away.abbr) + ' ' + U.fmt0(pred.away) + ' · ' + esc(g.home.abbr) + ' ' + U.fmt0(pred.home) + ')</span>',
      mk.total ? 'Sportsbook: ' + U.fmtLine(mk.total.line) : (started ? 'Sportsbook line not available' : 'No sportsbook total yet'), mk.total,
      mk.total ? X.totalText(g, pred, mk.total).pick : '');
    h += '</div>';
    if (lv && g.status.state === 'in') h += liveBlock(G, true);
    if (g.status.state === 'post') h += resultBlock(G);
    var reasons = X.gameReasons(g, pred, G.tcHome, G.tcAway).slice(0, 3);
    h += '<ul class="why">' + reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>';
    h += '<div class="gc-actions"><button class="btn" data-open-game="' + esc(g.id) + '">Full breakdown' + (lv && g.status.state === 'in' ? ' & lead tracker' : '') + ' ' + I.chev + '</button>' +
      '<button class="btn ghost" data-props-game="' + esc(g.id) + '">Player props</button></div>';
    h += '</div></article>';
    return h;
  };

  function spreadBook(g, S) {
    if (S === 0) return 'Pick\'em';
    return S < 0 ? g.home.abbr + ' ' + X.fmtSpread(S) : g.away.abbr + ' ' + X.fmtSpread(-S);
  }

  function teamBlock(t, g, side) {
    return '<div class="tb tb-' + side + '">' + UI.logo(t, 44) + '<b>' + esc(teamShort(t)) + '</b><small class="muted">' + esc(t.record || '') + (side === 'home' ? ' · Home' : ' · Away') + '</small></div>';
  }

  function resultBlock(G) {
    var g = G.g, pred = G.pred, mk = pred.markets || {};
    var homeWon = g.home.score > g.away.score;
    var items = [];
    var pickedHome = pred.winner.side === 'home';
    items.push(resItem('Winner pick: ' + (pickedHome ? g.home.abbr : g.away.abbr), pickedHome === homeWon));
    var margin = g.home.score - g.away.score;
    if (mk.spread && mk.spread.strength) {
      var x = margin + mk.spread.line;
      var won = mk.spread.side === 'home' ? x > 0 : x < 0;
      items.push(resItem(X.spreadText(g, pred, mk.spread).pick, x === 0 ? null : won));
    }
    if (mk.total && mk.total.strength) {
      var tot = g.home.score + g.away.score;
      items.push(resItem(X.totalText(g, pred, mk.total).pick, tot === mk.total.line ? null : (mk.total.side === 'over') === (tot > mk.total.line)));
    }
    return '<div class="results">' + items.join('') + '</div>';
  }
  function resItem(label, won) {
    var cls = won == null ? 'r-push' : won ? 'r-win' : 'r-loss';
    return '<span class="result ' + cls + '">' + (won == null ? '' : won ? I.check : I.x) + esc(label) + (won == null ? ' · push' : won ? ' · won' : ' · lost') + '</span>';
  }

  function liveBlock(G, compact) {
    var g = G.g, lv = G.live, sum = G.sum;
    var flow = sum && sum.flow;
    var lead = lv.mNow, leader = lead > 0 ? g.home : g.away;
    var h = '<div class="live-box">';
    var espnLive = sum && sum.winprob && Number.isFinite(sum.winprob.home) && g.status.state === 'in'
      ? ' <span class="muted">ESPN\'s live model: ' + esc((sum.winprob.home >= 0.5 ? g.home.abbr : g.away.abbr) + ' ' + U.pctc(Math.max(sum.winprob.home, 1 - sum.winprob.home))) + '</span>' : '';
    h += '<p class="live-line">' + (g.status.state === 'in' ? '<i class="dot"></i> ' : '') + esc(g.status.state === 'in' ? X.liveGameText(g, lv) : finalText(g)) + espnLive + '</p>';
    h += '<div class="tiles">';
    h += tile('Current lead', lead === 0 ? 'Tied' : esc(leader.abbr) + ' +' + Math.abs(lead));
    if (flow) {
      h += tile('Biggest lead', esc(g.away.abbr) + ' +' + flow.largestLead.away + '<br>' + esc(g.home.abbr) + ' +' + flow.largestLead.home);
      h += tile('Lead changes', String(flow.leadChanges));
      h += tile('Times tied', String(flow.timesTied));
      if (flow.run && flow.run.pts >= 5) h += tile('Run', esc((flow.run.side === 'home' ? g.home.abbr : g.away.abbr)) + ' ' + flow.run.pts + '-0');
    }
    h += '</div>';
    if (!compact && flow) h += '<div class="chart-wrap">' + CH.flow(flow, g.home, g.away, { live: true }) + '</div>';
    if (G.pred && G.pred.markets) {
      var bits = [];
      var mk = G.pred.markets;
      if (g.status.state === 'in') {
        if (mk.spread && Number.isFinite(lv.pHomeCover)) bits.push(esc(spreadBook(g, mk.spread.line)) + ' covers: <b>' + U.pctc(mk.spread.line < 0 ? lv.pHomeCover : 1 - lv.pHomeCover) + '</b>');
        if (mk.total && Number.isFinite(lv.pOver)) bits.push('Over ' + U.fmtLine(mk.total.line) + ': <b>' + U.pctc(lv.pOver) + '</b> (on pace for ' + U.fmt0(lv.projTotal) + ')');
      }
      if (bits.length) h += '<p class="live-mk">Live chances vs the pre-game lines — ' + bits.join(' · ') + '</p>';
    }
    h += '</div>';
    return h;
  }
  function finalText(g) {
    var hw = g.home.score > g.away.score, w = hw ? g.home : g.away, l = hw ? g.away : g.home;
    return 'Final: ' + teamShort(w) + ' won by ' + (w.score - l.score) + ' (' + w.score + '–' + l.score + ').';
  }
  function tile(label, value) { return '<div class="tile"><small>' + label + '</small><b>' + value + '</b></div>'; }

  /* ---------------- PLAYER PROPS ---------------- */
  UI.propsView = function (S) {
    var f = S.filters, games = S.games || [];
    var h = '<section class="hero"><div><span class="eyebrow">DraftKings lines · ' + esc(U.ymdLabel(S.date)) + '</span><h1>Player props</h1><p class="sub">Our projection vs. the DraftKings line for every rotation player. Betting somewhere else? Type your sportsbook\'s line in the <b>Line</b> box and the pick updates instantly.</p></div></section>';
    if (!games.length) return h + emptyState(S);
    h += '<div class="filters">';
    h += '<div class="seg" role="radiogroup" aria-label="Stat">' + M.STATS.map(function (s) {
      return '<button class="' + (f.stat === s ? 'on' : '') + '" data-filter="stat" data-val="' + s + '" role="radio" aria-checked="' + (f.stat === s) + '">' + M.STAT_SHORT[s] + '</button>';
    }).join('') + '</div>';
    h += '<select data-filter="game" aria-label="Game"><option value="all">All games</option>' + games.map(function (G) {
      return '<option value="' + esc(G.g.id) + '"' + (f.game === G.g.id ? ' selected' : '') + '>' + esc(G.g.away.abbr + ' @ ' + G.g.home.abbr) + '</option>';
    }).join('') + '</select>';
    h += '<select data-filter="sort" aria-label="Sort"><option value="edge"' + (f.sort === 'edge' ? ' selected' : '') + '>Best picks first</option><option value="proj"' + (f.sort === 'proj' ? ' selected' : '') + '>Highest projection</option><option value="name"' + (f.sort === 'name' ? ' selected' : '') + '>Name A–Z</option><option value="time"' + (f.sort === 'time' ? ' selected' : '') + '>Game time</option></select>';
    h += '<label class="search">' + I.search + '<input type="search" data-filter="q" placeholder="Find a player" value="' + esc(f.q) + '" aria-label="Find a player"></label>';
    h += '<label class="check"><input type="checkbox" data-filter="picksOnly"' + (f.picksOnly ? ' checked' : '') + '> Picks only</label>';
    h += '</div>';
    if (X.comboNote(f.stat)) h += '<p class="combo-hint">' + I.info + '<span><b>' + esc(X.comboNote(f.stat)) + '</b> Tap a player to see how his projection adds up.</span></p>';
    var rows = UI.filterRows(S);
    if (!rows.length) {
      h += '<div class="card soft">' + ((S.loading && S.loading.active) ? 'Loading player numbers…' : 'No props match these filters.') + '</div>';
      return h;
    }
    h += '<div class="tbl-wrap"><table class="tbl props"><thead><tr><th>Player</th><th>Line</th><th>Proj</th><th>Pick</th><th>Chance</th><th class="hide-s">Hit rate</th><th class="hide-m">Last 10</th></tr></thead><tbody>';
    rows.slice(0, 400).forEach(function (r) { h += UI.propRow(r); });
    h += '</tbody></table></div>';
    if (rows.length > 400) h += '<p class="muted center">Showing the first 400 — narrow it down with the filters.</p>';
    h += '<p class="muted small">Line = DraftKings line (DK, with its over / under odds) when there is one, otherwise an estimate from his average. Proj = our projection. Chance = how often we think the pick wins; needs = how often it must win to be worth it. Hit rate = how often the pick would have won in his last 5 / 10 / 20 games and vs this opponent.</p>';
    return h;
  };

  UI.filterRows = function (S) {
    var f = S.filters, q = U.norm(f.q);
    var rows = (S.rows || []).filter(function (r) {
      if (r.stat !== f.stat) return false;
      if (f.game !== 'all' && r.gameId !== f.game) return false;
      if (f.picksOnly && !r.an.strength) return false;
      if (q && U.norm(r.prof.name).indexOf(q) < 0 && U.norm(r.team.abbr) !== q) return false;
      return true;
    });
    var order = { strong: 3, good: 2, lean: 1 };
    rows.sort(function (a, b) {
      if (f.sort === 'proj') return b.an.mean - a.an.mean;
      if (f.sort === 'name') return a.prof.name.localeCompare(b.prof.name);
      if (f.sort === 'time') return (a.game.startMs - b.game.startMs) || (b.an.mean - a.an.mean);
      return ((order[b.an.strength] || 0) - (order[a.an.strength] || 0)) || (b.an.edge - a.an.edge);
    });
    return rows;
  };

  UI.propRow = function (r) {
    var an = r.an, p = r.prof, c = chance(an);
    var live = r.dnp ? '<span class="lv r-push">Did not play</span>' : '';
    if (r.live) {
      var o = X.liveOutcome(r, r.live);
      live = o === 'live'
        ? '<span class="lv r-live"><i class="dot"></i>' + r.live.cur + ' now · ' + U.pctc(an.side === 'over' ? r.live.pOver : r.live.pUnder) + '</span>'
        : '<span class="lv r-' + o + '">' + (r.live.final ? 'Final ' : 'Now ') + r.live.cur + ' · ' + (o === 'win' ? 'won' : o === 'loss' ? 'lost' : 'push') + '</span>';
    }
    return '<tr data-open-player="' + esc(p.id) + '" data-stat="' + r.stat + '" data-game="' + esc(r.gameId) + '" tabindex="0">' +
      '<td class="c-pl pl">' + UI.head(p) + '<span class="pl-txt"><b>' + esc(p.name) + '</b><small>' + esc(r.team.abbr + ' ' + matchup(r)) + '</small>' +
      (p.status ? '<small class="tag warn">' + esc(p.status) + '</small>' : '') + live + '</span></td>' +
      '<td class="c-ln ln">' + lineEditor(r) + lineTag(r) + '</td>' +
      '<td class="c-proj num" data-label="Proj"><b>' + U.fmt1(an.mean) + '</b></td>' +
      '<td class="c-pick">' + (an.strength ? UI.side(an.side, r.line) + ' ' + UI.badge(an.strength) : '<span class="muted">Skip</span> <small class="muted">' + esc(X.sideWord(an.side).toLowerCase()) + ' ' + U.pctc(c) + '</small>') + '</td>' +
      '<td class="c-ch num" data-label="Chance">' + (an.strength ? '<b>' + U.pctc(c) + '</b>' : '<span class="muted">' + U.pctc(c) + '</span>') + UI.need(an) + (an.strength ? UI.meter(c, an.side, need(an)) : '') + '</td>' +
      '<td class="c-hr hide-s hrs">' + UI.hr('L5', an.hr.l5, an.side) + UI.hr('L10', an.hr.l10, an.side) + UI.hr('L20', an.hr.l20, an.side) + UI.hr('H2H', an.hr.h2h, an.side) + '</td>' +
      '<td class="c-sp hide-m">' + CH.spark(p.games, r.stat, r.line) + '</td></tr>';
  };

  function lineEditor(r) {
    var tip = r.lineSource === 'user' ? 'Your line' : r.lineSource === 'book' ? r.book + ' line — betting somewhere else? Type that line.' : 'Estimated from his average — type your sportsbook\'s line';
    return '<span class="line-ed' + (r.lineSource === 'user' ? ' user' : r.lineSource === 'book' ? ' book' : '') + '" title="' + esc(tip) + '">' +
      '<button class="lstep" data-step="-0.5" data-key="' + esc(r.key) + '" aria-label="Lower line">' + I.minus + '</button>' +
      '<input class="line-in" inputmode="decimal" data-line="' + esc(r.key) + '" value="' + esc(U.fmtLine(r.line)) + '" aria-label="Line for ' + esc(r.prof.name) + '">' +
      '<button class="lstep" data-step="0.5" data-key="' + esc(r.key) + '" aria-label="Raise line">' + I.plus + '</button></span>';
  }
  UI.lineEditor = lineEditor;

  /* ---------------- PLAYER SHEET ---------------- */
  UI.playerSheet = function (S, pid, stat, gid) {
    var rows = (S.rows || []).filter(function (r) { return r.prof.id === pid && (!gid || r.gameId === gid); });
    if (!rows.length) return sheet('Player', '<p class="muted">No prop data for this player on this date.</p>');
    var row = rows.filter(function (r) { return r.stat === stat; })[0] || rows[0];
    stat = row.stat;
    var p = row.prof, an = row.an, g = row.game;
    var rs = X.propReasons(row);
    var c = chance(an);
    var h = '<div class="ps-head">' + UI.head(p, 'lg') + '<div><h2>' + esc(p.name) + '</h2><p class="muted">' +
      esc([p.pos, row.team.short || row.team.abbr].filter(Boolean).join(' · ')) + ' · ' + esc(matchup(row)) +
      (p.status ? ' · <span class="tag warn">' + esc(p.status) + (p.statusDetail ? ' (' + esc(p.statusDetail) + ')' : '') + '</span>' : '') + '</p></div></div>';
    h += '<div class="seg wide" role="tablist">' + rows.map(function (r) {
      return '<button class="' + (r.stat === stat ? 'on' : '') + '" data-sheet-stat="' + r.stat + '" data-pid="' + esc(pid) + '" data-game="' + esc(r.gameId) + '">' + M.STAT_SHORT[r.stat] + '</button>';
    }).join('') + '</div>';
    var lineNote;
    if (row.lineSource === 'user') {
      lineNote = 'Your line (saved). <button class="link" data-reset-line="' + esc(row.key) + '">' + (row.bookLine ? 'Back to the ' + esc(row.book) + ' line (' + esc(U.fmtLine(row.bookLine.line)) + ')' : 'Reset') + '</button>';
    } else if (row.lineSource === 'book') {
      lineNote = '<b>' + esc(row.book) + ' line</b> · ' + esc(oddsTxt(row.bookLine)) + '. Betting somewhere else? Type that sportsbook\'s line.';
    } else {
      lineNote = 'Estimated from his average — no sportsbook line for him yet. Type your sportsbook\'s line to check that exact bet.';
    }
    h += '<div class="ps-line"><span>Line</span>' + lineEditor(row) + '<small class="muted">' + lineNote + '</small></div>';
    if (row.live) h += '<div class="live-prop">' + UI.liveResult(row) + '</div>';
    else if (row.dnp) h += '<div class="live-prop"><div class="result r-push">' + esc(p.name) + ' did not play — sportsbooks usually refund props on players who don\'t play.</div></div>';
    h += '<div class="verdict-box ' + (an.strength ? 'v-' + an.side : 'v-none') + '">' +
      (g.status.state !== 'pre' ? '<div class="vb-label">Our pre-game pick</div>' : '') +
      '<div class="vb-top">' + UI.side(an.side, row.line, null, true) + '<span class="stat-name">' + esc(X.NOUN[stat]) + '</span>' + UI.badge(an.strength) + '</div>' +
      UI.ring(c, an.side, need(an), true) +
      '<div class="vb-chance"><span>Needs <b>' + U.pct(need(an)) + '</b> to be worth it</span></div>' +
      '<p class="win">' + esc(X.winCondition(p.name, stat, an.side, row.line)) + '</p>' +
      '<p class="bottom">' + esc(X.propBottomLine(an)) + '</p></div>';
    // projection breakdown
    var pr = row.proj, st = pr.stats[stat], parts = (M.COMBOS || {})[stat];
    // combos: each part's matchup effect, weighted by how much of the total it makes up
    var matchupPct = parts
      ? parts.reduce(function (t, k) { return t + pr.stats[k].mean * (pr.f[k] - 1); }, 0) / Math.max(1, st.mean)
      : (pr.f[stat] - 1);
    // combos show what the total is made of: "Projection · points + rebounds  18.5 = 12.4 + 6.1"
    var cp = X.comboParts(pr, stat);
    h += '<div class="proj-box">' + (cp
      ? '<div class="pb pb-combo"><small>Projection · ' + esc(cp.map(function (x) { return X.NOUN[x.stat]; }).join(' + ')) + '</small><b>' + U.fmt1(an.mean) +
        ' <i>=</i> ' + cp.map(function (x) { return x.v.toFixed(1); }).join(' <i>+</i> ') + '</b></div>'
      : '<div class="pb"><small>Projection</small><b>' + U.fmt1(an.mean) + '</b></div>') +
      '<div class="pb"><small>Expected minutes</small><b>' + U.fmt1(pr.mins) + '</b></div>' +
      '<div class="pb"><small>Per minute</small><b>' + st.rate.toFixed(2) + '</b></div>' +
      '<div class="pb"><small>Matchup effect</small><b>' + U.signed(matchupPct * 100, 0) + '%</b></div>' +
      '<div class="pb"><small>Typical range</small><b>' + rangeTxt(an) + '</b></div>' +
      (Number.isFinite(an.mktMean) ? '<div class="pb"><small>' + esc(X.poss(row.book || 'Sportsbook')) + ' odds point to</small><b>' + U.fmt1(an.mktMean) + '</b></div>' : '') + '</div>';
    // chart
    var n = S.chartN || 10;
    h += '<div class="chart-head"><h3>Recent games vs line ' + U.fmtLine(row.line) + '</h3><div class="seg sm">' + [5, 10, 20].map(function (k) {
      return '<button class="' + (n === k ? 'on' : '') + '" data-chart-n="' + k + '">L' + k + '</button>';
    }).join('') + '</div></div>';
    h += '<div class="chart-wrap">' + CH.gameBars(p.games, stat, row.line, { n: n, label: p.name + ' ' + X.NOUN[stat] }) + '</div>';
    h += '<p class="legend"><span class="key k-over"></span>Over the line <span class="key k-under"></span>Under <span class="key k-line"></span>Line</p>';
    h += '<div class="hr-row">' + UI.hr('Last 5', an.hr.l5, an.side) + UI.hr('Last 10', an.hr.l10, an.side) + UI.hr('Last 20', an.hr.l20, an.side) +
      UI.hr(CH.seasonName(p.curSeason), an.hr.cur, an.side) + UI.hr(CH.seasonName(p.prevSeason), an.hr.prev, an.side) + UI.hr('vs ' + row.oppTeam.abbr, an.hr.h2h, an.side) + '</div>';
    h += '<p class="muted small">Hit rate for the ' + X.sideWord(an.side) + ' at ' + U.fmtLine(row.line) + '.</p>';
    // reasons
    if (rs.pros.length) h += '<h3>Why we like the ' + X.sideWord(an.side) + '</h3><ul class="reasons pros">' + rs.pros.slice(0, 5).map(li).join('') + '</ul>';
    if (rs.cons.length) h += '<h3>Watch out</h3><ul class="reasons cons">' + rs.cons.slice(0, 4).map(li).join('') + '</ul>';
    if (rs.info.length) h += '<h3>Good to know</h3><ul class="reasons info">' + rs.info.slice(0, 3).map(li).join('') + '</ul>';
    // averages table
    var a = p.avg;
    // combo props get their own column (PR / PA / PRA), next to the stats it adds up
    var comboTh = parts ? '<th class="tot">' + esc(M.STAT_SHORT[stat]) + '</th>' : '';
    h += '<h3>Averages</h3><div class="tbl-wrap"><table class="tbl mini"><thead><tr><th></th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>3PM</th>' + comboTh + '</tr></thead><tbody>';
    [['Last 5', 'l5'], ['Last 10', 'l10'], [CH.seasonName(p.curSeason), 'cur'], [CH.seasonName(p.prevSeason), 'prev']].forEach(function (x) {
      h += '<tr><td>' + esc(x[0]) + '</td>' + ['min', 'pts', 'reb', 'ast', 'fg3m'].map(function (s) {
        return '<td class="num' + (s === stat || (parts && parts.indexOf(s) >= 0) ? ' part' : '') + '">' + U.fmt1(a[s] && a[s][x[1]]) + '</td>';
      }).join('') + (parts ? '<td class="num tot">' + U.fmt1(a[stat] && a[stat][x[1]]) + '</td>' : '') + '</tr>';
    });
    h += '</tbody></table></div>';
    // game log: the stat this prop is about is colored green (over the line) or red (under)
    function vsLine(v) { return v > row.line ? ' over' : v < row.line ? ' under' : ''; }
    h += '<h3>Game log</h3><div class="tbl-wrap"><table class="tbl mini log"><thead><tr><th>Date</th><th>Opp</th><th>Result</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>3PM</th>' + comboTh + '</tr></thead><tbody>';
    p.games.slice(0, 15).forEach(function (gm) {
      h += '<tr><td>' + esc(U.shortDate(gm.ms)) + '</td><td>' + (gm.home ? 'vs ' : '@ ') + esc(gm.opp) + '</td><td>' + esc(gm.res + ' ' + (Number.isFinite(gm.ts) ? gm.ts + '-' + gm.os : '')) + '</td><td class="num">' + gm.min + '</td>' +
        ['pts', 'reb', 'ast', 'fg3m'].map(function (s) {
          var mark = s === stat ? vsLine(gm[s]) : (parts && parts.indexOf(s) >= 0 ? ' part' : '');
          return '<td class="num' + mark + '">' + gm[s] + '</td>';
        }).join('') +
        (parts ? '<td class="num tot' + vsLine(M.val(gm, stat)) + '">' + M.val(gm, stat) + '</td>' : '') + '</tr>';
    });
    h += '</tbody></table></div>';
    return sheet(p.name, h);
  };
  function li(r) { return '<li>' + esc(r.text) + '</li>'; }
  function rangeTxt(an) {
    var lo = Math.max(0, Math.round(an.mean - an.sd)), hi = Math.round(an.mean + an.sd);
    return lo + '–' + hi;
  }

  /* ---------------- GAME SHEET ---------------- */
  UI.gameSheet = function (S, gid) {
    var G = (S.games || []).filter(function (x) { return x.g.id === gid; })[0];
    if (!G) return sheet('Game', '<p class="muted">Game not found.</p>');
    var g = G.g, pred = G.pred, lv = G.live;
    var h = '<div class="gs-head">' + teamBlock(g.away, g, 'away') + '<div class="gc-mid">' + UI.status(g) +
      (g.status.state !== 'pre' ? '<div class="score">' + g.away.score + ' <span>–</span> ' + g.home.score + '</div>' : '<div class="vs">@</div>') +
      '<small class="muted">' + esc(g.venue || '') + '</small></div>' + teamBlock(g.home, g, 'home') + '</div>';
    if (!pred) return sheet(g.away.abbr + ' @ ' + g.home.abbr, h + '<p class="muted">Loading…</p>');
    if (lv && g.status.state !== 'pre') {
      h += '<h3>' + (g.status.state === 'in' ? 'Live lead tracker' : 'How the lead changed') + '</h3>' + liveBlock(G, false);
    }
    h += '<h3>' + (g.status.state === 'pre' ? 'Our prediction' : 'Our pre-game prediction') + '</h3>' + UI.winBar(g, pred.pHome);
    h += '<div class="proj-box"><div class="pb"><small>Predicted score</small><b>' + esc(g.away.abbr) + ' ' + U.fmt0(pred.away) + ' – ' + U.fmt0(pred.home) + ' ' + esc(g.home.abbr) + '</b></div>' +
      '<div class="pb"><small>Winning margin</small><b>' + esc(X.marginText(g, pred)) + '</b></div>' +
      '<div class="pb"><small>Total points</small><b>' + U.fmt0(pred.total) + '</b></div>' +
      (pred.pEspn != null ? '<div class="pb"><small>ESPN\'s predictor</small><b>' + esc((pred.pEspn >= 0.5 ? g.home.abbr : g.away.abbr) + ' ' + U.pct(Math.max(pred.pEspn, 1 - pred.pEspn))) + '</b></div>' : '') + '</div>';
    h += '<ul class="reasons">' + X.gameReasons(g, pred, G.tcHome, G.tcAway).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>';
    var mk = pred.markets || {};
    h += '<h3>Bets vs the sportsbook' + (G.odds ? ' <small class="muted">(' + esc(G.odds.provider) + ' via ESPN)</small>' : '') + '</h3>';
    if (!G.odds) h += '<p class="muted">No sportsbook line posted yet. Lines usually appear a day or two before the game.</p>';
    [['Spread', mk.spread, mk.spread && X.spreadText(g, pred, mk.spread), mk.spread && (mk.spread.side === 'home' ? mk.spread.pHome : mk.spread.pAway)],
      ['Total points', mk.total, mk.total && X.totalText(g, pred, mk.total), mk.total && (mk.total.side === 'over' ? mk.total.pOver : mk.total.pUnder)],
      ['Moneyline', mk.ml, mk.ml && X.mlText(g, pred, mk.ml), mk.ml && (mk.ml.side === 'home' ? mk.ml.pHome : 1 - mk.ml.pHome)]].forEach(function (x) {
      if (!x[1]) return;
      var t = x[2];
      h += '<div class="bet ' + (x[1].strength ? '' : 'bet-skip') + '"><div class="bet-top"><small>' + x[0] + '</small><b>' + esc(t.pick) + '</b>' + UI.badge(x[1].strength) + '</div>' +
        '<p>' + esc(t.why) + '</p><p class="win">' + esc(t.cond) + '</p><p class="muted">' + esc(t.chance) + (x[1].strength ? '' : ' Not enough edge — we\'d skip it.') + '</p></div>';
    });
    // team comparison
    h += '<h3>Team numbers</h3><div class="tbl-wrap"><table class="tbl mini"><thead><tr><th></th><th>' + esc(g.away.abbr) + '</th><th>' + esc(g.home.abbr) + '</th></tr></thead><tbody>';
    var A = pred.A, H = pred.H;
    var rowsT = [
      ['Points scored / game', U.fmt1(A.off) + ' <small>(' + U.ordinal(A.rank.off) + ')</small>', U.fmt1(H.off) + ' <small>(' + U.ordinal(H.rank.off) + ')</small>'],
      ['Points allowed / game', U.fmt1(A.def) + ' <small>(' + U.ordinal(A.rank.def) + ')</small>', U.fmt1(H.def) + ' <small>(' + U.ordinal(H.rank.def) + ')</small>'],
      ['Point differential', U.signed(A.net), U.signed(H.net)],
      ['This season', esc(recTxt(A.cur)), esc(recTxt(H.cur))],
      ['Last season', esc(recTxt(A.prev)), esc(recTxt(H.prev))],
      ['Played last night', pred.b2bAway ? 'Yes' : 'No', pred.b2bHome ? 'Yes' : 'No']
    ];
    rowsT.forEach(function (r) { h += '<tr><td>' + r[0] + '</td><td class="num">' + r[1] + '</td><td class="num">' + r[2] + '</td></tr>'; });
    h += '</tbody></table></div><p class="muted small">Early in the season these lean on last season, adjusted for summer roster changes.</p>';
    // injuries
    var inj = (G.sum && G.sum.injuries) || [];
    h += '<h3>Injuries</h3>';
    if (!inj.length) h += '<p class="muted">No injuries reported.</p>';
    else {
      h += '<ul class="inj">';
      inj.forEach(function (i) {
        var t = i.teamId === g.home.id ? g.home : g.away;
        h += '<li><span class="tag ' + (M.injuryWeight(i.status) >= 1 ? 'bad' : 'warn') + '">' + esc(i.status) + '</span> <b>' + esc(i.name) + '</b> <span class="muted">' + esc(t.abbr + (i.detail ? ' · ' + i.detail : '')) + '</span></li>';
      });
      h += '</ul>';
    }
    // props for this game
    var gameRows = (S.rows || []).filter(function (r) { return r.gameId === gid && r.an.strength; })
      .sort(function (a, b) { return b.an.edge - a.an.edge; }).slice(0, 8);
    if (gameRows.length) {
      h += '<h3>Best props in this game</h3><div class="mini-props">' + gameRows.map(function (r) {
        return '<button class="mp" data-open-player="' + esc(r.prof.id) + '" data-stat="' + r.stat + '" data-game="' + esc(gid) + '">' + UI.head(r.prof) +
          '<span><b>' + esc(r.prof.name) + '</b><small>' + esc(X.NOUN[r.stat]) + '</small></span>' + UI.side(r.an.side, r.line) + '<span class="muted">' + U.pctc(chance(r.an)) + '</span></button>';
      }).join('') + '</div>';
    }
    // live box leaders
    if (G.sum && G.sum.players && G.sum.players.length && g.status.state !== 'pre') {
      h += '<h3>Box score</h3>';
      [g.away, g.home].forEach(function (t) {
        var ps = G.sum.players.filter(function (p) { return p.teamId === t.id && !p.dnp; }).sort(function (a, b) { return b.min - a.min; });
        h += '<div class="tbl-wrap"><table class="tbl mini"><thead><tr><th>' + esc(t.abbr) + '</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>3PM</th><th>PF</th></tr></thead><tbody>' +
          ps.map(function (p) { return '<tr><td>' + esc(p.short || p.name) + (p.starter ? ' <small class="muted">S</small>' : '') + '</td><td class="num">' + p.min + '</td><td class="num"><b>' + p.pts + '</b></td><td class="num">' + p.reb + '</td><td class="num">' + p.ast + '</td><td class="num">' + p.fg3m + '</td><td class="num">' + p.pf + '</td></tr>'; }).join('') +
          '</tbody></table></div>';
      });
    }
    return sheet(g.away.abbr + ' @ ' + g.home.abbr, h);
  };
  function recTxt(t) { return t && t.gp ? t.w + '-' + t.l : '–'; }

  /* ---------------- SETTINGS ---------------- */
  UI.settingsSheet = function (S) {
    var st = S.settings;
    var h = '<div class="set"><h3>Live updates</h3><p class="muted">How often to refresh while games are on.</p><div class="seg">' + [10, 15, 30, 60].map(function (s) {
      return '<button class="' + (st.liveEvery === s ? 'on' : '') + '" data-set="liveEvery" data-val="' + s + '">' + s + 's</button>';
    }).join('') + '</div></div>';
    h += '<div class="set"><h3>Look</h3><div class="seg">' + [['dark', 'Midnight'], ['light', 'Daylight'], ['auto', 'Match my device']].map(function (x) {
      return '<button class="' + (st.theme === x[0] ? 'on' : '') + '" data-set="theme" data-val="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div></div>';
    h += '<div class="set"><h3>Saved data</h3><p class="muted">Player stats are saved on this device so the app opens faster. Clear them if something looks stuck.</p>' +
      '<button class="btn" data-act="reload-data">Reload all data</button> <button class="btn ghost" data-act="clear-lines">Clear my typed lines</button></div>';
    h += '<div class="set"><h3>About the data</h3><p class="muted">Scores, box scores, injuries and sportsbook lines (DraftKings) come from ESPN\'s public NBA feed — the same one espn.com uses. ' +
      'It isn\'t an official developer API, so ESPN could change it without notice. Requests this session: ' + E.stats.requests + ' (' + E.stats.failures + ' failed).</p></div>';
    return sheet('Settings', h);
  };

  /* ---------------- HOW IT WORKS ---------------- */
  UI.guideView = function () {
    function q(t, body) { return '<details class="faq"><summary>' + t + '</summary><div>' + body + '</div></details>'; }
    var h = '<section class="hero"><div><span class="eyebrow">Plain English</span><h1>How it works</h1><p class="sub">Betting words explained simply, and what JJ Props does behind the scenes.</p></div></section>';
    h += '<div class="guide">';
    h += '<div class="card"><h2>Reading a pick in 5 seconds</h2><ol class="steps">' +
      '<li><b>' + UI.side('over', 24.5, 'pts') + '</b> — the bet. "Over 24.5 points" means he needs 25 or more.</li>' +
      '<li>' + UI.badge('good') + ' — how much we like it: <i>Strong</i> &gt; <i>Good</i> &gt; <i>Slight lean</i>. "No clear edge" means skip.</li>' +
      '<li><b>62% chance</b> — out of 100 bets like this, we expect about 62 to win.</li>' +
      '<li><b>needs 53%</b> — how often it must win to be worth betting. The bigger the gap above it, the better the pick.</li>' +
      '<li><b>Hit rate</b> — how often this bet would have won lately (e.g. <span class="hr hr-4"><em>L10</em><b>7/10</b></span>).</li>' +
      '<li><b>Why</b> — the 2–3 biggest reasons, in plain words.</li></ol></div>';
    h += q('What is Over / Under?', '<p>The sportsbook picks a number (the <b>line</b>), like 24.5 points. You bet that the player (or both teams together) will go <b>over</b> it or stay <b>under</b> it. Lines usually end in .5 so there\'s no tie. If the line is a whole number and it lands exactly on it, you get your money back (a <b>push</b>).</p>');
    h += q('What are PR, PA and PRA?', '<p>They\'re <b>combo props</b>: two or three of a player\'s stats added together into one number.</p>' +
      '<ul><li><b>PR</b> = points + rebounds</li><li><b>PA</b> = points + assists</li><li><b>PRA</b> = points + rebounds + assists</li></ul>' +
      '<p>Example: he scores 18 points with 7 rebounds and 4 assists. That\'s <b>25 PR</b> (18 + 7), <b>22 PA</b> (18 + 4) and <b>29 PRA</b>. If the PR line is 23.5, the OVER wins because 25 is more than 23.5.</p>' +
      '<p>Our combo projection adds up his projected points, rebounds and assists (the player page shows each part), and the chance comes from how much that total usually swings for him. A quiet night in one stat can be made up by another — but sportsbooks know that too, so combos aren\'t automatically easier to win.</p>');
    h += q('What is the spread (winning margin)?', '<p>The spread evens out a mismatch. <b>Celtics −6.5</b> means the Celtics must win by <b>7 or more</b> for that bet to win. <b>Lakers +6.5</b> wins if the Lakers win, or lose by <b>6 or fewer</b>. Our "Winning margin" is our guess of how many points the winner wins by — we compare it with the sportsbook\'s spread.</p>');
    h += q('How does the Auto Parlay work?', '<p>A <b>parlay</b> joins several bets into one ticket: it pays a lot more, but <b>every leg must win</b>. On Top Picks, choose 5–10 legs and a style — JJ Props fills the slip for you:</p>' +
      '<p><b>Best value</b> picks the legs where our chance beats the DraftKings price by the most. <b>Safest</b> picks the legs most likely to hit. We use one leg per player, spread legs across different games (legs from the same game tend to win or lose together), and only use real lines on games that haven\'t started.</p>' +
      '<p>"Chance all hit" multiplies the leg chances: five legs at 55% each hit only about <b>5%</b> of the time (1 in 20); ten legs about <b>0.3%</b>. That\'s why the payout is big. Tap the swap button on any leg to replace it with the next best one, and "Copy slip" to paste it anywhere.</p>');
    h += q('What is the moneyline?', '<p>Just pick who wins. Odds like <b>−150</b> mean bet $150 to win $100 (favorite). <b>+130</b> means bet $100 to win $130 (underdog). Every price hides a "break-even" chance: −150 needs you to be right 60% of the time.</p>');
    h += q('What do "chance" and "needs" mean?', '<p><b>Chance</b> is how often we think the bet wins. <b>Needs</b> is how often it must win to be worth it. At standard odds (−110) you risk $110 to win $100, so you must win about <b>52.4%</b> of the time just to break even. We only call something a pick when our chance is clearly above what it needs — the gap is the <b>edge</b>. The small mark on each bar shows the "needs" level.</p>' +
      '<p>For <b>estimated lines</b> (no sportsbook line), "needs" can be higher than 52%. Example: a player averages 6.1 rebounds and the line is 6.5 — the under already wins a bit more than half the time just because of where the line sits, so a sportsbook would charge more for it. That\'s why a 58% under can be only a "Slight lean" while a 56% pick on another player is a "Good pick".</p>');
    h += q('How does the app predict player stats?', '<ol><li><b>Minutes:</b> how long he usually plays, weighted toward recent games.</li><li><b>Production per minute:</b> his points, rebounds, assists and threes per minute, this season and last.</li><li><b>Matchup:</b> does the opponent give up a lot of points? Is it a fast, high-scoring game?</li><li><b>Situation:</b> home or away, tired from last night, teammates out (more shots for him), blowout risk.</li><li><b>Swings:</b> how much his numbers bounce around game to game. That sets how sure we can be.</li><li><b>Combos (PR, PA, PRA):</b> his projected points, rebounds and assists added up.</li></ol><p>Projection = minutes × per-minute production × adjustments. The chance comes from a curve around that projection.</p>');
    h += q('How does the app predict games?', '<p>We compare how many points each team scores and allows per game, add home-court (≈2.4 pts), subtract value for injured players and back-to-backs, and blend in ESPN\'s own matchup predictor. That gives a predicted score, a win chance, a winning margin and a total.</p>');
    h += q('What updates live?', '<p>During games the app checks ESPN every 15 seconds (change it in Settings). Scores, the lead tracker (current lead, biggest lead, lead changes, ties, scoring runs), live win chance and live prop chances ("needs 6 more points in ~14 minutes") all update on their own.</p>');
    h += q('Why can\'t any pick be guaranteed?', '<p>Basketball is random: hot nights, foul trouble, blowouts, surprise injuries. Sportsbooks are also very good at setting lines. A 60% pick still loses 4 times out of 10. Treat this as a smart second opinion, not a sure thing.</p>');
    h += q('Where do the lines come from?', '<p>All lines are <b>DraftKings</b> lines shown by ESPN: game lines (spread, total, moneyline) and player props (points, rebounds, assists, 3-pointers, and the combos PR, PA and PRA) with their over / under odds. DraftKings usually posts player lines on game day. Until then — and for deep-bench players it doesn\'t offer — the app uses an <b>estimated line</b> from the player\'s average.</p>' +
      '<p>Betting somewhere else? Type that sportsbook\'s line in the Line box — the pick and the explanation update instantly and the app remembers it.</p>' +
      '<p>With a real line, our chance is <b>half our model, half DraftKings\' own odds</b>. Sportsbooks are usually close to right, so this keeps us honest: we only call a pick when our model clearly disagrees with the book. Early in the season — before a player has about 12 games — and for players on a new team, DraftKings\' odds count even more (80–90%), because our numbers are mostly from last season. That\'s also why most real-line picks are "Slight leans": big edges against a sportsbook are rare.</p>');
    h += '<div class="card soft">' + I.info + '<div><b>Bet responsibly.</b> For people 21+ where sports betting is legal. Set a budget, never chase losses, and take breaks. If betting stops being fun, reach out to a support line in your country.</div></div>';
    h += '</div>';
    return h;
  };

  /* ---------------- modal shell ---------------- */
  function sheet(title, body) {
    return '<div class="overlay" data-close-modal></div><section class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<button class="icon-btn close" data-close-modal aria-label="Close">' + I.close + '</button><div class="sheet-body">' + body + '</div></section>';
  }
  UI.sheet = sheet;
})();
