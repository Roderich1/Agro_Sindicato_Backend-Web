# Capturas del prototipo: barra de pestañas con letra grande (2026-10-30)

Renderizado de `docs/ux/prototipo/index.html` en Edge sin interfaz (fuente real del navegador), pantallas Inicio y Cuentas, a 320/360/412 dp y letra ×1,0/×1,3/×2,0. Cada captura es el marco del teléfono entero (recorte al `getBoundingClientRect()` de `.phone`, a tamaño CSS). Medidas tomadas por script en el DOM (`getBoundingClientRect`, `scrollWidth`, `elementFromPoint`). No es la app Flutter: la verificación en la app es parte de N1.

## Medición vigente (segunda pasada, misma fecha; prototipo del commit que incluye este README)

Cambio respecto a la primera pasada: los puntos de corte por sílaba del texto visible son espacios de ancho cero (`U+200B`) en vez de guiones blandos (`U+00AD`), así el corte no dibuja guion (igual que Flutter) y «Cuen / tas» cabe en su hueco; cinco huecos iguales sin relleno lateral.

| Captura | Barra (px de 760) | Contenido (px) | Líneas por pestaña (Inicio · Productos · Cuentas · Sindicato · Más) | Desborde medido | Pestañas pulsables |
|---|---|---|---|---|---|
| `proto_inicio_320_x1.png` | 55 | 661 | 1 · 1 · 1 · 1 · 1 | ninguno | sí |
| `proto_inicio_320_x13.png` | 86 | 630 | 1 · 2 · 2 · 2 · 1 | ninguno | sí |
| `proto_inicio_320_x2.png` | 154 | 562 | 2 · 3 · 2 · 2 · 1 | ninguno | sí |
| `proto_inicio_360_x1.png` | 55 | 661 | 1 · 1 · 1 · 1 · 1 | ninguno | sí |
| `proto_inicio_360_x13.png` | 86 | 630 | 1 · 2 · 1 · 2 · 1 | ninguno | sí |
| `proto_inicio_360_x2.png` | 154 | 562 | 1 · 3 · 2 · 2 · 1 | ninguno | sí |
| `proto_inicio_412_x1.png` | 55 | 661 | 1 · 1 · 1 · 1 · 1 | ninguno | sí |
| `proto_inicio_412_x13.png` | 66 | 650 | 1 · 1 · 1 · 1 · 1 | ninguno | sí |
| `proto_inicio_412_x2.png` | 123 | 593 | 1 · 2 · 2 · 2 · 1 | ninguno | sí |
| `proto_cuentas_320_x1.png` | 55 | 661 | 1 · 1 · 1 · 1 · 1 | ninguno | sí |
| `proto_cuentas_320_x13.png` | 86 | 630 | 1 · 2 · 2 · 2 · 1 | ninguno | sí |
| `proto_cuentas_320_x2.png` | 154 | 562 | 2 · 3 · 2 · 2 · 1 | ninguno | sí |
| `proto_cuentas_360_x1.png` | 55 | 661 | 1 · 1 · 1 · 1 · 1 | ninguno | sí |
| `proto_cuentas_360_x13.png` | 86 | 630 | 1 · 2 · 1 · 2 · 1 | ninguno | sí |
| `proto_cuentas_360_x2.png` | 154 | 562 | 1 · 3 · 2 · 2 · 1 | ninguno | sí |
| `proto_cuentas_412_x1.png` | 55 | 661 | 1 · 1 · 1 · 1 · 1 | ninguno | sí |
| `proto_cuentas_412_x13.png` | 66 | 650 | 1 · 1 · 1 · 1 · 1 | ninguno | sí |
| `proto_cuentas_412_x2.png` | 123 | 593 | 1 · 2 · 2 · 2 · 1 | ninguno | sí |

- Las cinco etiquetas siguen visibles y con su tamaño en todas las combinaciones; el nombre completo va en `aria-label` del botón y el texto visible (con puntos de corte por sílaba) va `aria-hidden`.
- Ningún desborde medido en ninguna combinación. A ×2,0 la barra ocupa 154 px de 760 (20 %) y el contenido conserva 562 px; los botones del contenido y las pestañas responden al toque en su centro.
- Dato para N1: con la fuente del navegador, «Cuentas» va en dos líneas a 360 dp ×2,0 e «Inicio» en dos a 320 dp ×2,0; en Flutter se mide con Roboto.

## Antecedente: primera pasada (commit `bc79aca`, misma fecha)

Con guiones blandos (`U+00AD`, que dibujan guion al cortar) y 1 px de relleno lateral:

| Captura | Barra (px de 760) | Contenido (px) | Líneas por pestaña (Inicio · Productos · Cuentas · Sindicato · Más) | Desborde medido | Pestañas pulsables |
|---|---|---|---|---|---|
| `proto_inicio_320_x1.png` | 70 | 646 | 1 · 2 · 1 · 1 · 1 | ninguno | sí |
| `proto_inicio_320_x13.png` | 86 | 630 | 1 · 2 · 2 · 2 · 1 | ninguno | sí |
| `proto_inicio_320_x2.png` | 154 | 562 | 2 · 3 · 2 · 3 · 1 | Cuentas | sí |
| `proto_inicio_360_x1.png` | 55 | 661 | 1 · 1 · 1 · 1 · 1 | ninguno | sí |
| `proto_inicio_360_x13.png` | 86 | 630 | 1 · 2 · 1 · 2 · 1 | ninguno | sí |
| `proto_inicio_360_x2.png` | 154 | 562 | 1 · 3 · 2 · 2 · 1 | ninguno | sí |
| `proto_inicio_412_x1.png` | 55 | 661 | 1 · 1 · 1 · 1 · 1 | ninguno | sí |
| `proto_inicio_412_x13.png` | 66 | 650 | 1 · 1 · 1 · 1 · 1 | ninguno | sí |
| `proto_inicio_412_x2.png` | 154 | 562 | 1 · 3 · 2 · 2 · 1 | ninguno | sí |
| `proto_cuentas_320_x1.png` | 70 | 646 | 1 · 2 · 1 · 1 · 1 | ninguno | sí |
| `proto_cuentas_320_x13.png` | 86 | 630 | 1 · 2 · 2 · 2 · 1 | ninguno | sí |
| `proto_cuentas_320_x2.png` | 154 | 562 | 2 · 3 · 2 · 3 · 1 | Cuentas | sí |
| `proto_cuentas_360_x1.png` | 55 | 661 | 1 · 1 · 1 · 1 · 1 | ninguno | sí |
| `proto_cuentas_360_x13.png` | 86 | 630 | 1 · 2 · 1 · 2 · 1 | ninguno | sí |
| `proto_cuentas_360_x2.png` | 154 | 562 | 1 · 3 · 2 · 2 · 1 | Cuentas | sí |
| `proto_cuentas_412_x1.png` | 55 | 661 | 1 · 1 · 1 · 1 · 1 | ninguno | sí |
| `proto_cuentas_412_x13.png` | 66 | 650 | 1 · 1 · 1 · 1 · 1 | ninguno | sí |
| `proto_cuentas_412_x2.png` | 154 | 562 | 1 · 3 · 2 · 2 · 1 | ninguno | sí |

- Límite que motivó la segunda pasada: a 320 dp ×2,0 (y en Cuentas a 360 dp ×2,0) «Cuen-» en negrita ocupaba 1–2 px más que su hueco y rozaba la etiqueta vecina.
