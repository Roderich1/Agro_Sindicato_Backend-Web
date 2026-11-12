# P-A — Sustitución explícita de la persona responsable: opciones pendientes de decisión

| Campo | Valor |
|---|---|
| Fecha | 2026-11-12 (UTC) |
| Estado | **Propuesto. No implementado ni activado.** Lo decide el autor |
| Origen | N2 rechazada (2026-11-12): ningún rol obtiene cancelar o cerrar por defecto. P-A sustituye esa salida |
| Contrato | `E2_CONVOCATORIAS_COMPRA_CONJUNTA_CONTRATO.md` §11.5 |

## 1. Lo que ya está decidido (reglas del autor del 2026-11-12)

1. Permiso **específico**, con motivo y auditoría; nunca concedido a un rol entero por defecto.
2. Revalidar que la nueva responsable pertenece al sindicato y está habilitada.
3. Registrar responsable anterior, nueva, actor, fecha y motivo.
4. Suspender las delegaciones anteriores hasta una revisión explícita.
5. No dar acceso retroactivo por suposición: determinar qué permite cada consentimiento histórico.
6. Si un consentimiento no cubre a la sucesora, los datos quedan restringidos hasta una nueva autorización.
7. No eliminar participaciones ni alterar cantidades por el cambio.
8. Se conserva el cierre automático por plazo.

Ya implementado como base: N2 retirada; m6 (delegaciones suspendidas mientras la responsable no está habilitada, sin borrarlas).

## 2. Situación sin P-A (hoy)

Si la responsable deja de estar habilitada:

- una convocatoria **abierta** se cierra sola al vencer el plazo;
- un **borrador** queda sin poder editarse, abrirse ni cancelarse (nadie lo administra);
- una **cerrada** conserva su consolidado.

En los tres casos nadie ve participantes.

## 3. Decisión A — quién concede inicialmente el permiso «Sustituir responsable»

| Opción | Cómo | A favor | En contra |
|---|---|---|---|
| **A1** (recomendada) | Una persona ADMINISTRADOR habilitada del sindicato concede el permiso, con nombre y apellido, a personas concretas de la Directiva o la Administración. Es un permiso del sindicato, registrado y revocable, y nunca alcanza a quien lo concede. | Encaja con RU-18/RU-19: la presidencia es ADMINISTRADOR. No depende de que la responsable esté disponible. | Necesita una pantalla de permisos del sindicato, que hoy no existe. |
| **A2** | Al abrir la convocatoria, la responsable designa una persona suplente para esa convocatoria. | El permiso es mínimo y queda acotado a la convocatoria. | Si no designó a nadie, no hay salida. Tampoco sirve para los borradores que ya existen. |
| **A3** | Sin permiso previo: cada sustitución la propone una persona habilitada y la confirma otra distinta (cuatro ojos), siempre con motivo. | No hay permisos permanentes. | En la práctica, cualquier par de la Directiva puede sustituir: se parece a conceder el permiso por rol. |

## 4. Decisión B — quién lo ejerce y sobre qué

| Opción | Cómo |
|---|---|
| **B1** (recomendada) | Sólo quien tiene el permiso (A1 o A2) y está habilitada. Únicamente cuando la responsable actual **no** está habilitada, salvo que ella misma ceda la responsabilidad, lo que es otra acción. Vale para borradores, convocatorias abiertas y cerradas, no para las canceladas. Pide confirmación y un motivo de 1 a 280 caracteres. |
| **B2** | Como B1, pero también cuando la responsable sí está habilitada, con un aviso. |
| **B3** | Como B1, más la confirmación de una segunda persona habilitada (cuatro ojos). |

## 5. Decisión C — qué cubre cada consentimiento histórico

Los tres textos nombran la **función** («la persona responsable de esta compra conjunta»). En cambio, el teléfono mostraba el **nombre** de la responsable junto al texto: «Responsable: X».

| Opción | Efecto |
|---|---|
| **C1** (recomendada, la más prudente) | Ningún consentimiento anterior cubre a la sucesora por suposición. Sus datos quedan restringidos hasta que el agricultor lo autorice de nuevo. El teléfono le muestra «La persona responsable cambió a Y» y una acción para autorizarlo. Mientras tanto, la sucesora administra la convocatoria y ve sólo los recuentos. |
| **C2** | Como los textos nombran la función, todos los consentimientos cubren a la sucesora. El agricultor recibe un aviso y puede reducir su autorización. |
| **C3** | `CONV-1`, `CONV-2` y `CONV-3` cubren a la sucesora. Para convocatorias futuras habría un texto nuevo (`CONV-4`) que lo diga de forma explícita. |

Con C1 o C3 hace falta una pieza nueva en el teléfono: el aviso y la acción de autorizar. Con cualquier opción, quien colaboraba con la responsable anterior queda suspendido hasta que la sucesora revise explícitamente cada delegación: confirmarla o retirarla, con registro.

## 6. Lo que se implementaría después de decidir

| Pieza | Contenido |
|---|---|
| Back | Permiso del sindicato (A1) o suplente (A2). Ruta `POST /joint-purchase-calls/{id}/responsible`, que revalida a la sucesora y exige motivo. Evento `RESPONSIBLE_REPLACED`, registro en AuditLog y bitácora. Suspensión de las delegaciones y acción «Revisar delegación». Visibilidad según la opción C. Pruebas PostgreSQL con concurrencia. |
| Web | Acción «Sustituir responsable» con motivo, sólo para quien tiene el permiso. Revisión de delegaciones. |
| Mobile | Sólo con C1 o C3: el aviso «La persona responsable cambió» y la acción para autorizar. |

## 7. Preguntas para el autor

1. ¿A1, A2 o A3?
2. ¿B1, B2 o B3?
3. ¿C1, C2 o C3?
4. ¿La sustitución sirve también para convocatorias **cerradas**, para coordinar la entrega?
