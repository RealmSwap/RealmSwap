// Regenerates src/lib/definitions/builtins.generated.json from the source of
// truth in src/lib/definitions/builtins.ts. The JSON is a plain-Node mirror so
// prisma/seed.js can read the builtins without TS tooling — it must never be
// hand-edited. A parity test (src/lib/definitions/__tests__/generatedMirror.test.ts)
// fails CI when the mirror drifts.
//
// Usage: npx tsx scripts/generate-builtins-json.ts
import { BUILTIN_DEFINITIONS } from "../src/lib/definitions/builtins";
import fs from "fs";
import path from "path";

const outPath = path.join(__dirname, "..", "src", "lib", "definitions", "builtins.generated.json");
fs.writeFileSync(outPath, JSON.stringify(BUILTIN_DEFINITIONS, null, 2) + "\n");
console.log(`Wrote ${outPath} (${BUILTIN_DEFINITIONS.length} builtin definitions)`);
