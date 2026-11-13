import { spawn, type SpawnOptions } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Windows-side plumbing for "wake this PC before game night": a one-shot
 * scheduled task whose only job is the wake itself (WakeToRun), recreated
 * ahead of each upcoming scheduled start. A sleeping machine cannot send
 * itself a Wake-on-LAN packet, so for the PC RealmSwap runs on, a wake timer
 * is the mechanism that works.
 *
 * The user's Windows power plan must allow wake timers; readWakeTimerPolicy()
 * reports what Windows is set to so the UI can say so instead of failing
 * silently.
 */

export const WAKE_TASK_NAME = "RealmSwap\\Wake for scheduled start";
export const WAKE_TASK_DESCRIPTION =
  "Created by RealmSwap so this PC is awake for a scheduled server start. Deleted and recreated as plans change.";

export type TaskExec = (file: string, args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;

/** Task Scheduler stores local wall-clock time, seconds precision, no zone. */
export function toTaskLocalTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/**
 * The trigger ends an hour after the wake moment and the task deletes itself
 * when expired, so a plan that never got updated (crash, power loss) leaves
 * nothing behind that wakes the machine a week later.
 */
export function buildWakeTaskXml(opts: { at: Date; command: string; args?: string }): string {
  const start = toTaskLocalTime(opts.at);
  const end = toTaskLocalTime(new Date(opts.at.getTime() + 60 * 60_000));
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const argumentsLine = opts.args ? `\n      <Arguments>${escape(opts.args)}</Arguments>` : "";
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>${escape(WAKE_TASK_DESCRIPTION)}</Description>
  </RegistrationInfo>
  <Triggers>
    <TimeTrigger>
      <StartBoundary>${start}</StartBoundary>
      <EndBoundary>${end}</EndBoundary>
      <Enabled>true</Enabled>
    </TimeTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>
    <DeleteExpiredTaskAfter>PT0S</DeleteExpiredTaskAfter>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${escape(opts.command)}</Command>${argumentsLine}
    </Exec>
  </Actions>
</Task>
`;
}

/** schtasks insists on the declared encoding: UTF-16 with a BOM. */
export function taskXmlBuffer(xml: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, "utf16le")]);
}

export const defaultExec: TaskExec = (file, args) =>
  new Promise((resolve, reject) => {
    const options: SpawnOptions = { windowsHide: true };
    const child = spawn(file, args, options);
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 20_000);
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });

/** Register (or replace) the wake task for an instant. `action` is what the task runs once the PC is up. */
export async function registerWakeTask(
  at: Date,
  action: { command: string; args?: string },
  exec: TaskExec = defaultExec,
): Promise<void> {
  const xmlPath = path.join(os.tmpdir(), `realmswap-wake-${Date.now()}.xml`);
  fs.writeFileSync(xmlPath, taskXmlBuffer(buildWakeTaskXml({ at, ...action })));
  try {
    const res = await exec("schtasks", ["/Create", "/F", "/TN", WAKE_TASK_NAME, "/XML", xmlPath]);
    if (res.code !== 0) throw new Error(`schtasks /Create failed: ${(res.stderr || res.stdout).trim()}`);
  } finally {
    fs.rmSync(xmlPath, { force: true });
  }
}

/** Remove the task; a task that already ran itself to expiry counts as removed. */
export async function clearWakeTask(exec: TaskExec = defaultExec): Promise<void> {
  const res = await exec("schtasks", ["/Delete", "/F", "/TN", WAKE_TASK_NAME]);
  const notFound = res.code !== 0 && /cannot find|does not exist|not an internal/i.test(res.stderr + res.stdout);
  if (res.code !== 0 && !notFound) throw new Error(`schtasks /Delete failed: ${(res.stderr || res.stdout).trim()}`);
}

export type WakeTimerPolicy = "enabled" | "important-only" | "disabled" | "unknown";

/**
 * Windows ignores wake timers unless the active power plan allows them
 * (Power Options → Sleep → Allow wake timers). Read what it is set to so the
 * UI can say why a wake didn't happen instead of leaving it a mystery.
 */
export function parseWakeTimerPolicy(output: string): { ac: WakeTimerPolicy; dc: WakeTimerPolicy } {
  const indexes = Array.from(output.matchAll(/0x([0-9a-fA-F]{8})\s*$/gm)).map((m) => parseInt(m[1], 16));
  const toPolicy = (n: number): WakeTimerPolicy =>
    n === 1 ? "enabled" : n === 2 ? "important-only" : n === 0 ? "disabled" : "unknown";
  if (indexes.length < 2) return { ac: "unknown", dc: "unknown" };
  const [ac, dc] = indexes.slice(-2);
  return { ac: toPolicy(ac), dc: toPolicy(dc) };
}

export async function readWakeTimerPolicy(exec: TaskExec = defaultExec): Promise<{ ac: WakeTimerPolicy; dc: WakeTimerPolicy }> {
  const res = await exec("powercfg", ["/query", "SCHEME_CURRENT", "SUB_SLEEP", "RTCWAKE"]);
  if (res.code !== 0) return { ac: "unknown", dc: "unknown" };
  return parseWakeTimerPolicy(res.stdout);
}
