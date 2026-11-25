export const ROLE_LABELS: Record<string, string> = {
  ADMINISTRADOR: 'Administrador',
  DIRECTIVA: 'Directiva',
  AGRICULTOR: 'Agricultor',
};

/**
 * Fondo del avatar por rol. El nombre se conserva por compatibilidad con las
 * vistas que lo importan; en el armazón el avatar es lima sobre tinta.
 */
export const ROLE_COLORS: Record<string, string> = {
  ADMINISTRADOR: 'bg-lime text-ink',
  DIRECTIVA: 'bg-lime text-ink',
  AGRICULTOR: 'bg-sunken text-ink',
};

/** El rol siempre se lee en el texto; el tono sólo acompaña. */
export const ROLE_BADGE_COLORS: Record<string, string> = {
  ADMINISTRADOR: 'bg-ink text-white ring-ink/20',
  DIRECTIVA: 'bg-lime-soft text-lime-ink ring-lime-ink/20',
  AGRICULTOR: 'bg-sunken text-ink ring-ink/15',
};

/** Marca de la entrada del historial que abre el menú «Más» del teléfono. */
export const MENU_HISTORY_KEY = 'agroMenu';
/** Preferencia del visitante (sólo comodidad): barra lateral plegada. */
const RAIL_STORAGE_KEY = 'agro.web.barraPlegada';

export function menuEntryToken(state: unknown): unknown {
  return state && typeof state === 'object' ? (state as Record<string, unknown>)[MENU_HISTORY_KEY] : undefined;
}

export function readRail(): boolean {
  try {
    return window.localStorage.getItem(RAIL_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeRail(value: boolean) {
  try {
    window.localStorage.setItem(RAIL_STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* Sin almacenamiento (ventana privada): la preferencia dura la sesión. */
  }
}

/** Contadores opcionales del menú, por ruta (`/colectivo/catalogo`) o subvista (`/colectivo/catalogo?vista=identificacion`). */
export type NavCounts = Readonly<Record<string, number>>;
