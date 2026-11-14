# E2 — Convocatorias de compra conjunta: recorrido real (2026-11-11, noche)

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-11, de las 21:25Z a las 22:05Z (UTC) |
| Procedencia | **API real** (aislada) + **Web real** (Edge sin interfaz) + **EMULADOR** Pixel_8, app «AC ET1». **No es un teléfono físico.** |
| Código | Back/Web `feat/etapa2-convocatorias` (`f95b34e` servidor con E2-P1, `cd22bf7` Web alineada); Mobile `6bac5a3` |
| Entorno | `tool/etapa2/et2.sh`: misma base sintética y puertos que ET1 (PostgreSQL 15434, API 3350, Web 5175), migración aditiva E2 aplicada; túnel temporal sólo `/api/v1/` |
| Instalación | APK E2 instalada **sobre** la app E1 con sus datos (`adb install -r`): migración SQLite v15 → v16 con datos existentes; arrancó con la sesión disponible |
| Plazo | Convocatoria con fecha límite real de 30 minutos (hora del servidor); no se cambió ningún reloj |
| Capturas | Web: `e2_convocatorias/`. Móvil: rama `evidence/ui-actual-2026-11-11` (capturas 55–66) |

## 1. Recorrido

| # | Paso | Quién / dónde | Resultado |
|---|---|---|---|
| 1 | Crear borrador «Herbicidas invierno 2026 (sintética)» con Herbicida DEMO y Abono foliar casero (del catálogo), responsable «Directiva DEMO», plazo +30 min | Directiva, Web | Borrador creado; navegación por `call_id` |
| 2 | Abrir (confirmación) | Directiva, Web | `OPEN` 21:29:57Z, plazo 21:59:00Z |
| 3 | Descubrir la convocatoria | Agricultora (titular sintética), emulador | Sin push: aparece al verificar el acceso / «Actualizar»; aviso en Inicio «Nueva convocatoria: … · cierra el 11/11/2026 21:59» |
| 4 | Detalle | Emulador | Campaña, fecha límite «según la hora del sindicato», responsable, productos; «Su necesidad declarada para esta campaña: 20 L» como referencia que **no se suma** |
| 5 | Participar **sin conexión**: 15 L + 20 L, consentimiento CONV-1 (botón inactivo hasta marcar «Entiendo y acepto») | Emulador | «Pendiente de envío (se reintentará)» con el detalle pendiente; ningún éxito sin servidor |
| 6 | Reconectar y enviar | Emulador + API | `PUT …/participation` 200 `ACCEPTED`; «Participación recibida · El sindicato tiene: 15 L …, 20 L …» |
| 7 | Modificar a 12 L | Emulador + API | Secuencia 2 aceptada; «El sindicato tiene: 12 L …» |
| 8 | Segundo agricultor sintético (agricultor3) por la API real, 8 L, y **reenvío con el mismo `operation_id`** | Script `participate_e2.cjs` | 200 y 200; **una sola** operación registrada (la respuesta repetida tiene el mismo contenido con otro orden de claves JSON) |
| 9 | Ver la convocatoria abierta como **responsable** | Directiva, Web | «Participantes (lista provisional)»: Rosa Vargas (sintética) 12 L + 20 L, Carmen Choque (sintética) 8 L; totales 20 L (2 personas) y 20 L (1); «2 personas» (cada una cuenta una vez); ningún correo |
| 10 | Ver la misma convocatoria como **Administrador sin permiso** | Administración, Web | Sin participantes («Sólo el responsable…»), totales en vivo ocultos («Total visible sólo para el responsable mientras la convocatoria está abierta…»), número de personas visible |
| 11 | Preparar sin conexión una modificación a 30 L antes del plazo | Emulador | «El sindicato tiene: 12 L …» y «Pendiente de envío: 30 L …» a la vez |
| 12 | Enviarla 29 s **después** del plazo (21:59:29Z) | Emulador + API | 409 `CALL_NOT_OPEN` (`DEADLINE_PASSED`); el teléfono muestra **«Fuera de plazo»** y conserva lo aceptado |
| 13 | Cierre automático | Servidor | 21:59:32Z, modo `AUTOMATIC`, **corte 21:59:00Z** (la tarea posterior no amplió el plazo) |
| 14 | «Consolidado al cierre» | Servidor | Herbicida DEMO 20 000 mL (2 personas), Abono foliar casero 20 000 mL (1); 2 participantes. El envío tardío de 30 L **no** lo modificó |
| 15 | Consulta en el teléfono | Emulador | «Convocatoria cerrada», «Incluida en el consolidado al cierre: 12 L de Herbicida DEMO, 20 L de Abono foliar casero», sin botones de cambio |
| 16 | Consulta en la Web | Directiva y Administración | Responsable: totales y detalle por persona. Administración: corte, modo, «2 personas», totales ocultos bajo el umbral («menos de 3 personas»), sin detalle por persona. Texto «no son compras, entregas ni deudas» |

Operaciones registradas en el servidor (sin datos personales):

```text
seq 1 CONFIRM ACCEPTED       21:34:10  (agricultora del emulador)
seq 2 CONFIRM ACCEPTED       21:35:09  (agricultora del emulador)
seq 1 CONFIRM ACCEPTED       21:35:48  (agricultor3, script)
seq 3 CONFIRM CALL_NOT_OPEN  21:59:29  (agricultora del emulador, fuera de plazo)
```

## 2. Sin efectos en registros privados del teléfono

Huella de la base del teléfono antes de la etapa 2 y después del cierre: compras, asignaciones, pagos a proveedores, aplicaciones y consumos, planes, lotes y movimientos de inventario, asientos de cuenta y transferencias **idénticos**. Las únicas diferencias vienen de pasos de la etapa 1 hechos entre ambas huellas (una necesidad declarada, un segundo producto local y su solicitud). La necesidad declarada (20 L) siguió igual tras participar con 20 L.

## 3. Pruebas automatizadas de la etapa 2

| Ámbito | Resultado |
|---|---|
| Back dominio (`call-domain.spec.ts`) | 27/27, incluida la regla E2-P1 |
| Back PostgreSQL (`joint-purchase-calls.postgres.spec.ts`) | 17/17: transiciones, aperturas concurrentes, autorización por permiso y tenant, consentimiento, idempotencia y secuencia, plazo con reloj inyectado, cierre concurrente, cancelación, sin efectos en tablas legadas, persona contada una vez |
| Back PostgreSQL E1 tras la fusión | 17/17 |
| Web (`joint-purchase-calls*.test.tsx`) | 28/28; tsc, lint (0 errores) y build correctos |
| Mobile (13 archivos focalizados) | todos en verde: store, sender, aislamiento sin efectos, pantallas, migración, equivalencia de esquema, guardas de voz, Inicio |

No se repitieron las suites completas en la rama de la etapa 2 (pedido de Roderich por la temperatura del equipo); queda como siguiente paso.

## 4. Observaciones

- En el detalle del teléfono, tras el cierre, el estado de la última operación local («Fuera de plazo») aparece junto a «Incluida en el consolidado al cierre»: correcto, pero podría leerse como que no se incluyó nada. Sugerencia de diseño: separar «último envío» de «resultado al cierre».
- La captura Web del administrador con la convocatoria **abierta** se sobrescribió con la de la cerrada; lo observado se describe en el paso 10 (texto verificado por el guion).
- Mobile muestra la fecha límite con la zona del emulador (UTC); la Web, con la del navegador (La Paz).

## 5. Qué no se comprobó

- Teléfono físico.
- Cancelación y retiro de participación en el emulador (sí en pruebas automatizadas).
- Cierre manual en la Web en este recorrido (cubierto por pruebas; aquí el cierre fue automático por plazo).
