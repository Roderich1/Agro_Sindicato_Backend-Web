/**
 * Datos sintéticos del Catálogo y equivalencias (sesión C del rediseño,
 * 2026-11-10): `GET /inventory/products`, `GET /collective/product-associations/catalog`
 * y `GET /collective/product-associations`. Misma forma que los tipos; ningún
 * nombre ni persona es real. Sólo para pruebas y casos extremos (`break-ui`).
 */
import type { Association, AssociationList, CatalogEntry } from '../../types/collective';
import type { Product } from '../../types/inventory';

export interface CatalogFixture {
  products: Product[];
  catalog: CatalogEntry[];
  associations: AssociationList;
}

type Row = [name: string, unit: string, category: string | null, activeIngredient: string | null, commercialName: string | null, isActive?: boolean];

function product([name, unit, category, activeIngredient, commercialName, isActive = true]: Row, index: number): Product {
  return {
    id: `prod-${String(index).padStart(2, '0')}`,
    tenantId: 't-1',
    name,
    commercialName,
    activeIngredient,
    category,
    toxicologicalCategory: null,
    safetyDataSheetUrl: null,
    safetyDataSheetName: null,
    safetyInstructions: null,
    qrCodeValue: null,
    unit,
    minimumStock: '0',
    expirationWarningDays: 90,
    isActive,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
}

/** Lo que entrega el catálogo de equivalencias para cada producto: unidad base sólo para L y kg. */
function entryOf(item: Product): CatalogEntry {
  const upper = item.unit.trim().toUpperCase();
  return {
    product_ref: item.id,
    product_name: item.name,
    unit: item.unit,
    base_unit: upper === 'L' ? 'ML' : upper === 'KG' ? 'G' : null,
    is_active: item.isActive,
  };
}

function association(overrides: Partial<Association> & Pick<Association, 'association_ref' | 'product_ref' | 'product_name' | 'canonical_product_ref' | 'canonical_product_name'>): Association {
  return {
    valid_from: '2026-10-16T12:00:00.000Z',
    valid_to: null,
    actor_ref: 'u-dir',
    actor_name: 'Directiva sintética',
    reason: 'Misma formulación y fabricante.',
    closed_by_ref: null,
    closed_by_name: null,
    close_reason: null,
    ...overrides,
  };
}

/* ── demo ─────────────────────────────────────────────────────────────── */

const demoProducts = (
  [
    ['Glifosato', 'L', 'Herbicida', 'Glifosato', 'Roundup sintético'],
    ['Belator', 'L', 'Herbicida', 'Glifosato', null],
    ['Bellator', 'L', 'Herbicida', 'Glifosato', null],
    ['Urea', 'kg', 'Fertilizante', null, null],
    ['Cipermetrina', 'L', 'Insecticida', 'Cipermetrina', null],
    ['Coadyuvante', 'unidad', 'Coadyuvante', null, null],
    ['Mancozeb (anterior)', 'kg', 'Fungicida', 'Mancozeb', null, false],
  ] satisfies Row[]
).map(product);

export const demo: CatalogFixture = {
  products: demoProducts,
  catalog: demoProducts.map(entryOf),
  associations: {
    current: [association({ association_ref: 'a-1', product_ref: 'prod-02', product_name: 'Bellator', canonical_product_ref: 'prod-01', canonical_product_name: 'Belator' })],
    history: [],
  },
};

/* ── worst: 40 productos ──────────────────────────────────────────────── */

const LONG = 'Herbicida sistémico de amplio espectro para barbecho químico 480 g/L';
const LONG_CANONICAL = 'Glifosato sal isopropilamina 480 g/L concentrado soluble (SL) – presentación bidón de 20 L';

const WORST_ROWS: Row[] = [
  [LONG, 'L', 'Herbicida', 'Glifosato sal isopropilamina', 'Barbecho Total Plus Max'],
  [LONG_CANONICAL, 'L', 'Herbicida', 'Glifosato sal isopropilamina', null],
  // Duplicados salvo mayúsculas o tildes: el servidor compara el nombre exacto y los admite.
  ['Glifosato 480', 'L', 'Herbicida', 'Glifosato', null],
  ['GLIFOSATO 480', 'L', 'herbicida', 'Glifosato', null],
  ['Glifósato 480', 'L', 'HERBICIDA', 'Glifosato', null],
  ['Urea', 'kg', 'Fertilizante', null, null],
  ['Úrea granulada', 'kg', 'Fertilizante', null, null],
  ['Fosfato diamónico (DAP) 18-46-0', 'kg', 'Fertilizante', null, null],
  ['Cipermetrina 25 % EC', 'L', 'Insecticida', 'Cipermetrina', null],
  ['Lambda-cihalotrina 5 % EC', 'L', 'Insecticida', 'Lambda-cihalotrina', null],
  ['Imidacloprid 35 % SC', 'L', 'Insecticida', 'Imidacloprid', null],
  ['Clorpirifos 48 % EC', 'L', 'Insecticida', 'Clorpirifos', null, false],
  ['Mancozeb 80 % WP', 'kg', 'Fungicida', 'Mancozeb', null],
  ['Fungicida protectante a base de mancozeb 80 % WP (polvo mojable)', 'kg', 'Fungicida', 'Mancozeb', 'Dithane sintético'],
  ['Azoxistrobina + Ciproconazol', 'L', 'Fungicida', 'Azoxistrobina; Ciproconazol', null],
  ['Tebuconazol 25 % EW', 'L', 'Fungicida', 'Tebuconazol', null],
  ['Carbendazim 50 % SC', 'L', 'Fungicida', 'Carbendazim', null],
  ['Amina 2,4-D 72 % SL', 'L', 'Herbicida', '2,4-D sal amina', null],
  ['Atrazina 90 % WG', 'kg', 'Herbicida', 'Atrazina', null],
  ['Paraquat 20 % SL', 'L', 'Herbicida', 'Paraquat', null, false],
  ['Metsulfurón metil 60 % WG', 'sobre 10 g', 'Herbicida', 'Metsulfurón metil', null],
  ['Coadyuvante siliconado no iónico', 'L', 'Coadyuvante', null, null],
  ['Aceite agrícola parafínico', 'L', 'Coadyuvante', null, null],
  ['Adherente', 'unidad', 'Coadyuvante', null, null],
  ['Sulfato de potasio', 'kg', 'Fertilizante', null, null],
  ['Nitrato de amonio', 'kg', 'Fertilizante', null, null],
  ['Abono foliar 20-20-20 + microelementos', 'kg', 'Fertilizante', null, null],
  ['Ácido húmico líquido', 'L', 'Fertilizante', null, null],
  ['Semilla de papa certificada', 'quintal', null, null, null],
  ['Semilla de trigo', 'arroba', null, null, null],
  ['Abamectina 1,8 % EC', 'L', 'Acaricida', 'Abamectina', null],
  ['Azufre mojable 80 % WP', 'kg', 'Acaricida', 'Azufre', null],
  ['Clorotalonil 72 % SC', 'L', 'Fungicida', 'Clorotalonil', null],
  ['Metalaxil + Mancozeb', 'kg', 'Fungicida', 'Metalaxil; Mancozeb', null],
  ['Bacillus thuringiensis', 'kg', 'Insecticida biológico', 'Bacillus thuringiensis var. kurstaki', null],
  ['Trichoderma harzianum', 'kg', 'Fungicida biológico', 'Trichoderma harzianum', null],
  ['Cal agrícola', 'kg', 'Enmienda', null, null],
  ['Yeso agrícola', 'kg', 'Enmienda', null, null],
  ['Jo', 'L', null, null, null],
  ['Bidón vacío para triple lavado', 'unidad', null, null, null],
];

const worstProducts = WORST_ROWS.map(product);

/** Motivo de 280 caracteres, el máximo que admite el formulario (`maxLength`) y el servidor. */
const CLOSE_REASON_280 =
  'Se deshace porque la ficha técnica del fabricante indica una concentración distinta (360 g/L en lugar de 480 g/L) ' +
  'y la Directiva acordó en la reunión ordinaria, revisar la etiqueta de cada envase antes de volver a agruparlos; ' +
  'mientras tanto, cada denominación se consolida aparte.';

export const worst: CatalogFixture = {
  products: worstProducts,
  catalog: worstProducts.map(entryOf),
  associations: {
    current: [
      association({ association_ref: 'a-w2', product_ref: 'prod-00', product_name: LONG, canonical_product_ref: 'prod-01', canonical_product_name: LONG_CANONICAL, actor_name: 'María José de la Cruz y Fernández Montaño' }),
      association({ association_ref: 'a-w3', product_ref: 'prod-03', product_name: 'GLIFOSATO 480', canonical_product_ref: 'prod-02', canonical_product_name: 'Glifosato 480', reason: 'Mayúsculas.' }),
      association({ association_ref: 'a-w4', product_ref: 'prod-06', product_name: 'Úrea granulada', canonical_product_ref: 'prod-05', canonical_product_name: 'Urea', actor_name: 'Jo' }),
    ],
    history: [
      association({
        association_ref: 'a-w1',
        product_ref: 'prod-04',
        product_name: 'Glifósato 480',
        canonical_product_ref: 'prod-01',
        canonical_product_name: LONG_CANONICAL,
        valid_from: '2026-10-01T08:00:00.000Z',
        valid_to: '2026-10-15T18:30:00.000Z',
        closed_by_ref: 'u-long',
        closed_by_name: 'María José de la Cruz y Fernández Montaño',
        close_reason: CLOSE_REASON_280,
      }),
    ],
  },
};

/* ── empty y one ──────────────────────────────────────────────────────── */

export const empty: CatalogFixture = { products: [], catalog: [], associations: { current: [], history: [] } };

const oneProducts = ([['Urea', 'kg', 'Fertilizante', null, null]] satisfies Row[]).map(product);
export const one: CatalogFixture = { products: oneProducts, catalog: oneProducts.map(entryOf), associations: { current: [], history: [] } };

export const catalogFixtures = { demo, worst, empty, one } as const;
