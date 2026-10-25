# DS-UX Central/Web — generador, oráculo y contraste (F10 usabilidad, RNF-07)

Herramienta de evaluación del protocolo F10 v1.4 §3.3.1 y de `docs/evaluation/usabilidad/09_fixture_y_valores_esperados.md` §3–§4. No es parte de la aplicación. Datos **sintéticos**; ninguna protección de la política se desactiva.

| Archivo | Qué hace |
|---|---|
| `Back/scripts/f10-dsux-central-seed.cjs` | Generador. Destino `web` (tenant de la evaluación Web) o `movil` (tenant de las sesiones Móvil). Semilla 20261018; día de sesión como parámetro |
| `oraculo_web.json` | Oráculo **escrito a mano** con la composición fijada por Roderich Rendón (2026-10-18) y los valores esperados antes de W3, tras W3 (en los dos sentidos de la asociación) y tras W4. El generador no lo lee |
| `oraculo_check.py` | Recalcula con la biblioteca estándar los valores esperados desde la tabla del oráculo y la regla k = 3; con un manifiesto, comprueba que el generador sembró exactamente esa tabla |
| `contraste.mjs` | Contrasta el oráculo con la API y con la Web compiladas en un tenant de **verificación**: lectura de W1/W2, W3 y W4 por la interfaz, y el CSV del borrador |
| `run-dsux.sh` | Verificación completa en una base nueva del contenedor propio: siembra VER1, VER2 y MOVVER, comprueba que repetir una etiqueta se niega, ejecuta el oráculo y los dos contrastes. Exige `F10_UX_SESSION_DATE` explícita |
| `session-date.sh`, `test-session-date.sh` | El día de sesión obligatorio (formato AAAA-MM-DD y fecha real, sin valor por defecto) y su prueba mínima, sin PostgreSQL ni Web |
| `test-seed-session-date.sh` | Prueba mínima, sin PostgreSQL, de la misma validación dentro del generador (destinos `web` y `movil`): una fecha inválida termina antes de conectar o escribir |

## Composición Web (fijada)

Campaña «Verano Demo» (ABIERTA, desde el día de sesión − 30, sin fin). Productos en L: «Glifosato Demo», «Bellator», «Belator» (sin asociar). Seis AGRICULTOR M1–M6 y ningún otro; una cuenta DIRECTIVA y una ADMINISTRADOR (ADR-003). Necesidades declaradas, publicadas por `POST /api/v1/sync/v1/push`:

| Producto | M1 | M2 | M3 | M4 | M5 | M6 | Total |
|---|---|---|---|---|---|---|---|
| Glifosato Demo | 20 L | 35 L | 45 L | 50 L | — | — | 150 L |
| Bellator | 3 L | 4 L | 5 L | — | — | — | 12 L |
| Belator | 1 L | 2 L | 3 L | — | — | — | 6 L |

Cobertura esperada **«4 de 6»** antes y después de W3. Tras W3, **18 L con 3 aportantes** bajo el nombre canónico que elija el participante; la otra denominación queda sin cifra propia.

## Restablecer el tenant Web antes de cada participante

No se borra nada. Las asociaciones y las divulgaciones colectivas no admiten `DELETE` (disparadores de la migración `20261016043000_f06_collective_consolidation`). «Restablecer» es **sembrar un tenant nuevo** con la etiqueta del participante; los anteriores se conservan intactos y aislados por tenant. El generador se niega si la etiqueta ya existe.

```bash
cd Back
F10_UX_SYNTHETIC_SEED=yes F10_UX_TARGET=web F10_UX_LABEL=D01 F10_UX_SESSION_DATE=2026-10-20 \
F10_UX_MANIFEST=/ruta/manifest-D01.json node scripts/f10-dsux-central-seed.cjs
```

Además, en el proceso: `DATABASE_URL` (base local), `JWT_SECRET` (el de la API en marcha), `API_URL` y `F10_UX_PASSWORD` (la contraseña de las cuentas de Directiva y Administrador). Nada de eso se escribe en disco. La cuenta del participante es `directiva-d01@f10ux.example.test` o `presidente-d01@f10ux.example.test`.

## Tenant Móvil

```bash
F10_UX_SYNTHETIC_SEED=yes F10_UX_TARGET=movil F10_UX_LABEL=MOVIL F10_UX_SESSION_DATE=2026-10-20 \
F10_UX_REFERENCES=/ruta/references.json node scripts/f10-dsux-central-seed.cjs
```

Crea «Verano Demo» (ABIERTA y activa, desde el día de sesión − 30, sin fin), «Glifosato Demo» y «Bellator» activos en L, y las cuentas AGRICULTOR `x01-<etiqueta>@…` y `p01…p05-<etiqueta>@…` (`F10_UX_ACCOUNTS` cambia la lista). Escribe en `F10_UX_REFERENCES` el JSON literal de `GET /api/v1/sync/v1/references` leído con una cuenta propia **del mismo tenant**, que queda revocada y desactivada. Antes de escribirlo comprueba el requisito del generador Móvil (campaña ABIERTA con `accepts_contributions`, período que contiene [sesión − 14, sesión + 30], cada producto una sola vez) y que la campaña y los productos son exactamente los de ese tenant; lo declara en `references.same_tenant_as_accounts`. Esas comprobaciones se hacen sobre la respuesta real de la API, así que ocurren después de crear el tenant: **si alguna falla, no se entrega el JSON y la etiqueta queda consumida con un tenant incompleto; siembre otra etiqueta** (nada se borra).

## Entorno

API con `NODE_ENV=development` y `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic` (desviación declarada del protocolo §0.4, porque F07-POL-01, #107, no está aprobada), limitador intacto. `run-dsux.sh` usa por defecto el contenedor `agro_b_f10ux_pg` (127.0.0.1:55459), API 3138 y Web 4179.

**Día de sesión obligatorio** (decisión de Roderich Rendón, 2026-10-24): `F10_UX_SESSION_DATE=AAAA-MM-DD` siempre explícita y una fecha de calendario real; la misma en Central y en Mobile. No hay valor por defecto: ni de la zona horaria ni del reloj del entorno. Si falta o no es válida, `run-dsux.sh` termina con código 2 y un mensaje claro, antes de crear nada. Hasta el 2026-10-24 el valor por defecto era `TZ=America/La_Paz date +%F`, que en el Git Bash sin tzdata daba la fecha UTC (`F10_DSUX_CENTRAL_VERIFICACION_4BCB1EA.md` §5.1).

**El generador valida la fecha por sí mismo** (decisión de Roderich Rendón, 2026-10-25). Exige una fecha de calendario real por ida y vuelta exacta en UTC, sin normalizar: rechaza 2026-02-31 y 2026-02-29, y acepta 2024-02-29. Lo hace para los dos destinos, antes de cualquier conexión o escritura. Hasta el 2026-10-25 usaba `Date.parse`, que aceptaba 2026-02-31 y lo llevaba al 3 de marzo. **Sólo cambia la validación de entrada:** con una fecha válida, el contenido sembrado es el mismo. Las ejecuciones anteriores se sembraron con el blob `bb01c6c1…` y no se regeneran.

## Lo que no hace

- No contacta a nadie, no ejecuta sesiones ni produce resultados de usabilidad.
- No borra tenants, asociaciones, divulgaciones ni borradores.
- No toca el teléfono (generador Móvil de la sesión C, `tool/f10_ux/` del repositorio Mobile).
