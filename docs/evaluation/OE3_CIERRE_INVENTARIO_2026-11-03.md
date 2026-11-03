# OE3: inventario completo y lo que falta para cerrarlo (2026-11-03)

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-03 (UTC) |
| Fuente | Project `users/Roderich1/projects/3`, leído por la API con paginación completa: **150 ítems**, 2 páginas. Filtro por el valor real del campo **Objective = OE3** |
| Bases | Backend/Web `main` `5973b49`; Mobile `main` `5b5b318` |
| Cómo se hizo | Lectura del cuerpo, todos los comentarios y la evidencia vigente de cada ítem con Evidence distinto de Verified. Los hallazgos que cambian la lectura se comprobaron en el repositorio. **No se ejecutaron pruebas nuevas.** Un documento histórico se distingue del estado vigente cuando un comentario o una evidencia posterior lo supera |
| Qué no es | No es una aceptación. Done no equivale a aceptación completa. **OE3 no está completo** (§9) |

## 1. Recuento

| | Ítems |
|---|---|
| OE3 en total | **78**: F03 10, F04 27, F05 11, F06 6, F07 9, F08 10, F10 5 |
| Abiertos | **3**: Backend #29 (GATE-F07), #107 (F07-POL-01) y #151 (F08-BKP-08) |
| Cerrados | 75, todos con Status = Done. Ninguno cerrado con otro Status |
| Evidence = Verified | 43. Incluye Mobile #172, cerrado hoy (§2.1) |
| Evidence = Partial | **35**: los 3 abiertos y 32 cerrados |
| Evidence = Pending | 0 |
| Gates | GATE-F03 (MOB #23), GATE-F04 (MOB #28), GATE-F05 (BE #19) y GATE-F06 (BE #22): **Passed, con Evidence Partial**. GATE-F07 (BE #29): **Pending**. GATE-F08 (BE #41): Passed y Verified |
| Anomalía de campo | MOB #178 tiene **Gate vacío**; los demás ítems sin gate usan N/A (§8) |

## 2. Cambios de hoy

### 2.1 Mobile #172 (F08-PREV-01): cerrado

Cerrado como completed, con Status Done, **Evidence Verified** y Gate N/A ([comentario](https://github.com/Roderich1/AppMovilAgroquimico/issues/172#issuecomment-6607791187)).
- **Lo que acredita:** los tres criterios del issue, en HOST y en la CI de `main` `5b5b318` (run 41577902321). El criterio 3 admite que DEVICE quede pendiente; DEVICE y EMULADOR están **NOT_MEASURED**.
- **Historial conservado:** el FAIL de CI corregido en la prueba (#175).
- **Límites:** los de la evidencia, §8.
- **Lo que no acredita:** un rollback en Android. Las pruebas Android del respaldo hechas en F12 no lo sustituyen.

### 2.2 Documentos actualizados en este PR

| Documento | Qué cambia |
|---|---|
| `docs/evidence/F07_POL_01_REVISION_INSTITUCIONAL.md` §7 | Estado vigente (sellado, memoria, cobertura de consumo, estimación y su proyección al Agricultor), los cinco niveles y la hoja breve de decisiones A1–A7 |
| `docs/evidence/F07_POL_01_PAQUETE_DECISION.md` §5 | Fila 7: la estimación con datos reales |
| `docs/evidence/F07_CIERRE_MATRIZ.md` §7 | GATE-F07, criterio por criterio, sobre `5973b49`. Separa necesidad, consumo, estimación y propuesta. Propone decidir sobre la mezcla de aceptación académica y admisión institucional. **Criterio 9: Pending** |
| `docs/manuals/F11_MANUAL_TECNICO.md` §5.6, §6.1 y §7.5 | El caso D (copia cifrada por el teléfono → B2 → instalación nueva) y T-R5a en B2 pasan a constar como probados. Sigue pendiente lo que de verdad falta |
| `docs/evidence/F08_BKP_08_B2_REAL_ACOTADA.md` | Aclaración sobre la revocación de las claves `b151-*` y la falta de prueba de acceso denegado |

## 3. Abiertos

| Ítem | Construido | Pendiente real | Acción necesaria | Quién |
|---|---|---|---|---|
| **#107** F07-POL-01 | Política k = 3 provisional, memoria de divulgación, sellado, cobertura y estimación, todo probado con datos sintéticos | Criterio de la decisión: «Verificado por Roderich Rendón (autor) el <fecha real>». La validación de la Directiva y la revisión del tutor (paquete §5, filas 1–3 y 6–7) | Decisiones A1–A7 de la hoja de revisión §7.3; reunión o constancia de la Directiva; revisión del tutor | **Autor, Directiva y tutor** |
| **#29** GATE-F07 | Criterios 1–8 evidenciados con datos sintéticos (`F07_CIERRE_MATRIZ.md` §7.2) | Criterio 9: #107 abierto | Mantener Pending, o una decisión explícita del autor (opciones A, B o C de §7.3) | **Autor** |
| **#151** F08-BKP-08 | Ítems 1–6 medidos en B2 real (2026-10-24), con sus FAIL y NO_CONCLUYENTE conservados y corregidos (§5) | Ítem 7 en otro modelo; `.previo` en DEVICE; la CLI contra B2; la operación productiva; las decisiones de GOV-02 | §5 | Técnico con teléfono, autor, Directiva y producción |

## 4. Cerrados con Evidence Partial: matriz por ítem

Cada fila: **construido** → **evidencia** → **pendiente real** → **acción** → **quién**. «R» es el autor, Roderich; «T», el técnico. En todos falta además la revisión personal de R y del tutor, que no es requisito de Verified.

### 4.1 F03: activación y sesión (Mobile)

| Ítem | Construido y evidencia | Pendiente real | Acción | Quién |
|---|---|---|---|---|
| #18 AUTH-01 cliente HTTP | PR #62; 20 pruebas `auth_v2_api_test` (H, `278cbd3`) | Sin pruebas de 403/404 (`auth_v2_api.dart`) ni de `fromEnvironment`. La evidencia está en `docs/evolution/`, no en `docs/evidence/` | Añadir las pruebas y un índice en `docs/evidence/` | T |
| #19 AUTH-02 activación | D: A/B/D/E PASS en el POCO | DEVICE-C (corte de red durante la activación) y DEVICE-F, NOT_MEASURED | Medir con teléfono y túnel, o una excepción | T con teléfono, o R |
| #20 AUTH-03 almacenamiento seguro | D en el POCO; P13 | Restauración de Auto Backup y D2D NOT_MEASURED; corte de energía NOT_MEASURED | `bmgr` en D; aceptar el corte de energía | T con teléfono; R |
| #21 AUTH-04 sin red | D 21-A…D | 21-E solo en parte: un tipo de daño; no se probaron el almacén incompatible ni el keystore | Medir o aceptar | T con teléfono, o R |
| #22 AUTH-05 refresh y revocación | D 22-A/B/C; 22-D/E en #71 | El residual de logcat de E-1; la evidencia no está en `docs/evidence/` | Índice y aceptación | T; R |
| #23 **GATE-F03** (Passed por delegación) | Criterio 6 cubierto en D | Los Partial de #18–#22; un solo modelo; «Revisión personal de Roderich Rendón: no consta» (`GATE_F03_DECISION.md`) | **Ratificación explícita** del gate o mantenerlo Partial | R |
| #71 F03-RES-01 | D en el POCO: refresh 200, 401 por desactivación y por revocación, reapertura sin red | Logcat de E-1 sin escaneo de valores opacos | Aceptar E-1 o repetirlo | R o T con teléfono |
| #76 F03-RES-02 | D P1, P2, P11, P12, P13 | La variante «otro Member» en la reapertura, en D; P11 sin comprobar el estado interno | Aceptar o medir | R o T con teléfono |
| #83 F03-BUG-01 | H (4/4 mutaciones) más D en la repetición de E-2 | El SHA de la prueba en H es una inferencia | Repetir la prueba con su SHA registrado | T |

### 4.2 F04: modalidad, fechas e inventario (Mobile)

| Ítem | Construido y evidencia | Pendiente real | Acción | Quién |
|---|---|---|---|---|
| #28 **GATE-F04** (Passed por delegación) | H más D (P3–P9, R-07, REP-01); CI | **El acta cita «DEVICE P9» para la transferencia (criterio 4), pero P9 es una compra asignada con el bloqueo de cambio de modo** (comprobado: `F04_GATE_DECISION_PROPUESTA.md`:23 frente a `F03_F04_DEVICE_2026-10-17.md`:44). La transferencia solo tiene H más E en otros SHA. **El límite RF-03 (D-F04-C1) está superado:** las operaciones tardías existen y pasaron en D el 2026-10-24 (B1–B3) | Un anexo en #28 que corrija la cita y registre D-F04-C1 superado; transferencia en D o una excepción; ratificación | T (anexo); R |
| #45 REC-009 pagos | Guardas en el repositorio; D en X01 | Sin prueba del rechazo «supera el saldo» ni de la compra revertida; sin requisito formal propio | Pruebas; requisito en la próxima revisión del documento | T; R y tutor |
| #49 REC-013 cuentas | D-04/E-15 en H más E | Inmutabilidad solo de aplicación (sin trigger); D en modo compartido; especificación | Decidir si basta; medir en D | R; T con teléfono |
| #50 REC-014 reversiones | H completo; RF-13 resuelto con PIN y `reversal_audit` (D) | **El último comentario quedó superado:** la reversión sin red sí se midió en el POCO (caso A, `F01_F08_DEVICE_FINAL_2026-10-24.md`, `1d77c14`) | Un anexo que lo cite | T (anexo); R para Verified |
| #73 F04-BUG-01 | H con 9 mutaciones; ningún criterio exige D | Solo «revisión de Roderich: pendiente» | Confirmar | R |
| #121 F04-DATE-UI | D en el HONOR (R-01…R-12) más H | **R-03 (cancelar el selector) en aplicación NOT_MEASURED**; el cambio de zona no se reclama | Medir R-03 en D o una excepción | T con teléfono, o R |
| #122 F04-CLOSE-01 | H más D R-11 | La «versión de necesidad posterior a hoy» se deduce y no se ejecuta; cancelar o rechazar y el vínculo central, solo en H | Prueba en H; aceptar lo que es solo H | T; R |
| #125 F04-ACT-01 | H más D R-10 | El día inicial solo en H; la pantalla desactualizada no se simuló | Medir en D o aceptar | T con teléfono, o R |

### 4.3 F05 y F06: sincronización y proyección colectiva

| Ítem | Construido y evidencia | Pendiente real | Acción | Quién |
|---|---|---|---|---|
| BE #18 F05-SYNC-06 | Central: A 41/41 y R 7/7 en PostgreSQL; Mobile 18 casos PASS en D | **22 filas Mobile NOT_MEASURED** (C07–C10, C12, C13, C16–C21, C25–C29, C32, C33, C36, C37, C39). Algunas son inalcanzables desde la app (C08, C25, C36, C37). §6 de `F05_SYNC_06.md` desactualizado (C22, C30, C35 y C38 se midieron después) | Medir las alcanzables (BE #42); excepción N/A para las inalcanzables; corregir §6 | T con teléfono; R; T |
| BE #19 **GATE-F05** (Passed) | CI más D | Las 22 NOT_MEASURED; el acta sigue con «REJECTED sin D», ya cubierto por C3/C4 del 2026-10-24; D-F04-C2 ya está cerrado (MOB #116) | Actualizar el acta; mantener Partial | T; R |
| MOB #32 F06-COLL-02 | Contrato F06 aplicado; H con mutaciones; D4 | Los criterios se reescribieron por el contrato (primacía ratificada en `F06_GATE_DECISION.md`) | Confirmar que la ratificación vale como cumplimiento | R |
| MOB #33 F06-COLL-03 | Ídem; D en `F06_D4_DEVICE.md` | Ídem; una sola ruta física | Ídem | R |
| MOB #34 F06-COLL-04 | H más D (SUPERSEDE, CANCEL) | El documento se declara «parte local», aunque el PR lo cerró | Una nota de cierre y la confirmación | T; R |
| BE #21 F06-COLL-05 | 10/10 PASS (CI más H más D3) | Ninguno contra su texto. Los límites (k = 3, D4 fuera de la CI) son de #107 y GOV-02 | Confirmar | R |
| BE #22 **GATE-F06** (Passed) | Criterios 1–7; 3 y 6 reescritos por delegación | Depende de #107 (Directiva) y del tutor | Mantener Partial | R, Directiva y tutor |

### 4.4 F07, F08 y F10

| Ítem | Construido y evidencia | Pendiente real | Acción | Quién |
|---|---|---|---|---|
| BE #24 F07-WEB-02 | Agregado, vigencia, unidades y separación (ACC, Web, W2) | **El detalle por agricultor con permiso (criterio 4) no está construido** (decisión del 2026-10-16); sin cifras reales (#107) | Una excepción explícita sobre el criterio 4, o mantener Partial | R |
| BE #25 F07-WEB-03 | Los criterios vigentes del 2026-10-16 se cumplen | Los criterios originales (estado y última sincronización por agricultor) se sustituyeron por delegación | Ídem | R |
| BE #149 F08-BKP-07 B2 | B2 real 55/55 (clave amplia, 2026-10-19). Con mínimo privilegio: FAIL (H1) y después PASS tras #163 (2026-10-24). Subida desde el teléfono (caso D) | El cierre del 19-10 solo valía con la clave amplia. Lo posterior está acreditado en #151 | Un anexo que enlace las evidencias del 24-10 con los criterios de #149 | T (anexo); R |
| MOB #36 F08-BKP-05 restauración | D: reinstalación del POCO (16-10) y caso D (24-10, `1d77c14`, 31/32 tablas, fotos con el mismo SHA) | **Otro modelo de teléfono**; migración de esquema, rutas y foto alterada solo en H | Restaurar en el HONOR o una excepción explícita | T con teléfono, o R |
| MOB #44 fotos de factura | Galería en D (POCO y HONOR); respaldo con fotos | **La cámara no se ejercitó**; `docs/13_LOCAL_STORAGE.md` sigue diciendo que el respaldo no incluye fotos (comprobado en `5b5b318`); la REC cita D para la foto alterada, que solo está en H | Simular la cámara en una prueba de widget; corregir `docs/13` y la referencia | T; R acepta la simulación |
| MOB #82 fechas UTC | CI con paso La Paz, rojo en el código anterior | Ninguno contra los criterios: «no se repitió en el dispositivo» no es requisito | Confirmar | R |
| MOB #97 fuente 1,3 (POCO) | D S3 y P10 (en SHARED, «Hermana DEV» entero) | Las asignaciones en compartido con un nombre largo sobre el código final | Aceptar P10 o una comprobación corta en el POCO | R o T con teléfono |
| MOB #129 HONOR 720 px | Corrección #131 y prueba de widget a 720 | **El HONOR sigue con NO CUMPLE** (serie 2, `ad5b43d`); no hay repetición posterior | Repetir M8 A4-F en el HONOR | T con el HONOR |

## 5. #151: conciliación de los 15 puntos

**Ensayos en B2 del 2026-10-24** (datos sintéticos, claves temporales `b151-rw/ro/nodel`):
- **R1:** `F08_BKP_08_B2_REAL_FORMATO2.md`, código `50096c0`;
- **R2:** `F08_BKP_08_B2_REAL_REPETICION.md`, `62f4fe7`;
- **R3:** `F08_BKP_08_B2_REAL_ACOTADA.md`, `1e5ff10`.

Los SHA ejecutados están en ramas de ensayo. El adaptador de `main` es idéntico al de `d673a56` (#163).

**Caso D:** Mobile `F01_F08_DEVICE_FINAL_2026-10-24.md`, en el POCO con Mobile `1d77c14` y Backend `4bcb1ea`.

**Proveedor frente a adaptador:**
- **Comportamientos observados de B2, solo en este entorno:**
  - **H1:** HEAD o GET de un nombre inexistente responde 403;
  - **H2:** `IsLatest` se marca por página;
  - con `writeFiles`, un `DeleteObject` sin `versionId` oculta el objeto.
- **Defectos del adaptador**, todos corregidos y medidos:
  - dependencia del 404 e inventario fiado de `IsLatest`: #163 `353ad31`, medido en R2;
  - **H3**, un `AbortError` enmascaraba la causa, y **5b**, una multiparte sin `UploadId`: `d673a56`, medido en R3.

| # | Punto | Estado | Historial conservado | Qué falta | Quién |
|---|---|---|---|---|---|
| 1 | Rechazo de permisos sin perder una copia válida | **Acreditado** (R2: ro 8 PASS, nodel 6 PASS; R3: H3 PASS) | R1: `preparar` FAIL (H1); R2: 1-ro multiparte NO_CONCLUYENTE (H3), resuelto en R3 | — | — |
| 2 | `Content-MD5` incorrecto (`BadDigest`) | **Acreditado** (R1 y R2: 5 PASS cada vez) | En R2, 2d devolvía `AbortError` (H3) | Opcional: 2d en B2 con el adaptador final | T, si R lo pide |
| 3 | Paginación de listas | **Acreditado para el adaptador** | 3a con MaxKeys=1 sigue **FAIL del proveedor** (H2), no del adaptador | — | — |
| 4 | `CopyObject` con `versionId` fijado | **Acreditado** (R1 4a/4b; R2 4c) | R1 4c FAIL (H1) | — | — |
| 5 | `UploadPart` observado con `ListParts` | **Acreditado** (R2 5a; R3 5b-r) | R2 5b FAIL (multiparte sin terminar), corregido en #163 | — | — |
| 6 | C2, C5 y T-R5 en B2 real | **Acreditado** (R2, adaptador `353ad31`) | R1: C2, C5b, formato 2 y rotación FAIL (H1); T-R5a NO_CONCLUYENTE | Opcional: repetir con el adaptador final (+246/−54 líneas desde `353ad31`) | R decide; T con claves temporales |
| 7 | Restauración en un teléfono de otro modelo | **Prueba técnica pendiente** | El caso D se hizo en el mismo modelo | Restaurar en el HONOR | T con el teléfono y una clave temporal de R |
| 8 | Clave de mínimo privilegio y revocación de las de ensayo | **Parcial**: el adaptador funciona con claves de 4 capacidades y prefijo | Revocación de `b151-*` solo en el comentario 6391397579; no se probó el acceso denegado | Clave productiva por entorno; qué hacer con la clave amplia de #149; opcional: prueba de acceso denegado | R; producción |
| 9 | Monitorización, `--reconcile`, rotación y costos | **Operación productiva pendiente**, más una prueba técnica | Los códigos de limpieza pendiente existen y están probados | Probar `backups:inventory --reconcile` contra un prefijo de ensayo en B2; alertas, rotación y costos | T (CLI); producción y R |
| 10 | Retención de `.previo` | **Parcial**: 2 y 7 días implementados; #172 protege `interrupted` y `retained` (H) | — | En D: plazo, cota e `interrupted`; una cota para `retained`; la política con datos reales | T con teléfono; R y Directiva |
| 11 | Límites de uso declarados | Límites declarados, no defectos | UPLOADING abandonada, cerrada en B2 (C5b) | Procedimiento operativo y aceptación | Producción; R |
| 12 | Política institucional de retención | **Decisión institucional pendiente** (GOV-02 #185) | — | Plazo, copias, purga y cierre de cuenta | Directiva con R |
| 13 | Cifrado en reposo exigible | Técnica acreditada en lo sintético (formato 2 en B2; caso D) | R1: formato 2 FAIL (H1) | `BACKUP_REQUIRE_CLIENT_ENCRYPTION=true`; revisar `cryptography`; comprobar con personas cómo se guarda la clave | R y Directiva; producción; R y tutor |
| 14 | Admisión productiva, contrato y comunicación | **Institucional y productiva pendiente** | — | Las condiciones del §5 del modelo de amenazas | R, Directiva y producción |
| 15 | Reglas del bucket fuera del prefijo de ensayo | **Decisión pendiente** | Solo se observó «Keep all versions» | Versiones, lifecycle y Object Lock | R y operación |

**Qué falta para cerrar #151:**
- **(a) Alcance académico:**
  - ítem 7, otro modelo;
  - ítem 10 en D;
  - la CLI contra B2 (ítem 9);
  - opcionales: los ítems 2 y 6 con el adaptador final y una prueba de acceso denegado.
- **(b) Solo producción:**
  - clave productiva;
  - alertas, rotación y costos;
  - procedimiento para los límites;
  - cifrado exigible;
  - TLS, cupo y respaldo del almacenamiento.
- **(c) Institucional (GOV-02 #185):** ítems 12, 13, 14 y 15, y la política de `.previo`.

**#151 no se cierra** y su alcance no cambia.

## 6. Trabajo técnico realmente restante

**Sin teléfono (T):**
- **Pruebas que faltan:**
  - #18: 403/404 y `fromEnvironment`;
  - #45: «supera el saldo» y compra revertida;
  - #122: la versión de necesidad posterior a hoy;
  - #44: simular la cámara en una prueba de widget;
  - repetir la prueba de #83 con su SHA.
- **Índice en `docs/evidence/`** para #18–#22.
- **Correcciones documentales en Mobile:**
  - `docs/13_LOCAL_STORAGE.md` (fotos en el respaldo);
  - la referencia de la foto alterada de la REC;
  - F08-ADR-003 §0.4, para el caso D cubierto.
- **Correcciones documentales en Backend:**
  - §6 de `F05_SYNC_06.md`;
  - el acta de GATE-F05.
- **Anexos de comentario** en #28, #50 y #149 (§8).
- **#151 ítem 9:** `backups:inventory --reconcile` contra un prefijo de ensayo en B2, con una clave temporal que debe crear R.

**Con teléfono (T con R):**

| Teléfono | Pruebas |
|---|---|
| POCO | #19 C y F; #20 Auto Backup y D2D; #21 21-E; #76 otro Member; #121 R-03 en aplicación; #125 día inicial; #28 transferencia en D; #49 modo compartido; #97 nombre largo en compartido; #151 ítem 10 (`.previo`); filas alcanzables de BE #18 |
| HONOR | #129 M8 A4-F; #36 y #151 ítem 7: restauración en otro modelo |

**Ningún defecto técnico nuevo** apareció en esta revisión que obligue a corregir código. Los pendientes son pruebas no ejecutadas y documentos desactualizados.

## 7. Decisiones exactas del autor

1. **#107:** A1–A7 de `F07_POL_01_REVISION_INSTITUCIONAL.md` §7.3, con la fórmula «Verificado por Roderich Rendón (autor) el <fecha real>».
2. **GATE-F07:** opción A, B o C de `F07_CIERRE_MATRIZ.md` §7.3.
3. **Ratificar o no** GATE-F03 y GATE-F04, ambos Passed por delegación y sin revisión personal registrada. Para GATE-F04, después de corregir la cita de P9.
4. **Excepciones explícitas o mediciones**, ítem por ítem:
   - E-1 de #71;
   - corte de energía (#20);
   - 21-E (#21);
   - cambio de zona (#121);
   - pantalla desactualizada (#125);
   - lo que es solo H en #122 y #76;
   - C y F de #19;
   - R-03 en aplicación (#121);
   - la transferencia en D (#28);
   - otro modelo (#36);
   - P10 (#97);
   - las filas inalcanzables de BE #18 como N/A.
5. **Criterios recortados por delegación:**
   - #24 (criterio 4) y #25 (criterios originales): excepción explícita o mantener Partial;
   - #32, #33, #34 y #21: confirmar si la ratificación del contrato vale como cumplimiento.
6. **Confirmaciones sin trabajo técnico pendiente:** #73, #82 y, tras su anexo, #50 y #149. Pasan a Verified solo con tu confirmación.
7. **Especificación** de #45 y #49 (sin RF propio), con el tutor.
8. **#151:** qué se hace con la clave amplia de #149; si se repiten los ítems 2 y 6 con el adaptador final; cuándo se hace la restauración en otro modelo.

## 8. Cambios administrativos preparados (no aplicados)

| Ítem | Cambio | Valor esperado | Condición |
|---|---|---|---|
| MOB #178 | Gate vacío → N/A | Gate = N/A | Confirmación del autor (no es un gate real) |
| MOB #28 | Comentario anexo: corrección de la cita de P9 y D-F04-C1 superado | Sin cambiar campos | Autorización |
| MOB #50 | Comentario anexo: reversión sin red medida en D (caso A) | Sin cambiar campos | Autorización |
| BE #149 | Comentario anexo: evidencias del 2026-10-24 frente a sus criterios | Sin cambiar campos | Autorización |
| #73, #82, #50, #149 | Evidence Partial → Verified | Verified | **Solo con tu confirmación** (§7.6) |

## 9. Cierre académico frente a preparación productiva

| | Cierre académico de OE3 | Preparación productiva |
|---|---|---|
| Qué exige | Que cada criterio esté acreditado, o exceptuado de forma explícita por el autor, con datos sintéticos y su procedencia (HOST, EMULADOR o DEVICE) | Las validaciones de la Directiva y del tutor, las decisiones de GOV-02 (#185) y la operación: claves, alertas, retención, cifrado exigible, TLS, cupo, contrato y comunicación |
| Estado | **Incompleto:** GATE-F07 Pending; #107 y #151 abiertos; 32 cerrados con Partial, cuyos pendientes reales están en §4 | **No iniciada:** `POLICY_PENDING` en producción, `BACKUP_PRODUCTION_ADMISSION=disabled`, `COLLECTIVE_SEALING` desactivado y sin datos reales |
| Lo que lo cierra | §6 (pruebas) y §7 (decisiones del autor) | §5 (b) y (c), y la hoja de revisión §7.2, nivel 5 |

**OE3 no está completo.** Para cerrarlo académicamente hacen falta las decisiones del §7 y el trabajo del §6, o excepciones explícitas del autor por escrito. Las aprobaciones de la Directiva y del tutor solo son necesarias para #107 y para la admisión real, a menos que el autor decida separar ambas cosas (§7.2).
