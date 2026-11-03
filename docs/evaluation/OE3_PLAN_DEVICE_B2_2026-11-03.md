# OE3: plan del ensayo físico agrupado y de las comprobaciones B2 (2026-11-03)

| Campo | Valor |
|---|---|
| Fecha real | 2026-11-03 (UTC) |
| Base | Mobile `main` `5b5b318`, más el PR de pruebas HOST de OE3 si se integra antes; Backend `main` `5973b49` |
| Dispositivos **conectados** al preparar el plan | **POCO X5 Pro 5G** (Xiaomi `22101320G`, Android 12), por `adb`. **El HONOR JDY-LX3P no está conectado.** |
| Autorizado | Central desechable y túnel HTTPS temporal, con datos sintéticos (instrucción del 2026-11-03) |
| No autorizado sin una autorización específica | Resetear teléfonos, cortar la energía, cambiar el reloj global, tocar pilotos o instalaciones personales |
| Paquete | Aislado, `com.comunidad.agro.agroquimicos.oe3`. No toca los paquetes de pilotos ni de ensayos anteriores |

## 1. Qué exige cada criterio (para no pedir DEVICE donde basta HOST)

| Ítem | Criterio y procedencia exigida | Clase del pendiente |
|---|---|---|
| MOB #19, #20, #21 y #22 | «UNIT / INT / CONTRACT / E2E / DEVICE **según aplique**» | Las filas de teléfono sin medir (#19 C y F; #20 Auto Backup; #21 21-E; logcat de E-1) son **mejora de cobertura deseable**, no criterios pendientes |
| MOB #76 | Los criterios no exigen dispositivo | La variante «otro Member» en el teléfono es **mejora deseable** |
| MOB #121 | «Widget real y dominio; prueba física original sin mover el calendario» (hecha: REP-01) | R-03 en aplicación en el teléfono: **mejora deseable**, si el widget ya lo cubre |
| MOB #122 | «Repetición física del caso» (hecha: R-11) | La «versión de necesidad posterior a hoy» es un **criterio pendiente en HOST**; se ejecuta en el PR de pruebas |
| MOB #125 | «Retest físico acotado» (hecho: R-10); el día inicial, con «fechas relativas controladas» | El día inicial en el teléfono: **mejora deseable** |
| MOB #97 | «Una comprobación en el dispositivo» (hecha: S3) | Nombre largo en compartido: **mejora deseable** |
| MOB #129 | «Repetición física de M8 en el HONOR (A4-F)» | **Criterio pendiente en DEVICE** (HONOR) |
| MOB #36 | «Teléfono nuevo o condición equivalente aprobada» (aprobada por delegación el 2026-10-16) | Otro modelo: es el punto 7 de #151, no un criterio de #36. Ratificar la equivalencia es una **decisión de alcance** |
| BE #151, punto 7 | Restauración en un teléfono de otro modelo | **Criterio pendiente en DEVICE** (HONOR) |
| BE #18 (sincronización) | Criterio 10: «registrar los 40 casos» (hecho, con NOT_MEASURED explícitos). Los criterios 1–9 son de Central (PASS) | Las 22 filas Mobile NOT_MEASURED son **mejora de cobertura**. Ninguna se marca N/A solo porque no pueda provocarse desde un botón (§4) |

## 2. POCO X5 Pro: sesión única

**Preparación (sin intervención humana):**
1. Central propio y desechable desde un worktree con Prisma generado, en un puerto libre, con datos sintéticos; supervisor con los secretos solo en memoria (patrón `tool/f12_est_07/est164_supervisor.sh`).
2. Túnel HTTPS temporal (`cloudflared` de `_wt/tools/cloudflared-2026.10.0/`), cerrado al terminar.
3. APK del paquete aislado `.oe3`, compilada desde el SHA del ensayo con el origen del túnel. Se instala confirmando el diálogo de MIUI (`tool/f12_est_07/device_run.sh`). Se registran el SHA-256 y el SHA del código.
4. Credenciales solo en un campo de contraseña, tecleadas en un único proceso (`pin_safe.sh`). Ninguna clave en archivos, logs ni capturas; los volcados de `uiautomator` se filtran.

| Caso | Pendiente | Estado inicial | Pasos | Resultado esperado |
|---|---|---|---|---|
| P-01 | #19 C | Instalación nueva, sin activar | Activar y, durante la llamada de vínculo, activar el modo avión; desactivarlo y reintentar | Sin vínculo parcial; el reintento completa una sola activación; un solo `ClientRegistration` en Central |
| P-02 | #19 F | Instalación activada | Cerrar la sesión de la app y reactivar en el mismo proceso | Reactivación válida, sin borrar SQLite ni duplicar el titular |
| P-03 | #21 21-E | Instalación activada (APK debug del paquete aislado) | Dañar el almacén seguro con `run-as`, en lugar de un solo slot, y reabrir sin red | No se trata como instalación nueva ni se borra nada; se pide reautenticación. **El keystore no se puede alterar sin root:** queda NOT_MEASURED |
| P-04 | #71 E-1 | Instalación activada | Desactivar la cuenta en Central y escanear logcat con los valores opacos de esa sesión | 401 y pausa; ningún token ni valor opaco en logcat |
| P-05 | #76, criterio 4 | Respaldo local del Member A | Restaurarlo en la instalación con sesión del Member B | No se habilitan operaciones, no se adoptan los datos y no se crea un vínculo. **Es una restauración desde archivo local, no desde B2** |
| P-06 | #121 R-03 | Formulario de aplicación con borrador | Abrir el selector de fecha y cancelarlo | El borrador no cambia |
| P-07 | #125, día inicial | Campaña activa y sucesora con inicio **hoy**, sin tocar el reloj | Activar la sucesora | Se admite y cumple las reglas: sin solape, historia preservada y vínculo coherente |
| P-08 | #28, criterio 4 | Modo compartido con dos responsables | Transferir y revertir | Salida y entrada compensadas; ningún saldo negativo ni consumo |
| P-09 | #49, modo compartido | Deuda previa de una persona | Registrar un pago | Se imputa a la deuda previa con importes exactos |
| P-10 | #97, nombre largo | Modo compartido, persona con nombre largo, `font_scale` 1,3 (se restaura el valor anterior al terminar) | Asignación en una compra | Nombre legible, sin cortes ni palabras partidas |
| P-11 | #151 punto 10 (cota) | Tres restauraciones resueltas | Restaurar tres veces | Solo quedan 2 copias resueltas; las `interrupted` y `retained` no aplican. **El plazo de 7 días exige mover el reloj y no se ejecuta sin autorización** |
| P-12 | Sincronización C10 | Segundo paquete aislado activado con el mismo Member | Reenviar una operación ya aplicada | `ALREADY_APPLIED`; el registro no forma parte de la clave |
| P-13 | C16 y C18 | Necesidad en una campaña que Central cierra | Declarar un valor nuevo; retirar uno existente | C16: REJECTED `CAMPAIGN_NOT_OPEN`, sin total. C18: CANCEL APPLIED, sin cantidad |
| P-14 | C19 | Producto vinculado que Central desactiva | Declarar | `REFERENCE_UNAVAILABLE`, sin revelar otros tenants |
| P-15 | C33 | Dos instalaciones con un conflicto resuelto | Enviar tarde un sucesor de la rama cercada | REJECTED `CAUSAL_FENCED` |

**No se ejecutan en el POCO:**
- **#20 Auto Backup:** necesita cambiar el transporte de copia del sistema, que es un ajuste global.
- **D2D:** necesita el asistente de configuración, es decir, un reset.

Ambos quedan pendientes de una autorización específica.

## 3. HONOR JDY-LX3P (pide que se conecte)

**Paso humano necesario:** conectar el HONOR por USB con la depuración autorizada. No se sustituye por el POCO.

| Caso | Pendiente | Estado inicial | Pasos | Resultado esperado |
|---|---|---|---|---|
| H-01 | #129 M8 A4-F | Paquete aislado, `font_scale` 1,3 (se restaura después) | Recorrer las pantallas de M8 a 720×1612 | Productos e importes legibles, sin palabras partidas y sin quedar bajo el botón flotante. Sustituye el NO CUMPLE histórico solo si pasa |
| H-02 | #151 punto 7 | Respaldo cifrado generado en el POCO | **Con B2** (§5): subir desde el POCO, restaurar en el HONOR con la clave. **Sin credenciales B2:** restaurar desde un archivo local copiado al HONOR, rotulado como **«restauración desde archivo local, no desde B2»**, que no cierra el punto 7 tal como está redactado | Mismas tablas (salvo la instalación) y fotos con el mismo SHA-256 |

## 4. Filas de sincronización: procedencia de cada una

**Transporte controlado.** Es un arnés que reescribe, duplica o inyecta respuestas entre la app y el Central real, sobre el patrón de `tool/f03_res_01/observer.cjs` y `fault.sh`. C30 ya se midió así el 2026-10-16. Lo que se mida con él se rotula **«transporte controlado»**, distinto de «servidor real».

| Fila | Cómo se mediría | Procedencia |
|---|---|---|
| C10, C16, C18, C19 y C33 | Acciones reales en la app y en Central (§2, P-12 a P-15) | Servidor real |
| C07 (claves reordenadas), C08 (mismo ID con otro contenido), C21 (int64), C25 (contractVersion), C26 (campo privado), C37 (cuerpos inválidos) | El arnés reescribe la petición antes de llegar a Central | Transporte controlado |
| C09 (reintentos simultáneos) | El arnés duplica la petición | Transporte controlado |
| C12, C13, C17 y C39 (replays tras CANCEL, sucesor atrasado, cambio de campaña o de catálogo) | El arnés retiene el ACK y lo reenvía después del cambio en Central | Transporte controlado |
| C27 (antecesor inválido) y C32 (GET ajeno) | El arnés sustituye el antecesor o el `operationId` | Transporte controlado |
| C28 (antecesor en procesamiento) y C29 (429/503) | El arnés inyecta la respuesta RETRYABLE, 429 o 503, para medir la reacción de la app | Transporte controlado (inyección) |
| C36 (purga sin garantía de replay) | No hay purga implementada y la admisión productiva está cerrada | **Condición productiva**, no una fila medible en el teléfono |

**Trabajo técnico previo.** Hacen falta modos nuevos en el arnés: reescribir, duplicar, retener y reenviar, sustituir e inyectar estados. Sin esos modos, estas filas siguen NOT_MEASURED con este motivo.

## 5. B2: comprobaciones nuevas que necesitan credenciales

**No se repite nada ya acreditado** (puntos 1–6 de #151). Hoy **no hay credenciales autorizadas**:
- las temporales `b151-*` y `agrocuentas-final-rw` están revocadas;
- la amplia de #149 no se usa.

Por eso las pruebas siguientes **quedan pendientes**.

| Prueba | Para qué | Prefijo exclusivo | Permisos mínimos | Resultado esperado | Limpieza y revocación |
|---|---|---|---|---|---|
| B-1 | #151 punto 7: subida desde el POCO y restauración en el HONOR | `ensayo-oe3-<AAAAMMDD>/restauracion/` | Una clave `listFiles, readFiles, writeFiles, deleteFiles` con `namePrefix` = el prefijo, caducidad ≤ 72 h | AVAILABLE, una versión, cabecera `AGROENC\0`, SSE AES256; restauración con las mismas tablas y fotos | Inventario final de 0 versiones, 0 marcas y 0 multipartes en el prefijo; revocación por Roderich con su script; **prueba de acceso denegado con la clave revocada** |
| B-2 | #151 punto 9: `backups:inventory --reconcile` y `--reconcile --apply` contra B2 | `ensayo-oe3-<AAAAMMDD>/inventario/` | La misma forma de clave, otra clave | Detecta y reconcilia un resto provocado (staging o multiparte) sin tocar nada fuera del prefijo | Ídem |
| B-3 (opcional) | Repetir los ítems 2 (`BadDigest` 2d) y 6 (C2, C5 y T-R5) con el adaptador final `d673a56` | `ensayo-oe3-<AAAAMMDD>/repeticion/` | `b151`-like: rw, ro y nodel | Iguales a R2, con la causa del proveedor conservada (H3) | Ídem |

**Procedimiento:**
1. Roderich crea cada clave en su propia ventana con un script local (patrón `crear_clave_final_rw.ps1`), cifrada con DPAPI y **sin mostrarla**.
2. `comprobar_b2.ps1` verifica el bucket, las capacidades, el prefijo y la caducidad.
3. Las variables `BACKUP_S3_*` llegan solo al proceso de la API.
4. Ninguna clave se pide en el chat ni se escribe en archivos, logs o evidencias.

## 6. Lo que este bloque no hace

- No implementa monitorización productiva, alertas ni rotación real.
- No habilita datos reales.
- No crea una cota ni una purga para las copias `retained`.
