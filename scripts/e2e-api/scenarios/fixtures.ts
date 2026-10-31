/**
 * Shared scenario fixtures: an SSE collector for the live install-progress
 * stream, crafted jars/zips for the quarantine + preflight failure paths, and
 * a multipart POST helper (the JSON client can't upload files).
 */

import AdmZip from "adm-zip";
import { expect } from "../client";
import type { ApiClient } from "../client";

/**
 * Subscribes to an install-progress SSE stream and parses frames while the
 * caller runs the install POST concurrently. Resolves on the terminal
 * `done`/`error` frame (the route closes the stream ~200ms later) or when the
 * server closes the stream.
 */
export interface SseResult {
  events: Array<{ event: string; stage?: string; label?: string; error?: string; current?: number; total?: number; bootLines?: string[] }>;
  closed: boolean;
}

export function openSse(path: string, client: ApiClient) {
  const events: SseResult["events"] = [];
  const controller = new AbortController();

  const done = async (timeoutMs: number): Promise<SseResult> => {
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      const res = await fetch(`${client.baseUrl}${path}`, {
        headers: { cookie: client.cookie() },
        signal: controller.signal,
      });
      expect(res.status === 200, `SSE ${path} → ${res.status}`);
      expect(
        (res.headers.get("content-type") || "").includes("text/event-stream"),
        `SSE content-type → ${res.headers.get("content-type")}`
      );
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let closed = false;
      for (;;) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) {
          closed = true;
          break;
        }
        buf += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, sep);
          buf = buf.slice(sep + 2);
          const fields: Record<string, string> = {};
          for (const line of block.split("\n")) {
            if (line.startsWith(":")) continue; // heartbeat comment
            const m = line.match(/^(\w+):\s?(.*)$/);
            if (m) fields[m[1]] = m[2];
          }
          if (fields.data === undefined) continue;
          try {
            events.push({ event: fields.event ?? "message", ...JSON.parse(fields.data) });
          } catch {
            events.push({ event: fields.event ?? "message", error: fields.data });
          }
        }
        const last = events.at(-1);
        if (last && (last.stage === "done" || last.stage === "error")) break;
      }
      return { events, closed };
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    events,
    done,
    abort: () => controller.abort(),
  };
}

/**
 * A jar that resolves fine but dies at entrypoint instantiation: valid zip,
 * valid fabric.mod.json, entrypoint class that is not loadable. The crash
 * output names both the mod id (e2ebomb) and the class package
 * (com.e2ebomb.Bomb), so every quarantine attribution path — crash report,
 * mod-identifier index, class-package index — can find it.
 */
export function makeBombJar(): Buffer {
  const zip = new AdmZip();
  zip.addFile(
    "fabric.mod.json",
    Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        id: "e2ebomb",
        version: "1.0.0",
        name: "E2E Bomb",
        environment: "*",
        entrypoints: { main: ["com.e2ebomb.Bomb"] },
      })
    )
  );
  zip.addFile("com/e2ebomb/Bomb.class", Buffer.from("not actually a jvm class file"));
  return zip.toBuffer();
}

/** Plain garbage bytes — the zip-open preflight must refuse this with a 400. */
export function makeBadZip(): Buffer {
  return Buffer.from("RealmSwap e2e fixture: this is deliberately not a zip archive");
}

/** POST a file as multipart/form-data with the session cookie. */
export async function postMultipart(
  client: ApiClient,
  path: string,
  fieldName: string,
  file: { data: Buffer; filename: string; type?: string },
  extraFields: Record<string, string> = {}
): Promise<{ status: number; body: any; text: string }> {
  const form = new FormData();
  form.append(fieldName, new Blob([new Uint8Array(file.data)], { type: file.type ?? "application/octet-stream" }), file.filename);
  for (const [k, v] of Object.entries(extraFields)) form.append(k, v);
  const res = await fetch(`${client.baseUrl}${path}`, {
    method: "POST",
    headers: { cookie: client.cookie() },
    body: form,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: res.status, body, text };
}

/** POST a raw binary body (the JSON client can't send non-JSON payloads). */
export async function postRaw(
  client: ApiClient,
  path: string,
  body: Buffer,
  contentType = "application/octet-stream"
): Promise<{ status: number; headers: Headers; body: any; text: string }> {
  const res = await fetch(`${client.baseUrl}${path}`, {
    method: "POST",
    headers: { cookie: client.cookie(), "content-type": contentType },
    body: new Uint8Array(body),
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { status: res.status, headers: res.headers, body: parsed, text };
}

/** GET a raw binary response (export streams a .realm tar, not JSON). */
export async function getBinary(
  client: ApiClient,
  path: string
): Promise<{ status: number; headers: Headers; bytes: Buffer }> {
  const res = await fetch(`${client.baseUrl}${path}`, { headers: { cookie: client.cookie() } });
  const bytes = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, bytes };
}

/** Minimal config file the config route can parse, round-trip, and rewrite. */
export const E2E_CONFIG_TOML = [
  "# RealmSwap e2e fixture config",
  "[realmswape2e]",
  'message = "hello-from-e2e"',
  "enabled = true",
  "",
].join("\n");
