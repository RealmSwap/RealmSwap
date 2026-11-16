"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, UploadCloud, X } from "lucide-react";

/**
 * "Publish as Realm" dialog: publishes a local server's live setup to the
 * marketplace. The metadata comes from the user; the payload is built
 * server-side from the machine (buildRealmPayloadFromServer), so nothing here
 * is hand-crafted.
 */
export function PublishRealmModal({ server, onClose }: { server: any; onClose: () => void }) {
  // "My Server - Deployed" reads better in the marketplace without the
  // suffix the deploy flow stamps on (the server-side default strips it too).
  const defaultName = (server.name || "").replace(/\s*-\s*Deployed$/, "");
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState(
    `Deploy '${defaultName}' — the exact setup from a working RealmSwap server, boot-tested on deploy (Minecraft, Valheim, Project Zomboid, and Terraria today).`
  );
  const [tags, setTags] = useState(`${server.game},Community`);
  const [version, setVersion] = useState("1.0.0");
  const [publishing, setPublishing] = useState(false);
  // Set after a successful publish that carried warnings: the modal then
  // shows the amber list until the user clicks OK.
  const [successWarnings, setSuccessWarnings] = useState<string[] | null>(null);

  const submit = async () => {
    setPublishing(true);
    try {
      const res = await fetch(`/api/servers/${server.id}/publish-realm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, tags, version }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to publish realm");

      const summary = data.summary
        ? ` (${data.summary.modCount} mods${data.summary.hasModpack ? ", modpack included" : ""})`
        : "";
      toast.success(`Published '${data.name || name}' to the marketplace${summary}`);
      if (Array.isArray(data.warnings) && data.warnings.length > 0) {
        setSuccessWarnings(data.warnings);
      } else {
        onClose();
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex justify-between items-center p-5 border-b border-slate-800">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-accentBlue" />
            Publish as Realm
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            disabled={publishing}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-300 mb-1.5">Realm name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accentBlue transition-colors"
              placeholder="e.g. Valheim Hardcore PvP"
              disabled={publishing || successWarnings !== null}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-300 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accentBlue transition-colors resize-none h-24"
              placeholder="Describe your server setup and configuration..."
              disabled={publishing || successWarnings !== null}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-300 mb-1.5">Tags</label>
            <input
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              className="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accentBlue transition-colors"
              placeholder="MINECRAFT,Community"
              disabled={publishing || successWarnings !== null}
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-300 mb-1.5">Version</label>
            <input
              type="text"
              value={version}
              onChange={e => setVersion(e.target.value)}
              className="w-full bg-black/40 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accentBlue transition-colors"
              placeholder="1.0.0"
              disabled={publishing || successWarnings !== null}
            />
          </div>

          {successWarnings && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs space-y-1">
              <span className="font-bold block">Published with warnings:</span>
              <ul className="list-disc list-inside space-y-0.5">
                {successWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="p-5 bg-slate-950 flex justify-end gap-3 border-t border-slate-800">
          {successWarnings ? (
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg font-bold text-sm bg-accentBlue hover:bg-blue-500 text-white transition-all shadow-lg shadow-accentBlue/20"
            >
              OK
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg font-bold text-sm hover:bg-white/5 transition-colors"
                disabled={publishing}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={publishing || !name || !description}
                className="flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-sm bg-accentBlue hover:bg-blue-500 disabled:opacity-50 text-white transition-all shadow-lg shadow-accentBlue/20"
              >
                {publishing ? <><Loader2 className="w-4 h-4 animate-spin" /> Publishing...</> : <><UploadCloud className="w-4 h-4" /> Publish</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
