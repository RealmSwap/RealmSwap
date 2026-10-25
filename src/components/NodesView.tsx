"use client";

import React, { useEffect, useState } from "react";
import { SidebarNavigation } from "@/components/dashboard/SidebarNavigation";
import { Server, Plus, Copy, Check, Trash2, Loader2 } from "lucide-react";

/**
 * Remote agent nodes — machines running the RealmSwap agent that host game
 * servers as sibling Docker containers, managed from this dashboard.
 * ADMIN-only surface: mint enrollments, revoke nodes. Any member can read
 * the list (the create form needs it for the deploy-to picker).
 */

interface AgentNodeRow {
  id: string;
  name: string;
  status: string;
  platform: string | null;
  arch: string | null;
  agentVersion: string | null;
  dockerVersion: string | null;
  lanIp: string | null;
  totalRamMB: number | null;
  freeDiskGB: number | null;
  assignedRamGB: number;
  totalServers: number;
  runningServers: number;
  lastSeenAt: string | null;
  online: boolean;
}

export default function NodesView({ user }: { user: { id: string; role: string; name?: string } }) {
  const [nodes, setNodes] = useState<AgentNodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [enroll, setEnroll] = useState<{ nodeName: string; token: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = user.role === "ADMIN";

  const load = () =>
    fetch("/api/nodes")
      .then((r) => (r.ok ? r.json() : { nodes: [] }))
      .then((d) => setNodes(d.nodes || []))
      .catch(() => setError("Failed to load nodes"))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const createNode = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create enrollment");
      setEnroll({ nodeName: data.node.name, token: data.enrollToken, expiresAt: data.enrollExpiresAt });
      setName("");
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: string, nodeName: string) => {
    if (!confirm(`Revoke node '${nodeName}'? Its agent loses access immediately and its servers are marked CRASHED.`)) return;
    const res = await fetch(`/api/nodes/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to revoke node");
      return;
    }
    load();
  };

  // The agent ships in this repo (npm run agent) — no standalone package yet.
  const registerCommand = enroll
    ? `npm run agent -- register --server ${typeof window !== "undefined" ? window.location.origin : ""} --token ${enroll.token}`
    : "";

  return (
    <div className="min-h-screen flex bg-[#030712] text-slate-100 font-sans selection:bg-accentPurple/30">
      <SidebarNavigation user={user} />

      <main className="flex-1 p-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-2">
          <Server className="w-6 h-6 text-accentPurple" />
          <h1 className="text-2xl font-bold">Nodes</h1>
        </div>
        <p className="text-sm text-mutedText mb-6 leading-relaxed max-w-2xl">
          Machines running the RealmSwap agent host game servers in Docker, managed from this dashboard.
          The agent dials home — nothing listens on the node. Deploy to a node from the server create form.
        </p>

        {error && (
          <div className="p-4 mb-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3 animate-slide-down">
            {error}
          </div>
        )}

        {isAdmin && (
          <section className="mb-8">
            <h2 className="text-lg font-bold text-white mb-1">Add a node</h2>
            <p className="text-xs text-mutedText mb-4">
              Mint a single-use enrollment token, then run the register command on the target machine.
            </p>
            <div className="p-4 rounded-xl bg-slate-900/40 border border-white/5 flex gap-2 items-center">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createNode()}
                placeholder="Node name (e.g. Synology NAS)"
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-accentPurple"
              />
              <button
                onClick={createNode}
                disabled={creating || !name.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accentPurple hover:bg-accentPurpleHover disabled:bg-accentPurple/50 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Node
              </button>
            </div>
          </section>
        )}

        {enroll && (
          <section className="mb-8">
            <h2 className="text-lg font-bold text-white mb-1">
              Enroll &lsquo;{enroll.nodeName}&rsquo;
            </h2>
            <div className="p-4 rounded-xl bg-accentPurple/10 border border-accentPurple/30 space-y-2 animate-slide-down">
              <p className="text-xs text-mutedText leading-relaxed">
                On the node machine (needs Node 22 + Docker): clone/download this repo, run{" "}
                <code className="font-mono text-slate-300">npm install</code>, then (token is single-use,
                expires in 24h, shown once):
              </p>
              <div className="flex items-center gap-2 bg-black/40 rounded-lg px-3 py-2 font-mono text-xs break-all">
                <span className="flex-1">{registerCommand}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(registerCommand);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="shrink-0 text-mutedText hover:text-white transition-colors"
                  title="Copy"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-mutedText">
                Then start the agent with{" "}
                <code className="font-mono text-slate-300">npm run agent -- run</code> (keep it running —
                tmux, systemd, or a startup task).
              </p>
            </div>
          </section>
        )}

        <section>
          <h2 className="text-lg font-bold text-white mb-1">Your nodes</h2>
          <p className="text-xs text-mutedText mb-4">
            {nodes.length > 0
              ? `${nodes.filter((n) => n.online).length} of ${nodes.length} online · refreshes every 10s`
              : "Enrolled machines appear here with their live resources."}
          </p>

          {loading ? (
            <div className="p-4 rounded-xl bg-slate-900/40 border border-white/5 text-sm text-mutedText">
              Loading nodes…
            </div>
          ) : nodes.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-900/40 border border-white/5 text-sm text-mutedText">
              No nodes yet. {isAdmin ? "Add one above, then run the register command on the target machine." : "Ask an admin to add one."}
            </div>
          ) : (
            <div className="space-y-3">
              {nodes.map((n) => {
                const totalGB = n.totalRamMB ? n.totalRamMB / 1024 : null;
                const assignedPct = totalGB ? Math.min(100, ((n.assignedRamGB || 0) / totalGB) * 100) : 0;
                return (
                  <div key={n.id} className="p-4 rounded-xl bg-slate-900/40 border border-white/5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              n.online ? "bg-emerald-400 animate-pulse" : n.status === "ACTIVE" ? "bg-amber-400" : "bg-slate-600"
                            }`}
                          />
                          <span className="text-sm font-bold truncate">{n.name}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                              n.online
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                : n.status === "ACTIVE"
                                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                                  : "bg-white/5 border-white/10 text-mutedText"
                            }`}
                          >
                            {n.online ? "ONLINE" : n.status === "ACTIVE" ? "STALE" : n.status}
                          </span>
                        </div>
                        <div className="text-xs text-mutedText mt-1 truncate">
                          {[
                            n.platform && n.arch ? `${n.platform}/${n.arch}` : null,
                            n.dockerVersion ? `Docker ${n.dockerVersion}` : null,
                            n.freeDiskGB != null ? `${n.freeDiskGB} GB disk free` : null,
                            n.totalServers ? `${n.runningServers} of ${n.totalServers} servers running` : "no servers",
                            n.lanIp ? n.lanIp : null,
                            n.lastSeenAt ? `last seen ${new Date(n.lastSeenAt).toLocaleTimeString()}` : "never seen",
                          ].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => revoke(n.id, n.name)}
                          className="shrink-0 text-mutedText hover:text-red-400 transition-colors"
                          title="Revoke node"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {totalGB != null && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          <span>RAM assigned to RealmSwap</span>
                          <span className="text-slate-400">
                            {(n.assignedRamGB || 0).toFixed(0)} / {totalGB.toFixed(0)} GB
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${assignedPct > 85 ? "bg-amber-400" : "bg-accentPurple"}`}
                            style={{ width: `${Math.max(assignedPct, 2)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
