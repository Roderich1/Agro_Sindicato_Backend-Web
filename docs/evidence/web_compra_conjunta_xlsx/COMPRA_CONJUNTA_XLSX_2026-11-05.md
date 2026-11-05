# Exportador «Compra conjunta» a Excel y revisión del CSV de la DEMO (2026-11-05)

- **Fecha real:** 2026-11-05.
- **Rama:** `feat/web-compra-conjunta-xlsx` (worktree `_wt/WEB-XLSX`).
- **Punto de partida:** cabeza del PR #203 (`feat/web-defensa-simplificacion`, borrador, abierto) en `1a0becb5027b8f1ebd0a99fb117c4288971027d3`. Su base es `origin/main` `5973b496989724dbf59c338a777cd2ab5b458da8`.
- **Código verificado:** `ef30a78650a9ecad7cc83b242b8dfc14279e3303` (exportador en `992411d` + enganche en `ef30a78`). Las muestras y las lecturas de Excel se regeneraron sobre `ef30a78`.
- **Trazabilidad:** CU-12, RF-23 (borrador de propuesta conjunta y su exportación).
- **Datos:** sintéticos. No se escribió nada en ninguna base de datos: el exportador es una función pura y la muestra «DEMO» se reconstruyó a partir de un CSV que ya se había descargado de la DEMO. No se tocaron el móvil, el POCO, la DEMO oficial ni el PR #172.
- **Equipo:** Windows 11 Home 10.0.26200, configuración regional `es-US` (lista `,`, decimal `.`, miles `,`), Microsoft Excel 16.0 (compilación 20527), Node v25.9.0.

## 1. Qué se entrega

| Archivo | Qué es |
|---|---|
| `Web/src/lib/xlsx-writer.ts` | Escritor `.xlsx` mínimo y sin dependencias: ZIP sin compresión, texto en línea, estilos, anchos, filtro automático y paneles inmovilizados. No escribe fórmulas. No cambia `package.json`. |
| `Web/src/lib/joint-purchase-xlsx.ts` | Exportador de Compra conjunta: `buildJointPurchaseXlsx`, `downloadJointPurchaseXlsx`, `jointPurchaseXlsxFileName`, `XLSX_MIME`. |
| `Web/src/lib/joint-purchase-xlsx.test.ts` | 20 pruebas: el libro se descomprime y se leen las celdas (tipo, estilo y valor). |
| `Web/src/lib/joint-purchase-excel-export.ts` (+ `.test.ts`, 4 pruebas) | `downloadProposalExcel(proposalRef)`: el enganche con la forma que espera `excelExport.download` del PR #205. Pide el borrador y su referencia por el mismo `proposal_ref`, arma el libro y lo descarga. |
| `enganche-pr205.patch` | Propuesta de conexión para la sesión 1 sobre `lib/exports.ts` y `components/export-buttons.tsx` del PR #205. **No está aplicada en esta rama.** |
| `docs/evidence/web_compra_conjunta_xlsx/muestra-demo-borrador.xlsx` | Muestra a partir del borrador `11f5e558…` de la DEMO. |
| `docs/evidence/web_compra_conjunta_xlsx/muestra-casos-sinteticos.xlsx` | Muestra con casos límite: decimales, kg, miles, cifra oculta, revisión, cambios pendientes, cero publicado y estimación de 9 decimales. |
| `muestra-entradas.json` | Las entradas exactas de las dos muestras. |
| `csv-demo-propuesta-11f5e558.csv` | El CSV de la DEMO revisado: copia byte a byte de `Descargas/propuesta-11f5e558-dbd6-4000-9a58-b0b906c2bcd7.csv`, descargado el 2026-11-05 a las 12:32, SHA-256 `34bc48ab…3116d`. |
| `excel-lectura-*.txt` | Lo que leyó Excel en cada hoja de las dos muestras. |
| `herramientas/` | Scripts usados: `make-samples.mjs` genera las muestras, `excel-read.ps1` vuelca las celdas desde Excel, `excel-csv-bo.ps1` importa un CSV con los separadores de Bolivia e `integracion-pr205.test.tsx.txt` es la prueba temporal de §3. |

No se tocaron pantallas, menú ni botones. Conectar el botón le corresponde a la sesión de interfaz (§5).

## 2. Contenido del libro

| Hoja | Contenido |
|---|---|
| **Borrador** | Campaña, estado de la campaña, estado del borrador («Borrador»), base («Necesidad declarada por los agricultores»), fecha de generación, autor, versión sellada, cobertura, aviso del servidor, referencia del borrador, huella, fecha de exportación, si la referencia de consumo va o no en el libro (y por qué), y cómo leer una celda vacía. |
| **Necesidades** | Producto · **Cantidad** (número) · **Unidad** (L/KG de la línea) · **Estado** · Explicación · Aportantes · Datos hasta. Encabezado con filtro y fila inmovilizada. |
| **Referencia de consumo** | Sólo si se cargó la referencia de ese mismo borrador. Lleva la fecha en que se evaluó la vigencia, la temporada y el aviso. Columnas: Producto · **Estimación** (número) · Unidad · Explicación · **Vigencia** · Motivo de la vigencia · **Ejecución del** (fecha) · Relación con el borrador · Ejecución (referencia) · Nota (necesidad no divulgada). |

Reglas, iguales a las de la pantalla «Necesidades y propuesta conjunta»:

- **Ausencia no es cero.** Una línea que no está `DISCLOSED`, o cuya cifra no es válida, deja vacía la celda numérica y explica el motivo con el texto de `statusReason`. También quedan vacíos Aportantes y «Datos hasta». Si el servidor manda por error un número en una línea no publicada, ese número no se exporta. Un 0 publicado sí se escribe como 0.
- **No se recalcula nada.** La cantidad es `quantity_presentation` del servidor, comprobada contra `quantity_base` y la unidad, como hace `formatQuantity`. La estimación es `estimate_base` con la coma desplazada tres lugares sobre el texto (mL→L, g→kg), igual que `formatDecimalQuantity`. No hay totales ni sumas, y cada fila conserva su unidad.
- **Los conceptos se mantienen separados.** La necesidad declarada y la estimación del consumo van en hojas distintas. Agregar la referencia no cambia ni un byte de la hoja «Necesidades» (está probado).
- **Sólo se exporta lo autorizado para ese borrador.** Una referencia de otro `proposal_ref` no se incluye, y la hoja «Borrador» lo dice. Una línea de referencia sólo se asocia si coinciden la posición, el producto y la unidad.
- **Sin aviso de modo provisional.** El modo `PROVISIONAL_SYNTHETIC` no añade ningún texto, según la política ya aprobada. Sólo `POLICY_PENDING` se explica, porque es el motivo de que no haya cifras.
- **Los decimales se leen igual en cualquier configuración regional.** El XML guarda `11.5`; Excel lo muestra como `11.5` o `11,5` según el equipo. Cada celda lleva un formato con tantos decimales como trae el dato (`#,##0.0`, `#,##0.000000000`…).
- **Más de 15 dígitos significativos:** Excel redondearía la cifra, así que la celda numérica queda vacía y la explicación da el valor exacto como texto.
- **Fechas:** son fechas de Excel en hora de Bolivia (UTC−4, sin horario de verano), con formato `aaaa-mm-dd hh:mm`, y la zona va en el encabezado.
- **Textos de usuario:** se guardan como texto en línea. Un nombre como `=HYPERLINK(...)` no se evalúa.

## 3. Comprobaciones ejecutadas (sobre `ef30a78`)

| Comando (en `Web/`) | Resultado |
|---|---|
| `npx vitest run src/lib/joint-purchase-xlsx.test.ts` | 20/20 pasan. |
| Mutación manual: anular la condición «sólo `DISCLOSED` exporta cifra» | 2 pruebas fallan, como se esperaba («una cifra oculta deja la celda numérica vacía…» y «cada estado sin cifra…»). Luego se restauró la condición. |
| `npx vitest run` (toda la Web) | 19 archivos y 194 pruebas pasan. |
| `npx tsc -b` | Sale con 0. |
| `npx eslint .` | 0 errores. Hay 2 avisos previos en `contexts/*.tsx` que no tocó este cambio. |
| `npm run build` (sobre `992411d`) | La compilación termina y se genera el service worker. |
| **Integración con el PR #205** (worktree temporal, ya borrado): `0c2d27f` + `git merge feat/web-compra-conjunta-xlsx` + `enganche-pr205.patch` + `npm ci` | Fusión sin conflictos. `tsc -b` sale con 0 y `vitest run` da 194/194. La prueba temporal `integracion-pr205.test.tsx.txt` renderiza la página real del borrador, pulsa «Descargar Excel» y obtiene `propuesta-<ref>.xlsx` (ZIP) pedido por el mismo `proposal_ref`. |

### Excel 16.0 (COM, sólo lectura, `herramientas/excel-read.ps1`)

- Las dos muestras abren con 3 hojas y **sin reparación**: no apareció ningún `error*.xml` nuevo en `%TEMP%` (antes = 0, después = 0).
- **La muestra DEMO coincide con el borrador** (valores del CSV del servidor para el mismo `proposal_ref`):

  | Producto | CSV (`quantity_presentation`, `status`) | Excel, hoja Necesidades | CSV `estimation_*` | Excel, hoja Referencia |
  |---|---|---|---|---|
  | Fungicida DEMO | `53`, DISCLOSED, 3 aportantes | Double 53, «L», «Publicado», 3 | INSUFFICIENT_DATA / SPAN_TOO_SHORT / NOT_USABLE | vacía, «Sin cifra: Datos insuficientes…», «No utilizable» |
  | Herbicida DEMO | `250`, DISCLOSED, 5 | Double 250, «L», «Publicado», 5 | ESTIMATED `111000.000000` (mL), CURRENT | Double 111, «L», «Vigente» |
  | Insecticida DEMO | vacío, SUPPRESSED_UNDER_THRESHOLD | **celda vacía**, «Oculto», motivo del umbral | NO_RESULT | vacía, «Sin estimación…», nota de necesidad no divulgada |

  Las fechas coinciden: generado `2026-11-05T14:21:43Z`, que en Excel aparece como `2026-11-05 10:21` (UTC−4), y datos hasta `2026-11-03T23:54:25Z`, que aparece como `2026-11-03 19:54`.
- **Muestra de casos:** Excel guarda `11.5`, `0.025` (KG), `1234567.5`, `0` publicado, `10.75025`, `0.000292613` (KG) y `48.0005` como Double. Las filas ocultas o en revisión, sin resultado o con la cifra retirada quedan con Value2 vacío. Ninguna se convierte en 0.
- **Con separadores de Bolivia** (`DecimalSeparator=','`, `ThousandsSeparator='.'` sólo en esa instancia de Excel; después se restauraron y se comprobó `UseSystemSeparators=True`, `.` y `,`), Excel muestra `11,5`, `0,025`, `1.234.567,5`, `0,000292613` y `48,0005`, con el mismo valor guardado.
- Anchos: la columna B de «Referencia» se ensanchó a 18 porque la primera lectura mostraba `#####` en la fecha de evaluación. Las notas largas se leen sobre las celdas vacías de la derecha.

## 4. Revisión del CSV de la DEMO

Archivo: `csv-demo-propuesta-11f5e558.csv`. Es la respuesta de `GET /collective/proposals/{id}/csv` (`proposalCsv` + `appendixOf`). Está en UTF-8 **sin BOM**, separado por comas, con punto decimal, códigos internos (`DISCLOSED`, `ESTIMATED`…) y dos bloques en una sola hoja (cabecera del borrador y líneas).

| Posible fallo | Resultado | Cómo se comprobó |
|---|---|---|
| **Codificación** | **Defecto confirmado.** Al abrirlo como lo abre un doble clic, Excel lo lee como Windows-1252: «Estimación» aparece como «EstimaciÃ³n», «campaña» como «campaÃ±a» y «líneas» como «lÃneas». | Excel real, `Workbooks.Open` en este equipo. |
| **Separador** | **Defecto en equipos con coma decimal** (es-BO usa `;` como separador de lista): cada fila queda en la columna A (`A1:A8`). En este equipo (es-US) las columnas se separan bien. | Excel real con su separador decimal cambiado a `,`, y también con una QueryTable delimitada por `;` (`excel-csv-bo.ps1`). No se probó en un equipo con Windows configurado en es-BO. |
| **Decimales** | **Defecto grave en equipos con coma decimal.** Si se fuerza la separación por comas con decimal `,` y miles `.`, `111000.000000` se lee como **111.000.000.000** (Double 111000000000, un millón de veces el valor real). Una cantidad como `11.5` sufriría lo mismo. Con es-US los decimales se leen bien. | QueryTable de Excel con `TextFileDecimalSeparator=','` y `TextFileThousandsSeparator='.'`. Es una emulación y no se probó en un equipo es-BO. |
| **Contenido** | No es un defecto del formato de intercambio, pero es poco legible para una persona: códigos en inglés, fechas ISO como texto, columnas técnicas y dos tablas en una hoja (el filtro no se aplica limpio). El texto que empieza con `=`, `+`, `-` o `@` ya se neutraliza (`csvField`). | Lectura del archivo. |

**Decisión:** el CSV **no se cambia**. Es el formato de intercambio del servidor: correcto según RFC 4180, en UTF-8, con cifras exactas en unidad base y probado en el Backend (`proposalCsv`, F12-EST-08). Los tres defectos aparecen cuando una persona lo abre directamente en Excel, y para ese uso está el `.xlsx`. Quedan propuestas para que Roderich decida, sin aplicar:
1. Añadir un BOM UTF-8 a la descarga (sólo en la Web o en el Backend). Corrige la codificación en Excel pero cambia los bytes del formato de intercambio, así que hay que revisar los consumidores.
2. Rotular el botón como «CSV (datos)» junto a «Excel», para que nadie tome el CSV como la vista para personas. Esto le corresponde a la sesión de interfaz.

## 5. Para la sesión de interfaz (sesión 1) y la de integración

**Contrato**

```ts
import { buildJointPurchaseXlsx, downloadJointPurchaseXlsx, jointPurchaseXlsxFileName, XLSX_MIME } from '../lib/joint-purchase-xlsx';

interface JointPurchaseXlsxInput {
  proposal: Proposal;                                  // tal como lo devolvió GET /collective/proposals/{id}
  reference?: ProposalEstimationReference | null;      // la del MISMO borrador, si está cargada; si no, se omite la hoja
  exportedAt?: Date;                                   // por defecto, ahora
  utcOffsetMinutes?: number;                           // por defecto −240 (Bolivia)
}
interface JointPurchaseXlsx { bytes: Uint8Array; fileName: string; includesReference: boolean }

buildJointPurchaseXlsx(input): JointPurchaseXlsx       // pura, no hace peticiones ni toca el DOM
downloadJointPurchaseXlsx(input): JointPurchaseXlsx    // lo mismo + descarga en el navegador (como «Exportar CSV»)
jointPurchaseXlsxFileName(proposal) === `propuesta-${proposal.proposal_ref}.xlsx`
```

Sólo lanza un error ante un fallo de programación (por ejemplo, un nombre de hoja no válido). Con datos del servidor no lanza: lo dudoso queda vacío y se explica.

**Conexión con el botón «Descargar Excel» del PR #205** (`enganche-pr205.patch`, probado en §3):

```ts
// Web/src/lib/exports.ts
import { downloadProposalExcel } from './joint-purchase-excel-export';
// en ExcelExport: supports: (kind: ExcelKind) => boolean;
export const excelExport: ExcelExport = {
  download: async (kind, ref) => {
    if (kind !== 'proposal') throw new Error('Excel aún no disponible para esta vista.');
    await downloadProposalExcel(ref);
  },
  supports: (kind) => kind === 'proposal',
  unavailableReason: '…',
};
// Web/src/components/export-buttons.tsx
const excel = excelExport.supports(kind) ? excelExport.download : null;
```

`supports` es necesario: sin él, en cuanto `download` deja de ser `null`, los botones de Resumen, Historial y Estimación también se habilitarían y fallarían, porque esta entrega sólo cubre el borrador. Además, `ExportButtons` no captura errores: conviene añadir un `catch` que muestre `collectiveError(err, 'No fue posible descargar el Excel.')`, porque `downloadProposalExcel` rechaza con el error HTTP original si el borrador no se puede cargar.

**Sin el PR #205** (sobre #203), basta con llamar a la función pura con los datos que la pantalla ya tiene:

```tsx
downloadJointPurchaseXlsx({ proposal, reference: reference?.status === 'ready' ? reference.data : null });
```

**Integración**

- La rama sale de `1a0becb` (PR #203) y sólo **añade** archivos: `Web/src/lib/{xlsx-writer,joint-purchase-xlsx,joint-purchase-xlsx.test,joint-purchase-excel-export,joint-purchase-excel-export.test}.ts` y esta carpeta de evidencia. No modifica ningún archivo existente. Se fusiona sin conflictos sobre #205 (`0c2d27f`, comprobado) y no puede entrar en conflicto con #172, porque no toca ninguno de sus archivos.
- Los rótulos de estado (`LINE_STATUS_LABEL`) copian `STATUS_TEXT` de `components/collective-ui.tsx`, que no se exporta. Si la sesión 1 cambia esos rótulos, conviene exportar `STATUS_TEXT` y usarlo aquí.
- Usa `statusReason`, `CAMPAIGN_STATUS_TEXT` (`lib/collective-text.ts`) y los textos de `lib/estimation-text.ts`. Si #203 cambia esos textos, el libro los sigue automáticamente.
- Para volver a generar las muestras: `npx rolldown src/lib/joint-purchase-xlsx.ts --format esm --platform node --file <tmp>/jp.mjs` y luego `node herramientas/make-samples.mjs <tmp>/jp.mjs csv-demo-propuesta-11f5e558.csv <salida>`.
- No fusionar sin el visto bueno de Roderich.

## 6. Limitaciones declaradas

- No se probó en un equipo con Windows configurado en **es-BO**. El comportamiento del CSV y la presentación del `.xlsx` con coma decimal se comprobaron cambiando los separadores dentro de Excel y con una importación con separadores explícitos.
- Sólo se probó **Excel 16 de escritorio**. No se abrieron las muestras en LibreOffice, Google Sheets ni Excel para la web.
- La muestra DEMO se construyó a partir del CSV del servidor y no del JSON de la API. El CSV no trae el estado de la campaña, así que esa celda dice «(no consta en el CSV)» en lugar de inventar un valor. La muestra de casos sí lleva «Abierta».
- El exportador aún no está conectado a ningún botón en una rama publicada. La conexión con #205 se probó sólo en un worktree temporal (§3) y queda como parche para la sesión 1.
- No se pulsó el botón en un navegador real contra la API: la copia aislada de la DEMO (3340) la usa la sesión 1, y entrar exige reiniciar la contraseña. La descarga se probó en jsdom con HTTP simulado, y el archivo, en Excel.
- Sólo el borrador (`kind 'proposal'`) tiene Excel. Resumen, Historial y Estimación no están en este lote.
- No incluye PDF, por decisión del pedido.
