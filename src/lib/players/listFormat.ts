import type { PlayerIdentityKey, PlayerListFileFormat } from "@/lib/definitions/types";

type Op = "add" | "remove";

export function resolvePlayerId(
  player: { steamId?: string | null; xboxId?: string | null; minecraftUuid?: string | null; minecraftName?: string | null },
  identity: PlayerIdentityKey,
): string | null {
  const v = player[identity];
  return v && v.trim() !== "" ? v : null;
}

export function renderConsole(template: string, vars: { id: string; reason?: string }): string {
  return template
    .replace(/\{id\}/g, vars.id)
    .replace(/\{reason\}/g, vars.reason ?? "")
    .trim();
}

export function mergeListFile(
  existing: string,
  id: string,
  op: Op,
  format: PlayerListFileFormat,
  field?: string,
): string {
  if (format === "lineList") return mergeLineList(existing, id, op);
  return mergeJsonArray(existing, id, op, field);
}

function mergeLineList(existing: string, id: string, op: Op): string {
  const lines = existing.split(/\r?\n/).filter((l) => l.trim() !== "");
  const kept = lines.filter((l) => l.trim() !== id);
  if (op === "add") kept.push(id);
  return kept.length ? kept.join("\n") + "\n" : "";
}

function mergeJsonArray(existing: string, id: string, op: Op, field?: string): string {
  let arr: unknown[] = [];
  try {
    const parsed = JSON.parse(existing);
    if (Array.isArray(parsed)) arr = parsed;
  } catch {
    arr = [];
  }
  const matches = (entry: unknown) =>
    field
      ? (entry as Record<string, unknown>)?.[field] === id
      : entry === id;
  arr = arr.filter((e) => !matches(e));
  if (op === "add") arr.push(field ? { [field]: id } : id);
  return JSON.stringify(arr, null, 2);
}
