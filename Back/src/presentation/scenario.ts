import type { SyncV1ProjectionType, UserRole } from "@prisma/client";

export const DATASET = "valle-claro-v1";
export const EMAIL_DOMAIN = "valle-claro.example.invalid";
export const TENANT_NAME = "Asociación Valle Claro";
export const DAY_MS = 86_400_000;
export const SEASON_DAYS = 90;

const people = [
  ["Elena Rojas", "elena.rojas", "ADMINISTRADOR"],
  ["Mario Quiroga", "mario.quiroga", "DIRECTIVA"],
  ["Inés Salvatierra", "ines.salvatierra", "DIRECTIVA"],
  ["Alba Méndez", "alba.mendez", "AGRICULTOR"],
  ["Julián Paredes", "julian.paredes", "AGRICULTOR"],
  ["Teresa Arias", "teresa.arias", "AGRICULTOR"],
  ["Simón Barrera", "simon.barrera", "AGRICULTOR"],
  ["Daniela Vargas", "daniela.vargas", "AGRICULTOR"],
  ["Hugo Vílchez", "hugo.vilchez", "AGRICULTOR"],
  ["Lidia Coronel", "lidia.coronel", "AGRICULTOR"],
  ["Iván Céspedes", "ivan.cespedes", "AGRICULTOR"],
  ["Rocío Soria", "rocio.soria", "AGRICULTOR"],
  ["Nora Ibáñez", "nora.ibanez", "AGRICULTOR"],
  ["Mateo Serrano", "mateo.serrano", "AGRICULTOR"],
  ["Clara Andrada", "clara.andrada", "AGRICULTOR"],
  ["Rafael Calle", "rafael.calle", "AGRICULTOR"],
  ["Marta Gálvez", "marta.galvez", "AGRICULTOR"],
  ["Darío Pino", "dario.pino", "AGRICULTOR"],
  ["Olga Pereyra", "olga.pereyra", "AGRICULTOR"],
  ["Lucas Ayala", "lucas.ayala", "AGRICULTOR"],
  ["Sandra Iriarte", "sandra.iriarte", "AGRICULTOR"],
  ["Emilio Palma", "emilio.palma", "AGRICULTOR"],
  ["Julia Rivero", "julia.rivero", "AGRICULTOR"],
  ["Marcos Linares", "marcos.linares", "AGRICULTOR"],
  ["Alicia Crespo", "alicia.crespo", "AGRICULTOR"],
  ["Víctor Duarte", "victor.duarte", "AGRICULTOR"],
  ["Irene Robles", "irene.robles", "AGRICULTOR"],
] as const satisfies ReadonlyArray<readonly [string, string, UserRole]>;

export const accounts = people.map(([name, address, role]) => ({ name, email: `${address}@${EMAIL_DOMAIN}`, role }));
export const mobileAccount = accounts.at(-1)!;

const catalog = [
  ["Fertilizante foliar equilibrado", "Nutrición foliar", "L"],
  ["Sulfato de potasio soluble", "Nutrición mineral", "KG"],
  ["Aceite agrícola mineral", "Coadyuvante", "L"],
  ["Corrector líquido de calcio", "Nutrición foliar", "L"],
  ["Quelato de hierro soluble", "Micronutrientes", "KG"],
  ["Humato de potasio granulado", "Enmiendas", "KG"],
  ["Extracto de algas", "Bioestimulante", "L"],
  ["Azufre mojable", "Protección vegetal", "KG"],
  ["Jabón potásico agrícola", "Protección vegetal", "L"],
  ["Surfactante no iónico", "Coadyuvante", "L"],
  ["Sulfato de magnesio cristalino", "Nutrición mineral", "KG"],
  ["Acondicionador de agua agrícola", "Coadyuvante", "L"],
  ["Mezcla soluble de micronutrientes", "Micronutrientes", "KG"],
  ["Enmienda cálcica granulada", "Enmiendas", "KG"],
  ["Fertilizante líquido de arranque", "Nutrición foliar", "L"],
] as const;

export const products = catalog.map(([name, category, unit]) => ({ name, category, unit, baseUnit: unit === "L" ? "ML" as const : "G" as const }));

export function daysFrom(day: Date, days: number): Date {
  return new Date(day.getTime() + days * DAY_MS);
}

export function campaignPeriods(reference: Date) {
  const current = daysFrom(reference, -21);
  return Array.from({ length: 5 }, (_, index) => {
    // Same annual window, including a leap-day reference.
    const year = current.getUTCFullYear() - (4 - index);
    const month = current.getUTCMonth();
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const startDate = new Date(Date.UTC(year, month, Math.min(current.getUTCDate(), lastDay), 12));
    return { name: `Ciclo agrícola ${year}`, startDate, estimatedEndDate: daysFrom(startDate, SEASON_DAYS - 1), historical: index < 4 };
  });
}

/** Integers in mL/g. A missing spec means no operation, and an explicit zero stays a real operation. */
export function figures(campaign: number) {
  const rows: { farmer: number; product: number; projectionType: SyncV1ProjectionType; base: number }[] = [];
  for (let farmer = 0; farmer < 23; farmer++) {
    for (let product = 0; product < products.length; product++) {
      const alwaysComparable = product < 2 && farmer < 4 + campaign;
      const variable = product >= 5 && (product + farmer * 3 + campaign * 2) % 11 === 0;
      if (alwaysComparable || variable) {
        rows.push({ farmer, product, projectionType: "CONSUMPTION_TOTAL",
          base: 1500 + farmer * 125 + product * 250 + campaign * 375 });
      }
      if (product > 2 && (farmer * 2 + product + campaign) % 9 === 0) {
        rows.push({ farmer, product, projectionType: "DECLARED_NEED",
          base: 2250 + farmer * 100 + product * 500 + campaign * 250 });
      }
    }
  }
  if (campaign !== 3) rows.push({ farmer: 0, product: 2, projectionType: "CONSUMPTION_TOTAL", base: 0 });
  if (campaign === 1) rows.push({ farmer: 0, product: 4, projectionType: "CONSUMPTION_TOTAL", base: 1750 });
  if (campaign === 4) rows.push({ farmer: 1, product: 0, projectionType: "DECLARED_NEED", base: 0 });
  return rows;
}
