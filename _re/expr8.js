(function () {
  const N = 3000;
  const TAU = 6.283185307179586;
  function bench(fn) { const t = performance.now(); fn(); return +(performance.now() - t).toFixed(2); }

  const quad = (p, i) => {
    const x = i % 900, y = 100 + (i % 300);
    p.moveTo(x, y); p.lineTo(x + 4, y); p.lineTo(x + 4, y + 4); p.lineTo(x, y + 4);
  };

  const tQuadClose = bench(() => { const p = new Path2D(); for (let i = 0; i < N; i++) { quad(p, i); p.closePath(); } });
  const tQuadOpen = bench(() => { const p = new Path2D(); for (let i = 0; i < N; i++) quad(p, i); });
  const tArc = bench(() => { const p = new Path2D(); for (let i = 0; i < N; i++) { const x = i % 900, y = 100 + (i % 300); p.moveTo(x + 1.5, y); p.arc(x, y, 1.5, 0, TAU); } });
  const tArcNoMove = bench(() => { const p = new Path2D(); for (let i = 0; i < N; i++) { const x = i % 900, y = 100 + (i % 300); p.arc(x, y, 1.5, 0, TAU); } });

  // 真实比例：2976 点 → 2976 圆 + 2975 四边形
  const tMix = bench(() => {
    const p = new Path2D();
    for (let i = 0; i < 2976; i++) {
      const x = i % 900, y = 100 + (i % 300);
      p.moveTo(x + 1.5, y); p.arc(x, y, 1.5, 0, TAU);
      if (i) { p.moveTo(x, y); p.lineTo(x + 3, y); p.lineTo(x + 3, y + 3); p.lineTo(x, y + 3); }
    }
  });
  const tMixClose = bench(() => {
    const p = new Path2D();
    for (let i = 0; i < 2976; i++) {
      const x = i % 900, y = 100 + (i % 300);
      p.moveTo(x + 1.5, y); p.arc(x, y, 1.5, 0, TAU);
      if (i) { p.moveTo(x, y); p.lineTo(x + 3, y); p.lineTo(x + 3, y + 3); p.lineTo(x, y + 3); p.closePath(); }
    }
  });
  return JSON.stringify({ quadClose: tQuadClose, quadOpen: tQuadOpen, arc: tArc, arcNoMove: tArcNoMove, mix: tMix, mixClose: tMixClose });
})()
