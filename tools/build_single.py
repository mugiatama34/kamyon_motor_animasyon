#!/usr/bin/env python3
"""index.html + js/*.js dosyalarını tek bir kendi kendine yeten HTML dosyasına birleştirir.
Kullanım: python3 tools/build_single.py  ->  kamyon-motoru-3d.html"""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')

def inline(m):
    src = m.group(1)
    code = (root / src).read_text(encoding='utf-8')
    code = code.replace('</script', '<\\/script')
    return '<script>\n' + code + '\n</script>'

html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
out = root / 'kamyon-motoru-3d.html'
out.write_text(html, encoding='utf-8')
print(out, round(out.stat().st_size / 1024), 'KB')
