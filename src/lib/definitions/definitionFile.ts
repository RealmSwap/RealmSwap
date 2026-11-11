import type { GameDefinitionSpec } from "./types";
import { vetUntrustedSpec, type UntrustedDefinitionSummary, type UntrustedInstallMethod } from "./untrusted";

/**
 * A game definition as a file people can hand to each other. Opening one is
 * the same trust situation as deploying a stranger's realm, so both
 * directions go through the untrusted-definition gate: nothing is exported
 * that an import would refuse.
 */

export const DEFINITION_FILE_FORMAT = "realmswap-game-definition";
export const DEFINITION_FILE_VERSION = 1;
export const DEFINITION_FILE_SUFFIX = ".realmswap-game.json";
export const DEFINITION_FILE_MAX_BYTES = 256 * 1024;

export interface DefinitionFile {
  format: typeof DEFINITION_FILE_FORMAT;
  version: typeof DEFINITION_FILE_VERSION;
  definition: {
    displayName: string;
    description?: string;
    icon?: string;
    recommendedRamGB?: number;
    spec: GameDefinitionSpec;
  };
}

export interface ReadDefinition {
  displayName: string;
  description: string;
  icon: string;
  recommendedRamGB: number;
  requiredDiskGB: number;
  installMethod: UntrustedInstallMethod;
  spec: GameDefinitionSpec;
  summary: UntrustedDefinitionSummary;
}

export type DefinitionFileResult = ({ ok: true } & ReadDefinition) | { ok: false; errors: string[] };

const fail = (...errors: string[]): { ok: false; errors: string[] } => ({ ok: false, errors });

/** Build the shareable file for a stored definition, or say why it can't be shared. */
export function buildDefinitionFile(def: {
  displayName: string;
  description: string;
  icon: string;
  recommendedRamGB: number;
  installMethod: string;
  spec: string;
}): { ok: true; file: DefinitionFile } | { ok: false; errors: string[] } {
  if (def.installMethod === "CUSTOM_SCRIPT") {
    return fail("Script-based definitions can't be shared as files.");
  }
  let stored: unknown;
  try {
    stored = JSON.parse(def.spec);
  } catch {
    return fail("This definition's stored spec is not valid JSON.");
  }
  const vetted = vetUntrustedSpec(stored);
  if (!vetted.ok) return fail(...vetted.errors);
  return {
    ok: true,
    file: {
      format: DEFINITION_FILE_FORMAT,
      version: DEFINITION_FILE_VERSION,
      definition: {
        displayName: def.displayName,
        ...(def.description ? { description: def.description } : {}),
        icon: def.icon,
        recommendedRamGB: def.recommendedRamGB,
        spec: vetted.spec,
      },
    },
  };
}

/** Validate a parsed definition file of unknown provenance. */
export function readDefinitionFile(raw: unknown): DefinitionFileResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return fail("That file is not a RealmSwap game definition.");
  }
  const file = raw as Record<string, unknown>;
  if (file.format !== DEFINITION_FILE_FORMAT) {
    return fail("That file is not a RealmSwap game definition.");
  }
  if (file.version !== DEFINITION_FILE_VERSION) {
    return fail(
      `This definition file is format version ${String(file.version)}; this RealmSwap reads version ${DEFINITION_FILE_VERSION}. Update RealmSwap to import it.`
    );
  }
  const definition = file.definition;
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    return fail("The file has no definition in it.");
  }
  const d = definition as Record<string, unknown>;
  const displayName = typeof d.displayName === "string" ? d.displayName.trim() : "";
  if (!displayName || displayName.length > 80) {
    return fail("The definition needs a name of 1 to 80 characters.");
  }

  const vetted = vetUntrustedSpec(d.spec);
  if (!vetted.ok) return fail(...vetted.errors);

  const ram = typeof d.recommendedRamGB === "number" && d.recommendedRamGB >= 1 && d.recommendedRamGB <= 256 ? d.recommendedRamGB : 4;
  const disk = (vetted.spec.install as { requiredDiskGB?: number }).requiredDiskGB;
  return {
    ok: true,
    displayName,
    description: typeof d.description === "string" ? d.description.slice(0, 500) : "",
    icon: typeof d.icon === "string" && d.icon.length > 0 && d.icon.length <= 16 ? d.icon : "🎮",
    recommendedRamGB: ram,
    requiredDiskGB: typeof disk === "number" && disk > 0 ? disk : 3,
    installMethod: vetted.installMethod,
    spec: vetted.spec,
    summary: vetted.summary,
  };
}
