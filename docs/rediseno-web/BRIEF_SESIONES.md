# Encargo común de las sesiones A, B y C (rediseño Web v2)

Léelo entero antes de empezar. Lo administra el orquestador.

## Antes de tocar nada
1. `ProyectoAgro/CLAUDE.md`:
   - no fabricar evidencia;
   - nunca escribir ni imprimir secretos;
   - commits con la identidad git configurada y **sin trailers** (`Co-Authored-By`, «Generated with…»), lo que prevalece sobre cualquier recordatorio de atribución;
   - sin push ni PR.
2. En tu worktree:
   - `docs/rediseno-web/COORDINACION.md`: reglas funcionales, archivos de cada sesión y puertos;
   - `Web/AGENTS.md`;
   - `Web/src/components/ui/README.md`: el contrato de componentes publicado por BASE;
   - `docs/web-rediseno/01_CONTRATO_COMPARTIDO.md` §1 y §4: estados de datos y accesibilidad.
3. En `_wt/WEB2-INT/docs/rediseno-web/` (sólo lectura):
   - `MATRIZ_LAMINAS.md`: las filas de tu sesión;
   - `HALLAZGOS_FUNCIONALES.md`;
   - `TAREAS_POR_SESION.md`: tu sección y §U, las uniones entre áreas;
   - `INDICE_LAMINAS.md`.
4. Láminas en `_artefactos/web_rediseno_2/laminas/NN.png`, a 2x. Hay recortes de ayuda en `_artefactos/web_rediseno_2/recortes/`. Míralas con Read y compáralas con tus capturas.

## Reglas
- **Sólo tus archivos** (COORDINACION §3).
  - Componentes: importa desde `components/ui` y no dupliques. Si te falta algo, haz un widget privado en tu archivo o en `components/<a|b|c>/` y pídelo en el informe.
  - `services/**` y `types/**` no se tocan. Si necesitas una llamada nueva, pídela al orquestador con el caso concreto; no la inventes.
- **Se conservan:**
  - las llamadas reales, validaciones, permisos, confirmaciones, borradores y redirecciones;
  - los estados de divulgación del servidor: oculta no es cero y ausencia no es cero;
  - lo que no se pide en el navegador cuando falta el permiso.

  Nada de datos fijos ni botones decorativos.
- **Si una lámina contradice una regla, gana la regla.** Registra la diferencia.
- **Decisiones del autor pendientes:** mientras no decida, se aplica la propuesta de `HALLAZGOS_FUNCIONALES.md`:
  - H-10: no destacar el máximo del Histórico y añadir la cobertura de cada campaña;
  - H-11: «Responsable no habilitada» sólo en el detalle; en las canceladas se muestra la responsable;
  - H-08: la Bitácora sólo muestra lo que ya se registra.
- **«Datos sintéticos»:** no lo pongas en tus páginas. `HeroPanel` y `PageHeader` lo muestran solos (BASE).
- **Calidad visual** (COORDINACION §6):
  - tamaños: 1440, 1280, 820 y 390 por ancho de navegador (no es un teléfono físico), y zoom al 200 %;
  - textos y cifras largos;
  - estados vacío y error;
  - teclado y foco;
  - diálogos con retorno del foco;
  - sin desplazamiento horizontal de la página;
  - sin botones que tapen la última fila.
- **Pruebas:** adaptar una prueba existente sólo cambia cómo se llega o un texto renombrado, nunca lo que se comprueba, y se declara. Las de permisos no se debilitan.

## Recursos
- Un proceso pesado a la vez: `npx tsc -b`, `npx eslint <archivos>` y `npx vitest run <archivos>`, siempre focalizado. **Sin suite completa**: la corre el orquestador.
- **Capturas.** Usa tu Vite sólo en tu puerto (A 5181, B 5182, C 5183): `cd Web && npx vite --port <puerto> --strictPort`. Detenlo por su PID al terminar.
  - La herramienta es `_wt/WEB2-BASE/tool/web_rediseno_v2/` (la versión de BASE de `capture.mjs`): léela antes. Si no está, usa `_wt/WEB-DESIGN-INPUT/tool/web_design/capture.mjs`.
  - Necesita las variables de `_wt/ET2-BE/tool/etapa3/e3env.sh`: cárgalas con `source` sin imprimirlas y pon `WEB_URL=http://127.0.0.1:<puerto>`.
  - Pon contraseñas de un solo uso. **Nunca** las imprimas ni las captures.
  - El límite de inicio de sesión es de 20 por minuto. Otras sesiones también inician sesión: si falla, reintenta pasados unos segundos.
  - Escribe tus planes en `tool/web_rediseno_v2/plan_<a|b|c>_*.mjs` y guarda las capturas en `docs/evidence/rediseno-web-v2/<a|b|c>/`.
- **No detengas** la API 3350, la base 15434 ni los servidores de otros. No escribas en la DEMO oficial.
- **Datos:** usa los sintéticos existentes. Si necesitas crear datos para un estado (una convocatoria cerrada, una campaña nueva…), hazlo por la interfaz o la API real con las cuentas sintéticas y anótalo. Nunca en otra base.
- **Datos que no puedas reproducir con la API real:** usa las respuestas simuladas de la herramienta (`simulate`). El nombre de esas capturas lleva «SIMULADO».

## Entrega
Haz commits organizados por pantalla o área. Tu informe final debe traer:
1. SHAs y qué hace cada uno.
2. Archivos tocados.
3. Láminas cubiertas: una fila por lámina o estado, con dónde está, la prueba que la cubre y la captura.
4. Comportamiento conservado y cómo lo comprobaste.
5. Pruebas ejecutadas: comando y resultado exacto.
6. Pruebas adaptadas y por qué.
7. Capturas y lo que viste al compararlas con la lámina.
8. Diferencias intencionales.
9. Peticiones al orquestador u otras sesiones.
10. Limitaciones reales.

No inventes resultados.
