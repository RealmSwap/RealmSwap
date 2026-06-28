"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  History,
  Sparkles,
  LayoutDashboard,
  Plus,
  Store,
  LogOut,
  Users,
  Search,
  Download,
  Info,
  Calendar,
  Settings,
  Clock,
  Terminal,
} from "lucide-react";
import { DASHBOARD_NAV_LINKS } from "@/components/dashboardNavLinks";

interface AuditLogsViewProps {
  initialLogs: any[];
  user: any;
}

export default function AuditLogsView({ initialLogs, user }: AuditLogsViewProps) {
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>(initialLogs);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // Filter logs based on search and selected action category
  const filteredLogs = logs.filter((log) => {
    const matchesSearch = log.details.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          log.action.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesAction = actionFilter === "ALL" || log.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  // Extract unique action types for the filter selector
  const actionTypes = Array.from(new Set(logs.map(l => l.action)));

  // Export filtered logs as JSON file
  const exportAsJSON = () => {
    const cleanLogs = filteredLogs.map(({ id, userId, ...rest }) => rest); // omit internal db keys
    const blob = new Blob([JSON.stringify(cleanLogs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `realmswap_audit_logs_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Export filtered logs as CSV file
  const exportAsCSV = () => {
    const headers = ["Timestamp", "Action", "Description"];
    const rows = filteredLogs.map((log) => [
      new Date(log.createdAt).toISOString(),
      log.action,
      `"${log.details.replace(/"/g, '""')}"` // escape quotes
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `realmswap_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex bg-background text-slate-100 font-sans">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-borderDark bg-[#0a0c12] flex flex-col justify-between hidden md:flex">
        <div>
          {/* Logo */}
          <div className="p-6 border-b border-borderDark flex items-center gap-2">
            <img src="/logo.png" alt="RealmSwap" className="h-8 w-auto scale-[7] origin-left -translate-x-16 translate-y-2 pointer-events-none select-none" />
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            <Link 
              href="/dashboard" 
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 hover:text-white transition-all"
            >
              <LayoutDashboard className="w-4 h-4 text-slate-500" />
              <span>Dashboard</span>
            </Link>
            
            <Link 
              href="/dashboard/servers/new" 
              className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold hover:bg-white/5 text-slate-300 hover:text-white transition-all group"
            >
              <div className="flex items-center gap-3">
                <Plus className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                <span>Create Server</span>
              </div>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">Unlimited</span>
            </Link>

            <div className="pt-4 pb-2 px-3">
              <span className="text-[10px] font-bold text-mutedText uppercase tracking-wider">Features</span>
            </div>

            {DASHBOARD_NAV_LINKS.map((link, i) => {
              const active = link.href === "/dashboard/logs";
              return (
                <Link
                  key={i}
                  href={link.href}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold transition-all group ${
                    active
                      ? "bg-accentPurple/10 text-white border border-accentPurple/20"
                      : "hover:bg-white/5 text-slate-400 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <link.icon className={`w-4 h-4 ${active ? "text-accentPurple" : "text-slate-500 group-hover:text-white transition-colors"}`} />
                    <span>{link.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Profile Card */}
        <div className="p-4 border-t border-borderDark bg-slate-950/40">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 pr-2">
              <span className="font-bold text-sm block truncate text-slate-200">{user.name}</span>
              <span className="text-xs text-mutedText block truncate">{user.email}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-white/5 text-slate-400 hover:text-red-400 rounded-lg transition-colors flex-shrink-0"
              title="Sign Out"
            >
              <LogOut className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-6 py-8">
        
        {/* Navigation back */}
        <div className="mb-6">
          <Link 
            href="/dashboard" 
            className="inline-flex items-center gap-1.5 text-xs text-mutedText hover:text-accentPurple font-semibold transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Dashboard</span>
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white flex items-center gap-2">
            <History className="w-6 h-6 text-accentPurple animate-float" />
            <span>Audit Security Logs</span>
          </h1>
          <p className="text-sm text-mutedText mt-1">Monitor account history audits, system creation events, power actions, configuration edits, and developer logs.</p>
        </div>

        {/* Toolbar: Search, Filters, and Export Buttons */}
        <div className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-6">
          
          {/* Search and Category Filters */}
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search log descriptions or actions..."
                className="w-full pl-9 pr-4 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors"
              />
            </div>

            <div className="min-w-[160px]">
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-accentPurple transition-colors cursor-pointer font-bold"
              >
                <option value="ALL">All Actions</option>
                {actionTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Export tools */}
          <div className="flex gap-3">
            <button
              onClick={exportAsJSON}
              disabled={filteredLogs.length === 0}
              className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed border border-white/10 text-xs font-bold text-slate-200 transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export JSON</span>
            </button>
            <button
              onClick={exportAsCSV}
              disabled={filteredLogs.length === 0}
              className="px-4 py-2 rounded-lg bg-accentPurple hover:bg-accentPurpleHover disabled:bg-accentPurple/50 disabled:cursor-not-allowed text-xs font-bold text-white transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

        </div>

        {/* Audit logs list table */}
        <div className="glass-panel rounded-2xl border border-white/5 p-6 space-y-4">
          <h3 className="font-extrabold text-base text-white">System Logs trail</h3>
          <p className="text-xs text-mutedText">Showing {filteredLogs.length} events logged to database.</p>

          <div className="overflow-x-auto pt-2">
            {filteredLogs.length === 0 ? (
              <div className="p-12 rounded-xl border border-dashed border-white/5 bg-slate-950/20 text-center text-xs text-mutedText">
                No activity logs match your search and filter criteria.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950/30 text-mutedText font-bold uppercase border-b border-white/5">
                    <th className="p-3">Event Timestamp</th>
                    <th className="p-3">Action Type</th>
                    <th className="p-3">Activity Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-3 text-mutedText flex items-center gap-1.5 whitespace-nowrap">
                        <Calendar className="w-3.5 h-3.5 text-slate-500" />
                        <span>{new Date(log.createdAt).toLocaleString()}</span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded font-extrabold text-[9px] uppercase tracking-wide bg-slate-800 text-slate-300 border border-slate-700`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3 text-slate-200">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
