(async function () {
  const d = window.__wbDebug, sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = { errors: [] };
  const q = s => document.querySelector(s);
  try {
    await sleep(900);
    const row = q('#penRow');
    out.dock = {
      pens: row.querySelectorAll('.pen[data-idx]').length,
      visible: row.getBoundingClientRect().width > 0,
      rowW: Math.round(row.getBoundingClientRect().width),
      toolbarW: Math.round(q('#toolbar').getBoundingClientRect().width),
      overflow: row.scrollHeight > row.clientHeight + 1,
      penSvg: (function () { const s = row.querySelector('.pen[data-idx] svg'); const b = s.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })(),
      trayGone: !q('#penTray')
    };

    // 选第 3 支笔
    const p2 = row.querySelector('.pen[data-idx="2"]');
    p2.click(); await sleep(120);
    out.pick3 = { color: d.color, tool: d.tool, on: p2.classList.contains('on') };

    // 右键第 1 支 → 色板
    const p0 = row.querySelector('.pen[data-idx="0"]');
    p0.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await sleep(200);
    const pm = q('#penMenu');
    out.menu = { shown: pm.classList.contains('show'), swatches: pm.querySelectorAll('.sw').length };
    pm.querySelectorAll('.sw')[3].click(); await sleep(200);
    out.afterSwatch = JSON.parse(localStorage.getItem('wb-pens'));

    // 加笔 / 删笔
    row.querySelector('.pen.add').click(); await sleep(240);
    out.afterAdd = row.querySelectorAll('.pen[data-idx]').length;
    const last = row.querySelectorAll('.pen[data-idx]').length - 1;
    row.querySelector('.pen[data-idx="' + last + '"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await sleep(160);
    Array.from(q('#penMenu').querySelectorAll('.item')).pop().click();
    await sleep(240);
    out.afterDel = row.querySelectorAll('.pen[data-idx]').length;

    // 笔宽
    const nib = Array.from(row.querySelectorAll('.pen.ic')).find(b => !b.dataset.tool);
    nib.click(); await sleep(200);
    const wp = q('#widthPop');
    out.widthPop = { shown: wp.classList.contains('show'), presets: wp.querySelectorAll('.dots button').length };
    wp.querySelectorAll('.dots button')[4].click(); await sleep(140);
    out.width = { v: d.width, label: wp.querySelector('.wfoot b').textContent };

    // 常驻栏工具：荧光笔 / 橡皮 / 套索
    q('#tHl').click(); await sleep(120);
    out.hl = { tool: d.tool, on: q('#tHl').classList.contains('on') };
    q('#tHl').click(); await sleep(120);
    out.hl2 = { tool: d.tool, lvl: d.hlLevel };
    q('#tEr').click(); await sleep(110); const e1 = d.tool;
    q('#tEr').click(); await sleep(110);
    out.er = { first: e1, second: d.tool, on: q('#tEr').classList.contains('on') };
    q('#tLasso').click(); await sleep(110);
    out.lasso = { tool: d.tool, on: q('#tLasso').classList.contains('on') };
    out.toolOnExclusive = { pen: q('#penRow .pen.on') ? 1 : 0, hl: q('#tHl').classList.contains('on') };

    // 画一笔
    d.setTool('pen'); d.setColor('#1857C2'); d.setWidth(4);
    const st = q('#stage'), R = st.getBoundingClientRect();
    const pe = (t, x, y) => st.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, clientX: R.left + x, clientY: R.top + y, pointerId: 1, pointerType: 'pen', pressure: .6, isPrimary: true }));
    pe('pointerdown', 300, 300);
    for (let i = 0; i <= 40; i++) pe('pointermove', 300 + i * 4, 300 + Math.sin(i / 6) * 40);
    pe('pointerup', 460, 300);
    await sleep(120);
    const ink = d.items().filter(i => i.kind === 'ink');
    out.drew = { n: ink.length, color: ink.length ? ink[ink.length - 1].c : null };

    // 笔宽浮层外点关闭
    nib.click(); await sleep(150);
    st.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: R.left + 20, clientY: R.top + 20 }));
    await sleep(150);
    out.popClosed = !q('#widthPop').classList.contains('show');
    d.repaint(); await sleep(250);
  } catch (e) { out.errors.push(String(e && e.stack || e)); }
  return out;
})()
