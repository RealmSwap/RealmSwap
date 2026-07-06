"use client";

import React, { useState } from "react";
import { Terminal, Filter, Search } from "lucide-react";

export function ActivityFeed({ activityLogs }: { activityLogs: any[] }) {
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  const getActionColor = (action: string) => {
    if (action.includes("START")) return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    if (action.includes("STOP")) return "bg-amber-500/10 text-amber-400 border-amber-500/20";
    if (action.includes("CREATE")) return "bg-accentPurple/10 text-accentPurple border-accentPurple/20";
    if (action.includes("DELETE") || action.includes("CRASH")) return "bg-red-500/10 text-red-400 border-red-500/20";
    if (action.includes("BACKUP") || action.includes("RESTORE")) return "bg-blue-500/10 text-blue-400 border-blue-500/20";
    return "bg-slate-800 text-slate-300 border-white/10";
  };

  const filteredLogs = activityLogs.filter(log => {
    if (filter !== "ALL" && !log.action.includes(filter)) return false;
    if (search && !log.details.toLowerCase().includes(search.toLowerCase()) && !log.action.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <section className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[18px] shadow-xl overflow-hidden h-full flex flex-col">
      <div className="p-4 border-b border-white/5 bg-slate-950/40 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <h2 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
          <Terminal className="w-4 h-4 text-accentPurple" />
          <span>Activity Feed</span>
        </h2>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-900/50 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-accentPurple/50 w-48"
            />
          </div>
          <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg border border-white/5">
            <Filter className="w-3.5 h-3.5 text-slate-500 ml-1 mr-1" />
            {["ALL", "START", "STOP", "ERROR"].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${filter === f ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      <div className="p-2 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No activity logs match your filters.
          </div>
        ) : (
          <div className="space-y-1">
            {filteredLogs.map((log) => (
              <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group">
                <div className="text-[10px] text-slate-500 font-mono flex-shrink-0 mt-0.5 w-16">
                  {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className={`px-2 py-0.5 rounded border text-[10px] font-bold flex-shrink-0 w-28 text-center ${getActionColor(log.action)}`}>
                  {log.action}
                </div>
                <div className="text-xs text-slate-300 group-hover:text-white transition-colors">
                  {log.details}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
