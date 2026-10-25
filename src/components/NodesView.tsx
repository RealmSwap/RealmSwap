"use client";

import React, { useEffect, useState } from "react";
import { Server, Plus, Copy, Check, Trash2, Loader2, CircleDot } from "lucide-react";

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

export default function NodesView({ user }: { user: { id: string; role: string } }) {
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

  const registerCommand = enroll
    ? `npx realmswap-agent register --server ${typeof window !== "undefined" ? window.location.origin : ""} --token ${enroll.token}`
    : "";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Server className="w-6 h-6 text-accent" /> Nodes
        </h1>
        <p className="text-sm text-mutedText mt-1">
          Machines running the RealmSwap agent host game servers in Docker, managed from this dashboard.
          Deploy to a node from the server create form.
        </p>
      </div>

      {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{error}</div>}

      {isAdmin && (
        <div className="flex gap-2 items-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Node name (e.g. Synology NAS)"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={createNode}
            disabled={creating || !name.trim()}
            className="flex items-center gap-2 bg-accent text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Node
          </button>
        </div>
      )}

      {enroll && (
        <div className="border border-accent/40 bg-accent/5 rounded-xl p-4 space-y-2">
          <div className="text-sm font-medium">Enroll &lsquo;{enroll.nodeName}&rsquo;</div>
          <p className="text-xs text-mutedText">
            On the node machine, run (token is single-use, expires in 24h, shown once):
          </p>
          <div className="flex items-center gap-2 bg-black/40 rounded-lg px-3 py-2 font-mono text-xs break-all">
            <span className="flex-1">{registerCommand}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(registerCommand);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="shrink-0"
              title="Copy"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-mutedText">Loading…</div>
      ) : nodes.length === 0 ? (
        <div className="text-sm text-mutedText border border-white/10 rounded-xl p-6 text-center">
          No nodes yet. {isAdmin ? "Add one, then run the register command on the target machine." : "Ask an admin to add one."}
        </div>
      ) : (
        <div className="space-y-3">
          {nodes.map((n) => (
            <div key={n.id} className="border border-white/10 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CircleDot className={`w-4 h-4 ${n.online ? "text-green-400" : n.status === "ACTIVE" ? "text-amber-400" : "text-mutedText"}`} />
                  <span className="font-medium truncate">{n.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full border border-white/10 text-mutedText">{n.status}</span>
                </div>
                <div className="text-xs text-mutedText mt-1 truncate">
                  {[
                    n.platform && n.arch ? `${n.platform}/${n.arch}` : null,
                    n.dockerVersion ? `Docker ${n.dockerVersion}` : null,
                    n.totalRamMB
                      ? `${(n.assignedRamGB || 0).toFixed(0)}/${(n.totalRamMB / 1024).toFixed(0)} GB RAM assigned`
                      : null,
                    n.freeDiskGB != null ? `${n.freeDiskGB} GB free` : null,
                    n.totalServers ? `${n.runningServers} of ${n.totalServers} servers running` : "no servers",
                    n.lanIp ? n.lanIp : null,
                    n.lastSeenAt ? `last seen ${new Date(n.lastSeenAt).toLocaleTimeString()}` : "never seen",
                  ].filter(Boolean).join(" · ")}
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={() => revoke(n.id, n.name)}
                  className="shrink-0 text-mutedText hover:text-red-400"
                  title="Revoke node"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
