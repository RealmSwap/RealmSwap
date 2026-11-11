"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, ShieldAlert } from "lucide-react";

interface ImportPreview {
  displayName: string;
  description: string;
  icon: string;
  recommendedRamGB: number;
  definition: {
    installMethod: "STEAMCMD" | "DOWNLOAD";
    source: string;
    executable: string;
    usesBundledJava: boolean;
    args: string[];
    envNames: string[];
    configFiles: string[];
    ports: string[];
  };
}

const MAX_FILE_BYTES = 256 * 1024;

/**
 * "Someone sent me a game definition file." Reads the file, asks the server
 * what it would install and run, and only adds the game after the user has
 * seen that and agreed.
 */
export function DefinitionFileImport() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ file: unknown; preview: ImportPreview } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (file: unknown, confirm: boolean) => {
    const res = await fetch("/api/definitions/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(confirm ? { file, confirm: true } : { file }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : `Import failed (${res.status}).`);
    return data;
  };

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = ""; // picking the same file again must fire onChange
    if (!picked) return;
    setError(null);
    setPending(null);
    if (picked.size > MAX_FILE_BYTES) {
      setError("That file is too large to be a game definition.");
      return;
    }
    setBusy(true);
    try {
      let file: unknown;
      try {
        file = JSON.parse(await picked.text());
      } catch {
        throw new Error("That file isn't valid JSON.");
      }
      const data = await send(file, false);
      setPending({ file, preview: data.preview });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await send(pending.file, true);
      router.push("/dashboard/servers/new");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
      setBusy(false);
    }
  };

  const row = (label: string, value: string) => (
    <div>
      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">{label}</span>
      <code className="block text-xs text-slate-200 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 break-all">{value}</code>
    </div>
  );

  return (
    <div className="glass-panel rounded-2xl border border-white/5 p-5 max-w-4xl mb-6">
      <input ref={inputRef} type="file" accept=".json,application/json" className="hidden" onChange={onPick} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-sm text-white">Have a definition file?</h2>
          <p className="text-xs text-mutedText mt-0.5">
            Import a <code className="text-slate-300">.realmswap-game.json</code> someone shared instead of filling in the form.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-200 bg-slate-900 border border-white/10 hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          <UploadCloud className="w-4 h-4" />
          Import from file
        </button>
      </div>

      {error && (
        <div role="alert" className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {pending && (
        <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
          <p className="text-sm text-slate-200">
            <span className="mr-1.5">{pending.preview.icon}</span>
            <span className="font-bold">{pending.preview.displayName}</span>
            {pending.preview.description && <span className="text-mutedText"> — {pending.preview.description}</span>}
          </p>
          <p className="text-xs text-mutedText">Servers you create with this game will:</p>
          {row(
            pending.preview.definition.installMethod === "STEAMCMD" ? "Download from Steam" : "Download this file",
            pending.preview.definition.source
          )}
          {row(
            "Then run this program each time the server starts",
            `${pending.preview.definition.usesBundledJava ? "java (RealmSwap's bundled Java)" : pending.preview.definition.executable}${
              pending.preview.definition.args.length ? ` ${pending.preview.definition.args.join(" ")}` : ""
            }`
          )}
          {pending.preview.definition.configFiles.length > 0 &&
            row("Write these config files in the server folder", pending.preview.definition.configFiles.join(", "))}
          {pending.preview.definition.envNames.length > 0 &&
            row("Set these environment variables for it", pending.preview.definition.envNames.join(", "))}
          <p className="text-xs text-amber-200/90 leading-relaxed bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5">
            RealmSwap checked that this is everything the definition does — no scripts, and nothing outside the server&rsquo;s own folder. It can&rsquo;t check what the program itself does once it&rsquo;s running. Only add it if you trust where it comes from.
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => setPending(null)}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-300 bg-slate-900 border border-white/10 hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={confirm}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 transition-colors"
            >
              I trust this — add the game
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
