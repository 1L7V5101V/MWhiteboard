(async () => {
  const d = window.__wbDebug;
  const cv = document.getElementById('stage');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pg = () => d.doc.pages[d.doc.active];
  const it = () => pg().items;
  const last = () => { const a = it(); return a[a.length - 1]; };
  const ta = document.getElementById('tedit');

  await sleep(700);            // 等 IndexedDB load() 完成，避免拿到随后被替换掉的旧数组
  it().length = 0;
  d.repaint();

  function setText(o, txt) {
    ta.value = txt;
    ta.dispatchEvent(new Event('input'));
    d.commitEdit();
  }

  d.createText({ x: 90, y: 150 });
  await sleep(40);
  Object.assign(last(), { w: 620, size: 32, c: '#111111' });
  setText(last(), 'MWhiteboard');

  d.createText({ x: 92, y: 202 });
  await sleep(40);
  Object.assign(last(), { w: 760, size: 15, c: '#6b6b6b' });
  setText(last(), '微软官方外壳 · 本地离线 · 原版墨迹引擎逆向移植');

  // ---- 笔迹 ----
  const R = cv.getBoundingClientRect();
  function pe(type, x, y, o) {
    o = o || {};
    cv.dispatchEvent(new PointerEvent(type, {
      pointerId: 7, pointerType: 'pen', isPrimary: true, bubbles: true, cancelable: true,
      button: 0, clientX: R.left + x, clientY: R.top + y,
      pressure: o.p === undefined ? 0.6 : o.p, buttons: type === 'pointerup' ? 0 : 1
    }));
  }
  async function stroke(pts, o) {
    pe('pointerdown', pts[0][0], pts[0][1], o);
    for (let i = 1; i < pts.length; i++) pe('pointermove', pts[i][0], pts[i][1], o);
    pe('pointerup', pts[pts.length - 1][0], pts[pts.length - 1][1], o);
    await sleep(20);
  }

  d.setTool('pen'); d.setColor('#2ea3ff'); d.setWidth(4);
  const wave = [];
  for (let i = 0; i <= 60; i++) wave.push([90 + i * 7.2, 320 + Math.sin(i / 9.5) * 44 * (1 - i / 95)]);
  await stroke(wave, { p: 0.75 });

  d.setTool('hl'); d.setColor('#ffd60a'); d.setWidth(9);
  await stroke([[330, 322], [400, 322], [470, 322], [520, 322]], { p: 0.5 });

  // ---- 便签 ----
  d.setTool('note');
  d.createNote({ x: 760, y: 250 });
  await sleep(40);
  const note = last();
  setText(note, '便签 · 双击编辑');
  note.rot = -0.05;

  // ---- 形状 ----
  d.addItem({ id: 'r1', kind: 'shape', s: 'rect', x: 90, y: 430, w: 200, h: 120, c: '#0C35FB', sw: 2, fill: null, rot: 0 });
  d.addItem({ id: 'a1', kind: 'shape', s: 'arrow', x1: 296, y1: 490, x2: 486, y2: 490, c: '#34c759', sw: 2.5 });
  d.addItem({ id: 'e1', kind: 'shape', s: 'ellipse', x: 90, y: 566, w: 120, h: 96, c: '#ff9f1a', sw: 2, fill: null, rot: 0 });
  d.addItem({ id: 'd1', kind: 'shape', s: 'diamond', x: 230, y: 566, w: 110, h: 96, c: '#ff5cae', sw: 2, fill: null, rot: 0 });

  // ---- 表格 ----
  d.setTool('table');
  d.createTable({ x: 700, y: 470 });
  const tbl = last();
  Object.assign(tbl, { w: 400, h: 200 });
  const cells = [['对象', '状态', '说明'], ['笔迹', '已移植', '压感 / 抽稀 / 样条'], ['对象层', '已实现', '文本 / 便签 / 形状']];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) tbl.cells[r][c] = cells[r][c];
  tbl.tc = '#111111';

  // ---- 底部说明 ----
  d.setTool('pen');
  d.createText({ x: 132, y: 672 });
  await sleep(40);
  Object.assign(last(), { w: 430, size: 14, c: '#8a8a8a' });
  setText(last(), '拖动移动 · 8 手柄缩放 · 圆点旋转 · 套索 · 右键菜单');

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(3200);          // 等底部提示 toast 自己消失
  d.repaint();
  await sleep(350);
  return { items: it().length, kinds: it().map(i => i.kind).join(',') };
})()
