(async () => {
  const d = window.__wbDebug, cv = document.querySelector('canvas');
  const r = cv.getBoundingClientRect();
  const wait = ms => new Promise(z => setTimeout(z, ms));
  const pg = () => d.doc.pages[d.doc.active];
  function fire(type, x, y, p, pid) {
    cv.dispatchEvent(new PointerEvent(type, {
      pointerId: pid, pointerType: 'pen', isPrimary: true, bubbles: true, cancelable: true,
      clientX: r.left + x, clientY: r.top + y, pressure: p, buttons: type === 'pointerup' ? 0 : 1
    }));
  }
  pg().strokes.length = 0;
  d.setTool('pen'); d.setWidth(3);
  await wait(30);

  // 单笔 3000 点（约 30 秒连续书写）
  const t0 = performance.now();
  fire('pointerdown', 40, 300, 0.5, 71);
  for (let i = 1; i <= 3000; i++) {
    fire('pointermove', 40 + (i % 900) * 1.1, 300 + Math.sin(i / 7) * 60, 0.3 + 0.6 * Math.abs(Math.sin(i / 11)), 71);
  }
  fire('pointerup', 40, 300, 0.5, 71);
  const t1 = performance.now();

  // 再叠 30 笔中等长度，模拟整页
  const t2 = performance.now();
  for (let s = 0; s < 30; s++) {
    const y = 120 + s * 18;
    fire('pointerdown', 60, y, 0.5, 100 + s);
    for (let i = 1; i <= 120; i++) fire('pointermove', 60 + i * 4, y + Math.sin(i / 6) * 8, 0.4 + 0.4 * Math.abs(Math.sin(i / 9)), 100 + s);
    fire('pointerup', 540, y, 0.5, 100 + s);
  }
  const t3 = performance.now();

  const st = pg().strokes;
  return JSON.stringify({
    oneStrokePts: st[0].pts.length,
    oneStrokeMs: +(t1 - t0).toFixed(1),
    thirtyStrokesMs: +(t3 - t2).toFixed(1),
    totalStrokes: st.length,
    totalPts: st.reduce((a, s) => a + s.pts.length, 0)
  });
})()
