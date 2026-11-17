// probe.mjs — 起无头 Edge 加载本地白板，执行给定 JS 文件里的表达式并打印结果
// 用法: node _re/probe.mjs <exprFile.js>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9224;
const URL_ = process.env.WB_URL || 'https://127.0.0.1:8443/#new';
const exprFile = process.argv[2];
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-probe-'));

const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--headless=new', '--ignore-certificate-errors', '--no-first-run',
  '--no-default-browser-check', '--window-size=1200,900', URL_,
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitTarget(ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const p = list.find(x => x.type === 'page' && x.webSocketDebuggerUrl);
      if (p) return p;
    } catch { }
    await sleep(250);
  }
  throw new Error('Edge/CDP 没起来');
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.waiters = new Map(); this.logs = [];
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.method === 'Runtime.consoleAPICalled') {
        this.logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
      }
      if (m.method === 'Runtime.exceptionThrown') {
        this.logs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || ''));
      }
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

for (let i = 0; i < 60; i++) {
  const r = await cdp.send('Runtime.evaluate', { expression: '!!window.__wbDebug', returnByValue: true });
  if (r.result.value) break;
  await sleep(250);
}

const expr = fs.readFileSync(exprFile, 'utf8');
const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
if (r.exceptionDetails) {
  console.log('EXCEPTION', r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
} else {
  console.log('RESULT', JSON.stringify(r.result.value, null, 1));
}

// 可选的第二段表达式：先强制出一帧（无头 rAF 节流），再执行
if (process.argv[3]) {
  await cdp.send('Page.enable');
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  if (process.argv[3].endsWith('.png')) {
    fs.writeFileSync(process.argv[3], Buffer.from(shot.data, 'base64'));
    console.log('SHOT', process.argv[3]);
  }
  await sleep(200);
  if (!process.argv[3].endsWith('.png')) {
    const expr2 = fs.readFileSync(process.argv[3], 'utf8');
    const r2 = await cdp.send('Runtime.evaluate', { expression: expr2, returnByValue: true, awaitPromise: true });
    if (r2.exceptionDetails) {
      console.log('EXCEPTION2', r2.exceptionDetails.exception?.description || JSON.stringify(r2.exceptionDetails));
    } else {
      console.log('RESULT2', JSON.stringify(r2.result.value, null, 1));
    }
  }
}
if (cdp.logs.length) console.log('CONSOLE\n' + cdp.logs.join('\n'));
edge.kill();
await sleep(300);
process.exit(0);

