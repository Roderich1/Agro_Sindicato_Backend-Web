import { Prisma, PrismaClient, UserRole } from '@prisma/client';

export const DEMO_MARKER = 'massive-flow-v1';

export const farmersSeed = [
  ['Juan Perez', 'juan.perez@agro.local'],
  ['Maria Choque', 'maria.choque@agro.local'],
  ['Pedro Mamani', 'pedro.mamani@agro.local'],
  ['Rosa Vargas', 'rosa.vargas@agro.local'],
  ['Luis Rojas', 'luis.rojas@agro.local'],
  ['Elena Suarez', 'elena.suarez@agro.local'],
  ['Carlos Gutierrez', 'carlos.gutierrez@agro.local'],
  ['Ana Flores', 'ana.flores@agro.local'],
  ['Miguel Aguilera', 'miguel.aguilera@agro.local'],
  ['Carmen Rivero', 'carmen.rivero@agro.local'],
  ['Jose Salvatierra', 'jose.salvatierra@agro.local'],
  ['Lucia Mercado', 'lucia.mercado@agro.local'],
] as const;

export const cropNames = ['Soya', 'Maiz', 'Arroz', 'Girasol', 'Sorgo', 'Trigo', 'Frejol', 'Mani'];

export const productSeed = [
  ['Glifosato 48 SL', 'Herbicida', 'Glifosato', 'IV - Poco peligroso', 'L'],
  ['2,4-D Amina 72', 'Herbicida', '2,4-D', 'II - Moderadamente peligroso', 'L'],
  ['Atrazina 90 WG', 'Herbicida', 'Atrazina', 'III - Ligeramente peligroso', 'kg'],
  ['Cipermetrina 25 EC', 'Insecticida', 'Cipermetrina', 'II - Moderadamente peligroso', 'L'],
  ['Lambda Cihalotrina 5 EC', 'Insecticida', 'Lambda cihalotrina', 'II - Moderadamente peligroso', 'L'],
  ['Imidacloprid 70 WG', 'Insecticida', 'Imidacloprid', 'II - Moderadamente peligroso', 'kg'],
  ['Mancozeb 80 WP', 'Fungicida', 'Mancozeb', 'III - Ligeramente peligroso', 'kg'],
  ['Tebuconazole 25 EW', 'Fungicida', 'Tebuconazole', 'III - Ligeramente peligroso', 'L'],
  ['Paraquat 20 SL', 'Herbicida', 'Paraquat', 'Ib - Altamente peligroso', 'L'],
  ['Abamectina 1.8 EC', 'Insecticida', 'Abamectina', 'II - Moderadamente peligroso', 'L'],
  ['Clorpirifos 48 EC', 'Insecticida', 'Clorpirifos', 'II - Moderadamente peligroso', 'L'],
  ['Metalaxil + Mancozeb', 'Fungicida', 'Metalaxil + Mancozeb', 'III - Ligeramente peligroso', 'kg'],
  ['Aceite Agricola Mineral', 'Coadyuvante', 'Aceite mineral', 'IV - Poco peligroso', 'L'],
  ['Adherente Siliconado', 'Coadyuvante', 'Organosiliconado', 'IV - Poco peligroso', 'L'],
] as const;

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function money(value: number) {
  return new Prisma.Decimal(value.toFixed(2));
}

export function qty(value: number) {
  return new Prisma.Decimal(value.toFixed(4));
}

export async function upsertUser(
  prisma: PrismaClient,
  tenantId: string,
  passwordHash: string,
  name: string,
  email: string,
  role: UserRole,
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { email },
      update: { name, role, isActive: true },
      create: { tenantId, name, email, role, passwordHash },
    });

    await tx.member.upsert({
      where: {
        tenantId_userId: {
          tenantId: user.tenantId,
          userId: user.id,
        },
      },
      update: {
        role: user.role,
        isActive: user.isActive,
      },
      create: {
        tenantId: user.tenantId,
        userId: user.id,
        role: user.role,
        isActive: user.isActive,
      },
    });

    return user;
  });
}
