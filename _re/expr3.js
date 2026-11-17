(async () => {
  const d = window.__wbDebug, cv = document.querySelector('canvas');
  const g = cv.getContext('2d');
  const r = cv.getBoundingClientRect();
  const wait = ms => new Promise(z => setTimeout(z, ms));
  const dpr = window.devicePixelRatio || 1;
  const pg = () => d.doc.pages[d.doc.active];

  function fire(type, x, y, p, pid) {
    cv.dispatchEvent(new PointerEvent(type, {
      pointerId: pid, pointerType: 'pen', isPrimary: true, bubbles: true, cancelable: true,
      clientX: r.left + x, clientY: r.top + y, pressure: p, buttons: type === 'pointerup' ? 0 : 1
    }));
  }
  function thick(cssY, span) {
    const y0 = Math.round((cssY - span) * dpr), h = Math.round(span * 2 * dpr);
    const img = g.getImageData(300, y0, 1, h).data;
    const bg = [img[0], img[1], img[2]];
    let n = 0, first = -1, last = -1;
    for (let i = 0; i < h; i++) {
      const dv = Math.abs(img[i*4]-bg[0]) + Math.abs(img[i*4+1]-bg[1]) + Math.abs(img[i*4+2]-bg[2]);
      if (dv > 60) { n++; if (first < 0) first = i; last = i; }
    }
    return { solid: n ? last - first + 1 : 0, n };
  }

  d.setWidth(12);
  pg().strokes.length = 0;
  await wait(40);

  const cases = [0.1, 0.3, 0.55, 0.8, 1.0];
  const yFor = i => 150 + i * 90;
  cases.forEach((p, i) => {
    fire('pointerdown', 150, yFor(i), p, 50 + i);
    for (let x = 160; x <= 450; x += 10) fire('pointermove', x, yFor(i), p, 50 + i);
    fire('pointerup', 450, yFor(i), p, 50 + i);
  });
  return JSON.stringify({
    width: d.width,
    theory: cases.map(p => +(d.width * (1.5 * p + 0.25)).toFixed(2)),
    measured: cases.map((p, i) => thick(yFor(i), 20).solid),
    counts: pg().strokes.map(s => s.pts.length)
  });
})()
