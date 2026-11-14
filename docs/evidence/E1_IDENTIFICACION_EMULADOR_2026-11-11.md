# E1 — Cierre de la etapa 1 en el emulador (2026-11-11, noche)

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-11, de las 19:00Z a las 21:10Z (UTC) |
| Procedencia | **EMULADOR** Pixel_8 (`emulator-5554`, Android 16, API 36), app aislada «AC ET1» (`com.comunidad.agro.agroquimicos.et1`). **No es un teléfono físico.** |
| Código | Mobile `7257816` (recorrido hasta el defecto), `8a45484` y `bce8e59` (correcciones); Back/Web `839c7a6` (validación completa con sharp desde las 20:45Z) |
| Central | Entorno aislado ET1 (`tool/etapa1/et1.sh`): PostgreSQL 15434, API 3350, Web 5175. Túnel HTTPS temporal autorizado por Roderich, **sólo hacia `/api/v1/`** (compuerta `api_gate.cjs`; `/docs` y la raíz responden 404) |
| Datos | Sintéticos: cuenta `agricultor15.demo@example.test`, titular «Rosa Vargas sintetica», siembra local DEMO; etiquetas inventadas generadas para la prueba |
| Capturas | Rama remota `evidence/ui-actual-2026-11-11` del repositorio móvil, `docs/evidence/ui-actual/2026-11-11/` (capturas 24–44) |

## 1. Recorrido

Producto local → foto → autorización → solicitud → revisión en la Web → lectura en el móvil → confirmación del vínculo.

| # | Paso | Dónde | Resultado observado |
|---|---|---|---|
| 1 | Crear «Abono foliar casero» (L) con Wi‑Fi y datos apagados | Emulador | Guardado local; sin red (`ping` inalcanzable) |
| 2 | Foto desde la galería (etiqueta sintética) | Emulador | Guardada en `product_photos/`: JPEG 1000×1400, 149 642 bytes, segmentos `APP0 DQT SOF0 DHT SOS`, **sin APP1/EXIF** |
| 3 | «Pedir identificación al sindicato» con la casilla de la foto marcada | Emulador | Diálogo con lo que se envía (nombre, ingrediente, unidad) y texto FOTO-1; estado «Pendiente de envío» y «Foto pendiente de envío» |
| 4 | Forzar cierre y reabrir | Emulador | Mismo estado (persistencia) |
| 5 | «Enviar ahora» sin conexión | Emulador | Sigue pendiente; ningún aviso de éxito |
| 6 | Reconectar, reautenticar y enviar con un **503 inyectado** sólo en `PUT …/photo` (compuerta local, respuesta señalada como inyectada) | Emulador + API | Datos `PUT` 201 «Recibida por el sindicato»; foto 503. **Defecto encontrado:** la app mostraba «Foto no enviada: el sindicato no la aceptó» y dejaba de reintentar (ver §2) |
| 7 | Con la corrección: reemplazar la foto (etiqueta azul) | Emulador | Pide autorización nueva y aparte («¿Enviar también la nueva foto al sindicato?») |
| 8 | Envío con el 503 inyectado y **doble toque** de «Enviar ahora» | Emulador + API | «Foto no enviada (se reintentará)»; el doble toque produjo un solo ciclo (un `PUT` de datos y un `PUT` de foto) |
| 9 | Quitar el fallo y «Enviar ahora» | Emulador + API | Foto `PUT` 201 tras pasar la **decodificación completa** del servidor; «Foto enviada». En la base: **una sola** solicitud para el producto, `photoState STORED`, `image/jpeg`, 1000×1400, 159 983 bytes, consentimiento `FOTO-1` |
| 10 | La Directiva ve la foto | Web (Edge sin interfaz) | `GET …/photo` 200 `image/jpeg`, `Cache-Control: private, no-store`; la imagen del modal es un `blob:` local |
| 11 | La Directiva crea el producto colectivo «Abono foliar casero» | Web | Solicitud `LINKED / CREATED_PRODUCT`; evento con actor institucional; bitácora |
| 12 | «Actualizar» en el teléfono | Emulador | «Identificado por el sindicato como “Abono foliar casero” (L)» y botón **Vincular** (nunca automático) |
| 13 | Vincular (diálogo existente) | Emulador | Vínculo vigente. **Huella de registros privados idéntica antes y después** (§3) |
| 14 | Quitar la foto ya enviada | Emulador + API | Archivo local borrado; `DELETE …/photo` 204; servidor `REMOVED`, clave de almacenamiento nula; «Foto retirada» |
| 15 | Otro producto («Cal agricola», KG) con foto, solicitud **sin** marcar la casilla | Emulador + API | `PUT` 201; servidor `photoState NONE`, sin consentimiento; «Recibida por el sindicato» sin chips de foto |
| 16 | Declarar 20 L del producto recién vinculado | Emulador + API | `POST /sync/v1/push` 200 `APPLIED`; «Aceptada por el sindicato» |

Historial del servidor de la solicitud del emulador: `RECEIVED` (agricultor) → `UPDATED` (autorización nueva de la foto) → `PHOTO_RECEIVED` → `PRODUCT_CREATED` (actor institucional) → `PHOTO_REMOVED` (agricultor). Ningún evento ni vista institucional identifica al agricultor.

## 2. Defecto encontrado y corregido

`IdentificationRequestStore.sendNow` ponía `photo_next_attempt_at = NULL` en una foto `FAILED` con reintento. En `FAILED`, `NULL` significa fallo definitivo: la foto salía de la cola y la pantalla decía «el sindicato no la aceptó» ante un 503 transitorio. Corrección `8a45484`: queda vencida en el acto. Prueba de regresión que falla sin la corrección y pasa con ella. Comprobado de nuevo en el emulador (pasos 8–9).

## 3. Registros privados intactos al vincular

Huella (recuento y SHA-256 de las filas) de la base del teléfono, copiada por `run-as` antes y después del paso 13:

| Tabla | Filas | ¿Cambió? |
|---|---|---|
| purchases, purchase_items, purchase_allocations, provider_payments | 3, 4, 5, 2 | No |
| applications, application_items, application_consumptions | 2, 2, 2 | No |
| application_plans, application_plan_items | 1, 1 | No |
| inventory_lots, inventory_movements | 6, 9 | No |
| account_transactions, payment_allocations | 5, 2 | No |
| transfers, transfer_items, transfer_lot_items | 1, 1, 1 | No |
| declared_needs, sync_outbox | 0, 0 | No |
| products | 4 | No |
| product_bindings | 3 → 4 | Sí: el vínculo confirmado |
| product_identification_requests | 1 | Sí: la vista del sindicato |

## 4. Incidencias del entorno (no de la app)

- El emulador llevaba más de dos días encendido: el renderizado de Flutter quedó negro y se reinició Android con `adb reboot` (datos conservados). Más tarde el propio sistema dejó de responder por falta de memoria mientras cuatro agentes compilaban en el mismo equipo; se volvió a reiniciar y se redujo la carga.
- Tras actualizar la APK, la lectura de la sesión segura superó su límite de 3 s con el emulador saturado («vinculación local no disponible»); se recuperó sola al bajar la carga.
- El teclado del emulador alteró textos tecleados por ADB de una vez; se tecleó por partes (también la contraseña de un solo uso, con `type_password.cjs`, sin imprimirla). Un intento de reautenticación devolvió 401 real por una contraseña alterada.

## 5. Observaciones para mejorar (no bloquean)

- La hoja «Foto de la etiqueta» abierta no se refresca cuando el envío termina en segundo plano (muestra «pendiente» hasta cerrarla).
- Tras reemplazar una foto que nunca llegó al servidor, el diálogo dice «el sindicato conserva la foto que ya tenía», aunque no tenía ninguna.
- En subpantallas de Más, la barra inferior resalta «Inicio».
- El emisor de identificación consulta `GET /catalog/identification-requests` en cada ciclo del sincronizador; podría espaciarse como en E2.

## 6. Qué no se comprobó

- Teléfono físico (el POCO no está disponible).
- Cámara: se usó la galería con imágenes sintéticas.
- Barrido de fotos (`product-photos:sweep`) contra el almacenamiento real del entorno: sólo pruebas automatizadas.
