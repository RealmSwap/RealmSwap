"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { initClientErrorReporting } from "@/lib/sentry.client";
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
  Network,
  HardDrive,
  LogOut,
  CreditCard,
  ChevronRight,
  Menu,
  X
} from "lucide-react";

export function SidebarNavigation({ user }: { user: any }) {
  const pathname = usePathname();
  // Activate opt-in crash reporting (inert without DSN + user consent).
  useEffect(() => { initClientErrorReporting(); }, []);
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    // Actually clear the session — navigating away alone left the cookie
    // live, so the next person on a shared PC inherited the account.
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // best-effort: still leave the dashboard
    }
    router.push("/login");
    router.refresh();
  };

  // Close the mobile sheet whenever the route changes.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const navSections = [
    {
      title: "Dashboard",
      links: [
        { label: "Servers", icon: ServerIcon, href: "/dashboard" },
        { label: "Marketplace", icon: Store, href: "/dashboard/marketplace" },
        { label: "Billing", icon: CreditCard, href: "/dashboard/billing" },
      ]
    },
    {
      title: "Manage",
      links: [
        { label: "Mod Manager", icon: Wrench, href: "/dashboard/mods" },
        { label: "World Backups", icon: FolderSync, href: "/dashboard/backups" },
        { label: "Server Config", icon: Settings, href: "/dashboard/config" },
        { label: "Automation", icon: Clock, href: "/dashboard/schedules" },
        { label: "Remote Hosts", icon: Network, href: "/dashboard/nodes" },
      ]
    },
    {
      title: "Monitor",
      links: [
        { label: "Server Console", icon: Terminal, href: "/dashboard/console" },
        { label: "Audit Logs", icon: History, href: "/dashboard/logs" },
        { label: "Game Players", icon: Users, href: "/dashboard/players" },
        { label: "Team", icon: Users, href: "/dashboard/team" },
        { label: "Storage", icon: HardDrive, href: "/dashboard/storage" },
      ]
    }
  ];

  const allLinks = navSections.flatMap((s) => s.links);
  const mobilePrimary = [
    { label: "Servers", icon: ServerIcon, href: "/dashboard" },
    { label: "Mods", icon: Wrench, href: "/dashboard/mods" },
    { label: "Console", icon: Terminal, href: "/dashboard/console" },
    { label: "Backups", icon: FolderSync, href: "/dashboard/backups" },
  ];
  const mobilePrimaryHrefs = new Set(mobilePrimary.map((l) => l.href));

  return (
    <>
      <aside className="hidden md:flex w-64 bg-slate-900/50 backdrop-blur-xl border-r border-white/5 flex-col h-screen shrink-0 sticky top-0 shadow-2xl">
        {/* Sidebar Logo */}
        <div className="pt-8 pb-6 h-24 flex items-center justify-center">
          <Link href="/" className="flex items-center justify-center transition-transform hover:scale-105">
            {/* pointer-events-none: the scale-[2.5] visual overflows this
                header and its hit box would swallow clicks meant for the nav
                links below (found by the GUI e2e harness). */}
            <img src="/logo.png" alt="RealmSwap" className="w-[120px] h-auto scale-[2.5] pointer-events-none" />
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
                      aria-current={isActive ? "page" : undefined}
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

        {/* User Profile & Legal */}
        <div className="p-4 border-t border-white/5 flex flex-col gap-3">
          <div
            role="button"
            tabIndex={0}
            aria-label="Account settings"
            onClick={() => router.push("/dashboard/settings")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push("/dashboard/settings"); } }}
            className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-white/5 hover:border-white/10 transition-colors group cursor-pointer focus:outline-none focus:border-accentPurple/60"
          >
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accentPurple to-blue-500 flex items-center justify-center text-white font-bold shrink-0 shadow-lg shadow-accentPurple/20">
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-200 truncate group-hover:text-white transition-colors">{user?.name || "User"}</div>
                <div className="text-[10px] text-accentPurple font-semibold uppercase tracking-wider group-hover:text-white transition-colors">Settings</div>
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); signOut(); }}
              disabled={signingOut}
              aria-label="Sign out"
              className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-red-400/50 disabled:opacity-40"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex items-center justify-center gap-4 text-[10px] text-slate-500">
            <Link href="/terms" className="hover:text-slate-300 transition-colors">Terms of Service</Link>
            <span>•</span>
            <Link href="/privacy" className="hover:text-slate-300 transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation — 4 primaries + a "More" sheet covering
          everything else, so no page is unreachable on a phone. */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur-xl border-t border-white/5 z-50 px-6 py-3 flex items-center justify-between shadow-[0_-10px_40px_rgba(0,0,0,0.5)] pb-safe">
        {mobilePrimary.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-col items-center gap-1 transition-all ${
                isActive ? "text-accentPurple scale-110" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <link.icon className="w-6 h-6" />
              <span className="text-[10px] font-bold">{link.label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMobileMenuOpen(true)}
          aria-label="All pages"
          aria-expanded={mobileMenuOpen}
          className={`flex flex-col items-center gap-1 transition-all ${
            !mobilePrimaryHrefs.has(pathname) && pathname.startsWith("/dashboard")
              ? "text-accentPurple"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          <Menu className="w-6 h-6" />
          <span className="text-[10px] font-bold">More</span>
        </button>
      </nav>

      {/* Mobile "More" sheet */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[60] flex items-end" role="dialog" aria-label="All pages">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-full max-h-[80vh] overflow-y-auto custom-scrollbar bg-slate-900 border-t border-white/10 rounded-t-2xl p-6 pb-10 shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between mb-4 sticky top-0 bg-slate-900 pb-2">
              <span className="text-sm font-extrabold text-white uppercase tracking-wider">All Pages</span>
              <button
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {navSections.map((section, idx) => (
              <div key={idx} className="mb-5">
                <div className="px-1 mb-2 text-[10px] font-extrabold tracking-widest text-slate-500 uppercase">
                  {section.title}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {section.links.map((link) => {
                    const isActive = pathname === link.href;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${
                          isActive
                            ? "bg-accentPurple/15 border border-accentPurple/30 text-accentPurple"
                            : "text-slate-300 hover:bg-white/5 border border-transparent"
                        }`}
                      >
                        <link.icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{link.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            <Link
              href="/dashboard/settings"
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${
                pathname === "/dashboard/settings"
                  ? "bg-accentPurple/15 border border-accentPurple/30 text-accentPurple"
                  : "text-slate-300 hover:bg-white/5 border border-transparent"
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              <span>Settings</span>
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
