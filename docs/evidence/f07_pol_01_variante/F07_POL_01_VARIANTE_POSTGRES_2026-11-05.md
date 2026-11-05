# Variante «threshold-only» de la necesidad declarada: prueba PostgreSQL automática. Verificada el 2026-11-05

- **Rama:** `test/f07-variante-necesidad-postgres`, creada sobre `feat/f07-variante-necesidad-inmediata` (PR #204, `13afdc9`).
- **Commit verificado:** `24f604f`. Sólo añade pruebas y un paso de CI; no cambia código de producción.
- **Origen:** `Live`. Lo pidió Roderich Rendón el 2026-11-05.
- **Estado:** la variante sigue **experimental y apagada**. #107 sigue abierto. En producción, `CollectiveConfig` la ignora.

## 1. Por qué una rama encima del PR #204

Antes de implementar nada se comprobó si otra sesión ya trabajaba en la regla acordada:
- el PR #204 (en borrador) ya la implementa;
- su ensayo manual contra una copia de la DEMO está en [F07_POL_01_VARIANTE_NECESIDAD_2026-11-05.md](F07_POL_01_VARIANTE_NECESIDAD_2026-11-05.md).

Por eso esta rama **no reimplementa nada**. Añade la prueba automática que faltaba y cubre dos huecos que ese documento declara en su §4: el sellado con la variante activa y los borradores guardados. No se editó el worktree de la otra sesión (`_wt/B-POL-VARIANTE`) ni sus copias (55510 y 55511).

## 2. Entorno

- **Base:** PostgreSQL propia y desechable (contenedor `postgres:16` en 127.0.0.1:55520), con una base nueva y migrada en cada suite.
- **Datos:** sólo sintéticos, creados por la propia prueba.
- **Flujo:** cada aporte es un `POST /api/v1/sync/v1/push` real de un agricultor sintético; cada lectura es un `GET /collective/campaigns/:id/summary` como Directiva.
- **Variables:** `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic`, `COLLECTIVE_DECLARED_NEED_RULE=threshold-only`, `COLLECTIVE_SEALING=enabled`. `NODE_ENV=test`.

## 3. Qué fija `f07-pol-01-variante-necesidad.postgres.spec.ts`

| Paso | Necesidad declarada que ve la Directiva |
|---|---|
| A1 10 L | oculta (`SUPPRESSED_UNDER_THRESHOLD`, sin cifra ni conteo) |
| + A2 15 L | oculta |
| + A3 5 L | **30 L · 3** |
| Borrador generado | línea de 30 L · 3 |
| + A4 8 L (aporte nuevo aceptado) | **38 L · 4**, sin cambios pendientes, en la lectura siguiente y sin ninguna otra acción |
| Reenvío de A4 (mismo `operationId`) | ACK `ALREADY_APPLIED`. Sigue en 38 L · 4: hay 4 contribuciones `ACTIVE` y ninguna divulgación nueva |
| `CANCEL` de A4 | 30 L · 3 |
| `CANCEL` de A3 (quedan dos) | oculta; la cifra vigente se retira (`withdrawnAt`) |

**Deducción del incremento:**
- La prueba comprueba que las dos divulgaciones consecutivas guardadas son 30 000 mL · 3 y 38 000 mL · 4.
- Su diferencia, **8 000 mL**, es exactamente la necesidad declarada por el cuarto agricultor.
- Cualquier lector autorizado que guarde la cifra anterior obtiene ese aporte individual comparando los dos totales.
- Es el coste que #107 debe sopesar: la §12 de la política ya lo dice. La consulta de agricultores de F07-WEB-03 (rama `feat/directiva-agricultores-sincronizacion`) agrava este coste, porque además indica quién tuvo un envío aceptado en ese intervalo.

**Lo que no cambia:**

| Elemento | Comprobación |
|---|---|
| **Consumo registrado** | La misma secuencia en `CONSUMPTION_TOTAL` sigue en 30 L · 3 **con cambios pendientes** tras el cuarto (regla de combinaciones) |
| **Sellado** | Cifra 30 L publicada; llega el cuarto y nadie lee antes de cerrar; se cierra la campaña, se revisa y se sella. La versión sellada guarda 30 L · 3 con cambios pendientes, **nunca 38 L**: no existe ninguna divulgación de 38 000 mL en esa campaña. Con la variante activa, el resumen se sirve desde la versión sellada |
| **Borradores ya guardados** | Las filas de `JointPurchaseProposalLine` del borrador generado con 30 L son idénticas antes y después. Al leerlo, la línea queda `SUPERSEDED`, sin cantidad: es la regla vigente, un borrador sólo sirve la cifra que el resumen muestra ahora |
| **Estimación** | Sin prueba nueva. Por código (`consumption-series.use-case.ts`), sólo lee entradas `CONSUMPTION_TOTAL` de versiones selladas, y la variante no toca ni el consumo ni el sellado |
| **Producción** | `collective-config.spec.ts`: `combinations` por defecto y para valores desconocidos (p. ej. `THRESHOLD-ONLY`), y también con `NODE_ENV=production`, aunque se pidan `provisional-synthetic` y `threshold-only` |

## 4. Comprobaciones (en `Back/`, sobre `24f604f`)

| Comando | Resultado | Hora (UTC) |
|---|---|---|
| `F07_WEB_PG_TEST_URL=<base aislada> npx jest f07-pol-01-variante-necesidad.postgres.spec.ts --runInBand` | **3/3** | 2026-11-05 17:16–17:18Z (tras corregir dos aserciones mías: `close` responde 200, y sólo se retira la divulgación vigente) |
| Las 5 suites PostgreSQL relacionadas: `f07-pol-01-variante-necesidad`, `f07-acceptance`, `f07-web-proposal`, `f07-collective-seal` y `f10-sec-02-disclosure-gaps` | 5 suites, **45/45** | 17:20:03–17:22:01Z |
| `npx jest src/modules/collective --testPathIgnorePatterns postgres` | 5 suites, **57/57** (55 del PR #204 + 2 nuevas) | 17:18:47Z |
| `npm run build` | OK | 17:19Z |
| `npx eslint` sobre los dos archivos de prueba tocados | 0 problemas | 17:19:56Z |
| **Mutación del sellado:** quitar `declaredNeedRule: "combinations"`, con lo que sella con la regla configurada | La prueba del sellado **falla** | 17:17Z |
| **Mutación del consumo:** aplicar la variante también a `CONSUMPTION_TOTAL` | La prueba del consumo **falla** | 17:18Z |

Las dos mutaciones se revirtieron con `git checkout`. La CI ejecuta la suite en el job `f07-proposal-postgres` de `.github/workflows/web.yml`.

## 5. Limitaciones

- La cifra se actualiza **en la lectura siguiente** al aporte aceptado. No hay notificación al navegador: la Web la ve al recargar o al volver a consultar.
- Sólo datos sintéticos; k = 3 es provisional. No se ensayó con la Web ni con un dispositivo en esta rama.
- La variante no está activada con datos reales y este lote no la activa.
- No es una revisión de privacidad ni una aprobación. No se cambian `Gate` ni `Evidence` del Project.
