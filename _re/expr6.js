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

  fire('pointerdown', 40, 300, 0.5, 71);
  for (let i = 1; i <= 3000; i++) {
    fire('pointermove', 40 + (i % 900) * 1.1, 300 + Math.sin(i / 7) * 60, 0.3 + 0.6 * Math.abs(Math.sin(i / 11)), 71);
  }
  fire('pointerup', 40, 300, 0.5, 71);

  const st = pg().strokes[0];

  // 1) 构建 Path2D 的成本
  let t = performance.now();
  let p;
  for (let i = 0; i < 5; i++) p = d.ink.path(st);
  const buildMs = (performance.now() - t) / 5;

  // 2) 填充该路径的成本（每帧都要做一次）
  const off = document.createElement('canvas');
  off.width = 1200; off.height = 800;
  const g = off.getContext('2d');
  t = performance.now();
  for (let i = 0; i < 10; i++) { g.clearRect(0, 0, 1200, 800); g.fillStyle = '#fff'; g.fill(p, 'nonzero'); }
  const fillMs = (performance.now() - t) / 10;

  // 3) 参考：3 点短笔的填充成本
  const short = { t: 'pen', c: '#fff', w: 3, pts: [[10, 10, .5], [100, 40, .5], [200, 10, .5]] };
  const sp = d.ink.path(short);
  t = performance.now();
  for (let i = 0; i < 100; i++) { g.clearRect(0, 0, 1200, 800); g.fillStyle = '#fff'; g.fill(sp, 'nonzero'); }
  const shortMs = (performance.now() - t) / 100;

  return JSON.stringify({
    pts: st.pts.length,
    buildMs: +buildMs.toFixed(2),
    fillMs: +fillMs.toFixed(2),
    shortFillMs: +shortMs.toFixed(3)
  });
})()
