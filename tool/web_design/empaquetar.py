"""Empaqueta docs/design/web-redesign-input en un ZIP portable y lo verifica:
integridad, que cada PNG se puede decodificar, y que cada enlace relativo de los .md existe dentro
del ZIP. Sin bases de datos, credenciales, node_modules, .env ni el repositorio.
  python tool/web_design/empaquetar.py docs/design/web-redesign-input <salida.zip>
"""
import io, os, re, sys, zipfile
from urllib.parse import unquote
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
top = 'agrocuentas-web-redesign-input'
EXCLUDE = ('.env', '.sqlite', '.db', '.dump', '.sql', 'node_modules')
os.makedirs(os.path.dirname(out), exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(src):
        for f in sorted(files):
            p = os.path.join(root, f)
            rel = os.path.relpath(p, src).replace(os.sep, '/')
            if any(x in rel for x in EXCLUDE):
                continue
            z.write(p, f'{top}/{rel}')

with zipfile.ZipFile(out) as z:
    assert z.testzip() is None, 'ZIP dañado'
    names = set(z.namelist())
    pngs = [n for n in names if n.endswith('.png')]
    for n in pngs:
        Image.open(io.BytesIO(z.read(n))).verify()
    broken, links = [], 0
    for n in [n for n in names if n.endswith('.md')]:
        base = os.path.dirname(n)
        for m in re.finditer(r'\]\(([^)#\s]+)\)', z.read(n).decode('utf-8')):
            t = m.group(1)
            if t.startswith(('http://', 'https://')):
                continue
            links += 1
            target = os.path.normpath(os.path.join(base, unquote(t))).replace(os.sep, '/')
            if target not in names:
                broken.append((n, t))
    bad = [n for n in names if any(x in n for x in EXCLUDE)]
    print(f'ZIP {out}: {len(names)} archivos, {len(pngs)} PNG legibles, {links} enlaces, {len(broken)} rotos, excluidos presentes: {len(bad)}, {os.path.getsize(out) // 1024} KB')
    for b in broken:
        print('ROTO', b)
