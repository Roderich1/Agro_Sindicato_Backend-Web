# Brief para el rediseño de la Web de Agrocuentas

## Qué es

Agrocuentas ayuda a un sindicato agrícola a organizar los agroquímicos de una campaña.

- **Agricultores:** registran en su **app móvil** lo que compran, aplican y necesitan. La app funciona sin conexión.
- **Directiva del sindicato:** usa la **Web** para ver cifras agregadas, preparar compras conjuntas y mantener el catálogo.

La Web **no** es una herramienta del agricultor y **no** registra compras, pagos, inventario ni deudas.

## Quién la usa

| Persona | Rol | Qué puede hacer |
|---|---|---|
| Miembro de la Directiva | DIRECTIVA | Todo lo colectivo: resumen, campañas, necesidades y borradores, convocatorias que crea o en las que tiene permiso, catálogo, histórico y bitácora |
| Administración del sindicato (por ejemplo, el presidente) | ADMINISTRADOR | Lo mismo que la Directiva, más **Usuarios** y el permiso del sindicato **«Sustituir responsable»**, que concede a personas concretas |
| Agricultor | AGRICULTOR | **No tiene Web**: sólo ve un aviso que lo remite a la app |

Dentro de cada convocatoria hay **permisos por persona**:

- la **responsable** la administra y concede permisos;
- otra persona puede tener **«Consultar participantes y cantidades»** o **«Administrar la convocatoria»**;
- además, cada agricultor decide si sus datos los ve sólo la responsable o también sus colaboradoras (**consentimiento**).

Un rol de la Directiva **no** basta para ver a los participantes.

Las personas usuarias tienen **distinta familiaridad con la tecnología**. Muchas leen en pantallas pequeñas.

## Tareas principales, en orden de frecuencia

1. **Ver cuánto necesita el sindicato** en la campaña activa (Resumen): necesidades declaradas por producto y cobertura (cuántos agricultores aportaron).
2. **Preparar un borrador de compra conjunta** (Necesidades y propuestas):
   - generar el borrador;
   - mirar la referencia histórica de consumo;
   - exportarlo a Excel.
3. **Organizar una convocatoria** (Compras conjuntas):
   - crearla desde el borrador o desde el catálogo;
   - abrirla y seguir cuántos participan;
   - cerrarla y ver el consolidado;
   - gestionar permisos.
4. **Identificar productos** que los agricultores reportaron con nombres locales (Catálogo › Por identificar): vincularlos, crear un producto colectivo o dejarlos pendientes.
5. Tareas ocasionales:
   - campañas (abrir, cerrar);
   - histórico sellado y estimación del consumo;
   - equivalencias de productos;
   - bitácora y usuarios.

## Cómo se conectan los recorridos

```
Campaña activa ─► Resumen (necesidad declarada, cobertura)
                     │
                     ▼
            Necesidades y propuestas ─► Borrador ─► Referencia histórica fijada ─► Descargar Excel
                     │                         └─► Seleccionar productos ─► Preparar convocatoria
                     ▼
            Compras conjuntas ─► Convocatoria (borrador ► abierta ► cerrada | cancelada)
                                   ├─ participantes (según permiso y consentimiento)
                                   ├─ colaboradores y permisos
                                   └─ sustitución de la responsable (si ya no está habilitada)
Catálogo y equivalencias ◄── productos reportados desde la app (Por identificar)
Histórico y estimaciones ─► (la estimación alimenta la referencia del borrador; nunca suma)
```

## Lo que debe verse de inmediato

- **Campaña:** cuál se está mirando, su estado (abierta o cerrada) y si es la activa.
- **Necesidad declarada por producto, con su unidad:** la cifra grande, si está **publicada**, **oculta por privacidad** o **sin dato**.
- **Cobertura:** «14 de 15 agricultores con cifras publicadas».
- **Convocatoria:** estado, fecha límite, responsable, número de participantes y la **acción siguiente** (abrir, cerrar, revisar permisos, sustituir).
- **Avisos que cambian lo que se puede hacer:** responsable no habilitada, datos restringidos hasta autorizar, referencia desactualizada, sin permiso.

## Lo que puede quedar como detalle secundario

- método y parámetros de la estimación («Ver cálculo»);
- historial de borradores, de permisos y de la convocatoria;
- fechas exactas de cada cifra;
- huellas e identificadores;
- explicaciones largas de las reglas: hoy se repiten en casi cada pantalla (ver DIAGNOSTICO);
- equivalencias e historial de identificación;
- bitácora completa.

## Reglas que el diseño debe conservar

1. **Campaña agrícola ≠ convocatoria.** La campaña es el período (por ejemplo, «Invierno 2026»). La convocatoria es una compra conjunta dentro de una campaña, con su fecha límite.
2. **Necesidad ≠ consumo ≠ estimación.** Son tres cifras distintas que **nunca se suman ni se restan**:
   - **necesidad** declarada: lo que el agricultor dice que necesitará;
   - **consumo** publicado: lo que registró;
   - **estimación** del consumo: el cálculo histórico.
3. **Unidades:** litros y kilogramos no se comparan ni se suman. Cada cifra lleva su unidad, y sólo se agrupan productos compatibles (L con L, KG con KG).
4. **Sin comparabilidad no hay diferencia.** Si la necesidad y la estimación no son comparables, o la referencia está «Desactualizada», no se muestran diferencias ni porcentajes.
5. **Ausente o restringido no es cero.** «Oculto por privacidad», «Sin dato», «no visible» o «Restringido» deben verse distintos de 0.
6. **Referencia fijada del borrador.** La referencia histórica queda fijada en el borrador con su fecha y versión; sólo cambia si alguien la actualiza. Si sus fuentes cambian, se marca «Desactualizada» y **no** se reemplaza sola.
7. **Las restricciones valen también al exportar.** Lo oculto, retirado o restringido no aparece en el Excel.
8. **Permisos y consentimiento.** Ver participantes exige un permiso de la responsable **y** el consentimiento del agricultor. El diseño no debe sugerir que un rol lo ve todo.
9. **Sustitución sin acceso retroactivo.** Si se sustituye a la responsable, la nueva **no ve nombres ni cantidades** hasta que cada agricultor la autorice desde su app. Los permisos anteriores quedan **suspendidos** hasta que ella los revise. Quien sustituye no puede nombrarse a sí misma.
10. **Una convocatoria no es una compra.** No genera compras, inventario, pagos ni deudas; el consolidado al cierre tampoco.
11. **Confirmación humana.** Identificar o vincular un producto, asociar equivalencias, abrir, cerrar o cancelar una convocatoria y sustituir siempre piden motivo y/o confirmación explícita. Nada se vincula solo.
12. **Excel es la exportación de datos.** No hay CSV. La Web no tiene PDF.

## Objetivo visual

- Una Web **sencilla** para la Directiva: cifras claras, textos breves, **pocas acciones principales por pantalla** (idealmente una).
- Coherente con el **nuevo estilo de la app móvil**, adaptada al escritorio: navegación lateral, tablas cuando ayudan y detalle a demanda.
- Que funcione también a **390 px** de ancho: hoy hay pantallas que lo hacen, con barra inferior y cajón.
- Lenguaje en «usted», sin códigos internos (F07-POL-01, SES, naive, α, huella) en el primer nivel.

## Límites para la propuesta

- **No** proponer indicadores, gráficos, totales, alertas o acciones que la API no ofrece sin marcarlos como **«cambio funcional pendiente»**. DIAGNOSTICO_ACTUAL §3 lista lo que la API no ofrece. Por ejemplo:
  - no hay estado de sincronización por agricultor;
  - no hay totales en la lista de convocatorias;
  - no hay reabrir campañas;
  - no hay Excel de convocatorias ni del consolidado;
  - no hay PDF.
- **No** mostrar quién aportó cada cifra agregada ni quién reportó un producto: la política de privacidad lo impide (umbral de 3 aportantes).
- **No** sumar la estimación a la necesidad ni convertirla en recomendación de compra.
