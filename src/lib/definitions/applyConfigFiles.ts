import fs from "fs";
import path from "path";
import type { DefinitionContext, GameDefinitionSpec } from "./types";
import { planConfigFiles } from "./plan";
import { writeStrategyConfig } from "./strategies";
import { mergeConfigContent } from "./mergeConfig";

export interface ApplyConfigFilesOptions {
  installDir: string;
  server: { name: string; password: string | null };
}

/**
 * Write every config file the definition declares into `installDir`.
 *
 * Template files are merge-preserving: when the file already exists, the
 * rendered template's keys are merged into it so keys the definition doesn't
 * manage (and hand edits made through the raw config editor) survive the
 * rewrite that happens on every start. Strategy files delegate to their
 * dedicated writer (several of those already merge internally).
 *
 * Shared by the Local and Docker runners at start time and by the settings
 * API, which re-applies configs immediately when params change while a server
 * is stopped.
 */
export function applyConfigFiles(
  spec: GameDefinitionSpec,
  ctx: DefinitionContext,
  opts: ApplyConfigFilesOptions
): void {
  for (const cf of planConfigFiles(spec, ctx)) {
    const full = path.join(opts.installDir, cf.relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (cf.strategy === "template") {
      const rendered = cf.content ?? "";
      let out = rendered;
      if (fs.existsSync(full)) {
        try {
          out = mergeConfigContent(fs.readFileSync(full, "utf-8"), rendered);
        } catch {
          out = rendered; // unreadable existing file — regenerate from template
        }
      }
      fs.writeFileSync(full, out, "utf-8");
    } else {
      writeStrategyConfig({
        strategy: cf.strategy as "enshroudedJson" | "zomboidIniMerge",
        installDir: opts.installDir,
        serverName: opts.server.name,
        password: opts.server.password || undefined,
        slotCount: typeof ctx.slotCount === "number" ? ctx.slotCount : undefined,
      });
    }
  }
}
