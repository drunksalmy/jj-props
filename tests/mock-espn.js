/* Mock ESPN NBA feed for tests — same JSON shapes as the real endpoints (captured 2026-10-21),
 * filled with made-up players and numbers. Deterministic (seeded). */
'use strict';

function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(42);
const rnd = (a, b) => a + (b - a) * R();
const pick = (arr) => arr[Math.floor(R() * arr.length)];
function normal(m, s) { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function poisson(l) { if (l <= 0) return 0; if (l > 40) return Math.max(0, Math.round(normal(l, Math.sqrt(l)))); let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; }
function gammaPoisson(mean, phi) { // overdispersed count: var ≈ phi*mean
  if (mean <= 0) return 0;
  if (phi <= 1.05) return poisson(mean);
  const shape = mean / (phi - 1); // gamma shape
  // Marsaglia-Tsang gamma
  function gamma(k) { if (k < 1) return gamma(1 + k) * Math.pow(R(), 1 / k); const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { x = normal(0, 1); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = R(); if (u < 1 - 0.0331 * x * x * x * x) return d * v; if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; } }
  const lam = gamma(shape) * (phi - 1);
  return poisson(lam);
}

const TEAMS = [
  ['1', 'ATL', 'Atlanta', 'Hawks', 'c8102e', 'East'], ['2', 'BOS', 'Boston', 'Celtics', '008348', 'East'], ['17', 'BKN', 'Brooklyn', 'Nets', '000000', 'East'],
  ['30', 'CHA', 'Charlotte', 'Hornets', '008ca8', 'East'], ['4', 'CHI', 'Chicago', 'Bulls', 'ce1141', 'East'], ['5', 'CLE', 'Cleveland', 'Cavaliers', '860038', 'East'],
  ['6', 'DAL', 'Dallas', 'Mavericks', '0064b1', 'West'], ['7', 'DEN', 'Denver', 'Nuggets', '0e2240', 'West'], ['8', 'DET', 'Detroit', 'Pistons', 'c8102e', 'East'],
  ['9', 'GS', 'Golden State', 'Warriors', '1d428a', 'West'], ['10', 'HOU', 'Houston', 'Rockets', 'ce1141', 'West'], ['11', 'IND', 'Indiana', 'Pacers', '002d62', 'East'],
  ['12', 'LAC', 'LA', 'Clippers', 'c8102e', 'West'], ['13', 'LAL', 'Los Angeles', 'Lakers', '552583', 'West'], ['29', 'MEM', 'Memphis', 'Grizzlies', '5d76a9', 'West'],
  ['14', 'MIA', 'Miami', 'Heat', '98002e', 'East'], ['15', 'MIL', 'Milwaukee', 'Bucks', '00471b', 'East'], ['16', 'MIN', 'Minnesota', 'Timberwolves', '0c2340', 'West'],
  ['3', 'NO', 'New Orleans', 'Pelicans', '0c2340', 'West'], ['18', 'NY', 'New York', 'Knicks', '1d428a', 'East'], ['25', 'OKC', 'Oklahoma City', 'Thunder', '007ac1', 'West'],
  ['19', 'ORL', 'Orlando', 'Magic', '0150b5', 'East'], ['20', 'PHI', 'Philadelphia', '76ers', '1d428a', 'East'], ['21', 'PHX', 'Phoenix', 'Suns', '1d1160', 'West'],
  ['22', 'POR', 'Portland', 'Trail Blazers', 'e03a3e', 'West'], ['23', 'SAC', 'Sacramento', 'Kings', '5a2d81', 'West'], ['24', 'SA', 'San Antonio', 'Spurs', 'c4ced4', 'West'],
  ['28', 'TOR', 'Toronto', 'Raptors', 'd91244', 'East'], ['26', 'UTAH', 'Utah', 'Jazz', '4e008e', 'West'], ['27', 'WSH', 'Washington', 'Wizards', '002b5c', 'East']
].map(([id, abbr, loc, name, color, conf]) => ({ id, abbr, location: loc, name, displayName: loc + ' ' + name, color, conf }));
const TEAM = {}; TEAMS.forEach((t) => { TEAM[t.id] = t; TEAM[t.abbr] = t; });

// team strength (prev season) and this season
TEAMS.forEach((t, i) => {
  t.off = rnd(108, 121); t.def = rnd(108, 120);
  t.w = Math.round(41 + (t.off - t.def) * 2.6 + normal(0, 3)); t.w = Math.max(15, Math.min(66, t.w)); t.l = 82 - t.w;
});

const FIRST = ['Marcus', 'Devin', 'Jalen', 'Andre', 'Tyrell', 'Luka', 'Nikolai', 'Caleb', 'Zion', 'Omar', 'Rafael', 'Kenji', 'Darius', 'Elijah', 'Trey', 'Mateo', 'Isaiah', 'Gabe', 'Malik', 'Reggie', 'Felix', 'Quentin', 'Jonah', 'Xavier'];
const LAST = ['Holloway', 'Brightwater', 'Okafor', 'Lindqvist', 'Marchetti', 'Delacroix', 'Abernathy', 'Kowalski', 'Achebe', 'Montague', 'Vasquez', 'Whitfield', 'Takahashi', 'Ferreira', 'Castellanos', 'Oduya', 'Pemberton', 'Sorensen', 'Calloway', 'Draper', 'Iverson-Lake', 'Novak', 'Rutherford', 'Bellamy'];

let athleteSeq = 5000000;
const PLAYERS = {}; // id -> player
TEAMS.forEach((t) => {
  t.roster = [];
  const roles = [34, 33, 31, 30, 28, 24, 22, 20, 17, 12, 9, 6, 4];
  const pos = ['G', 'G', 'F', 'F', 'C', 'G', 'F', 'C', 'G', 'F', 'C', 'G', 'F'];
  roles.forEach((m, k) => {
    const id = String(athleteSeq++);
    const p = pos[k];
    const star = k === 0 ? 1.35 : k === 1 ? 1.15 : 1;
    const pl = {
      id, teamId: t.id, pos: p, name: pick(FIRST) + ' ' + pick(LAST) + (R() < 0.08 ? ' Jr.' : ''),
      min: m + normal(0, 1.5),
      rate: {
        pts: (p === 'G' ? 0.62 : p === 'F' ? 0.52 : 0.48) * star * rnd(0.8, 1.2),
        reb: (p === 'G' ? 0.12 : p === 'F' ? 0.2 : 0.32) * rnd(0.8, 1.2),
        ast: (p === 'G' ? 0.19 : p === 'F' ? 0.09 : 0.07) * (k === 0 ? 1.3 : 1) * rnd(0.8, 1.2),
        fg3m: (p === 'G' ? 0.075 : p === 'F' ? 0.055 : 0.012) * rnd(0.7, 1.3)
      },
      injury: null
    };
    pl.short = pl.name.split(' ')[0][0] + '. ' + pl.name.split(' ').slice(1).join(' ');
    t.roster.push(pl); PLAYERS[id] = pl;
  });
});
// injuries for test realism
TEAM.ORL.roster[1].injury = { status: 'Out', type: 'Ankle', side: 'Right', detail: 'Sprain', returnDate: '2026-10-25' };
TEAM.LAL.roster[0].injury = { status: 'Day-To-Day', type: 'Knee', side: 'Left', detail: 'Soreness' };
TEAM.WSH.roster[3].injury = { status: 'Out', type: 'Foot', side: 'Left', detail: 'Fracture', returnDate: '2026-12-01' };

// ---------------- game logs ----------------
let eventSeq = 401800000;
function line(pl, minutes, oppId, home, dateISO, seasonYear) {
  const m = Math.max(1, Math.round(minutes));
  const pts = gammaPoisson(pl.rate.pts * m, 2.0), reb = gammaPoisson(pl.rate.reb * m, 1.3), ast = gammaPoisson(pl.rate.ast * m, 1.25);
  const fg3m = Math.min(Math.floor(pts / 3), gammaPoisson(pl.rate.fg3m * m, 1.0));
  const fta = Math.round(pts * rnd(0.12, 0.3)), ftm = Math.min(fta, Math.round(fta * rnd(0.65, 0.9)));
  const twoPts = Math.max(0, pts - ftm - 3 * fg3m);
  const fg2m = Math.floor(twoPts / 2);
  const fgm = fg2m + fg3m, fga = Math.max(fgm, Math.round(fgm / rnd(0.42, 0.55)));
  const fg3a = Math.max(fg3m, Math.round(fg3m / rnd(0.3, 0.42)));
  return { m, pts: fg2m * 2 + fg3m * 3 + ftm, reb, ast, fg3m, fg3a, fgm, fga, ftm, fta, stl: poisson(0.03 * m), blk: poisson(0.02 * m), tov: poisson(0.05 * m), pf: Math.min(6, poisson(0.07 * m)) };
}
function statsArr(s) {
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '0.0');
  return [String(s.m), s.fgm + '-' + s.fga, pct(s.fgm, s.fga), s.fg3m + '-' + s.fg3a, pct(s.fg3m, s.fg3a), s.ftm + '-' + s.fta, pct(s.ftm, s.fta), String(s.reb), String(s.ast), String(s.blk), String(s.stl), String(s.pf), String(s.tov), String(s.pts)];
}
const GAMELOGS = {}; // key season:athlete -> json
function buildGamelog(pl, season) {
  const events = {}, cats = [];
  const n = season === 2026 ? 70 + Math.floor(R() * 10) : (['8', '2', '18', '20', '24', '25'].includes(pl.teamId) ? 1 : 0);
  const reg = [];
  const start = season === 2026 ? Date.UTC(2025, 9, 22) : Date.UTC(2026, 9, 20, 19);
  for (let i = 0; i < n; i++) {
    const t = TEAM[pl.teamId];
    let opp = pick(TEAMS); while (opp.id === t.id) opp = pick(TEAMS);
    if (season === 2027) opp = TEAM[{ '8': '2', '2': '8', '18': '20', '20': '18', '24': '25', '25': '24' }[pl.teamId]];
    const home = season === 2027 ? ['8', '18', '24'].includes(pl.teamId) : R() < 0.5;
    const ms = start + i * 2.3 * 86400000;
    if (pl.injury && pl.injury.returnDate === '2026-12-01' && season === 2026 && i > 60) continue; // missed end of season
    const s = line(pl, normal(pl.min, 4), opp.id, home, null, season);
    const ts = Math.round(normal(t.off, 10)), os = Math.round(normal(opp.off, 10));
    const id = String(eventSeq++);
    events[id] = {
      id, links: [{ href: 'https://www.espn.com/nba/game/_/gameId/' + id, rel: ['summary'] }], atVs: home ? 'vs' : '@',
      gameDate: new Date(ms).toISOString().replace('Z', '+00:00'), score: Math.max(ts, os) + '-' + Math.min(ts, os),
      homeTeamId: home ? t.id : opp.id, awayTeamId: home ? opp.id : t.id,
      homeTeamScore: String(home ? ts : os), awayTeamScore: String(home ? os : ts), gameResult: ts > os ? 'W' : 'L',
      leagueName: 'National Basketball Association', leagueAbbreviation: 'NBA', leagueShortName: 'NBA',
      opponent: { id: opp.id, abbreviation: opp.abbr, displayName: opp.displayName, logo: '' },
      team: { id: t.id, abbreviation: t.abbr, isAllStar: false }
    };
    reg.push({ eventId: id, stats: statsArr(s) });
  }
  const sname = (season - 1) + '-' + String(season).slice(2);
  const seasonTypes = [];
  if (reg.length) seasonTypes.push({ split: '1', displayName: sname + ' Regular Season', categories: [{ name: 'season', displayName: 'season', type: 'event', events: reg.slice().reverse() }, { type: 'total', name: 'totals', events: [] }] });
  // preseason games must be ignored by the app
  const pre = [];
  for (let i = 0; i < 3; i++) {
    const id = String(eventSeq++); const opp = pick(TEAMS);
    events[id] = { id, atVs: 'vs', gameDate: new Date(start - (10 - i) * 86400000).toISOString(), homeTeamId: pl.teamId, awayTeamId: opp.id, homeTeamScore: '110', awayTeamScore: '100', gameResult: 'W', opponent: { id: opp.id, abbreviation: opp.abbr }, team: { id: pl.teamId, abbreviation: TEAM[pl.teamId].abbr } };
    pre.push({ eventId: id, stats: statsArr(line(pl, 40, opp.id, true)) });  // inflated on purpose
  }
  seasonTypes.push({ split: '0', displayName: sname + ' Preseason', categories: [{ type: 'event', events: pre }] });
  return {
    filters: [{ displayName: 'Season', name: 'season', value: String(season), options: [{ value: '2027', displayValue: '2026-27' }, { value: '2026', displayValue: '2025-26' }] }],
    labels: ['MIN', 'FG', 'FG%', '3PT', '3P%', 'FT', 'FT%', 'REB', 'AST', 'BLK', 'STL', 'PF', 'TO', 'PTS'],
    names: ['minutes', 'fieldGoalsMade-fieldGoalsAttempted', 'fieldGoalPct', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', 'threePointPct', 'freeThrowsMade-freeThrowsAttempted', 'freeThrowPct', 'totalRebounds', 'assists', 'blocks', 'steals', 'fouls', 'turnovers', 'points'],
    events, seasonTypes, glossary: []
  };
}

// ---------------- games on the test date ----------------
const SLATE = {
  '20261021': [
    { id: '401909834', away: 'ATL', home: 'ORL', start: '2026-10-21T23:00Z', state: 'post', props: true },
    { id: '401909835', away: 'MIL', home: 'WSH', start: '2026-10-21T23:00Z', state: 'in', period: 3, clock: 332, props: true },
    { id: '401909842', away: 'GS', home: 'LAL', start: '2026-10-22T02:00Z', state: 'pre', odds: true, props: true },
    { id: '401909843', away: 'PHX', home: 'POR', start: '2026-10-22T02:00Z', state: 'pre', odds: false },
    { id: '401909844', away: 'SAC', home: 'LAC', start: '2026-10-22T02:30Z', state: 'pre', odds: true, props: true }
  ],
  '20261020': [
    { id: '401909088', away: 'BOS', home: 'DET', start: '2026-10-20T19:00Z', state: 'post' },
    { id: '401909089', away: 'PHI', home: 'NY', start: '2026-10-20T23:00Z', state: 'post' },
    { id: '401909090', away: 'OKC', home: 'SA', start: '2026-10-21T01:50Z', state: 'post' },
    { id: '401909091', away: 'GS', home: 'LAL', start: '2026-10-21T02:00Z', state: 'post' }   // LAL+GS on a back-to-back
  ]
};
const CALENDAR = [];
for (let d = Date.UTC(2026, 9, 3); d <= Date.UTC(2027, 3, 11); d += 86400000) CALENDAR.push(new Date(d).toISOString().slice(0, 10) + 'T07:00Z');

const GAME_STATE = {}; // id -> {home, away, box...}
function sim(g) {
  if (GAME_STATE[g.id]) return GAME_STATE[g.id];
  const H = TEAM[g.home], A = TEAM[g.away];
  const st = { g, plays: [], box: {}, hs: 0, as: 0 };
  const endT = g.state === 'post' ? 2880 : g.state === 'in' ? (g.period - 1) * 720 + (720 - g.clock) : 0;
  let t = 0, seq = 1, h = 0, a = 0;
  st.plays.push({ id: g.id + '1', sequenceNumber: '1', period: { number: 1, displayValue: '1st Quarter' }, clock: { displayValue: '12:00' }, homeScore: 0, awayScore: 0, scoringPlay: false, text: 'Jump ball', type: { id: '615', text: 'Jumpball' } });
  while (t < endT) {
    t += rnd(18, 40); if (t > endT) break;
    const side = R() < 0.5 + (H.off - A.off) / 200 ? 'home' : 'away';
    const pts = R() < 0.35 ? 3 : R() < 0.15 ? 1 : 2;
    if (side === 'home') h += pts; else a += pts;
    const per = Math.min(4, Math.floor(t / 720) + 1), left = per * 720 - t;
    st.plays.push({ id: g.id + String(++seq), sequenceNumber: String(seq), period: { number: per, displayValue: per + 'th Quarter' }, clock: { displayValue: Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0') }, homeScore: h, awayScore: a, scoringPlay: true, scoreValue: pts, team: { id: side === 'home' ? H.id : A.id }, text: (side === 'home' ? H.abbr : A.abbr) + ' scores ' + pts });
  }
  st.hs = h; st.as = a;
  const frac = endT / 2880;
  [H, A].forEach((T) => {
    st.box[T.id] = T.roster.map((pl, k) => {
      if (pl.injury && pl.injury.status === 'Out') return { pl, dnp: true };
      const s = line(pl, normal(pl.min, 3) * frac, null, true);
      return { pl, s, starter: k < 5 };
    });
  });
  GAME_STATE[g.id] = st;
  return st;
}

function teamObj(T) {
  return { id: T.id, uid: 's:40~l:46~t:' + T.id, location: T.location, name: T.name, abbreviation: T.abbr, displayName: T.displayName, shortDisplayName: T.name, color: T.color, alternateColor: 'ffffff', isActive: true, logo: 'https://a.espncdn.com/i/teamlogos/nba/500/scoreboard/' + T.abbr.toLowerCase() + '.png' };
}
function statusObj(g) {
  if (g.state === 'pre') return { clock: 0, displayClock: '0.0', period: 0, type: { id: '1', name: 'STATUS_SCHEDULED', state: 'pre', completed: false, description: 'Scheduled', detail: 'Wed, October 21st at 7:00 PM EDT', shortDetail: '10/21 - 7:00 PM EDT' } };
  if (g.state === 'in') return { clock: g.clock, displayClock: Math.floor(g.clock / 60) + ':' + String(g.clock % 60).padStart(2, '0'), period: g.period, type: { id: '2', name: 'STATUS_IN_PROGRESS', state: 'in', completed: false, description: 'In Progress', detail: Math.floor(g.clock / 60) + ':' + String(g.clock % 60).padStart(2, '0') + ' - 3rd Quarter', shortDetail: Math.floor(g.clock / 60) + ':' + String(g.clock % 60).padStart(2, '0') + ' - 3rd' } };
  return { clock: 0, displayClock: '0.0', period: 4, type: { id: '3', name: 'STATUS_FINAL', state: 'post', completed: true, description: 'Final', detail: 'Final', shortDetail: 'Final' } };
}
function oddsObj(g) {
  const H = TEAM[g.home];
  const sp = -Math.round((H.off - H.def - (TEAM[g.away].off - TEAM[g.away].def) + 2.4) * 2) / 2 || -1.5;
  const spread = sp === Math.round(sp) ? sp - 0.5 : sp;
  const fav = spread < 0 ? H : TEAM[g.away];
  const total = Math.round((H.off + TEAM[g.away].off) * 2) / 2 + 0.5;
  return {
    provider: { id: '100', name: 'Draft Kings', displayName: 'Draft Kings', priority: 1 },
    details: fav.abbr + ' ' + (spread < 0 ? spread : -spread), overUnder: total, spread: spread,
    awayTeamOdds: { favorite: spread > 0, underdog: spread < 0, team: teamObj(TEAM[g.away]) },
    homeTeamOdds: { favorite: spread < 0, underdog: spread > 0, team: teamObj(H) },
    moneyline: { displayName: 'Moneyline', home: { close: { odds: spread < 0 ? '-165' : '+140' }, open: { odds: spread < 0 ? '-150' : '+130' } }, away: { close: { odds: spread < 0 ? '+140' : '-165' }, open: { odds: '+125' } } },
    pointSpread: { displayName: 'Spread', home: { close: { line: (spread > 0 ? '+' : '') + spread, odds: '-110' }, open: { line: String(spread + 1), odds: '-110' } }, away: { close: { line: (spread < 0 ? '+' : '') + (-spread), odds: '-110' }, open: { line: String(-spread - 1), odds: '-110' } } },
    total: { displayName: 'Total', over: { close: { line: 'o' + total, odds: '-108' }, open: { line: 'o' + (total - 2), odds: '-110' } }, under: { close: { line: 'u' + total, odds: '-112' }, open: { line: 'u' + (total - 2), odds: '-110' } } },
    header: { text: 'Game Odds' }, footer: { disclaimer: 'GAMBLING PROBLEM? CALL 1-800-GAMBLER' }
  };
}
function competitor(T, side, g) {
  const st = g.state === 'pre' ? null : sim(g);
  const score = st ? (side === 'home' ? st.hs : st.as) : 0;
  return { id: T.id, uid: 's:40~l:46~t:' + T.id, type: 'team', order: side === 'home' ? 0 : 1, homeAway: side, winner: g.state === 'post' && score > (side === 'home' ? st.as : st.hs), team: teamObj(T), score: String(score), linescores: [], statistics: [], records: [{ name: 'overall', abbreviation: 'Total', type: 'total', summary: g.state === 'post' ? (score > (side === 'home' ? st.as : st.hs) ? '1-0' : '0-1') : '0-0' }, { name: 'Home', type: 'home', summary: '0-0' }, { name: 'Road', type: 'road', summary: '0-0' }] };
}
function scoreboard(ymd) {
  const games = SLATE[ymd] || [];
  return {
    leagues: [{ id: '46', uid: 's:40~l:46', name: 'National Basketball Association', abbreviation: 'NBA', slug: 'nba', season: { year: 2027, startDate: '2026-09-30T07:00Z', endDate: '2027-06-26T06:59Z', displayName: '2026-27', type: { id: '2', type: 2, name: 'Regular Season', abbreviation: 'reg' } }, calendarType: 'day', calendar: CALENDAR }],
    season: { type: 2, year: 2027 }, day: { date: ymd.slice(0, 4) + '-' + ymd.slice(4, 6) + '-' + ymd.slice(6) },
    events: games.map((g) => {
      const H = TEAM[g.home], A = TEAM[g.away];
      return {
        id: g.id, uid: 's:40~l:46~e:' + g.id, date: g.start, name: A.displayName + ' at ' + H.displayName, shortName: A.abbr + ' @ ' + H.abbr, season: { year: 2027, type: 2, slug: 'regular-season' },
        competitions: [{ id: g.id, date: g.start, startDate: g.start, attendance: 0, type: { id: '1', abbreviation: 'STD' }, timeValid: true, neutralSite: false, conferenceCompetition: false, playByPlayAvailable: g.state !== 'pre', recent: false,
          venue: { id: '1', fullName: H.location + ' Arena', address: { city: H.location, state: 'XX' }, indoor: true },
          competitors: [competitor(H, 'home', g), competitor(A, 'away', g)], notes: [], status: statusObj(g),
          broadcasts: [{ market: 'national', names: ['NBC'] }], format: { regulation: { periods: 4 } },
          odds: g.state === 'pre' && g.odds ? [oddsObj(g)] : [] }]
      };
    })
  };
}
const KEYS = ['minutes', 'points', 'fieldGoalsMade-fieldGoalsAttempted', 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', 'freeThrowsMade-freeThrowsAttempted', 'rebounds', 'assists', 'turnovers', 'steals', 'blocks', 'offensiveRebounds', 'defensiveRebounds', 'fouls', 'plusMinus'];
function summary(id) {
  let g = null;
  Object.keys(SLATE).forEach((k) => SLATE[k].forEach((x) => { if (x.id === id) g = x; }));
  if (!g) return null;
  const H = TEAM[g.home], A = TEAM[g.away];
  const out = {
    header: { id: g.id, competitions: [{ id: g.id, date: g.start, status: statusObj(g), competitors: [competitor(H, 'home', g), competitor(A, 'away', g)] }] },
    injuries: [H, A].map((T) => ({ team: { id: T.id, abbreviation: T.abbr, displayName: T.displayName }, injuries: T.roster.filter((p) => p.injury).map((p) => ({ athlete: { id: p.id, displayName: p.name, shortName: p.short, position: { abbreviation: p.pos } }, date: '2026-10-20T20:57Z', status: p.injury.status, type: { name: 'INJURY_STATUS_' + p.injury.status.toUpperCase() }, details: { type: p.injury.type, side: p.injury.side, detail: p.injury.detail, returnDate: p.injury.returnDate, fantasyStatus: { abbreviation: 'OUT' } } })) })),
    boxscore: { teams: [], players: [] },
    news: { articles: [] }, videos: [], seasonseries: [], standings: {}
  };
  if (g.state === 'pre') {
    out.predictor = { header: 'Matchup Predictor', homeTeam: { id: H.id, gameProjection: String(Math.round(50 + (H.off - H.def - A.off + A.def) * 2.5)), teamChanceLoss: '0' }, awayTeam: { id: A.id, gameProjection: String(Math.round(50 - (H.off - H.def - A.off + A.def) * 2.5)), teamChanceLoss: '0' } };
    if (g.odds) { const o = oddsObj(g); out.pickcenter = [{ provider: o.provider, details: o.details, overUnder: o.overUnder, spread: o.spread, overOdds: -108, underOdds: -112, awayTeamOdds: { favorite: o.spread > 0, moneyLine: o.spread < 0 ? 140 : -165, spreadOdds: -110, teamId: A.id }, homeTeamOdds: { favorite: o.spread < 0, moneyLine: o.spread < 0 ? -165 : 140, spreadOdds: -110, teamId: H.id } }]; }
    out.boxscore.teams = [{ team: teamObj(A), homeAway: 'away', statistics: [] }, { team: teamObj(H), homeAway: 'home', statistics: [] }];
    return out;
  }
  const st = sim(g);
  out.plays = st.plays;
  out.winprobability = st.plays.map((p) => { const rem = 2880 - ((p.period.number - 1) * 720 + 720 - (p.clock.displayValue.includes(':') ? +p.clock.displayValue.split(':')[0] * 60 + +p.clock.displayValue.split(':')[1] : 0)); const m = p.homeScore - p.awayScore; return { homeWinPercentage: 1 / (1 + Math.exp(-m / (2 + rem / 300))), playId: p.id, tiePercentage: 0 }; });
  out.boxscore.players = [A, H].map((T) => ({
    team: teamObj(T), displayOrder: 1,
    statistics: [{ names: ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'TO', 'STL', 'BLK', 'OREB', 'DREB', 'PF', '+/-'], keys: KEYS, labels: ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'TO', 'STL', 'BLK', 'OREB', 'DREB', 'PF', '+/-'],
      athletes: st.box[T.id].map((b) => ({ active: !b.dnp, athlete: { id: b.pl.id, displayName: b.pl.name, shortName: b.pl.short, position: { abbreviation: b.pl.pos }, headshot: { href: 'https://a.espncdn.com/i/headshots/nba/players/full/' + b.pl.id + '.png' } }, starter: !!b.starter, didNotPlay: !!b.dnp, reason: b.dnp ? 'INJURED' : '', ejected: false,
        stats: b.dnp ? [] : [String(b.s.m), String(b.s.pts), b.s.fgm + '-' + b.s.fga, b.s.fg3m + '-' + b.s.fg3a, b.s.ftm + '-' + b.s.fta, String(b.s.reb), String(b.s.ast), String(b.s.tov), String(b.s.stl), String(b.s.blk), String(Math.floor(b.s.reb / 4)), String(b.s.reb - Math.floor(b.s.reb / 4)), String(b.s.pf), '+3'] })) }]
  }));
  let lc = 0, tt = 0, mh = 0, ma = 0, prev = 0, cur = 0;
  st.plays.forEach((p) => { const m = p.homeScore - p.awayScore; const nl = Math.sign(m); if (nl === 0 && cur !== 0) tt++; if (nl !== 0 && prev !== 0 && nl !== prev) lc++; if (nl) prev = nl; cur = nl; mh = Math.max(mh, m); ma = Math.max(ma, -m); });
  out.boxscore.teams = [A, H].map((T) => ({ team: teamObj(T), homeAway: T === H ? 'home' : 'away', statistics: [
    { name: 'fieldGoalsMade-fieldGoalsAttempted', displayValue: '40-88', label: 'FG' }, { name: 'totalRebounds', displayValue: '44' }, { name: 'assists', displayValue: '25' }, { name: 'totalTurnovers', displayValue: '13' },
    { name: 'largestLead', displayValue: String(T === H ? mh : ma) }, { name: 'leadChanges', displayValue: String(lc) }, { name: 'leadPercentage', displayValue: '50' }] }));
  return out;
}
function standings(season) {
  const conf = (c) => ({
    uid: 's:40~l:46~g:' + c, name: c + 'ern Conference', abbreviation: c, isConference: true,
    standings: { season: season, seasonType: 2, entries: TEAMS.filter((t) => t.conf === c).map((t) => {
      const cur = season === 2027;
      const gp = cur ? (['8', '2', '18', '20', '24', '25', '13', '9'].includes(t.id) ? 1 : 0) : 82;
      const w = cur ? (gp && ['8', '20', '25', '13'].includes(t.id) ? 1 : 0) : t.w, l = gp - w;
      const ppg = gp ? (cur ? Math.round(normal(t.off, 6)) : +t.off.toFixed(1)) : 0, oppg = gp ? (cur ? Math.round(normal(t.def, 6)) : +t.def.toFixed(1)) : 0;
      const S = (name, type, value, dv) => ({ name, displayName: name, type, value, displayValue: dv != null ? dv : String(value) });
      return { team: { id: t.id, abbreviation: t.abbr, displayName: t.displayName, shortDisplayName: t.name, logos: [] }, stats: [
        S('avgPointsAgainst', 'avgpointsagainst', oppg, oppg.toFixed(1)), S('avgPointsFor', 'avgpointsfor', ppg, ppg.toFixed(1)), S('differential', 'differential', +(ppg - oppg).toFixed(1)),
        S('losses', 'losses', l), S('wins', 'wins', w), S('winPercent', 'winpercent', gp ? w / gp : 0), S('playoffSeed', 'playoffseed', 1),
        S('streak', 'streak', 1, 'W1'), S('overall', 'total', 0, w + '-' + l), S('Home', 'home', 0, Math.round(w * 0.55) + '-' + Math.round(l * 0.45)), S('Road', 'road', 0, Math.round(w * 0.45) + '-' + Math.round(l * 0.55)), S('Last Ten Games', 'lasttengames', 0, '6-4')] };
    }) }
  });
  return { uid: 's:40~l:46~g:7', id: '7', name: 'National Basketball Association', abbreviation: 'NBA', children: [conf('East'), conf('West')], season: { year: 2027, displayName: '2026-27' }, seasons: [] };
}
function roster(teamId) {
  const T = TEAM[teamId];
  if (!T) return null;
  return {
    timestamp: '2026-10-21T05:11:12Z', status: 'success', season: { year: 2027, displayName: '2026-27', type: 2, name: 'Regular Season' }, team: teamObj(T), coach: [],
    athletes: T.roster.map((p) => ({ id: p.id, uid: 's:40~l:46~a:' + p.id, firstName: p.name.split(' ')[0], lastName: p.name.split(' ').slice(1).join(' '), fullName: p.name, displayName: p.name, shortName: p.short, jersey: String(Math.floor(R() * 40)), position: { id: '1', name: p.pos, displayName: p.pos === 'G' ? 'Guard' : p.pos === 'F' ? 'Forward' : 'Center', abbreviation: p.pos }, headshot: { href: 'https://a.espncdn.com/i/headshots/nba/players/full/' + p.id + '.png', alt: p.name }, age: 25, experience: { years: 4 }, injuries: p.injury ? [{ date: '2026-10-18T14:49Z', status: p.injury.status }] : [], status: { id: '1', name: 'Active', type: 'active', abbreviation: 'Active' } }))
  };
}

/** url → JSON (or null for 404) */
// ---------------- player prop lines (DraftKings via ESPN's core API) ----------------
// Same shape as sports.core.api.espn.com/.../odds/100/propBets: over first, then under,
// sorted by prop type; milestone ("X+ points") entries come after the over/unders.
const PROP_TYPE = [['1', 'Total Points', 'pts'], ['2', 'Total Assists', 'ast'], ['3', 'Total Rebounds', 'reb'], ['4', 'Total 3-Point Field Goals', 'fg3m'], ['90', 'Total Points, Rebounds, and Assists', 'pra']];
const PROPS = {};
function amFromProb(q) { return q >= 0.5 ? -Math.round(100 * q / (1 - q)) : Math.round(100 * (1 - q) / q); }
function amStr(a) { return a > 0 ? '+' + a : String(a); }
function propItems(gid) {
  if (PROPS[gid]) return PROPS[gid];
  const g = Object.keys(SLATE).map((d) => SLATE[d]).reduce((a, b) => a.concat(b), []).find((x) => x.id === gid);
  if (!g || !g.props) return (PROPS[gid] = []);
  const r = rng(+gid % 100000);
  const startMs = Date.parse(g.start);
  const comp = { $ref: 'http://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/' + gid + '/competitions/' + gid + '?lang=en&region=us' };
  const prov = { $ref: 'http://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/casinos/100?lang=en&region=us' };
  const players = [TEAM[g.home], TEAM[g.away]].map((t) => t.roster.slice(0, 8)).reduce((a, b) => a.concat(b), [])
    .filter((pl) => !pl.injury || pl.injury.status !== 'Out');
  const items = [];
  const entry = (pl, tid, tname, line, am, updated) => ({
    competition: comp, athlete: { $ref: 'http://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2027/athletes/' + pl.id + '?lang=en&region=us' },
    provider: prov, type: { id: tid, name: tname },
    odds: { american: { value: amStr(am), open: amStr(am) }, total: { value: String(line), open: String(line) } },
    lastUpdated: updated, current: { target: { value: line, displayValue: String(line) } }, open: { target: { value: line, displayValue: String(line) } }
  });
  PROP_TYPE.forEach(([tid, tname, stat]) => {
    players.forEach((pl, k) => {
      const mean = stat === 'pra' ? pl.min * (pl.rate.pts + pl.rate.reb + pl.rate.ast) : pl.min * pl.rate[stat];
      if (stat === 'fg3m' && mean < 0.8) return;
      const line = Math.max(0.5, Math.round(mean * (0.94 + r() * 0.12) - 0.5) + 0.5);
      const qo = 0.524 + (r() - 0.5) * 0.08, qu = 1.048 - qo;
      // pre-game: posted this morning; started games: half the lines were last moved in-game
      const upd = g.state === 'pre' ? '2026-10-21T05:10Z' : new Date(startMs + (k % 2 ? -3600e3 : 1800e3)).toISOString().slice(0, 16) + 'Z';
      items.push(entry(pl, tid, tname, line, amFromProb(qo), upd), entry(pl, tid, tname, line, amFromProb(qu), upd));
    });
  });
  players.slice(0, 4).forEach((pl) => [10, 15, 20].forEach((t) => {
    items.push(entry(pl, '218', 'Points Milestones', t, amFromProb(Math.min(0.95, Math.max(0.05, 1 - t / (pl.min * pl.rate.pts * 2)))), '2026-10-21T05:10Z'));
  }));
  return (PROPS[gid] = items);
}
function propBets(gid, limit, page) {
  const items = propItems(gid);
  const lim = Math.min(1000, limit || 25), pg = page || 1;
  return { count: items.length, pageIndex: pg, pageSize: lim, pageCount: Math.max(1, Math.ceil(items.length / lim)), items: items.slice((pg - 1) * lim, pg * lim) };
}

function respond(url) {
  const u = new URL(url);
  const p = u.pathname;
  let m;
  if (/\/scoreboard$/.test(p)) return scoreboard(u.searchParams.get('dates') || '20261021');
  if (/\/summary$/.test(p)) return summary(u.searchParams.get('event'));
  if (/\/standings$/.test(p)) return standings(+(u.searchParams.get('season') || 2027));
  if ((m = p.match(/\/teams\/(\d+)\/roster$/))) return roster(m[1]);
  if ((m = p.match(/\/events\/(\d+)\/competitions\/\d+\/odds\/\d+\/propBets$/))) return propBets(m[1], +u.searchParams.get('limit'), +u.searchParams.get('page'));
  if ((m = p.match(/\/athletes\/(\d+)\/gamelog$/))) {
    const season = +(u.searchParams.get('season') || 2027);
    const pl = PLAYERS[m[1]];
    if (!pl) return null;
    const key = season + ':' + pl.id;
    if (!GAMELOGS[key]) GAMELOGS[key] = buildGamelog(pl, season);
    return GAMELOGS[key];
  }
  return null;
}
module.exports = { respond, TEAM, TEAMS, PLAYERS, SLATE };
