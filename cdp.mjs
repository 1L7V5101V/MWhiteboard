// cdp.mjs — 极简 CDP 客户端：截图 / 求值 / 看目标
// 用法:
//   node cdp.mjs list
//   node cdp.mjs shot  <out.png> [urlFilter]
//   node cdp.mjs eval  "<js表达式>" [urlFilter]
//   node cdp.mjs html  [urlFilter]
import fs from 'node:fs';

const PORT = process.env.CDP_PORT || 9222;
const [cmd, ...rest] = process.argv.slice(2);

async function targets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return r.json();
}

function pick(list, filter) {
  const pages = list.filter(t => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!filter) return pages[0];
  return pages.find(p => (p.url || '').includes(filter)) || pages[0];
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

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', e => rej(new Error('ws error')), { once: true });
  });
  return new CDP(ws);
}

const list = await targets();

if (cmd === 'list') {
  for (const t of list) console.log(`${t.type}\t${t.url}`);
  process.exit(0);
}

const t = pick(list, rest[1] ?? rest[0]);
if (!t) { console.error('没有 page 目标'); process.exit(2); }
const cdp = await connect(t.webSocketDebuggerUrl);

if (cmd === 'shot') {
  const out = rest[0] || 'shot.png';
  await cdp.send('Page.enable');
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(`saved ${out} (${fs.statSync(out).size}B) url=${t.url}`);
} else if (cmd === 'eval') {
  const { result } = await cdp.send('Runtime.evaluate', { expression: rest[0], returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(result.value ?? result.description, null, 1));
} else if (cmd === 'html') {
  const { result } = await cdp.send('Runtime.evaluate', { expression: 'document.documentElement.outerHTML.slice(0,1200)', returnByValue: true });
  console.log(result.value);
} else {
  console.error('unknown cmd');
  process.exit(2);
}
process.exit(0);
