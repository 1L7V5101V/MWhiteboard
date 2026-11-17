  // ================= 新版外壳 UI：对齐 Microsoft Whiteboard 外观 =================
  function icon(n, s) { s = s || 20; return '<svg viewBox="0 0 20 20" width="' + s + '" height="' + s + '" fill="none">' + (ICON[n] || '') + '</svg>'; }
  function penSvg(c) {
    return '<svg viewBox="0 0 24 24" width="24" height="24">' +
      '<path d="M15.9 3.6a2.6 2.6 0 0 1 3.7 3.7L8.4 18.5l-4.6 1.4 1.4-4.6L15.9 3.6Z" fill="' + c + '"/>' +
      '<path d="M14.6 4.9l3.7 3.7" stroke="#fff" stroke-opacity=".45" stroke-width="1.5"/></svg>';
  }
  function markerSvg(c) {
    return '<svg viewBox="0 0 24 24" width="24" height="24">' +
      '<path d="M8.7 3.4h4.6l1.9 10.4H6.8L8.7 3.4Z" fill="' + c + '"/>' +
      '<path d="M6.6 14.2h9.8l.7 3.8H5.9l.7-3.8Z" fill="' + c + '" fill-opacity=".5"/>' +
      '<path d="M9.6 2.5h3" stroke="' + c + '" stroke-width="1.6"/></svg>';
  }
  function eraserSvg() {
    return '<svg viewBox="0 0 24 24" width="24" height="24">' +
      '<path d="M3.4 15.4 11.9 7a2 2 0 0 1 2.8 0l3.1 3.1a2 2 0 0 1 0 2.8l-4.9 4.9H6.5l-3.1-3.1Z" fill="#F2DDE0"/>' +
      '<path d="M3.4 15.4 11.9 7a2 2 0 0 1 2.8 0l1.3 1.3-8.4 8.4H6.5l-3.1-3.1Z" fill="#E3B0B9"/>' +
      '<path d="M9.4 18.5h9.2" stroke="#8A8A8A" stroke-width="1.5" stroke-linecap="round"/></svg>';
  }

  // ---------- 静态图标 ----------
  (function () {
    $('bHome').innerHTML = icon('home');
    $('titleChev').innerHTML = icon('chevron_down', 16);
    $('bTimer').innerHTML = icon('timer');
    $('bSettings').innerHTML = icon('settings');
    $('gUser').innerHTML = icon('person_circle', 22);
    $('gSettings').innerHTML = icon('settings', 22);
    $('bUndo').innerHTML = icon('arrow_undo');
    $('bRedo').innerHTML = icon('arrow_redo');
    $('tSel').innerHTML = icon('cursor');
    $('tEr').innerHTML = icon('eraser');
    $('tPen').innerHTML = icon('pen') + '<span class="cdot"></span>';
    $('tNote').innerHTML = icon('note');
    $('tHeart').innerHTML = icon('heart');
    $('tText').innerHTML = icon('text_font');
    $('tIns').innerHTML = icon('grid');
    $('bMore').innerHTML = icon('more_horizontal');
    $('bZoomOut').innerHTML = icon('zoom_out', 18);
    $('bZoomIn').innerHTML = icon('zoom_in', 18);
    $('bFit').innerHTML = icon('arrow_fit', 18);
    $('bAddPage').innerHTML = icon('add', 16);
    $('bDelPage').innerHTML = icon('delete', 16);
    $('bShare').innerHTML = icon('share', 16) + '<span>共享</span>';
  })();

  // ---------- 白板列表 / 存储 ----------
  var BOARD_KEY = 'wb-board-id';
  var boardId = localStorage.getItem(BOARD_KEY) || '';
  var boardTitle = '无标题的白板';
  var boardList = [];
  var curThumb = null, lastThumb = 0;

  function dbAll() {
    return db().then(function (d) {
      return new Promise(function (res) {
        var out = [];
        var rq = d.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).openCursor();
        rq.onsuccess = function () {
          var c = rq.result;
          if (!c) return res(out);
          out.push({ key: c.key, val: c.value });
          c.continue();
        };
        rq.onerror = function () { res(out); };
      });
    });
  }
  function dbPut(rec) {
    return db().then(function (d) {
      var tx = d.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(rec, rec.id);
    });
  }
  function dbDel(id) {
    return db().then(function (d) {
      var tx = d.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(id);
    });
  }

  function pageBounds(pg) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, any = false;
    (pg.items || []).forEach(function (it) {
      var b = boundsOf(it);
      if (!b.w && !b.h) return;
      any = true;
      if (b.x < x0) x0 = b.x; if (b.y < y0) y0 = b.y;
      if (b.x + b.w > x1) x1 = b.x + b.w; if (b.y + b.h > y1) y1 = b.y + b.h;
    });
    if (!any) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function makeThumb() {
    try {
      var pg = doc.pages[0];
      var b = pg && pageBounds(pg);
      if (!b) return null;
      var c = document.createElement('canvas');
      c.width = 452; c.height = 240;
      var x = c.getContext('2d');
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, 452, 240);
      var k = Math.min(452 / (b.w + 90), 240 / (b.h + 90), 1.6);
      x.setTransform(k, 0, 0, k, (452 - b.w * k) / 2 - b.x * k, (240 - b.h * k) / 2 - b.y * k);
      pg.items.forEach(function (it) { try { drawItem(x, it); } catch (e) { } });
      return c.toDataURL('image/png');
    } catch (e) { return null; }
  }

  // 覆盖旧 flush：写进「多白板」结构
  flush = function () {
    if (!dirty) return;
    dirty = false;
    if (Date.now() - lastThumb > 1200) { curThumb = makeThumb(); lastThumb = Date.now(); }
    var rec = {
      id: boardId, title: boardTitle, updated: Date.now(), paper: paper,
      active: doc.active, view: doc.view, thumb: curThumb,
      pages: doc.pages.map(function (p) {
        return {
          id: p.id,
          items: JSON.parse(JSON.stringify(p.items, function (k, v) { return k === 'el' ? undefined : v; })),
          bg: p.bg && p.bg.src ? { src: p.bg.src, alpha: p.bg.alpha } : null
        };
      })
    };
    var meta = null;
    for (var i = 0; i < boardList.length; i++) if (boardList[i].id === boardId) meta = boardList[i];
    if (!meta) { meta = { id: boardId }; boardList.push(meta); }
    meta.id = boardId; meta.title = boardTitle; meta.updated = rec.updated; meta.thumb = curThumb;
    dbPut(rec).catch(function () { });
  };

  function fmtTime(t) {
    if (!t) return '';
    var d = new Date(t), n = new Date();
    var hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    var sameDay = d.toDateString() === n.toDateString();
    if (sameDay) return hm;
    var y = new Date(n.getTime() - 864e5);
    if (d.toDateString() === y.toDateString()) return '昨天 ' + hm;
    if (d.getFullYear() === n.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  // ---------- 视图切换 ----------
  function showGallery() {
    flush();
    $('board').classList.add('hide');
    $('gallery').classList.remove('hide');
    document.body.classList.add('gal');
    renderGallery();
  }
  function showBoard() {
    $('gallery').classList.add('hide');
    $('board').classList.remove('hide');
    document.body.classList.remove('gal');
    resize(); sceneDirty = true; schedule();
  }

  function renderGallery() {
    var g = $('gGrid');
    g.innerHTML = '';
    var nc = document.createElement('div');
    nc.className = 'card new';
    nc.innerHTML = '<div class="plus">' + icon('add', 22) + '</div><b>新建白板</b>';
    nc.onclick = function () { newBoard(); };
    g.appendChild(nc);
    boardList.slice().sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); }).forEach(function (b) {
      var c = document.createElement('div');
      c.className = 'card';
      var th = document.createElement('div');
      th.className = 'thumb';
      if (b.thumb) th.style.backgroundImage = 'url(' + b.thumb + ')';
      var meta = document.createElement('div');
      meta.className = 'meta';
      var t = document.createElement('b'); t.textContent = b.title || '无标题的白板';
      var s = document.createElement('span'); s.textContent = '编辑时间：' + fmtTime(b.updated);
      meta.appendChild(t); meta.appendChild(s);
      var dots = document.createElement('button');
      dots.className = 'dots'; dots.title = '更多'; dots.innerHTML = icon('more_horizontal', 18);
      dots.onclick = function (e) { e.stopPropagation(); cardMenu(dots, b); };
      c.appendChild(th); c.appendChild(meta); c.appendChild(dots);
      c.onclick = function () { openBoard(b.id); };
      g.appendChild(c);
    });
  }

  function applyBoard(b) {
    boardId = b.id;
    boardTitle = b.title || '无标题的白板';
    localStorage.setItem(BOARD_KEY, boardId);
    doc.pages = (b.pages && b.pages.length ? b.pages : [{ id: uid(), items: [], bg: null }]).map(function (p) {
      return normalizePage({ id: p.id || uid(), items: p.items, strokes: p.strokes, bg: p.bg || null });
    });
    doc.active = Math.min(b.active || 0, doc.pages.length - 1);
    if (b.view && b.view.s) doc.view = { x: b.view.x || 0, y: b.view.y || 0, s: b.view.s };
    paper = b.paper || 'light';
    curThumb = b.thumb || null;
    doc.pages.forEach(restoreBg);
    undoStack.length = 0; redoStack.length = 0; sel = [];
    $('titleText').value = boardTitle;
    renderPages(); updateZoom(); syncChrome();
    sceneDirty = true; schedule();
  }

  function openBoard(id) {
    flush();
    dbAll().then(function (rows) {
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].key === id) { applyBoard(rows[i].val); showBoard(); return; }
      }
      newBoard();
    });
  }
  function newBoard() {
    flush();
    var rec = {
      id: uid(), title: '无标题的白板', updated: Date.now(), paper: 'light',
      active: 0, view: { x: 0, y: 0, s: 1 }, thumb: null,
      pages: [{ id: uid(), items: [], bg: null }]
    };
    boardList.push({ id: rec.id, title: rec.title, updated: rec.updated, thumb: null });
    dbPut(rec).catch(function () { });
    applyBoard(rec);
    showBoard();
    setTimeout(function () { $('titleText').focus(); $('titleText').select(); }, 60);
  }

  // ---------- 菜单 ----------
  function menuItems(host, items) {
    host.innerHTML = '';
    items.forEach(function (it) {
      if (it === '-') { host.appendChild(document.createElement('hr')); return; }
      var d = document.createElement('div');
      d.className = 'item';
      d.innerHTML = icon(it.i, 18) + '<span>' + it.t + '</span>' + (it.k ? '<span class="kbd">' + it.k + '</span>' : '');
      d.onclick = function (e) { e.stopPropagation(); host.classList.remove('show'); it.f(); };
      host.appendChild(d);
    });
  }
  var openMenuHost = null;
  function placeMenu(host, btn, up) {
    hideMenus();
    openMenuHost = host;
    host.classList.add('show');
    var r = btn.getBoundingClientRect();
    var w = host.offsetWidth, h = host.offsetHeight;
    var left = Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2));
    var top = up ? r.top - h - 8 : r.bottom + 6;
    if (top < 8) top = r.bottom + 6;
    host.style.left = left + 'px'; host.style.top = top + 'px';
  }
  function hideMenus() {
    ['insMenu', 'moreMenu', 'boardMenu', 'setMenu', 'cardMenu', 'emojiMenu'].forEach(function (id) { $(id).classList.remove('show'); });
    openMenuHost = null;
    $('penTray').classList.remove('show');
  }

  function ask(msg, ok) {
    var o = document.createElement('div');
    o.className = 'modal';
    o.innerHTML = '<div class="box"><p></p><div class="row"><button class="ghost">取消</button><button class="pri">确定</button></div></div>';
    o.querySelector('p').textContent = msg;
    o.querySelector('.ghost').onclick = function () { o.remove(); };
    o.querySelector('.pri').onclick = function () { o.remove(); ok(); };
    o.onclick = function (e) { if (e.target === o) o.remove(); };
    document.body.appendChild(o);
  }

  // ---------- 笔盘 ----------
  var PEN_COLORS = ['#000000', '#C50F1F', '#0C35FB'];
  function buildPenTray() {
    var h = $('penTray');
    h.innerHTML = '';
    PEN_COLORS.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'pen'; b.dataset.c = c; b.title = '笔';
      b.innerHTML = penSvg(c);
      b.onclick = function () { setColorTo(c); setTool('pen'); markPens(); };
      h.appendChild(b);
    });
    var hl = document.createElement('button');
    hl.className = 'pen'; hl.dataset.tool = 'hl'; hl.title = '荧光笔（再点换粗细）';
    hl.innerHTML = markerSvg('#F2E900');
    hl.onclick = function () { setTool('hl'); markPens(); };
    h.appendChild(hl);
    var er = document.createElement('button');
    er.className = 'pen'; er.dataset.tool = 'ers'; er.title = '橡皮';
    er.innerHTML = eraserSvg();
    er.onclick = function () { setTool('ers'); markPens(); };
    h.appendChild(er);
    var cus = document.createElement('button');
    cus.className = 'pen custom'; cus.title = '更多颜色';
    cus.innerHTML = '<span class="ring"></span>';
    var inp = document.createElement('input');
    inp.type = 'color'; inp.value = color;
    inp.oninput = function () { setColorTo(inp.value); setTool('pen'); markPens(); };
    cus.appendChild(inp);
    h.appendChild(cus);
    var sep = document.createElement('div');
    sep.className = 'vsep';
    h.appendChild(sep);
    var x = document.createElement('button');
    x.className = 'pen'; x.title = '关闭';
    x.innerHTML = icon('dismiss', 18);
    x.onclick = function () { $('penTray').classList.remove('show'); };
    h.appendChild(x);
  }
  function setColorTo(c) {
    color = c;
    var host = $('colors');
    if (host) Array.prototype.forEach.call(host.children, function (x) { x.classList.remove('on'); });
    var cd = document.querySelector('#tPen .cdot');
    if (cd) cd.style.background = c;
  }
  function markPens() {
    Array.prototype.forEach.call($('penTray').children, function (b) {
      if (b.classList.contains('custom') || b.classList.contains('vsep')) return;
      var on = false;
      if (b.dataset.c) on = (tool === 'pen' && color.toLowerCase() === b.dataset.c.toLowerCase());
      if (b.dataset.tool === 'hl') on = (tool === 'hl');
      if (b.dataset.tool === 'ers') on = (tool === 'ers');
      b.classList.toggle('on', on);
    });
    var cus = $('penTray').querySelector('.custom .ring');
    if (cus) cus.style.background = color;
  }

  // ---------- 工具栏状态同步 ----------
  function syncChrome() {
    var map = { pen: 'tPen', sel: 'tSel', ers: 'tEr', note: 'tNote', text: 'tText' };
    ['tPen', 'tSel', 'tEr', 'tNote', 'tText'].forEach(function (id) { $(id).classList.toggle('on', map[tool] === id); });
    var cd = document.querySelector('#tPen .cdot');
    if (cd) cd.style.background = color;
    markPens();
  }
  var _setTool = setTool;
  setTool = function (t) { _setTool(t); syncChrome(); };

  // ---------- 表情 ----------
  var EMOJI = ['😀', '👍', '❤️', '🎉', '⭐', '✅', '❓', '🔥'];
  function insertEmoji(ch) {
    var w = toWorld(W / 2, H / 2);
    pushUndo();
    addItem({ id: uid(), kind: 'text', x: w.x - 34, y: w.y - 34, w: 68, h: 68, size: 44, c: '#232323', text: ch, rot: 0 });
    sceneDirty = true; schedule(); save();
  }

  // ---------- 计时器 ----------
  var timerEnd = 0, timerT = null;
  function startTimer(min) {
    timerEnd = Date.now() + min * 60000;
    $('timerBadge').classList.remove('hide');
    clearInterval(timerT);
    timerT = setInterval(function () {
      var left = timerEnd - Date.now();
      if (left <= 0) {
        clearInterval(timerT); timerT = null;
        $('timerBadge').classList.add('hide');
        toast('计时结束');
        return;
      }
      var s = Math.ceil(left / 1000);
      $('timerBadge').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }, 250);
    $('timerBadge').textContent = min + ':00';
  }

  // ---------- 顶栏 ----------
  $('bHome').onclick = function () { showGallery(); };
  $('titleText').oninput = function () { boardTitle = this.value || '无标题的白板'; save(); };
  $('titleText').onblur = function () { if (!this.value.trim()) { this.value = '无标题的白板'; boardTitle = this.value; save(); } };
  $('titleText').onkeydown = function (e) { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') this.blur(); };
  $('titleChev').onclick = function () {
    menuItems($('boardMenu'), [
      { i: 'edit', t: '重命名白板', f: function () { $('titleText').focus(); $('titleText').select(); } },
      { i: 'arrow_download', t: '导出当前页 PNG', f: function () { $('bSave').click(); } },
      { i: 'code', t: '备份 / 恢复 JSON', f: function () { $('bJson').click(); } },
      '-',
      { i: 'add', t: '加一页', f: function () { $('bAddPage').click(); } },
      { i: 'delete', t: '删除当前页', f: function () { $('bDelPage').click(); } },
      '-',
      { i: 'delete', t: '删除此白板', f: function () { ask('删除「' + boardTitle + '」？此操作不可撤销。', function () { delBoard(boardId); }); } }
    ]);
    placeMenu($('boardMenu'), this, false);
  };
  $('bShare').onclick = function () { toast('离线模式：共享与协作不可用'); };
  $('bTimer').onclick = function () {
    menuItems($('setMenu'), [
      { i: 'timer', t: '1 分钟', f: function () { startTimer(1); } },
      { i: 'timer', t: '3 分钟', f: function () { startTimer(3); } },
      { i: 'timer', t: '5 分钟', f: function () { startTimer(5); } },
      { i: 'timer', t: '10 分钟', f: function () { startTimer(10); } },
      '-',
      { i: 'dismiss', t: '取消计时', f: function () { clearInterval(timerT); $('timerBadge').classList.add('hide'); } }
    ]);
    placeMenu($('setMenu'), this, false);
  };
  $('bSettings').onclick = function () { settingsMenu(this); };
  $('gSettings').onclick = function () { settingsMenu(this); };
  $('gUser').onclick = function () { toast('本地离线账户'); };

  function settingsMenu(btn) {
    menuItems($('setMenu'), [
      { i: 'paint_bucket', t: '纸张底色', k: '深/白/格/点', f: function () { $('bBg').click(); } },
      { i: 'image', t: '导入图片当底图', f: function () { pendingImageAt = null; $('fileImg').click(); } },
      { i: 'play', t: '回放书写过程', f: function () { $('bReplay').click(); } },
      '-',
      { i: 'arrow_download', t: '导出 PNG', f: function () { $('bSave').click(); } },
      { i: 'code', t: '备份 / 恢复 JSON', f: function () { $('bJson').click(); } },
      '-',
      { i: 'text_font', t: '快捷键与说明', k: '?', f: function () { $('bHelp').click(); } },
      { i: 'home', t: '回到主页', f: function () { showGallery(); } }
    ]);
    placeMenu($('setMenu'), btn, false);
  }

  // ---------- 工具栏 ----------
  $('tPen').onclick = function () {
    setTool('pen');
    var t = $('penTray');
    if (t.classList.contains('show')) { t.classList.remove('show'); return; }
    hideMenus();
    t.classList.add('show');
    markPens();
    var r = $('toolbar').getBoundingClientRect();
    t.style.left = Math.round(r.left + r.width / 2) + 'px';
  };
  $('tHeart').onclick = function () {
    var h = $('emojiMenu');
    h.innerHTML = '';
    EMOJI.forEach(function (ch) {
      var b = document.createElement('button');
      b.className = 'emo'; b.textContent = ch;
      b.onclick = function () { h.classList.remove('show'); insertEmoji(ch); };
      h.appendChild(b);
    });
    placeMenu(h, this, true);
  };
  $('tIns').onclick = function () {
    menuItems($('insMenu'), [
      { i: 'image', t: '图片', f: function () { pendingImageAt = toWorld(W / 2, H / 2); $('fileImg').click(); } },
      { i: 'table', t: '表格', f: function () { createTable(); } },
      { i: 'note', t: '便签', f: function () { createNote(); } },
      { i: 'text_font', t: '文本框', f: function () { createText(); } },
      { i: 'shapes', t: '形状', f: function () { openShapeMenu($('tIns')); } },
      '-',
      { i: 'lasso', t: '套索选择', f: function () { setTool('lasso'); } },
      { i: 'eraser', t: '局部橡皮', f: function () { setTool('erp'); } },
      { i: 'paint_bucket', t: '图片当底图', f: function () { pendingImageAt = null; $('fileImg').click(); } },
      { i: 'play', t: '回放', f: function () { $('bReplay').click(); } }
    ]);
    placeMenu($('insMenu'), this, true);
  };
  $('bMore').onclick = function () {
    menuItems($('moreMenu'), [
      { i: 'highlight', t: '荧光笔', k: '2', f: function () { $('tHl').click(); } },
      { i: 'lasso', t: '套索选择', k: 'L', f: function () { setTool('lasso'); } },
      { i: 'eraser', t: '局部橡皮', k: '4', f: function () { setTool('erp'); } },
      { i: 'shapes', t: '形状', k: 'S', f: function () { openShapeMenu($('bMore')); } },
      '-',
      { i: 'paint_bucket', t: '纸张底色', f: function () { $('bBg').click(); } },
      { i: 'arrow_download', t: '导出 PNG', k: 'Ctrl+S', f: function () { $('bSave').click(); } },
      { i: 'code', t: '备份 / 恢复 JSON', f: function () { $('bJson').click(); } },
      { i: 'text_font', t: '快捷键', k: '?', f: function () { $('bHelp').click(); } },
      '-',
      { i: 'add', t: '新建白板', f: function () { ask('新建一个空白白板？当前白板会自动保存。', function () { newBoard(); }); } }
    ]);
    placeMenu($('moreMenu'), this, true);
  };

  function openShapeMenu(btn) {
    var m = $('shapeMenu');
    if (m.classList.contains('show')) { m.classList.remove('show'); return; }
    hideMenus();
    setTool('shape');
    m.classList.add('show');
    var r = btn.getBoundingClientRect();
    m.style.left = Math.round(r.left + r.width / 2 - m.offsetWidth / 2) + 'px';
    m.style.top = Math.round(r.top - m.offsetHeight - 8) + 'px';
  }
  // 形状面板的锚点改到可见按钮上
  $('tShape').onclick = function () { openShapeMenu($('tIns')); };

  // ---------- 缩放 ----------
  $('zBtn').onclick = function () { resetView(); };

  // ---------- 卡片菜单 ----------
  function cardMenu(btn, b) {
    menuItems($('cardMenu'), [
      { i: 'edit', t: '打开', f: function () { openBoard(b.id); } },
      { i: 'text_font', t: '重命名', f: function () { openBoard(b.id); } },
      { i: 'arrow_download', t: '导出 PNG', f: function () { openBoard(b.id); setTimeout(function () { $('bSave').click(); }, 400); } },
      '-',
      { i: 'delete', t: '删除', f: function () { ask('删除「' + (b.title || '无标题的白板') + '」？', function () { delBoard(b.id); }); } }
    ]);
    placeMenu($('cardMenu'), btn, false);
  }
  function delBoard(id) {
    dbDel(id).catch(function () { });
    boardList = boardList.filter(function (x) { return x.id !== id; });
    if (id === boardId) {
      boardId = uid(); boardTitle = '无标题的白板';
      doc.pages = [{ id: uid(), items: [], bg: null }]; doc.active = 0;
      undoStack.length = 0; redoStack.length = 0; sel = [];
    }
    renderGallery();
    toast('已删除');
  }

  // ---------- 点击外部关闭浮层 ----------
  document.addEventListener('pointerdown', function (e) {
    var t = e.target;
    if (t.closest && (t.closest('.menu') || t.closest('#penTray') || t.closest('#toolbar') || t.closest('#topbar') || t.closest('.card') || t.closest('#shapeMenu'))) return;
    hideMenus();
    $('shapeMenu').classList.remove('show');
  }, true);

  // ---------- 启动 ----------
  function boot() {
    buildPenTray();
    resize(); updateZoom(); renderPages(); syncUndoBtns(); syncChrome();
    dbAll().then(function (rows) {
      var legacy = null;
      rows.forEach(function (r) {
        if (r.key === 'doc') { legacy = r.val; return; }
        var v = r.val || {};
        boardList.push({ id: v.id || r.key, title: v.title, updated: v.updated || 0, thumb: v.thumb || null });
      });
      var hash = location.hash.replace('#', '');
      if (hash === 'new') { newBoard(); return; }
      if (!boardList.length) {
        var pages = legacy && legacy.pages ? legacy.pages : null;
        var rec = {
          id: uid(), title: '无标题的白板', updated: Date.now(),
          paper: (legacy && legacy.paper) || 'light',
          active: (legacy && legacy.active) || 0,
          view: (legacy && legacy.view) || { x: 0, y: 0, s: 1 },
          thumb: null,
          pages: pages || [{ id: uid(), items: [], bg: null }]
        };
        boardList.push({ id: rec.id, title: rec.title, updated: rec.updated, thumb: null });
        dbPut(rec).catch(function () { });
        applyBoard(rec);
        if (hash === 'board') showBoard(); else showGallery();
        return;
      }
      var target = null;
      for (var i = 0; i < rows.length; i++) if (rows[i].key === boardId) target = rows[i];
      if (!target) target = rows.filter(function (r) { return r.key !== 'doc'; })[0];
      if (target) { applyBoard(target.val); }
      if (hash === 'board') showBoard(); else showGallery();
    });
  }
