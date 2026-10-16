import type { SyncV1BaseUnit } from "@prisma/client";

/**
 * Base unit admitted for a central product unit (contract F06 §2): `L` → `ML`
 * and `KG` → `G`. Only the symbol's letter case is normalised (the catalogue
 * stores `kg`); there is no dimensional conversion or density estimate. Any
 * other unit is not linkable.
 */
export function baseUnitForCentralUnit(unit: string): SyncV1BaseUnit | null {
  switch (unit.trim().toUpperCase()) {
    case "L":
      return "ML";
    case "KG":
      return "G";
    default:
      return null;
  }
}
