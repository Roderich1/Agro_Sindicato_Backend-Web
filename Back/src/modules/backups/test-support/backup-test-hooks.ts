import type { Prisma } from "@prisma/client";
import type { Readable } from "node:stream";
import type { PrismaService } from "@/shared/infrastructure/persistence/prisma/prisma.service";
import type { BackupStorage, StagedBackupObject } from "../domain/backup-storage.port";

type TransactionFn = (tx: Prisma.TransactionClient) => Promise<unknown>;

function bound<T extends object>(target: T, prop: string | symbol) {
  const value = Reflect.get(target, prop) as unknown;
  return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
}

export interface CompletionHook {
  /** Runs inside the completion transaction, with the Member lock held. */
  inside?: () => Promise<void>;
  /** "before": the AVAILABLE update fails (rolled back); "after": the transaction commits and then reports a failure. */
  fail?: "before" | "after";
}

/**
 * Intercepts, once, the transaction that marks an upload AVAILABLE (the one
 * whose `updateMany` sets `status: "AVAILABLE"`). Other transactions pass
 * through untouched. Restores itself after that transaction.
 */
export function interceptCompletion(prisma: PrismaService, hook: CompletionHook) {
  const original = prisma.$transaction.bind(prisma) as unknown as (fn: TransactionFn) => Promise<unknown>;
  const spy = jest.spyOn(prisma, "$transaction").mockImplementation((async (fn: TransactionFn) => {
    let completion = false;
    try {
      const result = await original(async (tx) => {
        const metadata = new Proxy(tx.backupMetadata, {
          get(target, prop) {
            if (prop !== "updateMany") return bound(target, prop);
            return async (args: { data?: { status?: string } }) => {
              if (args.data?.status === "AVAILABLE") {
                completion = true;
                await hook.inside?.();
                if (hook.fail === "before") throw new Error("simulated AVAILABLE update failure");
              }
              return target.updateMany(args as never);
            };
          },
        });
        const client = new Proxy(tx, {
          get: (target, prop) => (prop === "backupMetadata" ? metadata : bound(target, prop)),
        });
        return fn(client);
      });
      if (completion && hook.fail === "after")
        throw new Error("connection lost after commit (simulated)");
      return result;
    } finally {
      if (completion) spy.mockRestore();
    }
  }) as never);
  return spy;
}

/**
 * Makes the next `commit()` of the storage wait until `release()`.
 * `reached` resolves when the upload is waiting there (bytes verified and
 * staged, row still UPLOADING).
 */
export function gateCommit(storage: BackupStorage) {
  let release!: () => void;
  let reached!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const atGate = new Promise<void>((resolve) => (reached = resolve));
  const originalStage = storage.stage.bind(storage);
  const spy = jest.spyOn(storage, "stage").mockImplementationOnce(async (key: string, source: Readable) => {
    const staged: StagedBackupObject = await originalStage(key, source);
    return {
      commit: async () => {
        reached();
        await released;
        return staged.commit();
      },
      discard: () => staged.discard(),
    };
  });
  return { reached: atGate, release, spy };
}
