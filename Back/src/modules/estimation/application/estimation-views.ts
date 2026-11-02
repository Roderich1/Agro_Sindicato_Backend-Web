import { SyncV1BaseUnit } from "@prisma/client";

/** The fixed notice of INT-09 (OpenAPI `Notice`). */
export const NOTICE =
  "Referencia calculada a partir de cifras publicadas; no es una necesidad ni una propuesta, no se suma a ellas y puede no estar actualizada.";

export function campaignRefOf(c: { id: string; name: string; status: string; startDate: Date; estimatedEndDate: Date | null; closedAt: Date | null }) {
  return {
    campaign_ref: c.id,
    name: c.name,
    status: c.status as "PLANIFICADA" | "ABIERTA" | "CERRADA" | "CANCELADA",
    start_date: c.startDate.toISOString(),
    end_date: (c.closedAt ?? c.estimatedEndDate)?.toISOString() ?? null,
  };
}

export function seasonRefOf(s: { id: string; key: string; definition: string; durationDays: number }) {
  return { season_ref: s.id, key: s.key, definition: s.definition, duration_days: s.durationDays };
}

export function presentationUnitOf(unit: SyncV1BaseUnit): "L" | "KG" {
  return unit === "ML" ? "L" : "KG";
}

/**
 * Coverage of a campaign as its seal recorded it (F07 §5.3): participation,
 * not completeness nor representativeness. Seals before the coverage, a
 * population mismatch or no seal are UNKNOWN with their reason.
 */
export function coverageViewOf(
  sealed: { status: "IDENTIFIED" | "POPULATION_MISMATCH"; linkedMembers: number | null; membersInPublishedFigures: number | null } | null | undefined,
  hasSeal: boolean,
) {
  const unknown = (reason: "SEALED_BEFORE_COVERAGE" | "POPULATION_MISMATCH" | "NOT_SEALED") => ({
    status: "UNKNOWN" as const,
    unknown_reason: reason,
    members_in_published_figures: null,
    linked_members: null,
    measures: "PARTICIPATION_NOT_COMPLETENESS" as const,
  });
  if (!hasSeal) return unknown("NOT_SEALED");
  if (!sealed) return unknown("SEALED_BEFORE_COVERAGE");
  if (sealed.status === "POPULATION_MISMATCH") return unknown("POPULATION_MISMATCH");
  return {
    status: "IDENTIFIED" as const,
    unknown_reason: null,
    members_in_published_figures: sealed.membersInPublishedFigures,
    linked_members: sealed.linkedMembers,
    measures: "PARTICIPATION_NOT_COMPLETENESS" as const,
  };
}
