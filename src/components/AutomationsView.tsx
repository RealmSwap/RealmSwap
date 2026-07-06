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
  Power
} from "lucide-react";
import AutomationEditor from "./AutomationEditor";
import { TriggerConfig } from "@/lib/automations/types";
import { CronExpressionParser } from "cron-parser";

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
  
  const getNextRun = (triggerType: string, configStr: string) => {
    if (triggerType === "ONE_TIME") return "Manual / Once";
    if (triggerType === "SERVER_CRASH") return "On Crash";
    if (triggerType === "PLAYER_JOINED") return "On Join";
    
    try {
      const config: TriggerConfig = JSON.parse(configStr || "{}");
      if (triggerType === "CRON" && config.cronExpression) {
        return CronExpressionParser.parse(config.cronExpression).next().toDate().toLocaleString();
      }
      if (["DAILY", "WEEKLY", "MONTHLY"].includes(triggerType) && config.timeOfDay) {
         return `Next at ${config.timeOfDay}`;
      }
    } catch (e) {}
    return "Unknown";
  };

  const upcomingAutomations = automations.filter(a => a.enabled && a.triggerType === "CRON" || a.triggerType === "DAILY");

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
            <p className="text-slate-400 mt-2 text-sm font-medium">Build complex workflows and schedules to manage your server.</p>
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
                    <span className="font-bold text-slate-300">{getNextRun(a.triggerType, a.triggerConfig)}</span>
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
                <h3 className="text-xl font-bold text-white mb-6">Upcoming Schedule (Estimated)</h3>
                <div className="grid grid-cols-7 gap-4">
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(day => (
                    <div key={day} className="font-bold text-xs text-slate-500 uppercase tracking-wider pb-2 border-b border-white/5">{day}</div>
                  ))}
                  
                  {/* Mock calendar grid mapping items by day. Since it's estimated, we just render cards arbitrarily for the demo or base them on CRON */}
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="min-h-[120px] bg-slate-950/50 rounded-lg p-2 space-y-2 border border-white/5">
                       {upcomingAutomations.map(a => (
                         <div key={a.id} className="bg-accentPurple/10 border border-accentPurple/20 p-2 rounded text-xs">
                           <strong className="text-accentPurple block">{a.name}</strong>
                           <span className="text-slate-400">{a.triggerType}</span>
                         </div>
                       ))}
                    </div>
                  ))}
                </div>
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
    </div>
  );
}
