# BE #151 §A (ítems 1–6): herramienta para B2 real, validada sólo contra el doble S3

**Qué valida esta evidencia:** que la herramienta y la suite funcionan y discriminan. Se ejecutaron contra el **doble S3 en memoria** (`InMemoryS3`), con los perfiles de clave **simulados**.

**Qué no valida:** **no es Backblaze B2** y no cumple ningún ítem de #151 §A. La ejecución contra B2 real la hace la sesión A con las claves temporales, y su resultado irá en una evidencia aparte.

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
  - **Mutación:** si no se enruta el borrado, T-R5r-a falla (1 failed).
- **Revisión independiente** de un agente de revisión de esta sesión (no es la sesión B) sobre `8ecded0`: «LISTO con condiciones». Lo que se aplicó a raíz de ella:
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
