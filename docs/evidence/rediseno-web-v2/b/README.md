# Rediseño Web v2 · sesión B (compras conjuntas): capturas y verificación

- **Fecha real:** 2026-11-13.
- **Código capturado:** rama `feat/web-rediseno-v2-b`. La pasada completa se hizo sobre `bc85dd6`; la segunda pasada (15.5, 15.6, teléfono 20 y 49) y la de foco, sobre `9c777b8`.
- **Entorno:** Vite propio en `127.0.0.1:5182` (`VITE_API_PROXY_TARGET=http://127.0.0.1:3350`) contra la API aislada 3350 y la base sintética `agro_demo` (15434). No es la DEMO oficial. Edge sin interfaz (`capture_base.mjs` de BASE), zona horaria `America/La_Paz`.
- **Credenciales:** contraseñas de un solo uso fijadas por la herramienta en la base aislada; no se imprimen ni se capturan.
- **Ninguna captura es simulada:** todos los estados salen de la API real (`_capturas.json`, `simulado: false` en las 53 entradas).

## Comandos

```bash
# Desde _wt/WEB2-B, con las variables de _wt/ET2-BE/tool/etapa3/e3env.sh cargadas con `source` (sin imprimirlas)
node tool/web_rediseno_v2/datos_b.cjs revoked                       # único dato creado (lámina 17), ver abajo
WEB_URL=http://127.0.0.1:5182 node tool/web_rediseno_v2/capture_base.mjs tool/web_rediseno_v2/plan_b_compras.mjs docs/evidence/rediseno-web-v2/b
WEB_URL=http://127.0.0.1:5182 node tool/web_rediseno_v2/capture_base.mjs tool/web_rediseno_v2/plan_b_telefono_49.mjs docs/evidence/rediseno-web-v2/b
WEB_URL=http://127.0.0.1:5182 node tool/web_rediseno_v2/capture_base.mjs tool/web_rediseno_v2/plan_b_foco.mjs docs/evidence/rediseno-web-v2/b
```

Salida resumida: 37 capturas en la pasada completa sin avisos; 4 en la segunda; 2 de foco. Las 8 medidas de desplazamiento horizontal (escritorio, 390 px y zoom 200 %, en lista y detalle) dieron «sin desplazamiento horizontal» (`doc` = `win`).

## Datos creados para un estado

| Lámina | Qué | Cómo |
|---|---|---|
| 17 y 48 | «Administración PA 2 (sintética)» con «Consultar participantes y cantidades» retirado en «Convocatoria P-C y N7 (sintética)» | `datos_b.cjs revoked`: la responsable (Directiva DEMO) lo concede y lo retira por la API real (`POST …/collaborators` y `…/collaborators/revoke`). Queda en el historial de permisos y en la actividad de esa convocatoria |

El resto de los estados ya existían en la base aislada (convocatorias sintéticas de E2, E3-P2 y P-A). Ninguna captura envía un diálogo: se abren y se cierran con Esc o «Cancelar».

## Capturas por lámina

| Lámina | Cuenta | Convocatoria | Archivo |
|---|---|---|---|
| 09 | directiva | campaña Invierno 2026 | `lista/09-compras-conjuntas__{escritorio,portatil,tableta}.png`, `lista/09-filtro-*.png`, `lista/09-permiso-sustituir-lectura__escritorio.png` |
| 10 | directiva | Convocatoria E3-P2 con origen | `detalle/10-borrador__*.png` |
| 11 | directiva | Convocatoria P-C y N7 | `detalle/11-abierta-responsable__*.png`, `detalle/11-como-funciona-el-acceso__escritorio.png` |
| 11 (colaboradora) | admin | P-C y N7 | `detalle/11b-abierta-colaboradora__escritorio.png` |
| 12 | directiva | Compra conjunta desde propuesta E3 | `detalle/12-cerrada-consolidado__*.png` |
| 13 | directiva | P-A concurrencia 16:36:26 | `detalle/13-cancelada__*.png` |
| 14 | suc | P-A app anterior | `detalle/14-nueva-responsable__*.png`, `dialogos/14-confirmar-permiso__escritorio.png` |
| 15.1 | directiva | — | `dialogos/15-1-nueva-convocatoria__escritorio.png`, `dialogos/15-1-nueva-desde-borrador__escritorio.png` |
| 15.2–15.6 | directiva | E3-P2 / P-C y N7 / demostración | `dialogos/15-2-abrir`, `15-3-cerrar`, `15-4-cancelar`, `15-5-conceder`, `15-6-sustituir` |
| 16 | admin2 | P-A concurrencia (abierta) | `detalle/16-sin-permiso-participantes__*.png` |
| 17 | admin2 | P-C y N7 | `detalle/17-permiso-retirado__*.png` |
| 18 | admin | Compra conjunta desde propuesta E3 | `detalle/18-cerrada-sin-permiso__*.png` |
| 19 | admin | Herbicidas invierno 2026 (cierre automático) | `detalle/19-cerrada-menos-de-3__*.png` |
| 20 | directiva | demostración (responsable no habilitada) | `detalle/20-responsable-no-habilitada__*.png`, `dialogos/20-renunciar-suspendido__escritorio.png`, `telefono/20-responsable-no-habilitada__movil.png` |
| 34.1 / 34.2 | directiva | E3-P2 / P-C y N7 | `dialogos/34-1-editar__escritorio.png`, `dialogos/34-2-retirar__escritorio.png` |
| 37, 38, 45, 46, 48, 49, 50 | directiva / admin2 / suc | — | `telefono/*.png` (390 px por ancho de navegador, no es un teléfono físico) |
| Zoom 200 % | directiva | lista y P-C y N7 | `zoom200/*.png` |
| Foco | directiva | P-C y N7 | `foco/11-retorno-foco-cabecera__escritorio.png`, `foco/11-retorno-foco-retirar__escritorio.png` |

## Notas de lectura

- En las capturas de página completa de 390 y 820 px la barra inferior fija aparece a media página: es un efecto de la captura por tramos, no del diseño.
- Los nombres de las convocatorias, personas y productos son datos sintéticos del entorno aislado; difieren de los de las láminas donde la base no tiene el mismo estado.
- `_capturas.json` acumula las pasadas: la segunda pasada se repitió tres veces (ajuste del foco inicial de los diálogos) y conserva una entrada de `foco/20-foco-cabecera`, cuyo archivo se retiró porque el foco quedaba fuera de la pantalla; la sustituyen las dos capturas de `foco/11-*`.
- La primera pasada se repitió entera porque se editó código mientras corría (recargas de Vite): sólo se conservan las capturas de la pasada limpia.

## Ronda de adopción de la base (`0945dd1`), 2026-11-13

- **Código capturado:** `e649d94` (lista con `PageHeader attachToHeader` + `primaryAction` y `CampaignPill`; formulario y sustitución con `Dialog fullScreenOnPhone`; participantes con `DataTable` y `rowTestId`; `QuantityFigure`).
- **Comando:** `WEB_URL=http://127.0.0.1:5182 node tool/web_rediseno_v2/capture_base.mjs tool/web_rediseno_v2/plan_b_adopcion.mjs docs/evidence/rediseno-web-v2/b` (Vite con `VITE_API_PROXY_TARGET=http://127.0.0.1:3350`).
- **Salida:** 10 capturas en `adopcion/` (09, 15.1, 11 y 15.6 a 1440; 37, 45, 38 y 49 a 390), sin avisos; 3 medidas «sin desplazamiento horizontal». `37-compras-conjuntas-pantalla` se repitió como primera captura tras navegar: la de página completa deja la página desplazada y la barra fija tapaba la píldora de campaña (efecto de la captura, no del diseño). La inspección confirma un solo `<h1>` («Compras conjuntas»).
