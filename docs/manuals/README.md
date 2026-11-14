# Manuales de Agrocuentas

## Manuales actuales (úselos)

Manuales de la composición final de cierre, redactados el 2026-11-13 sobre Backend/Web `main` `200fe60` (código `0946d9f`) y Mobile `main` `34e9926` (código `aeeb4f0`, esquema SQLite 20, contrato del agricultor 4). **Revisados el 2026-11-14** contra el código de Backend/Web `af449ba` (`main` `a8b6504`) y de Mobile `65e1004`: textos de pantalla, menú y guardas por rol, y reglas vigentes.

| Manual | Para quién | Contenido |
|---|---|---|
| [MANUAL_AGRICULTOR.md](MANUAL_AGRICULTOR.md) | Agricultor (app móvil), en modo individual y con varias personas | Activación, Inicio, compra, aplicación, plan, almacén, avisos y estimación, actividad y proveedores, chacos y costos, reportes Excel/PDF, voz, sindicato, compras conjuntas (CONV-4), identificación con foto, respaldos, cambio de modo, actualización, textos de la app que no coinciden con la navegación |
| [MANUAL_WEB_DIRECTIVA.md](MANUAL_WEB_DIRECTIVA.md) | Directiva (Web) | Resumen y cobertura con la política aplicada, borrador de compra con consumo estimado, convocatorias sólo con totales, catálogo e identificación, histórico, estimación y sellado, campañas, Bitácora, Excel |
| [MANUAL_WEB_ADMINISTRACION.md](MANUAL_WEB_ADMINISTRACION.md) | Administración (Web) | Lo que añade a la Directiva: detalle individual autorizado (sólo en pantalla), sustitución de responsable sin autosustitución, usuarios y roles, Bitácora de cuentas |
| [MANUAL_TECNICO_INSTALACION.md](MANUAL_TECNICO_INSTALACION.md) | Operador técnico | Variables y migración del Backend, política `COLLECTIVE_DISCLOSURE_POLICY`, compilación de la Web, APK (firma, `AGRO_API_BASE_URL`, modelos de voz, evidencia de dictado), estado de las APK, actualización 19 → 20, respaldo y recuperación |

**Qué no son:** no acreditan despliegue, aceptación visual del autor, evaluación con usuarios ni validación institucional. Todo lo verificado lo fue con datos sintéticos, en emulador o navegador, sin teléfono físico. Cada manual separa lo verificado de lo que no lo está y cita sus capturas con fecha, versión y entorno.

**No hay despliegue ni APK distribuible.** No existe ninguna API desplegada para usuarios. La release de Mobile sale **sin firmar** (no instalable); la candidata de evaluación OE5 es una compilación de prueba firmada con la clave de depuración, **no una distribución** (manual técnico, apartado 5.4).

**Reglas vigentes que recogen:** `F07-POL-02` adoptada por el autor, con la activación institucional pendiente (en producción, `POLICY_PENDING`); CONV-4 con los alcances `ADMINISTRATION` y `TOTALS_ONLY`, que no rigen hasta el acuse del servidor; sin CSV ni Calendario; sin exportación de convocatorias (D-07); identidad de quien pide identificar un producto no expuesta a la Directiva, retención de la foto de 90 días, y borrar la foto no borra la solicitud ni la auditoría (E1); Bitácora con cuentas, roles, nombres equivalentes y catálogo (`af449ba`); evidencia de dictado sólo en la compilación de evaluación.

## Documentos históricos (no son manuales vigentes)

Se conservan como registro. No describen la versión actual y no deben usarse como manual.

- [F11_MANUAL_USUARIO.md](F11_MANUAL_USUARIO.md): borrador F11 de octubre de 2026 (Mobile `1d77c14` y posteriores parciales). Describe navegación, CSV y vistas que ya no existen. Lo sustituyen el manual del agricultor y los dos manuales de la Web.
- [F11_MANUAL_TECNICO.md](F11_MANUAL_TECNICO.md): borrador F11 técnico. Lo sustituye el manual técnico. Sus apartados 5 y 6 (respaldos) siguen siendo la referencia detallada del código de respaldos, que no cambió.
