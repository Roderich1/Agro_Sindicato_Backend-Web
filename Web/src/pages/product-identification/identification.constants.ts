import type { IdentificationActionResult, IdentificationRequest } from '../../types/identification';

export type Choice = 'link' | 'create' | 'defer';
export type ListTab = 'pendientes' | 'identificados';

export const CHOICES: { value: Choice; label: string; description: string }[] = [
  { value: 'link', label: 'Ya está en el catálogo', description: 'Identificarlo como un producto que ya existe.' },
  { value: 'create', label: 'Es un producto nuevo', description: 'Crearlo e identificarlo.' },
  { value: 'defer', label: 'Falta información', description: 'Dejarlo pendiente con una nota.' },
];

export const MAX_TEXT = 280;

export const unchanged = (result: IdentificationActionResult) => 'changed' in result && result.changed === false;

const UNIT_WORD: Record<string, string> = { L: 'litros', KG: 'kilogramos' };

export const unitWord = (unit: string) => UNIT_WORD[unit.toUpperCase()] ?? unit;

export const unitTitle = (unit: string) => {
  const word = unitWord(unit);
  return word.charAt(0).toUpperCase() + word.slice(1);
};

const SHORT = new Intl.DateTimeFormat('es-BO', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export const fmtShort = (value: string) => SHORT.format(new Date(value));

export function hasCurrentClarificationResponse(request: IdentificationRequest): boolean {
  const noteAt = request.pending_note?.at;
  return noteAt != null && (request.clarification_responses?.some((reply) => reply.note_at === noteAt) ?? false);
}

export function photoText(request: IdentificationRequest): string {
  switch (request.photo.state) {
    case 'STORED':
      return 'Con foto de la etiqueta';
    case 'REMOVED':
      return 'Foto retirada';
    default:
      return 'Sin foto';
  }
}

export interface ActionProps {
  request: IdentificationRequest;
  onError: (message: string | null) => void;
  onDone: (text: string) => void;
}
