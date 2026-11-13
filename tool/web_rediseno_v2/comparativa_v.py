"""Comparativas lámina ↔ implementación del rediseño de la Web (v2).

Compone, para cada una de las 51 láminas, la lámina a la izquierda y la(s)
captura(s) existentes de la implementación a la derecha, con rótulos.
No toma capturas nuevas: sólo lee PNG ya guardados en
docs/evidence/rediseno-web-v2/ y escribe docs/evidence/rediseno-web-v2/comparativas/NN.png.

Uso (desde la raíz del worktree):
    <python> -I tool/web_rediseno_v2/comparativa_v.py <carpeta_laminas> [NN ...]

Reglas de composición:
- Escritorio (láminas 01–34): lámina escalada a 1150 px de ancho; capturas a
  1150 px (una) o en rejilla de 2 columnas (varias, p. ej. hojas de diálogos;
  los diálogos se recortan automáticamente al recuadro blanco del diálogo).
  Una captura de página entera mucho más alta que la lámina se recorta por
  abajo y el rótulo lo indica.
- Teléfono (35–51): todo a escala 0,55 (390 px → 429 px). Una captura más alta
  que la lámina se reparte en columnas de la altura de la lámina (máx. 3); lo
  que sobra se recorta y el rótulo lo indica.
- Lámina sin captura: se compone la lámina sola con el rótulo «sin captura: motivo».
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
EVID = os.path.join(ROOT, 'docs', 'evidence', 'rediseno-web-v2')
OUT = os.path.join(EVID, 'comparativas')

BG = (255, 255, 255)
INK = (15, 42, 29)
MUTED = (90, 100, 95)
WARN = (160, 60, 20)
FRAME = (200, 205, 200)

TITLES = {
    1: 'Ingresar', 2: 'Aviso para una cuenta de agricultor', 3: 'Resumen', 4: 'Cobertura',
    5: 'Estados del Resumen', 6: 'Necesidades y propuestas (borrador)',
    7: 'Borrador · borradores anteriores', 8: 'Borrador · cómo se calculó', 9: 'Compras conjuntas',
    10: 'Convocatoria · borrador', 11: 'Convocatoria abierta (responsable)',
    12: 'Convocatoria · cerrada con consolidado', 13: 'Convocatoria · cancelada',
    14: 'Convocatoria · nueva responsable', 15: 'Diálogos · compras conjuntas',
    16: 'Convocatoria · sin permiso para ver participantes', 17: 'Convocatoria · permiso retirado',
    18: 'Convocatoria · cerrada, vista sin permiso de detalle',
    19: 'Convocatoria · cerrada, menos de 3 participantes',
    20: 'Convocatoria · responsable no habilitada', 21: 'Catálogo · Productos',
    22: 'Catálogo · Nombres equivalentes', 23: 'Catálogo · Por identificar',
    24: 'Catálogo · Ya identificados', 25: 'Histórico sellado', 26: 'Estimación del consumo',
    27: 'Estimación guardada sin conexión', 28: 'Campañas', 29: 'Detalle de campaña',
    30: 'Diálogos · campañas y catálogo', 31: 'Usuarios (Administrador)', 32: 'Bitácora',
    33: 'Diálogos · usuarios, bitácora y foto', 34: 'Diálogos · editar, retirar y separar',
    35: 'Resumen en teléfono', 36: 'Teléfono · borrador de compra',
    37: 'Teléfono · compras conjuntas', 38: 'Teléfono · convocatoria abierta',
    39: 'Teléfono · catálogo', 40: 'Teléfono · histórico sellado', 41: 'Teléfono · campañas',
    42: 'Teléfono · bitácora', 43: 'Teléfono · menú «Más»',
    44: 'Teléfono · usuarios y permiso de sustitución', 45: 'Teléfono · formulario (nueva convocatoria)',
    46: 'Teléfono · confirmación con motivo', 47: 'Teléfono · identificar un producto con fotografía',
    48: 'Teléfono · convocatoria con permiso retirado', 49: 'Teléfono · sustituir a la responsable',
    50: 'Teléfono · nueva responsable revisar permisos', 51: 'Teléfono · cómo se calculó y detalle técnico',
}

# Capturas por lámina: (ruta relativa a docs/evidence/rediseno-web-v2, opciones).
# Opciones: 'dialog' (recorte automático al diálogo), 'label' (texto extra),
# 'crop' (x0, y0, x1, y1 en px de la captura), 'max_h' (alto máximo en px de la captura).
D = {'dialog': True}
SPEC = {
    1: [('base/acceso/01-ingresar__escritorio.png', {})],
    2: [('verificacion/acceso/02-agricultor-aviso__escritorio.png', {'label': 'verificación sobre 06283da'})],
    3: [('a/resumen/03-resumen__escritorio.png', {})],
    4: [('a/cobertura/04-cobertura__escritorio.png', {})],
    5: [('a/estados/05-01-cargando__SIMULADO__escritorio.png', {'label': '§1 cargando (simulado)'}),
        ('a/estados/05-07-error-servidor__SIMULADO__escritorio.png', {'label': '§7 error 500 (simulado)'}),
        ('a/estados/05-08-sin-permiso__SIMULADO__escritorio.png', {'label': '§8 403 (simulado)'}),
        ('a/estados/05-09-servidor-ocupado__SIMULADO__escritorio.png', {'label': '§9 429 (simulado)'}),
        ('b/detalle/18-cerrada-sin-permiso__escritorio.png', {'label': '§13 parcial: VISIBLE y UNDER_THRESHOLD', 'crop': (272, 300, 1440, 1100)}),
        ('b/detalle/16-sin-permiso-participantes__escritorio.png', {'label': '§13 parcial: RESPONSIBLE_ONLY (abierta)', 'crop': (272, 300, 1440, 1100)})],
    6: [('verificacion/capturas/06-borrador-pagina__escritorio.png', {'label': 'verificación sobre 06283da, página entera'})],
    7: [('a/pestanas/07-anteriores-pildora__escritorio.png', {})],
    8: [('verificacion/capturas/08-como-se-calculo-pagina__escritorio.png', {'label': 'verificación sobre 06283da, página entera'})],
    9: [('b/adopcion/09-compras-conjuntas__escritorio.png', {})],
    10: [('b/detalle/10-borrador__escritorio.png', {})],
    11: [('b/adopcion/11-abierta-responsable__escritorio.png', {})],
    12: [('b/detalle/12-cerrada-consolidado__escritorio.png', {})],
    13: [('b/detalle/13-cancelada__escritorio.png', {})],
    14: [('b/detalle/14-nueva-responsable__escritorio.png', {})],
    15: [('b/adopcion/15-1-nueva-convocatoria__escritorio.png', dict(D, label='15.1')),
         ('verificacion/convocatoria/04-dialogo-abrir__escritorio.png', dict(D, label='15.2 (verificación, 06283da)')),
         ('verificacion/convocatoria/06-dialogo-cerrar__escritorio.png', dict(D, label='15.3 (verificación, 06283da)')),
         ('b/dialogos/15-4-cancelar__escritorio.png', dict(D, label='15.4')),
         ('b/dialogos/15-5-conceder__escritorio.png', dict(D, label='15.5')),
         ('b/adopcion/15-6-sustituir__escritorio.png', dict(D, label='15.6'))],
    16: [('b/detalle/16-sin-permiso-participantes__escritorio.png', {})],
    17: [('b/detalle/17-permiso-retirado__escritorio.png', {})],
    18: [('b/detalle/18-cerrada-sin-permiso__escritorio.png', {})],
    19: [('b/detalle/19-cerrada-menos-de-3__escritorio.png', {})],
    20: [('b/detalle/20-responsable-no-habilitada__escritorio.png', {})],
    21: [('c/ronda2/21-39-catalogo-productos__escritorio.png', {})],
    22: [('c/catalogo/22-nombres-equivalentes__escritorio.png', {})],
    23: [('c/catalogo/23-por-identificar-con-foto__escritorio.png', {})],
    24: [('c/catalogo/24-corregir-identificacion__escritorio.png', {}),
         ('verificacion/identificacion/24-ya-identificados__escritorio.png', {'label': 'verificación sobre 06283da'})],
    25: [('a/historico/25-historico-sellado__escritorio.png', {})],
    26: [('verificacion/hallazgos/26-estimacion-decimales__escritorio.png', {'label': 'verificación sobre 06283da, primera pantalla'})],
    27: [('a/copia/27-copia-legible__escritorio.png', {'label': 'estado 1'}),
         ('a/copia/27-copia-estado__escritorio.png', {'label': 'estado 2'}),
         ('a/copia/27-copia-sin-sesion__escritorio.png', {'label': 'estado 3'})],
    28: [('orquestador/cabecera/28-campanas-accion__escritorio.png', {'label': 'cabecera del orquestador (última), primera pantalla'}),
         ('c/ronda2/28-41-campanas__escritorio.png', {'label': 'página entera (ronda 2 de C)'})],
    29: [('c/ronda2/29-detalle-campana__escritorio.png', {})],
    30: [('verificacion/admin/30-1-nueva-campana__escritorio.png', dict(D, label='30.1 (verificación, 06283da)')),
         ('c/dialogos/30.2-cerrar-campana__escritorio.png', dict(D, label='30.2')),
         ('c/dialogos/30.4-nuevo-producto__escritorio.png', dict(D, label='30.4')),
         ('c/dialogos/30.5-inactivar-producto__escritorio.png', dict(D, label='30.5')),
         ('c/dialogos/30.6-unir-nombres__escritorio.png', dict(D, label='30.6'))],
    31: [('c/ronda2/31-44-usuarios__escritorio.png', {})],
    32: [('c/bitacora/32-bitacora__escritorio.png', {'max_h': 2700})],
    33: [('verificacion/admin/33-1-nuevo-usuario__escritorio.png', dict(D, label='33.1 (verificación, 06283da)')),
         ('c/dialogos/33.2-contrasena__escritorio.png', dict(D, label='33.2')),
         ('verificacion/admin/33-3-desactivar__escritorio.png', dict(D, label='33.3 (verificación, 06283da)')),
         ('verificacion/admin/33-4-que-paso__escritorio.png', dict(D, label='33.4 (verificación, 06283da)')),
         ('c/dialogos/33.5-foto-no-disponible__SIMULADO__escritorio.png', dict(D, label='33.5 (simulado: 404)'))],
    34: [('b/dialogos/34-1-editar__escritorio.png', dict(D, label='34.1')),
         ('b/dialogos/34-2-retirar__escritorio.png', dict(D, label='34.2')),
         ('verificacion/admin/34-3-editar-campana__escritorio.png', dict(D, label='34.3 (verificación, 06283da)')),
         ('c/dialogos/34.4-editar-producto__escritorio.png', dict(D, label='34.4')),
         ('c/dialogos/34.5-separar-nombres__escritorio.png', dict(D, label='34.5')),
         ('verificacion/admin/34-6-editar-usuario__escritorio.png', dict(D, label='34.6 (verificación, 06283da)'))],
    35: [('a/telefono/35-resumen-telefono__movil.png', {})],
    36: [('verificacion/hallazgos/36-borrador-primera-pantalla__movil.png', {'label': '06283da, primera pantalla'}),
         ('verificacion/telefono/36-borrador-final__movil.png', {'label': '06283da, final de la página'})],
    37: [('b/adopcion/37-compras-conjuntas__movil.png', {})],
    38: [('b/adopcion/38-abierta-responsable__movil.png', {})],
    39: [('c/ronda2/21-39-catalogo-productos__movil.png', {})],
    40: [('a/telefono/40-historico-telefono__movil.png', {})],
    41: [('verificacion/hallazgos/41-campanas-barra__movil.png', {'label': '06283da, primera pantalla'}),
         ('c/ronda2/28-41-campanas__movil.png', {'label': 'página entera'})],
    42: [('c/bitacora/32-bitacora__movil.png', {}),
         ('c/telefono/42-bitacora-filtros__movil.png', {'label': '«Más filtros»'})],
    43: [('verificacion/telefono/43-menu-mas__movil.png', {'label': '06283da'})],
    44: [('c/ronda2/31-44-usuarios__movil.png', {'crop': (0, 0, 780, 3400), 'label': 'principio de la página'}),
         ('c/ronda2/31-44-usuarios__movil.png', {'crop': (0, 8000, 780, 9954), 'label': 'final de la página: panel del permiso'})],
    45: [('verificacion/telefono/45-nueva-convocatoria__movil.png', {'label': '06283da'})],
    46: [('verificacion/telefono/46-cancelar-hoja__movil.png', {'label': '06283da'})],
    47: [('c/catalogo/23-por-identificar-con-foto__movil.png', {'label': 'solicitud con foto elegida'})],
    48: [('verificacion/capturas/48-permiso-retirado__movil.png', {'label': '06283da'})],
    49: [('b/adopcion/49-sustituir__movil.png', {'label': 'primera pantalla'}),
         ('verificacion/capturas/49-sustituir-final__movil.png', {'label': '06283da, desplazado hasta el motivo'})],
    50: [('verificacion/capturas/50-nueva-responsable__movil.png', {'label': '06283da'})],
    51: [('verificacion/capturas/51-como-se-calculo__movil.png', {'label': '06283da, página entera'})],
}

# Láminas sin captura (motivo). Si una lámina está aquí y no en SPEC, se compone sola.
SIN_CAPTURA = {
    5: 'sólo hay capturas de §1, §7, §8 y §9 (simuladas) y de §13 en parte (VISIBLE no aparece; '
       'se ven RESTRICTED, UNDER_THRESHOLD y RESPONSIBLE_ONLY). Sin captura: §2–§6 y §10–§12.',
    30: '30.3 «Sellar las cifras» sin captura: hace falta una campaña cerrada y sin sellar, y la base aislada no tiene ninguna (las 11 cerradas están selladas).',
    33: '33.5: la foto real de la etiqueta es privada y no se fotografía; se muestra el estado simulado «no disponible» (404).',
}


def font(size, bold=False):
    for name in (('arialbd.ttf',) if bold else ()) + ('arial.ttf',):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def wrap(draw, text, fnt, width):
    lines, cur = [], ''
    for word in text.split(' '):
        test = (cur + ' ' + word).strip()
        if draw.textlength(test, font=fnt) <= width or not cur:
            cur = test
        else:
            lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def label_block(text, width, size=20, color=INK, bold=False):
    fnt = font(size, bold)
    tmp = ImageDraw.Draw(Image.new('RGB', (10, 10)))
    lines = wrap(tmp, text, fnt, width)
    lh = size + 6
    im = Image.new('RGB', (width, lh * len(lines) + 6), BG)
    d = ImageDraw.Draw(im)
    for i, ln in enumerate(lines):
        d.text((0, 3 + i * lh), ln, fill=color, font=fnt)
    return im


def vstack(parts, gap=6):
    w = max(p.width for p in parts)
    h = sum(p.height for p in parts) + gap * (len(parts) - 1)
    im = Image.new('RGB', (w, h), BG)
    y = 0
    for p in parts:
        im.paste(p, (0, y))
        y += p.height + gap
    return im


def framed(im):
    out = Image.new('RGB', (im.width + 2, im.height + 2), FRAME)
    out.paste(im, (1, 1))
    return out


def dialog_box(im):
    """Recuadro del diálogo: píxeles casi blancos sobre el velo oscuro."""
    g = im.convert('L').point(lambda v: 255 if v >= 250 else 0)
    w, h = g.size
    px = g.load()
    cols = [sum(1 for y in range(0, h, 2) if px[x, y]) for x in range(w)]
    rows = [sum(1 for x in range(0, w, 2) if px[x, y]) for y in range(h)]
    xs = [x for x, c in enumerate(cols) if c > 60]
    ys = [y for y, c in enumerate(rows) if c > 80]
    if not xs or not ys:
        return None
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    if x1 - x0 < 200 or y1 - y0 < 120:
        return None
    pad = 16
    return (max(0, x0 - pad), max(0, y0 - pad), min(w, x1 + pad), min(h, y1 + pad))


def load_capture(rel, opts):
    path = os.path.join(EVID, rel.replace('/', os.sep))
    im = Image.open(path).convert('RGB')
    note = ''
    if opts.get('dialog'):
        box = dialog_box(im)
        if box:
            im = im.crop(box)
            note = 'recortada al diálogo'
    if opts.get('crop'):
        im = im.crop(opts['crop'])
        note = 'recorte %s' % (opts['crop'],)
    return im, note


def scaled(im, width):
    if im.width == width:
        return im
    h = round(im.height * width / im.width)
    return im.resize((width, h), Image.LANCZOS)


def compose_desktop(n, lam, caps, sin):
    CW, PAD = 1150, 30
    slide = scaled(lam, CW)
    left = vstack([label_block('Lámina %02d · %s' % (n, TITLES[n]), CW, 30, INK, True),
                   label_block('laminas/%02d.png (1440 px a 2x)' % n, CW, 18, MUTED),
                   framed(slide)])
    if sin and not caps:
        right = vstack([label_block('Implementación', CW, 30, INK, True),
                        label_block('Sin captura: ' + sin, CW, 24, WARN, True)])
    else:
        blocks = []
        if len(caps) == 1 or all(not o.get('dialog') and not o.get('crop') for _, o in caps) and len(caps) <= 3:
            # una o pocas capturas de página: apiladas a todo el ancho
            limit = max(round(slide.height * 1.35), 1500)
            for rel, o in caps:
                im, note = load_capture(rel, o)
                im = scaled(im, CW)
                maxh = o.get('max_h')
                cut = round(maxh * CW / 1440) if maxh else limit
                if im.height > cut:
                    src_h = round(cut * 1440 / CW)
                    total = round(im.height * 1440 / CW)
                    im = im.crop((0, 0, CW, cut))
                    note = (note + '; ' if note else '') + 'recortada: primeros %d de %d px' % (src_h, total)
                txt = rel + (' · ' + o['label'] if o.get('label') else '') + (' · ' + note if note else '')
                blocks.append(vstack([label_block(txt, CW, 18, MUTED), framed(im)]))
        else:
            cw2 = (CW - PAD) // 2
            cells = []
            for rel, o in caps:
                im, note = load_capture(rel, o)
                im = scaled(im, cw2)
                txt = (o.get('label', '') + ' · ' if o.get('label') else '') + rel + (' · ' + note if note else '')
                cells.append(vstack([label_block(txt, cw2, 16, MUTED), framed(im)]))
            for i in range(0, len(cells), 2):
                pair = cells[i:i + 2]
                h = max(c.height for c in pair)
                row = Image.new('RGB', (CW, h), BG)
                for j, c in enumerate(pair):
                    row.paste(c, (j * (cw2 + PAD), 0))
                blocks.append(row)
        head = [label_block('Implementación (capturas existentes)', CW, 30, INK, True)]
        if sin:
            head.append(label_block('Nota: ' + sin, CW, 20, WARN, True))
        right = vstack(head + blocks, gap=14)
    W = PAD * 3 + CW * 2
    H = PAD * 2 + max(left.height, right.height)
    canvas = Image.new('RGB', (W, H), BG)
    canvas.paste(left, (PAD, PAD))
    canvas.paste(right, (PAD * 2 + CW, PAD))
    return canvas


def compose_phone(n, lam, caps, sin):
    S, PAD = 0.55, 24
    CW = round(780 * S)
    slide = scaled(lam, CW)
    colh = max(slide.height, round(1688 * S))
    cols = []
    title = label_block('Lámina %02d · %s' % (n, TITLES[n]), 3 * CW, 26, INK, True)
    cols.append(vstack([label_block('laminas/%02d.png (390 px a 2x)' % n, CW, 16, MUTED), framed(slide)]))
    for rel, o in caps:
        im, note = load_capture(rel, o)
        im = scaled(im, CW)
        pieces = []
        y = 0
        while y < im.height and len(pieces) < 3:
            pieces.append(im.crop((0, y, CW, min(im.height, y + colh))))
            y += colh
        if y < im.height:
            note = (note + '; ' if note else '') + 'recortada: se muestran %d de %d px' % (round(y / S), round(im.height / S))
        elif len(pieces) > 1:
            note = (note + '; ' if note else '') + 'repartida en %d columnas (sigue arriba de la siguiente)' % len(pieces)
        txt = rel + (' · ' + o['label'] if o.get('label') else '') + (' · ' + note if note else '')
        lab = label_block(txt, CW * len(pieces) + PAD * (len(pieces) - 1), 16, MUTED)
        row = Image.new('RGB', (CW * len(pieces) + PAD * (len(pieces) - 1), max(p.height for p in pieces) + 2), BG)
        for j, p in enumerate(pieces):
            row.paste(framed(p), (j * (CW + PAD), 0))
        cols.append(vstack([lab, row]))
    if sin and not caps:
        cols.append(label_block('Sin captura: ' + sin, 2 * CW, 22, WARN, True))
    elif sin:
        title = vstack([title, label_block('Nota: ' + sin, 3 * CW, 18, WARN, True)])
    W = PAD * (len(cols) + 1) + sum(c.width for c in cols)
    W = max(W, title.width + 2 * PAD)
    H = PAD * 3 + title.height + max(c.height for c in cols)
    canvas = Image.new('RGB', (W, H), BG)
    canvas.paste(title, (PAD, PAD))
    x = PAD
    for c in cols:
        canvas.paste(c, (x, PAD * 2 + title.height))
        x += c.width + PAD
    return canvas


def main():
    lam_dir = sys.argv[1]
    only = [int(a) for a in sys.argv[2:]] or list(range(1, 52))
    os.makedirs(OUT, exist_ok=True)
    for n in only:
        lam = Image.open(os.path.join(lam_dir, '%02d.png' % n)).convert('RGB')
        caps = SPEC.get(n, [])
        sin = SIN_CAPTURA.get(n, '')
        img = compose_phone(n, lam, caps, sin) if n >= 35 else compose_desktop(n, lam, caps, sin)
        if img.width > 2400:
            img = scaled(img, 2400)
        out = os.path.join(OUT, '%02d.png' % n)
        img.save(out, optimize=True)
        print('%02d %dx%d %d KB' % (n, img.width, img.height, os.path.getsize(out) // 1024))


if __name__ == '__main__':
    main()
