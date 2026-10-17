# Resultados de usabilidad — vacío a propósito

**Todavía no se ha ejecutado ninguna sesión con personas.** Esta carpeta está vacía y sólo debe recibir datos reales anonimizados de la muestra final.

**Cuando existan, se guardan aquí:**
- `participantes.csv`, `tareas.csv`, `sus.csv` y `hallazgos.csv`, con el formato de `../plantillas/`;
- el informe generado con `python -I -X utf8 ../calculo/calcular_usabilidad.py . --salida informe.md`.

**Nunca se guardan aquí:**
- nombres, firmas ni hojas de consentimiento;
- fotos, audio ni grabaciones;
- datos del piloto. El piloto **no es un resultado**: lo único que se publica de él es qué se ajustó y por qué (`../README.md`, registro de versiones). Si por error una fila de piloto llegara aquí con `es_piloto=si`, el cálculo la excluye, pero no debe estar;
- datos de ejemplo (`EJ-…`).

La evidencia final se redacta en `docs/evidence/F10_USABILIDAD.md`, en Backend/Web (UX-02, #47) y en Mobile (UX-01, #37). Lleva:
- las fechas reales;
- la versión aprobada del protocolo y su SHA;
- las versiones de los instrumentos;
- los SHA evaluados;
- el informe;
- las desviaciones.
