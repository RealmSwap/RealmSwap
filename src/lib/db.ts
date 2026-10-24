import { PrismaClient } from "../generated/client";
import { encryptSecret, decryptSecret, SERVER_SECRET_FIELDS, S3_SECRET_FIELDS, AGENT_NODE_SECRET_FIELDS } from "./secretBox";

// In packaged Electron the main process sets DATABASE_URL to the userData DB
// before this module loads. In dev / tests it is usually unset, so default to
// the original local file to preserve existing behavior.
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === "") {
  process.env.DATABASE_URL = "file:./dev.db";
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

// Secrets (Server.password / rconPassword / sftpPassword and the S3Setting
// credential pair) are encrypted at rest via a Prisma query extension: every
// write encrypts, every read decrypts, so call sites keep handling plaintext
// and no reader can forget. Raw $queryRaw bypasses this — see
// migrateServerSecrets() for the one deliberate raw read.
function encryptWriteArgs(data: any, fields: readonly string[]): void {
  if (!data || typeof data !== "object") return;
  for (const field of fields) {
    if (data[field] !== undefined) data[field] = encryptSecret(data[field]);
  }
}

function decryptRow(row: any, fields: readonly string[]): void {
  if (!row || typeof row !== "object") return;
  for (const field of fields) {
    if (typeof row[field] === "string") row[field] = decryptSecret(row[field]);
  }
}

function secretModelExtension(fields: readonly string[]) {
  return {
    async $allOperations({ operation, args, query }: { operation: string; args: any; query: (args: any) => Promise<any> }) {
      if (operation === "create" || operation === "createMany" || operation === "update" || operation === "updateMany" || operation === "upsert") {
        encryptWriteArgs(args.data, fields);
        if (operation === "upsert") {
          encryptWriteArgs(args.create, fields);
          encryptWriteArgs(args.update, fields);
        }
      }
      const result = await query(args);
      if (Array.isArray(result)) result.forEach((row: any) => decryptRow(row, fields));
      else decryptRow(result, fields);
      return result;
    },
  };
}

function createPrismaClient() {
  const base = new PrismaClient();
  return base.$extends({
    query: {
      server: secretModelExtension(SERVER_SECRET_FIELDS),
      s3Setting: secretModelExtension(S3_SECRET_FIELDS),
      agentNode: secretModelExtension(AGENT_NODE_SECRET_FIELDS),
    },
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
