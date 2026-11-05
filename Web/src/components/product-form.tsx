import { useState, type FormEvent } from 'react';
import { CATEGORY_SUGGESTIONS, normalizeName, productError, UNIT_OPTIONS, type ProductUnit } from '../lib/product-text';
import { productsService } from '../services/inventory.service';
import type { Product } from '../types/inventory';
import { buttonClass, inputClass, labelClass, Notice, secondaryButtonClass } from './app-shell';

/**
 * Formulario de producto del sindicato (Gestión → Productos y «Crear producto
 * nuevo» desde una denominación pendiente). Usa los endpoints existentes
 * (`POST`/`PATCH /inventory/products`); el servidor sólo los admite para la
 * Directiva y el Administrador.
 *
 * La unidad se elige al crear (L o kg: las dos que el servidor convierte a una
 * unidad base vinculable, mL o g) y no se cambia después, para no romper los
 * vínculos de cifras, equivalencias y declaraciones ya recibidas.
 */
export interface ExistingName {
  id: string;
  name: string;
  isActive: boolean;
}

export function ProductForm({
  product,
  existing,
  lockedUnit,
  onSaved,
  onCancel,
  submitLabel,
}: {
  /** Producto a editar; sin él, se crea uno nuevo. */
  product?: Product | null;
  /** Nombres ya usados en el sindicato, para avisar antes de enviar. */
  existing: ExistingName[];
  /** Unidad fija (p. ej. la de la denominación que se quiere asociar). */
  lockedUnit?: ProductUnit;
  onSaved: (product: Product) => void;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const editing = Boolean(product);
  const [name, setName] = useState(product?.name ?? '');
  const [unit, setUnit] = useState<ProductUnit | ''>(lockedUnit ?? '');
  const [commercialName, setCommercialName] = useState(product?.commercialName ?? '');
  const [activeIngredient, setActiveIngredient] = useState(product?.activeIngredient ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmed = name.trim();
  const clash = trimmed.length > 0 ? existing.find((entry) => entry.id !== product?.id && normalizeName(entry.name) === normalizeName(trimmed)) ?? null : null;
  const ready = trimmed.length >= 2 && trimmed.length <= 160 && (editing || unit !== '') && !clash && !saving;

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

  return (
    <form className="space-y-4" onSubmit={(event) => void submit(event)} aria-label={editing ? 'Editar producto' : 'Nuevo producto'}>
      <div>
        <label htmlFor="product-name" className={labelClass}>
          Nombre *
        </label>
        <input
          id="product-name"
          className={inputClass}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={160}
          autoComplete="off"
          aria-invalid={clash ? true : undefined}
          aria-describedby={clash ? 'product-name-clash' : undefined}
        />
        {clash && (
          <p id="product-name-clash" className="mt-1.5 text-xs font-semibold text-red-700" role="alert">
            Ya existe «{clash.name}»{clash.isActive ? '' : ' (inactivo)'} en el catálogo del sindicato. Use ese producto o elija otro nombre.
          </p>
        )}
      </div>

      <fieldset>
        <legend className={labelClass}>Unidad *</legend>
        {editing ? (
          <p className="text-sm text-slate-700" data-testid="unit-locked">
            <span className="font-semibold">{product!.unit}</span>
            <span className="ml-2 text-xs text-slate-500">La unidad no se cambia: protege los vínculos con cifras y equivalencias.</span>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {UNIT_OPTIONS.map((option) => {
              const disabled = lockedUnit !== undefined && lockedUnit !== option.value;
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold ${
                    unit === option.value ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-700'
                  } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <input type="radio" name="product-unit" value={option.value} checked={unit === option.value} disabled={disabled} onChange={() => setUnit(option.value)} />
                  {option.label}
                </label>
              );
            })}
            {lockedUnit && <p className="w-full text-xs text-slate-500">Misma unidad que la denominación que va a asociar.</p>}
          </div>
        )}
      </fieldset>

      <details className="rounded-xl border border-slate-200 px-4 py-3" open={editing || undefined}>
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Datos opcionales</summary>
        <div className="mt-3 space-y-3">
          <div>
            <label htmlFor="product-commercial" className={labelClass}>
              Nombre comercial
            </label>
            <input id="product-commercial" className={inputClass} value={commercialName} onChange={(event) => setCommercialName(event.target.value)} maxLength={160} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="product-ingredient" className={labelClass}>
              Ingrediente activo
            </label>
            <input id="product-ingredient" className={inputClass} value={activeIngredient} onChange={(event) => setActiveIngredient(event.target.value)} maxLength={160} autoComplete="off" />
          </div>
          <div>
            <label htmlFor="product-category" className={labelClass}>
              Categoría
            </label>
            <input id="product-category" className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)} maxLength={80} list="product-categories" autoComplete="off" />
            <datalist id="product-categories">
              {CATEGORY_SUGGESTIONS.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </div>
        </div>
      </details>

      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex justify-end gap-2">
        <button type="button" className={secondaryButtonClass} onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className={buttonClass} disabled={!ready}>
          {saving ? 'Guardando…' : submitLabel ?? (editing ? 'Guardar cambios' : 'Crear producto')}
        </button>
      </div>
    </form>
  );
}
