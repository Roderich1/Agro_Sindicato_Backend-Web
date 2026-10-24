# BE #151 §A (ítems 1–6): herramienta para B2 real, validada sólo contra el doble S3

**Qué valida esta evidencia:** que la herramienta y la suite funcionan y discriminan. Se ejecutaron contra el **doble S3 en memoria** (`InMemoryS3`), con los perfiles de clave **simulados**.

**Qué no valida:** **no es Backblaze B2** y no cumple ningún ítem de #151 §A. La ejecución contra B2 real la hace la sesión A con las claves temporales, y su resultado irá en una evidencia aparte.

> **2026-10-24:** lo que sigue es histórico y se conserva tal cual. Las instrucciones vigentes, la trazabilidad de las ejecuciones del 24/10 contra B2 y la retirada de la propuesta de operación están en la nota final, «Nota del 2026-10-24».

**Ficha:**
- **Fecha real:** 2026-10-20, de 00:04:28 a 00:05:11Z (2026-10-19 en America/La_Paz).
- **Quién:** la sesión C de Claude Code, por el encargo de la sesión A («F07 y F08», §5).
- **Versión:** `c2c1b15e41e9c80cf439b1736efcf2ef4b6d2e88`, rama `test/f08-b151-b2-real`, sobre `main` `769d441`. Árbol limpio; lo comprueba la propia herramienta con `git status`.
- **Datos:** sintéticos, con bytes aleatorios.

## Entorno

| Elemento | Valor |
|---|---|
| Node | v25.9.0, Windows 11 |
| S3 | `InMemoryS3` (doble), bucket `bucket-sintetico-b151`, prefijo `ensayo-f08/b151-20261019/doble/` (ítems 1–5) y `…/doble-pg/` (ítem 6) |
| PostgreSQL (sólo ítem 6) | contenedor local `postgres:16-alpine` en `127.0.0.1:55443`. La contraseña sólo entró en una variable de entorno. La suite crea bases aisladas `f08_b151_rw_*` y `f08_b151_nodel_*`. Al terminar se detuvo el contenedor y se conservó el volumen |
| Perfiles simulados por el doble | `ro`: rechaza con 403 toda escritura y todo borrado. `nodel`: rechaza con 403 `DeleteObject`. Todo lo que quede fuera de `ensayo-f08/b151-20261019/` se rechaza con 403 |

## Comandos y resultado

```
node tool/f08_b2/b151_b2.cjs doble todos todo <salida>
→ 34 PASS, 0 FAIL, 0 NO_CONCLUYENTE (exit 0)

F08_BKP_PG_TEST_URL=<env> node tool/f08_b2/b151_b2.cjs doble todos c6 <salida>
→ Jest: 1 suite, 4 tests passed (exit 0)
   informe rw:    6 PASS, 0 FAIL (C2a, C2b, C5a, C5b, C5c y la limpieza de c6-rw)
   informe nodel: 5 PASS, 0 FAIL (preparación y T-R5a a T-R5d)
```

**Salidas completas, saneadas:**
- [`f08_b151/doble_items1a5.txt`](f08_b151/doble_items1a5.txt);
- [`f08_b151/doble_c6_rw.txt`](f08_b151/doble_c6_rw.txt);
- [`f08_b151/doble_c6_nodel.txt`](f08_b151/doble_c6_nodel.txt).

En los nombres de algunos casos dice «en B2» porque son los mismos que se usarán contra B2 real. La cabecera de cada informe declara el destino: `doble`.

**Comprobaciones adicionales:**
- `npx jest b151-b2-real` sin variables: 4 tests *skipped*.
- `npx jest backups.postgres.spec.ts --listTests` (el patrón del CI) no incluye la suite nueva.
- `tsc` sobre la suite y su soporte: sin errores.
- `b151_ejecutar.ps1` se ensayó con un `con_b2.ps1` sustituto que no inyecta claves. Ese ensayo encontró y corrigió el orden del argumento `confirmar` de `limpiar`, y comprobó que se rechaza una subcarpeta como `Mal/../x`.

## Lo que el doble no puede mostrar

- **ETag en `ListParts`:** el doble no lo devuelve, así que esa comparación (5a) sólo se aplica contra B2.
- **Copia sin `versionId`:** el doble no la admite, así que el control 4b sólo corre contra B2.
- **Cabeceras de SSE:** el doble no las devuelve.
- **Códigos de rechazo** (`AccessDenied`, `BadDigest`): son los del doble. Contra B2 se registran tal cual los que devuelva el proveedor.
- **Paginación:** el doble respeta `MaxKeys` y `MaxUploads`. Si B2 no los respetara, los casos 3a–3c saldrían `NO_CONCLUYENTE`, no PASS.
- **Variante de T-R5 «falla la purga de la rotación»:** no es alcanzable con la clave `nodel`, porque ningún `commit` llega a `AVAILABLE` sin `deleteFiles`. Queda cubierta sólo por `retention.backups.postgres.spec.ts` y `b2-retention.backups.postgres.spec.ts`.

## Cómo se ejecuta contra B2 real (sesión A)

```powershell
# con F08_BKP_PG_TEST_URL de un PostgreSQL desechable en el entorno, sólo si se incluye el ítem 6
powershell -ExecutionPolicy Bypass -File tool\f08_b2\b151_ejecutar.ps1 -Subcarpeta <nueva> -Salida <dir> -ConC6 [-Limpiar]
```

**Antes de tocar nada,** cada paso pregunta a B2 (`b2_authorize_account`) qué puede hacer su clave. Se niega si no tiene exactamente las capacidades de su perfil, el bucket configurado y el `namePrefix` `ensayo-f08/b151-20261019/`.

**Qué queda en B2:**
- La clave `nodel` deja restos que no puede borrar: el caso 1 y la subida fallida de T-R5. Los retira `limpiar` con `rw`.
- Sin `-Limpiar`, queda en `c1/` la copia válida de referencia del caso 1.

## Actualización del 2026-10-20 (01:15:41–01:15:58Z), sobre `4c31320`. No reescribe lo anterior

El texto de arriba describe `c2c1b15`. Desde entonces cambiaron cuatro cosas:
- **SonarCloud** de #160 sobre `20b0874` dio FAILURE (Reliability D, Security B), con 6 incidencias. Las 6 eran ciertas y se corrigieron sin desactivar reglas ni excluir archivos (`8ecded0`):
  - `sort()` sin comparador (S2871, dos veces): ahora usa `localeCompare`;
  - `git` resuelto por el PATH (S4036): ahora sólo por ruta absoluta, con `F08_B151_GIT` o las ubicaciones estándar;
  - plantillas anidadas (S4624);
  - `http://` en el endpoint del doble, que nunca se contacta (S5332);
  - un `String()` de un valor sin tipo (S6551).
- **La variante de T-R5 «falla la purga de la rotación»**, que arriba constaba como no alcanzable, ahora tiene suite propia, `rotacion`:
  - las copias se crean y confirman con la clave rw;
  - sólo el `DeleteObject` de la copia retirada por la rotación sale con la clave nodel, de modo que el rechazo lo decide B2;
  - después, con la clave rw otra vez, la siguiente subida reconcilia.
  - **Mutación** (2026-10-20, hacia las 01:10Z, sobre el árbol de trabajo previo a `8ecded0`, con la suite ya escrita). Se revirtió y el archivo quedó idéntico al de `8ecded0`.
    - **Cambio:** en T-R5r-a, `t.s.routeRotationDeletes = true;` pasó a `false`.
    - **Orden:** `F08_B151_DESTINO=doble npx jest b151-b2-real -t "rotation"`, con `F08_BKP_PG_TEST_URL` en el entorno.
    - **Salida resumida:** «× T-R5 (rotation): a purge refused during the rotation keeps the bounded excess…» y «Tests: 1 failed, 4 skipped, 5 total».
    - Esta salida no se guardó en un archivo; se registra aquí resumida.
- **Revisión de código por un agente de esta misma sesión** (no es la sesión B) sobre `8ecded0`: «LISTO con condiciones». Lo que se aplicó a raíz de ella:
  - `145f25c`: la condición, que era volver a ejecutar con la rotación y corregir la nota de T-R5d, más los cinco menores:
    - las claves enrutadas;
    - los rechazos del adaptador exigen un error de permisos, y otro error da NO_CONCLUYENTE;
    - 3d degrada a NO_CONCLUYENTE sin páginas truncadas;
    - el endpoint debe ser el `s3ApiUrl` de B2;
    - la consola de Jest sale saneada.
  - `4c31320`: el informe de T-R5r-a guardaba por referencia la lista de rechazos.
- **Resultados contra el doble S3** (no es B2), con el árbol limpio:

| Ejecución | Resultado | Salida |
|---|---|---|
| `doble todos todo` (ítems 1–5) | 34 PASS, 0 FAIL, 0 NO_CONCLUYENTE | [`f08_b151/4c31320_doble_items1a5.txt`](f08_b151/4c31320_doble_items1a5.txt) |
| `doble todos c6`, suite rw (C2, C5) | 6 PASS | [`f08_b151/4c31320_doble_c6_rw.txt`](f08_b151/4c31320_doble_c6_rw.txt) |
| `doble todos c6`, suite nodel (T-R5) | 5 PASS | [`f08_b151/4c31320_doble_c6_nodel.txt`](f08_b151/4c31320_doble_c6_nodel.txt) |
| `doble todos c6`, suite rotacion (T-R5, rotación) | 3 PASS. El borrado enrutado fue sólo el de la retirada, con 1 rechazo **simulado por el doble** | [`f08_b151/4c31320_doble_c6_rotacion.txt`](f08_b151/4c31320_doble_c6_rotacion.txt) |

Jest: 5 tests passed, con PostgreSQL local `postgres:16-alpine` en 127.0.0.1:55443.

**Lo que sigue sin ensayarse fuera de B2:** el relanzamiento de dos claves del paso `rotacion` (`b151_b2.cjs`, con `con_b2.ps1` nodel → rw). Exige una clave nodel real antes de relanzarse, así que sólo se ejercita en la ejecución real.

### Ejecución contra B2 real: **NO EJECUTADA** (2026-10-20, 01:07Z)

**Motivo:** las tres claves temporales no existen. En `%LOCALAPPDATA%\Agrocuentas\secretos` sólo está `backblaze-b2.clixml`, la clave amplia del ensayo de #149. Esa clave no sirve: no es ninguno de los perfiles, y la herramienta la rechaza porque no tiene el `namePrefix` `ensayo-f08/b151-20261019/`.

**Para ejecutarla:**
1. Roderich ejecuta `crear_claves_b151.ps1` en su propia ventana; pide la clave maestra de forma oculta.
2. Se comprueban la vigencia, las capacidades, el bucket y el prefijo de las tres claves, sin mostrarlas.
3. `b151_ejecutar.ps1 -Subcarpeta <nueva> -Salida <dir> -ConC6 -Limpiar`, con un PostgreSQL desechable.
4. Una evidencia aparte con los resultados reales de los ítems 1–6 por separado, conservando FAIL y NO_CONCLUYENTE.
5. Revocación con `revocar_claves_b151.ps1`, que también pide la clave maestra. Si no se ejecuta, las claves caducan a los 3 días.

**Hasta entonces, ningún ítem de #151 §A queda acreditado contra B2.** Tampoco la cobertura de T-R5: sus dos variantes sólo se han ejecutado contra el doble.

> **Nota del 2026-10-20 (01:23:00–01:23:17Z), sobre `601cc4c`.**
> - **Qué cambia:** sólo dos expresiones del soporte, por los avisos de SonarCloud S8786 y S7780 sobre `1abce6c`: la barra final del endpoint se quita sin una expresión regular, y la ruta de git va con `String.raw`, con el mismo valor.
> - **Resultado contra el doble,** con el árbol limpio, con los mismos recuentos que la tabla anterior (salidas en `f08_b151/601cc4c_*.txt`):
>   - ítems 1–5: 34 PASS;
>   - rw: 6 PASS;
>   - nodel: 5 PASS;
>   - rotacion: 3 PASS;
>   - Jest: 5 passed.

> **Nota del 2026-10-20 sobre la revisión del HEAD final.** El mismo agente de revisión de esta sesión volvió a revisar `54eb3e0` y dio «LISTO». Sus dos observaciones menores se aplican aquí:
> - se cambió el nombre de la revisión, que no es independiente;
> - se respaldaron la mutación y la re-ejecución de `601cc4c` con su orden y su salida.

## Nota del 2026-10-24 (22:02Z), sobre `8ce0263`. No reescribe lo anterior

Todo lo anterior describe la herramienta hasta el 2026-10-20 y se conserva tal cual. Esta nota recoge lo que cambió desde entonces.

### 1. La ejecución contra B2 real ya se hizo

La sección «Ejecución contra B2 real: **NO EJECUTADA**» queda superada. El 2026-10-24 hubo tres ejecuciones contra Backblaze B2 real, con claves temporales nuevas de la raíz `ensayo-f08/b151-20261024/`.

- **Sus evidencias están en #163** (`feat/f08-respaldo-cifrado-be`), no en esta rama:
  - `F08_BKP_08_B2_REAL_FORMATO2.md`;
  - `F08_BKP_08_B2_REAL_REPETICION.md`;
  - `F08_BKP_08_B2_REAL_ACOTADA.md`.
- **Sus FAIL y NO_CONCLUYENTE se conservan allí.** Nada pasa a PASS de forma retroactiva.
- **Claves:** según la sesión A, Roderich revocó las tres claves temporales el 2026-10-24, hacia las 20:42Z. Esta sesión no lo comprobó. Para volver a ejecutar hacen falta claves nuevas (`crear_claves_b151.ps1 -Prefijo`).

### 2. Qué herramienta usó cada medición del 24/10

Ninguna de las tres usó `8ce0263` ni los cambios del §3. **Esos cambios no se atribuyen a ninguna de ellas.**

| Ejecución contra B2 | Hora (UTC) | Herramienta | Código ejecutado (rama local de ensayo, sin publicar) |
|---|---|---|---|
| Primera, formato 2 | 15:29–15:37 | `cf6b4d7` y `71ac088`. Según `git patch-id --stable`, son los mismos parches que `51cc7b3` y `c2361d9` de esta rama | `test/f08-b151-formato2`: `50096c0`, el merge de #160 `78840e7` sobre #163 `9255f2c`, más esos dos commits |
| Repetición | 17:47–17:55 | `1c35562` de esta rama | `test/f08-b151-repeticion`, `62f4fe7`: #163 `353ad31` + #160 `1c35562` |
| Acotada (5b y H3) | 20:26:03–20:26:41 | `ff8bf7f` de esta rama | `test/f08-b151-repeticion`, `1e5ff10`: `62f4fe7` + #160 `ff8bf7f` + #163 `d673a56` |

Lo comprobé con `git merge-base --is-ancestor`:
- `1c35562` es ancestro de `62f4fe7` y de `1e5ff10`;
- `ff8bf7f` es ancestro de `1e5ff10`, pero no de `62f4fe7`.

### 3. Cambios de la herramienta en `8ce0263`, declarados

1. **`F08_B151_RAIZ` es obligatoria y ya no tiene valor por defecto.**
   - En `b151_ejecutar.ps1` corresponde a `-Raiz`, ahora obligatorio.
   - Antes valía `ensayo-f08/b151-20261019/`.
   - Se exige en todos los pasos, también contra el doble. Sin ella, la herramienta se detiene con un error claro antes de tocar nada.
2. **`F08_B151_FORMATO` es obligatorio para el ítem 6 (`c6`) y ya no tiene valor por defecto.**
   - En `b151_ejecutar.ps1` corresponde a `-Formato`, ahora obligatorio con `-ConC6`.
   - Antes valía `1`.
   - Sin `-ConC6` no se usa ni se fija. La suite sólo lo lee cuando se ejecuta, así que sin variables (como en el `npm test` de la CI) sigue omitiéndose.
3. **`caso1`, «1-ro: adaptador stage multipart (> 8 MiB)», usa `keptRefusal`, el criterio de H3 del paso `h3`.**
   - Un `AbortError` del origen en lugar del rechazo de permisos ahora es **FAIL**; antes era NO_CONCLUYENTE.
   - El NO_CONCLUYENTE de ese caso en la repetición del 24/10 se midió con el criterio anterior y se queda como está.

**Lo demás no cambia.** La raíz se lee al usarse, en lugar de al cargar el módulo, pero el valor y las comprobaciones son los mismos.

### 4. Instrucciones vigentes

Sustituyen a las de «Cómo se ejecuta contra B2 real (sesión A)» y «Para ejecutarla».

```powershell
# Contra B2 real: la raíz de las claves del ensayo, obligatoria; con el ítem 6, también el formato que se mide.
powershell -ExecutionPolicy Bypass -File tool\f08_b2\b151_ejecutar.ps1 -Raiz ensayo-f08/b151-<aaaammdd>/ -Subcarpeta <nueva> -Salida <dir> [-ConC6 -Formato 1|2] [-Limpiar]

# Paso a paso o contra el doble: las mismas variables, en el entorno.
$env:F08_B151_RAIZ = 'ensayo-f08/b151-<aaaammdd>/'   # siempre
$env:F08_B151_FORMATO = '<1|2>'                      # sólo para c6
node tool/f08_b2/b151_b2.cjs doble todos todo <salida>
```

- **La raíz es el `namePrefix` de las claves del ensayo.** Antes de tocar nada, cada paso comprueba con B2 que la clave tiene exactamente esa raíz, como hasta ahora.
- **Formato:** para datos reales se decidió el formato 2 (F08-ADR-003, #163). El formato 2, y los casos del informe de limpieza de los pasos `h3` y `r5b` (`onStagingCleanup`), necesitan el adaptador y los módulos de #163. Con esta rama sola sobre `main`, esos casos fallan.

### 5. Propuesta de operación retirada

- **Qué se retira:** `docs/architecture/F08_BKP_08_PROPUESTA_OPERACION.md`, la propuesta §B/§C del 2026-10-19, en `c5f8e30`.
- **Procedencia:**
  - entró en `c2c1b15`;
  - cambió por última vez en `8ecded0`;
  - su texto final se lee con `git show ff8bf7f:docs/architecture/F08_BKP_08_PROPUESTA_OPERACION.md`.
- **Dónde están ahora las decisiones** sobre cifrado, `.previo` y retención: F08-ADR-003 (#163).

### 6. Comprobaciones sobre `8ce0263` (2026-10-24, sesión C)

| Comprobación | Resultado |
|---|---|
| `node tool/f08_b2/b151_b2.cjs doble todos todo <salida>` con `F08_B151_RAIZ=ensayo-f08/b151-20261024/`, que contra el doble es sólo un espacio de nombres en memoria. 22:02:19Z, árbol limpio | **36 PASS, 0 FAIL, 0 NO_CONCLUYENTE**. Salida: [`f08_b151/8ce0263_doble_items1a5.txt`](f08_b151/8ce0263_doble_items1a5.txt) |
| La misma orden sin `F08_B151_RAIZ` | Error «F08_B151_RAIZ is required…» con código 2. No crea la carpeta de salida |
| `doble todos c6` con la raíz y sin `F08_B151_FORMATO` | Error «F08_B151_FORMATO is required for the item-6 suite…» con código 2, antes de lanzar Jest |
| `b151_ejecutar.ps1` sin `-Raiz` (`-NonInteractive`) | PowerShell lo rechaza: falta un parámetro obligatorio |
| `b151_ejecutar.ps1 -ConC6` sin `-Formato` | Se rechaza antes de llamar a `con_b2.ps1`. Se probó con un `con_b2.ps1` sustituto y archivos de clave vacíos, sin ninguna clave real |
| `npx jest src/modules/backups/b151-b2-real.postgres.spec.ts` sin variables | 1 suite skipped, 6 tests skipped |
| `npx tsc --noEmit -p tsconfig.json` (Back) | Sin errores |

**Lo que no prueba el doble:** responde sin E/S, así que no produce el `AbortError`. El PASS de «1-ro: adaptador stage multipart» en el doble no ejercita la rama nueva de FAIL, igual que pasaba con `h3` (`F08_BKP_08_B2_REAL_ACOTADA.md` §4, en #163).

**No se repitieron:**
- `doble todos c6`, porque necesita PostgreSQL;
- `doble todos acotada`, porque sus casos del informe de limpieza necesitan #163.
