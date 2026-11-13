# E4 — Acceso por rol y totales sin umbral: Web (sesión B)

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-13 |
| Rama | `feat/acceso-rol-sin-k-b` (worktree `_wt/ACC-B`), desde el hito A0 del Backend `01bcfe2` |
| Commits de código | `8d33f17` (convocatorias por rol), `c9dba19` (vistas colectivas y Excel sin umbral) |
| Contrato | `docs/architecture/E4_ACCESO_POR_ROL_Y_SIN_UMBRAL_CONTRATO.md`; formas de `docs/architecture/E4_EJEMPLOS_RESPUESTAS.md` |
| Estado | Implementado contra los fixtures de A0. **Sin** recorrido con la API real (3400) ni capturas: pendientes de la indicación del orquestador. Sin suite completa ni `vite build` (los corre el orquestador). Gate = Pending |

## 1. Comprobaciones ejecutadas (sobre `c9dba19`, 2026-11-13 16:38 −04:00)

| Comando (en `Web/`) | Resultado |
|---|---|
| `npx tsc -b` | salida 0, sin errores |
| `npx eslint <59 archivos .ts/.tsx cambiados desde 01bcfe2>` | salida 0, sin errores ni avisos |
| `npx vitest run --no-file-parallelism <24 archivos de prueba cambiados o nuevos desde 01bcfe2>` | **24 archivos, 294/294** (53,96 s) |

Los 24 archivos de prueba: `components/b/call-ui`, `components/collective-ui`, `components/needs-bars`, `components/seal-panel`, `components/ui/controls`, `components/ui/status-chip`, `lib/collective-xlsx`, `lib/joint-purchase-xlsx`, `pages/collective-e4` (nuevo), `pages/collective-summary.fixtures`, `.page`, `.v2`, `pages/collective-trends.page`, `pages/history.page`, `pages/joint-proposal.estimation-link`, `.page`, `.reference`, `pages/joint-purchase-call-detail.e4` (nuevo), `.page`, `.rediseno`, `pages/joint-purchase-calls.page`, `.rediseno`, `pages/substitution-permissions-section`, `pages/users.page`.

Cobertura: no se midió en esta sesión (sin `--coverage`); queda para la suite completa del orquestador.

## 2. Qué ve cada rol (según las respuestas del servidor)

| Pantalla | Directiva | Administración |
|---|---|---|
| Detalle, abierta | Productos, estado, fechas, «Total provisional» por producto según la regla T (`VISIBLE`/`ROLE_CONSENT` con cualquier número de personas; `PENDING_CONSENT` como «Pendiente de autorización», sin cifra), recuento de participaciones con autorización anterior y «Participan N personas; sus nombres y cantidades no se muestran». No se pide `/participants` | Lo mismo y, además, «Quién pidió» con nombres y cantidades autorizados, y un aviso destacado con el texto del servidor sobre las participaciones que esperan la autorización nueva |
| Detalle, cerrada | «Consolidado al cierre · Fijado al cierre», con la nota «Visible por la regla anterior: lo pidieron 3 o más personas» en `PREVIOUS_POLICY_K3`; «Detalle por participante» sin datos | Consolidado (puede ver pendiente un total que la Directiva ve por la regla anterior) y detalle identificado de quienes autorizaron, con el aviso de pendientes |
| Responsable no habilitada | Aviso y «Para nombrar a otra persona responsable, pida la intervención de una persona de la Administración del sindicato.» Sin botón | «Sustituir responsable…» (motivo, casilla, sin autosustitución, `expected_responsible_version`, `request_id`) |
| Colaboradores | Sólo «Administrar la convocatoria»; permisos de visualización retirados plegados, de sólo lectura | Igual |
| Usuarios | — (ruta sólo de Administración) | Historia plegada y de sólo lectura del permiso «Sustituir responsable (ya no se usa)» |
| Resumen, cobertura, tendencias, borrador, sellado, Excel | Igual para los dos roles: «Política aplicada»; con `F07-POL-02` cifras de 1 o 2 aportantes visibles; lo sellado con `F07-POL-01` con su política | Igual |

Sin fugas de identidad para la Directiva: la prueba `joint-purchase-call-detail.e4.test.tsx` recorre el texto y los atributos `title`, `aria-*`, `alt`, `placeholder` y `data-*` de toda la página y comprueba que no aparece ningún nombre ni cantidad por persona de los fixtures, ni con un consolidado que trajera nombres por error. La lista de convocatorias no tiene totales ni nombres; no hay búsqueda sobre participantes; no existe Excel de convocatorias (E4 D-07).

## 3. Retirado y conservado como historia

- Retirado: conceder, retirar y revisar «Consultar participantes y cantidades» (opción del diálogo de conceder, diálogo de revisión, avisos de «Su permiso se retiró» para ese permiso); el panel de gestión del permiso «Sustituir responsable» en Usuarios; la franja «Sustituir responsable» de la lista; `components/c/substitution-slot.tsx`; `grantSubstitution`/`revokeSubstitution` del servicio.
- Historia de sólo lectura: `retired_grants` y eventos `retired` de colaboradores («Ver permisos de visualización retirados», plegado, con el aviso del servidor); historia del permiso de sustitución en Usuarios (plegada, se pide al desplegar).

## 4. Limitaciones declaradas

- Sin recorrido real ni capturas: todo está probado con fixtures escritos a mano en A0, no con salidas del servidor.
- El rótulo del estado `SUPPRESSED_UNDER_THRESHOLD` dice «Sin cifra (F07-POL-01)» y su motivo «Sin cifra según la política F07-POL-01 (mínimo de 3 aportantes)», no «según la política anterior» como propone E4 §5.1: con D-03, `F07-POL-01` sigue siendo la política por defecto hasta su activación explícita y llamarla «anterior» sería falso en ese caso. Se pide decisión al orquestador.
- Tras un 403 al pedir participantes, se borran nombres y cantidades por persona; los totales por producto (no identificados, iguales para los dos roles en vivo) se mantienen hasta la siguiente respuesta del detalle.
