(function () {
  const N = 3000;
  const TAU = 6.283185307179586;
  function bench(fn) {
    const t = performance.now();
    fn();
    return +(performance.now() - t).toFixed(2);
  }
  // A) 3000 个 arc 圆
  const tA = bench(() => {
    const p = new Path2D();
    for (let i = 0; i < N; i++) {
      const x = i % 900, y = 100 + (i % 300), r = 1.5;
      p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU);
    }
  });
  // B) 3000 个 12 边形
  const tB = bench(() => {
    const p = new Path2D();
    for (let i = 0; i < N; i++) {
      const x = i % 900, y = 100 + (i % 300), r = 1.5;
      for (let k = 0; k < 12; k++) {
        const a = k * TAU / 12;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (k === 0) p.moveTo(px, py); else p.lineTo(px, py);
      }
      p.closePath();
    }
  });
  // C) 3000 个 8 边形
  const tC = bench(() => {
    const p = new Path2D();
    for (let i = 0; i < N; i++) {
      const x = i % 900, y = 100 + (i % 300), r = 1.5;
      for (let k = 0; k < 8; k++) {
        const a = k * TAU / 8;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (k === 0) p.moveTo(px, py); else p.lineTo(px, py);
      }
      p.closePath();
    }
  });
  // D) 预计算单位圆表 + 缩放（8 段）
  const T8 = [];
  for (let k = 0; k < 8; k++) { const a = k * TAU / 8; T8.push([Math.cos(a), Math.sin(a)]); }
  const tD = bench(() => {
    const p = new Path2D();
    for (let i = 0; i < N; i++) {
      const x = i % 900, y = 100 + (i % 300), r = 1.5;
      for (let k = 0; k < 8; k++) {
        const px = x + T8[k][0] * r, py = y + T8[k][1] * r;
        if (k === 0) p.moveTo(px, py); else p.lineTo(px, py);
      }
      p.closePath();
    }
  });
  // E) 空路径基准
  const tE = bench(() => { const p = new Path2D(); for (let i = 0; i < N; i++) p.moveTo(i, i); });
  return JSON.stringify({ arc: tA, poly12: tB, poly8: tC, poly8table: tD, empty: tE });
})()
