# Contraste de los contratos E2 y E3 con las decisiones del autor (2026-11-12)

| Campo | Valor |
|---|---|
| Fecha | 2026-11-12 (UTC) |
| Contratos | `E2_CONVOCATORIAS_COMPRA_CONJUNTA_CONTRATO.md`, `E3_ESTIMACION_EN_BORRADOR_CONTRATO.md`, `E3_P1_OPCIONES_ALCANCE_COMPARABLE.md`, enmienda de `F12_EST_01_ESTIMATION_CONTRACT.md` §2 |
| Fuentes de las decisiones | (a) encargo de convocatorias del 2026-11-11 («Reglas acordadas» 1–9); (b) encargo del 2026-11-11 noche (E2-P2, E2-P3, totales tras el cierre, etapa 3); (c) respuestas del 2026-11-12: E3-P1 = opción 1 + 1b; (d) encargo del 2026-11-12: E3-P2 sí, etapa 4 aplazada, aceptación de las reglas acordadas, verificación de CONV-2 y del alcance |
| Regla aplicada | **Sólo se acepta lo que coincide con esas decisiones.** Una regla que sólo está escrita en el contrato no queda aprobada por estar escrita |

## 1. Lo que coincide con las decisiones (aceptado)

**E2 — convocatorias** (encargo a):

| Regla acordada | Contrato | Coincide |
|---|---|---|
| 1. Campaña ≠ convocatoria; varias por campaña; cerrar una no cierra la campaña | E2-D1, §1 | Sí |
| 2. Estados Borrador/Abierta/Cerrada/Cancelada; contenido; producto único entre abiertas de la campaña, también en concurrencia; transiciones definidas; sin reapertura, prórroga ni cambio de productos tras abrir | E2-D2, E2-D3, E2-D4 | Sí |
| 3. Una propuesta puede servir de base; sus cantidades son referencia; sin identidades; no sumar necesidad y participación | E2-D14, E2-R10 | Sí |
| 4. Participación: confirmar, modificar, retirar dentro del plazo; sin tocar la necesidad; sin deuda, compra, pago ni inventario; una persona cuenta una vez; consolidar por producto y unidad | E2-D8, E2-D13, §5.6 | Sí |
| 5. Texto de consentimiento exacto antes de confirmar; registrar aceptación, versión y fecha; permiso específico, no automático para administradores; por sindicato y convocatoria; asignación de responsables según el modelo existente sin autoasignaciones no autorizadas; sólo identidad, productos, cantidades y estado; en la API | E2-D5, E2-D6, E2-D9 (texto `CONV-1` idéntico al del encargo), E2-D7 | Sí |
| 6. Sin conexión con estados claros; el servidor decide plazo y estado; idempotencia y orden; sin cambiar de participante al cambiar de titular | E2-D10, E2-D11, E2-D16, §5 | Sí |
| 7. Cierre con hora del servidor, sin ampliar el plazo, atómico e idempotente, concurrencia resuelta, «Consolidado al cierre» inmutable, «solicitadas» y no «compradas» | E2-D12, E2-D13 | Sí |
| 8. Web y móvil según permisos; descubrimiento sin push; avisos dentro de la app; «visto» no se declara por enviarlo | E2-D15, §6 | Sí |
| 9. Fuera de alcance (asignación de comprados, entregas, cobros, proveedores, compras automáticas, inventario, estimación integrada) | Cabecera «Fuera de alcance» | Sí |

**E2-P2, E2-P3 y totales** (encargo b): historial con filtro de presentación, copia local y retención separados; anteriores accesibles con conexión; sin borrar datos centrales ni operaciones pendientes; permisos «Consultar participantes y cantidades» y «Administrar» distintos, ninguno automático por rol; nadie se concede permisos; por sindicato y convocatoria; registro de concesiones y revocaciones; comprobación en cada operación; limpieza en el cliente al detectar la revocación sin afirmar que se retira lo ya obtenido; consentimiento nuevo sin extensión retroactiva; cerrar no anonimiza; agricultor ve lo suyo; sin exportaciones nuevas. **Coincide**: E2 §10.1, §10.2, §10.3.

**E3** (encargos b y c): estimación como apoyo sin efectos; inspección previa; reutilización de trabajos y lecturas F12; operación explícita e idempotente sin cálculo al montar; borrador disponible mientras calcula o si falla; estados; comparabilidad por producto, unidad, período, población y vigencia; sin inventar metadatos; tres cantidades separadas; diferencia absoluta y porcentual sólo si es válida, porcentaje no definido con estimación cero; observaciones descriptivas sin semáforos; trazabilidad de la ejecución usada; «Actualizar referencia» explícito; sin efectos tardíos; integración en la vista existente; convocatoria sin inscripción automática; **E3-P1 = 1 + 1b**. **Coincide**: E3 §1–§9, §5 con la decisión E3-P1.

## 2. Diferencias materiales encontradas al contrastar, y su tratamiento

| # | Diferencia | Tratamiento |
|---|---|---|
| D1 | E3 pide diferencia **absoluta y porcentual** con cifras comparables; la Web sólo mostraba la absoluta | **Corregido** (Web `e2d7cdc`): también «Diferencia: +5 % respecto de la estimación» (formateador del contrato compartido del rediseño, que lo permite para estimaciones comparables) y «Porcentaje no definido: la estimación es cero». Hoy no se ve porque ninguna línea es comparable |
| D2 | E3-P2 (selección registrada en la convocatoria) no estaba implementada: editar el borrador de convocatoria reemplazaba los productos | **Implementado** (Back `c87c352` + `fa44b5f`, Web `91e9ef2`; E2 §10.5; recorrido en la evidencia §3c) |
| D3 | «El agricultor puede conocer quiénes, por función, tendrán acceso»: el texto `CONV-2` lo dice antes de aceptar, pero después el detalle no decía quién ve los datos según el consentimiento aceptado | **Corregido** (Mobile `01b2576`): el detalle lo dice según la versión aceptada (CONV-1: sólo la persona responsable; CONV-2: responsable y personas de la Directiva o la Administración que ella autorice) |

## 3. Reglas añadidas en los contratos que **no** quedan aprobadas por estar escritas

Están implementadas (son la opción conservadora que el código aplica hoy), pero no derivan de una decisión tuya. Quedan **pendientes de tu visto bueno**; ninguna amplía accesos.

**Materiales:**

| # | Regla | Dónde | Por qué se añadió |
|---|---|---|---|
| N1 | Sólo se crean convocatorias en campañas `PLANIFICADA` o `ABIERTA` (422 `CAMPAIGN_NOT_ELIGIBLE`) | E2-R8 | Evitar convocatorias en campañas cerradas o canceladas |
| N2 | Si la persona responsable deja de ser elegible, cualquier `DIRECTIVA`/`ADMINISTRADOR` puede **cancelar o cerrar** (nunca ver participantes) | E2 §10.2 | Que una convocatoria no quede sin salida |
| N3 | Quien tuvo «Consultar participantes» y lo perdió no recibe totales de productos con participaciones que no podía ver, aunque superen el umbral | E2 §10.3 | Evitar deducir una participación oculta restando |
| N4 | Umbral de 3 personas (provisional de F07, no aprobado institucionalmente) para totales del consolidado a quien no tiene permiso; totales en vivo sólo para quien tiene permiso | E2-D7, E2-P1 | Privacidad; E2-P1 se aplicó así y el valor sigue revisable |
| N5 | Texto exacto de `CONV-2` | E2 §10.2 | Pediste versión nueva si hacía falta, no su redacción |
| N6 | Quien crea un borrador y nombra a otra persona responsable deja de poder editarlo, salvo que la responsable le conceda «Administrar» | Consecuencia de E2 §10.2 | Efecto de restringir la administración |
| N7 | Publicar `CONV-2` obliga a actualizar la app (la versión anterior deja de aceptar la lista); sus operaciones con `CONV-1` se siguen aceptando | E2 §10.2 | Validación estricta del teléfono |
| N8 | La columna pasa a «Consumo estimado» y el CSV sigue llevando la estimación **vigente al exportar**, no la fijada | E3-R9, E3-R10 | Pediste el rótulo; el CSV no se cambió para no añadir exportaciones |

**Menores:** renuncia del colaborador a su permiso (E2 §10.2); participaciones retiradas fuera de la lista de participantes (E2-R12); 180 días como ventana de «recientes» (E2 §10.1); «Quitar referencia» (E3 §4); la selección de productos como única edición del borrador (E3 §6); redondeo de presentación a la décima, en mL/g bajo 1 L/KG (E3-R8); reutilización sólo de trabajos con productos explícitos (E3-R2); sondeo cada 3 s mientras calcula (E3 §8). Las resoluciones técnicas E2-R1…R25 y E3-R1…R14 (códigos de error, límites, idempotencia, formas de respuesta) son implementación, no reglas de negocio.

## 4. Etapa 4

**Aplazada expresamente** (decisión del 2026-11-12). Se mantienen los avisos internos implementados (E2-D15: «Nueva convocatoria» en Inicio hasta abrirla). No se añaden push, correo ni recordatorios. No bloquea el cierre de las etapas 1–3.

## 5. Aceptación registrada

- **Aceptadas** (2026-11-12, por el autor): las reglas de la §1 y las correcciones de la §2.
- **No aceptadas todavía:** N1–N8 y las menores de la §3. Siguen aplicadas en el código porque son la opción conservadora; si alguna se rechaza, se cambia en una tarea aparte.
- Los contratos E2 y E3 pasan a «**Aceptado en las reglas acordadas**», con la §3 de este documento como lista de pendientes.

## 6. Decisiones del autor sobre la §3 (2026-11-12, segunda parte)

| # | Decisión | Dónde queda |
|---|---|---|
| N1 | Aceptada con cambio: borradores en PLANIFICADA o ABIERTA; abrir sólo en ABIERTA; cerrar y cancelar no dependen de la campaña | E2 §11.4 (implementado) |
| N2 | **Rechazada**; se prepara P-A, sin activar | E2 §11.5; `E2_PA_SUSTITUCION_RESPONSABLE_OPCIONES.md` (**pendiente**) |
| N3 | Aceptada, con alcance por convocatoria y producto y matriz probada | E2 §11.6 |
| N4 | Aceptada provisionalmente (k = 3), sin presentarla como anonimato | E2 §11.7 |
| N5 | Aceptada con texto nuevo: `CONV-3` | E2 §11.2 |
| N6 | Aceptada con P-B (aviso previo y confirmación) | E2 §11.8 |
| N7 | El error genérico no se acepta: respuesta compatible con el contrato 1 y errores distintos en las versiones nuevas | E2 §11.3 |
| N8 | **Rechazada**; Excel único con la referencia fijada | E2 §11.9; `WEB_EXCEL_UNICO_2026-11-12.md` |
| m1–m11 | Aceptadas con las precisiones del autor; cambian m6, m10 y m11 | E2 §11.10 |
| P-C | Aceptada: consentimiento independiente de las cantidades | E2 §11.1 |

Las etapas 1–3 **no** se declaran cerradas funcionalmente: P-A sigue pendiente de decisión (§7 de su documento).
