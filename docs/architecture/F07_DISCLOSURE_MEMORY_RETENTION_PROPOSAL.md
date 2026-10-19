# Propuesta de retención de `R_DISCLOSURE_MEMORY` (F07-POL-01, #107)

- **Preparada por:** la sesión A de Claude Code, el 2026-10-19 (America/La_Paz), sobre Backend `main` `769d441`, por el encargo de Roderich Rendón «F07 y F08: umbrales, retención y comprobaciones» (§3). La revisan las sesiones B y C.
- **Qué es:** una **propuesta**, para quien decida la política de datos reales (#107: autor, Directiva y, en su revisión, el tutor). Parte de la clase que creó la enmienda del contrato F06 §7.1 (BE #156, `bb5cd7b`).
- **Qué no es:**
  - no implementa ninguna purga ni cambia código, migraciones o disparadores;
  - no registra ninguna aprobación;
  - no convierte `PERIOD_DELEGATED` en una conservación indefinida autorizada;
  - no fija un número de días.
- **Mientras no se apruebe:**
  - con datos reales **no existe memoria**: el modo es `POLICY_PENDING`, que no crea divulgaciones (`collective-summary.use-case.ts:116-126`);
  - con datos sintéticos rige el contrato §7.1: se conserva durante el ensayo y la evaluación, y se elimina de forma conjunta.

## 1. Qué se conserva, cómo se vincula y quién accede

Comprobado sobre el código de `769d441`, en `Back/prisma/schema.prisma`, `collective-summary.use-case.ts` y `domain/disclosure-policy.ts`.

| Tabla | Campo | ¿Lo usa la prevención de inferencias? |
|---|---|---|
| `CollectiveRelease` | `tenantId`, `campaignId`, `canonicalProductId`, `projectionType`, `baseUnit` (la clave de la celda) | **Sí**: agrupa el historial por celda (`releaseHistories()`) |
| | `totalBase`, `contributorCount`, `dataAsOf`, `releasedAt` | **Sí**: son la cifra ya conocida que se muestra con `SHOW_PRIOR` y la que respalda una línea de propuesta |
| | `withdrawnAt` | **Sí**: una cifra retirada sigue contando, porque pudo conocerse |
| `CollectiveReleaseItem` | `contributionId` | **Sí**: la regla de combinaciones modela cada cifra como la suma de columnas `aportación\|cantidad` y sigue a las aportaciones entre claves (reasociaciones) |
| | `quantityBase` | **Sí**: la regla compara cantidades exactas con aritmética entera. `NULL` (filas anteriores a `20261016150500`) hace que la regla falle cerrada |
| | `sequence` | **No.** Se escribe (`collective-summary.use-case.ts:215`), pero `releaseHistories()` no lo lee y la regla tampoco. **Es un candidato de minimización** (§3, M-1) |
| (vía `contributionId`) | `SyncV1Contribution.memberId` | **Sí**: la regla cuenta Members distintos (`memberOf`) y la cobertura usa los Members de la cifra mostrada |

**Vínculo con el agricultor.** El vínculo es directo: `CollectiveReleaseItem.contributionId` → `SyncV1Contribution.memberId` → `Member`. Mientras exista la aportación, cada cantidad divulgada es atribuible a un Member concreto **dentro del servidor**. La memoria no es anónima (contrato §7.1).

**Otros vínculos:**
- `JointPurchaseProposalLine.releaseId` → `CollectiveRelease` (`onDelete: Restrict`). Las propuestas guardadas siguen mostrando la cifra de la divulgación que las respalda.
- Los disparadores de `20261016043000` impiden borrar `CollectiveRelease` y no admiten UPDATE ni DELETE en `CollectiveReleaseItem`.

**Quién accede:**
- **En la aplicación:** sólo `CollectiveSummaryUseCase`. Lo invocan el resumen (JSON y CSV) y la creación y lectura de propuestas, todos tras DIRECTIVA o ADMINISTRADOR del tenant y con `no-store`. Ninguna API, CSV, pantalla ni log entrega filas de la memoria (contrato §7.1).
- **Fuera de la aplicación:** quien tenga acceso a la base del Central (el operador técnico, una copia de la base o un volcado).
  - Es el **acceso real que importa** para la retención.
  - Hoy no hay copias del Central: el manual técnico §9.3 dice que no existe procedimiento de `pg_dump`/`pg_restore`.

## 2. Qué no se puede hacer, y por qué

| Idea | Por qué no conserva la protección |
|---|---|
| **Borrar la memoria al cerrar la campaña** | Cerrar no detiene los cambios en las cifras de esa campaña:<ul><li>Sync v1 admite CANCEL en una campaña cerrada (`push-operation.use-case.ts:211`);</li><li>las asociaciones canónicas son de todo el tenant y reagrupan también las celdas de campañas cerradas;</li><li>la baja de un Member o de su cuenta, o el cambio de rol (#157), cambian la elegibilidad;</li><li>el resumen se recalcula en **cada lectura**, sea cual sea el estado de la campaña, y puede crear o retirar divulgaciones (`decide()`, que también usa la creación de propuestas).</li></ul>Sin memoria, la siguiente cifra se compararía con nada. Quien guardó la anterior la restaría |
| **Borrar y empezar una línea base nueva** | Un lector puede conservar cifras o CSV anteriores. La diferencia entre una cifra nueva y una que guardó puede aislar a menos de k Members, que es justo lo que impide la regla de combinaciones (F07-POL-01 §9, casos bypass3 y base3). Esto no se propone sin una demostración de que la protección se conserva, y este bloque no la construye |
| **Olvidar divulgaciones de forma selectiva** (p. ej. sólo las retiradas o las más antiguas) | Una cifra retirada ya pudo conocerse. Además, la cobertura de una cifra mostrada con `SHOW_PRIOR` sale de esa memoria (contrato §7.1) |
| **Quitar sólo el vínculo con el Member** mientras sigue habiendo decisiones | La regla necesita saber qué columnas pertenecen al mismo Member para contar grupos de menos de k. Un seudónimo estable por Member conserva esa función, pero no reduce la vinculación dentro del servidor mientras existan las aportaciones (§3, M-3) |

## 3. Alternativas viables

| # | Alternativa | Protección | Minimización | Coste y dependencia |
|---|---|---|---|---|
| **M-0** | Estado actual: se conserva todo, sin plazo | Completa | Ninguna | Ninguno. **No se puede autorizar** para datos reales: no tiene salida |
| **M-1** | Dejar de guardar `sequence` en las filas nuevas | Igual | Pequeña | Una migración expand y un cambio en `provisional()`, con prueba de que la regla no cambia. No toca las filas existentes |
| **M-2 (recomendada)** | **Sellar y después eliminar de forma conjunta por campaña** (§4) | Completa mientras haya decisiones; nula necesidad después | Alta al final de la finalidad | Arquitectura nueva: un estado de sellado, el bloqueo de las decisiones, una eliminación controlada que sustituya a los disparadores y el trato de las propuestas guardadas. Pendiente de diseño, implementación y pruebas |
| **M-3** | Seudonimizar el Member en la memoria al sellar (antes de eliminar las aportaciones), si los reportes de la campaña necesitan conservar las cifras agregadas | Igual (ya no hay decisiones) | Media: las filas agregadas pierden el vínculo con la persona | Complementa a M-2 si se conservan agregados. Un agregado identificable sigue sin contar como anonimización (contrato §7) |
| **M-4** | Agregar por Member en vez de por aportación | **Por demostrar**: con reasociaciones, un Member puede tener dos aportaciones en una celda canónica, y la regla sigue a las aportaciones entre claves | Media | Cambia la regla. Hace falta una demostración y pruebas de equivalencia; no se propone ahora |

## 4. Propuesta (M-2, con M-1 y, si hace falta, M-3)

**Finalidad (exclusiva).** Impedir que una cifra colectiva nueva, combinada con las ya divulgadas, permita inferir el aporte de menos de k agricultores (contrato §7.1). No sirve para reportes, auditoría ni analítica. Si la Directiva quiere conservar cifras agregadas como registro histórico, es **otra** finalidad, que se decide aparte (M-3).

**Minimización:**
1. M-1: no guardar `sequence` en las filas nuevas.
2. No copiar la memoria a otras tablas, logs, exportaciones ni respaldos Mobile. Hoy no se copia; se mantiene así.
3. Al sellar, si se conservan agregados, quitar el vínculo con el Member (M-3).

**Acceso y responsables** (propuesta, pendiente de quien decida):
- **Responsable de la finalidad y del plazo:** el Sindicato, mediante su Directiva, como quien decide la divulgación (preguntas 2(a) y 2(e) de la hoja de revisión).
- **Responsable técnico:** el operador del Central, que ejecuta el sellado y la eliminación con un registro fechado.
- **Mantenimiento del criterio:** el autor (Roderich Rendón) mientras dure el proyecto.
- **Acceso en la aplicación:** sólo el servicio de divulgación, como hoy. **Acceso directo a la base y a sus copias:** sólo el operador, registrado.

**Duración: criterio, no días.** La memoria de una campaña se conserva **mientras el sistema pueda tomar decisiones de divulgación sobre esa campaña**, y termina en su **sellado**.

- **Sellar una campaña** significa que:
  - deja de admitir cambios que muevan sus cifras: CANCEL, reagrupación por asociaciones nuevas y cambios de elegibilidad dejan de afectar a esa campaña;
  - deja de recalcularse: sus lecturas sirven, como mucho, las cifras ya publicadas, marcadas como «archivadas», o nada;
  - no admite propuestas nuevas.
- **Cuándo se sella** (propuesta): al terminar la finalidad de planificación de esa campaña. El momento lo fija la Directiva, por ejemplo, «al cerrar la campaña, más la ventana en que todavía se aceptan correcciones de los agricultores». La duración de esa ventana es una **decisión pendiente**; este documento no la inventa.
- **Plazo máximo:** la memoria no sobrevive a las aportaciones de la campaña. Las dos salen juntas cuando termina la finalidad de campaña y reportes (`R_CURRENT`, contrato §7).

**Por qué este criterio sí conserva la protección:**
- después del sellado no se publica ninguna cifra nueva de esa campaña, así que no hay nada nuevo que restar a las cifras que conserven los lectores;
- la regla trabaja por campaña (`releaseHistories()` filtra por `campaignId`), así que eliminar la memoria de una campaña sellada no debilita las decisiones de otra.

**Condiciones de eliminación** (todas, en este orden):
1. La campaña está sellada y el sellado se comprobó: una lectura posterior no crea ni retira divulgaciones.
2. **Las propuestas guardadas** de esa campaña están archivadas con sus cifras finales, o eliminadas por decisión expresa. Hoy `JointPurchaseProposalLine.releaseId` impide borrar sus divulgaciones.
3. **Eliminación conjunta**, en una transacción y con un registro fechado:
   - todas las filas de `CollectiveReleaseItem` de la campaña;
   - las aportaciones de la campaña según `R_CURRENT`;
   - `CollectiveRelease`, salvo que se decida conservar agregados seudonimizados (M-3).
   Nunca un subconjunto mientras queden decisiones posibles.
4. **Copias del Central:** las que contengan esa memoria caducan dentro del mismo criterio o se tratan como en el §5.
5. **Verificación posterior:** una prueba que lea el resumen y la propuesta de la campaña eliminada y compruebe que no aparece ninguna cifra nueva y que las demás campañas no cambian.

**Consultas, exportaciones y reasociaciones después de eliminar:**
- **Consultas y CSV** de una campaña sellada: estado «archivada», sin recalcular. Nunca se vuelven a calcular cifras a partir de las aportaciones que queden.
- **Reasociaciones canónicas posteriores:** no afectan a las campañas selladas. Es un cambio de código: hoy la asociación vigente reagrupa todas las campañas del tenant.
- **Campañas nuevas:** empiezan sin memoria propia; las cifras de otra campaña no entran en su regla.
- **Exportaciones antiguas** que conserve un lector: no se pueden recuperar ni borrar. El criterio no depende de ellas, porque tras el sellado no hay cifras nuevas con las que combinarlas.

## 5. Copias y recuperación de la memoria

- **No forma parte del respaldo Mobile** (`.agrobackup`, `R_BACKUP_F08`): sólo vive en la base del Central.
- **Copias del Central** (futuras; hoy no existen):
  - contienen la memoria, así que su retención no puede superar la de la memoria;
  - una copia anterior a una eliminación, si se restaura, **resucita** memoria eliminada. Tras restaurar, hay que volver a aplicar las eliminaciones registradas.
- **Restaurar una copia anterior a la última divulgación** borra memoria que sigue siendo necesaria: el sistema «olvidaría» cifras que los lectores ya vieron.
  - Propuesta: tras **cualquier** restauración del Central, la divulgación arranca en `POLICY_PENDING` (falla cerrada).
  - Sólo vuelve a abrirse cuando el operador compruebe que el historial de divulgaciones restaurado no es más corto que el conocido, por ejemplo con el último `releasedAt` y el recuento por campaña anotados fuera de la base.
  - Si no puede comprobarse, se sellan las campañas afectadas antes de reabrir.
- Esto completa la precondición del manual técnico §9.3: un ciclo probado de copia y restauración del Central.

## 6. Dependencias y alternativa mientras no exista el sellado

- **Dependencia de arquitectura:** el sellado, la eliminación controlada que sustituya a los disparadores (una migración, nunca un DROP de datos existentes sin decisión) y el arranque cerrado tras una restauración **no existen**. Hacen falta un diseño, un PR con revisión cruzada y pruebas de mutación: por ejemplo, que quitar el bloqueo de recálculo tras el sellado haga fallar la prueba.
- **Alternativa concreta hasta entonces:**
  - no se admiten datos reales con divulgación (`POLICY_PENDING`, como hoy);
  - si se admitieran antes de tener el sellado, la memoria de una campaña se conserva mientras existan sus aportaciones, y las dos se eliminan juntas en una sola operación autorizada sobre toda la campaña;
  - antes de esa eliminación hay que bloquear las divulgaciones nuevas sobre los datos relacionados. Hoy el único mecanismo es el modo **global** `POLICY_PENDING`, que deja sin cifras a **todas** las campañas del despliegue. Un bloqueo por campaña es parte del sellado y no existe;
  - **no hay** eliminación parcial ni plazo en días mientras no se decida.

## 7. Lo que tiene que decidirse

En la hoja de revisión (`docs/evidence/F07_POL_01_REVISION_INSTITUCIONAL.md` §4 y §5):
- **Autor:**
  - aprobar o no este criterio (M-2) para datos reales, y si se conservan agregados tras el sellado (M-3);
  - fijar la ventana de correcciones antes del sellado;
  - nombrar al responsable técnico.
- **Directiva:** la finalidad, quién decide el sellado de cada campaña, y si las cifras agregadas se conservan como registro histórico y por cuánto tiempo.
- **Tutor:** su revisión, en sus propios términos.

Nada de esto está decidido. #107 sigue abierto y GATE-F07 sigue Pending.
