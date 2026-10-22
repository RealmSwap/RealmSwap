import { prisma } from "./db";
import { Prisma } from "../generated/client";
import { isEncrypted } from "./secretBox";

let migratePromise: Promise<void> | null = null;

/**
 * One-shot (per process) migration: encrypt any Server secrets that are still
 * stored as pre-encryption plaintext. Rows written after the Prisma-boundary
 * encryption landed are already `enc:v1:` — this catches existing installs.
 *
 * The read is raw SQL on purpose: the query extension transparently decrypts
 * on read, so it can't tell plaintext from ciphertext. The write goes through
 * the extended client, which encrypts.
 */
export function ensureServerSecretsEncrypted(): Promise<void> {
  if (!migratePromise) {
    migratePromise = migrateServerSecrets().catch((e) => {
      migratePromise = null; // allow retry on the next request
      throw e;
    });
  }
  return migratePromise;
}

async function migrateServerSecrets(): Promise<void> {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; password: string | null; rconPassword: string | null; sftpPassword: string | null }>>(
      Prisma.sql`SELECT id, password, "rconPassword", "sftpPassword" FROM Server`
    );

    for (const row of rows) {
      const needsEncryption = [row.password, row.rconPassword, row.sftpPassword].some(
        (v) => v != null && v !== "" && !isEncrypted(v)
      );
      if (!needsEncryption) continue;

      const fresh = await prisma.server.findUnique({ where: { id: row.id } });
      if (!fresh) continue;
      await prisma.server.update({
        where: { id: row.id },
        data: {
          password: fresh.password,
          rconPassword: fresh.rconPassword,
          sftpPassword: fresh.sftpPassword,
        },
      });
      console.log(`[Secrets Migration] Encrypted stored secrets for server ${row.id}`);
    }
  } catch (err) {
    console.error("[Secrets Migration] failed:", err);
  }
}
