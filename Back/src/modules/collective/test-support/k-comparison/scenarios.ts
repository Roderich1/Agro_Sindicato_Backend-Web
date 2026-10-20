import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * F07-POL-01 (#107): scenarios of the k = 3 / k = 5 comparison. Every value is
 * synthetic. DS-UX and D4 reuse the existing hand-written fixtures; the S*
 * scenarios are SYNTHETIC ASSUMPTIONS of lower and higher participation, not a
 * description of the union nor of the pilot.
 */
export type Projection = "DECLARED_NEED" | "CONSUMPTION_TOTAL";
export type BaseUnit = "ML" | "G";

export interface ScenarioContribution {
  member: string;
  campaign: string;
  type: Projection;
  product: string;
  unit: BaseUnit;
  quantity: string;
  /** Published and then cancelled (D4): it never counts. */
  cancelled?: boolean;
}

export interface Scenario {
  id: string;
  origin: "FIXTURE" | "SUPUESTO_SINTETICO";
  source: string;
  /** Linked AGRICULTOR Members (the coverage denominator). */
  members: string[];
  campaigns: string[];
  products: { name: string; unit: "L" | "kg" }[];
  contributions: ScenarioContribution[];
  /** The same sequence for every scenario and k (see the spec). */
  steps: {
    supersede: Omit<ScenarioContribution, "cancelled">;
    associate: { product: string; canonical: string };
    deactivate: string;
    roleChange: string;
  };
}

const codes = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}`);

/** DS-UX Web (protocol v1.4 §3.3.1): `tool/f10_eval_web/dsux/oraculo_web.json`, unchanged. */
function dsux(): Scenario {
  const oracle = JSON.parse(
    readFileSync(resolve(process.cwd(), "../tool/f10_eval_web/dsux/oraculo_web.json"), "utf8"),
  ) as { campana: string; productos: string[]; agricultores: string[]; necesidades: { miembro: string; producto: string; litros: number }[] };
  return {
    id: "DSUX",
    origin: "FIXTURE",
    source: "tool/f10_eval_web/dsux/oraculo_web.json (M1–M6; 4 de 6 aportan)",
    members: oracle.agricultores,
    campaigns: [oracle.campana],
    products: oracle.productos.map((name) => ({ name, unit: "L" as const })),
    contributions: oracle.necesidades.map((n) => ({
      member: n.miembro,
      campaign: oracle.campana,
      type: "DECLARED_NEED" as const,
      product: n.producto,
      unit: "ML" as const,
      quantity: String(n.litros * 1000),
    })),
    steps: {
      supersede: { member: "M2", campaign: oracle.campana, type: "DECLARED_NEED", product: "Glifosato Demo", unit: "ML", quantity: "38000" },
      // W3 of the DS-UX session VER1.
      associate: { product: "Belator", canonical: "Bellator" },
      deactivate: "M4",
      roleChange: "M3",
    },
  };
}

/** D4 (F06): `test-support/d4/F06_EXPECTED_CONTRIBUTIONS.csv`, unchanged; 12 linked as in F06_RECONCILIATION. */
function d4(): Scenario {
  const [header, ...rows] = readFileSync(
    resolve(process.cwd(), "src/modules/collective/test-support/d4/F06_EXPECTED_CONTRIBUTIONS.csv"),
    "utf8",
  )
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(","));
  const records = rows.map((row) => Object.fromEntries(header!.map((key, i) => [key, row[i] ?? ""])));
  return {
    id: "D4",
    origin: "FIXTURE",
    source: "Back/src/modules/collective/test-support/d4/F06_EXPECTED_CONTRIBUTIONS.csv (F1–F3 aportan; 12 vinculados, F06_RECONCILIATION.md)",
    members: codes("F", 12).map((code) => `F${Number(code.slice(1))}`),
    campaigns: ["C1", "C2"],
    products: [
      { name: "Belator", unit: "L" },
      { name: "Bellator", unit: "L" },
      { name: "Glifosato F06", unit: "L" },
      { name: "Urea F06", unit: "kg" },
      { name: "Mancozeb F06", unit: "kg" },
    ],
    contributions: records.map((r) => ({
      member: r["farmer"]!,
      campaign: r["campaign"]!,
      type: r["projection_type"] as Projection,
      product: r["product"]!,
      unit: r["base_unit"] as BaseUnit,
      quantity: r["status"] === "CANCELLED" ? "1000" : r["quantity_base"]!,
      ...(r["status"] === "CANCELLED" ? { cancelled: true } : {}),
    })),
    steps: {
      supersede: { member: "F1", campaign: "C1", type: "DECLARED_NEED", product: "Belator", unit: "ML", quantity: "5500" },
      // The CANONICAL stage of F06_EXPECTED_CELLS.csv.
      associate: { product: "Bellator", canonical: "Belator" },
      deactivate: "F3",
      roleChange: "F2",
    },
  };
}

/**
 * A SYNTHETIC ASSUMPTION: `linked` farmers; contributors are drawn by
 * rotation from the first `contributing` of them (the rotation may leave some
 * of that pool without any need: the actual count is `contributing_initial`
 * in the results); product i has `cells[i]` contributors;
 * `alias` is a second denomination of product `alias.target` with
 * `alias.count` contributors, associated in step E3. Quantities are whole
 * litres from a fixed formula. Steps follow one rule for all of them:
 * supersede (+1 L) by the first contributor of the largest cell, removal of
 * its last contributor, role change of the first contributor of the second
 * largest cell that is still active.
 */
function synthetic(
  id: string,
  linked: number,
  contributing: number,
  cells: number[],
  alias: { target: number; count: number },
  note: string,
): Scenario {
  const members = codes("S", linked);
  const pool = members.slice(0, contributing);
  const campaign = "Campaña sintética";
  const name = (i: number) => `Producto P${i + 1}`;
  const aliasName = `${name(alias.target)} bis`;
  const litres = (member: string, i: number) => 2 + ((Number(member.slice(1)) * 7 + i * 5) % 23);
  const holders: string[][] = cells.map((count, i) => Array.from({ length: count }, (_, j) => pool[(i * 3 + j) % pool.length]!));
  const aliasOffset = (alias.target * 3 + cells[alias.target]!) % pool.length;
  const aliasHolders = Array.from({ length: alias.count }, (_, j) => pool[(aliasOffset + j) % pool.length]!);
  const contributions: ScenarioContribution[] = [
    ...holders.flatMap((who, i) =>
      who.map((member) => ({ member, campaign, type: "DECLARED_NEED" as const, product: name(i), unit: "ML" as const, quantity: String(litres(member, i) * 1000) })),
    ),
    ...aliasHolders.map((member) => ({
      member, campaign, type: "DECLARED_NEED" as const, product: aliasName, unit: "ML" as const, quantity: String(litres(member, cells.length) * 1000),
    })),
  ];
  const bySize = cells.map((count, i) => ({ count, i })).sort((a, b) => b.count - a.count || a.i - b.i);
  const largest = bySize[0]!.i;
  const first = holders[largest]![0]!;
  const removed = holders[largest]!.at(-1)!;
  const roleChange = holders[bySize[1]!.i]!.find((member) => member !== removed)!;
  return {
    id,
    origin: "SUPUESTO_SINTETICO",
    source: note,
    members,
    campaigns: [campaign],
    products: [...cells.map((_, i) => ({ name: name(i), unit: "L" as const })), { name: aliasName, unit: "L" as const }],
    contributions,
    steps: {
      supersede: { member: first, campaign, type: "DECLARED_NEED", product: name(largest), unit: "ML", quantity: String((litres(first, largest) + 1) * 1000) },
      associate: { product: aliasName, canonical: name(alias.target) },
      deactivate: removed,
      roleChange,
    },
  };
}

export function scenarios(): Scenario[] {
  return [
    dsux(),
    d4(),
    synthetic("S06-ALTA", 6, 6, [6, 5, 4, 3, 2], { target: 3, count: 2 }, "SUPUESTO SINTÉTICO: 6 vinculados, los 6 aportan"),
    synthetic("S12-BAJA", 12, 5, [5, 4, 3, 2, 1], { target: 2, count: 2 }, "SUPUESTO SINTÉTICO: 12 vinculados, 5 aportan"),
    synthetic("S12-ALTA", 12, 10, [10, 8, 6, 5, 4, 3], { target: 4, count: 2 }, "SUPUESTO SINTÉTICO: 12 vinculados, 10 aportan"),
    synthetic("S30-BAJA", 30, 9, [9, 6, 4, 3, 2, 2, 1], { target: 2, count: 2 }, "SUPUESTO SINTÉTICO: 30 vinculados, 9 aportan"),
    synthetic("S30-ALTA", 30, 24, [18, 12, 9, 7, 5, 4, 3, 2], { target: 5, count: 3 }, "SUPUESTO SINTÉTICO: 30 vinculados, 23 aportan (rotación sobre los 24 primeros)"),
  ];
}
