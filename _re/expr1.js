(function () {
  var k = window.__wbDebug.ink;
  var cp = [[0, 0, .5], [5, 30, .5], [10, 0, .5], [15, 30, .5]];
  var seg = k.spline(cp);
  var out = [];
  k.flatten(out, seg[0], seg[1], seg[2], seg[3]);
  function r2(p) { return [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]; }
  return JSON.stringify({
    seg: seg.map(r2),
    outLen: out.length,
    out: out.slice(0, 8).map(r2),
    perp0: k.perp(seg[0], seg[3], seg[1]),
    perpB2: k.perp(seg[0], seg[3], seg[2]),
    perpMid: k.perp(seg[0], seg[3], [(seg[0][0] + seg[3][0]) / 2, (seg[0][1] + seg[3][1]) / 2, .5])
  });
})()
