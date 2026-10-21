/* JJ Props — charts.js
 * Small hand-made SVG charts (no libraries): last-games bars vs the line, tiny sparklines,
 * and the live "lead tracker" margin chart. Colors come from CSS classes so light/dark themes work.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var HE = (root.HE = root.HE || {});
  var U = HE.util, M = HE.model;
  var CH = (HE.charts = {});

  function niceMax(v) {
    if (!(v > 0)) return 1;
    var steps = [1, 2, 2.5, 5, 10];
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    for (var i = 0; i < steps.length; i++) if (steps[i] * mag >= v) return steps[i] * mag;
    return 10 * mag;
  }
  /** column with a 4px rounded top and a square bottom */
  function colPath(x, y, w, y0) {
    var h = y0 - y;
    if (h <= 0) return '';
    var r = Math.min(4, w / 2, h);
    return 'M' + x + ',' + y0 + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + y0 + 'Z';
  }

  /**
   * Bars for a player's recent games vs the prop line.
   * games: newest first. Drawn oldest → newest (left → right).
   */
  CH.gameBars = function (games, stat, line, opts) {
    opts = opts || {};
    var list = games.slice(0, opts.n || 10).reverse();
    var n = list.length;
    if (!n) return '<div class="chart-empty">No games yet.</div>';
    var W = 640, H = 230, ml = 34, mr = 10, mt = 24, mb = 44;
    var pw = W - ml - mr, ph = H - mt - mb, y0 = mt + ph;
    var vals = list.map(function (g) { return M.val(g, stat); });
    var maxV = niceMax(Math.max.apply(null, vals.concat([line * 1.15, 1])));
    var y = function (v) { return mt + ph - (v / maxV) * ph; };
    var band = pw / n, bw = Math.min(24, band * 0.62);
    var showVals = n <= 12;
    var labelEvery = n > 14 ? 2 : 1;
    var s = '<svg class="chart bars" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
      U.esc((opts.label || 'Last games') + ' compared with the line ' + U.fmtLine(line)) + '">';
    // grid + y labels
    [0, maxV / 2, maxV].forEach(function (t) {
      var yy = y(t);
      s += '<line class="grid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + yy + '" y2="' + yy + '"/>';
      s += '<text class="tick" x="' + (ml - 6) + '" y="' + (yy + 4) + '" text-anchor="end">' + U.fmt0(t) + '</text>';
    });
    // season divider
    for (var i = 1; i < n; i++) {
      if (list[i].season !== list[i - 1].season) {
        var xd = ml + band * i;
        s += '<line class="divider" x1="' + xd + '" x2="' + xd + '" y1="' + (mt - 14) + '" y2="' + y0 + '"/>';
        s += '<text class="tick" x="' + (xd + 4) + '" y="' + (mt - 6) + '">' + U.esc(seasonName(list[i].season)) + ' →</text>';
      }
    }
    list.forEach(function (g, i) {
      var v = vals[i];
      var cls = v > line ? 'bar-over' : v === line ? 'bar-push' : 'bar-under';
      var x = ml + band * i + (band - bw) / 2;
      var tip = U.shortDate(g.ms) + ' · ' + (g.home ? 'vs ' : '@ ') + g.opp + ' · ' + v + ' ' + M.STAT_SHORT[stat] + ' · ' + g.min + ' min' + (g.res ? ' · ' + g.res + ' ' + g.ts + '-' + g.os : '');
      s += '<g class="bar-g" tabindex="0" data-tip="' + U.esc(tip) + '"><title>' + U.esc(tip) + '</title>';
      s += '<rect class="hit" x="' + (ml + band * i) + '" y="' + mt + '" width="' + band + '" height="' + ph + '"/>';
      if (v > 0) s += '<path class="' + cls + '" d="' + colPath(x, y(v), bw, y0) + '"/>';
      else s += '<rect class="bar-zero" x="' + x + '" y="' + (y0 - 2) + '" width="' + bw + '" height="2"/>';
      if (showVals) s += '<text class="val" x="' + (x + bw / 2) + '" y="' + (y(v) - 6) + '" text-anchor="middle">' + v + '</text>';
      if (i % labelEvery === 0 || i === n - 1) {
        s += '<text class="xl" x="' + (x + bw / 2) + '" y="' + (y0 + 16) + '" text-anchor="middle">' + (g.home ? '' : '@') + U.esc(g.opp) + '</text>';
        s += '<text class="xd" x="' + (x + bw / 2) + '" y="' + (y0 + 31) + '" text-anchor="middle">' + U.esc(U.shortDate(g.ms)) + '</text>';
      }
      s += '</g>';
    });
    s += '<line class="baseline" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y0 + '" y2="' + y0 + '"/>';
    var yl = y(line);
    s += '<line class="line-mark" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + yl + '" y2="' + yl + '"/>';
    s += '<text class="line-label" x="' + (W - mr) + '" y="' + (yl - 6) + '" text-anchor="end">Line ' + U.fmtLine(line) + '</text>';
    s += '</svg>';
    return s;
  };

  function seasonName(y) { return y ? (y - 1) + '-' + String(y).slice(2) : ''; }
  CH.seasonName = seasonName;

  /** tiny last-10 bars for table rows */
  CH.spark = function (games, stat, line) {
    var list = games.slice(0, 10).reverse();
    if (!list.length) return '';
    var W = 10 * 7, H = 24, bw = 5;
    var vals = list.map(function (g) { return M.val(g, stat); });
    var maxV = Math.max.apply(null, vals.concat([line * 1.25, 1]));
    var s = '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" aria-hidden="true">';
    var off = (10 - list.length) * 7;
    list.forEach(function (g, i) {
      var v = vals[i], h = Math.max(1.5, (v / maxV) * (H - 2));
      var cls = v > line ? 'bar-over' : v === line ? 'bar-push' : 'bar-under';
      s += '<rect class="' + cls + '" x="' + (off + i * 7) + '" y="' + (H - h) + '" width="' + bw + '" height="' + h + '" rx="1"/>';
    });
    var yl = H - (line / maxV) * (H - 2);
    s += '<line class="line-mark thin" x1="0" x2="' + W + '" y1="' + yl + '" y2="' + yl + '"/>';
    s += '</svg>';
    return s;
  };

  /**
   * Lead tracker: score margin through the game. Above the middle line = home team ahead.
   * points: [{t (sec elapsed), h, a}]
   */
  CH.flow = function (flow, home, away, opts) {
    opts = opts || {};
    var pts = (flow && flow.points) || [];
    if (pts.length < 2) return '<div class="chart-empty">The lead chart starts after the first basket.</div>';
    var lastT = pts[pts.length - 1].t;
    var endT = Math.max(2880, Math.ceil((lastT - 2880) / 300) * 300 + 2880);
    if (opts.live && lastT < 2880) endT = 2880;
    var W = 640, H = 190, ml = 40, mr = 10, mt = 14, mb = 24;
    var pw = W - ml - mr, ph = H - mt - mb, mid = mt + ph / 2;
    var maxAbs = 10;
    pts.forEach(function (p) { maxAbs = Math.max(maxAbs, Math.abs(p.h - p.a)); });
    maxAbs = niceMax(maxAbs * 1.1);
    var x = function (t) { return ml + (t / endT) * pw; };
    var y = function (m) { return mid - (m / maxAbs) * (ph / 2); };
    var d = 'M' + x(0) + ',' + y(0);
    for (var i = 1; i < pts.length; i++) {
      var m0 = pts[i - 1].h - pts[i - 1].a, m1 = pts[i].h - pts[i].a;
      d += 'H' + x(pts[i].t).toFixed(1) + 'V' + y(m1).toFixed(1);
      void m0;
    }
    var area = d + 'V' + mid + 'H' + x(0) + 'Z';
    var id = 'f' + Math.random().toString(36).slice(2, 8);
    var s = '<svg class="chart flow" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Score margin through the game" data-flow="' +
      U.esc(JSON.stringify({ end: endT, ml: ml, pw: pw, pts: pts.map(function (p) { return [p.t, p.h, p.a]; }) })) + '" data-home="' + U.esc(home.abbr) + '" data-away="' + U.esc(away.abbr) + '">';
    s += '<defs><clipPath id="' + id + 'u"><rect x="0" y="0" width="' + W + '" height="' + mid + '"/></clipPath>' +
      '<clipPath id="' + id + 'd"><rect x="0" y="' + mid + '" width="' + W + '" height="' + (H - mid) + '"/></clipPath></defs>';
    // quarter lines
    for (var q = 720; q < endT; q += (q < 2880 ? 720 : 300)) {
      s += '<line class="grid" x1="' + x(q) + '" x2="' + x(q) + '" y1="' + mt + '" y2="' + (mt + ph) + '"/>';
    }
    var qs = [];
    for (var k = 0; k < 4; k++) qs.push({ t: k * 720 + 360, l: 'Q' + (k + 1) });
    for (var ot = 2880, o = 1; ot < endT; ot += 300, o++) qs.push({ t: ot + 150, l: o === 1 ? 'OT' : o + 'OT' });
    qs.forEach(function (qq) { s += '<text class="xd" x="' + x(qq.t) + '" y="' + (H - 6) + '" text-anchor="middle">' + qq.l + '</text>'; });
    [maxAbs, maxAbs / 2].forEach(function (v) {
      s += '<line class="grid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>';
      s += '<line class="grid" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y(-v) + '" y2="' + y(-v) + '"/>';
      s += '<text class="tick" x="' + (ml - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + U.fmt0(v) + '</text>';
      s += '<text class="tick" x="' + (ml - 6) + '" y="' + (y(-v) + 4) + '" text-anchor="end">' + U.fmt0(v) + '</text>';
    });
    s += '<path class="area-home" clip-path="url(#' + id + 'u)" d="' + area + '"/>';
    s += '<path class="area-away" clip-path="url(#' + id + 'd)" d="' + area + '"/>';
    s += '<path class="line-home" clip-path="url(#' + id + 'u)" d="' + d + '"/>';
    s += '<path class="line-away" clip-path="url(#' + id + 'd)" d="' + d + '"/>';
    s += '<line class="baseline" x1="' + ml + '" x2="' + (W - mr) + '" y1="' + mid + '" y2="' + mid + '"/>';
    var last = pts[pts.length - 1], lm = last.h - last.a;
    s += '<circle class="' + (lm >= 0 ? 'dot-home' : 'dot-away') + '" cx="' + x(last.t) + '" cy="' + y(lm) + '" r="4.5"/>';
    s += '<text class="lbl" x="' + (ml + 6) + '" y="' + (mt + 12) + '">' + U.esc(home.abbr) + ' ahead ↑</text>';
    s += '<text class="lbl" x="' + (ml + 6) + '" y="' + (mt + ph - 6) + '">' + U.esc(away.abbr) + ' ahead ↓</text>';
    s += '<line class="cross" x1="0" x2="0" y1="' + mt + '" y2="' + (mt + ph) + '" style="display:none"/>';
    s += '<rect class="hit" x="' + ml + '" y="' + mt + '" width="' + pw + '" height="' + ph + '"/>';
    s += '</svg>';
    return s;
  };
})();
