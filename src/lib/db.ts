import { PrismaClient } from "../generated/client";

// In packaged Electron the main process sets DATABASE_URL to the userData DB
// before this module loads. In dev / tests it is usually unset, so default to
// the original local file to preserve existing behavior.
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === "") {
  process.env.DATABASE_URL = "file:./dev.db";
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
