/* JJ Props — app.js
 * Wires everything together: picks the right date, loads the data, runs the models,
 * keeps live games refreshing in real time, and handles every click and tap.
 */
(function () {
  'use strict';
  var HE = window.HE;
  var U = HE.util, E = HE.espn, M = HE.model, UI = HE.ui, P = HE.parlay, store = HE.store;

  var S = (HE.state = {
    date: null, todayEt: U.etYmd(), calendar: [], seasons: { cur: null, prev: null },
    tab: 'picks', board: null, boardCache: {}, summaries: {}, standings: {}, league: null,
    rosters: {}, logs: {}, boxLogs: {}, b2b: {}, oddsSaved: store.getSetting('odds', {}),
    games: [], rows: [], loading: { active: false }, lastUpdate: 0, nextUpdateAt: 0,
    error: null, offline: false,
    filters: { game: 'all', stat: 'pts', sort: 'edge', q: '', picksOnly: false },
    modal: null, chartN: 10,
    settings: { liveEvery: store.getSetting('liveEvery', 15), theme: store.getSetting('theme', 'dark') },
    parlay: { legs: store.getSetting('parlayLegs', 5), mode: store.getSetting('parlayMode', 'best'), excluded: {} },
    userLines: store.getSetting('lines', {}),
    propSnaps: {},
    loadToken: 0, timer: null, dirty: false
  });
  var limit = U.limiter(10);
  function errNull() { return null; }
  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------------ */
  /* start-up                                                            */
  /* ------------------------------------------------------------------ */
  function init() {
    applyTheme();
    setupPWA();
    bindEvents();
    S.tab = tabFromHash() || 'picks';
    pruneLines();
    render();
    chooseStartDate().then(function (d) { loadDate(d); });
    setInterval(function () {
      renderStatus();
      var t = U.etYmd();
      if (t !== S.todayEt) { S.todayEt = t; renderDates(true); }
    }, 1000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && S.pausedHidden) { S.pausedHidden = false; tick(); }
    });
    window.addEventListener('online', function () { if (S.date) tick(); });
  }

  function setupPWA() {
    var hosted = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!hosted) return;
    var l = document.createElement('link');
    l.rel = 'manifest'; l.href = 'manifest.webmanifest';
    document.head.appendChild(l);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(errNull);
  }

  function seasonGuess(ymd) {
    var y = +ymd.slice(0, 4), m = +ymd.slice(4, 6);
    return m >= 8 ? y + 1 : y;
  }

  function cacheBoard(ymd, b) { S.boardCache[ymd] = { at: Date.now(), board: b }; }

  function chooseStartDate() {
    var today = U.etYmd();
    S.todayEt = today;
    return E.getScoreboard(today).then(function (b) {
      cacheBoard(today, b);
      if (b.calendar.length) S.calendar = b.calendar;
      if (b.games.some(function (g) { return g.status.state === 'in'; })) return today;
      var y = U.addDays(today, -1);
      return E.getScoreboard(y).catch(errNull).then(function (yb) {
        if (yb) cacheBoard(y, yb);
        if (yb && yb.games.some(function (g) { return g.status.state === 'in'; })) return y;
        if (b.games.some(function (g) { return g.status.state === 'pre'; })) return today;
        var next = (S.calendar || []).filter(function (d) { return d > today; })[0];
        return next || today;
      });
    }).catch(function () { return today; });
  }

  /* ------------------------------------------------------------------ */
  /* loading a date                                                      */
  /* ------------------------------------------------------------------ */
  function setLoading(label, done, total) {
    S.loading = label ? { active: true, label: label, done: done || 0, total: total || 0 } : { active: false };
  }

  function rememberOdds(games) {
    var changed = false;
    games.forEach(function (g) {
      if (g.odds && g.status.state === 'pre') { S.oddsSaved[g.id] = g.odds; changed = true; }
    });
    if (changed) {
      var keys = Object.keys(S.oddsSaved);
      if (keys.length > 120) keys.slice(0, keys.length - 120).forEach(function (k) { delete S.oddsSaved[k]; });
      store.setSetting('odds', S.oddsSaved);
    }
  }

  /* ------------------------------------------------------------------ */
  /* sportsbook player lines (DraftKings via ESPN)                       */
  /* ------------------------------------------------------------------ */
  // Pre-game lines are saved per date, so started and finished games keep comparing
  // with the line you could actually bet before tip-off (not in-game lines).
  function snapKey(ymd) { return 'pls:' + ymd; }
  function loadSnaps(ymd) {
    if (S.propSnaps[ymd]) return Promise.resolve(S.propSnaps[ymd]);
    return store.get(snapKey(ymd)).then(function (v) { S.propSnaps[ymd] = v || {}; return S.propSnaps[ymd]; }).catch(function () { S.propSnaps[ymd] = {}; return S.propSnaps[ymd]; });
  }
  var saveSnapsSoon = {};
  function saveSnaps(ymd) {
    clearTimeout(saveSnapsSoon[ymd]);
    saveSnapsSoon[ymd] = setTimeout(function () { store.set(snapKey(ymd), S.propSnaps[ymd] || {}); }, 1500);
    var idx = store.getSetting('plsDates', []);
    if (idx.indexOf(ymd) < 0) {
      idx.push(ymd); idx.sort();
      var cutoff = U.addDays(U.etYmd(), -12);
      idx.filter(function (d) { return d < cutoff; }).forEach(function (d) { store.del(snapKey(d)); delete S.propSnaps[d]; });
      store.setSetting('plsDates', idx.filter(function (d) { return d >= cutoff; }));
    }
  }
  function countLines(lines) { return lines ? Object.keys(lines).length : 0; }
  function loadProps(G, ymd, force) {
    var g = G.g, o = g.odds || S.oddsSaved[g.id] || {};
    return loadSnaps(ymd).then(function (snaps) {
      var snap = snaps[g.id];
      var started = g.status.state !== 'pre';
      if (started && snap && countLines(snap.lines)) { G.props = snap; return; }
      return limit(function () { return E.getPropLines(g.id, o.providerId, o.provider, force); }).then(function (pl) {
        if (!pl) return;
        G.propsAt = Date.now();
        if (!started) {
          G.props = pl;
          if (countLines(pl.lines)) { snaps[g.id] = { at: pl.at, lines: pl.lines, book: pl.book }; saveSnaps(ymd); }
          return;
        }
        // started without a saved snapshot: only lines last set before tip-off count
        var cut = g.startMs + 2 * 60 * 1000, lines = {};
        Object.keys(pl.lines).forEach(function (aid) {
          Object.keys(pl.lines[aid]).forEach(function (st) {
            var r = pl.lines[aid][st];
            if (r.updated && r.updated <= cut) (lines[aid] = lines[aid] || {})[st] = r;
          });
        });
        G.props = { at: pl.at, lines: lines, book: pl.book };
      });
    }).catch(errNull);
  }

  function loadDate(ymd, opts) {
    opts = opts || {};
    var token = ++S.loadToken;
    clearTimeout(S.timer);
    S.date = ymd; S.error = null; S.games = []; S.rows = []; S.board = null;
    S.parlay.excluded = {};
    S.filters.game = 'all';
    setLoading('Loading games…');
    render();
    var cachedB = S.boardCache[ymd];
    var boardP = (!opts.force && cachedB && Date.now() - cachedB.at < 20000) ? Promise.resolve(cachedB.board) : E.getScoreboard(ymd);
    return boardP.then(function (board) {
      if (token !== S.loadToken) return;
      cacheBoard(ymd, board);
      S.board = board; S.offline = false; S.lastUpdate = Date.now();
      if (board.calendar.length) S.calendar = board.calendar;
      var cur = board.seasonYear || seasonGuess(ymd);
      S.seasons = { cur: cur, prev: cur - 1 };
      rememberOdds(board.games);
      S.games = board.games.map(function (g) { return { g: g, sum: null, pred: null, rows: [], ready: false }; });
      if (!board.games.length) { setLoading(null); render(); return; }
      setLoading('Loading team numbers…');
      render();
      return Promise.all([
        E.getStandings(cur, true, opts.force).catch(errNull),
        E.getStandings(cur - 1, false).catch(errNull),
        E.getScoreboard(U.addDays(ymd, -1)).catch(errNull)
      ]).then(function (res) {
        if (token !== S.loadToken) return;
        S.standings = { cur: res[0], prev: res[1] };
        S.league = M.buildLeague(res[0], res[1]);
        S.league.anchor = M.marketAnchor(S.games.map(function (G) {
          return { g: G.g, odds: G.g.odds || S.oddsSaved[G.g.id] };
        }), S.league);
        S.b2b = {};
        if (res[2]) res[2].games.forEach(function (g) { S.b2b[g.home.id] = true; S.b2b[g.away.id] = true; });
        return Promise.all(S.games.map(function (G) {
          return Promise.all([
            limit(function () { return E.getSummary(G.g.id); }, true).then(function (sum) { S.summaries[G.g.id] = sum; G.sum = sum; }).catch(errNull),
            loadProps(G, ymd, opts.force),
            limit(function () { return E.getRoster(G.g.home.id, opts.force); }, true).then(function (r) { S.rosters[G.g.home.id] = r; }).catch(errNull),
            limit(function () { return E.getRoster(G.g.away.id, opts.force); }, true).then(function (r) { S.rosters[G.g.away.id] = r; }).catch(errNull)
          ]).then(function () {
            if (token !== S.loadToken) return;
            mergeBox(G); computeGame(G); collectRows(); renderSoon();
          });
        }));
      }).then(function () {
        if (token !== S.loadToken) return;
        var jobs = [];
        S.games.forEach(function (G) {
          [G.g.home.id, G.g.away.id].forEach(function (tid) {
            (S.rosters[tid] || []).forEach(function (a) { jobs.push({ G: G, a: a }); });
          });
        });
        var pending = {};
        jobs.forEach(function (j) { pending[j.G.g.id] = (pending[j.G.g.id] || 0) + 1; });
        setLoading('Loading player stats…', 0, jobs.length);
        render();
        var done = 0;
        return Promise.all(jobs.map(function (j) {
          return loadLogs(j.a.id, opts.force).catch(errNull).then(function () {
            if (token !== S.loadToken) return;
            done++; S.loading.done = done;
            pending[j.G.g.id]--;
            if (pending[j.G.g.id] === 0) { j.G.ready = true; computeGame(j.G); collectRows(); }
            renderSoon();
          });
        }));
      }).then(function () {
        if (token !== S.loadToken) return;
        S.games.forEach(computeGame);
        collectRows();
        setLoading(null);
        render();
      });
    }).catch(function (e) {
      if (token !== S.loadToken) return;
      S.offline = navigator.onLine === false;
      S.error = friendlyError(e);
      setLoading(null);
      render();
    }).then(function () {
      if (token === S.loadToken) scheduleRefresh();
    });
  }

  function loadLogs(id, force) {
    var have = S.logs[id];
    if (have && have.done && !force && Date.now() - have.at < 30 * 60 * 1000) return Promise.resolve(have);
    var cur = S.seasons.cur, prev = S.seasons.prev;
    return Promise.all([
      limit(function () { return E.getGamelog(id, cur, true, force); }).catch(errNull),
      limit(function () { return E.getGamelog(id, prev, false); }).catch(errNull)
    ]).then(function (r) {
      if (r[0] == null && r[1] == null) return null;
      var lg = { cur: r[0] || [], prev: r[1] || [], old: [], done: true, at: Date.now() };
      if (lg.cur.length || lg.prev.length) return (S.logs[id] = lg);
      // no games this season or last (a long injury, or a rookie): look one more season back
      return limit(function () { return E.getGamelog(id, prev - 1, false); }).catch(errNull).then(function (old) {
        lg.old = old || [];
        return (S.logs[id] = lg);
      });
    });
  }

  /** a finished game's box score becomes part of each player's game log right away */
  function mergeBox(G) {
    var g = G.g, sum = G.sum;
    if (!sum || g.status.state !== 'post' || !sum.players) return;
    sum.players.forEach(function (p) {
      if (p.dnp || !(p.min > 0)) return;
      S.boxLogs[p.id] = S.boxLogs[p.id] || {};
      S.boxLogs[p.id][g.id] = E.boxToLog(p, g, S.seasons.cur);
    });
  }

  function liveState(g) {
    return { state: g.status.state, period: g.status.period, clockSec: g.status.clockSec, homeScore: g.home.score, awayScore: g.away.score };
  }

  function gpOf(tid) {
    var t = S.standings.cur && S.standings.cur.teams && S.standings.cur.teams[tid];
    return t ? t.gp : 0;
  }

  /* ------------------------------------------------------------------ */
  /* the models, per game                                                */
  /* ------------------------------------------------------------------ */
  function computeGame(G) {
    var g = G.g, L = S.league;
    if (!L) return;
    var sum = S.summaries[g.id] || G.sum;
    G.sum = sum;
    var injBy = {};
    ((sum && sum.injuries) || []).forEach(function (i) { injBy[i.athleteId] = i; });
    var cutoff = g.startMs - 60000;   // a projection only uses games played before tip-off
    ['home', 'away'].forEach(function (side) {
      var team = g[side];
      G[side + 'P'] = (S.rosters[team.id] || []).map(function (a) {
        var lg = S.logs[a.id];
        if (!lg || !lg.done) return null;
        var inj = injBy[a.id];
        var status = inj ? inj.status : (a.injury || null);
        var bx = S.boxLogs[a.id] ? Object.keys(S.boxLogs[a.id]).map(function (k) { return S.boxLogs[a.id][k]; }) : [];
        var curLogs = lg.cur.concat(bx).filter(function (x) { return x.ms < cutoff; });
        var prevLogs = lg.prev.concat(lg.old || []).filter(function (x) { return x.ms < cutoff; });
        return M.buildProfile({
          id: a.id, name: a.name, short: a.short, pos: a.pos, headshot: a.headshot, teamId: team.id,
          status: status, statusDetail: inj ? inj.detail : ''
        }, curLogs, prevLogs, S.seasons, Math.min(Date.now(), g.startMs));
      }).filter(Boolean);
    });
    G.tcHome = M.teamContext(G.homeP, gpOf(g.home.id));
    G.tcAway = M.teamContext(G.awayP, gpOf(g.away.id));
    // started games: compare with the closing pre-game line, not in-game odds
    G.odds = (g.status.state !== 'pre' && S.oddsSaved[g.id]) || g.odds || (sum && sum.odds) || S.oddsSaved[g.id] || null;
    G.pred = M.predictGame(g, L, {
      injHome: G.tcHome, injAway: G.tcAway, b2bHome: !!S.b2b[g.home.id], b2bAway: !!S.b2b[g.away.id],
      predictor: sum && sum.predictor, odds: G.odds
    });
    var live = liveState(g);
    G.live = (g.status.state !== 'pre' && G.pred) ? M.liveGame(G.pred, live, G.odds) : null;
    G.rows = [];
    if (!G.pred) return;
    var PL = (G.props && G.props.lines) || {}, book = (G.props && G.props.book) || 'DraftKings';
    var boxBy = {};
    ((sum && sum.players) || []).forEach(function (p) { boxBy[p.id] = p; });
    ['home', 'away'].forEach(function (side) {
      var team = g[side], oppT = g[side === 'home' ? 'away' : 'home'];
      var tc = side === 'home' ? G.tcHome : G.tcAway;
      var missingNames = tc.missing.filter(function (m) { return m.w >= 0.75 && m.impact >= 0.4; }).slice(0, 2)
        .map(function (m) { return m.name; }).join(' and ');
      var ctx = {
        lg: L.lg, team: L.ratings[team.id], opp: L.ratings[oppT.id], home: side === 'home', neutral: g.neutral,
        b2b: !!S.b2b[team.id], absMargin: Math.abs(G.pred.margin), tc: tc, teamGamesCur: gpOf(team.id)
      };
      if (!ctx.team || !ctx.opp) return;
      G[side + 'P'].forEach(function (prof) {
        if (prof.empty || M.injuryWeight(prof.status) >= 1) return;
        var bookP = PL[prof.id] || null;
        // the sportsbook offering lines on him means he's expected to play real minutes
        if (prof.minBase < (bookP ? 10 : M.CONFIG.MIN_MINUTES_FOR_PROPS)) return;
        var proj = M.projectPlayer(prof, ctx);
        var box = boxBy[prof.id];
        M.STATS.forEach(function (stat) {
          var bk = bookP && bookP[stat];
          if (!bk && !(prof.base[stat] >= M.MIN_BASE_FOR_PROP[stat])) return;
          var key = S.date + ':' + prof.id + ':' + stat;
          var ul = S.userLines[key];
          var est = M.defaultLine(prof, stat);
          var defLine = bk ? bk.line : est;
          var line = Number.isFinite(ul) ? ul : defLine;
          if (!Number.isFinite(line)) return;
          var useBook = bk && !Number.isFinite(ul);
          var an = M.analyzeProp(proj, prof, stat, line, {
            oppId: oppT.id, gtd: M.isGTD(prof.status), estimated: !Number.isFinite(ul) && !bk,
            market: bk ? { line: bk.line, over: bk.over, under: bk.under, book: book } : null,
            overOdds: useBook ? bk.over : undefined, underOdds: useBook ? bk.under : undefined
          });
          var row = {
            key: key, gameId: g.id, game: g, prof: prof, proj: proj, stat: stat, line: line, defLine: defLine,
            lineSource: Number.isFinite(ul) ? 'user' : bk ? 'book' : 'est', book: bk ? book : null, bookLine: bk || null,
            an: an, team: team, oppTeam: oppT, opp: ctx.opp,
            oppId: oppT.id, nTeams: L.nTeams, tc: tc, missingNames: missingNames, isHome: side === 'home',
            b2b: ctx.b2b, absMargin: ctx.absMargin, favShort: G.pred.margin >= 0 ? g.home.short : g.away.short
          };
          if (box && g.status.state !== 'pre') {
            if (box.dnp) row.dnp = true;
            else row.live = M.livePlayer(proj, prof, box, live, stat, line);
          }
          G.rows.push(row);
        });
      });
    });
  }

  function collectRows() {
    var all = [];
    S.games.forEach(function (G) { all = all.concat(G.rows || []); });
    S.rows = all;
  }

  /* ------------------------------------------------------------------ */
  /* real-time refresh                                                   */
  /* ------------------------------------------------------------------ */
  function scheduleRefresh() {
    clearTimeout(S.timer);
    var games = S.board ? S.board.games : [];
    var now = Date.now();
    var anyLive = games.some(function (g) { return g.status.state === 'in'; });
    var soon = games.some(function (g) { return g.status.state === 'pre' && g.startMs - now < 30 * 60 * 1000; });
    var anyPre = games.some(function (g) { return g.status.state === 'pre'; });
    var ms = (anyLive || soon) ? S.settings.liveEvery * 1000 : anyPre ? 120000 : 600000;
    if (S.error) ms = Math.min(ms, 30000);
    S.nextUpdateAt = now + ms;
    S.timer = setTimeout(tick, ms);
  }

  var ticking = false;
  function tick() {
    if (ticking || !S.date) return;
    if (document.hidden) { S.pausedHidden = true; return; }
    if (S.loading && S.loading.active) { scheduleRefresh(); return; }
    ticking = true;
    var token = S.loadToken;
    E.getScoreboard(S.date).then(function (board) {
      if (token !== S.loadToken) return;
      S.offline = false; S.error = null; S.lastUpdate = Date.now();
      rememberOdds(board.games);
      if (board.calendar.length) S.calendar = board.calendar;
      var byId = {};
      board.games.forEach(function (g) { byId[g.id] = g; });
      var needSum = [];
      S.games.forEach(function (G) {
        var ng = byId[G.g.id];
        if (!ng) return;
        var was = G.g.status.state;
        G.g = ng;
        var st = ng.status.state;
        var stale = !G.sum || Date.now() - G.sum.fetchedAt > 5 * 60 * 1000;
        if (st === 'in' || (st === 'post' && was !== 'post') || (st === 'pre' && stale) || (st === 'post' && !G.sum)) needSum.push(G);
        else computeGame(G);
      });
      S.board = board;
      var needProps = S.games.filter(function (G) {
        return G.g.status.state === 'pre' && (!G.propsAt || Date.now() - G.propsAt > 5 * 60 * 1000);
      });
      var propsP = Promise.all(needProps.map(function (G) {
        return loadProps(G, S.date).then(function () { if (token === S.loadToken && needSum.indexOf(G) < 0) computeGame(G); });
      }));
      return Promise.all(needSum.map(function (G) {
        return limit(function () { return E.getSummary(G.g.id); }, true).then(function (sum) {
          if (token !== S.loadToken) return;
          S.summaries[G.g.id] = sum; G.sum = sum;
          mergeBox(G);
          computeGame(G);
        }).catch(errNull);
      }).concat([propsP])).then(function () {
        if (token !== S.loadToken) return;
        collectRows();
        render();
      });
    }).catch(function (e) {
      S.offline = navigator.onLine === false;
      S.error = S.offline ? 'You\'re offline — showing the last saved data.' : 'Couldn\'t reach ESPN just now (' + ((e && e.message) || 'network error') + '). Retrying automatically.';
      render();
    }).then(function () {
      ticking = false;
      if (token === S.loadToken) scheduleRefresh();
    });
  }

  function friendlyError(e) {
    var m = (e && e.message) || String(e);
    if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Couldn\'t reach ESPN\'s data feed. Check your internet connection — the app will keep retrying.';
    if (/abort/i.test(m)) return 'ESPN took too long to answer. Retrying…';
    return 'ESPN\'s data feed had a problem (' + m + '). Retrying automatically.';
  }

  /* ------------------------------------------------------------------ */
  /* your own lines                                                      */
  /* ------------------------------------------------------------------ */
  function saveLines() { store.setSetting('lines', S.userLines); }
  function pruneLines() {
    var cutoff = U.addDays(U.etYmd(), -10), changed = false;
    Object.keys(S.userLines).forEach(function (k) {
      if (k.slice(0, 8) < cutoff) { delete S.userLines[k]; changed = true; }
    });
    if (changed) saveLines();
  }
  function rowByKey(key) {
    for (var i = 0; i < S.rows.length; i++) if (S.rows[i].key === key) return S.rows[i];
    return null;
  }
  function commitLine(key, raw) {
    var v = parseFloat(String(raw).replace(',', '.'));
    var row = rowByKey(key);
    if (!Number.isFinite(v) || v < 0 || v > 300) { render(true); return; }
    v = Math.round(v * 2) / 2;
    var def = row ? row.defLine : NaN;
    if (row && v === def) {
      // back to the sportsbook's (or estimated) line → use it again, with its real odds
      if (row.lineSource === 'user') { delete S.userLines[key]; saveLines(); recompute(row); } else render(true);
      return;
    }
    S.userLines[key] = v;
    saveLines();
    recompute(row);
  }
  function recompute(row) {
    if (row) {
      var G = S.games.filter(function (x) { return x.g.id === row.gameId; })[0];
      if (G) computeGame(G);
    }
    collectRows();
    render(true);
  }

  /* ------------------------------------------------------------------ */
  /* rendering                                                           */
  /* ------------------------------------------------------------------ */
  var renderSoon = U.throttle(function () { render(); }, 400);

  function view() {
    if (S.tab === 'guide') return UI.guideView(S);
    if (!S.date) return '<div class="boot"><div class="spinner"></div><p>Getting today\'s NBA games…</p></div>';
    if (S.tab === 'games') return UI.gamesView(S);
    if (S.tab === 'props') return UI.propsView(S);
    if (S.tab === 'guide') return UI.guideView(S);
    return UI.picksView(S);
  }

  function isEditing(container) {
    var a = document.activeElement;
    return !!(a && container && container.contains(a) && (a.tagName === 'INPUT' && a.type !== 'checkbox' && a.type !== 'date'));
  }

  function render(force) {
    renderStatus();
    renderTabs();
    renderDates();
    var banner = $('banner');
    if (banner) banner.innerHTML = UI.banner(S);
    var main = $('main');
    if (main) {
      if (isEditing(main) && !force) S.dirty = true;
      else {
        var a = document.activeElement, keepSearch = a && a.matches && a.matches('input[data-filter="q"]');
        main.innerHTML = view();
        S.dirty = false;
        if (keepSearch) {
          var s = main.querySelector('input[data-filter="q"]');
          if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
        }
      }
    }
    renderModal(force);
  }

  function renderStatus() {
    var el = $('status');
    if (el) el.innerHTML = UI.statusPill(S);
  }
  function renderTabs() {
    var btns = document.querySelectorAll('.tabs [data-tab]');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-tab') === S.tab;
      btns[i].classList.toggle('on', on);
      btns[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }
  var lastDatesKey = '';
  function renderDates(force) {
    var el = $('datebar');
    if (!el || !S.date) return;
    var key = S.date + '|' + S.todayEt + '|' + (S.calendar || []).length;
    if (!force && key === lastDatesKey) return;
    lastDatesKey = key;
    el.innerHTML = UI.dateBar(S);
    var on = el.querySelector('.date.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function renderModal(force) {
    var rootEl = $('modal-root');
    if (!rootEl) return;
    if (!S.modal) {
      if (rootEl.innerHTML) { rootEl.innerHTML = ''; document.body.classList.remove('modal-open'); }
      return;
    }
    if (isEditing(rootEl) && !force) { S.dirty = true; return; }
    var body = rootEl.querySelector('.sheet-body');
    var scroll = body ? body.scrollTop : 0;
    var m = S.modal, html;
    if (m.type === 'player') html = UI.playerSheet(S, m.id, m.stat, m.gid);
    else if (m.type === 'game') html = UI.gameSheet(S, m.id);
    else html = UI.settingsSheet(S);
    rootEl.innerHTML = html;
    document.body.classList.add('modal-open');
    var nb = rootEl.querySelector('.sheet-body');
    if (nb) nb.scrollTop = scroll;
  }

  function openModal(m) {
    S.modal = m;
    S.lastFocus = document.activeElement;
    renderModal(true);
    var close = document.querySelector('#modal-root .close');
    if (close) close.focus();
  }
  function closeModal() {
    S.modal = null;
    renderModal(true);
    if (S.dirty) render();
    if (S.lastFocus && S.lastFocus.focus) { try { S.lastFocus.focus(); } catch (e) { /* ignore */ } }
  }

  /* ------------------------------------------------------------------ */
  /* theme, tabs                                                         */
  /* ------------------------------------------------------------------ */
  function applyTheme() {
    var t = S.settings.theme;
    if (t === 'auto') t = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    var dark = t !== 'light';
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#060912' : '#eef1fb');
    var btn = $('theme-btn');
    if (btn) btn.innerHTML = dark ? UI.icons.sun : UI.icons.moon;
  }
  function tabFromHash() {
    var h = (location.hash || '').replace('#', '');
    return ['picks', 'games', 'props', 'guide'].indexOf(h) >= 0 ? h : null;
  }
  function setTab(t) {
    S.tab = t;
    if (location.hash !== '#' + t) history.replaceState(null, '', '#' + t);
    render(true);
    window.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------ */
  /* events                                                              */
  /* ------------------------------------------------------------------ */
  function bindEvents() {
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusout', function () {
      setTimeout(function () { if (S.dirty && !isEditing($('main')) && !isEditing($('modal-root'))) render(); }, 0);
    });
    window.addEventListener('hashchange', function () { var t = tabFromHash(); if (t && t !== S.tab) setTab(t); });
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', applyTheme);
    }
    bindTooltips();
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }
  function copySlip() {
    var slip = UI.currentSlip && UI.currentSlip(S);
    if (!slip || !slip.legs.length) { toast('No legs to copy yet'); return; }
    var text = P.slipText(slip, P.stats(slip.legs), U.ymdLabel(S.date));
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        toast(ok ? 'Slip copied — paste it anywhere' : 'Couldn\'t copy on this browser');
      } catch (err) { toast('Couldn\'t copy on this browser'); }
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast('Slip copied — paste it anywhere'); }, fallback);
    } else fallback();
  }
  HE.app_toast = toast;

  function onClick(e) {
    var t = e.target;
    var el;
    if ((el = t.closest('[data-close-modal]'))) { closeModal(); return; }
    // ---- Auto Parlay ----
    if ((el = t.closest('[data-parlay-legs]'))) {
      S.parlay.legs = +el.getAttribute('data-parlay-legs'); store.setSetting('parlayLegs', S.parlay.legs); render(true); return;
    }
    if ((el = t.closest('[data-parlay-mode]'))) {
      S.parlay.mode = el.getAttribute('data-parlay-mode'); store.setSetting('parlayMode', S.parlay.mode); render(true); return;
    }
    if ((el = t.closest('[data-parlay-drop]'))) {
      e.stopPropagation();
      S.parlay.excluded[el.getAttribute('data-parlay-drop')] = 1; render(true);
      toast('Swapped in the next best leg'); return;
    }
    if ((el = t.closest('[data-parlay-reset]'))) { S.parlay.excluded = {}; render(true); return; }
    if ((el = t.closest('[data-parlay-copy]'))) { copySlip(); return; }
    if ((el = t.closest('.lstep'))) {
      e.stopPropagation();
      var key = el.getAttribute('data-key'), row = rowByKey(key);
      if (row) commitLine(key, row.line + parseFloat(el.getAttribute('data-step')));
      return;
    }
    if (t.closest('.line-ed')) { e.stopPropagation(); return; }
    if ((el = t.closest('[data-tab]'))) { if (S.modal) closeModal(); setTab(el.getAttribute('data-tab')); return; }
    if ((el = t.closest('[data-date]'))) {
      var d = el.getAttribute('data-date');
      if (S.modal) closeModal();
      if (d !== S.date) loadDate(d);
      return;
    }
    if ((el = t.closest('[data-sheet-stat]'))) {
      S.modal = { type: 'player', id: el.getAttribute('data-pid'), stat: el.getAttribute('data-sheet-stat'), gid: el.getAttribute('data-game') };
      renderModal(true); return;
    }
    if ((el = t.closest('[data-chart-n]'))) { S.chartN = +el.getAttribute('data-chart-n'); renderModal(true); return; }
    if ((el = t.closest('[data-reset-line]'))) {
      var k = el.getAttribute('data-reset-line');
      delete S.userLines[k]; saveLines();
      recompute(rowByKey(k)); return;
    }
    if ((el = t.closest('[data-open-player]'))) {
      openModal({ type: 'player', id: el.getAttribute('data-open-player'), stat: el.getAttribute('data-stat') || 'pts', gid: el.getAttribute('data-game') });
      return;
    }
    if ((el = t.closest('[data-open-game]'))) { openModal({ type: 'game', id: el.getAttribute('data-open-game') }); return; }
    if ((el = t.closest('[data-props-game]'))) {
      S.filters.game = el.getAttribute('data-props-game');
      if (S.modal) closeModal();
      setTab('props'); return;
    }
    if ((el = t.closest('[data-filter]')) && el.tagName === 'BUTTON') {
      S.filters[el.getAttribute('data-filter')] = el.getAttribute('data-val');
      render(true); return;
    }
    if ((el = t.closest('[data-set]'))) {
      var name = el.getAttribute('data-set'), val = el.getAttribute('data-val');
      if (name === 'liveEvery') { S.settings.liveEvery = +val; store.setSetting('liveEvery', +val); scheduleRefresh(); }
      if (name === 'theme') { S.settings.theme = val; store.setSetting('theme', val); applyTheme(); }
      renderModal(true); renderStatus(); return;
    }
    if ((el = t.closest('[data-act]'))) {
      var act = el.getAttribute('data-act');
      if (act === 'settings') openModal({ type: 'settings' });
      else if (act === 'refresh') { if (S.loading.active) return; tick(); }
      else if (act === 'retry') { S.error = null; if (S.games.length && S.league) tick(); else loadDate(S.date || U.etYmd()); }
      else if (act === 'theme') {
        var darkNow = document.documentElement.getAttribute('data-theme') !== 'light';
        S.settings.theme = darkNow ? 'light' : 'dark';
        store.setSetting('theme', S.settings.theme); applyTheme(); renderModal(true);
      } else if (act === 'reload-data') {
        store.clearAll().then(function () {
          S.logs = {}; S.rosters = {}; S.boardCache = {};
          closeModal(); loadDate(S.date, { force: true });
        });
      } else if (act === 'clear-lines') {
        S.userLines = {}; saveLines();
        S.games.forEach(computeGame); collectRows(); render(true);
      }
      return;
    }
  }

  function onChange(e) {
    var t = e.target;
    if (t.matches('[data-datepick]')) {
      var v = (t.value || '').replace(/-/g, '');
      if (/^\d{8}$/.test(v) && v !== S.date) loadDate(v);
      return;
    }
    if (t.matches('.line-in')) { commitLine(t.getAttribute('data-line'), t.value); return; }
    if (t.matches('select[data-filter]')) { S.filters[t.getAttribute('data-filter')] = t.value; render(true); return; }
    if (t.matches('input[type=checkbox][data-filter]')) { S.filters[t.getAttribute('data-filter')] = t.checked; render(true); }
  }

  var searchRender = U.throttle(function () { render(true); }, 250);
  function onInput(e) {
    var t = e.target;
    if (t.matches('input[data-filter="q"]')) { S.filters.q = t.value; searchRender(); }
  }

  function onKey(e) {
    if (e.key === 'Escape' && S.modal) { closeModal(); return; }
    var t = e.target;
    if (e.key === 'Enter') {
      if (t.matches && t.matches('.line-in')) { e.preventDefault(); t.blur(); return; }
      if (t.matches && t.matches('[data-open-player],[data-open-game]') && t.tagName !== 'BUTTON') { e.preventDefault(); t.click(); }
    }
  }

  /* ------------------------------------------------------------------ */
  /* tooltips + lead-chart crosshair                                     */
  /* ------------------------------------------------------------------ */
  function bindTooltips() {
    var tip = $('tooltip');
    if (!tip) return;
    function show(text, x, y) {
      tip.textContent = text;
      tip.style.display = 'block';
      var w = tip.offsetWidth, h = tip.offsetHeight;
      var left = Math.min(window.innerWidth - w - 8, Math.max(8, x - w / 2));
      var top = y - h - 14;
      if (top < 8) top = y + 18;
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
    }
    function hide() { tip.style.display = 'none'; }
    document.addEventListener('pointermove', function (e) {
      var t = e.target;
      var f = t.closest && t.closest('svg.flow');
      if (f) { flowHover(f, e, show); return; }
      var d = t.closest && t.closest('[data-tip]');
      if (d) show(d.getAttribute('data-tip'), e.clientX, e.clientY);
      else hide();
    });
    document.addEventListener('pointerleave', hide);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('focusin', function (e) {
      var d = e.target.closest && e.target.closest('[data-tip]');
      if (d) { var r = d.getBoundingClientRect(); show(d.getAttribute('data-tip'), r.left + r.width / 2, r.top); }
    });
    document.addEventListener('focusout', hide);
  }

  function flowHover(svgEl, e, show) {
    var data;
    try { data = svgEl._flow || (svgEl._flow = JSON.parse(svgEl.getAttribute('data-flow'))); } catch (err) { return; }
    var r = svgEl.getBoundingClientRect();
    var scale = r.width / 640;
    var xv = (e.clientX - r.left) / scale;
    var tt = U.clamp((xv - data.ml) / data.pw * data.end, 0, data.end);
    var pts = data.pts, k = 0;
    for (var i = 0; i < pts.length; i++) { if (pts[i][0] <= tt) k = i; else break; }
    var p = pts[k];
    var cross = svgEl.querySelector('.cross');
    var cx = data.ml + (tt / data.end) * data.pw;
    if (cross) { cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.style.display = ''; }
    var home = svgEl.getAttribute('data-home'), away = svgEl.getAttribute('data-away');
    var lead = p[1] - p[2];
    show(timeLabel(tt) + ' · ' + away + ' ' + p[2] + ' – ' + p[1] + ' ' + home + (lead ? ' (' + (lead > 0 ? home : away) + ' +' + Math.abs(lead) + ')' : ' (tied)'), e.clientX, e.clientY);
  }
  function timeLabel(t) {
    var per, left;
    if (t < 2880) { per = Math.min(4, Math.floor(t / 720) + 1); left = per * 720 - t; }
    else { var o = Math.floor((t - 2880) / 300); per = 5 + o; left = 2880 + (o + 1) * 300 - t; }
    var m = Math.floor(left / 60), s = Math.floor(left % 60);
    return U.periodName(per) + ' ' + m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ------------------------------------------------------------------ */
  HE.app = { loadDate: loadDate, tick: tick, render: render, computeGame: computeGame };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
