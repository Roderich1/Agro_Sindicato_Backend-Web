# GATE-F12 (#184) — Decisión para el alcance académico con datos sintéticos

## Identificación y autoridad

- **Proyecto:** Agrocuentas, Proyecto de Grado 2026.
- **Fase:** F12, estimación temporal del consumo (incremento 7 del documento). **Gate:** [#184](https://github.com/Roderich1/Agro_Sindicato_Backend-Web/issues/184).
- **Fecha de la decisión:** **2026-11-03** (UTC). La sesión de Claude Code la registra el mismo día, dentro de F12-EST-10 (#183).
- **Procedencia.** Decisión explícita de **Roderich Rendón (Roderich1), propietario del proyecto y autor**, dada en la sesión de trabajo del 2026-11-03:

  > «Acepto F12 para el alcance académico con datos sintéticos y autorizo su cierre documental bajo las siguientes condiciones.»
  >
  > «aceptar GATE-F12 como Passed exclusivamente para el alcance académico con datos sintéticos, una vez integrada la documentación.»
  >
  > «La aceptación no procede del tutor ni de la Directiva y no habilita datos reales ni producción.»
- **Lo que esta decisión no es:**
  - no es una revisión ni una aprobación del tutor;
  - no es una aprobación de la Directiva;
  - no es una aprobación institucional;
  - no es una firma digital;
  - no es una autorización de datos reales ni de producción.
- **Antecedente:** el acta propuesta [`F12_GATE.md`](F12_GATE.md), que se conserva.

## Decisión

- `GATE_F12 = PASSED`
- `SCOPE = ACADEMIC_SYNTHETIC_DATA_ONLY`
- `EVIDENCE = VERIFIED`
- `REAL_DATA_ADMISSION = NOT_GRANTED`
- `PRODUCTION_ADMISSION = NOT_GRANTED`

**Condición de ejecución.** El registro administrativo (Gate Passed, Status Done y Evidence Verified en el Project, y el cierre de #184) se hace **solo después de integrar** el PR documental de F12-EST-10 (#199), que contiene este archivo. El merge de #199 se registra en #184.

**Bases de código evaluadas:**
- Backend `main` **`075a511c777f9e24cb16dc55979faeae5a7e252f`** (tras #198). CI de `main`: Backend F02 (run 41634027229) y Web F07 (run 41634027224) en success. SonarCloud de `main` quedó neutral («Quality Gate not computed») y **no se cuenta como aprobado**.
- Mobile `main` **`5b5b318d789c5c6807ed8769e8322cc3d8094598`** (tras AppMovilAgroquimico#181). CI de `main` (run 41577902321): 2233 superadas, 0 fallidas y 4 omitidas.

**Las evidencias conservan sus SHA específicos.** Ninguna ejecución anterior se reatribuye a estos merges: las versiones probadas, integradas y documentales de cada entregable están en el índice, §1.1.

## Fundamento

**Evidencia y alcance:** [`F12_EST_10_INDICE_EVIDENCIA_2026-11-03.md`](F12_EST_10_INDICE_EVIDENCIA_2026-11-03.md), de F12-EST-01 a F12-EST-09, con las partes Web y Mobile de EST-07, más este bloque documental (F12-EST-10).

| Criterio de #184 | Fundamento |
|---|---|
| Cada entregable F12-EST-01 a F12-EST-10 dispone de evidencia enlazada o queda excluido con justificación | **01 a 09:** evidencia enlazada en el índice, y cada issue cerrado con su comentario por criterio. **10:** índice, manuales, acta y esta decisión, integrados con #199 (decisión D1: integrar antes de registrar) |
| Un NOT_MEASURED o FAIL se conserva | Se conservan (abajo) |
| La decisión la toma Roderich con confirmación explícita, sin atribuirla al tutor ni a la Directiva | Este archivo |

| Requisito del alcance de #184 | Procedencia |
|---|---|
| Pruebas en host y con PostgreSQL real | HOST y CI |
| Consulta y copia descargada comprobadas en la Web | HOST, con navegador contra el servidor real |
| Consulta y copia descargada comprobadas en el móvil | **DEVICE**: POCO X5 Pro 5G (Xiaomi 22101320G), Android 12, con un Backend real y con un servidor simulado |
| Evaluación sintética ejecutada y conservada, incluidos los conjuntos en que el SES no supera al naive | HOST. El naive tiene menor MAE en S2, S3 y S4 |

## Decisiones del autor que acompañan al gate

| | Decisión |
|---|---|
| D1 | Integrar la documentación (#199) antes de registrar el gate |
| D2 | Aceptar DEVICE sin exigir una ejecución adicional en **EMULADOR**, que sigue **no ejecutado** en F12 |
| D3 | Aceptar la cobertura HOST del cierre de sesión y del cambio de identidad en Mobile, **conservando que no se ejercitaron en DEVICE** |
| D4 | Mantener los tiempos agotados y `f10_x01_pago_datos_test` como **hallazgos separados**, sin causa confirmada y **sin declararlos resueltos** |
| D5 | Aceptar la evaluación sintética reproducible como cumplimiento de RNF-13 en este alcance, **sin exigir superioridad del SES sobre el naive** |
| D6 | GATE-F12 = Passed **exclusivamente** para el alcance académico con datos sintéticos, una vez integrada la documentación |

## Excepciones y supuestos aceptados

- **Fallo doble en Mobile** (aceptado el 2026-11-03). Si SQLite y el almacenamiento seguro rechazan a la vez la escritura de la retirada de la copia:
  - la lectura se bloquea en esa ejecución;
  - **la retirada no persiste tras reiniciar**;
  - sin conexión, la copia anterior puede volver a leerse para la misma identidad.

  Es una limitación excepcional del alcance académico. No aprueba condiciones de producción.
- **Filas ocultas en la propuesta conjunta** (2026-11-03). La referencia de la estimación se muestra aunque la necesidad esté oculta, rotulada aparte y sin sustituirla. Es una diferencia deliberada respecto al prototipo W3; el Word no se modifica.
- **Catálogo de campañas completo** (2026-11-03). La consecutividad se determina sobre las campañas registradas y clasificadas. El sistema **no detecta** un período cuya campaña nunca se registró. Es un supuesto explícito del alcance académico, **no una validación automática del calendario** (contrato §11.3, punto 6). Los conjuntos sintéticos mantienen su calendario conocido y sus resultados no cambian.
- **Sesión, no persona; revocaciones desconocidas sin conexión.** Son límites del diseño de las copias, en la Web y en Mobile.

## FAIL y NOT_MEASURED conservados

- **CI de Mobile `main` en `c2ac44a`:** falló (2 pruebas de `operation_mode_onboarding_test`). Se corrigió la espera de la prueba en `5b5b318`. La causa del retraso en esa CI está **sin confirmar**.
- **Tiempos de 5 s agotados** en suites PostgreSQL locales del Backend (`current-auth-context`, `f06-coll-05`, `f12-est-05` y la suite de EST-08): ninguno se reprodujo al repetir y su causa está **sin confirmar**.
- **`f10_x01_pago_datos_test` (Mobile):** una fallida local, **sin reproducir ni clasificar**.
- **EST-06:** `verify` quedó «omitido, no aprobado» en su PR y en su merge `b68eca0`. Corrió en success en merges posteriores.
- **EST-07-WEB:** una reproducción intermedia dio 61/66 (`654ed43`).
- **EMULADOR:** NOT_MEASURED en todo F12.
- **Precisión con campañas reales, ahorro y aceptación institucional:** NOT_MEASURED; fuera del alcance.

## Pendientes institucionales excluidos de esta aceptación

- **Política de divulgación `F07-POL-01`** (#107, abierta): `PROVISIONAL_SYNTHETIC` y no aprobada. Esto incluye la proyección de la estimación al Agricultor (EST-D-05).
- **GOV-02** (#185, abierta): la retención y las decisiones institucionales previas a admitir datos reales.
- **Datos reales y producción:** no admitidos. El primer `ESTIMATED` real exigiría tres campañas consecutivas selladas después de la migración de F12.

**Esta decisión no cambia** otros gates, #107, #185, las políticas institucionales, el Word, los instrumentos, los pilotos ni los resultados experimentales. **Cierra el bloque F12 dentro del alcance aceptado, no el proyecto.**
