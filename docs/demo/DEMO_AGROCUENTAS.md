# DEMO de Agrocuentas: Web, móvil y Backend juntos (datos sintéticos)

**Qué es.** Un entorno de **demostración** aislado y reproducible. Todos sus datos son **sintéticos**. Lo forman:
- el Backend real (`Back/`, `node dist/main.js`, con su trabajador de estimación) sobre una base propia;
- la Web institucional en el navegador;
- la app en un **emulador Android**, con un paquete propio.

**Qué no es.**
- No usa bases del piloto, datos personales, credenciales productivas ni buckets.
- No sustituye ninguna prueba en teléfono físico (POCO o HONOR).
- No añade atajos al código productivo.

Se identifica como DEMO de tres maneras:
- el tenant se llama «Sindicato DEMO · datos sintéticos»;
- campañas, personas y productos llevan «(DEMO)»;
- el paquete Android es `.demo`, con el nombre «AC DEMO».

Además, la Web muestra su propio aviso «Modo provisional con datos sintéticos».

## 1. Piezas y puertos

| Pieza | Dónde | Puerto | Guion |
|---|---|---|---|
| PostgreSQL 16.13 | contenedor `agro_demo_pg`, volumen **persistente** `agro_demo_pgdata`, base `agro_demo` | 127.0.0.1:55500 | `tool/demo/demo.sh` |
| API (Backend real) | `Back/dist` | 127.0.0.1:3330 | ídem |
| Web (Vite, con proxy a la API) | `Web/` | http://127.0.0.1:5190 | ídem |
| Observador y túnel HTTPS temporal | Mobile `tool/f03_res_01/` | observador 3331 | Mobile `tool/demo/demo-mobile.sh tunnel` |
| App | emulador `Pixel_8` (x86_64), paquete `com.comunidad.agro.agroquimicos.demo` | — | Mobile `tool/demo/demo-mobile.sh` |

**Variables de la API.**
- `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic`: el umbral provisional k = 3 **no se cambia**.
- `COLLECTIVE_SEALING=enabled`, `SYNC_V1_PRODUCTION_ADMISSION=enabled` y `BACKUP_PRODUCTION_ADMISSION=disabled`.
- **Secretos** (JWT y huella de sync): se generan con `openssl` en cada arranque y sólo viven en la memoria del supervisor.

**Por qué hace falta el túnel.** La app exige un origen **https** (`api_endpoint_config.dart`) y lo fija al compilar. Si cambia el túnel, hay que recompilar desde el mismo SHA. `adb install -r` conserva los datos.

## 2. Arrancar, sembrar, verificar y reiniciar

Desde la raíz del worktree del Backend (rama `demo/oe3-demostracion`), con Docker y Node instalados y `Back/` compilado (`npm ci && npx prisma generate && npm run build`), y `Web/` con `npm ci`.

```bash
bash tool/demo/demo.sh up &        # supervisor: base, migraciones, identidad, API y Web («listo» en %TEMP%/agro_demo/supervisor.log)
bash tool/demo/demo.sh seed        # siembra central por la API real (idempotente)
bash tool/demo/demo.sh verify      # resumen verificable (ver §5)
bash tool/demo/demo.sh status
bash tool/demo/demo.sh password directiva   # contraseña nueva de un solo uso, al PORTAPAPELES (no se imprime)
bash tool/demo/demo.sh down        # detiene Web, API y contenedor; los datos se conservan
bash tool/demo/demo.sh reset       # sólo con la DEMO en marcha: comprueba la identidad y pide CONFIRMAR
```

**Móvil.** Desde el worktree Mobile (rama `demo/oe3-demostracion`), con el emulador arrancado, la zona horaria fijada (`adb shell service call alarm 3 s16 America/La_Paz`) y la DEMO en marcha:

```bash
bash tool/demo/demo-mobile.sh tunnel
bash tool/demo/demo-mobile.sh build "$(git rev-parse HEAD)"   # árbol limpio; APK x86_64 con el origen del túnel
bash tool/demo/demo-mobile.sh install
```

**Primera vez** (en la app):
1. «Activar en línea».
2. Correo `agricultor1.demo@example.test`.
3. Con el foco en el campo de contraseña: `bash ../DEMO-BE/tool/demo/demo.sh credential agricultor1`. Teclea una contraseña de un solo uso **sólo** si el campo enfocado es de contraseña.
4. «Activar».
5. «Crear el titular»: `Ana Quispe DEMO`, modo **Compartido**.
6. «Ahora no» (sin PIN).

Después:

```bash
DEMO_DATE=$(TZ=America/La_Paz date +%F) bash tool/demo/demo-mobile.sh seed-local   # siembra local con el código de la app
```

**Volver a levantarla** otro día:
1. `demo.sh up`. La base persiste y `seed` no duplica nada.
2. `demo-mobile.sh tunnel`, `build` e `install`. Se conservan los datos de la app.
3. En la app, «Verificar acceso en línea» o «Sincronizar ahora» renuevan la sesión.

**Límite al reiniciar:** el secreto de huella cambia en cada arranque. Las operaciones nuevas no se ven afectadas, pero el reenvío de una operación anterior al reinicio no se reconoce como idéntica. Por eso la siembra consulta primero `GET /sync/v1/operations/{id}` y no reenvía lo que Central ya tiene.

## 3. Identidades y roles (sin secretos)

| Identidad | Correo | Rol | Uso en la DEMO |
|---|---|---|---|
| Administración DEMO | `admin.demo@example.test` | ADMINISTRADOR | Altas de usuarios por `POST /users`. Creada directamente, porque no hay API para el primero |
| Directiva DEMO | `directiva.demo@example.test` | DIRECTIVA | Web: consolidado, propuesta, sellado, temporadas y estimación |
| Ana Quispe (sintética) | `agricultor1.demo@example.test` | AGRICULTOR | **Emulador**: titular «Ana Quispe DEMO» |
| Beto Mamani, Carmen Choque, Darío Flores, Elena Condori y Fabián Rojas (sintéticos) | `agricultor2…6.demo@example.test` | AGRICULTOR | Instalaciones con guion: consumo histórico y necesidades |

**Contraseñas:** no existen fuera de la memoria de cada orden. `demo.sh password <rol>` (roles `admin`, `directiva` y `agricultor1` a `agricultor6`) fija una nueva de un solo uso y la copia al portapapeles. El rol de Agricultor no entra en la Web institucional: va a `/sin-acceso-web`.

## 4. Qué se siembra y cómo

### Central (API real; directo sólo el arranque de identidad)

| Dato | Cómo |
|---|---|
| Tenant `demo-sintetico` y Administrador | **Directo** (`demo-central.cjs bootstrap`): no hay API |
| Directiva y 6 agricultores | `POST /users` (Administrador) |
| Productos «Herbicida DEMO», «Fungicida DEMO» e «Insecticida DEMO» (L) | `POST /inventory/products` |
| Temporada `invierno` | `POST /estimation/seasons` |
| «Invierno 2015» a «Invierno 2018 (DEMO)» | Por cada una: `POST /campaigns`, `…/open`, 3 agricultores con `POST /sync/v1/push` CONSUMPTION_TOTAL, `…/close` y `GET`/`POST /collective/campaigns/:id/seal`. **Herbicida:** 96, 120, 104 y 116 L (32+32+32, 40+40+40, 34+35+35, 38+39+39). **Fungicida:** sólo 2017 (30 L) y 2018 (36 L) |
| «Invierno 2026 (DEMO)», abierta | `POST /campaigns` (inicio: fecha de DEMO − 20 días; fin previsto: + 130) y `…/open` |
| Clasificación de las 5 campañas en `invierno` | `POST /estimation/campaign-classifications` |
| Necesidades de 2026 | `POST /sync/v1/push` DECLARED_NEED. **Herbicida:** 5 agricultores, 250 L. **Fungicida:** 2, 35 L, bajo el umbral. **Insecticida:** 1, 10 L, bajo el umbral |

**Semilla determinista:** `DEMO_SEED`, por defecto `agrocuentas-demo-1`. Los ids de operación y de cliente derivan de ella. Las fechas son relativas a `DEMO_DATE`, por defecto hoy en La Paz.

**No se insertan** ACK, sellados, trabajos ni estimaciones. La estimación la pide la Directiva y la calcula el trabajador real.

### Local (app del emulador; directo con el código de la app)

`tool/demo/seed_demo_mobile.dart` (Mobile) actúa sobre la copia de la base extraída **después** de activar y crear el titular en la interfaz.
- **Con `AgroRepository`:** personas, proveedor, chacos, campaña, productos, 3 compras, pagos, 2 aplicaciones, 1 transferencia y 2 pagos de cuenta.
- **Con `CentralBindingStore`:** los vínculos con el sindicato.
- **Niveles mínimos:** con el método de pruebas sin PIN.

Se niega a sembrar dos veces y comprueba: `integrity_check`, ninguna intención de sync nueva, ningún lote negativo, existencias por persona y totales.

| Local | Valor |
|---|---|
| Personas | Ana (titular), Beto Mamani (familiar, cobro por consumo) y Carmen Choque (tercera, cobro por compra) |
| Compras | DEMO-001: Herbicida 20 L a 120 Bs, **pagada**. DEMO-002: Fungicida 10 L + Insecticida 4 L, **saldo pendiente** (pago parcial de 600 Bs). DEMO-003: Herbicida 5 L, **sin pagar** |
| Lotes | Vencido (Insecticida, venció ayer), vence hoy (Fungicida), próximo (Herbicida, +15 días) y sin fecha (DEMO-003) |
| Aplicaciones y transferencia | Ana, Herbicida 6 L; Beto, Herbicida 5 L; Ana → Beto, Fungicida 2 L |
| Cuentas | Beto: cargo por consumo y pago de 200 Bs. Carmen: cargo por compra y pago de 150 Bs |
| Existencias (mL) | Herbicida 14 000 (Ana 11 000, Beto 3 000); Fungicida 10 000 (Ana 8 000, Beto 2 000); Insecticida 4 000 (Carmen) |
| Bajas | Insecticida **en total** (4 L < 5 L); Herbicida **para Beto** (3 L < 4 L) |

## 5. Resumen verificable (`demo.sh verify`, 2026-11-04 00:00Z)

```
Members activos: AGRICULTOR 6, DIRECTIVA 1, ADMINISTRADOR 1
Invierno 2015…2018 (DEMO): CERRADA, sellada · Invierno 2026 (DEMO): ABIERTA
Fungicida DEMO · DECLARED_NEED: DISCLOSED 53 L · aportantes 3      (tras la publicación del emulador)
Herbicida DEMO · DECLARED_NEED: DISCLOSED 250 L · aportantes 5
Insecticida DEMO · DECLARED_NEED: SUPPRESSED_UNDER_THRESHOLD (sin cifra)
aportaciones: DECLARED_NEED ACTIVE 9, CONSUMPTION_TOTAL ACTIVE 18 · sellados: 4
```

La siembra se ejecutó tres veces. Los recuentos coinciden: la segunda y la tercera no crearon usuarios, campañas, sellados ni operaciones.

## 6. Guion de presentación (unos 10 minutos)

| # | Pantalla | Qué hacer | Qué se espera |
|---|---|---|---|
| 1 | App: Inicio | Mostrar el resumen | Compras 4.885 Bs; pagado 3.000 Bs; por cobrar: familias 400 Bs y terceros 210 Bs |
| 2 | App: Inventario › Avisos de inventario | Abrir | 1 vencido, 2 vencen hoy, 2 próximos, 1 bajo en el total, 3 bajos por responsable, 1 sin fecha |
| 3 | App | `demo-mobile.sh net off` (**desconexión real del emulador**) y declarar Fungicida 18 L en Operaciones › Planificación › Necesidad declarada | «Guardada, pendiente de envío» |
| 4 | App | Cerrar y reabrir la app | La necesidad sigue pendiente, sin peticiones |
| 5 | App | `net on`, y en Inicio › Enviar al sindicato, «Sincronizar ahora» | «Aceptado por el sindicato». En el observador, `push 200 APPLIED/OK` |
| 6 | Web: `/colectivo/resumen` (Directiva) | Abrir | Fungicida pasa de oculto a **53 L, 3 aportantes**. Herbicida 250 L. Insecticida oculto. Ningún nombre de agricultor |
| 7 | Web: `/colectivo/propuestas` | «Generar propuesta (borrador)» y «Exportar CSV» | Herbicida 250 L y Fungicida 53 L. CSV sin datos individuales |
| 8 | Web: `/colectivo/estimacion` | «Generar estimación» | Herbicida: SES **111 L**, naive **116 L**, α 0,50, serie 96 · 120 · 104 · 116. Fungicida: **Datos insuficientes**, sin cifra |
| 9 | Web | «Descargar copia…» y, con el navegador desconectado (desconexión **simulada** del navegador), volver a elegir la campaña | La copia institucional muestra 111 L |
| 10 | App: Inventario › Estimación del consumo | «Consultar con conexión», elegir la campaña y «Descargar copia» | Sólo la estimación (111 L), sin naive ni cobertura: perfil del Agricultor |
| 11 | App | `net off`, cerrar y reabrir; abrir la estimación | La copia descargada, con «Vigencia actual: desconocida sin conexión» |
| 12 | Web: `/colectivo/resumen` | Volver | Las necesidades siguen en 250 L y 53 L: la estimación no se suma |

## 7. Evidencia del ensayo (2026-11-03)

- **Mobile:** `docs/evidence/OE3_DEMO_2026-11-03.md` y `docs/evidence/oe3_demo/`, con las capturas del emulador.
- **Backend:** `docs/demo/capturas/`, con las capturas de la Web y el CSV de la propuesta.

## 8. Limitaciones

- **Dispositivo:** el emulador no es un teléfono físico. Lo que exige POCO o HONOR sigue pendiente (inventario de OE3).
- **Túnel:** es un *quick tunnel* de Cloudflare, temporal; cada arranque obliga a recompilar la APK.
- **Arranque directo:** la creación directa del tenant y del primer Administrador, y la contraseña de un solo uso del Administrador fijada en la base desechable.
- **Siembra local directa:** con el código de la app, pero sin la interfaz; los niveles mínimos sin PIN.
- **Trabajos de estimación:** cada «Generar estimación» crea un trabajo nuevo. Son registros que sólo se añaden, sin efecto sobre las cifras.
- **Copia de la Web sin conexión:** sólo la lee la sesión que la descargó. Al recargar sin red, la PWA necesita su service worker, que el recorrido automático desactiva.
