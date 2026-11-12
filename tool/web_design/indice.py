"""Genera INDICE_CAPTURAS.md a partir de capturas/_capturas.json (lo escribe capture.mjs) y de las
capturas de Excel. Enlaces relativos a la carpeta del paquete.
  python tool/web_design/indice.py docs/design/web-redesign-input
"""
import io, json, os, sys
from urllib.parse import quote

base = sys.argv[1]
caps = os.path.join(base, 'capturas')
data = json.load(io.open(os.path.join(caps, '_capturas.json'), encoding='utf-8'))
ROLE = {'anon': 'Sin sesión', 'agricultor': 'AGRICULTOR', 'directiva': 'DIRECTIVA (Directiva DEMO)', 'admin': 'ADMINISTRADOR (Administración DEMO)',
        'suc': 'DIRECTIVA, nueva responsable (Sucesora PA)'}
GROUPS = [
    ('01_acceso', '1. Inicio de sesión y acceso por rol'),
    ('02_resumen', '2. Resumen, selección de campaña y cobertura'),
    ('03_propuestas', '3. Necesidades declaradas, borrador y referencia histórica'),
    ('04_excel', '4. Exportación Excel (abierta en Microsoft Excel)'),
    ('05_convocatorias', '5. Convocatorias: creación, apertura, cierre, cancelación y participantes'),
    ('06_permisos_psa', '6. Permisos, delegaciones y sustitución de responsable (P-A)'),
    ('07_catalogo', '7. Catálogo, equivalencias y productos por identificar'),
    ('08_historico', '8. Histórico y estimaciones'),
    ('09_campanas', '9. Campañas'),
    ('10_administracion', '10. Administración, auditoría y pantallas fuera del menú'),
    ('99_simulados', '99. Estados NO reales: fixtures del código y respuestas simuladas'),
]
EXCEL = {
    '01_borrador_portada__excel.png': 'Portada del Excel del borrador actual: campaña, borrador, referencia fijada, fechas',
    '02_borrador_necesidades__excel.png': 'Hoja «Necesidades» (filtro e inmovilizado)',
    '03_borrador_consumo_estimado__excel.png': 'Hoja «Consumo estimado» de la referencia fijada (estados y vigencia)',
    '04_borrador_historial_referencia__excel.png': 'Hoja «Historial de la referencia»',
    '05_desactualizada_01__excel.png': 'Borrador anterior con 7 líneas «Desactualizada»: portada con el aviso',
    '06_desactualizada_02__excel.png': 'Borrador anterior: hoja «Necesidades»',
    '07_desactualizada_03__excel.png': 'Borrador anterior: «Consumo estimado» con «Desactualizada» y sin diferencia',
}
link = lambda f: f'[{os.path.basename(f)}](capturas/{quote(f)})'
out = ['# Índice de capturas', '',
       'Capturas de la Web **real** de esta composición (ver README), salvo el grupo 99, que está rotulado. ',
       'Escritorio a 1440 px de ancho; «móvil» a 390 px de ancho (las primeras con emulación táctil de Puppeteer; las rehechas, sólo con el ancho: el diseño de la Web depende del ancho). ',
       'Página completa salvo en diálogos, que muestran la ventana visible. Datos sintéticos del entorno aislado.', '',
       'Columnas: archivo(s) · ruta · rol · estado · qué muestra.', '']
for key, title in GROUPS:
    out += [f'## {title}', '']
    if key == '04_excel':
        out += ['Archivos descargados desde la Web con «Descargar Excel» y abiertos en Microsoft Excel (sólo lectura). '
                'Se recortó la barra de título de Excel (mostraba la cuenta de Office del equipo). '
                'Las tres primeras capturas del borrador anterior (`05`–`07`) son de la revisión del 2026-11-12 (`d5dc9cc`), con el mismo código de exportación que esta composición.', '',
                '| Archivo | Qué muestra |', '|---|---|']
        for f, d in EXCEL.items():
            out.append(f'| {link("04_excel/" + f)} | {d} |')
        out.append('')
        continue
    rows = [e for e in data if e['files'][0].startswith(key + '/')]
    rows.sort(key=lambda e: e['files'][0])
    if key == '99_simulados':
        out += ['**No son capturas del entorno real.** `__FIXTURE`: página real montada por las páginas de desarrollo del código (`src/dev/resumen-prototipos.html?v=1`, `src/dev/break-ui.html`) con datos fijos y sin API; la barra inferior «Actual · Panorama…» es del arnés. '
                '`__SIMULADO`: Web y sesión reales, con una respuesta de la API sustituida por el guion (error 500/503 o lista vacía).', '']
    out += ['| Archivo(s) | Ruta | Rol | Estado | Qué muestra |', '|---|---|---|---|---|']
    for e in rows:
        files = ' · '.join(link(f) for f in e['files'])
        out.append(f"| {files} | `{e['ruta']}` | {ROLE.get(e['rol'], e['rol'])} | {e['estado'] or '—'} | {e['desc']} |")
    out.append('')
io.open(os.path.join(base, 'INDICE_CAPTURAS.md'), 'w', encoding='utf-8', newline='\n').write('\n'.join(out))
print('ok', len(data), 'entradas')
