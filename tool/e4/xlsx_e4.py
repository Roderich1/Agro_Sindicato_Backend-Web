"""Verificación E4: lee un XLSX con zipfile (sin dependencias) y busca «umbral», «anónim» y la política.
   python -I tool/e4/xlsx_e4.py <archivo.xlsx>"""
import re, sys, zipfile, html, json
path = sys.argv[1]
with zipfile.ZipFile(path) as z:
    names = z.namelist()
    texts = []
    for n in names:
        if n.endswith('.xml') and ('sharedStrings' in n or n.startswith('xl/worksheets/')):
            data = z.read(n).decode('utf-8')
            texts += [html.unescape(t) for t in re.findall(r'<t[^>]*>([^<]*)</t>', data)]
            texts += [html.unescape(t) for t in re.findall(r'<is><t[^>]*>([^<]*)</t></is>', data)]
blob = '\n'.join(texts)
res = {
    'archivo': path.replace(chr(92), '/').split('/')[-1],
    'hojas': [n for n in names if n.startswith('xl/worksheets/sheet')],
    'cadenas': len(texts),
    'umbral': len(re.findall('umbral', blob, re.I)),
    'anonim': len(re.findall('anónim|anonim', blob, re.I)),
    'politica_aplicada': [t for t in texts if 'Política aplicada' in t or 'F07-POL' in t][:6],
    'nombres_agricultores': len(re.findall(r'F[123] sintético', blob)),
}
print(json.dumps(res, ensure_ascii=False, indent=1))
