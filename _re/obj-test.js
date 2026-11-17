(async () => {
  const d = window.__wbDebug;
  const cv = document.getElementById('stage');
  const R = cv.getBoundingClientRect();
  const out = {}, errs = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pg = () => d.doc.pages[d.doc.active];
  await sleep(800);          // 等 boot() 的 IndexedDB 读取落地，否则 applyBoard 会中途换掉 pages
  d.doc.pages[d.doc.active].items.length = 0;
  d.doc.view = { x: 0, y: 0, s: 1 };
  d.repaint();
  await sleep(80);
  const view = d.doc.view;
  const sx = wx => (wx - view.x) * view.s;
  const sy = wy => (wy - view.y) * view.s;

  let seq = 0;
  function pe(type, x, y, o) {
    o = o || {};
    cv.dispatchEvent(new PointerEvent(type, {
      pointerId: o.id || 1, pointerType: o.pt || 'pen', isPrimary: true,
      bubbles: true, cancelable: true, button: 0,
      clientX: R.left + x, clientY: R.top + y,
      pressure: o.p === undefined ? 0.6 : o.p,
      tiltX: o.tx || 0, tiltY: o.ty || 0,
      buttons: type === 'pointerup' ? 0 : 1, shiftKey: !!o.shift
    }));
  }
  async function drag(pts, o) {
    pe('pointerdown', pts[0][0], pts[0][1], o);
    for (let i = 1; i < pts.length; i++) pe('pointermove', pts[i][0], pts[i][1], o);
    const last = pts[pts.length - 1];
    pe('pointerup', last[0], last[1], o);
    await sleep(30);
  }
  function line(x0, y0, x1, y1, n) {
    n = n || 40; const a = [];
    for (let i = 0; i <= n; i++) { const t = i / n; a.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]); }
    return a;
  }
  function arc(cx, cy, r, a0, a1, n) {
    n = n || 40; const a = [];
    for (let i = 0; i <= n; i++) { const g = a0 + (a1 - a0) * i / n; a.push([cx + r * Math.cos(g), cy + r * Math.sin(g)]); }
    return a;
  }
  async function step(name, fn) {
    try { out[name] = await fn(); } catch (e) { errs.push(name + ': ' + (e && e.message || e)); out[name] = 'ERR'; }
  }
  function esc() { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
  const inkItems = () => pg().items.filter(it => it.kind === 'ink');
  const count = () => pg().items.length;

  // ---- 1 直线美化 ----
  await step('penStraight', async () => {
    d.setTool('pen'); d.setWidth(3); d.setColor('#ffffff');
    const n0 = count();
    await drag(line(200, 160, 560, 160, 40), { p: 0.6 });
    const it = pg().items[count() - 1];
    return { added: count() - n0, kind: it && it.kind, t: it && it.t, pts: it && it.pts.length };
  });

  // ---- 2 曲线不美化 + tilt 存储 ----
  await step('penArc', async () => {
    await drag(arc(420, 340, 90, -2.4, -0.4, 48), { p: 0.7, tx: 45, ty: 30 });
    const it = pg().items[count() - 1];
    const p5 = it.pts[Math.min(5, it.pts.length - 1)];
    return { pts: it.pts.length, dim: p5.length, tx: p5[3], ty: p5[4] };
  });

  // ---- 3 Shift 拉直 ----
  await step('shiftStraight', async () => {
    const wob = line(200, 240, 520, 262, 30).map((p, i) => [p[0], p[1] + (i % 2 ? 6 : -6)]);
    await drag(wob, { p: 0.6, shift: true });
    const it = pg().items[count() - 1];
    const a = it.pts[0], b = it.pts[it.pts.length - 1];
    return { pts: it.pts.length, dy: Math.round(Math.abs(b[1] - a[1])) };
  });

  // ---- 4 荧光笔三档 ----
  await step('highlighter', async () => {
    d.setTool('hl'); d.setWidth(6);
    const lv0 = d.hlLevel;
    await drag(line(200, 200, 480, 210, 20), { p: 0.5 });
    const a = pg().items[count() - 1];
    document.getElementById('tHl').click();          // 循环到下一档
    const lv1 = d.hlLevel;
    d.setTool('hl');
    await drag(line(200, 220, 480, 230, 20), { p: 0.5 });
    const b = pg().items[count() - 1];
    return { lv0, aLv: a.lv, aT: a.t, lv1, bLv: b.lv, hlR: Math.round(d.ink.hlRadius(a) * 10) / 10 };
  });

  // ---- 5 局部橡皮切开 ----
  await step('partialErase', async () => {
    const before = inkItems().length;
    const target = pg().items.find(it => it.kind === 'ink' && it.pts.length === 2 && it.pts[0][1] === 160);
    if (!target) throw new Error('找不到直线笔迹');
    d.setTool('erp'); d.setWidth(4);
    await drag(line(380, 150, 380, 172, 10), { p: 0.6 });
    const after = inkItems().length;
    const runs = pg().items.filter(it => it.kind === 'ink' && it.t === 'pen' && it.pts[0][1] === 160);
    return { before, after, pieces: runs.length, xspans: runs.map(r => [Math.round(r.pts[0][0]), Math.round(r.pts[r.pts.length - 1][0])]) };
  });

  // ---- 6 整笔橡皮 ----
  await step('wholeErase', async () => {
    const before = inkItems().length;
    d.setTool('ers'); d.setWidth(6);
    await drag(line(340, 300, 520, 300, 20), { p: 0.6 });
    return { before, after: inkItems().length };
  });

  // ---- 7 文本对象 ----
  await step('text', async () => {
    d.setTool('text');
    await drag([[520, 430]], {});
    const ta = document.getElementById('tedit');
    const editing = getComputedStyle(ta).display !== 'none';
    ta.value = '离线白板 B 层\n第二行测试';
    ta.dispatchEvent(new Event('input'));
    d.commitEdit();
    const it = pg().items[count() - 1];
    return { editing, kind: it.kind, text: it.text, h: Math.round(it.h), lines: it.text.split('\n').length };
  });

  // ---- 8 便签 ----
  await step('note', async () => {
    d.setTool('note');
    await drag([[260, 520]], {});
    const ta = document.getElementById('tedit');
    ta.value = '便签内容';
    ta.dispatchEvent(new Event('input'));
    d.commitEdit();
    const it = pg().items[count() - 1];
    return { kind: it.kind, c: it.c, text: it.text, w: it.w, h: it.h };
  });

  // ---- 9 形状 ----
  await step('shape', async () => {
    d.setShape('rect');
    await drag([[620, 480], [700, 540], [780, 600]], {});
    const it = pg().items[count() - 1];
    return { kind: it.kind, s: it.s, w: Math.round(it.w), h: Math.round(it.h) };
  });

  // ---- 10 箭头吸附 ----
  await step('arrowSnap', async () => {
    const rect = pg().items.find(it => it.kind === 'shape' && it.s === 'rect');
    const left = rect.x;
    d.setShape('arrow');
    await drag(line(900, 540, left + 8, 540, 24), {});
    const it = pg().items[count() - 1];
    return { kind: it.kind, s: it.s, gap: Math.round(Math.abs(it.x2 - left)) };
  });

  // ---- 11 表格 ----
  await step('table', async () => {
    d.setTool('table');
    await drag([[220, 250]], {});
    const it = pg().items[count() - 1];
    return { kind: it.kind, rows: it.rows, cols: it.cols, w: Math.round(it.w), h: Math.round(it.h) };
  });

  // ---- 12 选择 + 移动 ----
  await step('move', async () => {
    d.setTool('sel');
    const it = pg().items.find(x => x.kind === 'text');
    const b = d.boundsOf(it);
    const cx = sx(b.x + b.w / 2), cy = sy(b.y + b.h / 2);
    await drag(line(cx, cy, cx + 60, cy + 40, 14), {});
    return { sel: d.sel.length, dx: Math.round(it.x - b.x), dy: Math.round(it.y - b.y) };
  });

  // ---- 13 手柄缩放 ----
  await step('scale', async () => {
    const it = pg().items.find(x => x.kind === 'text');
    const b0 = d.boundsOf(it);
    const hx = sx(b0.x + b0.w), hy = sy(b0.y + b0.h);
    await drag(line(hx, hy, hx + 70, hy + 50, 14), {});
    const b1 = d.boundsOf(it);
    return { w0: Math.round(b0.w), w1: Math.round(b1.w), h0: Math.round(b0.h), h1: Math.round(b1.h) };
  });

  // ---- 14 旋转 ----
  await step('rotate', async () => {
    const it = pg().items.find(x => x.kind === 'note');
    d.setTool('sel'); esc();
    const b = d.boundsOf(it);
    const cx = sx(b.x + b.w / 2), cy = sy(b.y + b.h / 2);
    await drag([[cx, cy]], {});                        // 先点选便签
    const rx = cx, ry = sy(b.y) - 26;
    await drag(line(rx, ry, rx + 80, ry + 60, 16), {});
    return { rot: Math.round((it.rot || 0) * 180 / Math.PI) };
  });

  // ---- 15 框选 ----
  await step('marquee', async () => {
    d.setTool('sel'); esc();
    await drag(line(180, 460, 420, 660, 16), {});
    return { sel: d.sel.length };
  });

  // ---- 16 套索 ----
  await step('lasso', async () => {
    d.setTool('lasso'); esc();
    const tbl = pg().items.find(x => x.kind === 'table');
    const b = d.boundsOf(tbl);
    const pad = 14;
    const poly = [[b.x - pad, b.y - pad], [b.x + b.w + pad, b.y - pad], [b.x + b.w + pad, b.y + b.h + pad], [b.x - pad, b.y + b.h + pad], [b.x - pad, b.y - pad]]
      .map(p => [sx(p[0]), sy(p[1])]);
    const dense = [];
    for (let i = 0; i < poly.length - 1; i++) dense.push(...line(poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1], 8));
    await drag(dense, {});
    return { sel: d.sel.length, hasTable: d.sel.indexOf(tbl.id) >= 0 };
  });

  // ---- 17 右键菜单 ----
  await step('contextMenu', async () => {
    d.setTool('sel'); esc();
    const it = pg().items.find(x => x.kind === 'shape' && x.s === 'rect');
    const b = d.boundsOf(it);
    cv.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, button: 2,
      clientX: R.left + sx(b.x + b.w / 2), clientY: R.top + sy(b.y + b.h / 2)
    }));
    await sleep(20);
    const m = document.getElementById('ctxmenu');
    const shown = m.classList.contains('show');
    const n = m.children.length;
    const del = Array.prototype.find.call(m.children, el => /删除/.test(el.textContent));
    const before = count();
    if (del) del.click();
    return { shown, items: n, before, after: count() };
  });

  // ---- 18 撤销 / 重做 ----
  await step('undoRedo', async () => {
    const c0 = count();
    document.getElementById('bUndo').click();
    await sleep(20);
    const c1 = count();
    document.getElementById('bRedo').click();
    await sleep(20);
    return { c0, undo: c1, redo: count() };
  });

  // ---- 19 序列化 + v1 迁移 ----
  await step('serializeMigrate', async () => {
    const s = d.serialize();
    const o = JSON.parse(s);
    const mig = d.normalizePage({ id: 'old', strokes: [{ t: 'pen', c: '#fff', w: 3, pts: [[1, 2, .5, 0, 0], [3, 4, .5, 0, 0]] }] });
    return { ver: o.version, pages: o.pages.length, items: o.pages[0].items.length, migKind: mig.items[0].kind, migStrokes: mig.strokes === undefined };
  });

  // ---- 20 IndexedDB 落盘 ----
  await step('idb', async () => {
    await sleep(900);
    const db = await new Promise((res, rej) => {
      const rq = indexedDB.open('wb-local');
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
    const val = await new Promise((res, rej) => {
      const tx = db.transaction('docs', 'readonly').objectStore('docs').get('doc');
      tx.onsuccess = () => res(tx.result); tx.onerror = () => rej(tx.error);
    });
    const o = typeof val === 'string' ? JSON.parse(val) : val;
    return { ver: o && o.version, items: o && o.pages[o.active].items.length, live: count() };
  });

  // ---- 21 回放 ----
  await step('replay', async () => {
    const t0 = performance.now();
    d.replay();
    await sleep(1500);
    return { ms: Math.round(performance.now() - t0), ok: true };
  });

  await step('repaintPixels', async () => {
    d.repaint();
    await sleep(400);
    const g = cv.getContext('2d');
    const im = g.getImageData(0, 0, cv.width, cv.height).data;
    let bright = 0;
    for (let i = 0; i < im.length; i += 4) if (im[i] + im[i + 1] + im[i + 2] > 150) bright++;
    return { w: cv.width, h: cv.height, bright, pct: Math.round(bright / (cv.width * cv.height) * 1000) / 10 };
  });
  out.summary = { total: count(), kinds: pg().items.reduce((a, it) => (a[it.kind] = (a[it.kind] || 0) + 1, a), {}) };
  out.errors = errs;
  return out;
})()
