# F08 — Comprobación focalizada contra el Backend integrado (F10)

- **Fecha real:** 2026-10-16, 20:00–21:13Z. Ejecutó la sesión A de Claude Code, por delegación técnica. No es una inspección personal de Roderich ni una revisión del tutor.
- **Motivo:** el E2E físico del turno 2 ([Mobile `F08_MOBILE_RESTORE.md` §5](https://github.com/Roderich1/AppMovilAgroquimico/blob/main/docs/evidence/F08_MOBILE_RESTORE.md)) usó el Backend **`a45ab83`**, no el integrado. Ese PASS **se conserva sobre las versiones que se ejecutaron** y no se reetiqueta como PASS físico sobre `main`. Este documento cierra la diferencia con una comprobación focalizada sobre el Backend final.
- **No cambia** el estado de GATE-F08 (#41), que sigue **Pending**.

## Qué cambió entre `a45ab83` y el integrado

`git diff a45ab83 e027938` en el camino de los respaldos:

| Cambio | Dónde | Cómo se comprueba aquí |
|---|---|---|
| La guarda del cuerpo de respaldos se registra **después** de helmet y CORS: su 415 lleva sus cabeceras | `Back/src/main.ts` | `api_headers_check.cjs`, en rojo contra `a45ab83` y en verde contra `e027938` |
| Relectura de la fila tras un fallo ambiguo al marcar AVAILABLE, para no borrar los bytes de una copia que sí se confirmó | `backups.service.ts`; prueba «an ambiguous AVAILABLE update that did commit keeps the copy and its bytes» | Suite PostgreSQL de respaldos sobre `e027938` (no se puede provocar desde la API) |
| Migración F08 renombrada a `20261016181000_f08_backup_metadata` (sin cambios de contenido) y F07 integrado antes | `Back/prisma/migrations/` | Base nueva con las 10 migraciones en orden |

## Entorno

| Elemento | Valor |
|---|---|
| Backend | `main` **`e02793809502b5da0b0638802f2fbec5be8c0f86`**, worktree limpio, `npm ci`, `prisma generate`, `build` y `build:seed` (dist de las 19:56Z); `node dist/main.js` con `NODE_ENV=production` |
| Base | Contenedor **nuevo** `agro_a_f10int_pg` (postgres:16-alpine, 127.0.0.1:55447, volumen nuevo `agro_a_f10int_pgdata`), base `agro_f10int`. El entorno del turno 2 (`agro_c_f08e2e_pg`, 55446) y su carpeta se conservan sin cambios |
| Migraciones | `prisma migrate deploy` a las 20:00:40Z: **10 aplicadas, en orden**, de `20260618010000_init_expanded_flow` a `20261016181000_f08_backup_metadata` (la 8.ª es `20261016150500_f07_pol_01_release_item_quantity` y la 9.ª `20261016162158_f07_joint_purchase_proposal`) |
| Respaldos | `BACKUP_STORAGE_DIR` propio del entorno; `BACKUP_PRODUCTION_ADMISSION=enabled` **sólo** en este entorno desechable y sintético |
| Herramientas | `tool/f08_bkp/api_preflight.cjs` de Mobile `main` (último cambio `e5a1364`, SHA-256 `8e369397…1679`), sin modificar; `tool/f10_s18/api_headers_check.cjs` de Mobile `63fcf65` (SHA-256 `1f4b4ecf…2309`) |
| Cuentas | Sintéticas del seed, con contraseñas de un solo uso (`credential.sh`); ninguna se imprimió |

## Resultados

**1. Comprobación previa de C, sin cambios, contra la API compilada `e027938`** (20:02:04Z):

```
credential.sh run D credential.sh run E2 credential.sh run ADMIN node ../f08_bkp/api_preflight.cjs http://127.0.0.1:3116
PASS lista inicial del titular: HTTP 200
PASS subida: HTTP 201, SHA-256 confirmado
PASS la copia aparece en la lista del titular
PASS descarga: HTTP 200, bytes y cabecera SHA-256 iguales
PASS otro agricultor: HTTP 404, igual que una copia inexistente
PASS otro agricultor no ve la copia en su lista
PASS Administrador: HTTP 403
PASS cuerpo application/json: HTTP 415, 415 cerrado sin eco
PASS cuerpo application/x-www-form-urlencoded: HTTP 415, 415 cerrado sin eco
PASS SHA-256 incorrecto: HTTP 422
PASS eliminación: HTTP 204; después HTTP 404
PASS almacenamiento: 0 objeto(s) para 0 copia(s) disponibles; staging vacío
Comprobación previa: todo PASS
```

**2. Cabeceras de la guarda (cambio de `main.ts`).** `credential.sh run D node ../f10_s18/api_headers_check.cjs <api> http://127.0.0.1`:

| Comprobación | `e027938` (20:03:03Z) | `a45ab83` (control, 20:04Z) |
|---|---|---|
| 415 cerrado sin eco con origen permitido | PASS | PASS |
| Ese 415 lleva `Access-Control-Allow-Origin` del origen permitido | **PASS** | **FAIL** |
| Ese 415 lleva `X-Content-Type-Options: nosniff` (helmet) | PASS | PASS |
| Origen no permitido: 415 sin `Access-Control-Allow-Origin` | PASS | PASS |
| Preflight CORS 204 con el origen permitido | PASS | PASS |
| Total | 5/5 | 4/5 |

El control con `a45ab83` se arrancó en el puerto 3118 sobre la misma base, con su `dist` compilado del turno 2, sólo para esta comprobación, y se detuvo después. Helmet ya precedía a la guarda en `a45ab83`; sólo la línea de CORS discrimina el cambio.

**3. Producción cerrada sin admisión explícita.** `e027938` arrancado en el puerto 3118 con `NODE_ENV=production` y **sin** `BACKUP_PRODUCTION_ADMISSION` (20:05Z): `api_preflight.cjs --expect-closed` → `PASS producción sin admisión: lista HTTP 503, subida HTTP 503`. No se creó la carpeta de almacenamiento. Detenido después.

**4. Suites PostgreSQL sobre `e027938`**, en una base de pruebas aparte (`agro_f10int_pgtest`, mismo contenedor, migrada desde cero):

| Suite | Resultado |
|---|---|
| `backups.postgres.spec.ts` (incluye la relectura tras el fallo ambiguo) | 22/22 |
| `sync-v1-journal.postgres.spec.ts` (journal con 10 migraciones) | 30/30 |
| `sync-v1-adversarial.postgres.spec.ts` | 41/41 |

**5. Subida, listado y descarga desde la app contra `e027938`** (durante la tanda 1 de #18, Mobile `4f203c7`, copias aisladas `.f10s18a` y `.f10s18b` en el POCO X5 Pro 5G, Android 12):

| Paso | Observado |
|---|---|
| Subida desde `.f10s18a` | 21:10:14Z `POST /me/backups` **201** y `GET /me/backups` 200; mensaje con la copia de 8 KB y su SHA-256. Ningún push (un fallo de protección `hold-push-request` armado durante la subida no se consumió) |
| Servidor | 1 copia AVAILABLE (7905 bytes): archivo presente, **tamaño y SHA-256 iguales** a los metadatos; staging vacío |
| Listado y descarga en `.f10s18b` (misma cuenta, registro nuevo) | 21:12:12Z `GET /me/backups` 200; 21:12:30Z `GET /me/backups/{id}/content` **200**; la app verificó el SHA-256 antes de pedir confirmación |
| Restauración | Confirmada; **ningún `POST /sync/v1/push`** durante la descarga ni la restauración; la copia B quedó con las 5 intenciones ACKED de la copia A |

Detalle de la sesión: Mobile `docs/evidence/F05_SYNC_06_DEVICE_F10.md` (PR MOB #94).

## Lo que esta comprobación no cubre

- No repite el E2E completo del turno 2 (29 tablas, 3 fotos, instalación limpia): **no hace falta** según las decisiones de F10, y ese PASS sigue registrado sobre `a45ab83`.
- No mide el rollback ante un fallo a mitad de la restauración ni el rechazo de copias ajenas, alteradas o con expansión excesiva en el dispositivo: dependen de la corrección del rollback WAL y de la extracción acotada (MOB #91 y #92), y de su comprobación focalizada en el POCO.
