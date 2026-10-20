# F08-BKP-08 (#151 §B y §C): propuesta de operación del respaldo privado

- **Fecha real:** 2026-10-19. Sesión C, sobre Backend `main` `769d441` y Mobile `463d3ec`.
- **Estado:** **propuesta para revisión. No implementa nada**, no cambia código, esquema, bucket, política ni gates, y no define un formato ni una migración.
- **Fuentes:**
  - [`F08_BACKUP_THREAT_MODEL.md`](F08_BACKUP_THREAT_MODEL.md) §3–§5;
  - [`F08_BKP_06_RETENCION.md`](F08_BKP_06_RETENCION.md) §2, §6, §7 y §10;
  - `docs/evidence/F08_BKP_07_B2_ENSAYO_REAL.md` §0 y §4.
- **Trazabilidad (Cap. III):** RF-26, RF-27, RNF-04 y RNF-10.

**Qué no cambia:**
- Las **5 copias** por Member (`BACKUP_MAX_ACTIVE_PER_MEMBER`) siguen siendo una **decisión técnica para la entrega académica, no una política aprobada** (#151 ítem 12).
- `BACKUP_PRODUCTION_ADMISSION` sigue cerrada.
- Las decisiones del §C de #151 (ítems 12–15) son de Roderich. Esta propuesta sólo da opciones, impacto y condiciones de aceptación.

Cada punto lleva tres partes:
- **Alcance:** qué cubriría.
- **Impacto:** qué tocaría (Backend, Mobile, operación).
- **Condiciones de aceptación:** cómo se comprobaría que está hecho.

## 1. Claves del proveedor: mínimo privilegio, rotación y caducidad (ítems 8 y 9)

**Hoy:**
- El ensayo de #149 usó una clave amplia, sin prefijo y con capacidades de bucket. Fue una desviación aceptada y **no vale para datos reales** (`F08_BKP_07_B2_ENSAYO_REAL.md` §0).
- Las tres claves de #151 (`rw`, `ro`, `nodel`) caducan solas a los 3 días.
- La API lee `BACKUP_S3_*` al arrancar, así que cambiar la clave exige reiniciarla.

**Alcance propuesto:**
- **Una clave por entorno.** Debe tener sólo `listFiles`, `readFiles`, `writeFiles` y `deleteFiles`, el bucket de ese entorno y su prefijo. Se crea por la API (`crear_clave_restringida_b2.ps1`), porque la consola añade capacidades de bucket.
- **Ninguna clave de administración en el servidor:** ni `writeKeys`, ni `writeBuckets*`, ni `shareFiles`.
- **Rotación con solapamiento**, cada 90 días y de inmediato ante una sospecha de compromiso:
  1. crear la nueva;
  2. comprobarla con `comprobar_b2.ps1` (bucket, prefijo y capacidades exactos);
  3. desplegar y reiniciar;
  4. ejecutar un `backups:inventory` de solo lectura con la nueva;
  5. revocar la anterior.
  - B2 admite varias claves vivas a la vez, así que no hace falta una ventana sin servicio.
- **Caducidad:** el servidor no usa claves con caducidad automática (`validDurationInSeconds`). Una caducidad inesperada dejaría las subidas en 503 y las purgas pendientes. Se rota por calendario. Las claves de ensayo sí caducan solas.
- **Custodia:** fuera de los repositorios, como hoy (DPAPI en el PC del ensayo). En un despliegue, en el gestor de secretos del entorno. Nunca en `.env` versionado, logs ni evidencias.

**Impacto:**
- Ningún cambio de código.
- Operación: un procedimiento escrito y un recordatorio de rotación.

**Condiciones de aceptación:**
- `comprobar_b2.ps1` muestra, para la clave del servidor, sólo las 4 capacidades, un bucket y un prefijo.
- El ítem 1 de #151 está superado con B2 real: una clave sin escritura o sin borrado da un error cerrado sin perder copias. Herramienta: `tool/f08_b2/b151_b2.cjs`.
- Hay un acta de una rotación real con la clave anterior revocada.
- Las claves de ensayo están revocadas (`revocar_claves_b151.ps1`) o caducadas.

## 2. La última copia válida

**Hoy:**
- La retención nunca deja al Member sin su última copia válida (R2). Retira sólo cuando *A* > N y nunca la recién verificada.
- El propietario sí puede borrar su última copia (R7, contrato vigente).
- Si el proveedor rechaza los borrados, no se pierde ninguna copia válida. La cota cierra las subidas con 503 hasta que se reconcilie (T-R5; ítem 6 de #151 contra B2 real, pendiente de ejecución).

**Alcance propuesto:**
- Mantener R2 y R7 sin cambios.
- Añadir dos salvaguardas de operación:
  1. **Alerta** cuando un Member con copias tenga 0 `AVAILABLE` y alguna purga pendiente, o cuando su última copia tenga más de X días. X lo decide la política.
  2. **Mobile:** al borrar la última copia, un aviso explícito de que el servidor quedará sin respaldo. Es Mobile, fuera del Backend.
- Una copia que deja de verificarse al descargarla (500 `BACKUP_INTEGRITY_FAILED`) **no se borra sola**. Se informa y la decide el operador.

**Impacto:**
- Backend: sólo métricas e inventario (§4).
- Mobile: un texto de confirmación.

**Condiciones de aceptación:**
- La prueba existente de R2 sigue en verde.
- El ítem 6 (T-R5) está superado contra B2 real.
- La alerta está definida con su umbral aprobado.

## 3. Copias `.previo` de la app (ítem 10)

**Hoy (Mobile `463d3ec`, `lib/data/backup_service.dart`, alrededor de la línea 905):** cada restauración guarda, antes de reemplazar:
- la base actual como `<base>.previo-<fecha>.db`;
- la carpeta de facturas como `<facturas>.previo-<fecha>`.

No hay ningún código que las retire, así que **se acumulan en cada restauración**. Cada una ocupa una base completa más sus fotos, con datos personales en claro en el almacenamiento de la app.

**Alcance propuesto:**
- Conservar **sólo la copia `.previo` más reciente**.
- Retirar las anteriores **después** de que la restauración nueva haya terminado y la base restaurada se haya abierto y validado. Nunca antes, porque son el *rollback* de la restauración en curso.
- Quizá también retirar la última tras un plazo, por ejemplo 7 días, o tras la siguiente copia remota verificada. Lo decide la política.
- Mostrar en la pantalla de respaldo cuánto ocupan.

**Impacto:**
- Sólo Mobile: la limpieza después de la restauración y sus pruebas, incluidos el fallo a mitad y el *rollback*.
- Ningún cambio en el Backend ni en el formato del respaldo.

**Condiciones de aceptación:**
- Tras 3 restauraciones seguidas queda 1 sola `.previo`.
- Una restauración que falla conserva la `.previo` que necesita su *rollback*.
- Las pruebas de rollback de `f04_restore_authorization_test.dart` siguen en verde.
- Prueba en el dispositivo con medición del espacio antes y después.

## 4. Reconciliación periódica, alertas, capacidad y costos (ítems 9 y 11)

**Hoy:**
- Existen `npm run backups:inventory` (solo lectura), `-- --reconcile [--apply]` y `-- --cleanup --older-than-minutes <N> [--apply]`.
- La reconciliación también corre antes de cada subida del Member.
- No hay tarea periódica ni alertas.

**Alcance propuesto:**
- **Reconciliación diaria:**
  1. `--reconcile` sin `--apply`: se guarda el recuento por motivo;
  2. `--reconcile --apply`;
  3. inventario de solo lectura.
  - Es idempotente: pueden convivir dos ejecuciones.
- **La limpieza manual** (`--cleanup`) sigue siendo manual. Siempre va seguida de `--reconcile` (límite declarado).
- **Alertas,** sólo con recuentos y sin identificadores:
  - purgas pendientes de más de 24 h, por motivo;
  - filas `UPLOADING` de más de 60 min (el 409 colgado tras un reinicio, límite del §10 de #40);
  - `failedWithObject` (una copia tardía tras un `commit` agotado);
  - `hiddenVersion` e `incompleteUpload` distintos de 0;
  - 503 `BACKUP_STORAGE_UNAVAILABLE` por encima de un umbral;
  - una clave rechazada por B2 (401/403).
- **Capacidad.** La cota por Member es de N + 1 objetos, cada uno de `BACKUP_MAX_BYTES` como mucho. Con los valores por defecto son 6 × 100 MB = 600 MB por Member en el peor caso.
  - Fórmula de planificación: peor caso = Members con respaldo × (N + 1) × `BACKUP_MAX_BYTES`. Uso real = la suma de las versiones del inventario, **incluidas las ocultas**, porque en un bucket «Keep all versions» también se facturan.
  - Falta un **cupo global** por tenant o por bucket (condición 5 del §5 del modelo de amenaza). Se propone medirlo primero con el inventario y decidir el límite con datos.
- **Costos.**
  - Almacenamiento: GB-mes de todas las versiones.
  - Transacciones: cada subida hace unas 10 llamadas (`PutObject` o multipart, `HeadObject`, `CopyObject`, listados y borrados por versión).
  - Descargas: el tráfico de salida.
  - Se calculan con la **tarifa vigente del proveedor en el momento del contrato**. Esta propuesta no fija precios.

**Impacto:**
- Operación: el programador de tareas y el canal de alertas.
- Backend: sólo si se quiere exponer los recuentos como métricas, que es un cambio menor a decidir.

**Condiciones de aceptación:**
- Una semana de ejecuciones diarias registradas con recuentos estables.
- Una alerta provocada a propósito en un entorno sintético, por ejemplo con la clave `nodel`, llega al canal.
- Hay una estimación de capacidad y costo con los Members reales previstos.

## 5. Cifrado y recuperación de claves (ítem 13)

**Hoy:**
- Cifrado SSE-B2 (`AES256`, comprobado en #149), gestionado por Backblaze.
- Protege los discos del proveedor.
- **No protege frente a quien tenga una clave de lectura del bucket o el servidor**: el operador del Backend (T3).
- El SHA-256 sólo da integridad respecto de una referencia confiable (T4).
- **No cumple la condición 2 del §5 del modelo de amenaza.**

| Opción | Quién conoce la clave | Protege de T3 (operador) | Coste principal |
|---|---|---|---|
| SSE-B2 (actual) | Backblaze | No | Ninguno |
| SSE-C (el servidor envía la clave en cada petición) | El servidor | No: el operador la tiene | Gestión de claves en el servidor, sin ganar confidencialidad frente al operador |
| **Cifrado del lado del cliente** con una clave que el servidor no conoce | Sólo el agricultor (su teléfono o su frase) | **Sí**, y añade autenticidad frente a un servidor que sustituya la copia (parte de T4) | Recuperación de la clave; un formato de contenedor cifrado |

**Evaluación del cifrado del lado del cliente:**
- **Cómo funcionaría:** el teléfono cifra el contenedor `.agrobackup` con un algoritmo autenticado (AEAD), con una clave aleatoria por cuenta. Esa clave se guarda envuelta con otra derivada de una **frase o código de recuperación** del agricultor, mediante un KDF lento como Argon2id. El servidor sólo ve bytes opacos y su SHA-256. La API, la retención y el inventario no cambian.
- **Recuperación en un teléfono nuevo:** el agricultor inicia sesión, descarga la copia e introduce su código de recuperación. Sin el código, la copia **no se puede abrir**, y nadie puede ayudarle: ni la Directiva, ni el Administrador, ni el operador. Esa es justamente la propiedad que buscamos.
- **Pérdida de la clave:**
  - si pierde el teléfono y el código, pierde el respaldo;
  - un **depósito de la clave** (*escrow*) en el servidor o en la Directiva devolvería el acceso al operador o a terceros y anularía la ventaja frente a T3;
  - en un colectivo con baja familiaridad digital, el riesgo de pérdida es real y debe pesarse frente al de exposición.
- **Diferencia con SSE-B2:** SSE-B2 cifra «para Backblaze» y descifra para cualquiera con una clave de lectura válida. El cifrado del cliente cifra «para el agricultor». Pueden coexistir: SSE-B2 seguiría activo como defensa en profundidad.
- **Lo que esta propuesta no hace:**
  - no define el formato cifrado ni su versión: existe la cabecera `X-Backup-Format-Version`, pero el formato sería un diseño aparte;
  - no propone una migración de las copias existentes. Todas son sintéticas, y lo razonable sería que las copias cifradas convivieran con las anteriores hasta su retirada por rotación.

**Impacto:**
- Mobile: cifrado, descifrado, gestión del código de recuperación y su pantalla. Es el grueso del trabajo.
- Backend: ningún cambio funcional, salvo quizá aceptar el nuevo valor de formato.
- Operación: comunicación al colectivo (DEC-F01-10), porque el soporte ya no podrá recuperar copias.

**Condiciones de aceptación,** si Roderich lo exige para datos reales:
- Decisión escrita entre (a) sólo SSE-B2, con el riesgo T3 aceptado de forma explícita, y (b) cifrado del cliente, con el riesgo de pérdida aceptado.
- Con (b):
  - una prueba de que una copia descargada por el operador desde B2 no revela el marcador sintético;
  - una restauración en un teléfono de **otro modelo** con el código (ítem 7 de #151);
  - una prueba de rechazo con el código equivocado y con la copia alterada;
  - la comunicación al colectivo.

## 6. Cierre de cuenta o fin del servicio

**Hoy:**
- Con un Member, una cuenta o un tenant inactivos, la API corta el acceso (401/403, revalidación de Auth V2). **Sus bytes siguen en el bucket**: no hay purga ligada al cierre.

**Alcance propuesto:**
- **Cierre de una cuenta,** a petición del titular o por baja:
  1. ofrecer la descarga de sus copias;
  2. borrado lógico de todas ellas (motivo `OWNER` o uno nuevo, a decidir);
  3. reconciliación hasta 0 versiones y 0 marcadores de sus claves.
  - Plazo de gracia a decidir por la política (ítem 12).
- **Fin del servicio o cambio de proveedor:**
  1. aviso al colectivo con un plazo de descarga;
  2. cierre de las subidas (`BACKUP_PRODUCTION_ADMISSION` cerrado);
  3. purga por versión de todo el prefijo, con el procedimiento de `limpiar` de `b151_b2.cjs` llevado a operación;
  4. comprobación de 0 versiones, marcadores y multipart;
  5. revocación de las claves;
  6. acta.
  - **No se depende de borrar el bucket** para borrar los datos. Si hubiera Object Lock o retención, se registraría como impedimento (`F08_BKP_06_RETENCION.md` §7).
- **Copias del propio almacenamiento** (condición 6 del §5): si se replica el bucket, la réplica entra en el mismo procedimiento de cierre.

**Impacto:**
- Backend: posiblemente una orden de operador «purgar un Member», con *dry-run*.
- Operación: el procedimiento y el acta.
- Mobile: ninguno.

**Condiciones de aceptación:**
- Un ensayo sintético de cierre de una cuenta con copias termina con 0 entradas en B2 para sus claves y la fila en estado terminal.
- El procedimiento de fin de servicio está escrito y aprobado.

## 7. Reglas del bucket fuera del prefijo de ensayo (ítem 15)

**Propuesta:**
- No tocar nada por defecto.
- Si se decide algo, que sea una de estas opciones explícitas:
  - un bucket **o** un prefijo por entorno (ensayo, piloto, producción), cada uno con su clave (§1);
  - como mucho, una regla de *lifecycle* que **sólo** cancele los archivos grandes sin terminar tras unos días, como red de seguridad del §4. El adaptador ya purga por versión y no depende de ella.
- Sin Object Lock mientras la retención sea por número de copias. Con Object Lock, `remove` fallaría y las subidas quedarían en 503 por la cota R5.

**Condición de aceptación:** una decisión escrita de Roderich por cada regla que se cambie, y un inventario antes y después.

## 8. Resumen

| Punto | Qué hace falta | Quién | ¿Bloquea los datos reales? |
|---|---|---|---|
| 1. Claves | Clave por entorno con mínimo privilegio, rotación con solapamiento, ítem 1 contra B2 real | Operación, con A como ejecutor del ensayo | Sí |
| 2. Última copia | Alertas y aviso en la app; ítem 6 (T-R5) contra B2 real | Backend/operación; Mobile | Sí: el T-R5 real |
| 3. `.previo` | Conservar sólo la más reciente, tras una restauración validada | Mobile | No, pero conviene antes del piloto con datos reales |
| 4. Reconciliación y capacidad | Tarea diaria, alertas, cupo global medido, costos con la tarifa vigente | Operación; Backend si hay métricas | Sí: condición 5 del §5 |
| 5. Cifrado | Decisión (a) o (b); con (b), el diseño del formato y las pruebas del §5 | Roderich; Mobile | Sí: condición 2 del §5 |
| 6. Cierre | Purga por cuenta y procedimiento de fin de servicio | Backend/operación | Sí: depende de la política del ítem 12 |
| 7. Bucket | Ningún cambio salvo decisión explícita | Roderich | No |

**Fuera de esta propuesta:**
- la política institucional (ítem 12);
- la elección de cifrado (ítem 13);
- la admisión productiva y el contrato (ítem 14);
- la restauración en otro modelo de teléfono (ítem 7).

Todos siguen pendientes de decisión o de ejecución.
