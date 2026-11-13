"""VERIFICACIÓN: comprueba que cada descarga es un XLSX (zip con xl/workbook.xml) con zipfile, sin instalar nada.
Uso: python -I xlsx_v.py <carpeta_descargas>"""
import sys, zipfile, pathlib, re
sys.stdout.reconfigure(encoding="utf-8")
for p in sorted(pathlib.Path(sys.argv[1]).iterdir()):
    try:
        with zipfile.ZipFile(p) as z:
            names = z.namelist()
            wb = z.read('xl/workbook.xml').decode('utf-8') if 'xl/workbook.xml' in names else ''
            sheets = re.findall(r'<sheet [^>]*name="([^"]+)"', wb)
            ct = 'spreadsheetml' in z.read('[Content_Types].xml').decode('utf-8') if '[Content_Types].xml' in names else False
            print(f"{p.name}: zip válido={z.testzip() is None}, xl/workbook.xml={'xl/workbook.xml' in names}, tipo spreadsheetml={ct}, hojas={sheets}, partes={len(names)}")
    except zipfile.BadZipFile:
        print(f"{p.name}: NO es un zip")
