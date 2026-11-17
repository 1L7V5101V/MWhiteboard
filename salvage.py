# -*- coding: utf-8 -*-
"""
salvage.py — 从 Microsoft Whiteboard 的 WebView2 IndexedDB 里抢救本地残留数据。

服务端在 2026-10-16 删掉了旧白板正文，但本地 profile 里还留着每个白板的
400x231 PNG 缩略图 + 最后访问时间。这个脚本把它们全部导出成 PNG，
并生成一个可离线打开的 gallery.html。

用法:
    python salvage.py            # 导出到 ./boards + ./gallery.html
    python salvage.py --out D:\wb-backup

原理: 直接把 IndexedDB 的 .ldb / .log 当字节流扫，
      找 "thumbnail_<uuid>" 后紧跟的 "data:image/png;base64,..."，
      按 base64 -> PNG 校验(IEND)后落盘。不依赖 LevelDB 解析库。
"""
import base64
import html
import json
import os
import re
import struct
import sys
import time

IDB = os.path.join(
    os.environ["LOCALAPPDATA"],
    r"Packages\Microsoft.Whiteboard_8wekyb3d8bbwe\LocalState\EBWebView\Default\IndexedDB"
    r"\https_whiteboard.cloud.microsoft_0.indexeddb.leveldb",
)

UUID_RE = re.compile(rb"thumbnail_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})")
B64_START = b"data:image/png;base64,"
B64_CHARS = set(b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=")
TS_MARK = b"lastAccessTimeN"


def load_bytes(folder):
    blob = b""
    names = []
    for f in sorted(os.listdir(folder)):
        if f.endswith((".ldb", ".log")):
            with open(os.path.join(folder, f), "rb") as fh:
                blob += fh.read()
            names.append(f)
    return blob, names


def decode_png(payload):
    """payload: base64 bytes (可能尾部混入了下一条记录的字节)。返回 PNG bytes 或 None。"""
    for cut in range(0, 4):
        s = payload[: len(payload) - cut] if cut else payload
        pad = (-len(s)) % 4
        try:
            raw = base64.b64decode(s + b"=" * pad, validate=False)
        except Exception:
            continue
        if raw[:8] == b"\x89PNG\r\n\x1a\n" and b"IEND" in raw[-12:]:
            return raw
    return None


def decode_ts(blob, uuid_pos):
    """在 uuid 之前找最近一次 lastAccessTimeN，把后面 8 字节当 double(ms since epoch)。"""
    lo = max(0, uuid_pos - 400)
    idx = blob.rfind(TS_MARK, lo, uuid_pos)
    if idx < 0:
        return None
    off = idx + len(TS_MARK)
    raw = blob[off : off + 9]
    if len(raw) < 9:
        return None
    for skip in (1, 0):  # 序列化器有时在值前塞一个类型字节
        chunk = raw[skip : skip + 8]
        if len(chunk) < 8:
            continue
        val = struct.unpack("<d", chunk)[0]
        if 1.4e12 < val < 2.2e12:  # 2014..2039 的毫秒时间戳
            return val
    return None


def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "boards")
    args = sys.argv[1:]
    if "--out" in args:
        out = os.path.join(args[args.index("--out") + 1], "boards")
    os.makedirs(out, exist_ok=True)

    if not os.path.isdir(IDB):
        print("[!] 找不到 IndexedDB 目录:", IDB)
        return 1

    blob, names = load_bytes(IDB)
    print("[*] 读取 %d 个文件, 共 %.2f MB" % (len(names), len(blob) / 1048576.0))

    best = {}   # uuid -> (png_bytes, ts)
    for m in UUID_RE.finditer(blob):
        uuid = m.group(1).decode()
        start = blob.find(B64_START, m.end(), m.end() + 4096)
        if start < 0:
            continue
        p = start + len(B64_START)
        e = p
        while e < len(blob) and blob[e] in B64_CHARS and e - p < 4 * 1024 * 1024:
            e += 1
        png = decode_png(blob[p:e])
        if not png:
            continue
        ts = decode_ts(blob, m.start())
        prev = best.get(uuid)
        if prev is None or len(png) > len(prev[0]):
            best[uuid] = (png, ts if ts else (prev[1] if prev else None))

    if not best:
        print("[!] 没有解析到缩略图")
        return 1

    items = []
    for uuid, (png, ts) in sorted(best.items(), key=lambda kv: -(kv[1][1] or 0)):
        fn = "%s.png" % uuid
        with open(os.path.join(out, fn), "wb") as fh:
            fh.write(png)
        when = time.strftime("%Y-%m-%d %H:%M", time.localtime(ts / 1000.0)) if ts else "未知"
        items.append({"uuid": uuid, "file": fn, "bytes": len(png), "ts": ts, "when": when})
        print("  + %s  %6d B  %s" % (uuid, len(png), when))

    manifest = os.path.join(os.path.dirname(out), "boards.json")
    with open(manifest, "w", encoding="utf-8") as fh:
        json.dump(items, fh, ensure_ascii=False, indent=2)

    rows = "\n".join(
        '<figure><img loading="lazy" src="boards/%s" alt="%s">'
        '<figcaption><b>%s</b><br><span>%s &middot; %.1f KB</span></figcaption></figure>'
        % (i["file"], i["uuid"], i["uuid"][:8], i["when"], i["bytes"] / 1024.0)
        for i in items
    )
    page = """<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<title>Whiteboard 本地抢救缩略图 (%d)</title>
<style>
:root{color-scheme:dark}
body{margin:0;padding:28px;background:#15171a;color:#e6e8ea;font:14px/1.5 "Segoe UI","Microsoft YaHei",sans-serif}
h1{font-size:20px;font-weight:600;margin:0 0 6px}
p.sub{color:#8b929a;margin:0 0 24px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px}
figure{margin:0;background:#1e2126;border:1px solid #2b2f35;border-radius:10px;overflow:hidden}
figure img{display:block;width:100%%;height:auto;background:#fff}
figcaption{padding:8px 10px;font-size:12px;color:#aeb5bd}
figcaption span{color:#6f7681}
</style>
<h1>Microsoft Whiteboard 本地残留缩略图</h1>
<p class="sub">共 %d 张 &middot; 来自 WebView2 IndexedDB 缓存 &middot; 原白板正文已被服务端删除，这里只剩预览图</p>
<div class="grid">
%s
</div></html>""" % (len(items), len(items), rows)
    with open(os.path.join(os.path.dirname(out), "gallery.html"), "w", encoding="utf-8") as fh:
        fh.write(page)

    print("\n[+] 导出 %d 张缩略图 -> %s" % (len(items), out))
    print("[+] 清单 -> %s" % manifest)
    print("[+] 画廊 -> %s" % os.path.join(os.path.dirname(out), "gallery.html"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
