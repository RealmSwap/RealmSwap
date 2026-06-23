# Custom Server Definitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users define their own game server definitions (SteamCMD / download / custom script) for games GameVault doesn't ship, while unifying the 8 hardcoded built-in games onto one definition schema driven by a single data-driven launch engine.

**Architecture:** A new `GameDefinition` record (per-user private, or global built-in) stores all game metadata plus a JSON `spec`. Pure **planner** functions turn a definition + a server instance into descriptors (install plan, config-file plans, launch plan, port plan); a thin imperative shell in `localRunner.ts` executes them. The 8 built-ins are authored as definition specs and seeded idempotently; pure parity tests assert each planner reproduces today's hardcoded behavior exactly.

**Tech Stack:** Next.js 14 (App Router), React 18, Prisma 5.15 + SQLite, TypeScript 5.4, Vitest (added by this plan).

## Global Constraints

- **Storage:** `GameDefinition.spec`, `GameDefinition` install/launch data, and `Server.paramValues` are stored as **`String` columns containing JSON** — Prisma's SQLite connector does not support the `Json` scalar type. Always go through `src/lib/definitions/serialize.ts` to parse/stringify.
- **No shell string concatenation for launch:** rendered args are passed to `spawn(exe, argv[])` as an array. The Custom Script tab is the one explicit, acknowledged exception.
- **Ownership:** custom definitions are per-user private (`ownerId = user.id`); built-ins are global (`ownerId = null`, `isBuiltIn = true`). Built-ins are read-only via the API.
- **Admin gate:** `installMethod === "CUSTOM_SCRIPT"` may only be created/edited by users with `role === "ADMIN"`, enforced server-side (never trust the client).
- **Pre-release migration:** all existing `User` rows are backfilled to `role = "ADMIN"`; all existing `Server` rows get `definitionId` backfilled by matching `game` → built-in `slug`.
- **First registrant** (when user count is 0) is created with `role = "ADMIN"`; every later registration defaults to `"USER"`.
- **Slug uniqueness:** unique per owner — `@@unique([ownerId, slug])`. Built-ins live under `ownerId = null`.
- **Template variables** available everywhere a template is rendered: `{name}`, `{nameSanitized}`, `{password}`, `{port}`, `{ram}`, plus every declared custom param `key`.
- TypeScript strict mode is on (`tsconfig.json`); all new code must type-check via `npx tsc --noEmit`.

## Spec Shape (authoritative — refines the approved design doc)

During planning, the engine grew typed discriminators to reach byte-exact built-in parity. Custom user definitions only ever use the simple cases (`configFiles[].strategy = "template"`, plain string args). The named strategies exist solely so the legacy built-ins remain exact.

```ts
// src/lib/definitions/types.ts
export type InstallMethod = "STEAMCMD" | "DOWNLOAD" | "CUSTOM_SCRIPT";
export type ParamType = "text" | "number" | "boolean" | "enum";
export type Protocol = "TCP" | "UDP";
export type ConfigStrategy = "template" | "enshroudedJson" | "zomboidIniMerge";

export interface ParamSpec {
  key: string;            // identifier; usable in templates as {key}
  label: string;
  type: ParamType;
  default?: string | number | boolean;
  options?: string[];     // required when type === "enum"
  min?: number;           // number only
  max?: number;           // number only
  required?: boolean;
}

// An arg is either a literal/template string, or a conditional group that is
// only included when the referenced variable renders non-empty.
export type ArgSpec = string | { value: string[]; includeWhen: string };

export interface ConfigFileSpec {
  path: string;                 // relative to the server install dir (see installSubDir)
  strategy: ConfigStrategy;
  template?: string;            // required when strategy === "template"
}

export interface PortSpec { protocol: Protocol; port: string; } // port is a template, e.g. "{port}" or "2457"

export interface StdoutPattern { regex: string; updateField: "ipAddress"; transform?: "joinCode"; }

export interface PasswordPolicy { minLength?: number; fallback?: string; }

export interface SteamcmdInstall { appId: string; installSubDir: string; checkFile: string; requiredDiskGB: number; }
export interface DownloadInstall { url: string; fileName: string; checkFile: string; installSubDir?: string; unzip?: boolean; }
export interface ScriptInstall { installScript: string; }

export interface LaunchSpec {
  executable: string;           // e.g. "valheim_server.exe" or "java" or "cmd.exe"
  args: ArgSpec[];
  cwdSubDir?: string;           // working dir relative to the server base dir; defaults to installSubDir or base
  env?: Record<string, string>;
  stdoutPatterns?: StdoutPattern[];
  stdinStopCommand?: string;    // e.g. "stop\n" for Minecraft graceful shutdown
  launchScript?: string;        // CUSTOM_SCRIPT only (mutually exclusive with executable/args)
}

export interface GameDefinitionSpec {
  install: SteamcmdInstall | DownloadInstall | ScriptInstall; // shape matches GameDefinition.installMethod
  launch: LaunchSpec;
  defaultPort: number;          // written to Server.port at creation
  params: ParamSpec[];
  configFiles: ConfigFileSpec[];
  editableConfigPath?: string;  // relative path the post-create config editor opens
  ports: PortSpec[];            // UPnP mappings
  requiresJava?: boolean;       // pre-launch JRE check (Minecraft)
  passwordPolicy?: PasswordPolicy; // fixed-field password fallback/min-length (Valheim, Rust)
}

export interface DefinitionContext {
  name: string;
  nameSanitized: string;        // name with [^a-zA-Z0-9] -> "_"
  password: string;             // after passwordPolicy applied
  port: number;
  ram: number;
  [paramKey: string]: string | number | boolean;
}
```

---

### Task 1: Add Vitest test runner

**Files:**
- Modify: `package.json` (devDependencies + `test` script)
- Create: `vitest.config.ts`
- Create: `src/lib/definitions/__tests__/smoke.test.ts`

**Interfaces:**
- Produces: a working `npm test` command (Vitest, node environment) used by every later task.

- [ ] **Step 1: Install Vitest**

Run:
```bash
rtk npm install -D vitest@^1.6.0
```
Expected: `vitest` appears under devDependencies; no errors.

- [ ] **Step 2: Add the test script**

Modify `package.json` scripts block to add:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create Vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

- [ ] **Step 4: Write a smoke test**

Create `src/lib/definitions/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("vitest", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it and verify it passes**

Run: `rtk npm test`
Expected: 1 passed.

- [ ] **Step 6: Commit**
```bash
rtk git add package.json package-lock.json vitest.config.ts src/lib/definitions/__tests__/smoke.test.ts
rtk git commit -m "test: add vitest runner"
```

---

### Task 2: Definition types

**Files:**
- Create: `src/lib/definitions/types.ts`

**Interfaces:**
- Produces: all interfaces listed in the "Spec Shape" section above (`GameDefinitionSpec`, `ParamSpec`, `LaunchSpec`, `ArgSpec`, `ConfigFileSpec`, `PortSpec`, `DefinitionContext`, `InstallMethod`, etc.). Later tasks import from here.

- [ ] **Step 1: Create the types file**

Create `src/lib/definitions/types.ts` with the exact contents of the "Spec Shape" code block above (the full set of exported types).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**
```bash
rtk git add src/lib/definitions/types.ts
rtk git commit -m "feat: add game definition type model"
```

---

### Task 3: JSON serialize/parse helpers

**Files:**
- Create: `src/lib/definitions/serialize.ts`
- Create: `src/lib/definitions/__tests__/serialize.test.ts`

**Interfaces:**
- Consumes: `GameDefinitionSpec` from `types.ts`.
- Produces:
  - `parseSpec(json: string): GameDefinitionSpec`
  - `stringifySpec(spec: GameDefinitionSpec): string`
  - `parseParamValues(json: string | null): Record<string, string | number | boolean>`
  - `stringifyParamValues(values: Record<string, string | number | boolean>): string`

- [ ] **Step 1: Write failing tests**

Create `src/lib/definitions/__tests__/serialize.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseSpec, stringifySpec, parseParamValues, stringifyParamValues } from "../serialize";

describe("serialize", () => {
  it("round-trips a spec", () => {
    const spec = stringifySpec({
      install: { appId: "1", installSubDir: "x", checkFile: "x.exe", requiredDiskGB: 1 },
      launch: { executable: "x.exe", args: ["-port", "{port}"] },
      defaultPort: 1234, params: [], configFiles: [], ports: [],
    } as any);
    expect(parseSpec(spec).defaultPort).toBe(1234);
  });

  it("parses null param values to empty object", () => {
    expect(parseParamValues(null)).toEqual({});
  });

  it("round-trips param values", () => {
    const json = stringifyParamValues({ difficulty: "hard", slots: 8, pvp: true });
    expect(parseParamValues(json)).toEqual({ difficulty: "hard", slots: 8, pvp: true });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `rtk npm test -- serialize`
Expected: FAIL — cannot find module `../serialize`.

- [ ] **Step 3: Implement**

Create `src/lib/definitions/serialize.ts`:
```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `rtk npm test -- serialize`
Expected: 3 passed.

- [ ] **Step 5: Commit**
```bash
rtk git add src/lib/definitions/serialize.ts src/lib/definitions/__tests__/serialize.test.ts
rtk git commit -m "feat: add definition json serialization helpers"
```

---

### Task 4: Template rendering engine

**Files:**
- Create: `src/lib/definitions/template.ts`
- Create: `src/lib/definitions/__tests__/template.test.ts`

**Interfaces:**
- Consumes: `DefinitionContext`, `ArgSpec` from `types.ts`.
- Produces:
  - `renderTemplate(input: string, ctx: DefinitionContext): string` — replaces every `{key}` with `String(ctx[key])`; throws `Error("Unknown template variable: {key}")` if a referenced key is absent from `ctx`.
  - `collectVariables(input: string): string[]` — returns the `{key}` names referenced in a string.
  - `renderArgs(args: ArgSpec[], ctx: DefinitionContext): string[]` — renders literal/template strings; for `{ value, includeWhen }` groups, renders every entry only if `renderTemplate("{includeWhen}", ctx)` is non-empty (after trim), else omits the whole group.

- [ ] **Step 1: Write failing tests**

Create `src/lib/definitions/__tests__/template.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { renderTemplate, collectVariables, renderArgs } from "../template";

const ctx: any = { name: "My World", nameSanitized: "My_World", password: "secret", port: 2456, ram: 4 };

describe("renderTemplate", () => {
  it("substitutes known variables", () => {
    expect(renderTemplate("-port {port} -name {name}", ctx)).toBe("-port 2456 -name My World");
  });
  it("supports concatenation", () => {
    expect(renderTemplate("{password}_admin", ctx)).toBe("secret_admin");
  });
  it("throws on unknown variable", () => {
    expect(() => renderTemplate("{nope}", ctx)).toThrow(/Unknown template variable/);
  });
});

describe("collectVariables", () => {
  it("lists referenced variables", () => {
    expect(collectVariables("{a} text {b}{a}").sort()).toEqual(["a", "b"]);
  });
});

describe("renderArgs", () => {
  it("renders literal and template args", () => {
    expect(renderArgs(["-port", "{port}"], ctx)).toEqual(["-port", "2456"]);
  });
  it("includes a conditional group when the variable is non-empty", () => {
    expect(renderArgs([{ value: ["-pass", "{password}"], includeWhen: "password" }], ctx)).toEqual(["-pass", "secret"]);
  });
  it("omits a conditional group when the variable is empty", () => {
    expect(renderArgs([{ value: ["-pass", "{password}"], includeWhen: "password" }], { ...ctx, password: "" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `rtk npm test -- template`
Expected: FAIL — cannot find module `../template`.

- [ ] **Step 3: Implement**

Create `src/lib/definitions/template.ts`:
```ts
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
  return [...out];
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
```

- [ ] **Step 4: Run to verify pass**

Run: `rtk npm test -- template`
Expected: all passed.

- [ ] **Step 5: Commit**
```bash
rtk git add src/lib/definitions/template.ts src/lib/definitions/__tests__/template.test.ts
rtk git commit -m "feat: add definition template rendering engine"
```

---

### Task 5: Build launch context from a server + spec

**Files:**
- Create: `src/lib/definitions/context.ts`
- Create: `src/lib/definitions/__tests__/context.test.ts`

**Interfaces:**
- Consumes: `GameDefinitionSpec`, `DefinitionContext`, `PasswordPolicy` from `types.ts`; `parseParamValues` from `serialize.ts`.
- Produces:
  - `buildContext(input: { name: string; password: string | null; port: number; ram: number; paramValuesJson: string | null; spec: GameDefinitionSpec }): DefinitionContext`
  - Behavior: sets `nameSanitized = name.replace(/[^a-zA-Z0-9]/g, "_")`; applies `spec.passwordPolicy` (if `password` is empty or shorter than `minLength`, use `fallback ?? ""`); merges declared param defaults then the stored param values; numbers/booleans preserved.

- [ ] **Step 1: Write failing tests**

Create `src/lib/definitions/__tests__/context.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildContext } from "../context";

const baseSpec: any = { install: {}, launch: { executable: "x", args: [] }, defaultPort: 1, params: [], configFiles: [], ports: [] };

describe("buildContext", () => {
  it("sanitizes the name", () => {
    const ctx = buildContext({ name: "My World!", password: null, port: 1, ram: 4, paramValuesJson: null, spec: baseSpec });
    expect(ctx.nameSanitized).toBe("My_World_");
  });

  it("applies password fallback when too short", () => {
    const spec = { ...baseSpec, passwordPolicy: { minLength: 5, fallback: "viking123" } };
    const ctx = buildContext({ name: "x", password: "abc", port: 1, ram: 4, paramValuesJson: null, spec });
    expect(ctx.password).toBe("viking123");
  });

  it("keeps a valid password", () => {
    const spec = { ...baseSpec, passwordPolicy: { minLength: 5, fallback: "viking123" } };
    const ctx = buildContext({ name: "x", password: "longenough", port: 1, ram: 4, paramValuesJson: null, spec });
    expect(ctx.password).toBe("longenough");
  });

  it("merges param defaults then stored values", () => {
    const spec = { ...baseSpec, params: [{ key: "slots", label: "Slots", type: "number", default: 8 }] };
    const ctx = buildContext({ name: "x", password: "", port: 1, ram: 4, paramValuesJson: JSON.stringify({ slots: 16 }), spec });
    expect(ctx.slots).toBe(16);
  });

  it("falls back to param default when no stored value", () => {
    const spec = { ...baseSpec, params: [{ key: "slots", label: "Slots", type: "number", default: 8 }] };
    const ctx = buildContext({ name: "x", password: "", port: 1, ram: 4, paramValuesJson: null, spec });
    expect(ctx.slots).toBe(8);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `rtk npm test -- context`
Expected: FAIL — cannot find module `../context`.

- [ ] **Step 3: Implement**

Create `src/lib/definitions/context.ts`:
```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `rtk npm test -- context`
Expected: all passed.

- [ ] **Step 5: Commit**
```bash
rtk git add src/lib/definitions/context.ts src/lib/definitions/__tests__/context.test.ts
rtk git commit -m "feat: build definition launch context from server + spec"
```

---

### Task 6: Spec & param-value validation

**Files:**
- Create: `src/lib/definitions/validate.ts`
- Create: `src/lib/definitions/__tests__/validate.test.ts`

**Interfaces:**
- Consumes: `GameDefinitionSpec`, `InstallMethod`, `ParamSpec` from `types.ts`; `collectVariables`, `renderTemplate` from `template.ts`.
- Produces:
  - `KNOWN_FIXED_VARS = ["name", "nameSanitized", "password", "port", "ram"] as const`
  - `validateSpec(spec: GameDefinitionSpec, installMethod: InstallMethod): string[]` — returns a list of human-readable error strings (empty = valid). Checks: required install fields per method; `launch.executable` present unless CUSTOM_SCRIPT with `launchScript`; every `{var}` in args/config templates/ports/env resolves to a fixed var or a declared param key; enum params declare `options`; `ports[].port` renders to a valid 1–65535 number when params use their defaults; `defaultPort` in range.
  - `validateParamValues(params: ParamSpec[], values: Record<string, unknown>): string[]` — type/range/enum/required checks.

- [ ] **Step 1: Write failing tests**

Create `src/lib/definitions/__tests__/validate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateSpec, validateParamValues } from "../validate";

const okSpec: any = {
  install: { appId: "1", installSubDir: "x", checkFile: "x.exe", requiredDiskGB: 1 },
  launch: { executable: "x.exe", args: ["-port", "{port}", "-name", "{name}"] },
  defaultPort: 2456, params: [], configFiles: [], ports: [{ protocol: "UDP", port: "{port}" }],
};

describe("validateSpec", () => {
  it("accepts a valid steamcmd spec", () => {
    expect(validateSpec(okSpec, "STEAMCMD")).toEqual([]);
  });
  it("rejects an unknown template variable", () => {
    const bad = { ...okSpec, launch: { executable: "x.exe", args: ["{bogus}"] } };
    expect(validateSpec(bad, "STEAMCMD").join()).toMatch(/bogus/);
  });
  it("accepts a declared param used in args", () => {
    const spec = { ...okSpec, params: [{ key: "slots", label: "Slots", type: "number", default: 8 }], launch: { executable: "x.exe", args: ["-players", "{slots}"] } };
    expect(validateSpec(spec, "STEAMCMD")).toEqual([]);
  });
  it("requires appId for steamcmd", () => {
    const bad = { ...okSpec, install: { installSubDir: "x", checkFile: "x.exe", requiredDiskGB: 1 } };
    expect(validateSpec(bad, "STEAMCMD").join()).toMatch(/appId/i);
  });
  it("requires options for enum params", () => {
    const spec = { ...okSpec, params: [{ key: "mode", label: "Mode", type: "enum" }] };
    expect(validateSpec(spec, "STEAMCMD").join()).toMatch(/options/i);
  });
});

describe("validateParamValues", () => {
  const params: any = [
    { key: "slots", label: "Slots", type: "number", min: 1, max: 32, required: true },
    { key: "mode", label: "Mode", type: "enum", options: ["pve", "pvp"] },
  ];
  it("accepts valid values", () => {
    expect(validateParamValues(params, { slots: 8, mode: "pvp" })).toEqual([]);
  });
  it("rejects out-of-range number", () => {
    expect(validateParamValues(params, { slots: 99 }).join()).toMatch(/slots/);
  });
  it("rejects bad enum", () => {
    expect(validateParamValues(params, { slots: 8, mode: "x" }).join()).toMatch(/mode/);
  });
  it("rejects missing required", () => {
    expect(validateParamValues(params, {}).join()).toMatch(/slots/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `rtk npm test -- validate`
Expected: FAIL — cannot find module `../validate`.

- [ ] **Step 3: Implement**

Create `src/lib/definitions/validate.ts`:
```ts
import type { GameDefinitionSpec, InstallMethod, ParamSpec, ArgSpec } from "./types";
import { collectVariables } from "./template";

export const KNOWN_FIXED_VARS = ["name", "nameSanitized", "password", "port", "ram"] as const;

function argStrings(args: ArgSpec[]): string[] {
  return args.flatMap((a) => (typeof a === "string" ? [a] : [...a.value, `{${a.includeWhen}}`]));
}

export function validateSpec(spec: GameDefinitionSpec, installMethod: InstallMethod): string[] {
  const errors: string[] = [];
  const known = new Set<string>([...KNOWN_FIXED_VARS, ...spec.params.map((p) => p.key)]);

  const inst = spec.install as any;
  if (installMethod === "STEAMCMD") {
    for (const f of ["appId", "installSubDir", "checkFile", "requiredDiskGB"]) {
      if (inst[f] === undefined || inst[f] === "") errors.push(`Steam install requires "${f}".`);
    }
  } else if (installMethod === "DOWNLOAD") {
    for (const f of ["url", "fileName", "checkFile"]) {
      if (!inst[f]) errors.push(`Download install requires "${f}".`);
    }
  } else if (installMethod === "CUSTOM_SCRIPT") {
    if (!inst.installScript) errors.push(`Custom script install requires "installScript".`);
  }

  if (installMethod === "CUSTOM_SCRIPT" && spec.launch.launchScript) {
    // ok — script launch
  } else if (!spec.launch.executable) {
    errors.push(`Launch requires an "executable".`);
  }

  const templated: string[] = [
    ...argStrings(spec.launch.args ?? []),
    ...Object.values(spec.launch.env ?? {}),
    ...spec.configFiles.map((c) => c.template ?? ""),
    ...spec.ports.map((p) => p.port),
  ];
  for (const t of templated) {
    for (const v of collectVariables(t)) {
      if (!known.has(v)) errors.push(`Unknown template variable {${v}} (not a fixed field or declared param).`);
    }
  }

  for (const p of spec.params) {
    if (p.type === "enum" && (!p.options || p.options.length === 0)) {
      errors.push(`Param "${p.key}" is an enum and must declare options.`);
    }
  }

  if (!(spec.defaultPort >= 1 && spec.defaultPort <= 65535)) {
    errors.push(`defaultPort must be between 1 and 65535.`);
  }

  return errors;
}

export function validateParamValues(params: ParamSpec[], values: Record<string, unknown>): string[] {
  const errors: string[] = [];
  for (const p of params) {
    const v = values[p.key];
    const missing = v === undefined || v === null || v === "";
    if (missing) {
      if (p.required) errors.push(`Param "${p.key}" is required.`);
      continue;
    }
    if (p.type === "number") {
      const n = Number(v);
      if (Number.isNaN(n)) errors.push(`Param "${p.key}" must be a number.`);
      else if (p.min != null && n < p.min) errors.push(`Param "${p.key}" must be >= ${p.min}.`);
      else if (p.max != null && n > p.max) errors.push(`Param "${p.key}" must be <= ${p.max}.`);
    } else if (p.type === "boolean") {
      if (typeof v !== "boolean") errors.push(`Param "${p.key}" must be a boolean.`);
    } else if (p.type === "enum") {
      if (!p.options?.includes(String(v))) errors.push(`Param "${p.key}" must be one of: ${p.options?.join(", ")}.`);
    }
  }
  return errors;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `rtk npm test -- validate`
Expected: all passed.

- [ ] **Step 5: Commit**
```bash
rtk git add src/lib/definitions/validate.ts src/lib/definitions/__tests__/validate.test.ts
rtk git commit -m "feat: add definition spec and param validation"
```

---

### Task 7: Pure planners (install / config / launch / ports)

**Files:**
- Create: `src/lib/definitions/plan.ts`
- Create: `src/lib/definitions/__tests__/plan.test.ts`

**Interfaces:**
- Consumes: types from `types.ts`; `renderTemplate`, `renderArgs` from `template.ts`.
- Produces (all pure — no fs/network/spawn):
  - `interface InstallPlan { method: InstallMethod; appId?: string; installSubDir?: string; checkFile?: string; requiredDiskGB?: number; url?: string; fileName?: string; unzip?: boolean; installScript?: string; }`
  - `interface ConfigFilePlan { relPath: string; strategy: ConfigStrategy; content?: string; }`  (content present only for `strategy === "template"`)
  - `interface LaunchPlan { executable: string; args: string[]; cwdSubDir?: string; env?: Record<string,string>; stdoutPatterns?: StdoutPattern[]; stdinStopCommand?: string; launchScript?: string; }`
  - `interface PortPlan { protocol: Protocol; port: number; }`
  - `planInstall(spec, installMethod): InstallPlan`
  - `planConfigFiles(spec, ctx): ConfigFilePlan[]` (renders `template` strategy; leaves `enshroudedJson`/`zomboidIniMerge` content undefined — the shell handles those)
  - `planLaunch(spec, ctx): LaunchPlan`
  - `planPorts(spec, ctx): PortPlan[]`

- [ ] **Step 1: Write failing tests**

Create `src/lib/definitions/__tests__/plan.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { planInstall, planConfigFiles, planLaunch, planPorts } from "../plan";

const ctx: any = { name: "Viking Realm", nameSanitized: "Viking_Realm", password: "secret", port: 2456, ram: 6 };
const spec: any = {
  install: { appId: "896660", installSubDir: "valheim-server", checkFile: "valheim_server.exe", requiredDiskGB: 2.5 },
  launch: { executable: "valheim_server.exe", args: ["-port", "{port}", { value: ["-pass", "{password}"], includeWhen: "password" }], cwdSubDir: "valheim-server" },
  defaultPort: 2456, params: [],
  configFiles: [{ path: "server.properties", strategy: "template", template: "motd={name}\n" }],
  ports: [{ protocol: "UDP", port: "{port}" }, { protocol: "UDP", port: "2457" }],
};

describe("planners", () => {
  it("plans a steamcmd install", () => {
    expect(planInstall(spec, "STEAMCMD")).toEqual({
      method: "STEAMCMD", appId: "896660", installSubDir: "valheim-server",
      checkFile: "valheim_server.exe", requiredDiskGB: 2.5,
    });
  });
  it("renders template config files", () => {
    expect(planConfigFiles(spec, ctx)).toEqual([{ relPath: "server.properties", strategy: "template", content: "motd=Viking Realm\n" }]);
  });
  it("renders launch args including conditional groups", () => {
    const p = planLaunch(spec, ctx);
    expect(p.executable).toBe("valheim_server.exe");
    expect(p.args).toEqual(["-port", "2456", "-pass", "secret"]);
    expect(p.cwdSubDir).toBe("valheim-server");
  });
  it("renders ports to numbers", () => {
    expect(planPorts(spec, ctx)).toEqual([{ protocol: "UDP", port: 2456 }, { protocol: "UDP", port: 2457 }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `rtk npm test -- plan`
Expected: FAIL — cannot find module `../plan`.

- [ ] **Step 3: Implement**

Create `src/lib/definitions/plan.ts`:
```ts
import type {
  GameDefinitionSpec, InstallMethod, DefinitionContext,
  ConfigStrategy, Protocol, StdoutPattern,
} from "./types";
import { renderTemplate, renderArgs } from "./template";

export interface InstallPlan {
  method: InstallMethod;
  appId?: string; installSubDir?: string; checkFile?: string; requiredDiskGB?: number;
  url?: string; fileName?: string; unzip?: boolean;
  installScript?: string;
}
export interface ConfigFilePlan { relPath: string; strategy: ConfigStrategy; content?: string; }
export interface LaunchPlan {
  executable: string; args: string[]; cwdSubDir?: string;
  env?: Record<string, string>; stdoutPatterns?: StdoutPattern[];
  stdinStopCommand?: string; launchScript?: string;
}
export interface PortPlan { protocol: Protocol; port: number; }

export function planInstall(spec: GameDefinitionSpec, installMethod: InstallMethod): InstallPlan {
  const i = spec.install as any;
  if (installMethod === "STEAMCMD") {
    return { method: "STEAMCMD", appId: i.appId, installSubDir: i.installSubDir, checkFile: i.checkFile, requiredDiskGB: i.requiredDiskGB };
  }
  if (installMethod === "DOWNLOAD") {
    return { method: "DOWNLOAD", url: i.url, fileName: i.fileName, checkFile: i.checkFile, installSubDir: i.installSubDir, unzip: !!i.unzip };
  }
  return { method: "CUSTOM_SCRIPT", installScript: i.installScript };
}

export function planConfigFiles(spec: GameDefinitionSpec, ctx: DefinitionContext): ConfigFilePlan[] {
  return spec.configFiles.map((c) => {
    if (c.strategy === "template") {
      return { relPath: c.path, strategy: c.strategy, content: renderTemplate(c.template ?? "", ctx) };
    }
    return { relPath: c.path, strategy: c.strategy };
  });
}

export function planLaunch(spec: GameDefinitionSpec, ctx: DefinitionContext): LaunchPlan {
  const l = spec.launch;
  const env = l.env ? Object.fromEntries(Object.entries(l.env).map(([k, v]) => [k, renderTemplate(v, ctx)])) : undefined;
  return {
    executable: l.executable,
    args: renderArgs(l.args ?? [], ctx),
    cwdSubDir: l.cwdSubDir,
    env,
    stdoutPatterns: l.stdoutPatterns,
    stdinStopCommand: l.stdinStopCommand,
    launchScript: l.launchScript,
  };
}

export function planPorts(spec: GameDefinitionSpec, ctx: DefinitionContext): PortPlan[] {
  return spec.ports.map((p) => ({ protocol: p.protocol, port: parseInt(renderTemplate(p.port, ctx), 10) }));
}
```

- [ ] **Step 4: Run to verify pass**

Run: `rtk npm test -- plan`
Expected: all passed.

- [ ] **Step 5: Commit**
```bash
rtk git add src/lib/definitions/plan.ts src/lib/definitions/__tests__/plan.test.ts
rtk git commit -m "feat: add pure install/config/launch/port planners"
```

---

### Task 8: Author the 8 built-in definitions

**Files:**
- Create: `src/lib/definitions/builtins.ts`
- Create: `src/lib/definitions/__tests__/builtins.test.ts`

**Interfaces:**
- Consumes: types from `types.ts`; `validateSpec` from `validate.ts`.
- Produces:
  - `interface BuiltinDefinition { slug: string; displayName: string; icon: string; color: string; description: string; recommendedRamGB: number; installMethod: InstallMethod; spec: GameDefinitionSpec; }`
  - `BUILTIN_DEFINITIONS: BuiltinDefinition[]` — exactly 8 entries (`MINECRAFT, VALHEIM, ENSHROUDED, ZOMBOID, ARK, TERRARIA, PALWORLD, RUST`), each reproducing today's behavior. Catalog fields (`displayName`/`icon`/`color`/`description`/`recommendedRamGB`) come verbatim from the current `AVAILABLE_GAMES` array (`CreateServerView.tsx:30-39`).

The specs below are derived directly from `localRunner.ts` and must match it.

- [ ] **Step 1: Write the validation test first**

Create `src/lib/definitions/__tests__/builtins.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { BUILTIN_DEFINITIONS } from "../builtins";
import { validateSpec } from "../validate";

describe("builtin definitions", () => {
  it("has all 8 games", () => {
    expect(BUILTIN_DEFINITIONS.map((d) => d.slug).sort()).toEqual(
      ["ARK", "ENSHROUDED", "MINECRAFT", "PALWORLD", "RUST", "TERRARIA", "VALHEIM", "ZOMBOID"]
    );
  });
  it("every builtin spec validates", () => {
    for (const d of BUILTIN_DEFINITIONS) {
      expect(validateSpec(d.spec, d.installMethod), `${d.slug} should validate`).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `rtk npm test -- builtins`
Expected: FAIL — cannot find module `../builtins`.

- [ ] **Step 3: Implement the built-ins**

Create `src/lib/definitions/builtins.ts`:
```ts
import type { GameDefinitionSpec, InstallMethod } from "./types";

export interface BuiltinDefinition {
  slug: string; displayName: string; icon: string; color: string;
  description: string; recommendedRamGB: number;
  installMethod: InstallMethod; spec: GameDefinitionSpec;
}

export const BUILTIN_DEFINITIONS: BuiltinDefinition[] = [
  {
    slug: "MINECRAFT", displayName: "Minecraft", icon: "⛏️",
    color: "from-green-500 to-emerald-700 bg-green-500/10 border-green-500/30 text-green-400",
    description: "Block building & survival", recommendedRamGB: 4.0,
    installMethod: "DOWNLOAD",
    spec: {
      install: {
        url: "https://piston-data.mojang.com/v1/objects/8dd1a358e2c3885906f21b6dbec6d7cae504c86a/server.jar",
        fileName: "server.jar", checkFile: "server.jar",
      },
      requiresJava: true,
      launch: {
        executable: "java",
        args: ["-Xms512M", "-Xmx{ram}G", "-jar", "server.jar", "nogui"],
        stdinStopCommand: "stop\n",
      },
      defaultPort: 25565,
      params: [],
      configFiles: [
        { path: "eula.txt", strategy: "template", template: "eula=true\n" },
        { path: "server.properties", strategy: "template",
          template: "server-port={port}\nquery.port=25565\nonline-mode=false\nmax-players=10\nmotd=GameVault Local Runner Minecraft Server - {name}" },
      ],
      editableConfigPath: "server.properties",
      ports: [{ protocol: "TCP", port: "25565" }, { protocol: "UDP", port: "25565" }],
    },
  },
  {
    slug: "VALHEIM", displayName: "Valheim", icon: "⛵",
    color: "from-amber-500 to-amber-700 bg-amber-500/10 border-amber-500/30 text-amber-400",
    description: "Co-op Viking exploration", recommendedRamGB: 6.0,
    installMethod: "STEAMCMD",
    spec: {
      install: { appId: "896660", installSubDir: "valheim-server", checkFile: "valheim_server.exe", requiredDiskGB: 2.5 },
      passwordPolicy: { minLength: 5, fallback: "viking123" },
      launch: {
        executable: "valheim_server.exe", cwdSubDir: "valheim-server",
        args: ["-nographics", "-batchmode", "-name", "{name}", "-port", "2456", "-world", "Dedicated", "-password", "{password}", "-public", "1", "-crossplay"],
        stdoutPatterns: [{ regex: "registered with join code (\\w+)", updateField: "ipAddress", transform: "joinCode" }],
      },
      defaultPort: 2456, params: [], configFiles: [],
      ports: [{ protocol: "UDP", port: "2456" }, { protocol: "UDP", port: "2457" }, { protocol: "UDP", port: "2458" }],
    },
  },
  {
    slug: "ENSHROUDED", displayName: "Enshrouded", icon: "🔥",
    color: "from-blue-500 to-indigo-700 bg-blue-500/10 border-blue-500/30 text-blue-400",
    description: "Co-op survival action RPG", recommendedRamGB: 8.0,
    installMethod: "STEAMCMD",
    spec: {
      install: { appId: "2278520", installSubDir: "enshrouded-server", checkFile: "enshrouded_server.exe", requiredDiskGB: 4.0 },
      launch: { executable: "enshrouded_server.exe", cwdSubDir: "enshrouded-server", args: [] },
      defaultPort: 15637, params: [],
      configFiles: [{ path: "enshrouded_server.json", strategy: "enshroudedJson" }],
      editableConfigPath: "enshrouded-server/enshrouded_server.json",
      ports: [
        { protocol: "TCP", port: "15636" }, { protocol: "UDP", port: "15636" },
        { protocol: "TCP", port: "15637" }, { protocol: "UDP", port: "15637" },
      ],
    },
  },
  {
    slug: "ZOMBOID", displayName: "Project Zomboid", icon: "🧟",
    color: "from-red-500 to-rose-700 bg-red-500/10 border-red-500/30 text-red-400",
    description: "Zombie survival RPG", recommendedRamGB: 8.0,
    installMethod: "STEAMCMD",
    spec: {
      install: { appId: "380870", installSubDir: "zomboid-server", checkFile: "StartServer64.bat", requiredDiskGB: 3.0 },
      launch: {
        executable: "cmd.exe", cwdSubDir: "zomboid-server",
        args: ["/c", "StartServer64.bat", "-cachedir=./zomboid-data", "-servername", "servertest"],
      },
      defaultPort: 16261, params: [],
      configFiles: [{ path: "zomboid-data/Server/servertest.ini", strategy: "zomboidIniMerge" }],
      editableConfigPath: "zomboid-server/zomboid-data/Server/servertest.ini",
      ports: [{ protocol: "UDP", port: "16261" }, { protocol: "UDP", port: "16262" }, { protocol: "UDP", port: "8766" }],
    },
  },
  {
    slug: "ARK", displayName: "ARK: Survival Evolved", icon: "🦖",
    color: "from-cyan-500 to-blue-700 bg-cyan-500/10 border-cyan-500/30 text-cyan-400",
    description: "Dinosaur taming action", recommendedRamGB: 12.0,
    installMethod: "STEAMCMD",
    spec: {
      install: { appId: "376030", installSubDir: "ark-server", checkFile: "ShooterGame/Binaries/Win64/ShooterGameServer.exe", requiredDiskGB: 15.0 },
      launch: {
        executable: "ShooterGame/Binaries/Win64/ShooterGameServer.exe",
        cwdSubDir: "ark-server/ShooterGame/Binaries/Win64",
        args: [
          { value: ["TheIsland?SessionName={name}?ServerPassword={password}?Port=7777?QueryPort=27015?MaxPlayers=20"], includeWhen: "password" },
          { value: ["TheIsland?SessionName={name}?Port=7777?QueryPort=27015?MaxPlayers=20"], includeWhen: "passwordEmpty" },
          "-server", "-nosound", "-QueryPort=27015",
        ],
      },
      defaultPort: 7777,
      params: [],
      configFiles: [],
      ports: [{ protocol: "UDP", port: "7777" }, { protocol: "UDP", port: "7778" }, { protocol: "UDP", port: "27015" }],
    },
  },
  {
    slug: "TERRARIA", displayName: "Terraria", icon: "🌳",
    color: "from-lime-500 to-green-700 bg-lime-500/10 border-lime-500/30 text-lime-400",
    description: "2D sandbox adventure", recommendedRamGB: 2.0,
    installMethod: "STEAMCMD",
    spec: {
      install: { appId: "282440", installSubDir: "terraria-server", checkFile: "TerrariaServer.exe", requiredDiskGB: 1.0 },
      launch: {
        executable: "TerrariaServer.exe", cwdSubDir: "terraria-server",
        args: [
          "-port", "7777", "-players", "8",
          { value: ["-pass", "{password}"], includeWhen: "password" },
          "-autocreate", "1", "-worldname", "{nameSanitized}",
          "-world", "worlds/{nameSanitized}.wld",
        ],
      },
      defaultPort: 7777, params: [], configFiles: [],
      ports: [{ protocol: "TCP", port: "7777" }, { protocol: "UDP", port: "7777" }],
    },
  },
  {
    slug: "PALWORLD", displayName: "Palworld", icon: "🦊",
    color: "from-orange-500 to-rose-700 bg-orange-500/10 border-orange-500/30 text-orange-400",
    description: "Creature-collecting survival", recommendedRamGB: 8.0,
    installMethod: "STEAMCMD",
    spec: {
      install: { appId: "2394010", installSubDir: "palworld-server", checkFile: "PalServer.exe", requiredDiskGB: 4.0 },
      launch: {
        executable: "PalServer.exe", cwdSubDir: "palworld-server",
        args: [
          { value: ["?port=8211?players=16?AdminPassword={password}"], includeWhen: "password" },
          { value: ["?port=8211?players=16"], includeWhen: "passwordEmpty" },
          "-useperfthreads", "-NoAsyncLoadingThread", "-UseMultithreadForDS",
        ],
      },
      defaultPort: 8211, params: [],
      configFiles: [],
      editableConfigPath: "palworld-server/Pal/Saved/Config/WindowsServer/PalWorldSettings.ini",
      ports: [{ protocol: "UDP", port: "8211" }],
    },
  },
  {
    slug: "RUST", displayName: "Rust", icon: "⚙️",
    color: "from-stone-500 to-red-800 bg-stone-500/10 border-stone-500/30 text-stone-400",
    description: "PvP survival crafting", recommendedRamGB: 10.0,
    installMethod: "STEAMCMD",
    spec: {
      install: { appId: "258550", installSubDir: "rust-server", checkFile: "RustDedicated.exe", requiredDiskGB: 10.0 },
      passwordPolicy: { minLength: 1, fallback: "changeme123" },
      launch: {
        executable: "RustDedicated.exe", cwdSubDir: "rust-server",
        args: [
          "-batchmode", "+server.port", "28015", "+server.identity", "servertest",
          "+server.seed", "12345", "+server.worldsize", "3000", "+server.maxplayers", "10",
          "+server.hostname", "{name}", "+rcon.port", "28016", "+rcon.password", "{password}", "+rcon.web", "1",
        ],
      },
      defaultPort: 28015, params: [],
      configFiles: [],
      editableConfigPath: "rust-server/server/servertest/cfg/server.cfg",
      ports: [{ protocol: "UDP", port: "28015" }, { protocol: "TCP", port: "28016" }],
    },
  },
];
```

Note on ARK/Palworld conditional args: the current code builds one query string with the password segment present only when a password is set. To express both branches declaratively, the context must expose a `passwordEmpty` companion variable (the inverse guard). Add it in Task 9 when wiring the context (set `ctx.passwordEmpty = ctx.password ? "" : "1"`), and add `"passwordEmpty"` to `KNOWN_FIXED_VARS` in `validate.ts` and to the `DefinitionContext` build in `context.ts`. **Do this now** so the built-ins validate:
  - In `src/lib/definitions/validate.ts`, change `KNOWN_FIXED_VARS` to include `"passwordEmpty"`.
  - In `src/lib/definitions/context.ts`, after computing `pw`, add `ctx.passwordEmpty = pw ? "" : "1";` and add `passwordEmpty: string` handling (it's already covered by the index signature).

- [ ] **Step 4: Run to verify pass**

Run: `rtk npm test -- builtins`
Expected: all passed (8 games, all validate).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**
```bash
rtk git add src/lib/definitions/builtins.ts src/lib/definitions/__tests__/builtins.test.ts src/lib/definitions/validate.ts src/lib/definitions/context.ts
rtk git commit -m "feat: author 8 built-in game definitions"
```

---

### Task 9: Built-in parity tests (the safety net)

**Files:**
- Create: `src/lib/definitions/__tests__/parity.test.ts`

**Interfaces:**
- Consumes: `BUILTIN_DEFINITIONS` from `builtins.ts`; `buildContext` from `context.ts`; `planInstall/planLaunch/planPorts` from `plan.ts`.
- Produces: nothing (test-only). Asserts each planner reproduces the exact argv / install target / port list that `localRunner.ts` produces today. Expected values are transcribed from the current code.

This task has **no implementation step** — it locks current behavior before Task 10 rewires the runner. If a planner output doesn't match, fix the corresponding built-in spec (Task 8) or planner (Task 7), not the expected literals.

- [ ] **Step 1: Write the parity tests**

Create `src/lib/definitions/__tests__/parity.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { BUILTIN_DEFINITIONS } from "../builtins";
import { buildContext } from "../context";
import { planLaunch, planPorts, planInstall } from "../plan";

function def(slug: string) {
  const d = BUILTIN_DEFINITIONS.find((x) => x.slug === slug)!;
  return d;
}
function ctxFor(slug: string, opts: { name: string; password: string | null; ram: number }) {
  const d = def(slug);
  return buildContext({ name: opts.name, password: opts.password, port: d.spec.defaultPort, ram: opts.ram, paramValuesJson: null, spec: d.spec });
}

describe("parity: Minecraft", () => {
  it("argv matches localRunner", () => {
    const c = ctxFor("MINECRAFT", { name: "Survival World", password: null, ram: 4 });
    const p = planLaunch(def("MINECRAFT").spec, c);
    expect(p.executable).toBe("java");
    expect(p.args).toEqual(["-Xms512M", "-Xmx4G", "-jar", "server.jar", "nogui"]);
  });
});

describe("parity: Valheim", () => {
  it("argv matches and applies password fallback", () => {
    const c = ctxFor("VALHEIM", { name: "Viking Realm", password: "abc", ram: 6 }); // too short -> viking123
    const p = planLaunch(def("VALHEIM").spec, c);
    expect(p.args).toEqual(["-nographics", "-batchmode", "-name", "Viking Realm", "-port", "2456", "-world", "Dedicated", "-password", "viking123", "-public", "1", "-crossplay"]);
    expect(planPorts(def("VALHEIM").spec, c)).toEqual([
      { protocol: "UDP", port: 2456 }, { protocol: "UDP", port: 2457 }, { protocol: "UDP", port: 2458 },
    ]);
  });
});

describe("parity: ARK", () => {
  it("password present", () => {
    const c = ctxFor("ARK", { name: "The Island Survival", password: "pw", ram: 12 });
    const p = planLaunch(def("ARK").spec, c);
    expect(p.args).toEqual(["TheIsland?SessionName=The Island Survival?ServerPassword=pw?Port=7777?QueryPort=27015?MaxPlayers=20", "-server", "-nosound", "-QueryPort=27015"]);
  });
  it("password empty", () => {
    const c = ctxFor("ARK", { name: "Island", password: null, ram: 12 });
    const p = planLaunch(def("ARK").spec, c);
    expect(p.args).toEqual(["TheIsland?SessionName=Island?Port=7777?QueryPort=27015?MaxPlayers=20", "-server", "-nosound", "-QueryPort=27015"]);
  });
});

describe("parity: Terraria", () => {
  it("sanitizes world name and omits password when empty", () => {
    const c = ctxFor("TERRARIA", { name: "My World!", password: null, ram: 2 });
    const p = planLaunch(def("TERRARIA").spec, c);
    expect(p.args).toEqual(["-port", "7777", "-players", "8", "-autocreate", "1", "-worldname", "My_World_", "-world", "worlds/My_World_.wld"]);
  });
});

describe("parity: Palworld", () => {
  it("password present", () => {
    const c = ctxFor("PALWORLD", { name: "Pals", password: "pw", ram: 8 });
    const p = planLaunch(def("PALWORLD").spec, c);
    expect(p.args).toEqual(["?port=8211?players=16?AdminPassword=pw", "-useperfthreads", "-NoAsyncLoadingThread", "-UseMultithreadForDS"]);
  });
});

describe("parity: Rust", () => {
  it("uses rcon password fallback", () => {
    const c = ctxFor("RUST", { name: "Rust Box", password: null, ram: 10 });
    const p = planLaunch(def("RUST").spec, c);
    expect(p.args).toEqual([
      "-batchmode", "+server.port", "28015", "+server.identity", "servertest",
      "+server.seed", "12345", "+server.worldsize", "3000", "+server.maxplayers", "10",
      "+server.hostname", "Rust Box", "+rcon.port", "28016", "+rcon.password", "changeme123", "+rcon.web", "1",
    ]);
  });
});

describe("parity: install targets", () => {
  it("valheim steam install", () => {
    expect(planInstall(def("VALHEIM").spec, "STEAMCMD")).toMatchObject({ appId: "896660", checkFile: "valheim_server.exe", requiredDiskGB: 2.5 });
  });
});
```

- [ ] **Step 2: Run the parity tests**

Run: `rtk npm test -- parity`
Expected: all passed. If any fail, adjust the offending built-in spec (Task 8) until the planner output matches these literals (which are copied from `localRunner.ts`).

- [ ] **Step 3: Commit**
```bash
rtk git add src/lib/definitions/__tests__/parity.test.ts
rtk git commit -m "test: lock built-in behavior parity"
```

---

### Task 10: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration via `prisma migrate dev`

**Interfaces:**
- Produces: `GameDefinition` model; `Server.definitionId` (nullable FK) + `Server.paramValues` (String?); `User.role` (String default "USER"); regenerated Prisma client at `src/generated/client`.

- [ ] **Step 1: Add the model and fields**

In `prisma/schema.prisma`, add to `model User` (after `role`-less fields):
```prisma
  role         String        @default("USER") // "USER" | "ADMIN"
  definitions  GameDefinition[]
```

Add to `model Server` (after `port`):
```prisma
  definitionId String?
  definition   GameDefinition? @relation(fields: [definitionId], references: [id])
  paramValues  String?         // JSON object of custom param values
```

Add the new model:
```prisma
model GameDefinition {
  id               String   @id @default(cuid())
  slug             String
  displayName      String
  icon             String   @default("🎮")
  color            String   @default("from-slate-500 to-slate-700 bg-slate-500/10 border-slate-500/30 text-slate-400")
  description      String   @default("")
  recommendedRamGB Float    @default(4)
  requiredDiskGB   Float    @default(3)
  ownerId          String?
  owner            User?    @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  isBuiltIn        Boolean  @default(false)
  installMethod    String   // "STEAMCMD" | "DOWNLOAD" | "CUSTOM_SCRIPT"
  spec             String   // JSON GameDefinitionSpec
  servers          Server[]
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([ownerId, slug])
}
```

- [ ] **Step 2: Create the migration**

Run:
```bash
rtk npx prisma migrate dev --name add_game_definitions
```
Expected: a new migration under `prisma/migrations/`, client regenerated, no errors.

- [ ] **Step 3: Verify client types**

Run: `npx tsc --noEmit`
Expected: no errors (the `prisma.gameDefinition` delegate now exists).

- [ ] **Step 4: Commit**
```bash
rtk git add prisma/schema.prisma prisma/migrations src/generated
rtk git commit -m "feat: add GameDefinition model, Server.definitionId, User.role"
```

---

### Task 11: Idempotent built-in seeding

**Files:**
- Create: `src/lib/definitions/seed.ts`
- Modify: `prisma/seed.js`
- Create: `src/lib/definitions/__tests__/seed.test.ts`

**Interfaces:**
- Consumes: `BUILTIN_DEFINITIONS` from `builtins.ts`; `stringifySpec` from `serialize.ts`; a `PrismaClient`-like object.
- Produces:
  - `upsertBuiltinDefinitions(prisma): Promise<void>` — for each built-in, upsert by the unique `(ownerId=null, slug)` pair with `isBuiltIn: true`. Uses `requiredDiskGB` from the spec's install when present.
  - `buildBuiltinUpsertArgs(def): { create, update, where }` — pure helper (testable without a DB).

- [ ] **Step 1: Write a failing test for the pure helper**

Create `src/lib/definitions/__tests__/seed.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildBuiltinUpsertArgs } from "../seed";
import { BUILTIN_DEFINITIONS } from "../builtins";

describe("buildBuiltinUpsertArgs", () => {
  it("targets the global (ownerId null) slug and marks built-in", () => {
    const valheim = BUILTIN_DEFINITIONS.find((d) => d.slug === "VALHEIM")!;
    const args = buildBuiltinUpsertArgs(valheim);
    expect(args.where).toEqual({ ownerId_slug: { ownerId: null, slug: "VALHEIM" } });
    expect(args.create.isBuiltIn).toBe(true);
    expect(args.create.ownerId).toBeNull();
    expect(args.create.installMethod).toBe("STEAMCMD");
    expect(args.create.requiredDiskGB).toBe(2.5);
    expect(typeof args.create.spec).toBe("string"); // serialized JSON
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `rtk npm test -- seed`
Expected: FAIL — cannot find module `../seed`.

- [ ] **Step 3: Implement**

Create `src/lib/definitions/seed.ts`:
```ts
import type { BuiltinDefinition } from "./builtins";
import { BUILTIN_DEFINITIONS } from "./builtins";
import { stringifySpec } from "./serialize";

export function buildBuiltinUpsertArgs(def: BuiltinDefinition) {
  const install = def.spec.install as any;
  const data = {
    slug: def.slug,
    displayName: def.displayName,
    icon: def.icon,
    color: def.color,
    description: def.description,
    recommendedRamGB: def.recommendedRamGB,
    requiredDiskGB: typeof install.requiredDiskGB === "number" ? install.requiredDiskGB : 3,
    ownerId: null as string | null,
    isBuiltIn: true,
    installMethod: def.installMethod,
    spec: stringifySpec(def.spec),
  };
  return {
    where: { ownerId_slug: { ownerId: null, slug: def.slug } },
    create: data,
    update: data,
  };
}

export async function upsertBuiltinDefinitions(prisma: { gameDefinition: { upsert: (a: any) => Promise<any> } }): Promise<void> {
  for (const def of BUILTIN_DEFINITIONS) {
    await prisma.gameDefinition.upsert(buildBuiltinUpsertArgs(def));
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `rtk npm test -- seed`
Expected: passed.

- [ ] **Step 5: Wire seeding into prisma/seed.js**

`prisma/seed.js` is CommonJS and runs via `node`, so it cannot import the TS module directly. Re-declare the upsert there using the compiled built-in data is brittle; instead, register `ts-node`-free seeding by importing the built-in JSON at runtime. Simplest robust approach: in `prisma/seed.js`, add a require of a small generated JSON. To avoid a build step, **inline** the upsert loop in `seed.js` by reading the same source of truth via a tiny exported JSON.

Add to the top of `prisma/seed.js` (after the existing Prisma client require):
```js
// Built-in game definitions are the source of truth in src/lib/definitions/builtins.ts.
// We keep a JSON mirror so the plain-node seed script can read them without TS tooling.
const builtins = require("../src/lib/definitions/builtins.generated.json");
```
And inside the seed `main()` (before creating demo servers), add:
```js
  for (const def of builtins) {
    const install = def.spec.install || {};
    const data = {
      slug: def.slug, displayName: def.displayName, icon: def.icon, color: def.color,
      description: def.description, recommendedRamGB: def.recommendedRamGB,
      requiredDiskGB: typeof install.requiredDiskGB === "number" ? install.requiredDiskGB : 3,
      ownerId: null, isBuiltIn: true, installMethod: def.installMethod,
      spec: JSON.stringify(def.spec),
    };
    await prisma.gameDefinition.upsert({
      where: { ownerId_slug: { ownerId: null, slug: def.slug } },
      create: data, update: data,
    });
  }
  console.log("Seeded built-in game definitions.");
```

- [ ] **Step 6: Generate the JSON mirror**

Create `src/lib/definitions/builtins.generated.json` by exporting `BUILTIN_DEFINITIONS`. Generate it with a one-off node script (run from repo root):
```bash
rtk npx tsx -e "import {BUILTIN_DEFINITIONS} from './src/lib/definitions/builtins'; import fs from 'fs'; fs.writeFileSync('./src/lib/definitions/builtins.generated.json', JSON.stringify(BUILTIN_DEFINITIONS, null, 2));"
```
If `tsx` is unavailable, install it dev-only first: `rtk npm install -D tsx`. Expected: `builtins.generated.json` written with 8 entries.

Add a note comment at the top of `builtins.ts`:
```ts
// NOTE: After editing BUILTIN_DEFINITIONS, regenerate builtins.generated.json:
//   npx tsx -e "import {BUILTIN_DEFINITIONS} from './src/lib/definitions/builtins'; import fs from 'fs'; fs.writeFileSync('./src/lib/definitions/builtins.generated.json', JSON.stringify(BUILTIN_DEFINITIONS, null, 2));"
```

- [ ] **Step 7: Run the seed to verify it works**

Run:
```bash
rtk node prisma/seed.js
```
Expected: "Seeded built-in game definitions." and no errors. Re-run once more to confirm idempotency (no duplicate-key errors).

- [ ] **Step 8: Commit**
```bash
rtk git add src/lib/definitions/seed.ts src/lib/definitions/__tests__/seed.test.ts src/lib/definitions/builtins.generated.json prisma/seed.js package.json package-lock.json
rtk git commit -m "feat: seed built-in definitions idempotently"
```

---

### Task 12: Startup upsert + data backfill migration

**Files:**
- Create: `src/lib/definitions/ensureSeeded.ts`
- Modify: `prisma/migrations/<add_game_definitions>/migration.sql` (append data backfill) OR create a follow-up migration `prisma/migrations/<ts>_backfill_definitions/migration.sql`
- Create: `src/lib/definitions/__tests__/backfill.test.ts` (pure SQL-builder test)

**Interfaces:**
- Consumes: `upsertBuiltinDefinitions` from `seed.ts`; `prisma` from `@/lib/db`.
- Produces:
  - `ensureBuiltinsSeeded(): Promise<void>` — runs `upsertBuiltinDefinitions(prisma)` at most once per process (guards with a module-level promise, mirroring the `initBackupScheduler()` pattern used in `servers/route.ts`).

- [ ] **Step 1: Implement the startup guard**

Create `src/lib/definitions/ensureSeeded.ts`:
```ts
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
```

- [ ] **Step 2: Add the data backfill migration**

Create a new migration folder `prisma/migrations/<timestamp>_backfill_definitions/migration.sql` (use the next timestamp; or run `rtk npx prisma migrate dev --name backfill_definitions --create-only` to scaffold it) with:
```sql
-- Pre-release: promote all existing users to ADMIN
UPDATE "User" SET "role" = 'ADMIN';

-- Backfill Server.definitionId by matching the legacy game string to the built-in slug.
-- Built-ins are seeded with ownerId IS NULL.
UPDATE "Server"
SET "definitionId" = (
  SELECT gd."id" FROM "GameDefinition" gd
  WHERE gd."ownerId" IS NULL AND gd."slug" = UPPER("Server"."game")
)
WHERE "definitionId" IS NULL;
```

**Important ordering:** built-ins must exist before this backfill runs. Since `migrate dev`/`migrate deploy` runs migrations before the app seeds, run the seed (`node prisma/seed.js`, Task 11) **before** applying this backfill in any environment that already has servers — OR move the built-in `INSERT`s into this same SQL file. For the pre-release single-dev case, the sequence is: `prisma migrate dev` (creates tables) → `node prisma/seed.js` (inserts built-ins) → re-run `prisma migrate dev` to apply this backfill. Document this in the migration's leading comment.

- [ ] **Step 3: Apply and verify**

Run:
```bash
rtk npx prisma migrate dev
```
Then verify in a quick node check:
```bash
rtk node -e "const{PrismaClient}=require('./src/generated/client');const p=new PrismaClient();p.server.findMany().then(s=>{console.log(s.map(x=>({game:x.game,def:x.definitionId})));return p.$disconnect();})"
```
Expected: every seeded demo server shows a non-null `def`.

- [ ] **Step 4: Commit**
```bash
rtk git add src/lib/definitions/ensureSeeded.ts prisma/migrations
rtk git commit -m "feat: startup seed guard + backfill users/servers"
```

---

### Task 13: Rewire the launch engine to use definitions

**Files:**
- Modify: `src/lib/localRunner.ts`
- Create: `src/lib/definitions/strategies.ts` (Enshrouded JSON + Zomboid INI writers, lifted from current code)

**Interfaces:**
- Consumes: `planInstall/planConfigFiles/planLaunch/planPorts` from `plan.ts`; `buildContext` from `context.ts`; `parseSpec` from `serialize.ts`; `BUILTIN_DEFINITIONS` (fallback) ; the server's `definition` relation.
- Produces: refactored `startLocalServer`, `stopLocalServer`, `updateGameServer` that resolve a `GameDefinition` from `server.definitionId` and execute the plans. Public function signatures are unchanged so existing callers (`servers/[id]/start` etc.) keep working.

**Approach:** keep the existing helpers (`setupSteamCMD`, `ensureSteamCmdUpdated`, `installSteamCmdApp`, `downloadFile`, `getFreeDiskSpaceGB`, `checkJavaInstalled`, `handleProcessExit`, monitoring). Replace only the giant per-game `switch` blocks and the per-game UPnP/disk/config logic with plan execution.

- [ ] **Step 1: Lift the structural config writers into strategies.ts**

Create `src/lib/definitions/strategies.ts` and move `writeEnshroudedConfig` and `writeZomboidConfig` (verbatim from `localRunner.ts:300-362`) here, exporting them:
```ts
import fs from "fs";
import path from "path";

export function writeEnshroudedConfig(serverDir: string, serverName: string, password?: string) {
  /* ...verbatim body from localRunner.ts... */
}

export function writeZomboidConfig(serverDir: string, password?: string) {
  /* ...verbatim body from localRunner.ts... */
}

// Dispatch a non-template config strategy to its writer.
export function writeStrategyConfig(args: {
  strategy: "enshroudedJson" | "zomboidIniMerge";
  installDir: string;       // the server's install subdir (e.g. .../enshrouded-server)
  serverName: string;
  password?: string;
}) {
  if (args.strategy === "enshroudedJson") writeEnshroudedConfig(args.installDir, args.serverName, args.password);
  else if (args.strategy === "zomboidIniMerge") writeZomboidConfig(args.installDir, args.password);
}
```

- [ ] **Step 2: Refactor installSteamCmdApp to take requiredDiskGB**

In `localRunner.ts`, change `installSteamCmdApp` to accept `requiredGB: number` and delete the per-`appId` disk `if` chain (`localRunner.ts:220-227`), using the passed value:
```ts
function installSteamCmdApp(serverId: string, appId: string, appName: string, installDir: string, checkFile: string, requiredGB: number, onLog: (msg: string) => void): Promise<void> {
  // ...inside, replace the requiredGB computation block with:
  const minSteamCmdGB = 0.25;
  const totalRequiredGB = Math.max(requiredGB, minSteamCmdGB);
  // ...rest unchanged
}
```

- [ ] **Step 3: Add a definition resolver**

Add to `localRunner.ts`:
```ts
import { parseSpec } from "./definitions/serialize";
import { buildContext } from "./definitions/context";
import { planInstall, planConfigFiles, planLaunch, planPorts } from "./definitions/plan";
import { writeStrategyConfig } from "./definitions/strategies";
import type { GameDefinitionSpec } from "./definitions/types";

async function resolveDefinition(server: { definitionId: string | null; game: string }): Promise<{ spec: GameDefinitionSpec; installMethod: string; requiresJava: boolean }> {
  let record = server.definitionId
    ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
    : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });
  if (!record) throw new Error(`No game definition found for server (game=${server.game}).`);
  const spec = parseSpec(record.spec);
  return { spec, installMethod: record.installMethod, requiresJava: !!spec.requiresJava };
}
```

- [ ] **Step 4: Rewrite startLocalServer body**

Replace the per-game `switch` (everything from `if (game.toUpperCase() === "MINECRAFT")` through the closing `else { throw ... }`, `localRunner.ts:468-892`) and the per-game UPnP block (`localRunner.ts:430-458`) with definition-driven execution. The new flow:
```ts
// after fetching `server` and resolving currentIp:
const { spec, installMethod, requiresJava } = await resolveDefinition(server);
const ctx = buildContext({
  name: server.name, password: server.password, port: server.port,
  ram: ramAllocation, paramValuesJson: server.paramValues, spec,
});

// 1. UPnP (replaces hardcoded port block)
if (server.enableUpnp || server.runnerType === "LOCAL") {
  logWriter("[UPnP] Requesting router port forwarding rules...");
  try {
    for (const pm of planPorts(spec, ctx)) {
      await mapPort(pm.port, pm.protocol, `GameVault ${spec.install ? server.name : server.name}`);
    }
    logWriter("[UPnP] Success! Router port forward mapping completed successfully.");
  } catch (e: any) { logWriter(`[UPnP Warning] Failed to configure router port maps: ${e.message}`); }
}

// 2. Install
const installPlan = planInstall(spec, installMethod as any);
const installDir = installPlan.installSubDir ? getLocalServerDir(serverId, installPlan.installSubDir) : baseDir;
if (requiresJava) {
  if (!(await checkJavaInstalled())) throw new Error("Java Runtime Environment (JRE) was not found. Install Java 17+ to run this server.");
}
await prisma.server.update({ where: { id: serverId }, data: { status: "STARTING" } });
if (installPlan.method === "STEAMCMD") {
  const exe = path.join(installDir, installPlan.checkFile!);
  if (!fs.existsSync(exe)) await installSteamCmdApp(serverId, installPlan.appId!, server.name, installDir, installPlan.checkFile!, installPlan.requiredDiskGB ?? 3, logWriter);
} else if (installPlan.method === "DOWNLOAD") {
  const target = path.join(installDir, installPlan.fileName!);
  if (!fs.existsSync(path.join(installDir, installPlan.checkFile!))) {
    await downloadFile(installPlan.url!, target);
    // (unzip handling if installPlan.unzip — use the same Expand-Archive exec pattern as setupSteamCMD)
  }
} else if (installPlan.method === "CUSTOM_SCRIPT") {
  await runShellScript(installPlan.installScript!, installDir, logWriter); // see Step 5
}

// 3. Config files
for (const cf of planConfigFiles(spec, ctx)) {
  const full = path.join(installDir, cf.relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  if (cf.strategy === "template") fs.writeFileSync(full, cf.content ?? "");
  else writeStrategyConfig({ strategy: cf.strategy, installDir, serverName: server.name, password: server.password || undefined });
}

// 4. Launch
const launch = planLaunch(spec, ctx);
const cwd = launch.cwdSubDir ? getLocalServerDir(serverId, launch.cwdSubDir) : baseDir;
let child;
if (launch.launchScript) {
  child = spawn("cmd.exe", ["/c", launch.launchScript], { cwd, stdio: ["pipe","pipe","pipe"], env: { ...process.env, ...(launch.env||{}) } });
} else {
  child = spawn(path.isAbsolute(launch.executable) || launch.executable.includes("/") ? path.join(cwd, launch.executable) : launch.executable, launch.args, { cwd, stdio: ["pipe","pipe","pipe"], env: { ...process.env, ...(launch.env||{}) } });
}
if (!child.pid) throw new Error("Failed to spawn server child process.");
localProcesses.set(serverId, child);

// 5. stdout patterns (e.g. Valheim join code)
if (launch.stdoutPatterns?.length) {
  child.stdout.on("data", (chunk) => {
    const s = chunk.toString();
    for (const pat of launch.stdoutPatterns!) {
      const m = s.match(new RegExp(pat.regex, "i"));
      if (m && m[1] && pat.updateField === "ipAddress") {
        const value = pat.transform === "joinCode" ? `Join Code: ${m[1]}` : m[1];
        prisma.server.update({ where: { id: serverId }, data: { ipAddress: value } }).catch(() => {});
      }
    }
  });
}

await prisma.server.update({ where: { id: serverId }, data: { status: "RUNNING", pid: child.pid, ipAddress: currentIp, cpuUsage: 0, memoryUsage: 0 } });
startMonitoring(serverId, child.pid);
const logStream = fs.createWriteStream(logFile, { flags: "a" });
child.stdout.pipe(logStream); child.stderr.pipe(logStream);
child.on("exit", (code, signal) => handleProcessExit(serverId, code, signal, baseDir));
```
Keep the existing pre-`switch` code (log reset, server fetch, public IP resolve). The Minecraft `executable: "java"` is launched by name (no `cwd` join); the path-join heuristic above handles relative exe paths like ARK's nested exe.

- [ ] **Step 5: Add the custom-script runner (admin path)**

Add to `localRunner.ts`:
```ts
function runShellScript(script: string, cwd: string, onLog: (m: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    onLog("[Custom Script] Executing install script...");
    const child = spawn("cmd.exe", ["/c", script], { cwd });
    child.stdout.on("data", (d) => onLog(`[Custom Script] ${d.toString().trim()}`));
    child.stderr.on("data", (d) => onLog(`[Custom Script] ${d.toString().trim()}`));
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Custom install script exited with code ${code}`))));
  });
}
```

- [ ] **Step 6: Rewrite stopLocalServer UPnP unmapping + updateGameServer**

In `stopLocalServer` (`localRunner.ts:995-1030`), replace the per-game unmap `if` chain with:
```ts
if (server && (server.enableUpnp || server.runnerType === "LOCAL")) {
  appendLog(serverDir, "[UPnP] Releasing router port mappings...");
  try {
    const { spec } = await resolveDefinition(server);
    const ctx = buildContext({ name: server.name, password: server.password, port: server.port, ram: server.ramAllocation, paramValuesJson: server.paramValues, spec });
    for (const pm of planPorts(spec, ctx)) await unmapPort(pm.port, pm.protocol);
  } catch (e: any) { appendLog(serverDir, `[UPnP Error] Failed to release port forwarding: ${e.message}`); }
}
```
Replace the Minecraft-specific graceful-stop check (`localRunner.ts:1035`) with the spec's `stdinStopCommand`:
```ts
const { spec } = await resolveDefinition(server!).catch(() => ({ spec: null as any }));
if (child && spec?.launch?.stdinStopCommand) {
  try { child.stdin.write(spec.launch.stdinStopCommand); } catch { child.kill("SIGTERM"); }
} else if (child) {
  exec(`taskkill /F /T /PID ${child.pid}`, (err) => { if (err) child.kill("SIGKILL"); });
}
```
In `updateGameServer` (`localRunner.ts:1091-1100`), replace `getGameSteamInfo(server.game)` with the definition's install plan:
```ts
const { spec, installMethod } = await resolveDefinition(server);
if (installMethod !== "STEAMCMD") throw new Error(`Updates are only supported for SteamCMD games.`);
const installPlan = planInstall(spec, "STEAMCMD");
const installDir = path.join(baseDir, installPlan.installSubDir!);
// use installPlan.appId in the spawn args below (replace steamInfo.appId)
```
Keep `getGameSteamInfo` exported for now (other callers may use it) but it is no longer used by the runner.

- [ ] **Step 7: Type-check and run all unit tests**

Run: `npx tsc --noEmit && rtk npm test`
Expected: no type errors; all definition tests pass.

- [ ] **Step 8: Manual smoke (build only — process launches need a real Windows host)**

Run: `rtk next build`
Expected: build succeeds. (Actually launching a Steam game is a manual QA step left to the user; the parity tests cover argv correctness.)

- [ ] **Step 9: Commit**
```bash
rtk git add src/lib/localRunner.ts src/lib/definitions/strategies.ts
rtk git commit -m "feat: drive local runner from game definitions"
```

---

### Task 14: First-registrant admin in the register route

**Files:**
- Modify: `src/app/api/auth/register/route.ts`

**Interfaces:**
- Consumes: `prisma`.
- Produces: new users get `role: "ADMIN"` when they are the first user, else `"USER"`.

- [ ] **Step 1: Add the count + role inside the transaction**

In `src/app/api/auth/register/route.ts`, inside the `prisma.$transaction` callback, before `tx.user.create`, add:
```ts
      const userCount = await tx.user.count();
      const role = userCount === 0 ? "ADMIN" : "USER";
```
Then add `role,` to the `tx.user.create({ data: { ... } })` object.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Delete the dev DB users or use a fresh DB, register once, and confirm the row has `role = "ADMIN"`:
```bash
rtk node -e "const{PrismaClient}=require('./src/generated/client');const p=new PrismaClient();p.user.findMany({select:{email:true,role:true}}).then(u=>{console.log(u);return p.$disconnect();})"
```
Expected: first user is ADMIN.

- [ ] **Step 4: Commit**
```bash
rtk git add src/app/api/auth/register/route.ts
rtk git commit -m "feat: first registered user becomes admin"
```

---

### Task 15: Definitions list + create API

**Files:**
- Create: `src/app/api/definitions/route.ts`
- Create: `src/lib/definitions/slug.ts` (+ test)

**Interfaces:**
- Consumes: `getAuthenticatedUser` from `@/lib/auth`; `prisma`; `validateSpec` from `validate.ts`; `stringifySpec`/`parseSpec` from `serialize.ts`; `ensureBuiltinsSeeded` from `ensureSeeded.ts`.
- Produces:
  - `GET /api/definitions` → `{ definitions: Array<{ id, slug, displayName, icon, color, description, recommendedRamGB, requiredDiskGB, installMethod, isBuiltIn, spec }> }` — built-ins (`ownerId null`) + caller's own. `spec` is returned parsed (object), not the raw string.
  - `POST /api/definitions` → creates a per-user definition. Rejects `installMethod === "CUSTOM_SCRIPT"` unless `user.role === "ADMIN"` (403). Validates spec via `validateSpec` (400 with errors). Generates a unique slug via `slugify` (Task helper). Returns 201 with the created definition (spec parsed).
  - `slugify(name: string): string` in `slug.ts` — lowercases, replaces non-alphanumerics with `-`, trims dashes; tested.

- [ ] **Step 1: Write a failing test for slugify**

Create `src/lib/definitions/__tests__/slug.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { slugify } from "../slug";

describe("slugify", () => {
  it("lowercases and dashes", () => { expect(slugify("My Cool Game!")).toBe("my-cool-game"); });
  it("collapses repeats and trims", () => { expect(slugify("  a   b  ")).toBe("a-b"); });
  it("falls back for empty", () => { expect(slugify("!!!")).toBe("custom-game"); });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `rtk npm test -- slug`
Expected: FAIL — cannot find module `../slug`.

- [ ] **Step 3: Implement slugify**

Create `src/lib/definitions/slug.ts`:
```ts
export function slugify(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "custom-game";
}
```

- [ ] **Step 4: Run to verify pass**

Run: `rtk npm test -- slug`
Expected: passed.

- [ ] **Step 5: Implement the route**

Create `src/app/api/definitions/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { ensureBuiltinsSeeded } from "@/lib/definitions/ensureSeeded";
import { validateSpec } from "@/lib/definitions/validate";
import { parseSpec, stringifySpec } from "@/lib/definitions/serialize";
import { slugify } from "@/lib/definitions/slug";
import type { GameDefinitionSpec, InstallMethod } from "@/lib/definitions/types";

function serialize(d: any) { return { ...d, spec: parseSpec(d.spec) }; }

export async function GET() {
  try {
    await ensureBuiltinsSeeded();
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const defs = await prisma.gameDefinition.findMany({
      where: { OR: [{ ownerId: null }, { ownerId: user.id }] },
      orderBy: [{ isBuiltIn: "desc" }, { displayName: "asc" }],
    });
    return NextResponse.json({ definitions: defs.map(serialize) });
  } catch (e) {
    console.error("GET /api/definitions error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const installMethod = body.installMethod as InstallMethod;
    const spec = body.spec as GameDefinitionSpec;
    if (!body.displayName || !installMethod || !spec) {
      return NextResponse.json({ error: "displayName, installMethod, and spec are required" }, { status: 400 });
    }
    if (installMethod === "CUSTOM_SCRIPT" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Custom script definitions require an admin account." }, { status: 403 });
    }
    const errors = validateSpec(spec, installMethod);
    if (errors.length) return NextResponse.json({ error: errors.join(" ") }, { status: 400 });

    // unique slug per owner
    let base = slugify(body.displayName);
    let slug = base, n = 1;
    while (await prisma.gameDefinition.findFirst({ where: { ownerId: user.id, slug } })) slug = `${base}-${++n}`;

    const install = spec.install as any;
    const created = await prisma.gameDefinition.create({
      data: {
        slug, displayName: body.displayName,
        icon: body.icon || "🎮",
        color: body.color || "from-slate-500 to-slate-700 bg-slate-500/10 border-slate-500/30 text-slate-400",
        description: body.description || "",
        recommendedRamGB: Number(body.recommendedRamGB) || 4,
        requiredDiskGB: typeof install.requiredDiskGB === "number" ? install.requiredDiskGB : 3,
        ownerId: user.id, isBuiltIn: false, installMethod, spec: stringifySpec(spec),
      },
    });
    return NextResponse.json(serialize(created), { status: 201 });
  } catch (e) {
    console.error("POST /api/definitions error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

Note: this uses `user.role`. Confirm `getAuthenticatedUser` returns the `role` field — check `src/lib/auth.ts`. If it selects specific fields, add `role` to the select. If it returns the full user, no change needed. **Verify and fix the select before finishing this task.**

- [ ] **Step 6: Type-check + build**

Run: `npx tsc --noEmit && rtk next build`
Expected: no errors; route compiles.

- [ ] **Step 7: Commit**
```bash
rtk git add src/app/api/definitions/route.ts src/lib/definitions/slug.ts src/lib/definitions/__tests__/slug.test.ts src/lib/auth.ts
rtk git commit -m "feat: definitions list + create API"
```

---

### Task 16: Definition detail API (get / update / delete)

**Files:**
- Create: `src/app/api/definitions/[id]/route.ts`

**Interfaces:**
- Consumes: `getAuthenticatedUser`, `prisma`, `validateSpec`, `parseSpec`, `stringifySpec`.
- Produces:
  - `GET /api/definitions/[id]` → the definition (parsed spec) if it's a built-in or owned by the caller, else 404.
  - `PUT /api/definitions/[id]` → update own, non-built-in definition. Re-validates spec; re-checks admin gate if `installMethod` is `CUSTOM_SCRIPT`. 403 if built-in; 404 if not owned.
  - `DELETE /api/definitions/[id]` → delete own, non-built-in definition only if no `Server` references it (`prisma.server.count({ where: { definitionId } }) === 0`), else 409 with a clear message. 403 if built-in.

- [ ] **Step 1: Implement the route**

Create `src/app/api/definitions/[id]/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/auth";
import { validateSpec } from "@/lib/definitions/validate";
import { parseSpec, stringifySpec } from "@/lib/definitions/serialize";
import type { GameDefinitionSpec, InstallMethod } from "@/lib/definitions/types";

function serialize(d: any) { return { ...d, spec: parseSpec(d.spec) }; }

async function loadOwned(id: string, userId: string) {
  return prisma.gameDefinition.findFirst({ where: { id, OR: [{ ownerId: null }, { ownerId: userId }] } });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const def = await loadOwned(params.id, user.id);
  if (!def) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(serialize(def));
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const existing = await prisma.gameDefinition.findUnique({ where: { id: params.id } });
  if (!existing || existing.ownerId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.isBuiltIn) return NextResponse.json({ error: "Built-in definitions are read-only." }, { status: 403 });

  const body = await req.json();
  const installMethod = (body.installMethod ?? existing.installMethod) as InstallMethod;
  const spec = body.spec as GameDefinitionSpec;
  if (!spec) return NextResponse.json({ error: "spec is required" }, { status: 400 });
  if (installMethod === "CUSTOM_SCRIPT" && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Custom script definitions require an admin account." }, { status: 403 });
  }
  const errors = validateSpec(spec, installMethod);
  if (errors.length) return NextResponse.json({ error: errors.join(" ") }, { status: 400 });

  const install = spec.install as any;
  const updated = await prisma.gameDefinition.update({
    where: { id: params.id },
    data: {
      displayName: body.displayName ?? existing.displayName,
      icon: body.icon ?? existing.icon,
      color: body.color ?? existing.color,
      description: body.description ?? existing.description,
      recommendedRamGB: body.recommendedRamGB != null ? Number(body.recommendedRamGB) : existing.recommendedRamGB,
      requiredDiskGB: typeof install.requiredDiskGB === "number" ? install.requiredDiskGB : existing.requiredDiskGB,
      installMethod, spec: stringifySpec(spec),
    },
  });
  return NextResponse.json(serialize(updated));
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const existing = await prisma.gameDefinition.findUnique({ where: { id: params.id } });
  if (!existing || existing.ownerId !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.isBuiltIn) return NextResponse.json({ error: "Built-in definitions cannot be deleted." }, { status: 403 });
  const inUse = await prisma.server.count({ where: { definitionId: params.id } });
  if (inUse > 0) return NextResponse.json({ error: `This definition is used by ${inUse} server(s). Delete them first.` }, { status: 409 });
  await prisma.gameDefinition.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Type-check + build**

Run: `npx tsc --noEmit && rtk next build`
Expected: no errors.

- [ ] **Step 3: Commit**
```bash
rtk git add "src/app/api/definitions/[id]/route.ts"
rtk git commit -m "feat: definition detail get/update/delete API"
```

---

### Task 17: Wire server creation to definitions

**Files:**
- Modify: `src/app/api/servers/route.ts`

**Interfaces:**
- Consumes: `prisma`, `validateParamValues`, `parseSpec`, `stringifyParamValues`.
- Produces: `POST /api/servers` accepts `{ name, definitionId, ramAllocation, password, enableUpnp, paramValues }`. Resolves the definition (must be built-in or owned by caller), sets `server.port = spec.defaultPort`, validates `paramValues` against `spec.params`, stores `definitionId`, `paramValues` (JSON string), and `game` = definition slug (back-compat). Keeps the existing slot/auth logic.

- [ ] **Step 1: Replace the port/game logic in POST**

In `src/app/api/servers/route.ts` POST, replace the destructure and the hardcoded port block (`route.ts:72-103`) with:
```ts
    const { name, definitionId, ramAllocation, password, enableUpnp, paramValues } = await req.json();
    if (!name || !definitionId || !ramAllocation) {
      return NextResponse.json({ error: "Name, definition, and RAM allocation are required" }, { status: 400 });
    }

    const def = await prisma.gameDefinition.findFirst({
      where: { id: definitionId, OR: [{ ownerId: null }, { ownerId: user.id }] },
    });
    if (!def) return NextResponse.json({ error: "Game definition not found" }, { status: 404 });

    const spec = parseSpec(def.spec);

    // password policy validation (e.g. Valheim min length) using the spec
    if (spec.passwordPolicy?.minLength && spec.passwordPolicy.fallback === undefined) {
      if (!password || password.length < spec.passwordPolicy.minLength) {
        return NextResponse.json({ error: `${def.displayName} requires a password of at least ${spec.passwordPolicy.minLength} characters` }, { status: 400 });
      }
    }

    const paramErrors = validateParamValues(spec.params, paramValues ?? {});
    if (paramErrors.length) return NextResponse.json({ error: paramErrors.join(" ") }, { status: 400 });

    const runnerType = "LOCAL";
    const region = "LOCALHOST";
    const ipAddress = "127.0.0.1";
    const port = spec.defaultPort;
```
Update the `prisma.server.create` data to add:
```ts
        definitionId: def.id,
        game: def.slug,
        paramValues: stringifyParamValues(paramValues ?? {}),
```
(remove the old `game: game.toUpperCase()` line). Add imports at top:
```ts
import { parseSpec, stringifyParamValues } from "@/lib/definitions/serialize";
import { validateParamValues } from "@/lib/definitions/validate";
```

Note: Valheim's spec sets `passwordPolicy.fallback = "viking123"`, so the strict-required branch above won't fire for it (the server will boot with the fallback). To preserve the current UX where Valheim *requires* a user password, the UI (Task 19) keeps the client-side min-5 check. If you want server-side enforcement too, give Valheim's built-in a separate `param` instead of a fallback — out of scope here; the fallback preserves boot-ability which is the safer default.

- [ ] **Step 2: Type-check + build**

Run: `npx tsc --noEmit && rtk next build`
Expected: no errors.

- [ ] **Step 3: Commit**
```bash
rtk git add src/app/api/servers/route.ts
rtk git commit -m "feat: create servers from game definitions"
```

---

### Task 18: Config editor route reads editableConfigPath

**Files:**
- Modify: `src/app/api/servers/[id]/config/route.ts`

**Interfaces:**
- Consumes: `prisma`, `parseSpec`.
- Produces: `getConfigInfo` resolves the editable file from the server's definition `spec.editableConfigPath` (relative to `local-servers/<id>/`) instead of the hardcoded per-game switch. No `editableConfigPath` ⇒ not editable.

- [ ] **Step 1: Replace getConfigInfo**

In `src/app/api/servers/[id]/config/route.ts`, replace `getConfigInfo` (and its call sites) with a definition-driven async resolver:
```ts
import { parseSpec } from "@/lib/definitions/serialize";

async function getConfigInfo(server: { definitionId: string | null; game: string }, serverId: string) {
  const root = process.cwd();
  const def = server.definitionId
    ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
    : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });
  if (!def) return null;
  const spec = parseSpec(def.spec);
  if (!spec.editableConfigPath) {
    return { filePath: "", filename: "", format: "none", editable: false };
  }
  const rel = spec.editableConfigPath;
  const filename = rel.split("/").pop() || rel;
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const format = ext === "properties" ? "properties" : ext === "json" ? "json" : ext === "ini" ? "ini" : ext === "cfg" ? "cfg" : "text";
  return { filePath: path.join(root, "local-servers", serverId, ...rel.split("/")), filename, format, editable: true };
}
```
Update both `GET` and `PUT` to `await getConfigInfo(server, params.id)` (they currently pass `server.game`). The `access.server` object already includes `definitionId` since `verifyServerAccess` returns the full server record — **verify this in `src/lib/serverAuth.ts`; if it selects fields, add `definitionId` and `game`.**

- [ ] **Step 2: Type-check + build**

Run: `npx tsc --noEmit && rtk next build`
Expected: no errors.

- [ ] **Step 3: Commit**
```bash
rtk git add "src/app/api/servers/[id]/config/route.ts" src/lib/serverAuth.ts
rtk git commit -m "feat: config editor resolves path from definition"
```

---

### Task 19: Catalog UI reads definitions from the API

**Files:**
- Modify: `src/components/CreateServerView.tsx`

**Interfaces:**
- Consumes: `GET /api/definitions`.
- Produces: the game grid renders from fetched definitions (built-ins + the user's customs, customs tagged) instead of the hardcoded `AVAILABLE_GAMES`. The submit posts `definitionId` (+ `paramValues` from Task 20) instead of `game`. Adds a "+ Custom Game" card linking to `/dashboard/definitions/new` (Task 21).

- [ ] **Step 1: Fetch definitions and replace AVAILABLE_GAMES**

In `CreateServerView.tsx`:
- Delete the `AVAILABLE_GAMES` constant (`:30-39`).
- Add a `Definition` type and state: `const [defs, setDefs] = useState<any[]>([]); const [selectedGame, setSelectedGame] = useState<any | null>(null);`
- Add a `useEffect` that fetches `/api/definitions`, sets `defs`, and selects the first one (and `setRam(first.recommendedRamGB)`).
- Map the grid over `defs`. Replace `game.recRam` → `game.recommendedRamGB`, `game.name` → `game.displayName`, `game.desc` → `game.description`. For the per-card gradient, use `game.color` directly (the `color` field already includes gradient classes) instead of the hardcoded `id === "MINECRAFT" ? ...` chain — render `<div className={"... bg-gradient-to-br " + game.color.split(" ").filter(c => c.startsWith("from-") || c.startsWith("to-")).join(" ")}>`.
- Tag customs: if `!game.isBuiltIn`, render a small "Custom" badge.
- Replace all `selectedGame.id` comparisons. The Valheim-specific client checks should key off the definition: use `selectedGame?.spec?.passwordPolicy?.minLength` for the min-length hint and `selectedGame?.installMethod` / `selectedGame?.spec?.requiresJava` for the notice text. Replace the long hardcoded notice `if/else` chain with a generic notice derived from `installMethod` + `requiredDiskGB` (e.g. "Requires SteamCMD. ~{requiredDiskGB}GB download.") and a Java note when `spec.requiresJava`.

- [ ] **Step 2: Update handleSubmit to post definitionId**

Replace the body of the `fetch("/api/servers", ...)` call:
```ts
        body: JSON.stringify({
          name: name.trim(),
          definitionId: selectedGame.id,
          ramAllocation: ram,
          password: password || null,
          enableUpnp,
          paramValues, // from Task 20; default {} until then
        }),
```
Keep the client-side password guard but make it generic:
```ts
    const minLen = selectedGame?.spec?.passwordPolicy?.minLength;
    if (minLen && (!password || password.length < minLen)) {
      setError(`${selectedGame.displayName} requires a password of at least ${minLen} characters.`);
      return;
    }
```

- [ ] **Step 3: Add the "+ Custom Game" card**

After the `defs.map(...)` grid items, add a card:
```tsx
<Link href="/dashboard/definitions/new" className="p-4 rounded-xl border border-dashed border-white/15 bg-slate-950/20 hover:border-accentPurple/50 flex flex-col items-center justify-center h-40 text-slate-400 hover:text-accentPurple transition-all">
  <Plus className="w-6 h-6 mb-2" />
  <span className="font-bold text-sm">Custom Game</span>
  <span className="text-[11px] mt-0.5">Define your own server</span>
</Link>
```

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit && rtk next build`
Expected: no errors.

- [ ] **Step 5: Commit**
```bash
rtk git add src/components/CreateServerView.tsx
rtk git commit -m "feat: render server catalog from definitions API"
```

---

### Task 20: Dynamic param form on the create-server step

**Files:**
- Create: `src/components/DefinitionParamFields.tsx`
- Modify: `src/components/CreateServerView.tsx`

**Interfaces:**
- Consumes: a definition's `spec.params` (ParamSpec[]).
- Produces: `DefinitionParamFields({ params, values, onChange }): JSX` — renders a typed field per param (text input / number input / checkbox / select), calling `onChange(key, value)` with correctly-typed values (number for `number`, boolean for `boolean`). `CreateServerView` holds `paramValues` state initialized to each param's default when a definition is selected.

- [ ] **Step 1: Implement the component**

Create `src/components/DefinitionParamFields.tsx`:
```tsx
"use client";
import React from "react";

export interface ParamSpec {
  key: string; label: string; type: "text" | "number" | "boolean" | "enum";
  default?: string | number | boolean; options?: string[]; min?: number; max?: number; required?: boolean;
}

export default function DefinitionParamFields({
  params, values, onChange,
}: { params: ParamSpec[]; values: Record<string, any>; onChange: (key: string, value: any) => void; }) {
  if (!params?.length) return null;
  return (
    <div className="space-y-4">
      <label className="text-xs font-bold text-mutedText tracking-wider uppercase block">Game Settings</label>
      <div className="grid sm:grid-cols-2 gap-4">
        {params.map((p) => (
          <div key={p.key}>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1">{p.label}{p.required && <span className="text-red-400"> *</span>}</label>
            {p.type === "boolean" ? (
              <input type="checkbox" checked={!!values[p.key]} onChange={(e) => onChange(p.key, e.target.checked)} className="w-4 h-4 accent-accentPurple" />
            ) : p.type === "enum" ? (
              <select value={values[p.key] ?? ""} onChange={(e) => onChange(p.key, e.target.value)} className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-white/5 text-sm text-slate-200">
                {p.options?.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input type={p.type === "number" ? "number" : "text"} value={values[p.key] ?? ""} min={p.min} max={p.max}
                onChange={(e) => onChange(p.key, p.type === "number" ? Number(e.target.value) : e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-white/5 text-sm text-slate-200" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into CreateServerView**

- Add `const [paramValues, setParamValues] = useState<Record<string, any>>({});`
- When a definition is selected (in the select handler / fetch effect), initialize: `const init: Record<string, any> = {}; (game.spec?.params ?? []).forEach((p: any) => { if (p.default !== undefined) init[p.key] = p.default; }); setParamValues(init);`
- Render `<DefinitionParamFields params={selectedGame?.spec?.params ?? []} values={paramValues} onChange={(k, v) => setParamValues((s) => ({ ...s, [k]: v }))} />` between the password and RAM sections.
- Ensure `handleSubmit` already sends `paramValues` (Task 19 Step 2).

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit && rtk next build`
Expected: no errors.

- [ ] **Step 4: Commit**
```bash
rtk git add src/components/DefinitionParamFields.tsx src/components/CreateServerView.tsx
rtk git commit -m "feat: dynamic param form for definitions"
```

---

### Task 21: Custom definition editor (3 tabs)

**Files:**
- Create: `src/app/dashboard/definitions/new/page.tsx`
- Create: `src/components/DefinitionEditor.tsx`

**Interfaces:**
- Consumes: `POST /api/definitions`; the current user's `role` (passed from the server component page, fetched via `getAuthenticatedUser`).
- Produces: a 3-tab editor (SteamCMD / Download / Custom Script) that builds a `GameDefinitionSpec` and submits it. The Custom Script tab is hidden/disabled unless `role === "ADMIN"` and shows a warning + acknowledgement checkbox that must be checked before submit. On success, routes to `/dashboard/servers/new`.

- [ ] **Step 1: Create the page (server component) that passes role**

Create `src/app/dashboard/definitions/new/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import DefinitionEditor from "@/components/DefinitionEditor";

export default async function NewDefinitionPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  return <DefinitionEditor isAdmin={user.role === "ADMIN"} />;
}
```
(If `getAuthenticatedUser` doesn't return `role`, add it to its select — same check as Task 15.)

- [ ] **Step 2: Implement the editor component**

Create `src/components/DefinitionEditor.tsx` — a `"use client"` component with:
- Tab state: `"STEAMCMD" | "DOWNLOAD" | "CUSTOM_SCRIPT"`; Custom Script tab rendered only when `isAdmin`.
- Common fields: `displayName`, `icon`, `description`, `recommendedRamGB`, `defaultPort`.
- Per-tab install fields:
  - STEAMCMD: `appId`, `installSubDir`, `checkFile`, `requiredDiskGB`.
  - DOWNLOAD: `url`, `fileName`, `checkFile`, `unzip` (checkbox), `installSubDir` (optional).
  - CUSTOM_SCRIPT: `installScript` (textarea), `launchScript` (textarea), plus the warning + `ack` checkbox.
- Launch fields (STEAMCMD/DOWNLOAD): `executable`, `args` (a simple repeatable list of strings → mapped to `ArgSpec[]`), `cwdSubDir`.
- A params builder: rows of `{ key, label, type, default, options(csv), min, max, required }` → `ParamSpec[]`.
- A config-files builder: rows of `{ path, template }` with `strategy: "template"` (custom defs only use template).
- A ports builder: rows of `{ protocol, port }`.
- On submit: assemble `spec: GameDefinitionSpec`, then `POST /api/definitions` with `{ displayName, icon, color, description, recommendedRamGB, installMethod: tab, spec }`. Surface 4xx error text. Block submit if `CUSTOM_SCRIPT` and not `ack`.

Keep it pragmatic: a single scrolling form with a tab switcher at the top. Use the same Tailwind classes/visual language as `CreateServerView.tsx`. Provide sensible default `color` (the slate gradient default) — no color picker needed for v1.

Warning block (Custom Script tab):
```tsx
<div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
  <p className="font-bold">⚠️ Custom scripts run with this app's privileges on this host.</p>
  <p className="mt-1">Only run scripts you trust. They can read and modify any file your account can.</p>
  <label className="flex items-center gap-2 mt-3 text-slate-200">
    <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="accent-accentPurple" />
    I understand and accept the risk.
  </label>
</div>
```

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit && rtk next build`
Expected: no errors.

- [ ] **Step 4: Manual smoke**

Start the app (`rtk npm run dev`), go to `/dashboard/definitions/new`, create a simple SteamCMD definition (e.g. a test App ID), confirm it appears in the catalog at `/dashboard/servers/new`. As a non-admin, confirm the Custom Script tab is absent. (Use the `verify` skill / manual QA.)

- [ ] **Step 5: Commit**
```bash
rtk git add src/app/dashboard/definitions/new/page.tsx src/components/DefinitionEditor.tsx
rtk git commit -m "feat: custom definition editor with 3 tabs"
```

---

### Task 22: Final integration verification

**Files:** none (verification only)

- [ ] **Step 1: Full test + type + build**

Run: `npx tsc --noEmit && rtk npm test && rtk next build`
Expected: type-check clean, all unit tests pass, build succeeds.

- [ ] **Step 2: Fresh-DB end-to-end (manual)**

```bash
rtk npx prisma migrate reset --force   # recreates DB, runs migrations + seed
```
Then:
- Register the first account → confirm `role = ADMIN` (node check from Task 14).
- `/dashboard/servers/new` shows all 8 built-ins.
- Create + start a built-in server (e.g. Terraria — smallest download) and confirm it installs and runs via the new engine (parity already unit-tested; this confirms the imperative shell).
- Create a custom SteamCMD definition and a server from it.
- As an admin, create a Custom Script definition; confirm the warning gate.

- [ ] **Step 3: Spawn a follow-up note if any built-in QA regresses**

If manual QA surfaces a behavior difference for a specific game, capture it as a parity-test gap (add the failing case to `parity.test.ts`) before patching.

- [ ] **Step 4: Final commit (if any verification fixes were needed)**
```bash
rtk git add -A
rtk git commit -m "chore: integration verification fixes for custom definitions"
```

---

## Self-Review

**Spec coverage:**
- Unified `GameDefinition` schema → Tasks 2, 10. ✓
- Three install modes (SteamCMD/Download/Custom Script) → spec `install` union + Task 13 engine + Task 21 tabs. ✓
- Per-user private + global built-ins → Task 10 (`ownerId`, `@@unique`), Tasks 15/16 ownership guards. ✓
- Fixed fields + custom typed params → Tasks 2, 5, 6, 20. ✓
- Templated launch args + config files → Tasks 4, 7, 13. ✓
- Built-ins seeded on first install + idempotent refresh → Tasks 11, 12. ✓
- Migration backfill (servers + users to ADMIN) → Task 12. ✓
- First registrant admin → Task 14. ✓
- Admin-gated custom scripts (server + UI) → Tasks 15, 16, 21. ✓
- Config editor from definition → Task 18. ✓
- Validation (unresolved vars, param types) → Task 6, enforced in Tasks 15/16/17. ✓
- Built-in parity safety net → Task 9. ✓
- Delete-in-use guard → Task 16. ✓
- Testing (unit + parity) → Tasks 1–9; integration/manual → Task 22. ✓

**Known scope notes (intentional):**
- React component testing uses type-check + build + manual smoke rather than RTL/jsdom — introducing a component test harness is out of scope for v1; pure logic (the risky part) is fully TDD-covered.
- Valheim server-side password enforcement is relaxed to a fallback (`viking123`) to preserve boot-ability; the client keeps the min-5 UX check. Noted in Task 17.
- `getGameSteamInfo` is left exported but unused after Task 13 (removable in a later cleanup).
- The `prisma/seed.js` ↔ `builtins.generated.json` mirror requires regeneration after editing built-ins (Task 11 documents the command in `builtins.ts`).

**Type consistency:** planner/return types (`InstallPlan`, `LaunchPlan`, `ConfigFilePlan`, `PortPlan`), context fields (`name/nameSanitized/password/port/ram/passwordEmpty` + params), and `KNOWN_FIXED_VARS` are referenced consistently across Tasks 2–9 and 13. `spec`/`paramValues` are `String` JSON everywhere (Global Constraints), accessed only through `serialize.ts`.
