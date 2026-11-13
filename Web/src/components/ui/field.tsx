import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { helpClass, inputClass, labelClass } from './classes';
import { ICON } from './icon-paths';
import { Icon } from './icons';

/** Lo que `Field` entrega a su control para asociarlo con la etiqueta, la ayuda y el error. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  required?: boolean;
}

export interface FieldProps {
  label: ReactNode;
  /** Texto de ayuda permanente bajo el campo («Obligatorio. Queda en el historial.»). */
  help?: ReactNode;
  /** Error de validación: se muestra con icono, `aria-invalid` y queda asociado al control. */
  error?: ReactNode;
  /** Añade «(opcional)» a la etiqueta; los demás campos se entienden obligatorios por su ayuda. */
  optional?: boolean;
  required?: boolean;
  /** id del control; si falta, se genera uno. */
  id?: string;
  /** Oculta la etiqueta visualmente (sigue siendo el nombre accesible). */
  hideLabel?: boolean;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Etiqueta + control + ayuda + error, asociados por id (`htmlFor`,
 * `aria-describedby`, `aria-invalid`). Base de TextInput, Textarea y Select;
 * úselo directamente para un control propio.
 */
export function Field({ label, help, error, optional, required, id, hideLabel, className, children }: FieldProps) {
  const auto = useId();
  const controlId = id ?? `f${auto}`;
  const helpId = help ? `${controlId}-ayuda` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <label htmlFor={controlId} className={hideLabel ? 'sr-only' : labelClass}>
        {label}
        {optional && <span className="font-normal text-ink-muted"> (opcional)</span>}
      </label>
      {children({ id: controlId, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, required })}
      {error && (
        <p id={errorId} className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold leading-relaxed text-danger-ink">
          <Icon d={ICON.alert} className="mt-px h-4 w-4" />
          <span>{error}</span>
        </p>
      )}
      {help && (
        <p id={helpId} className={helpClass}>
          {help}
        </p>
      )}
    </div>
  );
}

type FieldOwnProps = Pick<FieldProps, 'label' | 'help' | 'error' | 'optional' | 'hideLabel'> & { fieldClassName?: string };

export type TextInputProps = FieldOwnProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'children'>;

/** Campo de una línea con etiqueta, ayuda y error asociados. */
export function TextInput({ label, help, error, optional, hideLabel, fieldClassName, id, required, className, ...rest }: TextInputProps) {
  return (
    <Field label={label} help={help} error={error} optional={optional} hideLabel={hideLabel} id={id} required={required} className={fieldClassName}>
      {(control) => <input {...rest} {...control} className={className ? `${inputClass} ${className}` : inputClass} />}
    </Field>
  );
}

export type TextareaProps = FieldOwnProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'children'>;

/** Área de texto (motivo, notas) con etiqueta, ayuda y error asociados. Se puede agrandar en vertical. */
export function Textarea({ label, help, error, optional, hideLabel, fieldClassName, id, required, className, rows = 3, ...rest }: TextareaProps) {
  return (
    <Field label={label} help={help} error={error} optional={optional} hideLabel={hideLabel} id={id} required={required} className={fieldClassName}>
      {(control) => <textarea rows={rows} {...rest} {...control} className={`${inputClass} min-h-24 resize-y ${className ?? ''}`} />}
    </Field>
  );
}

export type SelectProps = FieldOwnProps & SelectHTMLAttributes<HTMLSelectElement>;

/** Selector nativo (accesible en teléfono y con teclado) con etiqueta, ayuda y error. */
export function Select({ label, help, error, optional, hideLabel, fieldClassName, id, required, className, children, ...rest }: SelectProps) {
  return (
    <Field label={label} help={help} error={error} optional={optional} hideLabel={hideLabel} id={id} required={required} className={fieldClassName}>
      {(control) => (
        <select {...rest} {...control} className={`${inputClass} pr-10 ${className ?? ''}`}>
          {children}
        </select>
      )}
    </Field>
  );
}

export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
  /** Nombre accesible; por defecto se oculta y el texto de ejemplo hace de guía visual. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Muestra la etiqueta encima en lugar de ocultarla. */
  showLabel?: boolean;
  fieldClassName?: string;
}

/**
 * Búsqueda en forma de píldora con lupa (láminas 03 y 21). Filtra en la vista
 * lo que ya llegó del servidor; el componente no busca por su cuenta.
 */
export function SearchInput({ label, value, onChange, showLabel = false, fieldClassName, id, className, placeholder, ...rest }: SearchInputProps) {
  const auto = useId();
  const inputId = id ?? `s${auto}`;
  return (
    <div className={fieldClassName}>
      <label htmlFor={inputId} className={showLabel ? labelClass : 'sr-only'}>
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted">
          <Icon d={ICON.search} className="h-5 w-5" />
        </span>
        <input
          {...rest}
          id={inputId}
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClass} rounded-full bg-surface pl-11 ${className ?? ''}`}
        />
      </div>
    </div>
  );
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
}

/** Casilla con etiqueta clicable (p. ej. «Confirmo que…» de las confirmaciones). */
export function Checkbox({ label, description, id, className, ...rest }: CheckboxProps) {
  const auto = useId();
  const inputId = id ?? `c${auto}`;
  const descId = description ? `${inputId}-desc` : undefined;
  return (
    <div className={`flex items-start gap-3 ${className ?? ''}`}>
      <input
        {...rest}
        id={inputId}
        type="checkbox"
        aria-describedby={descId}
        className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded-[5px] border-field-border accent-ink"
      />
      <div className="min-w-0 text-sm leading-relaxed">
        <label htmlFor={inputId} className="cursor-pointer text-ink">
          {label}
        </label>
        {description && (
          <p id={descId} className="text-xs text-ink-muted">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

export interface RadioCardOption<T extends string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioCardsProps<T extends string> {
  /** Pregunta del grupo (`<legend>`). */
  legend: ReactNode;
  name: string;
  options: RadioCardOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  help?: ReactNode;
  hideLegend?: boolean;
}

/**
 * Opciones excluyentes en tarjetas (láminas 15 «Conceder permiso» y 30
 * «Nuevo producto»): radios nativos dentro de un `fieldset`, la elegida con
 * borde grueso de tinta (además del punto del radio, no sólo por color).
 */
export function RadioCards<T extends string>({ legend, name, options, value, onChange, help, hideLegend }: RadioCardsProps<T>) {
  const auto = useId();
  const helpId = help ? `${name}${auto}-ayuda` : undefined;
  return (
    <fieldset aria-describedby={helpId}>
      <legend className={hideLegend ? 'sr-only' : labelClass}>{legend}</legend>
      <div className="flex flex-col gap-2.5">
        {options.map((option) => {
          const id = `${name}${auto}-${option.value}`;
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              htmlFor={id}
              className={`flex cursor-pointer items-start gap-3 rounded-[18px] bg-surface px-4 py-3.5 ${
                checked ? 'border-2 border-ink' : 'border border-line'
              } ${option.disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                disabled={option.disabled}
                onChange={() => onChange(option.value)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-ink"
              />
              <span className="min-w-0">
                <span className="block text-base font-semibold text-ink">{option.label}</span>
                {option.description && <span className="mt-0.5 block text-sm leading-relaxed text-ink-muted">{option.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {help && (
        <p id={helpId} className={helpClass}>
          {help}
        </p>
      )}
    </fieldset>
  );
}
