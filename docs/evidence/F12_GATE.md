# GATE-F12 (#184) — Acta propuesta: estimación temporal del consumo con datos sintéticos

**Gate: Passed, exclusivamente para el alcance académico con datos sintéticos** (decisión de Roderich del 2026-11-03, en [`F12_GATE_DECISION.md`](F12_GATE_DECISION.md)). El registro en GitHub se hace después de integrar el PR documental de F12-EST-10.

*Antecedente:* hasta esa decisión, esta acta decía: «**Gate: Pending.** Status propuesto: Validation. **Ese cambio no se aplica:** se presenta como operación en seco (§8).». El resto del acta se conserva como se redactó; la decisión sustituye la operación en seco del §8.

- **Quién la redacta:** la sesión de Claude Code, el 2026-11-03 (UTC), dentro de F12-EST-10 (#183).
- **Qué hace:** reúne la evidencia y lo que falta. **No es una decisión.** Solo Roderich Rendón puede, con confirmación explícita, marcar el gate como Passed, Failed o Waived.
- **Qué no es:** una revisión del tutor, una aprobación de la Directiva ni una aceptación institucional.

**Trazabilidad:** CU-20, CU-21; RF-35 a RF-40; RN-25 a RN-30; RNF-13; INT-09; DAT-18 a DAT-20. Documento: 3.13.2, «Dependencias y aceptación» del incremento 7.

**Base:** Backend `main` `075a511`; Mobile `main` `5b5b318`. **Índice de evidencia:** [`F12_EST_10_INDICE_EVIDENCIA_2026-11-03.md`](F12_EST_10_INDICE_EVIDENCIA_2026-11-03.md).

## 1. Alcance que se propone evaluar

- **Académico, con datos sintéticos.** Ninguna cifra procede del Sindicato. No hay despliegue productivo.
- **Lo construido:**
  - contrato INT-09;
  - series desde cifras publicadas y selladas;
  - motor SES/naive;
  - trabajos por lotes con ejecuciones inmutables y vigencia derivada;
  - pantalla Web institucional;
  - copias sin conexión en la PWA y en Mobile;
  - referencia separada en la propuesta conjunta;
  - evaluación sintética reproducible.
- **Fuera del gate** (según #184): admitir datos reales (GOV-02 #185 y la política #107) y cualquier conclusión sobre precisión con campañas reales.

## 2. Criterios de #184 y su estado propuesto

| # | Criterio | Estado propuesto |
|---|---|---|
| 1 | Cada entregable de F12-EST-01 a F12-EST-10 tiene evidencia enlazada o queda excluido con justificación escrita | **01 a 09:** evidencia enlazada, con su commit, entorno y procedencia, y cada issue cerrado con un comentario por criterio (índice, §1 y §2). **10:** este PR documental, **en borrador y sin fusionar**. Su evidencia es el índice, los manuales y esta acta. Ver §7, decisión D1 |
| 2 | Un NOT_MEASURED o FAIL se conserva como tal | Se conservan en §5 |
| 3 | La decisión la toma Roderich con confirmación explícita, sin atribuirla al tutor ni a la Directiva | Pendiente. Esta acta no decide |

**Lo que el alcance de #184 pide acreditar:**

| Requisito del alcance | Estado | Dónde |
|---|---|---|
| Pruebas en host y con PostgreSQL real | **Acreditado** | Las suites F12 en HOST y en la CI de `main` (`backend-f02.yml`; `075a511`, run 41634027229 en success) |
| Consulta y copia descargada comprobadas en la Web | **Acreditado en HOST con navegador** contra el servidor real | F12-EST-06 y F12-EST-07-WEB |
| Consulta y copia descargada comprobadas en el móvil | **Acreditado en DEVICE** (POCO X5 Pro) contra un Backend real y con un servidor simulado. **EMULADOR no ejecutado** | F12-EST-07-MOB |
| Evaluación sintética ejecutada y conservada, incluidos los conjuntos en que el SES no supera al naive | **Acreditado.** El naive tiene menor MAE en S2, S3 y S4 | F12-EST-09 |

## 3. Evidencia por procedencia

| Procedencia | Qué la cubre | Entregables |
|---|---|---|
| **HOST** (Windows 11, Node 25.9.0, PostgreSQL 16.13 desechable; Flutter 3.47.2 en Mobile) | Contrato y esquema, series, motor, trabajos y vigencia, rutas por HTTP, evaluación sintética, referencia en la propuesta y suite completa Mobile (2237/2237), con fallos de almacenamiento **inyectados** | 01 a 09 |
| **NAVEGADOR** (Edge sin interfaz con puppeteer-core, contra `node dist/main.js` real) | Pantalla institucional (15/15, 33/33 y 5/5); copia de la PWA, con la desconexión **emulada** con DevTools (66/66 y 6/6); referencia en la propuesta (29/29, 1/1 y 2/2, sin el service worker) | 06, 07-WEB y 08 |
| **EMULADOR** | **No ejecutado** en ningún entregable F12 | — |
| **DEVICE con Backend real** (POCO X5 Pro 5G, Xiaomi 22101320G, Android 12; Central desechable con Backend `635cc8f`, por túnel HTTPS temporal; APK de `c127c45` y `5594599`) | Activación; `/results` y `/download`; lectura en modo avión tras reabrir; «Datos insuficientes»; 404 y 409 reales, con la retirada persistente tras reiniciar | 07-MOB |
| **DEVICE con servidor simulado** | `integration_test` 5/5, también con el respaldo y la restauración | 07-MOB |
| **CI** | `main` `075a511` en success (Backend F02 y Web F07). SonarCloud de `main`: **neutral**, «Quality Gate not computed», que no se cuenta como aprobado. CI Mobile de `main` `5b5b318`: 2233 superadas, 0 fallidas y 4 omitidas | Todos |

## 4. Excepciones y decisiones ya tomadas por el autor

| Excepción o decisión | Fecha | Efecto |
|---|---|---|
| **Fallo doble** en Mobile (SQLite y almacenamiento seguro rechazan a la vez la retirada) | 2026-11-03 | La lectura se bloquea en esa ejecución, pero **la retirada no persiste tras reiniciar**. Es una limitación excepcional del alcance académico: no aprueba condiciones de producción ni cambia ningún gate |
| **Filas ocultas** en la propuesta: se muestra la referencia, rotulada aparte | 2026-11-03 | Diferencia deliberada respecto al prototipo W3. El Word no se modifica |
| EST-D-01 a EST-D-17 y la decisión F06 | 2026-11-01 a 2026-11-02 | Contrato §11.1. Ninguna decisión de INT-09 queda pendiente del autor (§11.2) |
| EST-D-17: sin reagrupación retrospectiva de cifras selladas | 2026-11-02 | Precisa el primer criterio de #175 |

## 5. Resultados FAIL, NOT_MEASURED y sin causa confirmada (se conservan)

- **CI de Mobile `main` en `c2ac44a`:** falló, con 2 pruebas de `operation_mode_onboarding_test`. Se diagnosticó como una espera de prueba que no fallaba al agotarse; se corrigió en Mobile #181 (`5b5b318`, success). La causa del retraso en esa CI está **sin confirmar**.
- **Tiempos de 5 s agotados** en suites PostgreSQL locales del Backend, ninguno reproducido al repetir y **sin causa confirmada**:
  - `current-auth-context` (EST-02);
  - `f06-coll-05`, con carga en paralelo;
  - `f12-est-05` (una vez sobre `1f55988`);
  - la suite de EST-08.
- `f10_x01_pago_datos_test` (Mobile): una fallida local **sin reproducir ni clasificar**.
- **EST-01:** el rechazo HTTP sin permiso estaba «especificado, no ejecutado» en su bloque; el 403 se probó después en EST-05.
- **EST-06:** en su PR, `verify` quedó «omitido, no aprobado», y tampoco corrió en su merge `b68eca0`. Sí se ejecutó, en success, en merges posteriores de `main` que incluyen ese código (`3d2ab4b`, `635cc8f` y `075a511`).
- **EST-07-WEB:** una reproducción intermedia dio 61/66 sobre `654ed43`. El recorrido final, sobre `1d29eb0`, dio 66/66.
- **EST-07-MOB:** el cierre de sesión y el cambio de identidad, **«Cumple en HOST»**, no en el teléfono.
- **EMULADOR:** NOT_MEASURED en todo F12.
- **Precisión con campañas reales:** NOT_MEASURED por definición del alcance. En la evaluación sintética, el SES no supera al naive en S2, S3 y S4.

## 6. Pendientes institucionales, fuera de la aceptación académica

- **Política de divulgación** `F07-POL-01` (#107, abierta), hoy `PROVISIONAL_SYNTHETIC` y no aprobada. Sin ella no hay cifras reales. La proyección de la estimación al Agricultor (EST-D-05) debe contemplarse en la política antes de usar datos reales.
- **GOV-02** (#185, abierta): la retención de ejecuciones, resultados y copias.
- **Datos reales:** el primer resultado `ESTIMATED` exigiría tres campañas consecutivas selladas **después** de la migración de F12. Las campañas ya selladas no tienen cobertura de consumo.
- **Operación productiva:** no existe. La revocación sin conexión y la identidad de la sesión, no de la persona, son límites del diseño.
- **Numeración.** El contrato y dos evidencias escriben «GOV-02 (#107)». En GitHub, #107 es `F07-POL-01` y GOV-02 es #185 (índice §4).

## 7. Decisiones que corresponderían a Roderich

| | Decisión | Opciones |
|---|---|---|
| D1 | ¿F12-EST-10 cuenta como evidencia con este PR en borrador, o debe integrarse antes de decidir? | Integrar el PR documental y luego decidir / decidir sobre la rama |
| D2 | ¿Basta la cobertura de Mobile sin EMULADOR, con DEVICE real y simulado? | Aceptar / exigir un emulador |
| D3 | ¿Se aceptan como suficientes en HOST el cierre de sesión y el cambio de identidad de Mobile? | Aceptar / exigir DEVICE |
| D4 | ¿Se aceptan los tiempos agotados sin causa confirmada y `f10_x01` como hallazgos aparte? | Aceptar como hallazgos / exigir diagnóstico antes del gate |
| D5 | ¿Se confirma que la evaluación sintética, con el naive mejor en S2–S4, cumple RNF-13 para el alcance académico? | Confirmar / pedir otro protocolo |
| D6 | Resultado del gate para el alcance académico con datos sintéticos | **Passed** / **Failed** / **Waived**, o mantener **Pending**, con las condiciones que se anoten |

Si se decide, la decisión se registra en un archivo aparte (como en GATE-F08), con su fecha y la confirmación explícita, y solo entonces se actualizan los campos del Project.

## 8. Operación en seco (no aplicada)

| Ítem | Campo | Ahora | Propuesto |
|---|---|---|---|
| #184 GATE-F12 (`PVTI_lAHOCqRNPM4BjfE1zhFC5RM`) | Status | Backlog | **Validation** |
| #184 | Gate | Pending | Pending (sin cambio) |
| #184 | Evidence | Pending | sin cambio hasta la decisión |

```
gh project item-edit --id PVTI_lAHOCqRNPM4BjfE1zhFC5RM --project-id PVT_kwHOCqRNPM4BjfE1 \
  --field-id PVTSSF_lAHOCqRNPM4BjfE1zhiTNa8 --single-select-option-id f1e35904   # Status = Validation
```

No se ejecuta sin la confirmación de Roderich.
