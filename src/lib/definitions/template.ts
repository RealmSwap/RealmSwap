import type { ArgSpec, DefinitionContext } from "./types";

const VAR_RE = /\{([a-zA-Z0-9_]+)\}/g;

export function renderTemplate(input: string, ctx: DefinitionContext): string {
  return input.replace(VAR_RE, (_m, key: string) => {
    if (!(key in ctx)) throw new Error(`Unknown template variable: {${key}}`);
    return String((ctx as Record<string, unknown>)[key]);
  });
}

export function collectVariables(input: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  VAR_RE.lastIndex = 0;
  while ((m = VAR_RE.exec(input)) !== null) out.add(m[1]);
  return Array.from(out);
}

export function renderArgs(args: ArgSpec[], ctx: DefinitionContext): string[] {
  const out: string[] = [];
  for (const a of args) {
    if (typeof a === "string") {
      out.push(renderTemplate(a, ctx));
    } else {
      const guard = renderTemplate(`{${a.includeWhen}}`, ctx).trim();
      if (guard !== "") out.push(...a.value.map((v) => renderTemplate(v, ctx)));
    }
  }
  return out;
}
