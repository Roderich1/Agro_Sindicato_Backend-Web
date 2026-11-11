# `components/ui`: componentes compartidos de la Web institucional

Contrato mínimo de la sesión A del rediseño (2026-11-10), según §3–§5 de
`docs/web-rediseno/01_CONTRATO_COMPARTIDO.md`. Las sesiones B y C importan
**sólo** desde `components/ui` (el índice), nunca desde un archivo interno:

```ts
import { DataState, PageHeader, StatusChip } from '../components/ui';
```

Reglas comunes a todos los componentes:

- Español y trato de «usted». Ningún componente calcula, suma ni deduce cifras:
  presentan lo que la vista ya recibió del servidor.
- Ningún estado se comunica sólo por color: siempre hay texto (y, donde ayuda,
  un icono decorativo con `aria-hidden`).
- Sin contadores animados ni efectos decorativos. La única respuesta táctil es
  `scale(0.98)` al pulsar un botón (120 ms, `--ease-out`), que desaparece con
  `prefers-reduced-motion: reduce`. Pestañas, filas, rutas y foco no se animan.
- Superficies sólidas (sin `backdrop-filter` ni degradados) con los tokens de
  `src/index.css` (§«Tokens» al final).
- Los ejemplos usan las formas de `src/types/*.ts`; ninguno inventa campos de API.

Tipos de presentación (en `ui/types.ts`, re-exportados por el índice):

```ts
export type DataStateKind =
  | 'loading' | 'empty' | 'no-match' | 'error'
  | 'forbidden' | 'restricted' | 'insufficient' | 'stale';
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm';
export type NoticeKind = 'ok' | 'error' | 'info' | 'warn';
export type KpiTone = 'default' | 'muted' | 'attention';
```

---

## `PageHeader`

```ts
interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Normalmente un <CampaignSelector />; va a la izquierda de la barra. */
  campaign?: ReactNode;
  /** Una sola acción primaria (y, como mucho, una secundaria); va a la derecha. */
  actions?: ReactNode;
  /** 1 por defecto: es el título de la vista. Use 2 si la vista ya tiene un <h1>. */
  headingLevel?: 1 | 2;
  testId?: string;
}
function PageHeader(props: PageHeaderProps): JSX.Element;
```

Cabecera de cada vista: título y una línea de contexto; debajo, la barra con
la campaña a la izquierda y la acción a la derecha (en teléfono se apilan).

```tsx
<PageHeader
  title="Necesidades y propuestas"
  subtitle="Necesidades declaradas por producto de la campaña seleccionada."
  campaign={<CampaignSelector campaigns={campaigns} selected={selected} onSelect={select} />}
  actions={<Button onClick={openGenerate}>Generar borrador</Button>}
/>
```

## `CampaignSelector`

```ts
interface CampaignSelectorProps {
  campaigns: Campaign[];            // src/types/campaigns.ts
  selected: string | null;          // Campaign.id
  onSelect(id: string): void;
  /** true por defecto: muestra «Activa» o «Distinta de la activa» como texto. */
  showActiveBadge?: boolean;
  label?: string;                   // «Campaña» por defecto
  id?: string;                      // id del <select>; «campaign-selector» por defecto
}
function CampaignSelector(props: CampaignSelectorProps): JSX.Element;
```

Sustituye a `CampaignPicker` y a la parte de campaña de `CollectiveToolbar`.
Cada opción dice «nombre · estado» (y «· Activa» cuando `isActive`). **No
supone una única campaña abierta**: lista todas las que reciba, aunque haya
varias `ABIERTA`, y la «activa» es sólo la que el servidor marca con
`isActive`. Si la seleccionada no es la activa, lo dice con el texto «Distinta
de la activa» (`data-testid="campaign-differs"`, con `title` que nombra la
activa). Si ninguna está marcada como activa, no muestra ninguna de las dos.

```tsx
const { campaigns, selected, select } = useSelectedCampaign(); // hooks/use-selected-campaign.ts
<CampaignSelector campaigns={campaigns} selected={selected} onSelect={select} />
```

## `DataState`

```ts
interface DataStateProps {
  state: DataStateKind;
  /** Sustituye el título por defecto del estado. */
  title?: string;
  /** Sustituye la explicación por defecto (p. ej. el texto de `collectiveError`). */
  description?: ReactNode;
  /** Muestra «Reintentar» (en todos los estados salvo `loading`). */
  onRetry?(): void;
  /** Sólo `no-match`: muestra «Quitar filtros». */
  onClearFilters?(): void;
  /** Sólo `restricted`: la explicación por defecto pasa a ser `statusReason(status, threshold)`. */
  status?: AnyStatus;
  threshold?: number | null;
  /** Acción adicional propia de la vista (un enlace, por ejemplo). */
  action?: ReactNode;
  /** Versión en línea para una celda, tarjeta o fila. */
  compact?: boolean;
  testId?: string;
}
function DataState(props: DataStateProps): JSX.Element;
```

Un solo componente para los ocho estados del §4 del contrato. Cada estado
tiene icono + título + explicación; ninguno escribe un «0». `loading` usa
`role="status"` y `error` usa `role="alert"`. Textos por defecto:

| `state` | Título | Explicación por defecto |
|---|---|---|
| `loading` | Cargando… | — |
| `empty` | Sin registros | Todavía no hay registros para mostrar aquí. Eso no significa cero. |
| `no-match` | Sin coincidencias | Ningún registro coincide con el filtro aplicado. |
| `error` | No se pudo cargar la información | Vuelva a intentarlo en un momento. |
| `forbidden` | Sin permiso | Su rol no tiene acceso a esta información. |
| `restricted` | Información restringida | `statusReason(status, threshold)` o «Esta cifra no se publica.» |
| `insufficient` | Datos insuficientes | El servidor indica que no hay datos suficientes. No significa cero. |
| `stale` | Resultado desactualizado | Este resultado corresponde a una ejecución anterior. |

```tsx
if (loading) return <DataState state="loading" />;
if (error) return <DataState state="error" description={error} onRetry={reload} />;
if (summary.cells.length === 0) return <DataState state="empty" description="Todavía no hay necesidades declaradas en esta campaña. Eso no significa cero." />;
<DataState state="restricted" status={cell.status} threshold={summary.disclosure.threshold} compact />
```

## `StatusChip`

```ts
interface StatusChipProps {
  /** Estado de divulgación (AnyStatus), de campaña (CampaignStatus) o cualquier otro texto ya usado por la Web. */
  status: AnyStatus | CampaignStatus | string;
  /** Umbral de la política, para el motivo de SUPPRESSED_UNDER_THRESHOLD. */
  threshold?: number | null;
  testId?: string;
}
function StatusChip(props: StatusChipProps): JSX.Element;
```

Unifica los dos `StatusBadge` (`collective-ui.tsx` y `app-shell.tsx`, que
siguen exportándose y delegan aquí). Siempre muestra un texto en español
(«Publicado», «Oculto por privacidad», «Abierta»…); en los estados de
divulgación, `title` lleva el motivo de `statusReason`. Un estado desconocido se
muestra tal cual, en gris.

```tsx
<StatusChip status={cell.status} threshold={summary.disclosure.threshold} />
<StatusChip status={campaign.status} />
```

## `KpiTile`

```ts
interface KpiTileProps {
  label: string;
  value: ReactNode;                 // ya formateado por la vista (formatQuantity, Intl…)
  note?: ReactNode;
  /** El tono nunca es el único portador del significado: acompáñelo de `note`. */
  tone?: KpiTone;                   // 'default' por defecto
  testId?: string;
}
function KpiTile(props: KpiTileProps): JSX.Element;
```

Evolución de `StatTile`: etiqueta, cifra grande en `tabular-nums` y una línea
de contexto. Sin contadores animados. Si la cifra no se publica, pase el
motivo como `value` o use `DataState state="restricted" compact`.

```tsx
<KpiTile
  label="Agricultores con cifras publicadas"
  value={`${coverage.members_with_contribution} de ${coverage.linked_members}`}
  note="Ausencia de aporte = desconocido, no cero."
/>
```

## `Section` y `SectionHeader`

```ts
interface SectionHeaderProps {
  title: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
}
interface SectionProps extends Partial<SectionHeaderProps> {
  children: ReactNode;
  /** Nombre accesible de la región cuando `title` no es texto. */
  label?: string;
  testId?: string;
}
function SectionHeader(props: SectionHeaderProps): JSX.Element;
function Section(props: SectionProps): JSX.Element;
```

Tarjeta de sección con borde y fondo sólido (sin cristal ni desenfoque). Con
`title`, `Section` dibuja su `SectionHeader` (un `<h2>`) y se etiqueta con él.
`SectionHeader` conserva la firma de `collective-ui.tsx`, que lo re-exporta.

```tsx
<Section title="Necesidades declaradas por producto" note={`Datos hasta ${fmtDateTime(asOf)}`} actions={<ExportButtons … />}>
  <DataTable caption="Necesidades declaradas por producto">…</DataTable>
</Section>
```

## `DataTable`

```ts
interface DataTableProps {
  /** Título de la tabla para lectores de pantalla y nombre de la región desplazable. */
  caption?: string;
  /** Ancho mínimo de la tabla en px; por debajo, desplazamiento horizontal interno. */
  minWidth?: number;
  /** Alto máximo del contenedor; con él, la cabecera queda fija al desplazar. */
  maxHeight?: number | string;
  children: ReactNode;              // <thead> y <tbody>
  testId?: string;
}
function DataTable(props: DataTableProps): JSX.Element;
```

Contenedor de tabla legible: desplazamiento horizontal **dentro** del contenedor
(la página no se desplaza a lo ancho a 390 px), región enfocable con teclado,
cabecera pegajosa (efectiva cuando el contenedor tiene `maxHeight`), cifras en
`tabular-nums`, filas sin hover animado. Para alinear una cifra a la derecha,
`className="ui-num"` en la celda.

```tsx
<DataTable caption="Borradores de la campaña" minWidth={640}>
  <thead><tr><th>Generado el</th><th className="ui-num">Líneas</th></tr></thead>
  <tbody>{drafts.map((d: ProposalSummary) => <tr key={d.proposal_ref}><td>{fmtDateTime(d.generated_at)}</td><td className="ui-num">{d.line_count}</td></tr>)}</tbody>
</DataTable>
```

## `SegmentedControl`

```ts
interface SegmentedControlProps<T extends string> {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange(value: T): void;
  testId?: string;
}
function SegmentedControl<T extends string>(props: SegmentedControlProps<T>): JSX.Element;
```

Opciones visibles a la vez (`role="group"`, cada botón con `aria-pressed`). Sin
animación al cambiar. `collective-ui.tsx` lo re-exporta.

```tsx
<SegmentedControl
  label="Vista"
  options={[{ value: 'tendencias', label: 'Histórico sellado' }, { value: 'estimacion', label: 'Estimación del consumo' }]}
  value={vista}
  onChange={setVista}
/>
```

## `Collapsible`

```ts
interface CollapsibleProps {
  title: string;
  children: ReactNode;
  testId?: string;
  label?: string;                   // nombre accesible; `title` por defecto
  defaultOpen?: boolean;
}
function Collapsible(props: CollapsibleProps): JSX.Element;
```

Sección secundaria plegada (`<details>/<summary>`, «Ver» / «Ocultar» como
texto). `collective-ui.tsx` lo re-exporta.

```tsx
<Collapsible title="Fuentes y método" testId="method">
  <p className="px-5 py-3 text-sm">Estimación SES/naive (INT-09)…</p>
</Collapsible>
```

## `Button` y clases de botón

```ts
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;          // 'primary' por defecto
  size?: ButtonSize;                // 'md' por defecto
}
function Button(props: ButtonProps): JSX.Element;      // type="button" por defecto
function buttonClassFor(variant?: ButtonVariant, size?: ButtonSize): string;
const buttonClass: string;           // = buttonClassFor('primary')
const secondaryButtonClass: string;  // = buttonClassFor('secondary')
const ghostButtonClass: string;      // = buttonClassFor('ghost')
const dangerButtonClass: string;     // = buttonClassFor('danger')
const inputClass: string;
const labelClass: string;
const cardClass: string;
```

`:active` con `scale(0.98)` en 120 ms (`ui-press`), foco visible, sin sombras
que crecen. Las clases sirven para enlaces (`<Link className={secondaryButtonClass}>`)
y siguen exportándose desde `app-shell.tsx` para no romper importaciones.
Una vista muestra **una** acción `primary`; las acciones de negocio
(sellar, asociar, cerrar) conservan su confirmación actual.

```tsx
<Button onClick={generate} disabled={busy}>Generar borrador</Button>
<Button variant="secondary" size="sm" onClick={reload}>Actualizar</Button>
<Link to={COLLECTIVE_PATHS.coverage} className={ghostButtonClass}>Ver cobertura</Link>
```

## `Notice`

```ts
interface NoticeProps {
  kind: NoticeKind;
  children: ReactNode;
  compact?: boolean;
}
function Notice(props: NoticeProps): JSX.Element;
```

Aviso con icono + texto (el icono es decorativo; el texto lleva el
significado). `app-shell.tsx` lo re-exporta.

```tsx
{error && <Notice kind="error">{error}</Notice>}
<Notice kind="info" compact>La estimación no se suma a las necesidades declaradas.</Notice>
```

## Formato: `fmtPercent` (`src/lib/format.ts`)

```ts
function fmtPercent(numerator: number, denominator: number): string | null;
```

`Intl.NumberFormat('es-BO', { style: 'percent', maximumFractionDigits: 0 })`.
Devuelve `null` si el denominador es 0 o algún valor no es finito; entonces la
vista **no** muestra porcentaje. Sólo para la cobertura
(`members_with_contribution / linked_members`) y para diferencias de estimación
comparables (§5 del contrato).

```tsx
const pct = fmtPercent(coverage.members_with_contribution, coverage.linked_members);
{pct && <span className="tabular-nums">{pct}</span>}
```

---

## Tokens (`src/index.css`)

| Token | Valor | Utilidad Tailwind |
|---|---|---|
| `--color-brand-50/100/600/700/800` | `#ecfdf5` / `#d1fae5` / `#059669` / `#047857` / `#065f46` | `bg-brand-700`, `text-brand-800`… (mismo verde que `emerald`) |
| `--color-canvas` | `#f8faf4` | `bg-canvas` (fondo de página) |
| `--color-surface` | `#ffffff` | `bg-surface` (tarjetas) |
| `--color-line` | `#e2e8f0` | `border-line` |
| `--color-ink` / `--color-ink-muted` | `#0f172a` / `#475569` | `text-ink`, `text-ink-muted` |
| `--radius-control` / `--radius-card` | `8px` / `12px` | `rounded-control`, `rounded-card` |
| `--shadow-card` | sombra suave de 1–2 px | `shadow-card` |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | `ease-out` |
| `--duration-fast` / `--duration-base` | `120ms` / `180ms` | `var(--duration-fast)` |

Un solo acento (verde institucional). Ámbar y rojo sólo para estados, siempre
con texto. El texto blanco va sobre `brand-700` o más oscuro (contraste AA).
