import { useDisclosureMode } from '../../lib/data-mode';
import { Chip } from './chip';

/**
 * «Datos sintéticos» (H-03): sólo cuando una respuesta colectiva del servidor
 * declaró `disclosure.mode = 'PROVISIONAL_SYNTHETIC'` (`lib/data-mode`). Nunca se
 * deduce en el navegador; sin ese dato no se dibuja. Lo usan `PageHeader` y
 * `HeroPanel`: las vistas no tienen que añadirlo.
 */
export function SyntheticDataChip() {
  const mode = useDisclosureMode();
  if (mode !== 'PROVISIONAL_SYNTHETIC') return null;
  return (
    <span className="inline-flex shrink-0" title="El servidor declara datos sintéticos (modo provisional de la política de divulgación)." data-testid="synthetic-badge">
      <Chip tone="attention">Datos sintéticos</Chip>
    </span>
  );
}
