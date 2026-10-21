/* JJ Props — util.js
 * Small helpers shared by every other file: math, probability, odds, dates, formatting.
 * Plain browser script (no modules) so the app also works when opened straight from a folder.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var HE = (root.HE = root.HE || {});
  var U = (HE.util = {});

  /* ---------- numbers ---------- */
  U.num = function (v, d) {
    if (d === undefined) d = 0;
    if (typeof v === 'number') return Number.isFinite(v) ? v : d;
    if (v == null) return d;
    var s = String(v).trim();
    if (/^even$/i.test(s)) return 100;
    var n = parseFloat(s);
    return Number.isFinite(n) ? n : d;
  };
  U.clamp = function (x, a, b) { return Math.min(b, Math.max(a, x)); };
  U.sum = function (a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; };
  U.mean = function (a) { return a.length ? U.sum(a) / a.length : NaN; };
  U.variance = function (a) {
    if (a.length < 2) return NaN;
    var m = U.mean(a), s = 0;
    for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
    return s / (a.length - 1);
  };
  U.sd = function (a) { return Math.sqrt(U.variance(a)); };
  U.round = function (x, d) { var f = Math.pow(10, d || 0); return Math.round(x * f) / f; };
  /** nearest "x.5" betting line (minimum 0.5) */
  U.halfLine = function (x) { return Math.max(0.5, Math.round(x - 0.5) + 0.5); };

  /* ---------- formatting ---------- */
  U.fmt1 = function (x) { return Number.isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1) : '–'; };
  U.fmt0 = function (x) { return Number.isFinite(x) ? String(Math.round(x)) : '–'; };
  U.fmtLine = function (x) { return Number.isFinite(x) ? (Number.isInteger(x) ? String(x) : x.toFixed(1)) : '–'; };
  U.pct = function (p) { return Number.isFinite(p) ? Math.round(p * 100) + '%' : '–'; };
  /** a chance shown to people: never "0%" or "100%" before the game is decided */
  U.pctc = function (p) { return Number.isFinite(p) ? Math.round(U.clamp(p, 0.01, 0.99) * 100) + '%' : '–'; };
  U.signed = function (x, digits) {
    if (!Number.isFinite(x)) return '–';
    var v = digits === 0 ? Math.round(x) : (Math.round(x * 10) / 10).toFixed(digits == null ? 1 : digits);
    return (x > 0 ? '+' : x < 0 ? '−' : '') + String(v).replace('-', '');
  };
  U.ordinal = function (n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  U.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  U.norm = function (s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  };
  U.lastName = function (full) {
    var parts = String(full || '').trim().split(/\s+/);
    if (parts.length <= 1) return parts[0] || '';
    return parts.slice(1).join(' ');
  };

  /* ---------- probability ---------- */
  U.erf = function (x) {
    // Abramowitz & Stegun 7.1.26 (max error 1.5e-7)
    var t = 1 / (1 + 0.3275911 * Math.abs(x));
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return x >= 0 ? y : -y;
  };
  U.normCdf = function (z) { return 0.5 * (1 + U.erf(z / Math.SQRT2)); };
  /** inverse standard normal (Acklam) */
  U.normInv = function (p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    var pl = 0.02425, q, r;
    if (p < pl) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > 1 - pl) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  };

  /**
   * Probability of each count 0..kmax for a stat with the given mean and variance.
   * Variance above the mean → negative binomial (the usual case for points/rebounds/assists);
   * otherwise Poisson.
   */
  U.countPmf = function (mean, variance, kmax) {
    mean = Math.max(mean, 1e-6);
    var pmf = new Array(kmax + 1), k, p;
    for (k = 0; k <= kmax; k++) pmf[k] = 0;
    if (!(variance > mean * 1.0001)) {
      p = Math.exp(-mean); pmf[0] = p;
      for (k = 1; k <= kmax; k++) { p = p * mean / k; pmf[k] = p; }
    } else {
      var r = mean * mean / (variance - mean);
      var q = r / (r + mean);
      p = Math.exp(r * Math.log(q)); pmf[0] = p;
      for (k = 1; k <= kmax; k++) { p = p * (k - 1 + r) / k * (1 - q); pmf[k] = p; }
    }
    return pmf;
  };
  /** {over, under, push} = P(X > line), P(X < line), P(X == line) */
  U.probLine = function (mean, variance, line) {
    if (!Number.isFinite(mean) || !Number.isFinite(line)) return { over: NaN, under: NaN, push: 0 };
    if (line < 0) return { over: 1, under: 0, push: 0 };
    var spread = Math.sqrt(Math.max(variance, mean, 1));
    var kmax = Math.ceil(Math.max(line + 2, mean + 12 * spread + 10));
    var pmf = U.countPmf(Math.max(mean, 1e-6), variance, kmax);
    var below = 0, eq = 0;
    for (var k = 0; k <= kmax; k++) {
      if (k < line) below += pmf[k];
      else if (k === line) eq += pmf[k];
    }
    below = U.clamp(below, 0, 1); eq = U.clamp(eq, 0, 1 - below);
    return { over: Math.max(0, 1 - below - eq), under: below, push: eq };
  };

  /* ---------- odds ---------- */
  /** American odds → implied win probability (includes the bookmaker's margin) */
  U.amToProb = function (am) {
    am = U.num(am, NaN);
    if (!Number.isFinite(am) || am === 0) return NaN;
    return am < 0 ? (-am) / (-am + 100) : 100 / (am + 100);
  };
  U.probToAm = function (p) {
    if (!(p > 0 && p < 1)) return NaN;
    return p >= 0.5 ? -Math.round(100 * p / (1 - p)) : Math.round(100 * (1 - p) / p);
  };
  U.fmtAm = function (am) {
    if (!Number.isFinite(am)) return '–';
    return am > 0 ? '+' + am : String(am);
  };

  /* ---------- dates & clocks ---------- */
  var ET = 'America/New_York';
  /** 'YYYYMMDD' for a moment, in US Eastern time (the NBA's calendar) */
  U.etYmd = function (d) {
    d = d || new Date();
    try {
      var s = new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
      var m = s.match(/(\d{4})\D(\d{2})\D(\d{2})/);
      if (m) return m[1] + m[2] + m[3];
    } catch (e) { /* fall through */ }
    var t = new Date(d.getTime() - 4 * 3600 * 1000);
    return t.toISOString().slice(0, 10).replace(/-/g, '');
  };
  U.ymdToDate = function (ymd) {
    return new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8), 12));
  };
  U.addDays = function (ymd, n) {
    var d = U.ymdToDate(ymd);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  };
  U.ymdLabel = function (ymd, opts) {
    return new Intl.DateTimeFormat(undefined, Object.assign({ weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }, opts || {})).format(U.ymdToDate(ymd));
  };
  U.localTime = function (iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);
  };
  U.localDayTime = function (iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(d);
  };
  U.shortDate = function (ms) {
    if (!ms) return '';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(ms));
  };
  U.ago = function (ms) {
    if (!ms) return 'never';
    var s = Math.round((Date.now() - ms) / 1000);
    if (s < 5) return 'just now';
    if (s < 60) return s + 's ago';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' min ago';
    var h = Math.round(m / 60);
    if (h < 48) return h + 'h ago';
    return Math.round(h / 24) + ' days ago';
  };
  /** '5:32' / '45.3' / 332 → seconds */
  U.clockToSec = function (s) {
    if (s == null || s === '') return 0;
    if (typeof s === 'number') return s;
    s = String(s).trim();
    if (s.indexOf(':') >= 0) {
      var p = s.split(':');
      return U.num(p[0], 0) * 60 + U.num(p[1], 0);
    }
    return U.num(s, 0);
  };
  /** seconds elapsed since tip-off (12-min quarters, 5-min overtimes) */
  U.elapsedSec = function (period, clockSec) {
    if (!period) return 0;
    if (period <= 4) return (period - 1) * 720 + (720 - clockSec);
    return 2880 + (period - 5) * 300 + (300 - clockSec);
  };
  /** seconds left in the game (regulation, or the current overtime) */
  U.remainingSec = function (period, clockSec) {
    if (!period) return 2880;
    if (period <= 4) return (4 - period) * 720 + clockSec;
    return clockSec;
  };
  U.periodName = function (p) {
    if (!p) return '';
    if (p <= 4) return 'Q' + p;
    return p === 5 ? 'OT' : (p - 4) + 'OT';
  };

  /* ---------- async helpers ---------- */
  /** run at most n tasks at once; high-priority tasks jump the queue */
  U.limiter = function (n) {
    var active = 0, hi = [], lo = [];
    function next() {
      if (active >= n) return;
      var job = hi.shift() || lo.shift();
      if (!job) return;
      active++;
      Promise.resolve().then(job.fn).then(job.res, job.rej).then(function () { active--; next(); });
    }
    return function (fn, priority) {
      return new Promise(function (res, rej) {
        (priority ? hi : lo).push({ fn: fn, res: res, rej: rej });
        next();
      });
    };
  };
  U.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  U.throttle = function (fn, ms) {
    var last = 0, timer = null;
    return function () {
      var now = Date.now(), self = this, args = arguments;
      var wait = ms - (now - last);
      if (wait <= 0) { last = now; fn.apply(self, args); }
      else if (!timer) {
        timer = setTimeout(function () { timer = null; last = Date.now(); fn.apply(self, args); }, wait);
      }
    };
  };
})();
