import { prisma } from "@/lib/db";
import { upsertBuiltinDefinitions } from "./seed";

let seededPromise: Promise<void> | null = null;

export function ensureBuiltinsSeeded(): Promise<void> {
  if (!seededPromise) {
    seededPromise = upsertBuiltinDefinitions(prisma).catch((e) => {
      seededPromise = null; // allow retry on next request if it failed
      throw e;
    });
  }
  return seededPromise;
}
