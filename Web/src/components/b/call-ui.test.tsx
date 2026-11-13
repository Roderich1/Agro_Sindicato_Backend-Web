import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  RESPONSIBLE_ONLY_HIDDEN_TEXT,
  RESPONSIBLE_ONLY_OPEN_TEXT,
  RESTRICTED_TOTAL_TEXT,
  UNDER_THRESHOLD_TEXT,
} from '../../lib/joint-purchase-call-text';
import type { JointPurchaseCallEvent, JointPurchaseCallProductTotal } from '../../types/joint-purchase-calls';
import { ActivityTimeline, CallTotal } from './call-ui';

afterEach(cleanup);

const total = (over: Partial<JointPurchaseCallProductTotal>): JointPurchaseCallProductTotal => ({
  participant_count: 3,
  total_quantity_base: null,
  visibility: 'RESPONSIBLE_ONLY',
  ...over,
});

describe('05 §13: estado del total de un producto en una convocatoria', () => {
  it('VISIBLE: la cifra con su unidad', () => {
    render(<CallTotal total={total({ visibility: 'VISIBLE', total_quantity_base: '23000' })} baseUnit="ML" threshold={3} />);
    expect(document.body.textContent).toBe('23 L');
    expect(screen.queryByTestId('hidden-total')).toBeNull();
  });

  it.each([
    ['UNDER_THRESHOLD', false, false, UNDER_THRESHOLD_TEXT, 'Lo pidieron menos de 3 personas'],
    ['RESTRICTED', false, false, RESTRICTED_TOTAL_TEXT, 'Faltan autorizaciones de agricultores'],
    ['RESPONSIBLE_ONLY', false, true, RESPONSIBLE_ONLY_OPEN_TEXT, null],
    ['RESPONSIBLE_ONLY', true, true, RESPONSIBLE_ONLY_HIDDEN_TEXT, null],
  ] as const)('%s (oculto por quien consulta: %s): chip punteado con su texto y nunca un 0', (visibility, hidden, open, label, note) => {
    render(<CallTotal total={total({ visibility })} baseUnit="G" threshold={3} hidden={hidden} open={open} />);
    expect(screen.getByTestId('hidden-total').textContent).toBe(label);
    if (note) expect(document.body.textContent).toContain(note);
    expect(document.body.textContent).not.toMatch(/\b0\b/);
  });

  it('abierta, con permiso y nadie pidió: «Sin pedidos todavía», no «0 L»', () => {
    render(<CallTotal total={total({ visibility: 'VISIBLE', total_quantity_base: '0', participant_count: 0 })} baseUnit="ML" threshold={3} open />);
    expect(screen.getByTestId('no-requests').textContent).toBe('Sin pedidos todavía');
    expect(document.body.textContent).not.toMatch(/0 L/);
  });
});

describe('Actividad (láminas 10–20)', () => {
  const actor = { user_ref: 'u-1', name: 'Responsable sintética' };
  const history: JointPurchaseCallEvent[] = [
    { at: '2026-11-10T18:29:00.000Z', kind: 'CREATED', actor, detail: null },
    { at: '2026-11-10T18:30:00.000Z', kind: 'ACCESS_GRANTED', actor, detail: 'Permiso «A» concedido a X.' },
    { at: '2026-11-10T18:30:20.000Z', kind: 'ACCESS_GRANTED', actor, detail: 'Permiso «B» concedido a Y.' },
    { at: '2026-11-10T18:31:00.000Z', kind: 'OPENED', actor, detail: null },
    { at: '2026-11-12T14:17:00.000Z', kind: 'RESPONSIBLE_REPLACED', actor: { user_ref: 'u-9', name: 'Directiva sintética' }, detail: null },
    { at: '2026-11-14T18:30:00.000Z', kind: 'CLOSED', actor: null, detail: null },
  ];

  it('lo más reciente arriba, «Sistema» sin actor, concesiones agrupadas y el motivo de la sustitución', () => {
    render(
      <ActivityTimeline
        history={history}
        changes={[
          {
            version: 2,
            at: '2026-11-12T14:17:00.000Z',
            previous: actor,
            next: { user_ref: 'u-5', name: 'Sucesora sintética' },
            actor: { user_ref: 'u-9', name: 'Directiva sintética' },
            reason: 'La responsable dejó de estar habilitada',
            call_status: 'OPEN',
            suspended_delegations: 2,
          },
        ]}
      />,
    );
    const items = within(screen.getByTestId('call-history')).getAllByTestId('call-history-event').map((li) => li.textContent ?? '');
    expect(items).toHaveLength(5);
    expect(items[0]).toMatch(/^Convocatoria cerrada al vencer el plazo.*Sistema/);
    expect(items[1]).toMatch(/Responsable sustituida.*Directiva sintética · «La responsable dejó de estar habilitada»/);
    expect(items[3]).toMatch(/Permisos concedidos \(2\).*Permiso «A» concedido a X\. Permiso «B» concedido a Y\./);
    expect(items[4]).toMatch(/^Borrador creado/);
  });
});
