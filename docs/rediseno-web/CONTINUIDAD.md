# Rediseño de la Web (v2): continuidad entre sesiones

Lea esto antes de seguir. Compruebe también `git -C _wt/WEB2-INT log --oneline -10` y `git status`. No repita lo ya validado sin motivo.

## Dónde está todo
- **Integración:** `_wt/WEB2-INT`, rama `feat/web-rediseno-v2`, local y sin push. La entrega al autor está en `ENTREGA.md`.
- **Coordinación:** `COORDINACION.md` (sesiones, archivos, reglas, puertos y registro de integraciones).
- **Matriz:** `MATRIZ_LAMINAS.md` (lámina → ruta → estado → sesión, con la tabla de seguimiento).
- **Hallazgos y tareas:** `HALLAZGOS_FUNCIONALES.md`, `TAREAS_POR_SESION.md` (con las uniones §U) y el encargo común de las sesiones, `BRIEF_SESIONES.md`.
- **Láminas:** no versionadas, en `ProyectoAgro/_artefactos/web_rediseno_2/laminas/NN.png`. El índice es `INDICE_LAMINAS.md`; hay recortes de ayuda en `_artefactos/web_rediseno_2/recortes/`.
- **Evidencia:** `docs/evidence/rediseno-web-v2/{base,a,b,c,verificacion,orquestador,comparativas}/`, cada una con su README.
- **Herramientas** (en `tool/web_rediseno_v2/`):
  - `capture_base.mjs`: capturas;
  - `recorrido_o.mjs`: recorrido por rol, sin imágenes;
  - `recheck_v.mjs`: nueva comprobación de los defectos V;
  - los `plan_*.mjs` de cada sesión.

  Necesitan las variables de `_wt/ET2-BE/tool/etapa3/e3env.sh`, cargadas con `source` y sin imprimirlas.

## Worktrees de trabajo
Todos están terminados e integrados.
- **Por sesión:**
  - `_wt/WEB2-BASE`: base;
  - `_wt/WEB2-A`, `_wt/WEB2-B` y `_wt/WEB2-C`: sesiones A, B y C;
  - `_wt/WEB2-VERIF`: verificación.
- **Ramas:** `feat/web-rediseno-v2-{base,a,b,c}` y `docs/web-rediseno-v2-verificacion`.
- **Al seguir con una sesión:** primero `git merge` de la integración.

## Entorno
- API aislada en 3350 y PostgreSQL `agro_et1_pg` en 15434 (`agro_demo`, sintética). Se arrancan con `bash _wt/ET2-BE/tool/etapa2/et2.sh up`.
  - Tras un reinicio, abra antes Docker Desktop.
  - Si el bootstrap falla porque la base aún arranca, repita el comando.
- Web de revisión: `cd _wt/WEB2-INT/Web && VITE_API_PROXY_TARGET=http://127.0.0.1:3350 npx vite --host 127.0.0.1 --port 5177 --strictPort`.
- Puertos de las sesiones para capturas: BASE 5180, A 5181, B 5182, C 5183. Los Vite sólo se levantan mientras se usan.
- **Trampas:**
  - El inicio de sesión admite 20 por minuto: navegue con `pushState`.
  - La herramienta cambia la contraseña de la cuenta sintética: no capture con dos sesiones a la vez y la misma cuenta.
  - En las capturas de página completa, los elementos fijos (barra lateral e inferior) aparecen a media página; es un efecto de la captura.
  - `space-y-*` anula márgenes de la capa de componentes; `attachToHeader` ya lo resuelve.
  - Con StrictMode, un efecto que consuma un parámetro de la URL lo pierde en la segunda ejecución (V-1).

## Estado
- **Código verificado:** `1b7fbb4`.
  - Comprobaciones: `tsc`, `eslint` (0 errores), `build`, `vitest` 706/706.
  - Recorrido 96/96.
  - V-1…V-5 y D6 corregidos.
- **Pendiente del autor:**
  - la aceptación;
  - las decisiones H-10, H-11 y H-08;
  - la autorización para fusionar o desplegar.
- **Pendientes técnicos** (`ENTREGA.md` §7):
  - no hubo teléfono físico ni lector de pantalla real;
  - D10 sigue abierto;
  - el foco de `datetime-local` es nativo del navegador.

## Reglas que no cambian
- La Web es sólo para Directiva y Administración; el agricultor sólo ve el aviso.
- Sólo Excel.
- Ni Backend, ni contratos, ni permisos se cambian para parecerse a una lámina.
- Oculto no es cero, y la Web no calcula lo que el servidor no autoriza.
- Commits con la identidad configurada y sin trailers.
