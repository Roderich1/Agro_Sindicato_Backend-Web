# Continuidad tras el cierre (2026-11-13)

Punto de partida para retomar el trabajo después de la integración final. El resumen está en `docs/cierre/RESUMEN_CIERRE_2026-11-13.md`.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Código integrado | `main` de ambos repositorios, tras fusionar BE #209 y MOB #192 (SHA en `_artefactos/cierre/README.md`) |
| Contrato de acceso por rol y retiro de K=3 | `docs/architecture/E4_ACCESO_POR_ROL_Y_SIN_UMBRAL_CONTRATO.md` |
| Evidencia del cierre | `docs/evidence/CIERRE/` (suites, API, Web por rol, `mobile/recorrido.md`) |
| Matriz para el documento de grado | `docs/cierre/MATRIZ_DOCUMENTO_GRADO.md` (con «ID por confirmar» y discrepancias de numeración RN que debe resolver el autor) |
| Herramientas del recorrido | `tool/cierre/` (copias de `tool/e4/` para el paquete `.cierre`) |
| Continuidad anterior | `docs/continuidad/MEJORAS_FUNCIONALES_CONTINUIDAD.md`; en Mobile, `docs/rediseno/REDISENO_MOVIL_CONTINUIDAD.md` y `docs/rediseno-individual/CONTINUIDAD.md` |

## Pendiente del autor

1. Aceptación visual del rediseño Web v2, del rediseño móvil, del modo individual y del panel de voz en ambos modos. Ninguna sesión la marcó.
2. Confirmar la versión del Cap. III que se entrega y los IDs «por confirmar» de la matriz.
3. Decidir si el cambio de modo debe avisar de envíos de convocatoria pendientes (hallazgo H1).
4. Decidir sobre los PR abiertos fuera de `main` (lista en el resumen §1), sobre todo BE #207.
5. Para distribuir:
   - keystore de release, fuera del repositorio;
   - API desplegada, con decisión institucional sobre `F07-POL-02` y datos reales (GOV-02 #185);
   - después, recompilar la APK con `AGRO_API_BASE_URL` y, si se quiere voz, con los modelos y las bibliotecas nativas.
6. Superficie editable del chaco (decisión B: mejora pendiente).

## Entornos locales que quedan (sintéticos)

- **PostgreSQL** `agro_acc_pg`, en 127.0.0.1:15440:
  - base `acc_api`, con los tenants `e4-ver1`, `e4-ver1-b` y CIERRE1;
  - bases de prueba `cierre_f02a`, `cierre_f02d` y `cierre_f02f`.
- **API** 3400, desde `_wt/CIERRE-BE/Back`.
- **Web** Vite 5184.
- **Emuladores:**
  - AVD `Cierre_Pixel8` (`emulator-5560`), con `.cierre` instalada y datos de F3;
  - AVD `Pixel_8`, apagado, con un intento `.cierre` anterior.
- **Túnel:** cerrado al terminar el recorrido.
- **Secretos:** se generan en cada proceso y no se guardan. Cada inicio de sesión de las herramientas fija una contraseña de un solo uso.
