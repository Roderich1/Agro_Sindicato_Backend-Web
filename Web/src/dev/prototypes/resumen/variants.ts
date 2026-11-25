import type { JSX } from 'react';
import { Accion } from './accion';
import { Comparacion } from './comparacion';
import { Ejecutivo } from './ejecutivo';
import { Panorama } from './panorama';
import type { VariantProps } from './parts';

export const PROTO_PATH = '/src/dev/resumen-prototipos.html';

export const VARIANTS: { name: string; slug: string; Component: ((props: VariantProps) => JSX.Element) | null; estimation: boolean; activity: boolean }[] = [
  { name: 'Actual', slug: 'actual', Component: null, estimation: false, activity: false },
  { name: 'Panorama', slug: 'panorama', Component: Panorama, estimation: false, activity: false },
  { name: 'Acción', slug: 'accion', Component: Accion, estimation: false, activity: false },
  { name: 'Comparación', slug: 'comparacion', Component: Comparacion, estimation: true, activity: false },
  { name: 'Ejecutivo', slug: 'ejecutivo', Component: Ejecutivo, estimation: true, activity: true },
];
