# OE5: preparación del entorno de usabilidad con el conjunto DS-UX (2026-11-14)

- **Qué es:** preparación técnica del entorno para las sesiones de usabilidad del protocolo único (paquete U2: GUION-5, TAR-3; Anexo J). La hizo Claude Code con datos sintéticos.
- **Qué no es:** no es una sesión de usabilidad. El entorno de evaluación preparado no registra actividad de participantes. Este registro no contiene tiempos, ayudas, SUS ni resultados, y no cubre nada fuera de ese entorno.
- **Sesiones:** la versión, el dispositivo y los resultados de las sesiones se documentan con sus registros reales. Lo que no se pueda recuperar queda como «no registrado», sin suponerlo.
- **Requisitos:** RNF-07 (RU-13). Lectura colectiva con F07-POL-02 (decisión del autor, E4; su activación institucional sigue pendiente, GOV-02).

## Versión congelada

| Pieza | Valor |
|---|---|
| Mobile | `main` `f105e994d6a0c092056431a687ad614b362d33bb` |
| Backend y Web | `main` `6a0ea0e`. La API y la Web se sirven desde un worktree en `94fa285`, sin cambios locales. `git diff 81c4611 94fa285 -- Back Web` y `git diff 94fa285 6a0ea0e -- Back Web` están vacíos |
| APK | `agrocuentas-oe5-f105e99-x64-profile-con-origen.apk` (fuera de Git), SHA-256 `66b9a6161c6440799d0f0121bbad6139e9d90e512d6a985f7b5d1c53e716f6ec`, 337 712 384 B, `profile` x86_64, firma de depuración (`CN=Android Debug`, certificado SHA-256 `dd55ce96…66c3dc`), `versionCode` 4001. La copia instalada (`base.apk` extraída del emulador) tiene el mismo SHA-256 |
| Dispositivo | **Emulador** AVD `Cierre_Pixel8` (`emulator-5560`), imagen `sdk_gphone16k_x86_64` (Android 16), America/La_Paz. **Esta preparación no instaló la candidata en ningún teléfono físico.** El dispositivo de las sesiones no consta aquí |
| API | Local, puerto 3400, `NODE_ENV=development`, `COLLECTIVE_DISCLOSURE_MODE=provisional-synthetic`, `COLLECTIVE_DISCLOSURE_POLICY=F07-POL-02`. La app llega a ella por un túnel HTTPS temporal autorizado por el autor; el origen no se publica |
| Web | Vite en el puerto 5186 desde el worktree en `94fa285`. Los 129 archivos fuente servidos coinciden con el árbol de ese commit |

## Siembra

- **Comando:** `Back/scripts/f10-dsux-central-seed.cjs`, sin cambios.
- **Día:** el 2026-11-14 entre 11:00:45 y 11:04 −04 (15:00:45Z–15:04Z), con `F10_UX_SESSION_DATE=2026-11-14`, que es la fecha de preparación.
- **Secretos:** se generaron en el proceso y no se escribieron.

| Tenant | Uso |
|---|---|
| `f10ux-movil-oe5m` | Preparado para las sesiones móviles. Cuentas `a01`, `a02`, `a03` y `x01-oe5m@f10ux.example.test` |
| `f10ux-web-i01` | Preparado para la persona institucional. Cuentas `directiva-i01` (DIRECTIVA) y `presidente-i01` (ADMINISTRADOR) |
| `f10ux-web-i02`, `f10ux-web-x01w` | Reserva y piloto Web |
| `f10ux-web-ver1`, `f10ux-web-ver2` | Verificación de UW3 y UW4 en los dos sentidos. Quedaron consumidos |

## Valores esperados comprobados (11:04–11:13 −04)

| Tarea | Resultado de la comprobación |
|---|---|
| UW1 | La API y la Web muestran Glifosato Demo **150 L** con 4 aportantes, con las cuentas de Directiva y de Administrador |
| UW2 | `linked_members` 6 y `members_with_contribution` 4. La Web muestra «4 de 6 agricultores vinculados con cifras publicadas (67%)» y «Ausencia de aporte = desconocido, no cero» |
| UW3 (VER1 con canónico Bellator; VER2 con canónico Belator) | La asociación responde 200 y queda en el historial con actor y fecha. El canónico tiene 18 L y 3 aportantes; la otra denominación queda `SUPPRESSED_REVISION`, y la Web la muestra como «Sin cifra publicada». La cobertura sigue en 4 de 6. La Bitácora registra `PRODUCT_ALIAS_ASSOCIATED` |
| UW4 | El borrador responde 201 y queda DRAFT con 3 líneas, incluida la fila oculta sin cifra. Muestra el aviso «No crea compras, lotes, movimientos, deudas ni pagos», y la Web dice «no ejecuta ninguna compra» |

Con F07-POL-02 los valores coinciden con los de `tool/f10_eval_web/dsux/oraculo_web.json`. Ese oráculo suponía k = 3, pero aquí todas las celdas tienen 3 aportantes o más. No se usó `contraste.mjs`: su ruta de inicio de sesión y los textos que busca son anteriores a los rediseños de la Web.

## Estado inicial móvil

Se prepara con la interfaz de la app, sobre una instalación nueva por participante, como pide GUION-5 §1.2. La base local de una compilación `profile` no es accesible en una imagen «user», así que `tool/f10_ux/` de Mobile no se puede aplicar sin cambiar la candidata.

Cada preparación crea y comprueba en pantalla:
- «Titular Demo» y el modo de la persona;
- «Verano Demo» desde el 31/10/2026, vinculada a la campaña del sindicato;
- en el modo con varias personas, «Familiar Demo»;
- los chacos «Norte» (1 ha) y «Sur» (0,8 ha) del titular, y «Proveedor Demo»;
- las compras pagadas del 04/11/2026: Glifosato Demo 5 L (DSUX-INI-1) y Bellator 1 L (DSUX-INI-2);
- los productos vinculados, «Nada por enviar», existencias de 5 L y 1 L, e Inicio con «Registrar compra» y «Registrar aplicación».

Ejecuciones completas:

| Hora (−04) | Cuenta | Modo | Resultado |
|---|---|---|---|
| 12:24 | A02 | con varias personas | LISTO |
| 12:32 | A03 | individual | LISTO |
| 12:39 | A01 | individual | LISTO; este estado queda en el emulador |

Los modos de estas ejecuciones sólo validan la preparación; el modo de cada persona lo registra el facilitador. Las instantáneas del emulador se descartaron: al restaurarlas, la pantalla se congeló y el reloj volvió a la hora de la instantánea.

Lectura de la base, solo lectura, a las 12:00 −04: en los tenants `f10ux-*` no hay aportes móviles. Los 50 aportes son los 10 sembrados en cada tenant Web. Solo hay 2 asociaciones y 2 borradores, ambos en VER1 y VER2.

## Limitaciones

- No hay teléfono físico. En emulador, la voz usaría el micrófono del computador.
- Si la API se reinicia, la app debe activarse de nuevo para sincronizar. Si el túnel se reinicia, hace falta una candidata nueva, que debe registrarse.
- El día S de la siembra es la fecha de preparación; la fecha real de cada sesión se anota en su hoja.
- Ningún resultado de usabilidad se declara sin las fichas reales.
