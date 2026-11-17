// ink-test.mjs — 用无头 Edge + CDP 验证移植后的墨迹引擎
// 用法: node _re/ink-test.mjs
// 注意: 无头模式 rAF 会被节流，画完必须靠 Page.captureScreenshot 强制出一帧再读像素
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9223;
const URL_ = 'https://127.0.0.1:8443/';
const OUT = path.resolve('ink-test.png');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-ink-'));

const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--headless=new',
  '--ignore-certificate-errors',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1200,900',
  URL_,
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitTarget(ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find(x => x.type === 'page' && x.webSocketDebuggerUrl);
      if (p) return p;
    } catch { }
    await sleep(250);
  }
  throw new Error('Edge/CDP 没起来');
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.waiters = new Map();
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.waiters.has(m.id)) {
        const { res, rej } = this.waiters.get(m.id);
        this.waiters.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.waiters.set(id, { res, rej }));
  }
}

const t = await waitTarget();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', () => rej(new Error('ws error')), { once: true });
});
const cdp = new CDP(ws);
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');

async function evalJs(expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

for (let i = 0; i < 60; i++) {
  if (await evalJs('!!(window.__wbDebug && document.querySelector("canvas"))')) break;
  await sleep(250);
}

// ---------- 阶段 1：画 ----------
const draw = await evalJs(`(async () => {
  const d = window.__wbDebug, cv = document.querySelector('canvas');
  const r = cv.getBoundingClientRect();
  const wait = ms => new Promise(z => setTimeout(z, ms));
  function fire(type, x, y, pressure, pid) {
    cv.dispatchEvent(new PointerEvent(type, {
      pointerId: pid || 11, pointerType: 'pen', isPrimary: true,
      bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y,
      pressure: pressure, buttons: type === 'pointerup' ? 0 : 1
    }));
  }
  function mouse(type, x, y, pid) {
    cv.dispatchEvent(new PointerEvent(type, {
      pointerId: pid || 12, pointerType: 'mouse', isPrimary: true,
      bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y,
      pressure: 0.5, buttons: type === 'pointerup' ? 0 : 1
    }));
  }
  const pg = () => d.doc.pages[d.doc.active];
  pg().strokes.length = 0;
  await wait(50);

  // 1) 低压 0.1 直线
  fire('pointerdown', 100, 200, 0.1);
  for (let x = 110; x <= 400; x += 10) fire('pointermove', x, 200, 0.1);
  fire('pointerup', 400, 200, 0.1);
  await wait(40);

  // 2) 满压 1.0 直线
  fire('pointerdown', 100, 350, 1.0, 21);
  for (let x = 110; x <= 400; x += 10) fire('pointermove', x, 350, 1.0, 21);
  fire('pointerup', 400, 350, 1.0, 21);
  await wait(40);

  // 3) 压力渐变的曲线
  fire('pointerdown', 100, 550, 0.6, 31);
  for (let i = 1; i <= 120; i++) {
    fire('pointermove', 100 + i * 3, 550 + Math.sin(i / 12) * 45, 0.2 + 0.75 * (i / 120), 31);
  }
  fire('pointerup', 460, 550, 0.6, 31);
  await wait(40);

  // 4) 鼠标：B 样条
  mouse('pointerdown', 120, 700, 41);
  for (let i = 1; i <= 60; i++) mouse('pointermove', 120 + i * 5, 700 + Math.sin(i / 8) * 30, 41);
  mouse('pointerup', 420, 700, 41);
  await wait(40);

  const st = pg().strokes;
  const last = st[3] ? st[3].pts[st[3].pts.length - 1] : null;
  const tgt = d.toWorld(420, 700);
  return {
    count: st.length,
    pts: st.map(s => s.pts.length),
    pressLow: st[0] ? [st[0].pts[0][2], st[0].pts[st[0].pts.length - 1][2]] : null,
    pressHigh: st[1] ? [st[1].pts[0][2], st[1].pts[st[1].pts.length - 1][2]] : null,
    curvePress: st[2] ? [st[2].pts[0][2], st[2].pts[st[2].pts.length - 1][2]] : null,
    mouseEndGap: last ? +Math.hypot(last[0] - tgt.x, last[1] - tgt.y).toFixed(3) : null
  };
})()`);
console.log('DRAW', JSON.stringify(draw));

// 强制出一帧（无头 rAF 节流）
await cdp.send('Page.captureScreenshot', { format: 'png' });
await sleep(250);
const shot0 = await cdp.send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(OUT, Buffer.from(shot0.data, 'base64'));

// ---------- 阶段 2：量像素 + 撤销 + 落盘 ----------
const meas = await evalJs(`(async () => {
  const d = window.__wbDebug, cv = document.querySelector('canvas');
  const g = cv.getContext('2d');
  const wait = ms => new Promise(z => setTimeout(z, ms));
  const pg = () => d.doc.pages[d.doc.active];
  const dpr = window.devicePixelRatio || 1;
  const log = { canvas: [cv.width, cv.height, dpr] };

  function thickness(cssX, cssY, span) {
    const cx = Math.round(cssX * dpr);
    const y0 = Math.max(0, Math.round((cssY - span) * dpr));
    const h = Math.round(span * 2 * dpr);
    const img = g.getImageData(cx, y0, 1, h).data;
    const bg = [img[0], img[1], img[2]];
    let n = 0, first = -1, last = -1;
    for (let i = 0; i < h; i++) {
      const dv = Math.abs(img[i*4]-bg[0]) + Math.abs(img[i*4+1]-bg[1]) + Math.abs(img[i*4+2]-bg[2]);
      if (dv > 60) { n++; if (first < 0) first = i; last = i; }
    }
    return { n, solid: n ? last - first + 1 : 0, peak: n };
  }
  // 沿 x 扫多个位置取中位数，避免单点落在抗锯齿边缘
  function scan(cssY, span, xs) {
    const out = xs.map(x => thickness(x, cssY, span).solid).sort((a, b) => a - b);
    return { med: out[Math.floor(out.length / 2)], all: out };
  }
  log.low = scan(200, 14, [150, 180, 210, 240, 270, 300, 330]);
  log.high = scan(350, 20, [150, 180, 210, 240, 270, 300, 330]);
  log.ratio = log.low.med ? +(log.high.med / log.low.med).toFixed(3) : null;

  // 中段空洞：沿笔迹方向逐列统计连续墨点是否断
  function holes(cssY, span, xs) {
    let bad = 0;
    for (const x of xs) {
      const r = thickness(x, cssY, span);
      if (r.solid - r.n > 0) bad++;
    }
    return bad;
  }
  log.holesLow = holes(200, 14, [150, 180, 210, 240, 270, 300, 330]);
  log.holesHigh = holes(350, 20, [150, 180, 210, 240, 270, 300, 330]);

  // 曲线压力渐变 → 首尾厚度应有差异
  log.curveThick = [
    thickness(115, 550 - Math.sin(1/12) * 45, 16).solid,
    thickness(300, 550 + Math.sin((300 - 100) / 3 / 12) * 45, 20).solid
  ];

  // 撤销 / 重做
  const before = pg().strokes.length;
  document.getElementById('bUndo').click();
  await wait(60);
  const afterUndo = pg().strokes.length;
  document.getElementById('bRedo').click();
  await wait(60);
  log.undo = [before, afterUndo, pg().strokes.length];

  // 落盘
  await wait(900);
  log.saved = await new Promise((res) => {
    const rq = indexedDB.open('wb-local', 1);
    rq.onsuccess = () => {
      const g2 = rq.result.transaction('docs', 'readonly').objectStore('docs').get('doc');
      g2.onsuccess = () => res(g2.result ? g2.result.pages[g2.result.active].strokes.length : -1);
    };
  });
  return log;
})()`);

console.log('MEAS', JSON.stringify(meas));
console.log(`screenshot ${OUT} (${fs.statSync(OUT).size}B)`);

edge.kill();
await sleep(300);
process.exit(0);
