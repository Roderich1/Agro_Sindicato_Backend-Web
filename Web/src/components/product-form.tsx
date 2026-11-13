import { useEffect, useState, type FormEvent } from 'react';
import { CATEGORY_SUGGESTIONS, normalizeName, productError, type ProductUnit } from '../lib/product-text';
import { productsService } from '../services/inventory.service';
import type { Product } from '../types/inventory';
import { Button, Icon, ICON, Notice, RadioCards, TextInput } from './ui';

/**
 * Formulario de producto del sindicato (láminas 30.4 «Nuevo producto» y 34.4
 * «Editar producto»), usado en Catálogo → Productos y en «Crear producto
 * distinto» desde Nombres equivalentes. Usa los endpoints existentes
 * (`POST`/`PATCH /inventory/products`); el servidor sólo los admite para la
 * Directiva y el Administrador.
 *
 * La unidad se elige al crear (L o kg: las dos que el servidor convierte a una
 * unidad base vinculable, mL o g) y no se cambia después, para no romper los
 * vínculos de cifras, equivalencias y declaraciones ya recibidas. «Nombre
 * comercial» no está en la lámina, pero es un dato que ya existe: se conserva
 * como campo opcional para no dejarlo sin forma de editarse.
 */
export interface ExistingName {
  id: string;
  name: string;
  isActive: boolean;
}

const UNIT_CARDS: { value: ProductUnit; label: string; description: string }[] = [
  { value: 'L', label: 'Litros', description: 'Para productos líquidos.' },
  { value: 'kg', label: 'Kilogramos', description: 'Para productos sólidos.' },
];

function lockedUnitText(unit: string): { name: string; help: string } {
  const upper = unit.trim().toUpperCase();
  if (upper === 'L') return { name: 'Litros', help: 'No se puede cambiar: las cifras ya publicadas están en litros.' };
  if (upper === 'KG') return { name: 'Kilogramos', help: 'No se puede cambiar: las cifras ya publicadas están en kilogramos.' };
  return { name: unit, help: 'No se puede cambiar desde aquí. Esta unidad no se vincula a cifras colectivas.' };
}

export function ProductForm({
  product,
  existing,
  lockedUnit,
  onSaved,
  onCancel,
  submitLabel,
  onDirtyChange,
}: {
  /** Producto a editar; sin él, se crea uno nuevo. */
  product?: Product | null;
  /** Nombres ya usados en el sindicato, para avisar antes de enviar. */
  existing: ExistingName[];
  /** Unidad fija (p. ej. la del nombre que se quiere unir). */
  lockedUnit?: ProductUnit;
  onSaved: (product: Product) => void;
  onCancel: () => void;
  submitLabel?: string;
  /** Avisa si hay cambios sin guardar (el diálogo pregunta antes de descartarlos). */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const editing = Boolean(product);
  const [name, setName] = useState(product?.name ?? '');
  const [unit, setUnit] = useState<ProductUnit | null>(lockedUnit ?? null);
  const [commercialName, setCommercialName] = useState(product?.commercialName ?? '');
  const [activeIngredient, setActiveIngredient] = useState(product?.activeIngredient ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();
  const clash = trimmed.length > 0 ? existing.find((entry) => entry.id !== product?.id && normalizeName(entry.name) === normalizeName(trimmed)) ?? null : null;
  const ready = trimmed.length >= 2 && trimmed.length <= 160 && (editing || unit !== null) && !clash && !saving;
  const dirty = product
    ? name !== product.name || commercialName !== (product.commercialName ?? '') || activeIngredient !== (product.activeIngredient ?? '') || category !== (product.category ?? '')
    : name.length > 0 || commercialName.length > 0 || activeIngredient.length > 0 || category.length > 0 || (!lockedUnit && unit !== null);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      const saved = product
        ? await productsService.update(product.id, {
            name: trimmed,
            // Una cadena vacía borra el dato opcional en el servidor.
            commercialName: commercialName.trim(),
            activeIngredient: activeIngredient.trim(),
            category: category.trim(),
          })
        : await productsService.create({
            name: trimmed,
            unit: unit as ProductUnit,
            ...(commercialName.trim() ? { commercialName: commercialName.trim() } : {}),
            ...(activeIngredient.trim() ? { activeIngredient: activeIngredient.trim() } : {}),
            ...(category.trim() ? { category: category.trim() } : {}),
          });
      onSaved(saved);
    } catch (err) {
      setError(productError(err, editing ? 'No fue posible guardar los cambios.' : 'No fue posible crear el producto.'));
    } finally {
      setSaving(false);
    }
  };

  const locked = product ? lockedUnitText(product.unit) : null;

  return (
    <form className="space-y-5" onSubmit={(event) => void submit(event)} aria-label={editing ? 'Editar producto' : 'Nuevo producto'} noValidate>
      <TextInput
        id="product-name"
        label="Nombre"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={160}
        autoComplete="off"
        placeholder="Como lo conocen los agricultores"
        error={
          clash ? (
            <span role="alert">
              Ya existe «{clash.name}»{clash.isActive ? '' : ' (inactivo)'} en el catálogo del sindicato. Use ese producto o elija otro nombre.
            </span>
          ) : undefined
        }
      />

      {locked ? (
        <div>
          <p className="mb-1.5 block text-sm font-semibold text-ink" id="product-unit-label">
            Unidad
          </p>
          <p
            className="flex min-h-11 items-center gap-2 rounded-field border border-line bg-sunken px-4 py-2.5 text-base text-ink"
            aria-labelledby="product-unit-label"
            data-testid="unit-locked"
          >
            <Icon d={ICON.lock} className="h-4 w-4 shrink-0" />
            {locked.name}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{locked.help}</p>
        </div>
      ) : (
        <RadioCards
          legend="Unidad"
          name="product-unit"
          value={unit}
          onChange={setUnit}
          help={lockedUnit ? 'Misma unidad que el nombre que va a unir. La unidad no se puede cambiar después.' : 'La unidad no se puede cambiar después.'}
          options={UNIT_CARDS.map((option) => ({ ...option, disabled: lockedUnit !== undefined && lockedUnit !== option.value }))}
        />
      )}

      <TextInput id="product-ingredient" label="Ingrediente activo" optional value={activeIngredient} onChange={(event) => setActiveIngredient(event.target.value)} maxLength={160} autoComplete="off" />
      <div>
        <TextInput
          id="product-category"
          label="Categoría"
          optional
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          maxLength={80}
          list="product-categories"
          autoComplete="off"
          placeholder="Herbicida, fungicida…"
        />
        <datalist id="product-categories">
          {CATEGORY_SUGGESTIONS.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      </div>
      <TextInput
        id="product-commercial"
        label="Nombre comercial"
        optional
        help="Como figura en la etiqueta, si es distinto."
        value={commercialName}
        onChange={(event) => setCommercialName(event.target.value)}
        maxLength={160}
        autoComplete="off"
      />

      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!ready} busy={saving}>
          {submitLabel ?? (editing ? 'Guardar cambios' : 'Crear producto')}
        </Button>
      </div>
    </form>
  );
}
