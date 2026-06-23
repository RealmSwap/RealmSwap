import type { GameDefinitionSpec } from "./types";

export function parseSpec(json: string): GameDefinitionSpec {
  return JSON.parse(json) as GameDefinitionSpec;
}

export function stringifySpec(spec: GameDefinitionSpec): string {
  return JSON.stringify(spec);
}

export function parseParamValues(json: string | null): Record<string, string | number | boolean> {
  if (!json) return {};
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function stringifyParamValues(values: Record<string, string | number | boolean>): string {
  return JSON.stringify(values ?? {});
}
