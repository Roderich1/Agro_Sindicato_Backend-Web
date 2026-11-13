import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PENDING_CONSENT_TOTAL_NOTE,
  PENDING_CONSENT_TOTAL_TEXT,
  PREVIOUS_POLICY_TOTAL_NOTE,
} from '../../lib/joint-purchase-call-text';
import type { JointPurchaseCallEvent, JointPurchaseCallProductTotal } from '../../types/joint-purchase-calls';
import { ActivityTimeline, CallTotal } from './call-ui';

afterEach(cleanup);

const total = (over: Partial<JointPurchaseCallProductTotal>): JointPurchaseCallProductTotal => ({
  participant_count: 3,
  total_quantity_base: null,
  visibility: 'PENDING_CONSENT',
  totals_basis: null,
  ...over,
});

/*
 * E4 §5.2 (regla T). Reescritas por la decisión del autor del 2026-11-13 (sin
 * umbral de personas): los estados UNDER_THRESHOLD, RESPONSIBLE_ONLY y
 * RESTRICTED ya no existen; los sustituyen PENDING_CONSENT y la base del total
 * (ROLE_CONSENT o PREVIOUS_POLICY_K3). Se conservan «nunca un 0 en lugar de un
 * total pendiente» y «Sin pedidos todavía».
 */
describe('05 §13 con E4 §5.2: estado del total de un producto en una convocatoria', () => {
  it('VISIBLE con ROLE_CONSENT: la cifra con su unidad, sin notas', () => {
    render(<CallTotal total={total({ visibility: 'VISIBLE', total_quantity_base: '23000', totals_basis: 'ROLE_CONSENT' })} baseUnit="ML" />);
    expect(document.body.textContent).toBe('23 L');
    expect(screen.queryByTestId('hidden-total')).toBeNull();
    expect(screen.queryByTestId('total-basis-note')).toBeNull();
  });

  it.each([1, 2])('VISIBLE con ROLE_CONSENT y %i persona(s): el total se muestra (sin umbral)', (count) => {
    render(<CallTotal total={total({ participant_count: count, visibility: 'VISIBLE', total_quantity_base: '5000', totals_basis: 'ROLE_CONSENT' })} baseUnit="G" open />);
    expect(document.body.textContent).toBe('5 KG');
    expect(document.body.textContent).not.toMatch(/umbral|menos de/i);
  });

  it('VISIBLE con PREVIOUS_POLICY_K3: la cifra y la nota de la regla anterior', () => {
    render(<CallTotal total={total({ participant_count: 4, visibility: 'VISIBLE', total_quantity_base: '96000', totals_basis: 'PREVIOUS_POLICY_K3' })} baseUnit="ML" />);
    expect(document.body.textContent).toContain('96 L');
    expect(screen.getByTestId('total-basis-note').textContent).toBe(PREVIOUS_POLICY_TOTAL_NOTE);
  });

  it.each([true, false])('PENDING_CONSENT (abierta: %s): chip punteado «Pendiente de autorización» con su motivo y nunca un 0', (open) => {
    render(<CallTotal total={total({ participant_count: 2 })} baseUnit="G" open={open} />);
    expect(screen.getByTestId('hidden-total').textContent).toBe(PENDING_CONSENT_TOTAL_TEXT);
    expect(document.body.textContent).toContain(PENDING_CONSENT_TOTAL_NOTE);
    expect(document.body.textContent).not.toMatch(/\b0\b/);
  });

  it('abierta y nadie pidió (VISIBLE con "0"): «Sin pedidos todavía», no «0 L»', () => {
    render(<CallTotal total={total({ visibility: 'VISIBLE', total_quantity_base: '0', participant_count: 0, totals_basis: 'ROLE_CONSENT' })} baseUnit="ML" open />);
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
