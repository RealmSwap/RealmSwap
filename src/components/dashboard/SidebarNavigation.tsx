"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Server as ServerIcon,
  Store,
  Wrench,
  FolderSync,
  Settings,
  Clock,
  Terminal,
  History,
  Users,
  HardDrive,
  LogOut,
  ChevronRight
} from "lucide-react";

export function SidebarNavigation({ user }: { user: any }) {
  const pathname = usePathname();
  const router = useRouter();

  const navSections = [
    {
      title: "Dashboard",
      links: [
        { label: "Servers", icon: ServerIcon, href: "/dashboard" },
        { label: "Marketplace", icon: Store, href: "/dashboard/marketplace" },
      ]
    },
    {
      title: "Manage",
      links: [
        { label: "Mod Manager", icon: Wrench, href: "/dashboard/mods" },
        { label: "World Backups", icon: FolderSync, href: "/dashboard/backups" },
        { label: "Server Config", icon: Settings, href: "/dashboard/config" },
        { label: "Schedules", icon: Clock, href: "/dashboard/schedules" },
      ]
    },
    {
      title: "Monitor",
      links: [
        { label: "Server Console", icon: Terminal, href: "/dashboard/console" },
        { label: "Audit Logs", icon: History, href: "/dashboard/logs" },
        { label: "Team Members", icon: Users, href: "/dashboard/team" },
        { label: "File Locations", icon: HardDrive, href: "/dashboard/storage" },
      ]
    }
  ];

  return (
    <aside className="w-64 bg-slate-900/50 backdrop-blur-xl border-r border-white/5 flex flex-col h-screen shrink-0 sticky top-0 shadow-2xl">
      {/* Sidebar Logo */}
      <div className="pt-8 pb-6 h-24 flex items-center justify-center">
        <Link href="/" className="flex items-center justify-center transition-transform hover:scale-105">
          <img src="/logo.png" alt="RealmSwap" className="w-[120px] h-auto scale-[2.5]" />
        </Link>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 pb-6 space-y-6 custom-scrollbar">
        {navSections.map((section, idx) => (
          <div key={idx}>
            <div className="px-3 mb-2 text-[10px] font-extrabold tracking-widest text-slate-500 uppercase">
              {section.title}
            </div>
            <div className="space-y-1">
              {section.links.map((link) => {
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold transition-all group ${
                      isActive 
                        ? "bg-gradient-to-r from-accentPurple/20 to-accentPurple/5 text-accentPurple border border-accentPurple/20 shadow-[0_0_15px_rgba(167,139,250,0.1)]" 
                        : "text-slate-400 hover:bg-white/5 hover:text-white border border-transparent"
                    }`}
                  >
                    <link.icon className={`w-4 h-4 transition-transform ${isActive ? "scale-110" : "group-hover:scale-110"}`} />
                    <span className="text-sm">{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-white/5">
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-white/5 hover:border-white/10 transition-colors group cursor-pointer">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accentPurple to-blue-500 flex items-center justify-center text-white font-bold shrink-0 shadow-lg shadow-accentPurple/20">
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-200 truncate group-hover:text-white transition-colors">{user?.name || "User"}</div>
              <div className="text-[10px] text-accentPurple font-semibold uppercase tracking-wider">Owner</div>
            </div>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); router.push("/login"); }}
            className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
