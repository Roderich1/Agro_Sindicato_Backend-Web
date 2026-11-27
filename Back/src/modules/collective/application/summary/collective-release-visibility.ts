import type { Prisma } from "@prisma/client";

export const releaseVisibility = {
  withdrawnAt: true,
  items: {
    where: {
      contribution: {
        OR: [
          { status: { not: "ACTIVE" } },
          { member: { OR: [{ isActive: false }, { role: { not: "AGRICULTOR" } }, { user: { isActive: false } }] } },
        ],
      },
    },
    select: { contributionId: true },
    take: 1,
  },
} satisfies Prisma.CollectiveReleaseSelect;

export type ReleaseVisibility = { withdrawnAt: Date | null; items: readonly unknown[] };

export function releaseIsVisible(release: ReleaseVisibility | null): boolean {
  return release !== null && release.withdrawnAt === null && release.items.length === 0;
}
