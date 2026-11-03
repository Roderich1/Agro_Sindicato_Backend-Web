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
| 10 | Retención de `.previo` | **Parcial**: 2 copias y 7 días implementados. La **excepción vigente** (F08-ADR-003 §7.2; #172) protege las `interrupted` y `retained` fuera del plazo y de la cota hasta que el titular confirme la recuperación (H) | — | En D: el plazo y la cota de las copias resueltas, como mejora de cobertura; el plazo exige mover el reloj, lo que necesita una autorización específica. Una `interrupted` no puede provocarse en Android sin un gancho de prueba. **No hay que implementar ninguna cota ni purga para `retained`**: es la excepción aceptada. Falta la política con datos reales | T con teléfono (mejora); R y Directiva (política) |
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

## 10. Segunda pasada (2026-11-03): reclasificación y cambios aplicados

### 10.1 Cambios administrativos aplicados

Autorizados por Roderich el 2026-11-03, registrados antes de aplicarlos y releídos después.

| Ítem | Cambio | Valor releído |
|---|---|---|
| MOB #178 | Gate vacío → N/A | Done · Gate N/A · Verified |
| MOB #28 | [Anexo](https://github.com/Roderich1/AppMovilAgroquimico/issues/28#issuecomment-6608323341): cita de P9 corregida y D-F04-C1 superado | Sin cambios de campos: Done · Passed · Partial |
| MOB #50 | [Anexo](https://github.com/Roderich1/AppMovilAgroquimico/issues/50#issuecomment-6608324424) por criterio. La doble reversión (`rec_050`) y la confirmación (`destructive_actions_test`) ya estaban cubiertas; reversión sin red en DEVICE (caso A) | **Evidence Verified** |
| BE #149 | [Anexo](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/149#issuecomment-6608326279) por criterio con las evidencias del 2026-10-24 | **Evidence Verified** |
| MOB #73 | Los cuatro criterios en HOST con mutaciones; ninguno exige DEVICE | **Evidence Verified** |
| MOB #82 | Los cuatro criterios en la CI con el paso TZ | **Evidence Verified** |

En ninguno se registra una inspección personal del autor. Verified se refiere a los criterios de cada issue.

### 10.2 Reclasificación de los pendientes

Cinco clases:
- **(C) criterio de aceptación pendiente;**
- **(M) mejora de cobertura deseable**, que ningún criterio exige;
- **(D) documentación desactualizada;**
- **(A) decisión de alcance** del autor;
- **(I) condición institucional o productiva.**

No se exige DEVICE cuando el criterio admite HOST (`OE3_PLAN_DEVICE_B2_2026-11-03.md` §1).

| Ítem | Pendiente | Clase | Cómo se resuelve |
|---|---|---|---|
| MOB #18 | Pruebas de 403/404 y de la configuración desde el entorno | C (HOST) | PR de pruebas HOST de OE3 |
| MOB #18–#22 | Índice en `docs/evidence/` | D | Ídem |
| MOB #19 C y F; #20 Auto Backup y D2D; #21 21-E; #71 E-1 | Filas de teléfono sin medir | M | Plan del POCO (P-01 a P-04); Auto Backup y D2D necesitan una autorización específica |
| MOB #20 | Corte de energía | A | Excepción E-F03-4 o una autorización |
| MOB #23 / #28 | Ratificación de los gates por el autor | A | `OE3_DECISIONES_BORRADOR_2026-11-03.md` §1–§2 |
| MOB #28 | Cita de P9 y D-F04-C1 | D | Anexo aplicado (§10.1) y corrección en el PR Mobile |
| MOB #28 | Transferencia en DEVICE | M | P-08, o la excepción E-F04-1 |
| MOB #36 | Otro modelo | A (equivalencia aprobada por delegación) | Ratificar o hacer H-02 |
| MOB #44 | Cámara | C (HOST con doble) | PR de pruebas HOST |
| MOB #44 | `docs/13` y la procedencia de la foto alterada | D | PR Mobile |
| MOB #45 | «Supera el saldo» y compra revertida | C (HOST) | PR de pruebas HOST |
| MOB #45 / #49 | Requisito formal | A (con revisión del tutor) | PR Mobile de especificación (propuesta) |
| MOB #49 | Modo compartido en DEVICE; inmutabilidad solo de aplicación | M; A | P-09; decisión del autor |
| MOB #76 | «Otro Member» en DEVICE | M | P-05 |
| MOB #83 | SHA de la prueba | D | Repetición registrada en el PR de pruebas HOST |
| MOB #97 | Nombre largo en compartido | M | P-10 |
| MOB #121 | R-03 en aplicación en DEVICE | M | P-06 |
| MOB #122 | Versión de necesidad posterior a hoy | C (HOST) | PR de pruebas HOST |
| MOB #125 | Día inicial en DEVICE | M | P-07 |
| MOB #129 | M8 A4-F en el HONOR | **C (DEVICE)** | H-01: **requiere conectar el HONOR** |
| BE #18 / #19 | 22 filas Mobile NOT_MEASURED | M (criterio 10 cumplido) | Servidor real (5 filas) o transporte controlado (16), con modos nuevos del arnés; C36 es I |
| BE #19 | Acta con REJECTED sin D y D-F04-C2 | D | Actualización del 2026-11-03 en `F05_GATE_DECISION.md` |
| BE #18 | §6 de `F05_SYNC_06.md` | D | Precisión del 2026-11-03 |
| BE #21, MOB #32/#33/#34 | Criterios reescritos por el contrato F06 | A | Confirmación del autor |
| BE #22 | Depende de #107 y del tutor | I | Hoja de revisión §7 |
| BE #24 / #25 | Criterios recortados por delegación | A | Excepción (decisiones §3) |
| BE #29 | Criterio 9 | A (opción B) o I (opción A) | Decisiones §3 |
| BE #107 | Decisión del autor, Directiva y tutor | I | Hoja de revisión §7.3 |
| BE #151, punto 7 | Otro modelo | C (DEVICE) | H-02, con B2 (B-1) o desde archivo local, rotulado como tal |
| BE #151, punto 9 | CLI contra B2 | C (técnico) | B-2: **sin credenciales autorizadas** |
| BE #151, punto 10 | Plazo y cota en DEVICE | M. El plazo exige mover el reloj (no autorizado) | P-11 solo para la cota. **No hace falta ninguna cota ni purga para `retained`**: es la excepción vigente |
| BE #151, puntos 8, 11–15 | Claves productivas, operación, retención, cifrado exigible, admisión y bucket | I | GOV-02 (#185) y producción |

**Corrección del texto anterior.** La fila del punto 10 del §5 presentaba «una cota para `retained`» como pendiente. No lo es: la excepción vigente (F08-ADR-003 §7.2; #172) protege esas copias fuera del plazo y de la cota hasta que el titular confirme la recuperación. Queda declarado como límite («las `retained` se acumulan sin cota»), no como funcionalidad obligatoria.

## 11. Ejecución del 2026-11-03 (tarde): resultados

Fuentes:
- **HOST:** Mobile PR #183 (`test/oe3-host-cierre`, head `70702bd`; último código `62df336`), evidencia `docs/evidence/OE3_HOST_CIERRE_2026-11-03.md`.
- **DEVICE:** Mobile PR #184 (`test/oe3-device`, `b6bd5e5`; APK de `b7a9813`), evidencia `docs/evidence/OE3_DEVICE_POCO_2026-11-03.md`.
- **Especificación:** Mobile PR #182 (propuesta, no aprobada).

Ninguno está fusionado. **No se cambió ningún campo del Project ni ningún gate** por estos resultados.

### 11.1 Criterios que pasan a estar acreditados

| Ítem | Criterio o fila | Procedencia | Resultado |
|---|---|---|---|
| MOB #18 | 403 y 404 en seis operaciones; `AGRO_API_BASE_URL` ausente, válida, http e ilegible | HOST, con 4 variantes de compilación | PASS, con mutaciones que fallan |
| MOB #45 | Pago que supera el saldo; compra revertida, con y sin pago previo | HOST | PASS, con mutaciones |
| MOB #122 | Necesidad con versión posterior a hoy, incluida una CANCELLED | HOST | PASS, con mutaciones |
| MOB #44 | Camino de la cámara con un **doble de prueba** (`ImagePickerPlatform`), cancelación y permiso negado | HOST. **No es una cámara física** | PASS, con mutaciones |
| MOB #83 | Repetición sobre un SHA registrado: `remote_session_screen_test` 11/11 en `46d09e5` (mismo código que `62df336`) | HOST | PASS |
| MOB #19 | DEVICE-C (corte durante el vínculo) y DEVICE-F (mismo proceso, vía «Volver a autenticar») | DEVICE | PASS |
| MOB #21 | 21-E: almacén entero dañado | DEVICE | PASS. Siguen NOT_MEASURED la versión incompatible y el Keystore |
| MOB #71 | E-1 con el escaneo ampliado | DEVICE | PASS |
| MOB #76 | Criterio 4, sesión de otro Member | DEVICE | PASS |
| MOB #121 | R-03 en la aplicación | DEVICE | PASS |
| MOB #125 | Sucesora con inicio hoy | DEVICE | PASS |
| MOB #28 | Criterio 4: transferencia y reversión en modo compartido | DEVICE | PASS |
| MOB #49 | Pago a la deuda previa en modo compartido | DEVICE | PASS |
| MOB #97 | Nombre largo con `font_scale` 1,3 | DEVICE | PASS |
| BE #151, punto 10 | Cota de 2 copias finalizadas | DEVICE | PASS. El plazo de 7 días sigue sin medir |
| BE #18 | C10, C16 y C18 | DEVICE contra el servidor real | PASS |
| BE #18 | C19 «producto inactivo» | DEVICE contra el servidor real | PASS. «Inexistente» y «de otro sindicato» siguen sin medir |

**Documentación corregida** en Mobile PR #183:
- `docs/13`;
- la procedencia de la foto alterada (sólo HOST);
- el índice F03 de #18–#22;
- el anexo de GATE-F04: P9 no es una transferencia, y D-F04-C1 está superado;
- F08-ADR-003 §0.4.

En este PR: la §4d de `F05_SYNC_06.md` y la actualización de `OE3_DECISIONES_BORRADOR_2026-11-03.md`.

### 11.2 Fallos u observaciones nuevas

**No apareció ningún defecto confirmado de la app:** `lib/` no cambia en #183 ni en #184.

**Observaciones sin investigar:**
- **Transferencia con «1.5».** La cantidad «1.5», con punto, no avanza «Revisar y confirmar» y no muestra ningún mensaje. Hay que reproducirlo antes de clasificarlo.
- **Sesiones remanentes en Central.** Quedan ACTIVE la sesión sin vincular de un vínculo cortado y la sesión del 401 tras reactivar la cuenta. Decisión del autor: si la desactivación debe revocarlas.
- **Suite HOST completa sobre `62df336`.** Dio 2249 pasan, 3 omitidas y **5 fallan**. Las fallas no son de la rama y cada archivo pasa ejecutado solo; apuntan a esperas bajo la carga de la suite: `f03_access_recovery_app_test`, `f10_x01_pago_revision_test` y `f12_est_07_estimation_ui_test`. Sin corregir.

**Incidente declarado** en la evidencia DEVICE §6: los secretos efímeros del Central desechable aparecieron en la salida de la sesión al detener la API. No están en archivos ni commits, y el entorno está destruido.

### 11.3 No ejecutado y por qué

| Pendiente | Motivo |
|---|---|
| MOB #129 (H-01) y BE #151 punto 7 (H-02) | **El HONOR no estaba conectado.** Se pide sólo ese paso. No se sustituyó por el POCO |
| BE #151 punto 9 (B-2) y B-1 | Sin credenciales B2 autorizadas. El procedimiento está en `OE3_PLAN_DEVICE_B2_2026-11-03.md` §5 |
| MOB #20: Auto Backup, D2D y corte de energía | Requieren un ajuste global, un reset o cortar la energía, y ninguno está autorizado |
| MOB #21: versión incompatible y Keystore | No se puede fabricar sin la clave; el Keystore requiere root |
| BE #151 punto 10: plazo de 7 días | Exige mover el reloj (no autorizado) |
| BE #18: C33 y las 16 filas de transporte controlado | Necesitan modos nuevos del arnés que alteren el cuerpo del envío, y una segunda instalación simultánea para C33. Siguen NOT_MEASURED en DEVICE, con su PASS de HOST |
| MOB #44: cámara física | No se usó la cámara del teléfono. El criterio queda en HOST con un doble |

## 12. Integración y segunda tanda (2026-11-03, noche)

### 12.1 Integrado

| PR | Merge | CI de `main` |
|---|---|---|
| MOB #183 (HOST) | `e5a15c4` (merge commit; rama conservada) | La CI de `e5a15c4` se canceló por la concurrencia al llegar `0752127`. No se relanzó |
| MOB #184 (DEVICE, primera tanda) | `0752127` (merge commit; rama conservada) | **SUCCESS** sobre `0752127`, que contiene los dos |

**Árbol de `main`.** Es `5b5b318` más `docs/`, `test/` (#183) y `docs/evidence`, `tool/` (#184). `lib/` es idéntico a `5b5b318`.

**En borrador, sin fusionar:**
- MOB #182 (especificación);
- MOB #185 (decimales);
- MOB #186 (mensaje de consulta);
- MOB #187 (segunda tanda);
- este PR (#200).

### 12.2 Resultados nuevos

| Ítem | Resultado | Procedencia |
|---|---|---|
| MOB #28 / E-F04-2 | Aplicación multiproducto en modo compartido sin red: PASS | DEVICE |
| BE #18 | C07, C08, C09, C12, C13, C17, C21, C25, C26, C27, C29 (429), C32, C33 y C37 («01»): PASS | DEVICE con el servidor real y transporte controlado; en C12, C13 y C33, otra instalación con guion |
| BE #18 | C28 y el 503 de C29: PASS | DEVICE con **respuesta inyectada** |
| BE #18 | C39: sin DEVICE | Central no reabre una campaña cerrada y la app no reenvía un REJECTED |
| Sesiones | Sin incumplimiento del contrato. La sesión anterior a la reautenticación sigue siendo una credencial válida en el servidor, y las de una cuenta desactivada reviven al reactivarla | API real con un cliente scriptado |

### 12.3 Defectos confirmados y observaciones

**Defectos confirmados,** con corrección en borrador:
1. **Transferencia con «1.5».** El aviso no explica el formato («Seleccione origen, destino…»). Corrección: MOB #185.
2. **Consulta de una operación inexistente.** El aviso muestra `SyncQueryException(404, OPERATION_NOT_FOUND)`. Corrección: MOB #186.

**Observaciones, no confirmadas como defecto:**
- C08 deja una divergencia local, que sólo se da si el cuerpo se altera en tránsito.
- El texto de QUANTITY_INVALID cae en la familia «referencias».
- El botón flotante tapa «Reintentar con esta versión».
- Tras RETRYABLE no hay reintento automático en 40 s.

**La observación anterior** («1.5 sin mensaje») fue un error de captura y queda corregida.

### 12.4 Pendientes

**Por dispositivo:**
- HONOR: #129, la restauración entre modelos (#151 punto 7) y otro modelo para F03 (E-F03-7, MOB #36).
- **Respaldo entre modelos:** la salida del POCO ya está documentada (flujo, ruta y error exacto), y la vía preparada sin credenciales es el almacenamiento en disco del Central desechable, que no es B2.

**Por credencial:** sólo B2 (#151 puntos 7 y 9), con el procedimiento de `OE3_PLAN_DEVICE_B2_2026-11-03.md` §5.

**Por autorización:** Auto Backup, D2D, corte de energía y reloj (E-F03-3, E-F03-4 y el plazo de 7 días).

**Por decisión del autor:** ver `OE3_DECISIONES_BORRADOR_2026-11-03.md` §4.

**Incidente de secretos de la primera tanda:** verificado sin mostrarlos. Eran exclusivos del entorno destruido, con 0 coincidencias en 75 661 archivos y en el entorno, así que no hay ninguna contención pendiente.
