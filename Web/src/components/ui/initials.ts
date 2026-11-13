/** Iniciales de un nombre: primera letra de las dos primeras palabras. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!)
    .join('')
    .toUpperCase();
}
