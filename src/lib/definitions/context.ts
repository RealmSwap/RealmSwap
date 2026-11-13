import type { DefinitionContext, GameDefinitionSpec } from "./types";
import { parseParamValues } from "./serialize";

export function buildContext(input: {
  name: string;
  password: string | null;
  port: number;
  ram: number;
  paramValuesJson: string | null;
  spec: GameDefinitionSpec;
  // Per-server RCON settings (Server.rconPort/rconPassword). Callers that
  // re-render config files must pass these so RCON lines survive the rewrite;
  // callers that only plan ports/args may omit them.
  rconPort?: number | null;
  rconPassword?: string | null;
}): DefinitionContext {
  const { name, password, port, ram, paramValuesJson, spec } = input;

  let pw = password ?? "";
  const policy = spec.passwordPolicy;
  if (policy?.minLength != null && pw.length < policy.minLength) {
    pw = policy.fallback ?? "";
  }

  // RCON is opt-in. Templates that reference {rconEnabled}/{rconPort}/
  // {rconPassword} (Minecraft server.properties) must always render, so an
  // unconfigured server renders the game's own disabled defaults.
  const rconConfigured = input.rconPort != null && !!input.rconPassword;

  const ctx: DefinitionContext = {
    name,
    nameSanitized: name.replace(/[^a-zA-Z0-9]/g, "_"),
    password: pw,
    passwordEmpty: pw ? "" : "1",
    port,
    ram,
    rconEnabled: rconConfigured ? "true" : "false",
    rconPort: input.rconPort ?? 25575,
    rconPassword: input.rconPassword ?? "",
  };

  for (const p of spec.params) {
    if (p.default !== undefined) ctx[p.key] = p.default;
  }
  const stored = parseParamValues(paramValuesJson);
  for (const [k, v] of Object.entries(stored)) ctx[k] = v;

  return ctx;
}
