import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  /** Recuento ya calculado (p. ej. «6» en «Por identificar»); el componente no cuenta. */
  count?: ReactNode;
}

export interface TabsProps<T extends string> {
  /** Nombre de la lista de pestañas para lectores de pantalla. */
  label: string;
  tabs: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Prefijo de ids: une cada pestaña con su `TabPanel` (mismo `idBase`). */
  idBase: string;
  /**
   * `underline` (por defecto): subrayado de tinta. `pill`: píldora blanca con la
   * pestaña activa en tinta (láminas 06, 07, 08, 36 y 51). Mismo ARIA y teclado.
   */
  variant?: 'underline' | 'pill';
  testId?: string;
}

const tabId = (base: string, value: string) => `${base}-tab-${value}`;
const panelId = (base: string, value: string) => `${base}-panel-${value}`;

/**
 * Pestañas con la semántica de ARIA (`tablist`/`tab`/`tabpanel`): flechas
 * izquierda/derecha, Inicio y Fin mueven y activan; sólo la pestaña activa está
 * en el orden de tabulación. Subrayado de tinta en la activa, además del peso.
 * Para elegir una vista de la URL (`?vista=`) basta con `SegmentedControl`;
 * use Tabs cuando haya paneles en la misma página.
 */
export function Tabs<T extends string>({ label, tabs, value, onChange, idBase, variant = 'underline', testId }: TabsProps<T>) {
  const pill = variant === 'pill';
  const refs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.value === value);
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const target = tabs[next]!;
    onChange(target.value);
    refs.current.get(target.value)?.focus();
  };
  return (
    <div className="-mx-1 max-w-full overflow-x-auto px-1 py-1" data-testid={testId} data-variant={variant}>
      <div
        role="tablist"
        aria-label={label}
        className={pill ? 'inline-flex flex-wrap gap-1 rounded-3xl border border-line bg-surface p-1 lg:min-w-max lg:flex-nowrap lg:rounded-full' : 'flex min-w-max gap-1 border-b border-line'}
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab) => {
          const active = tab.value === value;
          return (
            <button
              key={tab.value}
              ref={(node) => {
                if (node) refs.current.set(tab.value, node);
                else refs.current.delete(tab.value);
              }}
              type="button"
              role="tab"
              id={tabId(idBase, tab.value)}
              aria-selected={active}
              aria-controls={panelId(idBase, tab.value)}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(tab.value)}
              className={
                pill
                  ? `inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 sm:text-base ${
                      active ? 'bg-ink font-bold text-white' : 'font-medium text-ink hover:bg-sunken'
                    }`
                  : `-mb-px inline-flex min-h-11 items-center gap-2 border-b-[3px] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 ${
                      active ? 'border-ink font-bold text-ink' : 'border-transparent font-medium text-ink-muted hover:text-ink'
                    }`
              }
            >
              {tab.label}
              {tab.count !== undefined && tab.count !== null && ' '}
              {tab.count !== undefined && tab.count !== null && (
                <span className={pill ? 'tabular-nums' : 'rounded-full bg-warn-bg px-2 py-px text-xs font-bold tabular-nums text-warn-ink'}>
                  {pill ? <>({tab.count})</> : tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export interface TabPanelProps {
  idBase: string;
  value: string;
  /** El panel de la pestaña activa; los demás no se montan. */
  active: boolean;
  children: ReactNode;
}

/** Panel de una pestaña: `role="tabpanel"` etiquetado por su pestaña y enfocable. */
export function TabPanel({ idBase, value, active, children }: TabPanelProps) {
  if (!active) return null;
  return (
    <div role="tabpanel" id={panelId(idBase, value)} aria-labelledby={tabId(idBase, value)} tabIndex={0} className="focus-visible:outline-2 focus-visible:outline-offset-4">
      {children}
    </div>
  );
}
