# Reparación gobernada del BOM de la migración inicial

> **THIS IS A GOVERNED MIGRATION-HISTORY REPAIR.**

## Identidad

- Issue: Backend [#86](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/86).
- Rama: `fix/initial-migration-bom`.
- Baseline: `main@122cfefae3fb3992309fb2738be23da3778ede95`.
- Archivo: `Back/prisma/migrations/20260618010000_init_expanded_flow/migration.sql`.
- PR: pendiente de registrar después del push.

## Problema

La migración inicial comenzaba con un UTF-8 BOM. PostgreSQL interpretaba `U+FEFF` como un token
inválido y un `prisma migrate deploy` fresh fallaba con Prisma `P3018` y PostgreSQL `42601` antes de
aplicar el schema. El defecto es preexistente y fue descubierto al validar F02-A; no fue originado por
el modelo Member.

## Cambio byte-level

| Medida | Antes | Después |
|---|---|---|
| Tamaño | 37.017 bytes | 37.014 bytes |
| Primeros bytes | `EF BB BF 2D 2D 20 43 72` | `2D 2D 20 43 72 65 61 74` |
| SHA-256 | `2a82ff83de280bb5daa7f772bb57146dce95010a682efc31e8cca4776bd15a39` | `6043a8dc16b726dfe0cc098d2c4fa2ebba369b40440af276c5fb6e13baf90546` |
| Git blob | `2724d14b7b38de3e001e0e1480e6e22bfc346317` | `93038619866c8187efe90f10047b8c5fb755442c` |

Se eliminaron exclusivamente los bytes `EF BB BF` del comienzo mediante una operación binaria
controlada. No se ejecutó formatter sobre el archivo.

Validaciones:

- `fixed_bytes == original_bytes[3:]`: `TRUE`.
- texto original decodificado como UTF-8 después del BOM == texto reparado: `TRUE`.
- tamaño nuevo == tamaño anterior - 3: `TRUE`.
- SQL, espacios, tabs, comentarios y line endings restantes: byte-for-byte idénticos.

El checksum cambia de forma explícita. Git conserva la versión previa y el blob histórico anterior.
No se oculta ni se presenta como una nueva migración funcional.

## Fresh deploy

Entorno desechable: PostgreSQL 16, DB vacía `repair_fresh` dentro del contenedor temporal
`agro-bom-repair-pg-20260923`.

Resultados desde la rama reparada:

| Verificación | Resultado |
|---|---|
| `npx prisma migrate deploy` | `PASS`, exit 0; aplicó `20260618010000_init_expanded_flow` |
| `npx prisma migrate status` | `PASS`, exit 0; `Database schema is up to date!` |
| `npx prisma validate` | `PASS`, exit 0 |
| `npx prisma generate` | `PASS`, exit 0; Prisma Client 6.19.3 |
| migraciones terminadas | 1 |
| tabla `User` | presente |
| tabla `Member` | ausente, correcto porque esta rama parte de main pre-F02-A |

No apareció `P3018`, `42601` ni un error cerca de `U+FEFF`.

## Compatibilidad con historial aplicado

Entorno desechable separado: DB `repair_compat`.

Procedimiento:

1. Se aplicó el SQL histórico sin BOM sólo en memoria para construir el schema.
2. Desde el worktree baseline original, Prisma `migrate resolve --applied` registró
   `20260618010000_init_expanded_flow`.
3. `_prisma_migrations.checksum` quedó con el SHA-256 original
   `2a82ff83de280bb5daa7f772bb57146dce95010a682efc31e8cca4776bd15a39`.
4. Desde la rama reparada se ejecutaron `migrate status` y `migrate deploy`.

Resultado exacto con Prisma 6.19.3:

- `migrate status`: exit 0, `Database schema is up to date!`.
- `migrate deploy`: exit 0, `No pending migrations to apply.`.
- no reportó migration modified, checksum mismatch, warning ni error sobre la migración reparada;
- el checksum almacenado en la DB permaneció con el valor original;
- la única advertencia fue la deprecación existente de `package.json#prisma`, no relacionada con el
  checksum ni con el BOM.

No se editó manualmente `_prisma_migrations` ni se utilizó una DB real.

## Alcance e integridad

- `schema.prisma`: sin cambios.
- otras migraciones: sin cambios.
- código de producto: sin cambios.
- datos reales/producción: no utilizados ni modificados.
- F02-A y Member: no incluidos en esta rama.
- #81: no ejecutado ni desbloqueado.

## Implicación de checksum

La reparación cambia el checksum del archivo versionado. Una DB que registró el checksum original
continúa siendo aceptada por `migrate status` y `migrate deploy` en la versión Prisma probada, pero el
registro conserva el checksum anterior. Esta evidencia describe Prisma 6.19.3; una actualización mayor
de Prisma debe repetir el escenario antes del despliegue.

## Riesgos residuales

1. Herramientas o versiones futuras de Prisma podrían aplicar una política distinta al checksum de una
   migración ya registrada.
2. Entornos que nunca registraron la migración pero tienen schema manual requieren un procedimiento de
   baselining explícito; esta PR no lo automatiza.
3. La reparación debe fusionarse antes de revalidar el fresh deploy completo de PR #85.

## Dictamen

La modificación cumple el control mínimo: exactamente tres bytes eliminados, SQL restante idéntico,
fresh deploy correcto y compatibilidad de historial aplicado entendida y reproducida. La reparación no
cambia el schema semántico ni el comportamiento del producto.
