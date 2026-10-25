import fs from "fs";
import os from "os";
import path from "path";
import { prisma } from "@/lib/db";
import { parseSpec } from "@/lib/definitions/serialize";
import { buildContext } from "@/lib/definitions/context";
import { planContainer, planPorts, planInstall } from "@/lib/definitions/plan";
import { applyConfigFiles } from "@/lib/definitions/applyConfigFiles";
import { buildContainerStartEntrypoint } from "./dockerCli";
import type { GameDefinitionSpec, InstallMethod } from "@/lib/definitions/types";
import type { StartCommandPayload } from "@/lib/agents/protocol";

/**
 * Compose the fully-resolved START payload a RemoteRunner ships to an agent:
 * everything DockerRunner computes in-process (container plan, ports,
 * entrypoint, rendered config files), rendered to data instead of to local
 * disk. The agent needs zero game knowledge — it writes the files, runs the
 * argv, and reports back.
 *
 * Uses the exact same plan* functions as DockerRunner so the two runtimes
 * cannot drift; parity is additionally guarded by definitions/parity tests.
 */

export interface DockerStartPlan {
  payload: StartCommandPayload;
  spec: GameDefinitionSpec;
}

export async function resolveDefinition(server: {
  definitionId: string | null;
  game: string;
}): Promise<{ spec: GameDefinitionSpec; installMethod: string }> {
  const record = server.definitionId
    ? await prisma.gameDefinition.findUnique({ where: { id: server.definitionId } })
    : await prisma.gameDefinition.findFirst({ where: { ownerId: null, slug: server.game.toUpperCase() } });
  if (!record) throw new Error(`No game definition found for server (game=${server.game}).`);
  return { spec: parseSpec(record.spec), installMethod: record.installMethod };
}

/** Render applyConfigFiles into memory: write to a temp dir, walk, read back. */
export function renderConfigFiles(
  spec: GameDefinitionSpec,
  ctx: ReturnType<typeof buildContext>,
  server: { name: string; password: string | null }
): { relPath: string; content: string }[] {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "realmswap-cfg-"));
  try {
    applyConfigFiles(spec, ctx, { installDir: tmp, server });
    const out: { relPath: string; content: string }[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else out.push({ relPath: path.relative(tmp, full).split(path.sep).join("/"), content: fs.readFileSync(full, "utf-8") });
      }
    };
    walk(tmp);
    return out;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export async function planDockerStart(record: {
  id: string;
  name: string;
  game: string;
  definitionId: string | null;
  port: number;
  ramAllocation: number;
  password: string | null;
  paramValues: string | null;
}): Promise<DockerStartPlan> {
  const { spec, installMethod } = await resolveDefinition(record);
  if (installMethod !== "STEAMCMD" && installMethod !== "DOWNLOAD") {
    throw new Error("Remote nodes currently support SteamCMD and download games only.");
  }
  const ctx = buildContext({
    name: record.name, password: record.password, port: record.port,
    ram: record.ramAllocation, paramValuesJson: record.paramValues, spec,
  });

  const container = planContainer(spec, ctx);
  if (!container) {
    throw new Error(`${record.game} has no container definition; it cannot run on a remote node.`);
  }
  const installPlan = planInstall(spec, installMethod as InstallMethod);
  const ports = planPorts(spec, ctx);

  return {
    spec,
    payload: {
      kind: "START",
      dataDirName: record.id,
      configFiles: renderConfigFiles(spec, ctx, { name: record.name, password: record.password }),
      containerName: `realmswap-server-${record.id}`,
      image: container.image,
      ports: ports.map((p) => ({ port: p.port, protocol: p.protocol })),
      env: container.env ?? null,
      entrypoint: buildContainerStartEntrypoint(installPlan, container),
      // Parity with DockerRunner: no container game declares a readyPattern,
      // so the 5-minute fallback is the readiness signal for all of them.
      readyFallbackMs: 5 * 60 * 1000,
    },
  };
}

/** UPDATE payload — mirrors DockerRunner.update's steamcmd invocation. */
export async function planDockerUpdate(record: {
  id: string;
  name: string;
  game: string;
  definitionId: string | null;
  port: number;
  ramAllocation: number;
  password: string | null;
  paramValues: string | null;
}): Promise<{ payload: import("@/lib/agents/protocol").UpdateCommandPayload; container: ReturnType<typeof planContainer> }> {
  const { spec, installMethod } = await resolveDefinition(record);
  if (installMethod !== "STEAMCMD") throw new Error("Updates are only supported for SteamCMD games.");
  const ctx = buildContext({
    name: record.name, password: record.password, port: record.port,
    ram: record.ramAllocation, paramValuesJson: record.paramValues, spec,
  });
  const container = planContainer(spec, ctx);
  if (!container) throw new Error("No container definition for this game.");
  const installPlan = planInstall(spec, "STEAMCMD");
  return {
    container,
    payload: {
      kind: "UPDATE",
      containerImage: container.image,
      dataDirName: record.id,
      steamcmdCmd:
        `steamcmd +force_install_dir /data/${container.installSubDir} +login anonymous` +
        ` +app_update ${installPlan.appId} validate +quit`,
    },
  };
}
