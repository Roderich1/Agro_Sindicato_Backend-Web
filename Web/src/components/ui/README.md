# `components/ui`: componentes compartidos de la Web institucional (rediseño v2)

Contrato de la sesión BASE del rediseño v2 (2026-11-13), según las láminas del ZIP «Agrocuentas · Rediseño de la Web-png» y las reglas de `docs/rediseno-web/COORDINACION.md` §5–§6. Sustituye al contrato mínimo del rediseño v1 y conserva sus firmas: lo que funcionaba con v1 sigue compilando.

Las sesiones A, B y C importan **sólo** desde el índice:

```ts
import { Button, ConfirmDialog, DataState, HeroPanel, StatusChip } from '../components/ui';
```

## Reglas comunes

- **Textos y cifras**
  - Español, con trato de «usted».
  - Ningún componente calcula, suma ni deduce cifras: muestran lo que la vista ya recibió del servidor, ya formateado.
  - Ningún componente trae datos fijos.
- **Estados**
  - Ningún estado se comunica sólo por color: siempre hay texto.
  - Los iconos son decorativos (`aria-hidden`).
  - Lo «oculto» lleva borde discontinuo y candado. Oculto no es cero, y la ausencia de un dato tampoco.
- **Movimiento**
  - Sin contadores animados ni efectos decorativos.
  - Al pulsar un botón: `scale(0.98)` durante 120 ms con `--ease-out`.
  - Los diálogos aparecen con un fundido de 120 ms; en teléfono, la hoja inferior sube 24 px en 180 ms.
  - Con `prefers-reduced-motion: reduce` sólo queda el fundido.
  - Pestañas, filas, rutas y foco no se animan.
- **Superficies:** sólidas, sin `backdrop-filter` ni degradados.
- **Foco visible**
  - Sobre fondo claro, anillo de 2 px en tinta.
  - Sobre superficies oscuras, anillo lima: la clase `ui-on-ink` lo cambia.
- **Tamaños táctiles:** los controles de tamaño `md` miden al menos 44 px de alto.
- **Ejemplos:** usan las formas de `src/types/*.ts`; ninguno inventa campos de API.

---

## Tokens (`src/index.css`, `@theme` de Tailwind 4)

Contrastes medidos con la fórmula WCAG 2.x el 2026-11-13.

| Token | Valor | Utilidad | Uso |
|---|---|---|---|
| `--color-ink` | `#0f2a1d` | `bg-ink`, `text-ink` | Tinta: texto, barra lateral, cabecera oscura, botón primario. 13,8:1 sobre el fondo |
| `--color-ink-raised` | `#29473a` | `bg-ink-raised` | Superficie elevada sobre tinta: selector del hero, subítem activo, tarjeta de usuario |
| `--color-ink-line` | `#1e3a2d` | `border-ink-line` | Líneas sobre tinta |
| `--color-ink-muted` | `#55645a` | `text-ink-muted` | Texto secundario. 6,3:1 sobre blanco y 5,6:1 sobre el fondo |
| `--color-on-ink` / `--color-on-ink-muted` | `#e8f1ea` / `#b9c9be` | `text-on-ink`, `text-on-ink-muted` | Texto sobre tinta. 8,9:1 sobre tinta y 5,9:1 sobre el elevado |
| `--color-lime` | `#c8f04a` | `bg-lime`, `text-lime` | Acento: ítem activo, botón `accent` y cifra grande del hero. Con tinta, 11,7:1. **Nunca** como texto sobre claro (1,2:1) |
| `--color-lime-soft` / `--color-lime-ink` | `#e3f6a8` / `#24400a` | `bg-lime-soft`, `text-lime-ink` | Estado positivo («Abierta», «Publicado»), 9,9:1 |
| `--color-canvas` | `#f2f4ee` | `bg-canvas` | Fondo de la página |
| `--color-surface` | `#ffffff` | `bg-surface` | Tarjetas |
| `--color-sunken` | `#e9ede4` | `bg-sunken` | Notas, chips neutros y recuadro de icono gris |
| `--color-field` / `--color-field-border` | `#f2f4ee` / `#7d8d82` | `bg-field`, `border-field-border` | Campos. Borde de 3,5:1 sobre blanco y 3,2:1 sobre el fondo (WCAG 1.4.11) |
| `--color-line` / `--color-track` | `#dfe4da` / `#e3e8dd` | `border-line`, `bg-track` | Separadores y pista de las barras |
| `--color-link` | `#1f6b3a` | `text-link` | Enlace dentro de un texto, 6,5:1 |
| `--color-warn-bg` / `--color-warn-ink` / `--color-caution` | `#ffe0a3` / `#3d2700` / `#8a5300` | `bg-warn-bg`, `text-warn-ink`, `text-caution` | Avisos («Cifra anterior», «Datos sintéticos»), 11:1. `caution` es texto ámbar sobre blanco, 6,3:1 |
| `--color-danger` / `--color-danger-bg` / `--color-danger-ink` | `#b3261e` / `#ffdad6` / `#8c1d18` | `bg-danger`, `bg-danger-bg`, `text-danger-ink` | Destructivo y error. Blanco sobre rojo, 6,5:1; texto de error, 7:1 |
| `--color-brand-50…800` | lima suave → tinta | `bg-brand-700`… | **Compatibilidad** con las vistas del v1: apuntan a la identidad nueva. No los use en código nuevo |
| `--font-sans` / `--font-display` | DM Sans / Bricolage Grotesque | `font-sans`, `font-display` | Texto y títulos o cifras grandes. `h1`–`h3` ya usan `font-display` |
| `--radius-control` / `--radius-field` / `--radius-card` / `--radius-hero` | 12 / 14 / 24 / 28 px | `rounded-control`, `rounded-field`, `rounded-card`, `rounded-hero` | Los botones son píldoras (`rounded-full`) |
| `--shadow-card` / `--shadow-raised` | sombra mínima / diálogo | `shadow-card`, `shadow-raised` | — |
| `--ease-out`, `--duration-fast`, `--duration-base` | `cubic-bezier(0.23,1,0.32,1)`, 120 ms, 180 ms | — | — |

Clases de `index.css`:

- `ui-on-ink`: superficie oscura, con foco lima y texto claro.
- `ui-dashed`: borde discontinuo del estado oculto.
- `ui-table`, `ui-table-scroll` y `ui-table-stack`: tablas.
- `ui-num`: cifra alineada a la derecha.
- `ui-gutter`: márgenes laterales del armazón.
- `ui-hero-attach`: hero pegado a la barra del teléfono.
- `skeleton`: barra gris de carga.
- `skip-link`: enlace para saltar al contenido.

Las tipografías son locales (`public/fonts`, procedencia y SHA-256 en `public/fonts/LICENSES.md`). No se hace ninguna petición a Google Fonts.

---

## Tipos de presentación (`ui/types.ts`)

```ts
type DataStateKind = 'loading' | 'empty' | 'no-match' | 'error' | 'forbidden' | 'restricted' | 'insufficient' | 'stale'
  | 'offline' | 'busy' | 'policy-pending';          // nuevos en v2 (lámina 05)
type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'on-dark' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';
type NoticeKind = 'ok' | 'error' | 'info' | 'warn';
type KpiTone = 'default' | 'muted' | 'attention' | 'inverse';
type TagTone = 'neutral' | 'positive' | 'attention' | 'danger' | 'hidden' | 'dark' | 'lime' | 'on-dark';
```

---

## Acciones

### `Button`, `IconButton` y clases de botón

```ts
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref?: Ref<HTMLButtonElement>;
  variant?: ButtonVariant;   // 'primary' por defecto
  size?: ButtonSize;         // 'md' por defecto (44 px)
  icon?: ReactNode;          // decorativo, antes del texto
  iconEnd?: ReactNode;       // decorativo, después del texto
  block?: boolean;           // ancho completo
  busy?: boolean;            // deshabilita, aria-busy e indicador; el texto lo decide la vista
}
interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;             // aria-label obligatorio
  icon: string | ReactNode;  // trazo de ICON o nodo
  variant?: 'ghost' | 'secondary' | 'on-dark' | 'accent' | 'primary';
  size?: 'sm' | 'md';        // 36 o 44 px
}
function buttonClassFor(variant?, size?): string;   // para <Link className={…}>
function iconButtonClassFor(variant?, size?): string;
const buttonClass, secondaryButtonClass, ghostButtonClass, dangerButtonClass: string;
```

**Variantes:**

| Variante | Aspecto | Uso |
|---|---|---|
| `primary` | Tinta sobre claro | La acción principal de la vista o del diálogo |
| `accent` | Lima, sobre la cabecera oscura | «Revisar borrador →» |
| `secondary` | Con borde | «Volver», «Cancelar» |
| `on-dark` | Con borde claro sobre oscuro | «Descargar Excel» y el botón de actualizar del hero |
| `ghost` | Sin borde ni fondo | — |
| `danger` | Rojo | Cancelar, inactivar |

**Reglas:**
- `type="button"` por defecto.
- Una vista muestra **una** acción `primary`.
- Las acciones de negocio conservan su confirmación actual (ver `ConfirmDialog`).

```tsx
<Button variant="accent" iconEnd={<Icon d={ICON.arrowRight} className="h-4 w-4" />} onClick={openDraft}>Revisar borrador</Button>
<Button variant="on-dark" icon={<Icon d={ICON.download} />} onClick={exportExcel}>Descargar Excel</Button>
<IconButton label="Actualizar" icon={ICON.refresh} variant="on-dark" onClick={reload} />
<Link to={COLLECTIVE_PATHS.coverage} className={buttonClassFor('secondary', 'sm')}>Ver cobertura</Link>
```

---

## Campos (`field.tsx`)

Todos asocian etiqueta, ayuda y error por id:

- `htmlFor` une la etiqueta con el control;
- `aria-describedby` apunta primero al error y después a la ayuda;
- con error, el control lleva `aria-invalid="true"` y el borde rojo;
- el error aparece con un icono y siempre en texto.

```ts
interface FieldProps {
  label: ReactNode; help?: ReactNode; error?: ReactNode;
  optional?: boolean;   // «(opcional)» en la etiqueta
  required?: boolean; id?: string; hideLabel?: boolean; className?: string;
  children: (control: { id; 'aria-describedby'?; 'aria-invalid'?; required? }) => ReactNode;
}
function Field(props: FieldProps): JSX.Element;                      // para un control propio
function TextInput(props: FieldOwnProps & InputHTMLAttributes): JSX.Element;
function Textarea(props: FieldOwnProps & TextareaHTMLAttributes): JSX.Element;  // 3 filas, crece en vertical
function Select(props: FieldOwnProps & SelectHTMLAttributes): JSX.Element;      // <select> nativo
// FieldOwnProps = { label, help?, error?, optional?, hideLabel?, fieldClassName? }

interface SearchInputProps { label: string; value: string; onChange(value: string): void; showLabel?: boolean; placeholder?…; }
interface CheckboxProps extends InputHTMLAttributes { label: ReactNode; description?: ReactNode }
interface RadioCardsProps<T> { legend; name; options: { value: T; label; description?; disabled? }[]; value: T | null; onChange(v: T); help?; hideLegend? }
```

- **`SearchInput`**: búsqueda en forma de píldora con lupa (láminas 03 y 21). La etiqueta está oculta, pero es el nombre accesible. Filtra en la vista; el componente no busca por su cuenta.
- **`Checkbox`**: casilla de «Confirmo que…».
- **`RadioCards`**: opciones excluyentes en tarjetas, con radios nativos dentro de un `fieldset` (15 «Conceder permiso», 30 «Nuevo producto»). La elegida lleva un borde de 2 px en tinta.

```tsx
<TextInput label="Nombre" placeholder="Por ejemplo: Invierno 2027" value={name} onChange={(e) => setName(e.target.value)} error={nameError} />
<Textarea label="Notas" optional help="Opcional." value={notes} onChange={(e) => setNotes(e.target.value)} />
<RadioCards legend="Unidad" name="unidad" value={unit} onChange={setUnit} help="La unidad no se puede cambiar después."
  options={[{ value: 'L', label: 'Litros', description: 'Para productos líquidos.' }, { value: 'kg', label: 'Kilogramos', description: 'Para productos sólidos.' }]} />
```

`inputClass`, `labelClass`, `helpClass` y `linkClass` siguen exportándose para los campos propios de las vistas.

---

## Superficies

### `Card`

```ts
interface CardProps { children; tone?: 'surface' | 'sunken' | 'ink'; padding?: 'none' | 'sm' | 'md' | 'lg';
  as?: 'div' | 'section' | 'article' | 'li'; label?: string; className?: string; testId?: string }
```

Tarjeta de 24 px de radio:

- `surface`: blanca, con borde suave;
- `sunken`: gris, para notas;
- `ink`: oscura, con `ui-on-ink`.

### `Section` y `SectionHeader`

Firma sin cambios desde v1:

```ts
interface SectionHeaderProps { title: ReactNode; note?: ReactNode; actions?: ReactNode; badge?: ReactNode; headingId?: string }
interface SectionProps extends Partial<Omit<SectionHeaderProps, 'headingId'>> { children: ReactNode; label?: string; testId?: string }
```

Tarjeta blanca de sección. Con `title`, `Section` dibuja un `<h2>` de 20–24 px en Bricolage, con la nota en gris y las acciones a la derecha, y la sección queda etiquetada por él (lámina 03, «Necesidades declaradas»).

### `PageHeader`

```ts
interface PageHeaderProps { title: string; subtitle?: ReactNode; campaign?: ReactNode; actions?: ReactNode;
  headingLevel?: 1 | 2; eyebrow?: ReactNode; testId?: string }
```

Cabecera **clara** de una vista, con el título grande en Bricolage (lámina 21, «Catálogo»).

- `eyebrow`: migas encima del título.
- Debajo, la campaña a la izquierda y la acción a la derecha. En pantallas estrechas se apilan.

### `HeroPanel`: cabecera oscura (láminas 03 y 35)

```ts
interface HeroPanelProps {
  title: string;                 // <h1> (o <h2> con headingLevel=2)
  headingLevel?: 1 | 2;
  breadcrumb?: ReactNode;        // «<sindicato> · Resumen de la campaña», armado con datos reales
  select?: { label: string; value: string; options: { value: string; label: string }[]; onChange(v: string): void; id?: string };
  chips?: ReactNode;             // StatusChip, <Chip tone="on-dark">Campaña activa</Chip>…
  corner?: ReactNode;            // arriba a la derecha
  actions?: ReactNode;           // IconButton/Button variant="on-dark"
  primaryAction?: ReactNode;     // Button variant="accent"
  figure?: { label: ReactNode; value: ReactNode; caption?: ReactNode };  // cifra grande en lima
  stats?: { key?: string; label: ReactNode; value: ReactNode }[];      // <dl> a la derecha
  children?: ReactNode;
  attachToHeader?: boolean;      // teléfono: pegado a la barra superior oscura
  testId?: string;
}
```

- **Selector:** con `select`, el título es un `<select>` nativo grande con chevron lima. El `<h1>` queda para lectores de pantalla, y `title` del selector lleva el nombre completo.
- **Cifras:** `figure.value` y `stats[].value` llegan formateados. Un valor oculto se pasa como `<PrivacyChip />` o como el texto del estado, **nunca como 0**.
- **«Datos sintéticos»:** la etiqueta ya la muestra el armazón cuando el servidor la declara. No la repita en `corner`.

```tsx
<HeroPanel
  attachToHeader
  title="Resumen de la campaña"
  breadcrumb={`${user.tenant.name} · Resumen de la campaña`}
  select={{ label: 'Campaña', value: selected, options: campaigns.map((c) => ({ value: c.id, label: c.name })), onChange: select }}
  chips={<><StatusChip status={campaign.status} />{campaign.isActive && <Chip tone="on-dark">Campaña activa</Chip>}</>}
  actions={<><IconButton label="Actualizar" icon={ICON.refresh} variant="on-dark" onClick={reload} /><Button variant="on-dark" icon={<Icon d={ICON.download} />}>Descargar Excel</Button></>}
  primaryAction={<Link to={proposalsUrl} className={buttonClassFor('accent')}>Revisar borrador <Icon d={ICON.arrowRight} className="h-4 w-4" /></Link>}
  figure={{ label: 'Cobertura', value: `${cov.members_with_contribution} de ${cov.linked_members}`, caption: 'agricultores vinculados con cifras publicadas' }}
  stats={[{ key: 'pub', label: 'Necesidades publicadas', value: `${n} productos` }]}
/>
```

### `KpiTile`

Firma de v1, más el tono `inverse`:

```ts
interface KpiTileProps { label: string; value: ReactNode; note?: ReactNode; tone?: 'default' | 'muted' | 'attention' | 'inverse'; testId?: string }
```

Etiqueta, cifra en Bricolage con `tabular-nums` y una nota. `inverse` es para usarla sobre tinta.

### `Collapsible`

Firma de v1. Es un `<details>` con «Ver» u «Ocultar» escrito, sin animación.

---

## Estados y etiquetas

### `Chip`, `Tag`, `PrivacyChip`

```ts
interface ChipProps { children: ReactNode; tone?: TagTone; icon?: string | ReactNode; dot?: boolean; size?: 'sm' | 'md'; title?: string; testId?: string }
function PrivacyChip(props: { label?: string /* 'Oculta por privacidad' */; title?; size?; testId? }): JSX.Element;
const Tag = Chip;
```

| Lámina | Uso |
|---|---|
| «Abierta» | `StatusChip status="ABIERTA"` (punto y lima suave) |
| «Campaña activa» | `<Chip tone="on-dark">`, sobre el hero |
| «Datos sintéticos» | `<Chip tone="attention">`; lo pone el armazón |
| «Cifra anterior · hay cambios sin publicar» | `<Chip tone="attention">` |
| «Oculta por privacidad» | `<PrivacyChip />` (`label="Oculta"` en teléfono) |
| Chips punteados de 05 §13 («Oculto por umbral», «Restringido para su acceso», «No disponible mientras esté abierta», «Total no disponible para su acceso actual») | `<Chip tone="hidden" icon={ICON.lock}>texto del estado</Chip>`. El texto lo decide la vista según `totals.visibility` |

### `StatusChip`

Firma de v1: `{ status, threshold?, testId? }`.

- Muestra el estado de la API en español («Publicado», «Abierta», «Oculto por privacidad»…).
- Los estados positivos llevan punto. `SUPPRESSED_UNDER_THRESHOLD` lleva candado y borde discontinuo.
- El motivo de divulgación va en `title`. Como no se puede depender del ratón, la vista debe dar el motivo también en texto cuando importe; para eso está `DataState state="restricted"`.
- `statusChipLabel(status)` e `isKnownStatus(status)` siguen exportándose.

### `FilterChips`

```ts
interface FilterChipsProps<T extends string> { label: string; options: { value: T; label: string; count?: ReactNode }[]; value: T; onChange(v: T): void; testId?: string }
```

Filtro de una lista: Todos, Litros, Kilogramos, Ocultas (lámina 03).

- Es un grupo de botones con `aria-pressed`; el elegido va en tinta.
- En pantallas estrechas se parten en líneas (lámina 35).
- `count` lo calcula la vista con datos ya recibidos. No hay contador si no hay dato.

### `SegmentedControl`

Firma de v1, más `hideLabel?`. Es la píldora blanca con la opción elegida en tinta («Por categoría / Por unidad / Sin agrupar», lámina 21). Úsela para elegir una vista de la URL (`?vista=`).

### `Tabs` y `TabPanel`

```ts
interface TabsProps<T extends string> { label: string; tabs: { value: T; label: ReactNode; count?: ReactNode }[]; value: T; onChange(v: T): void; idBase: string; testId?: string }
interface TabPanelProps { idBase: string; value: string; active: boolean; children: ReactNode }
```

Pestañas ARIA para paneles de la misma página («Borradores anteriores (4)», «Pendientes (6)»):

- `tablist`, `tab` y `tabpanel`;
- flechas, Inicio y Fin;
- tabulación itinerante (sólo la pestaña activa entra en el orden de tabulación);
- subrayado de tinta y negrita;
- recuento en una pastilla ámbar.

### `DataState`

```ts
interface DataStateProps {
  state: DataStateKind; title?: string; description?: ReactNode;
  onRetry?(): void;           // «Reintentar» (no en loading)
  onClearFilters?(): void;    // sólo no-match: «Quitar filtros»
  status?: AnyStatus; threshold?: number | null;   // sólo restricted
  action?: ReactNode;         // p. ej. <Link className={buttonClassFor('primary')} to="/campaigns">Ir a Campañas</Link>
  compact?: boolean;
  align?: 'start' | 'center'; // 'start' por defecto (lámina 05)
  skeletonRows?: number;      // sólo loading: barras grises estáticas
  testId?: string;
}
function dataStateKindForError(error: unknown): DataStateKind;
```

Cada estado tiene:

- un icono en un recuadro de color;
- un título en Bricolage;
- una explicación;
- botones con borde.

Ninguno escribe un «0». `loading` es `role="status"`; `error`, `offline` y `busy` son `role="alert"`.

`dataStateKindForError` traduce el error de una llamada:

| Error | Estado |
|---|---|
| Sin respuesta | `offline` |
| 429 | `busy` |
| 401 o 403 | `forbidden` |
| Otro | `error` |

Así las vistas distinguen los casos 6–9 de la lámina 05 sin una API nueva.

Textos por defecto (la vista puede sustituir título y explicación):

| `state` | Título | Explicación |
|---|---|---|
| `loading` | Cargando… | — |
| `empty` | Sin registros | Todavía no hay registros para mostrar aquí. Eso no significa cero. |
| `no-match` | Sin coincidencias | Ningún registro coincide con el filtro aplicado. |
| `error` | No se pudo cargar la información | Vuelva a intentarlo en un momento. |
| `forbidden` | Sin permiso | Su rol no tiene acceso a esta información. |
| `restricted` | Información restringida | `statusReason(status, threshold)` o «Esta cifra no se publica.» |
| `insufficient` | Datos insuficientes | El servidor indica que no hay datos suficientes. No significa cero. |
| `stale` | Resultado desactualizado | Este resultado corresponde a una ejecución anterior. |
| `offline` | Sin conexión con el servidor | La Web no guarda cambios para después. Vuelva a intentarlo cuando tenga conexión. |
| `busy` | El servidor está ocupado | Su sesión sigue abierta. Espere un momento y vuelva a intentarlo. |
| `policy-pending` | Las cifras todavía no se pueden mostrar | La política de publicación del sindicato está pendiente. Mientras no se apruebe, el servidor no publica cifras colectivas. |

```tsx
catch (err) { setError({ kind: dataStateKindForError(err), text: collectiveError(err) }); }
<DataState state={error.kind} description={error.text} onRetry={reload} />
<DataState state="empty" title="Todavía no hay campañas" description="Cree o abra una campaña para ver su resumen." action={<Link className={buttonClassFor('primary')} to="/campaigns">Ir a Campañas</Link>} />
```

### `Notice`

```ts
function Notice(props: { kind: NoticeKind; children: ReactNode; compact?: boolean; title?: ReactNode; action?: ReactNode }): JSX.Element;
```

Aviso con fondo lleno (láminas 05 y 30): ámbar, rosado, lima o gris, con un icono decorativo. `title` añade una línea en negrita y `action` un botón propio de la vista.

---

## Datos

### `DataTable`

```ts
interface DataTableColumn<T> { key: string; header: ReactNode; label?: string; cell(row: T): ReactNode; numeric?: boolean; rowHeader?: boolean }
interface DataTableProps<T> {
  caption?: string; minWidth?: number; maxHeight?: number | string; testId?: string;
  children?: ReactNode;                                                // modo libre (v1)
  columns?: DataTableColumn<T>[]; rows?: readonly T[]; rowKey?(row: T, i: number): Key;  // modo declarativo (v2)
  stack?: boolean;                                                     // true por defecto en modo declarativo
}
```

- **Modo libre (v1):** igual que antes. El desplazamiento horizontal queda **dentro** del contenedor, la región es enfocable, la cabecera es pegajosa (con `maxHeight`) y la cabecera lleva mayúsculas pequeñas sobre una línea de tinta.
- **Modo declarativo:** por debajo de 640 px, cada fila pasa a ser una tarjeta y cada celda repite su encabezado (`data-label`).
  - Para lectores de pantalla sigue siendo una tabla.
  - `rowHeader` da `<th scope="row">`.
  - `stack={false}` mantiene el desplazamiento horizontal.

```tsx
<DataTable caption="Usuarios" columns={[
  { key: 'name', header: 'Nombre', rowHeader: true, cell: (u: User) => u.name },
  { key: 'role', header: 'Rol', cell: (u) => <RoleBadge role={u.role} /> },
]} rows={users} rowKey={(u) => u.id} />
```

### `ProgressBar` (medidor)

```ts
interface ProgressBarProps { value: number; max: number; label: string; valueText?: string;
  kind?: 'meter' | 'progressbar'; tone?: 'ink' | 'lime' | 'attention'; size?: 'sm' | 'md'; testId?: string }
```

Barra de necesidad (lámina 03): pista gris y relleno proporcional a `value / max`, sin animación ni contador.

- `role="meter"` con `aria-valuetext`.
- No compara unidades: la vista pasa como `max` la referencia de **la misma unidad**.
- Con `max` ≤ 0 o un valor no finito, la pista queda vacía.
- La cifra va siempre escrita al lado.

### `Stepper`

```ts
interface StepperProps { label: string; steps: { key: string; label: string }[]; current: number; note?: ReactNode; testId?: string }
```

Abierta → Cerrada → Sellada (láminas 03 y 29). El paso actual lleva `aria-current="step"` y un anillo lima; los anteriores se rellenan y llevan «(completado)» para lectores de pantalla.

El componente no deduce el estado. Con PLANIFICADA o CANCELADA, la vista no lo dibuja (H-05).

### `AttentionList`

```ts
interface AttentionItem { id: string; text: ReactNode; to?: string; onClick?(): void; tone?: 'attention' | 'danger' | 'neutral' }
interface AttentionListProps { title?: string /* 'Para atender' */; items: AttentionItem[]; headingLevel?: 2 | 3; testId?: string }
```

Asuntos que la vista detectó con datos del servidor. Cada uno lleva un punto de color decorativo y, si es enlace o botón, una flecha.

**Sin ítems no dibuja nada**: no inventa un «todo en orden». Si un pedido falla, ese ítem no se muestra (H-07).

### `Avatar`

```ts
interface AvatarProps { name: string; size?: 'sm' | 'md' | 'lg'; tone?: 'lime' | 'ink' | 'soft' }
function initialsOf(name: string): string;
```

Iniciales de las dos primeras palabras del nombre real (nunca las de la muestra). Es decorativo: el nombre va escrito al lado.

---

## Diálogos

### `Dialog`

```ts
interface DialogProps {
  title: ReactNode; description?: ReactNode; children?: ReactNode;
  footer?: ReactNode;            // en orden de lectura: «Volver»/«Cancelar» y después la acción
  onClose(): void;
  size?: 'sm' | 'md' | 'lg';
  dirty?: boolean;               // hay borrador: Esc, el velo y la «X» preguntan antes de descartar
  busy?: boolean;                // bloquea todo cierre
  initialFocusRef?: RefObject<HTMLElement | null>;
  hideCloseButton?: boolean;
  role?: 'dialog' | 'alertdialog';
  label?: string;               // aria-label explícito (Modal lo usa por compatibilidad)
  testId?: string;
}
```

Láminas 15, 30, 33, 34 y 46.

- **Nombre:** `role="dialog"` con `aria-modal`, etiquetado por el `<h2>`; la descripción va en `aria-describedby`.
- **Foco al abrir:** en `initialFocusRef`, en el primer campo o en el panel. Tab no sale del diálogo.
- **Cierre:** Esc, el velo o la «X» cierran.
  - Con `dirty`, esos tres cierres muestran «Hay cambios sin guardar. ¿Descartarlos?», con «Seguir editando» (enfocado) y «Descartar cambios».
  - «Cancelar» del pie es explícito y cierra directamente.
- **Al cerrar:** el foco vuelve al control que lo abrió.
- **Teléfono (< 640 px):** hoja inferior a todo el ancho con asa decorativa; el pie se apila con la acción arriba (lámina 46). El contenido se desplaza dentro.
- **Página:** se dibuja en un portal sobre `document.body` y bloquea el desplazamiento de la página.

`Modal` de `app-shell.tsx` mantiene su firma y ahora delega aquí.

### `ConfirmDialog`

```ts
interface ConfirmDialogProps {
  title: ReactNode; children?: ReactNode;      // consecuencias (lista o párrafo)
  confirmLabel: string; cancelLabel?: string;  // 'Volver' por defecto
  tone?: 'primary' | 'danger';                 // danger: botón rojo y role="alertdialog"
  reason?: { label?: string /* 'Motivo' */; help?: string; required?: boolean /* true */; maxLength?: number };
  acknowledgement?: ReactNode;                 // casilla «Confirmo que…»
  busy?: boolean; error?: ReactNode;
  onConfirm(reason: string): void;             // motivo sin espacios sobrantes ('' si no se pidió)
  onCancel(): void; testId?: string;
}
```

Patrón de confirmación con motivo (H-16).

- **Botón de la acción:** queda **desactivado** hasta que haya motivo (si es obligatorio; los espacios no cuentan) y la casilla esté marcada. El servidor lo vuelve a validar.
- **Motivo:** escribirlo lo convierte en borrador, así que Esc no lo pierde sin preguntar.
- **Error:** se muestra dentro del diálogo sin borrar el motivo.
- **Llamada:** el componente no llama a la API.

```tsx
<ConfirmDialog
  tone="danger"
  title="Cancelar la convocatoria"
  confirmLabel="Cancelar convocatoria"
  reason={{}}
  acknowledgement={`Confirmo que se cancela «${call.name}».`}
  busy={busy}
  error={error}
  onConfirm={(reason) => cancel(call.id, reason)}
  onCancel={() => setConfirming(false)}
>
  <p>Los pedidos quedan sin efecto y no habrá consolidado. Los agricultores lo verán en su aplicación.</p>
</ConfirmDialog>
```

---

## Iconos

`ICON` (en `icon-paths.ts`) e `<Icon d={ICON.nombre} className strokeWidth />`. Son trazos de 24×24, decorativos y sin librería.

| Grupo | Iconos |
|---|---|
| Estados | `check`, `alert`, `warn`, `info`, `inbox`, `search`, `lock`, `eye`, `eyeOff`, `chart`, `clock`, `tick` |
| Navegación | `home`, `clipboard`, `megaphone`, `archive`, `bars`, `calendar`, `document`, `users`, `menu`, `sprout` (marca) |
| Acciones | `chevronDown/Up/Left/Right`, `arrowRight`, `download`, `refresh`, `logout`, `close`, `plus`, `mail` |

Un icono nuevo se pide a BASE o se añade aquí en la integración.

---

## Armazón (`components/app-shell.tsx`)

```ts
interface AppShellProps { title: string; section: string; actions?: ReactNode; children: ReactNode;
  navCounts?: Readonly<Record<string, number>> }   // nuevo y opcional
```

**Escritorio (≥ 1024 px):** barra lateral oscura de 272 px (láminas 03 y 21).

- Arriba, la marca y el nombre del sindicato de la sesión.
- Las tareas: Resumen, Borrador de compra, Compras conjuntas, Catálogo ▸ e Histórico ▸.
- La sección «SINDICATO»: Campañas, Usuarios (sólo ADMINISTRADOR) y Bitácora.
- Abajo, la tarjeta de usuario con «Cerrar sesión».
- El botón «<» la pliega a 88 px (sólo iconos). La preferencia se guarda en `localStorage` como comodidad.
- Encima del contenido, una franja clara con la sección, «Datos sintéticos» (si el servidor la declara), la campaña activa y la conexión.

**Teléfono y tableta (< 1024 px):** barra superior oscura y barra inferior con Resumen, Borrador, Compras, Catálogo y **Más** (lámina 43).

- «Más» abre un diálogo a pantalla completa, sin ruta nueva. Lleva Histórico y estimaciones, Campañas, Bitácora y Usuarios (ADMINISTRADOR), cada uno con su descripción, más la tarjeta de usuario y «Cerrar sesión».
- Atrás de Android lo cierra.
- En horizontal, la barra inferior se oculta y la cabecera ofrece «Menú».

**Grupos:** se abren solos en su sección; el ítem activo depende de la ruta y de `?vista=`.

**Contadores (`navCounts`):** la clave es la ruta (`/colectivo/catalogo`) o la subvista (`/colectivo/catalogo?vista=identificacion`).

- Sólo se dibujan con un dato real mayor que cero.
- Con el grupo plegado, el contador sube al grupo.
- El lector de pantalla oye «(N pendientes)».
- La insignia «Por identificar» ya la pone el armazón, con el contexto `contexts/identification-pending` (ver abajo).

Las etiquetas, iconos, descripciones, grupos y subvistas salen de `lib/navigation.ts`: `NAV_ITEMS`, `NAV_SECTIONS` y `MOBILE_BOTTOM_PATHS`. Qué ve cada rol lo sigue decidiendo `menuPathsFor`.

### Insignia «Por identificar» y señal de refresco (H-02, U.5)

- `contexts/identification-pending-provider.tsx` (montado en `App.tsx`) pide `identificationService.list('PENDING')` una vez por sesión de Directiva o Administración.
- Si la llamada falla, no hay insignia (nunca «0»).
- **La sesión C** llama a `notifyIdentificationChanged()` (de `contexts/identification-pending`) después de vincular, crear producto, posponer o corregir. El proveedor vuelve a pedir la lista con una sola llamada, sin sondeo.
- **La sesión A** puede leer el mismo recuento con `useIdentificationPending()`. Devuelve `null` si no hay dato, y entonces no se muestra el ítem.
