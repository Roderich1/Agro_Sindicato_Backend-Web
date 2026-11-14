# Resumen de cierre de Agrocuentas (2026-11-13)

Integración final de Backend, Web y Mobile para la entrega del proyecto de grado. Redactado el 2026-11-13 sobre los commits indicados; todo lo verificado aquí lo fue en esa fecha, con datos sintéticos y en entornos aislados. **No hay despliegue institucional, ni aceptación visual del autor registrada, ni datos reales.**

## 1. Repositorios, ramas y PR

| Repositorio | Rama de integración | PR | Código final probado |
|---|---|---|---|
| `Roderich1/Agro_Sindicato_Backend-Web` | [`integracion/cierre-be`](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/tree/integracion/cierre-be) | [#209](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/pull/209) | `0946d9f` (Back idéntico desde `744930d`) |
| `Roderich1/AppMovilAgroquimico` | [`integracion/cierre-mob`](https://github.com/Roderich1/AppMovilAgroquimico/tree/integracion/cierre-mob) | [#192](https://github.com/Roderich1/AppMovilAgroquimico/pull/192) | `aeeb4f0` |

**`main` tras la fusión (2026-11-13):** Backend/Web `17db85e` (merge de #209); Mobile `34e9926` (merge de #192). Ambos contienen las puntas probadas (`656d7b9` y `7cd8507`). MOB #191 y BE #206 son PR apilados (base en otra rama) ya contenidos en `main`; siguen abiertos.

**Ramas publicadas** (todas con SHA remoto comprobado con `git ls-remote`):
- Backend/Web: `feat/acceso-rol-sin-k` (744930d), `feat/acceso-rol-sin-k-a`, `feat/acceso-rol-sin-k-b`, `docs/acceso-rol-sin-k-verificacion`, `feat/web-rediseno-v2` (07c1c02), `docs/web-rediseno-v2-verificacion`, `feat/web-rediseno-integracion`, `chore/web-solo-institucional`, `docs/web-redesign-input` (sólo material de diseño, **no** integrado), `feat/etapa1-identificacion-productos`, `feat/etapa3-estimacion-borrador`, `cierre/web-rol` (a35f8c2), `integracion/cierre-be`.
- Mobile: `feat/acceso-rol-sin-k-mob` (f9aac3a, entrega estable; 9da5054 descartada), `feat/acceso-rol-sin-k-c`, `feat/modo-individual` (bfe0fa2), `feat/rediseno-movil` (507efc8), `feat/etapa1-productos-identificacion-foto`, `feat/etapa2-historial-colaboradores`, `feat/f09-diagnostico-motores`, `feat/f09-compra-voz-small`, `feat/f09-voz-formulario-unico`, `feat/uxj-integracion`, `evidence/ui-actual-2026-11-11` (sólo capturas, no integrada), `cierre/mob-voz` (1310f9e), `cierre/mob-reporte` (efd661d), `integracion/cierre-mob`.

**PR abiertos que quedan fuera de `main`** (siguen abiertos; no se cerraron ni borraron):

| PR | Motivo |
|---|---|
| BE #204, #208 (variante «threshold-only») | Experimento no aprobado, superado por E4 (K=3 retirado) |
| BE #207 (F07-WEB-03, agricultores y último envío) | Entrega nunca integrada; la Cobertura dice «Todavía sin consulta del servidor». Pendiente de decisión |
| BE #202, MOB #182 | Propuestas en estado Proposed (nada activado) |
| BE #201, MOB #189 | Herramientas de la DEMO oficial: el encargo prohíbe modificarla |
| BE #200, #173, #171 | Documentos de etapas anteriores (actas en borrador OE3, manual C1, propuesta UX) con conflictos en evidencias; no son funcionales |
| BE #172 | Reintroduce «Descargar CSV»: prohibido |
| MOB #8 | Evolución EVO-009 anterior, sustituida por F09 |

Incluidos por ascendencia (GitHub los marcará como fusionados al entrar #209/#192): BE #203, #205, #206; MOB #188, #190, #191.

## 2. Composición y dependencias

- **Backend/Web** (`integracion/cierre-be`): E1 → E2/E2-P2/P3/E3/P-A → rediseño Web (WEBR) → Web sólo institucional → rediseño Web v2 → E4 acceso por rol sin K=3 (+ verificación) → cierre D (rol en la Web) → `.gitattributes` OpenAPI.
- **Mobile** (`integracion/cierre-mob`): UXJ → F09 voz → E1/E2 → rediseño móvil (rondas 1–2, `507efc8`) → E4 estable (`f9aac3a`) + modo individual (`bfe0fa2`) → aviso de Inicio en ambos modos (`64e1d7b`) → cierre A (panel de voz) → formato → cierre C/E (exportaciones y sesión caducada).
- La fusión E4 + modo individual no tuvo conflictos de texto (ningún archivo tocado por ambas). Se revisó por comportamiento: aviso de Inicio en ambos modos, detalle de convocatoria, autorizaciones pendientes, cerrada/cancelada (D2), navegación, migración v19→v20 (el modo individual no cambió el esquema), reportes.

## 3. Versiones compatibles

| Componente | Versión |
|---|---|
| API | `integracion/cierre-be` (contrato institucional v2; contrato del agricultor 4, cabecera `X-Joint-Purchase-Contract: 4`; acepta 1–3 para lectura y responde `APP_UPDATE_REQUIRED` / códigos retirados `409` a las escrituras que ya no existen) |
| Web | mismo commit que la API (`Web/`) |
| Mobile | `integracion/cierre-mob`, esquema SQLite **20**, `AppDatabase.jointPurchaseRoleAccessSinceVersion = 20`; `pubspec` `1.0.0+1` (sin cambio de versión de app) |
| App anterior (`507efc8`, esquema 19, contrato 3) | Sigue leyendo; en convocatorias recibe «Actualice la aplicación» (verificado en E4) |

## 4. Migraciones y procedimiento de actualización

**Backend:**
1. `cd Back && npm ci && npx prisma generate && npm run build`.
2. `DATABASE_URL=… npx prisma migrate deploy` — aplica `20261113120000_e4_acceso_rol_sin_k` (aditiva: tablas y columnas nuevas, sin borrar ni reescribir datos; los permisos de visualización y «Sustituir responsable» quedan como historial de auditoría).
3. Política de divulgación: por defecto sigue `F07-POL-01` (K=3) hasta que se arranque con `COLLECTIVE_DISCLOSURE_POLICY=F07-POL-02`; el primer arranque con ese valor inserta una fila en `CollectiveDisclosurePolicyActivation` (sólo inserción). Lo sellado con `F07-POL-01` no se recalcula. Es una decisión institucional (GOV-02 #185) activarla en un entorno real.
4. `npm run openapi:check` debe pasar (en Windows, la regla `eol=lf` de `.gitattributes` es necesaria).

**Mobile:**
- Instalar encima (`adb install -r` o la actualización del sistema) conserva los datos: al abrir, la base migra 19 → 20 (tabla `joint_purchase_access_ops` y su disparador). Verificado en E4 con conteos idénticos y en el recorrido de cierre (§6).
- Las participaciones con textos anteriores a CONV-4 no se reescriben: la app ofrece «Revisar quién puede ver mi participación» y un aviso en Inicio.

## 5. Pruebas sobre los commits finales

CI de GitHub sobre la última punta del Backend (`656d7b9`, sólo documentación): «Backend F02» falló en el primer intento por un tiempo de espera de 5 s en `beforeAll` de `current-auth-context.postgres.spec.ts`, al arrancar Nest en el runner. Pasó al relanzar el trabajo, sin cambiar ninguna prueba; el mismo código ya había pasado en `7afd574` y en la suite local. Queda registrado como intermitencia por tiempo del runner.

Detalle en `docs/evidence/CIERRE/README.md`.

| Comprobación | Commit | Resultado |
|---|---|---|
| Backend build | `744930d` (Back final) | OK |
| Backend jest completo con PostgreSQL | `744930d` | 86 suites pasan / 2 omitidas; **1015 pasan / 13 omitidas / 0 fallan**; cobertura de líneas 92,88 % |
| Backend `openapi:check` | `7afd574` | falló primero por CRLF (sin deriva real) → corregido → pasa |
| Web tsc / eslint / build / vitest | `0946d9f` | 0 errores / 0 errores (7 avisos) / OK / **743/743** |
| Mobile format / analyze / suite completa | `aeeb4f0` | 0 cambios / sin issues / **3202 pasan, 3 omitidas, 0 fallan** |
| CI GitHub | BE `7afd574`, MOB `aeeb4f0` | success (la de MOB falló antes en `64e1d7b` por formato; corregido) |
| API real (33 pasos E4) | Back final | todos con el código del contrato |
| Web real por rol | `0946d9f` | ver evidencia; un defecto del cambio de rol encontrado y corregido (`a35f8c2`) |
| Mobile en emulador | `aeeb4f0` (APK `.cierre`) | ver §6 |

## 6. Recorridos

Todo sintético; API real 3400 (Back final) y Web real 5184 (`0946d9f`); Mobile en el AVD propio `Cierre_Pixel8` (Android 16 x86_64, `emulator-5560`) con el paquete aislado `.cierre`, por un túnel HTTPS temporal autorizado por el autor el 2026-11-13 (cerrado al terminar). **Sin teléfono físico.** Detalle y capturas: `docs/evidence/CIERRE/` (`README.md`, `mobile/recorrido.md`).

| Caso | Tipo | Resultado |
|---|---|---|
| API: Directiva sin detalle individual, Administración con detalle autorizado, códigos retirados, aislamiento, cambio de rol, deshabilitación, sustitución sin autosustitución, cierre (33 pasos) | API real | Pasa |
| Web por rol: Directiva sin nombres en convocatorias, resumen, cobertura y Excel; Administración con detalle autorizado; política F07-POL-02 visible; cambio de rol en la barra lateral | Web real | Pasa (tras corregir `a35f8c2`) |
| M1 App anterior `507efc8` (esquema 19): activar F3, compra, aplicación y plan con varias personas | emulador + API real | Pasa |
| M2 Actualizar con `install -r` a `aeeb4f0`: sin reactivar, cifras idénticas; esquema 19 → 20, 44 → 45 tablas, filas anteriores intactas | emulador | Pasa |
| M3 Aviso de Inicio «Revise quién puede ver su participación en 2 compras conjuntas» → CC → CONV-4 con casilla → sin conexión «Pendiente de envío… no está aplicada» → al reconectar, aplicada; A1 ve a F3 por API; D1 403; el aviso baja a 1 | emulador + API real | Pasa |
| M4 Compra sin conexión: sobrevive a cerrar y reabrir | emulador | Pasa (la app no envía compras al sindicato; la parte de sincronización no aplica) |
| M5 Cambio de modo con un envío pendiente; paso a individual; compra, aplicación y plan en individual; Chacos › costos; vuelta a varias personas con cifras idénticas | emulador | Pasa; hallazgo H1 (abajo) |
| M6 Panel de voz en ambos modos (APK `final-voz`, con modelos): permiso de micrófono sólo para `.cierre`; hoja «Escuchando» con la guía de cada modo («… y para quién» sólo con varias personas), Cancelar/Terminar; «Procesando tu voz»; Cancelar no cambia el formulario; base sin escrituras | emulador | Pasa (sin audio real: el micrófono del emulador sólo captó silencio; no se probó el reconocimiento ni el relleno). Sin modelos, la app dice «La voz no está disponible en este teléfono» |
| M7 Web: A1 ve a F3 en CC; D1 sólo totales, sin pedir `/participants` | Web real | Pasa |
| Compra, aplicación y plan en ambos modos; cambio de modo bloqueado por terceros (I-52) | pruebas de widget (arnés) | Pasan en la suite completa; el bloqueo por terceros no se recorrió en el emulador (el hogar sintético no tiene terceros) |

**Hallazgos del recorrido (no corregidos; para decisión):**
- **H1:** con un envío de convocatoria pendiente, el cambio de modo no avisa ni se bloquea. El diseño (CU-05, `modePendings`) sólo bloquea sin titular o con actividad de terceros; no se pierde nada (el pendiente se envió al reconectar). Falta decidir si debe avisar.
- **O1:** en la dosis del plan, «1.5» con punto no se lee («Necesita 0 L»); con coma sí.
- **O2:** el aviso de revisión de Inicio aparece después de consultar las convocatorias (Sindicato › Actualizar o la sincronización), no al abrir la app recién actualizada.
- **O3 (sólo la app anterior):** el aviso «sin campaña activa» de `507efc8` remite a una ruta que esa versión no tiene.

## 7. Decisiones del autor aplicadas en el cierre

| Decisión | Aplicación |
|---|---|
| A. Panel de voz nuevo en ambos modos | `1310f9e`: misma presentación en los dos modos, mismos componentes; guía de compra con «y para quién» en el modo con varias personas. Sin cambios en motores, modelos, validaciones, cancelación ni confirmación. Sólo probado con motor falso (sin audio real) |
| B. Superficie del chaco | No se añadió edición. **Mejora pendiente:** permitir editar la superficie de un chaco (hoy no se puede); afectaría a denominadores de costo/ha futuros, no a los históricos |
| C. Excel/PDF de costo | «Costo por chaco» y «Costo por producto» exportan en modo individual exactamente el ámbito y filtros de la pantalla, con una línea de filtro en el archivo; modo con varias personas sin cambios; no se recalcula nada (se suman los costos guardados; denominador = superficie de los chacos incluidos). **Limitación aceptada por el autor:** «Resumen de campaña» incluye en modo individual las aplicaciones en chacos de terceros (no hay pantalla equivalente). Un chaco sin aplicaciones muestra 0,00 en el archivo donde la pantalla dice «Sin aplicaciones» (costo/ha coincide: vacío) |
| D. Rol de la Web | La Web adopta el rol vigente (`GET /auth/me`) tras un 403, en la renovación del token y cuando la comprobación existente del detalle (E4 §6.4) detecta un cambio de acceso. Sin sondeos nuevos. El servidor sigue decidiendo cada acceso. **Limitación:** de Directiva a Administración, en una página de Directiva, la barra se actualiza al renovar el token o recargar |
| E. Sesión caducada | La app dice que la decisión no se envió y sigue guardada, ofrece «Volver a autenticar» (pantalla `/reauth` existente) y luego «Enviar ahora»; nada se muestra aplicado antes del acuse; reducir no amplía nada. **Limitaciones:** `/reauth` vuelve a Inicio (hay que volver a la convocatoria); el acceso a `/reauth` sólo está en el detalle; la decisión pausada por 401/403 no tiene texto propio |
| Ayuda | No existe pantalla Ayuda; no se inventó. Diferencia con el prototipo documentada |

## 8. Defectos y limitaciones pendientes

- **Distribución:** no hay keystore de release ni API desplegada (desplegar no estaba autorizado). La APK de release sale **sin firmar** (configuración deliberada del proyecto) y no es instalable; ver §9. Los modelos de voz y las bibliotecas nativas de whisper.cpp no están en Git ni en la APK de `main` (se añaden con `tool/voice_local/*` para una APK de voz).
- Deshabilitar una cuenta da 401 (IAM común), no 403 (E4 §11.1).
- App anterior: consulta la lista cada ~60 s y recibe «Actualice» (comportamiento fijo de una app instalada).
- Envío automático de decisiones sólo con sesión verificada en memoria (O3); la cola sin conexión junta cambios de cantidad (O4, estado final correcto).
- Auditoría: la Web v2 reconoce acciones que la bitácora no registra (H-08); cambios de cuentas y roles sin `AuditLog` localizado (ver matriz, fila 30).
- Voz: sin evaluación con audio real ni precisión medida; ADR-005 aceptado sólo provisionalmente para la demostración.
- Sin teléfono físico para E1–E4, modo individual ni el cierre (F03–F09 sí tuvieron sesiones en POCO `22101320G`; F04 en HONOR JDY-LX3P).
- Intermitencia posible bajo carga en 2 pruebas de Mobile (ver evidencia), no reproducida en la suite completa.

## 9. APK final

| Campo | Valor |
|---|---|
| Commit | Mobile `main` `34e9926` |
| Versión | `pubspec` 1.0.0+1; esquema SQLite 20; contrato del agricultor 4 |
| Compilación | `flutter build apk --release` (Flutter 3.47.2), configuración existente, worktree limpio, sin `--dart-define` |
| Archivo | `_artefactos/cierre/agrocuentas-release-34e9926-SIN-FIRMAR.apk` (110 989 325 B), fuera de Git |
| SHA-256 | `c7b947a2ff4b0ae4c3d35e07217d012e676dc2b59d7e409744dc7c03cdc84798` |
| Firma | **sin firmar** (`apksigner verify` → `DOES NOT VERIFY`): no existe `android/key.properties` |
| Backend compatible | Backend/Web `main` `17db85e` |

**No es una distribución instalable ni permanente.** Requisitos para distribuirla:
- la keystore de release;
- una API desplegada, cuyo origen se compila con `AGRO_API_BASE_URL`;
- para la voz, los modelos y las bibliotecas nativas.

Las APK del recorrido en emulador (`.cierre`, perfil x64, clave de depuración, con el origen de un túnel ya cerrado) son sólo de revisión.

## 10. Aceptación funcional frente a visual

- **Funcional verificada por pruebas y recorridos** (este documento): permisos E4, convocatorias, sustitución, modo individual, exportaciones, sesión caducada, actualización conservando datos.
- **Aceptación funcional del autor registrada antes:** P-A (sustitución) aceptada funcionalmente el 2026-11-12.
- **Aceptación visual del autor: no registrada** para el rediseño Web v2, el rediseño móvil, el modo individual ni el panel de voz en ambos modos. Queda pendiente de su revisión; ninguna sesión la marcó.
- **Gates:** ninguno se marcó; siguen en manos del autor.

## 11. Documento de grado

Matriz funcionalidad → requisito → implementación → prueba → evidencia → limitación: `docs/cierre/MATRIZ_DOCUMENTO_GRADO.md`. No contiene resultados de usabilidad, SUS, precisión de voz ni evaluación SES/naive más allá de lo que existe por escrito (sintético).
