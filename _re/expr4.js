(async () => {
  const d = window.__wbDebug, cv = document.querySelector('canvas');
  const r = cv.getBoundingClientRect();
  const wait = ms => new Promise(z => setTimeout(z, ms));
  const pg = () => d.doc.pages[d.doc.active];
  function fire(type, x, y, p, pid, type2) {
    cv.dispatchEvent(new PointerEvent(type, {
      pointerId: pid, pointerType: type2 || 'pen', isPrimary: true, bubbles: true, cancelable: true,
      clientX: r.left + x, clientY: r.top + y, pressure: p, buttons: type === 'pointerup' ? 0 : 1
    }));
  }
  pg().strokes.length = 0;
  d.setWidth(4);
  await wait(40);

  // A) 手写体：压力随速度起伏（模拟真实书写），正弦路径
  fire('pointerdown', 90, 180, 0.35, 61);
  for (let i = 1; i <= 260; i++) {
    const x = 90 + i * 1.7;
    const y = 180 + Math.sin(i / 9) * 34 + Math.sin(i / 3.1) * 3;
    const p = 0.3 + 0.55 * Math.abs(Math.sin(i / 14));
    fire('pointermove', x, y, p, 61);
  }
  fire('pointerup', 90 + 260 * 1.7, 180, 0.35, 61);
  await wait(30);

  // B) 细尖笔（宽 1.5）写小字
  d.setWidth(1.5);
  fire('pointerdown', 90, 300, 0.5, 62);
  for (let i = 1; i <= 160; i++) {
    const x = 90 + i * 2.2;
    const y = 300 + Math.sin(i / 4.5) * 12;
    fire('pointermove', x, y, 0.45 + 0.5 * Math.abs(Math.sin(i / 7)), 62);
  }
  fire('pointerup', 90 + 160 * 2.2, 300, 0.5, 62);
  await wait(30);

  // C) 荧光笔横跨前两笔
  d.setTool('hl');
  d.setWidth(10);
  fire('pointerdown', 80, 210, 0.5, 63);
  for (let x = 90; x <= 560; x += 8) fire('pointermove', x, 210, 0.5, 63);
  fire('pointerup', 560, 210, 0.5, 63);
  await wait(30);

  // D) 橡皮整笔擦除其中一段（画一条短线再擦掉）
  d.setTool('pen'); d.setWidth(6);
  fire('pointerdown', 620, 180, 0.8, 64);
  for (let x = 630; x <= 760; x += 8) fire('pointermove', x, 180, 0.8, 64);
  fire('pointerup', 760, 180, 0.8, 64);
  await wait(30);
  d.setTool('er');
  d.setWidth(6);
  fire('pointerdown', 690, 180, 0.5, 65);
  fire('pointermove', 695, 181, 0.5, 65);
  fire('pointerup', 695, 181, 0.5, 65);
  await wait(30);

  const st = pg().strokes;
  return JSON.stringify({
    count: st.length,
    pts: st.map(s => s.pts.length),
    types: st.map(s => s.t),
    totalPts: st.reduce((a, s) => a + s.pts.length, 0)
  });
})()
