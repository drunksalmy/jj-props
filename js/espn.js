/* JJ Props — espn.js
 * Talks to ESPN's public NBA data feed (the same feed espn.com uses) and turns the raw
 * JSON into small, tidy objects the rest of the app understands.
 *   scoreboard  → today's games, scores, live clock, sportsbook lines (DraftKings via ESPN)
 *   summary     → box score, injuries, play-by-play (lead tracker), ESPN win probability
 *   standings   → points scored / allowed per game for every team (team strength)
 *   roster      → players on a team (+ injury status)
 *   gamelog     → every game a player played in a season (props history)
 *   propBets    → DraftKings player prop lines (points, rebounds, assists, 3s, P+R, P+A, P+R+A) + their odds
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var HE = (root.HE = root.HE || {});
  var U = HE.util;
  var E = (HE.espn = {});

  E.SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
  E.V2 = 'https://site.api.espn.com/apis/v2/sports/basketball/nba';
  E.WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba';
  E.CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';
  E.stats = { requests: 0, failures: 0, lastOk: 0, lastError: '', inflight: 0 };

  E.logo = function (abbr) {
    return 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500/' + String(abbr || 'nba').toLowerCase() + '.png&h=80&w=80';
  };
  E.headshot = function (id) {
    return 'https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/' + id + '.png&w=96&h=70&scale=crop&cquality=40';
  };

  /* ------------------------------------------------------------------ */
  /* network                                                             */
  /* ------------------------------------------------------------------ */
  E.fetchJSON = function (url, opts) {
    opts = opts || {};
    var timeout = opts.timeout || 15000, retries = opts.retries == null ? 2 : opts.retries;
    var attempt = 0;
    function once() {
      var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeout) : null;
      E.stats.requests++; E.stats.inflight++;
      return fetch(url, { signal: ctrl ? ctrl.signal : undefined, credentials: 'omit' })
        .then(function (res) {
          if (!res.ok) { var err = new Error('HTTP ' + res.status); err.status = res.status; throw err; }
          return res.json();
        })
        .then(function (data) { E.stats.lastOk = Date.now(); return data; })
        .catch(function (e) {
          E.stats.failures++;
          var retryable = !(e && e.status >= 400 && e.status < 500);
          if (retryable && attempt < retries) {
            attempt++;
            return U.sleep(700 * attempt).then(once);
          }
          E.stats.lastError = (e && e.message) || String(e);
          throw e;
        })
        .finally(function () { E.stats.inflight--; if (timer) clearTimeout(timer); });
    }
    return once();
  };

  /* ------------------------------------------------------------------ */
  /* small parsing helpers                                               */
  /* ------------------------------------------------------------------ */
  function hex(c) { return c ? '#' + String(c).replace(/^#/, '') : null; }
  function numLine(v) {
    if (v == null) return NaN;
    if (typeof v === 'number') return v;
    var s = String(v).trim().replace(/^[ou]/i, '');
    if (/^(pk|pick|even)$/i.test(s)) return 0;
    return U.num(s, NaN);
  }
  function close(side) { return side ? (side.close || side.current || side.open || null) : null; }

  function parseStatus(s) {
    s = s || {};
    var t = s.type || {};
    var clockSec = U.num(s.clock, NaN);
    if (!Number.isFinite(clockSec)) clockSec = U.clockToSec(s.displayClock);
    var off = /POSTPONED|CANCELED|CANCELLED|SUSPENDED|FORFEIT/i.test(t.name || '');
    return {
      state: off ? 'pre' : (t.state || 'pre'),
      off: off,
      name: t.name || '',
      completed: !!t.completed,
      detail: t.detail || t.description || '',
      shortDetail: t.shortDetail || t.detail || '',
      period: U.num(s.period, 0),
      clockSec: clockSec,
      displayClock: s.displayClock || ''
    };
  }

  function teamFromComp(c) {
    c = c || {};
    var t = c.team || {};
    var recs = c.records || c.record || [];
    if (!Array.isArray(recs)) recs = [];
    function rec(type) {
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        if (r && (r.type === type || String(r.name || '').toLowerCase() === type)) return r.summary || r.displayValue || null;
      }
      return null;
    }
    var abbr = t.abbreviation || '?';
    return {
      id: String(t.id || c.id || ''),
      abbr: abbr,
      name: t.displayName || t.name || abbr,
      short: t.shortDisplayName || t.name || abbr,
      location: t.location || '',
      color: hex(t.color),
      alt: hex(t.alternateColor),
      logo: E.logo(abbr),
      score: U.num(c.score && typeof c.score === 'object' ? c.score.value : c.score, 0),
      record: rec('total') || rec('overall') || '',
      homeRec: rec('home'),
      roadRec: rec('road'),
      linescores: (c.linescores || []).map(function (l) { return U.num(l.value != null ? l.value : l.displayValue, 0); }),
      winner: !!c.winner
    };
  }

  /* ------------------------------------------------------------------ */
  /* odds                                                                */
  /* ------------------------------------------------------------------ */
  function homeSpreadFrom(o, homeAbbr, awayAbbr) {
    var hl = o.pointSpread && close(o.pointSpread.home);
    var v = hl ? numLine(hl.line) : NaN;
    if (Number.isFinite(v)) return v;
    var m = String(o.details || '').match(/^\s*([A-Za-z]{2,5})\s+([+-]?\d+(?:\.\d+)?)/);
    if (m) {
      var ab = m[1].toUpperCase(), x = parseFloat(m[2]);
      if (homeAbbr && ab === String(homeAbbr).toUpperCase()) return x;
      if (awayAbbr && ab === String(awayAbbr).toUpperCase()) return -x;
    }
    var s = U.num(o.spread, NaN);
    if (Number.isFinite(s)) {
      if (o.homeTeamOdds && o.homeTeamOdds.favorite) return -Math.abs(s);
      if (o.awayTeamOdds && o.awayTeamOdds.favorite) return Math.abs(s);
      return s;
    }
    if (/\b(pk|pick|even)\b/i.test(o.details || '')) return 0;
    return NaN;
  }

  E.parseOdds = function (o, homeAbbr, awayAbbr) {
    if (!o || typeof o !== 'object') return null;
    var ml = o.moneyline || {}, ps = o.pointSpread || {}, tot = o.total || {};
    function first() {
      for (var i = 0; i < arguments.length; i++) {
        var n = numLine(arguments[i]);
        if (Number.isFinite(n)) return n;
      }
      return null;
    }
    var hml = close(ml.home), aml = close(ml.away), hs = close(ps.home), as = close(ps.away), ov = close(tot.over), un = close(tot.under);
    var spread = homeSpreadFrom(o, homeAbbr, awayAbbr);
    var out = {
      provider: (o.provider && (o.provider.displayName || o.provider.name)) || 'Sportsbook',
      providerId: o.provider && o.provider.id != null ? String(o.provider.id) : null,
      details: o.details || '',
      spread: Number.isFinite(spread) ? spread : null,
      total: first(o.overUnder, ov && ov.line),
      homeML: first(o.homeTeamOdds && o.homeTeamOdds.moneyLine, hml && hml.odds),
      awayML: first(o.awayTeamOdds && o.awayTeamOdds.moneyLine, aml && aml.odds),
      homeSpreadOdds: first(o.homeTeamOdds && o.homeTeamOdds.spreadOdds, hs && hs.odds),
      awaySpreadOdds: first(o.awayTeamOdds && o.awayTeamOdds.spreadOdds, as && as.odds),
      overOdds: first(o.overOdds, ov && ov.odds),
      underOdds: first(o.underOdds, un && un.odds),
      open: {
        spread: first(ps.home && ps.home.open && ps.home.open.line),
        total: first(tot.over && tot.over.open && tot.over.open.line),
        homeML: first(ml.home && ml.home.open && ml.home.open.odds),
        awayML: first(ml.away && ml.away.open && ml.away.open.odds)
      }
    };
    if (out.spread == null && out.total == null && out.homeML == null) return null;
    return out;
  };

  /* ------------------------------------------------------------------ */
  /* scoreboard                                                          */
  /* ------------------------------------------------------------------ */
  E.parseScoreboard = function (j) {
    j = j || {};
    var lg = (j.leagues || [])[0] || {};
    var season = lg.season || j.season || {};
    var games = (j.events || []).map(function (ev) {
      var c = (ev.competitions || [])[0] || {};
      var comps = c.competitors || [];
      var hc = comps.filter(function (x) { return x.homeAway === 'home'; })[0] || comps[0];
      var ac = comps.filter(function (x) { return x.homeAway === 'away'; })[0] || comps[1];
      if (!hc || !ac) return null;
      var g = {
        id: String(ev.id),
        startISO: c.date || ev.date,
        status: parseStatus(c.status || ev.status),
        neutral: !!c.neutralSite,
        venue: c.venue ? [c.venue.fullName, c.venue.address && c.venue.address.city].filter(Boolean).join(', ') : '',
        broadcasts: [].concat.apply([], (c.broadcasts || []).map(function (b) { return b.names || []; })),
        note: ((c.notes || [])[0] || {}).headline || '',
        seasonType: ev.season && ev.season.type,
        home: teamFromComp(hc),
        away: teamFromComp(ac)
      };
      g.startMs = Date.parse(g.startISO) || 0;
      g.odds = E.parseOdds((c.odds || [])[0], g.home.abbr, g.away.abbr);
      return g;
    }).filter(Boolean);
    games.sort(function (a, b) { return a.startMs - b.startMs; });
    var calendar = (lg.calendar || []).map(function (d) {
      var s = typeof d === 'string' ? d : (d && (d.startDate || d.value || d.date)) || '';
      return s.slice(0, 10).replace(/-/g, '');
    }).filter(function (s) { return /^\d{8}$/.test(s); });
    return {
      seasonYear: U.num(season.year, 0) || null,
      seasonType: season.type ? U.num(season.type.type != null ? season.type.type : season.type.id, 0) : null,
      day: j.day && j.day.date ? String(j.day.date).replace(/-/g, '') : null,
      games: games,
      calendar: calendar
    };
  };

  /* ------------------------------------------------------------------ */
  /* game summary                                                        */
  /* ------------------------------------------------------------------ */
  function splitMA(v) {
    if (typeof v !== 'string' || v.indexOf('-') < 0) return [0, 0];
    var p = v.split('-');
    return [U.num(p[0], 0), U.num(p[1], 0)];
  }

  E.parseSummary = function (j, eventId) {
    j = j || {};
    var hc = ((j.header && j.header.competitions) || [])[0] || {};
    var comps = hc.competitors || [];
    var homeC = comps.filter(function (c) { return c.homeAway === 'home'; })[0] || {};
    var awayC = comps.filter(function (c) { return c.homeAway === 'away'; })[0] || {};
    var homeT = teamFromComp(homeC), awayT = teamFromComp(awayC);
    var out = {
      id: String(eventId || (j.header && j.header.id) || ''),
      status: parseStatus(hc.status),
      homeId: homeT.id, awayId: awayT.id,
      homeAbbr: homeT.abbr, awayAbbr: awayT.abbr,
      homeScore: homeT.score, awayScore: awayT.score,
      fetchedAt: Date.now(),
      odds: E.parseOdds((j.pickcenter || [])[0] || (j.odds || [])[0], homeT.abbr, awayT.abbr),
      predictor: null,
      injuries: [],
      players: [],
      teamStats: {},
      flow: null,
      winprob: null
    };

    var pr = j.predictor;
    if (pr && pr.homeTeam) {
      var ph = U.num(pr.homeTeam.gameProjection, NaN), pa = U.num(pr.awayTeam && pr.awayTeam.gameProjection, NaN);
      if (Number.isFinite(ph)) out.predictor = { home: ph / 100, away: Number.isFinite(pa) ? pa / 100 : 1 - ph / 100 };
    }

    (j.injuries || []).forEach(function (grp) {
      var teamId = String((grp.team || {}).id || '');
      (grp.injuries || []).forEach(function (inj) {
        var a = inj.athlete || {}, d = inj.details || {};
        out.injuries.push({
          teamId: teamId,
          athleteId: String(a.id || ''),
          name: a.displayName || '',
          status: inj.status || (inj.type && inj.type.description) || '',
          detail: [d.side, d.type, d.detail].filter(Boolean).join(' '),
          returnDate: d.returnDate || null,
          date: inj.date || null
        });
      });
    });

    ((j.boxscore && j.boxscore.players) || []).forEach(function (team) {
      var teamId = String((team.team || {}).id || '');
      (team.statistics || []).forEach(function (grp) {
        var keys = grp.keys || [];
        (grp.athletes || []).forEach(function (a) {
          var st = a.stats || [];
          function get(k) { var i = keys.indexOf(k); return i >= 0 ? st[i] : undefined; }
          var fg = splitMA(get('fieldGoalsMade-fieldGoalsAttempted'));
          var tp = splitMA(get('threePointFieldGoalsMade-threePointFieldGoalsAttempted'));
          var ft = splitMA(get('freeThrowsMade-freeThrowsAttempted'));
          var ath = a.athlete || {};
          out.players.push({
            teamId: teamId,
            id: String(ath.id || ''),
            name: ath.displayName || '',
            short: ath.shortName || '',
            pos: (ath.position || {}).abbreviation || '',
            headshot: (ath.headshot || {}).href || null,
            starter: !!a.starter,
            dnp: !!a.didNotPlay || !st.length,
            reason: a.reason || '',
            ejected: !!a.ejected,
            min: U.num(get('minutes'), 0),
            pts: U.num(get('points'), 0),
            reb: U.num(get('rebounds'), 0),
            ast: U.num(get('assists'), 0),
            tov: U.num(get('turnovers'), 0),
            stl: U.num(get('steals'), 0),
            blk: U.num(get('blocks'), 0),
            oreb: U.num(get('offensiveRebounds'), 0),
            dreb: U.num(get('defensiveRebounds'), 0),
            pf: U.num(get('fouls'), 0),
            pm: U.num(get('plusMinus'), 0),
            fgm: fg[0], fga: fg[1], fg3m: tp[0], fg3a: tp[1], ftm: ft[0], fta: ft[1]
          });
        });
      });
    });

    ((j.boxscore && j.boxscore.teams) || []).forEach(function (t) {
      var id = String((t.team || {}).id || '');
      var m = {};
      (t.statistics || []).forEach(function (s) { m[s.name] = s.displayValue; });
      out.teamStats[id] = {
        largestLead: U.num(m.largestLead, NaN),
        leadChanges: U.num(m.leadChanges, NaN),
        leadPct: U.num(m.leadPercentage, NaN),
        fg: m['fieldGoalsMade-fieldGoalsAttempted'] || '',
        tp: m['threePointFieldGoalsMade-threePointFieldGoalsAttempted'] || '',
        reb: U.num(m.totalRebounds, NaN),
        ast: U.num(m.assists, NaN),
        tov: U.num(m.totalTurnovers != null ? m.totalTurnovers : m.turnovers, NaN)
      };
    });

    var plays = j.plays || [];
    out.flow = E.computeFlow(plays);
    if (out.flow) out.flow.lastPlay = (plays[plays.length - 1] || {}).text || '';

    var wp = j.winprobability || [];
    if (wp.length) {
      var tById = {};
      plays.forEach(function (p) {
        tById[p.id] = U.elapsedSec(U.num(p.period && p.period.number, 1), U.clockToSec(p.clock && p.clock.displayValue));
      });
      var series = [];
      var step = Math.max(1, Math.floor(wp.length / 160));
      for (var i = 0; i < wp.length; i += step) {
        var w = wp[i];
        if (tById[w.playId] != null) series.push({ t: tById[w.playId], p: U.num(w.homeWinPercentage, 0.5) });
      }
      var last = wp[wp.length - 1];
      out.winprob = { home: U.num(last.homeWinPercentage, NaN), series: series };
    }
    return out;
  };

  /** score margin over time + lead tracker numbers from the play-by-play */
  E.computeFlow = function (plays) {
    if (!plays || !plays.length) return null;
    var lastH = 0, lastA = 0, prevLeader = 0, cur = 0;
    var leadChanges = 0, timesTied = 0, maxHome = 0, maxAway = 0;
    var points = [{ t: 0, h: 0, a: 0 }];
    var scoring = [];
    plays.forEach(function (p) {
      var h = U.num(p.homeScore, lastH), a = U.num(p.awayScore, lastA);
      if (h === lastH && a === lastA) return;
      var t = U.elapsedSec(U.num(p.period && p.period.number, 1), U.clockToSec(p.clock && p.clock.displayValue));
      if (h > lastH) scoring.push({ t: t, side: 'home', pts: h - lastH });
      if (a > lastA) scoring.push({ t: t, side: 'away', pts: a - lastA });
      var m = h - a;
      var nl = m > 0 ? 1 : m < 0 ? -1 : 0;
      if (nl === 0 && cur !== 0) timesTied++;
      if (nl !== 0 && prevLeader !== 0 && nl !== prevLeader) leadChanges++;
      if (nl !== 0) prevLeader = nl;
      cur = nl;
      if (m > maxHome) maxHome = m;
      if (-m > maxAway) maxAway = -m;
      points.push({ t: t, h: h, a: a });
      lastH = h; lastA = a;
    });
    // unanswered run: points by the last team to score since the other team last scored
    var run = null;
    if (scoring.length) {
      var side = scoring[scoring.length - 1].side, pts = 0;
      for (var i = scoring.length - 1; i >= 0 && scoring[i].side === side; i--) pts += scoring[i].pts;
      run = { side: side, pts: pts };
    }
    return {
      points: points,
      leadChanges: leadChanges,
      timesTied: timesTied,
      largestLead: { home: maxHome, away: maxAway },
      run: run,
      homeScore: lastH,
      awayScore: lastA
    };
  };

  /* ------------------------------------------------------------------ */
  /* standings / roster / gamelog                                        */
  /* ------------------------------------------------------------------ */
  E.parseStandings = function (j) {
    j = j || {};
    var teams = {};
    var season = U.num((j.season && j.season.year), 0) || null;
    (j.children || []).forEach(function (conf) {
      var st = conf.standings || {};
      if (!season && st.season) season = U.num(typeof st.season === 'object' ? st.season.year : st.season, 0) || null;
      (st.entries || []).forEach(function (e) {
        var t = e.team || {}, v = {}, disp = {};
        (e.stats || []).forEach(function (s) {
          v[s.name] = s.value;
          disp[String(s.type || s.name).toLowerCase()] = s.displayValue;
        });
        var w = U.num(v.wins, 0), l = U.num(v.losses, 0);
        teams[String(t.id)] = {
          id: String(t.id), abbr: t.abbreviation, name: t.displayName, short: t.shortDisplayName || t.name,
          conf: conf.abbreviation || conf.name || '',
          w: w, l: l, gp: w + l,
          ppg: U.num(v.avgPointsFor, NaN), oppg: U.num(v.avgPointsAgainst, NaN), diff: U.num(v.differential, NaN),
          seed: U.num(v.playoffSeed, NaN),
          home: disp.home || null, road: disp.road || null, l10: disp.lasttengames || null, streak: disp.streak || null
        };
      });
    });
    return { season: season, teams: teams };
  };

  E.parseRoster = function (j) {
    var list = (j && j.athletes) || [];
    if (list.length && list[0] && Array.isArray(list[0].items)) {
      list = [].concat.apply([], list.map(function (g) { return g.items || []; }));
    }
    return list.map(function (a) {
      var inj = (a.injuries || [])[0];
      return {
        id: String(a.id),
        name: a.displayName || a.fullName || '',
        short: a.shortName || '',
        pos: (a.position || {}).abbreviation || '',
        posName: (a.position || {}).displayName || '',
        jersey: a.jersey || '',
        headshot: (a.headshot || {}).href || null,
        age: a.age || null,
        exp: a.experience ? a.experience.years : null,
        height: a.displayHeight || '',
        injury: inj ? (inj.status || null) : null
      };
    });
  };

  E.parseGamelog = function (j, wantSeason) {
    j = j || {};
    var names = j.names || [];
    function ix(n) { return names.indexOf(n); }
    var iMin = ix('minutes'), iFG = ix('fieldGoalsMade-fieldGoalsAttempted'),
      i3 = ix('threePointFieldGoalsMade-threePointFieldGoalsAttempted'), iFT = ix('freeThrowsMade-freeThrowsAttempted'),
      iReb = ix('totalRebounds'), iAst = ix('assists'), iBlk = ix('blocks'), iStl = ix('steals'),
      iPf = ix('fouls'), iTo = ix('turnovers'), iPts = ix('points');
    var meta = j.events || {};
    var out = [], seen = {};
    (j.seasonTypes || []).forEach(function (st) {
      var dn = String(st.displayName || '');
      if (/pre\s*-?season|all-?star|summer/i.test(dn)) return;
      var type = /post|play-?in|playoff/i.test(dn) ? 'post' : 'reg';
      var ym = dn.match(/(\d{4})-(\d{2})/);
      var seasonYear = ym ? (+ym[1] + 1) : (wantSeason || null);
      if (wantSeason && seasonYear !== wantSeason) return;
      (st.categories || []).forEach(function (cat) {
        if (cat.type && cat.type !== 'event') return;
        (cat.events || []).forEach(function (ev) {
          var id = String(ev.eventId);
          if (seen[id]) return;
          seen[id] = 1;
          var m = meta[id] || {}, s = ev.stats || [];
          var fg = splitMA(s[iFG]), tp = splitMA(s[i3]), ft = splitMA(s[iFT]);
          var teamId = String((m.team || {}).id || '');
          var home = m.atVs ? m.atVs !== '@' : String(m.homeTeamId) === teamId;
          out.push({
            id: id,
            ms: Date.parse(m.gameDate) || 0,
            season: seasonYear,
            st: type,
            teamId: teamId || String((home ? m.homeTeamId : m.awayTeamId) || ''),
            oppId: String((m.opponent || {}).id || ''),
            opp: (m.opponent || {}).abbreviation || '',
            home: home,
            res: m.gameResult || '',
            ts: U.num(home ? m.homeTeamScore : m.awayTeamScore, NaN),
            os: U.num(home ? m.awayTeamScore : m.homeTeamScore, NaN),
            min: U.num(s[iMin], 0),
            pts: U.num(s[iPts], 0),
            reb: U.num(s[iReb], 0),
            ast: U.num(s[iAst], 0),
            stl: U.num(s[iStl], 0),
            blk: U.num(s[iBlk], 0),
            tov: U.num(s[iTo], 0),
            pf: U.num(s[iPf], 0),
            fgm: fg[0], fga: fg[1], fg3m: tp[0], fg3a: tp[1], ftm: ft[0], fta: ft[1]
          });
        });
      });
    });
    out.sort(function (a, b) { return b.ms - a.ms; });
    return out;
  };

  /** turn a box-score line from a finished game into a game-log entry (instant updates) */
  E.boxToLog = function (p, game, season) {
    var home = p.teamId === game.home.id;
    var me = home ? game.home : game.away, op = home ? game.away : game.home;
    return {
      id: game.id, ms: game.startMs, season: season, st: game.seasonType === 3 ? 'post' : 'reg',
      teamId: p.teamId, oppId: op.id, opp: op.abbr, home: home,
      res: me.score > op.score ? 'W' : 'L', ts: me.score, os: op.score,
      min: p.min, pts: p.pts, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk, tov: p.tov, pf: p.pf,
      fgm: p.fgm, fga: p.fga, fg3m: p.fg3m, fg3a: p.fg3a, ftm: p.ftm, fta: p.fta, fromBox: true
    };
  };

  /* ------------------------------------------------------------------ */
  /* cached getters                                                      */
  /* ------------------------------------------------------------------ */
  var HOUR = 3600 * 1000;
  function cached(key, maxAgeMs, loader, force) {
    return HE.store.get(key).then(function (c) {
      if (!force && c && c.at && (Date.now() - c.at) < maxAgeMs) return c.data;
      return loader().then(function (data) {
        HE.store.set(key, { at: Date.now(), data: data });
        return data;
      }).catch(function (e) {
        if (c && c.data) return c.data;   // offline → use saved copy
        throw e;
      });
    });
  }

  E.getScoreboard = function (ymd) {
    return E.fetchJSON(E.SITE + '/scoreboard?dates=' + ymd).then(E.parseScoreboard);
  };
  E.getSummary = function (id) {
    return E.fetchJSON(E.SITE + '/summary?event=' + id).then(function (j) { return E.parseSummary(j, id); });
  };
  E.getStandings = function (season, isCurrent, force) {
    return cached('st:' + season, isCurrent ? 15 * 60 * 1000 : 7 * 24 * HOUR, function () {
      return E.fetchJSON(E.V2 + '/standings?season=' + season).then(E.parseStandings);
    }, force);
  };
  E.getRoster = function (teamId, force) {
    return cached('ro:' + teamId, 6 * HOUR, function () {
      return E.fetchJSON(E.SITE + '/teams/' + teamId + '/roster').then(E.parseRoster);
    }, force);
  };
  /* ------------------------------------------------------------------ */
  /* player prop lines (DraftKings via ESPN)                             */
  /* ------------------------------------------------------------------ */
  // ESPN prop type ids: 87 = Total Points and Assists, 88 = Total Points and Rebounds, 90 = Points, Rebounds and Assists
  var PROP_TYPES = { '1': 'pts', '2': 'ast', '3': 'reb', '4': 'fg3m', '87': 'pa', '88': 'pr', '90': 'pra' };
  E.PROP_TYPES = PROP_TYPES;
  function bookName(n) { return /draft\s*kings/i.test(n || '') ? 'DraftKings' : (n || 'Sportsbook'); }
  E.bookName = bookName;

  /**
   * Turn ESPN's propBets list into { athleteId: { pts: {line, over, under, updated, openLine}, ... } }.
   * Every over/under market comes as two entries with the same player, stat and line: ESPN lists
   * the OVER first and the UNDER second (checked against the "X+ points" milestone prices).
   */
  E.parsePropBets = function (items) {
    var groups = {}, order = [];
    (items || []).forEach(function (it) {
      var stat = it && it.type && PROP_TYPES[String(it.type.id)];
      if (!stat || !it.athlete || !it.athlete.$ref) return;
      var m = /athletes\/(\d+)/.exec(it.athlete.$ref);
      if (!m) return;
      var line = U.num(it.current && it.current.target && it.current.target.value, NaN);
      if (!Number.isFinite(line)) line = U.num(it.odds && it.odds.total && it.odds.total.value, NaN);
      if (!Number.isFinite(line) || line < 0) return;
      var key = m[1] + '|' + stat + '|' + line;
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(it);
    });
    var out = {};
    order.forEach(function (key) {
      var g = groups[key];
      if (g.length < 2) return;
      var parts = key.split('|');
      var o = g[0], u = g[1];
      var oo = U.num(o.odds && o.odds.american && o.odds.american.value, NaN);
      var uo = U.num(u.odds && u.odds.american && u.odds.american.value, NaN);
      if (!Number.isFinite(oo) || !Number.isFinite(uo) || oo === 0 || uo === 0) return;
      var t1 = Date.parse(o.lastUpdated || ''), t2 = Date.parse(u.lastUpdated || '');
      var rec = {
        line: +parts[2], over: oo, under: uo,
        updated: Math.max(Number.isFinite(t1) ? t1 : 0, Number.isFinite(t2) ? t2 : 0) || null,
        openLine: U.num(o.open && o.open.target && o.open.target.value, NaN)
      };
      var a = (out[parts[0]] = out[parts[0]] || {});
      // more than one line for the same player & stat → keep the one closest to even money (the main line)
      var bal = function (r) { return Math.abs(U.amToProb(r.over) - U.amToProb(r.under)); };
      if (!a[parts[1]] || bal(rec) < bal(a[parts[1]])) a[parts[1]] = rec;
    });
    return out;
  };

  /** all over/under prop entries for a game (they come first in ESPN's list, sorted by type) */
  function fetchPropItems(eventId, providerId) {
    var base = E.CORE + '/events/' + eventId + '/competitions/' + eventId + '/odds/' + (providerId || '100') +
      '/propBets?lang=en&region=us&limit=300';
    var all = [];
    function page(n) {
      return E.fetchJSON(base + (n > 1 ? '&page=' + n : ''), { retries: 1, timeout: 15000 }).then(function (j) {
        var items = (j && j.items) || [];
        all = all.concat(items);
        var last = items[items.length - 1];
        var more = j && j.pageCount > n && last && last.type && +last.type.id <= 90 && n < 5;
        return more ? page(n + 1) : all;
      });
    }
    return page(1);
  }

  /**
   * player prop lines for one game → { at, lines, book }. Kept in memory for a few minutes (lines move);
   * the app saves its own pre-game snapshot, so nothing piles up in storage.
   */
  var plMem = {};
  E.getPropLines = function (eventId, providerId, providerName, force) {
    // ESPN's player props come from DraftKings (casino 100) unless the game's odds say otherwise
    if (!providerName && (!providerId || String(providerId) === '100')) providerName = 'DraftKings';
    var have = plMem[eventId];
    if (!force && have && Date.now() - have.at < 4 * 60 * 1000) return Promise.resolve(have);
    return fetchPropItems(eventId, providerId).then(function (items) {
      return (plMem[eventId] = { at: Date.now(), lines: E.parsePropBets(items), book: bookName(providerName) });
    }).catch(function (e) {
      if (e && e.status === 404) return (plMem[eventId] = { at: Date.now(), lines: {}, book: bookName(providerName) });
      if (have) return have;
      throw e;
    });
  };

  E.getGamelog = function (athleteId, season, isCurrent, force) {
    return cached('gl:' + season + ':' + athleteId, isCurrent ? 3 * HOUR : 30 * 24 * HOUR, function () {
      return E.fetchJSON(E.WEB + '/athletes/' + athleteId + '/gamelog?season=' + season, { timeout: 20000 })
        .then(function (j) { return E.parseGamelog(j, season); })
        .catch(function (e) {
          if (e && e.status === 404) return [];   // no games that season (rookie etc.)
          throw e;
        });
    }, force);
  };
})();
