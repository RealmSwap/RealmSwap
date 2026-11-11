import { prisma } from "@/lib/db";

/**
 * Install-wide settings (AppSetting rows): choices that belong to this
 * machine rather than to a user or a server. Values are stored as JSON so a
 * key can hold a boolean, a string, or a small object.
 */

/** Read a setting; a missing row or unreadable value yields the fallback. */
export async function getAppSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } });
    return row ? (JSON.parse(row.value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function setAppSetting(key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: json },
    update: { value: json },
  });
}
