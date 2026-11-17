# -*- coding: utf-8 -*-
"""
server.py — Whiteboard 本地化服务

作用：
  1) 把 whiteboard.cloud.microsoft 解析到本机后，接管外壳发出的
     GET /api/v1.0/whiteboards/enabled —— 永远返回 enabled=true，
     于是「已退役」判定失效，应用照常打开 WebView 主界面。
  2) 主界面 / 返回本地自带的离线白板 whiteboard.html（笔/压感/多页/离线保存）。
  3) 其余 /api/* 一律返回空 JSON，让外壳不因报错卡在加载态。

同时开两个监听：
  http  : 127.0.0.1:8443   —— 不需要证书，给浏览器/Edge app 窗口用
  https : 127.0.0.1:443    —— 需要 cert.pem/key.pem，给官方外壳用

用法：
  python server.py                # 两个都开
  python server.py --http-only    # 只开 8443
  python server.py --port 9000    # 改 http 端口
"""
import argparse
import json
import os
import ssl
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, "server.log")

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}

ENABLED_BODY = json.dumps(
    {"enabled": True, "isEnabled": True, "value": True, "whiteboardEnabled": True}
).encode()


def log(msg):
    line = time.strftime("[%H:%M:%S] ") + msg
    print(line, flush=True)
    try:
        with open(LOG, "a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


class Handler(BaseHTTPRequestHandler):
    server_version = "wb-local/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # 静音默认日志，自己写
        pass

    # ---------- 工具 ----------
    def _send(self, code, body, ctype="application/json; charset=utf-8", extra=None):
        if isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def _static(self, relpath):
        p = os.path.normpath(os.path.join(HERE, relpath.lstrip("/")))
        if not p.startswith(HERE) or not os.path.isfile(p):
            return False
        ext = os.path.splitext(p)[1].lower()
        with open(p, "rb") as fh:
            data = fh.read()
        self._send(200, data, MIME.get(ext, "application/octet-stream"))
        return True

    # ---------- 路由 ----------
    def do_OPTIONS(self):
        self._send(204, b"")

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = self.path.split("?")[0]
        log("%s %s %s" % (self.command, self.path, self.headers.get("Host", "")))

        # 退役开关：永远 enabled
        if "enabled" in path and "/api/" in path:
            return self._send(200, ENABLED_BODY)

        # 其它接口：给空壳 JSON，别让外壳报错
        if path.startswith("/api/") or "/api/" in path:
            return self._send(200, b'{"value":[],"items":[],"results":[]}')

        if path in ("/health", "/ping"):
            return self._send(200, b'{"ok":true}')

        if path in ("/", "/index.html", "/whiteboard"):
            if self._static("whiteboard.html"):
                return

        if self._static(path):
            return

        # 其它一律回本地白板（SPA 行为），保证外壳里永远有界面
        if self._static("whiteboard.html"):
            return
        self._send(404, b'{"error":"not found"}')

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length:
            try:
                self.rfile.read(length)
            except Exception:
                pass
        path = self.path.split("?")[0]
        log("POST %s" % path)
        if "enabled" in path:
            return self._send(200, ENABLED_BODY)
        self._send(200, b'{"value":true,"ok":true}')

    do_PUT = do_POST
    do_DELETE = do_POST


def serve_http(port):
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    srv.daemon_threads = True
    log("HTTP  http://127.0.0.1:%d/  (本地白板 / Edge app 窗口)" % port)
    srv.serve_forever()


def serve_https(port=443):
    cert = os.path.join(HERE, "cert.pem")
    key = os.path.join(HERE, "key.pem")
    if not (os.path.isfile(cert) and os.path.isfile(key)):
        log("HTTPS 跳过：没有 cert.pem / key.pem（先跑 setup.ps1 生成）")
        return
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    srv.daemon_threads = True
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(cert, key)
    srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
    log("HTTPS https://whiteboard.cloud.microsoft/  (接管官方外壳，端口 %d)" % port)
    srv.serve_forever()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8443)
    ap.add_argument("--http-only", action="store_true")
    ap.add_argument("--https-port", type=int, default=443)
    ap.add_argument("--https-only", action="store_true")
    a = ap.parse_args()

    log("=== wb-local 启动 ===  dir=%s" % HERE)
    ts = []
    if not a.https_only:
        ts.append(threading.Thread(target=serve_http, args=(a.port,), daemon=True))
    if not a.http_only:
        ts.append(threading.Thread(target=serve_https, args=(a.https_port,), daemon=True))
    for t in ts:
        t.start()
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        log("退出")
        return 0


if __name__ == "__main__":
    sys.exit(main())
