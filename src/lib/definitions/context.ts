import type { DefinitionContext, GameDefinitionSpec } from "./types";
import { parseParamValues } from "./serialize";

export function buildContext(input: {
  name: string;
  password: string | null;
  port: number;
  ram: number;
  paramValuesJson: string | null;
  spec: GameDefinitionSpec;
}): DefinitionContext {
  const { name, password, port, ram, paramValuesJson, spec } = input;

  let pw = password ?? "";
  const policy = spec.passwordPolicy;
  if (policy?.minLength != null && pw.length < policy.minLength) {
    pw = policy.fallback ?? "";
  }

  const ctx: DefinitionContext = {
    name,
    nameSanitized: name.replace(/[^a-zA-Z0-9]/g, "_"),
    password: pw,
    passwordEmpty: pw ? "" : "1",
    port,
    ram,
  };

  for (const p of spec.params) {
    if (p.default !== undefined) ctx[p.key] = p.default;
  }
  const stored = parseParamValues(paramValuesJson);
  for (const [k, v] of Object.entries(stored)) ctx[k] = v;

  return ctx;
}
