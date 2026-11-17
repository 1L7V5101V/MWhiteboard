(async function () {
  const d = window.__wbDebug, sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = { errors: [] };
  const q = s => document.querySelector(s);
  try {
    await sleep(900);
    // 1 打开笔盘
    q('#tPen').click();
    await sleep(260);
    const tray = q('#penTray');
    out.trayShown = tray.classList.contains('show');
    out.penCount = tray.querySelectorAll('.pen[data-idx]').length;
    out.trayItems = Array.from(tray.querySelectorAll('.pen')).map(b => b.dataset.idx !== undefined ? 'pen' + b.dataset.idx : (b.dataset.tool || 'ic'));
    out.defaultColors = JSON.parse(localStorage.getItem('wb-pens') || 'null');
    out.trayW = Math.round(tray.getBoundingClientRect().width);

    // 2 选第 3 支笔
    const p2 = tray.querySelector('.pen[data-idx="2"]');
    p2.click(); await sleep(120);
    out.pick3 = { color: d.color, tool: d.tool, onClass: p2.classList.contains('on') };

    // 3 右键第 1 支 → 色板
    const p0 = tray.querySelector('.pen[data-idx="0"]');
    p0.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await sleep(200);
    const pm = q('#penMenu');
    out.menu = { shown: pm.classList.contains('show'), swatches: pm.querySelectorAll('.sw').length, items: pm.querySelectorAll('.item').length };
    // 换色：取第 4 个色块（红）
    pm.querySelectorAll('.sw')[3].click(); await sleep(200);
    out.afterSwatch = { colors: JSON.parse(localStorage.getItem('wb-pens')), menuShown: pm.classList.contains('show') };

    // 4 加一支笔
    q('#penTray').querySelector('.pen.add').click(); await sleep(240);
    out.afterAdd = { n: q('#penTray').querySelectorAll('.pen[data-idx]').length, color: d.color, stored: JSON.parse(localStorage.getItem('wb-pens')).length };

    // 5 删一支
    d.delPenTest = true;
    const last = q('#penTray').querySelectorAll('.pen[data-idx]').length - 1;
    const lastBtn = q('#penTray').querySelector('.pen[data-idx="' + last + '"]');
    lastBtn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await sleep(160);
    const delItem = Array.from(q('#penMenu').querySelectorAll('.item')).pop();
    delItem.click(); await sleep(240);
    out.afterDel = { n: q('#penTray').querySelectorAll('.pen[data-idx]').length, stored: JSON.parse(localStorage.getItem('wb-pens')).length };

    // 6 笔宽浮层
    const nib = Array.from(q('#penTray').querySelectorAll('.pen.ic')).find(b => !b.dataset.tool);
    nib.click(); await sleep(200);
    const wp = q('#widthPop');
    out.widthPop = { shown: wp.classList.contains('show'), presets: wp.querySelectorAll('.dots button').length };
    wp.querySelectorAll('.dots button')[4].click(); await sleep(150);
    out.width16 = { width: d.width, label: wp.querySelector('.wfoot b').textContent, on: wp.querySelectorAll('.dots button.on').length };

    // 7 荧光笔 / 橡皮 / 套索
    const hb = q('#penTray').querySelector('.pen[data-tool="hl"]'); hb.click(); await sleep(120);
    out.hl = { tool: d.tool, on: hb.classList.contains('on'), lvl: d.hlLevel };
    hb.click(); await sleep(120);
    out.hl2 = { tool: d.tool, lvl: d.hlLevel };
    const eb = q('#penTray').querySelector('.pen[data-tool="er"]');
    eb.click(); await sleep(100); const t1 = d.tool; eb.click(); await sleep(100);
    out.eraser = { first: t1, second: d.tool, on: eb.classList.contains('on') };
    const lb = q('#penTray').querySelector('.pen[data-tool="lasso"]'); lb.click(); await sleep(100);
    out.lasso = { tool: d.tool, on: lb.classList.contains('on') };

    // 8 撤销/重做按钮存在且可点
    out.undoBtns = q('#penTray').querySelectorAll('.pen.ic').length;

    // 9 画一笔确认新笔色生效
    d.setTool('pen'); d.setColor('#1857C2'); d.setWidth(4);
    const st = q('#stage'), R = st.getBoundingClientRect();
    const pe = (type, x, y, o) => st.dispatchEvent(new PointerEvent(type, Object.assign({ bubbles: true, cancelable: true, clientX: R.left + x, clientY: R.top + y, pointerId: 1, pointerType: 'pen', pressure: .6, isPrimary: true }, o || {})));
    pe('pointerdown', 300, 300);
    for (let i = 0; i <= 40; i++) pe('pointermove', 300 + i * 4, 300 + Math.sin(i / 6) * 40);
    pe('pointerup', 460, 300);
    await sleep(120);
    const ink = d.items().filter(i => i.kind === 'ink');
    out.drew = { n: ink.length, color: ink.length ? ink[ink.length - 1].c : null, pts: ink.length ? ink[ink.length - 1].pts.length : 0 };

    // 10 关闭笔盘
    q('#stage').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: R.left + 20, clientY: R.top + 20 }));
    await sleep(150);
    out.closedByOutside = !q('#penTray').classList.contains('show');

    // 重开用于截图
    q('#tPen').click(); await sleep(300);
    d.repaint(); await sleep(200);
  } catch (e) { out.errors.push(String(e && e.stack || e)); }
  return out;
})()
