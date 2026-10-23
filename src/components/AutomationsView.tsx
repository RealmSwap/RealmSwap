"use client";

import { SidebarNavigation } from "@/components/dashboard/SidebarNavigation";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Play,
  Settings2,
  Trash2,
  AlertTriangle,
  CalendarDays,
  List,
  Power,
  History,
  X
} from "lucide-react";
import AutomationEditor from "./AutomationEditor";
import { expandOccurrences, EVENT_TRIGGER_TYPES } from "@/lib/automations/schedule";

interface AutomationsViewProps {
  servers: any[];
  user: any;
}

export default function AutomationsView({ servers, user }: AutomationsViewProps) {
  const router = useRouter();
  const [selectedServer, setSelectedServer] = useState<any | null>(servers[0] || null);
  const [automations, setAutomations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"LIST" | "CALENDAR">("LIST");
  const [editingAutomation, setEditingAutomation] = useState<any | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [historyAutomation, setHistoryAutomation] = useState<any | null>(null);

  useEffect(() => {
    if (selectedServer) fetchAutomations(selectedServer.id);
  }, [selectedServer]);

  const fetchAutomations = async (serverId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/automations`);
      if (!res.ok) throw new Error("Failed to fetch automations");
      const data = await res.json();
      setAutomations(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAutomation = async (data: any) => {
    if (!selectedServer) return;
    try {
      let res;
      if (editingAutomation) {
        res = await fetch(`/api/servers/${selectedServer.id}/automations/${editingAutomation.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
      } else {
        res = await fetch(`/api/servers/${selectedServer.id}/automations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
      }
      
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || "Failed to save");
      
      await fetchAutomations(selectedServer.id);
      setShowEditor(false);
      setEditingAutomation(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRunNow = async (automationId: string) => {
    if (!selectedServer) return;
    try {
      const res = await fetch(`/api/servers/${selectedServer.id}/automations/${automationId}/execute`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to start execution");
      // Could poll or just refresh after a few seconds
      setTimeout(() => fetchAutomations(selectedServer.id), 2000);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (automationId: string) => {
    if (!selectedServer || !confirm("Delete this automation?")) return;
    try {
      await fetch(`/api/servers/${selectedServer.id}/automations/${automationId}`, { method: "DELETE" });
      setAutomations(automations.filter(a => a.id !== automationId));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleToggle = async (automation: any) => {
    if (!selectedServer) return;
    try {
      await fetch(`/api/servers/${selectedServer.id}/automations/${automation.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !automation.enabled })
      });
      setAutomations(automations.map(a => a.id === automation.id ? { ...a, enabled: !a.enabled } : a));
    } catch (err: any) {
      console.error(err);
    }
  };

  const getStatusColor = (enabled: boolean, execs: any[]) => {
    if (!enabled) return "bg-slate-500 text-slate-100 border-slate-600";
    if (execs.length === 0) return "bg-slate-700 text-white border-slate-600";
    const status = execs[0].status;
    if (status === "SUCCESS") return "bg-green-500/20 text-green-400 border-green-500/30";
    if (status === "RUNNING") return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    if (status === "FAILED") return "bg-red-500/20 text-red-400 border-red-500/30";
    return "bg-slate-700 text-white border-slate-600";
  };
  
  // The engine's own nextRunAt is the source of truth — the view never
  // re-derives a schedule the scheduler might not honor.
  const describeNextRun = (a: any) => {
    if (a.triggerType === "SERVER_CRASH") return "When the server crashes";
    if (a.triggerType === "PLAYER_JOINED") return "When a player joins";
    if (a.triggerType === "PLAYER_LEFT") return "When a player leaves";
    if (a.triggerType === "ONE_TIME" && a.lastRunAt && !a.enabled) return "Ran once — switched off";
    if (a.nextRunAt) return new Date(a.nextRunAt).toLocaleString();
    return a.enabled ? "Not scheduled" : "Disabled";
  };

  // Real 7-day calendar: actual occurrences the scheduler would fire, plus a
  // separate strip for event triggers (they have no calendar dates).
  const buildCalendar = () => {
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(dayStart);
      d.setDate(d.getDate() + i);
      return d;
    });
    const byDay: Map<number, { name: string; time: string }[]> = new Map();
    for (const a of automations) {
      if (!a.enabled) continue;
      if ((EVENT_TRIGGER_TYPES as readonly string[]).includes(a.triggerType)) continue;
      let config = {};
      try { config = a.triggerConfig ? JSON.parse(a.triggerConfig) : {}; } catch {}
      let occurrences: Date[] = [];
      try { occurrences = expandOccurrences(a.triggerType, config, now, 7); } catch {}
      for (const occ of occurrences) {
        const idx = days.findIndex(d =>
          d.getFullYear() === occ.getFullYear() && d.getMonth() === occ.getMonth() && d.getDate() === occ.getDate()
        );
        if (idx < 0) continue;
        if (!byDay.has(idx)) byDay.set(idx, []);
        byDay.get(idx)!.push({
          name: a.name,
          time: occ.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
      }
    }
    return {
      days,
      byDay,
      eventTriggered: automations.filter(
        a => a.enabled && (EVENT_TRIGGER_TYPES as readonly string[]).includes(a.triggerType)
      ),
    };
  };
  const calendar = buildCalendar();

  return (
    <div className="min-h-screen flex bg-[#030712] text-slate-100 font-sans selection:bg-accentPurple/30">
      
      {/* Sidebar Navigation */}
      <SidebarNavigation user={user} />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-6 py-8 relative">
        {/* Navigation back */}
        <div className="mb-6">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-mutedText hover:text-accentPurple font-semibold transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </Link>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-black text-white flex items-center gap-3 tracking-tight">
              <Settings2 className="w-8 h-8 text-accentPurple" />
              Automation Engine
            </h1>
            <p className="text-slate-400 mt-2 text-sm font-medium">Workflows, schedules, and overnight update windows — everything that runs your servers on autopilot. (Update windows are set per server in Server Config → Game Settings.)</p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="bg-slate-900 border border-white/5 rounded-xl p-1 flex">
              <button 
                onClick={() => setViewMode("LIST")}
                className={`p-2 rounded-lg transition-colors ${viewMode === "LIST" ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-300"}`}
              >
                <List className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode("CALENDAR")}
                className={`p-2 rounded-lg transition-colors ${viewMode === "CALENDAR" ? "bg-slate-800 text-white" : "text-slate-500 hover:text-slate-300"}`}
              >
                <CalendarDays className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => { setEditingAutomation(null); setShowEditor(true); }}
              className="px-4 py-2 rounded-xl bg-accentPurple hover:bg-accentPurpleHover text-sm font-bold text-white transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> New Automation
            </button>
          </div>
        </div>

        {/* Server Target Bar */}
        <div className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <span className="text-xs font-bold text-mutedText uppercase tracking-wider block mb-1">Target Server</span>
            <span className="text-[11px] text-mutedText">Select which server's automations to manage.</span>
          </div>

          <div className="min-w-[200px]">
            {servers.length === 0 ? (
              <span className="text-xs text-red-400 font-bold">No servers deployed yet</span>
            ) : (
              <select
                value={selectedServer?.id || ""}
                onChange={(e) => setSelectedServer(servers.find(srv => srv.id === e.target.value) || null)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors cursor-pointer font-bold"
              >
                {servers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.game})</option>)}
              </select>
            )}
          </div>
        </div>

        {error && (
          <div className="p-4 mb-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-slate-500 text-sm font-medium animate-pulse">Loading automations...</div>
        ) : viewMode === "LIST" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
            {automations.map((a) => (
              <div key={a.id} className="bg-slate-900 border border-white/10 rounded-2xl p-5 hover:border-accentPurple/50 transition-all flex flex-col group">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-black text-white text-lg">{a.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getStatusColor(a.enabled, a.executions)}`}>
                        {a.enabled ? (a.executions[0]?.status || "READY") : "DISABLED"}
                      </span>
                      <span className="text-xs text-slate-400">{a.triggerType}</span>
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                     <button onClick={() => handleRunNow(a.id)} className="p-1.5 text-slate-400 hover:text-green-400 bg-slate-800 rounded-lg" title="Run Now">
                       <Play className="w-4 h-4" />
                     </button>
                    <button onClick={() => setHistoryAutomation(a)} className="p-1.5 text-slate-400 hover:text-accentPurple bg-slate-800 rounded-lg" title="Execution History">
                      <History className="w-4 h-4" />
                    </button>
                     <button onClick={() => { setEditingAutomation(a); setShowEditor(true); }} className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg" title="Edit">
                       <Settings2 className="w-4 h-4" />
                     </button>
                     <button onClick={() => handleToggle(a)} className="p-1.5 text-slate-400 hover:text-yellow-400 bg-slate-800 rounded-lg" title={a.enabled ? "Disable" : "Enable"}>
                       <Power className="w-4 h-4" />
                     </button>
                     <button onClick={() => handleDelete(a.id)} className="p-1.5 text-slate-400 hover:text-red-400 bg-slate-800 rounded-lg" title="Delete">
                       <Trash2 className="w-4 h-4" />
                     </button>
                  </div>
                </div>

                <div className="space-y-3 flex-1">
                  <div className="flex justify-between text-xs border-b border-white/5 pb-2">
                    <span className="text-slate-500">Actions</span>
                    <span className="font-bold text-slate-300">{a.actions.length} blocks</span>
                  </div>
                  <div className="flex justify-between text-xs border-b border-white/5 pb-2">
                    <span className="text-slate-500">Next Run</span>
                    <span className="font-bold text-slate-300">{describeNextRun(a)}</span>
                  </div>
                  <div className="flex justify-between text-xs border-white/5 pb-2">
                    <span className="text-slate-500">Last Executed</span>
                    <span className="font-bold text-slate-300">{a.executions[0] ? new Date(a.executions[0].startedAt).toLocaleString() : "Never"}</span>
                  </div>
                </div>
              </div>
            ))}
            {automations.length === 0 && (
              <div className="col-span-full py-16 text-center border border-dashed border-white/10 rounded-3xl">
                <Settings2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-white">No Automations Found</h3>
                <p className="text-slate-400 text-sm mt-1">Create your first workflow to automate tasks on this server.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 overflow-x-auto">
             <div className="min-w-[800px]">
                <h3 className="text-xl font-bold text-white mb-1">Next 7 Days</h3>
                <p className="text-xs text-slate-500 mb-6">Actual scheduled runs the automation engine will fire (today shows only what's still ahead).</p>
                <div className="grid grid-cols-7 gap-4">
                  {calendar.days.map((day, i) => (
                    <div key={i} className="font-bold text-xs text-slate-500 uppercase tracking-wider pb-2 border-b border-white/5 flex items-center gap-1.5">
                      {i === 0 && <span className="text-accentPurple">Today</span>}
                      <span>{day.toLocaleDateString([], { weekday: "short" })} {day.getMonth() + 1}/{day.getDate()}</span>
                    </div>
                  ))}

                  {calendar.days.map((_, i) => (
                    <div key={i} className="min-h-[120px] bg-slate-950/50 rounded-lg p-2 space-y-2 border border-white/5">
                       {(calendar.byDay.get(i) || []).map((item, j) => (
                         <div key={j} className="bg-accentPurple/10 border border-accentPurple/20 p-2 rounded text-xs">
                           <strong className="text-accentPurple block">{item.name}</strong>
                           <span className="text-slate-400">{item.time}</span>
                         </div>
                       ))}
                    </div>
                  ))}
                </div>

                {calendar.eventTriggered.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-white/5">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Event-triggered (not on the calendar)</span>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {calendar.eventTriggered.map(a => (
                        <span key={a.id} className="px-3 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 text-xs font-bold">
                          {a.triggerType === "SERVER_CRASH" ? "On Crash" : a.triggerType} · {a.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
             </div>
          </div>
        )}

      </main>

      {/* Editor Modal */}
      {showEditor && selectedServer && (
        <AutomationEditor
          server={selectedServer}
          automation={editingAutomation}
          onSave={handleSaveAutomation}
          onClose={() => setShowEditor(false)}
        />
      )}

      {/* Execution History Modal */}
      {historyAutomation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 overflow-y-auto">
          <div className="bg-[#030712] border border-white/10 rounded-2xl w-full max-w-2xl max-h-full flex flex-col shadow-2xl">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-white">Execution History</h2>
                <p className="text-slate-400 text-sm mt-1">{historyAutomation.name}</p>
              </div>
              <button onClick={() => setHistoryAutomation(null)} className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              {(historyAutomation.executions || []).length === 0 ? (
                <p className="text-sm text-slate-500 italic py-8 text-center">This automation has never run.</p>
              ) : (
                historyAutomation.executions.map((e: any) => {
                  let lines: string[] = [];
                  try {
                    lines = e.logs ? JSON.parse(e.logs) : [];
                  } catch {
                    lines = e.logs ? [e.logs] : [];
                  }
                  const duration = e.finishedAt
                    ? `${((new Date(e.finishedAt).getTime() - new Date(e.startedAt).getTime()) / 1000).toFixed(1)}s`
                    : "—";
                  const chip =
                    e.status === "SUCCESS" ? "bg-green-500/20 text-green-400 border-green-500/30"
                    : e.status === "RUNNING" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                    : e.status === "FAILED" ? "bg-red-500/20 text-red-400 border-red-500/30"
                    : "bg-slate-700 text-white border-slate-600";
                  return (
                    <div key={e.id} className="bg-slate-900/60 border border-white/5 rounded-xl p-4">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${chip}`}>{e.status}</span>
                          <span className="text-xs text-slate-400">{new Date(e.startedAt).toLocaleString()}</span>
                        </div>
                        <span className="text-xs text-slate-500 font-mono">{duration}</span>
                      </div>
                      {lines.length > 0 && (
                        <pre className="text-[11px] leading-relaxed font-mono text-slate-400 bg-black/40 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{lines.join("\n")}</pre>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
