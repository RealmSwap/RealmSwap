"use client";

import { SidebarNavigation } from "@/components/dashboard/SidebarNavigation";
import React, { useState, useEffect } from "react";
import {
  Download,
  Search,
  ThumbsUp,
  ThumbsDown,
  Filter,
  Settings,
  Wrench,
  Store,
  ChevronRight,
  HardDrive,
  LayoutDashboard,
  Plus,
  Terminal,
  Clock,
  Users,
  History,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { DASHBOARD_NAV_LINKS } from "@/components/dashboardNavLinks";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface MarketplaceTemplate {
  id: string;
  name: string;
  description: string;
  author: string;
  gameSlug: string;
  tags: string;
  downloads: number;
  likes: number;
  dislikes: number;
  userVote?: "LIKE" | "DISLIKE" | null;
  payload: string;
  customDefSpec?: string;
  verifiedLevel: string;
  createdAt: string;
}

interface MarketplaceViewProps {
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export default function MarketplaceView({ user }: MarketplaceViewProps) {
  const router = useRouter();
  const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedTemplate, setSelectedTemplate] = useState<MarketplaceTemplate | null>(null);
  const [systemMemoryGB, setSystemMemoryGB] = useState<number | null>(null);
  const [showSecurityReport, setShowSecurityReport] = useState(false);
  const [deploying, setDeploying] = useState(false);

  useEffect(() => {
    fetchTemplates();
    fetch('/api/system/metrics').then(r => r.json()).then(data => {
      if (data.memory?.totalGB) setSystemMemoryGB(data.memory.totalGB);
    }).catch(console.error);
  }, [sortBy]);

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`/api/marketplace?sort=${sortBy}`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (e) {
      console.error("Failed to fetch templates", e);
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.gameSlug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleVote = async (templateId: string, type: "LIKE" | "DISLIKE" | "NONE") => {
    setTemplates(prev => prev.map(t => {
      if (t.id !== templateId) return t;
      let newLikes = t.likes;
      let newDislikes = t.dislikes;

      if (t.userVote === "LIKE") newLikes--;
      else if (t.userVote === "DISLIKE") newDislikes--;

      if (type === "LIKE") newLikes++;
      else if (type === "DISLIKE") newDislikes++;

      return { ...t, likes: newLikes, dislikes: newDislikes, userVote: type === "NONE" ? null : type };
    }));

    if (selectedTemplate?.id === templateId) {
      setSelectedTemplate(prev => {
        if (!prev) return prev;
        let newLikes = prev.likes;
        let newDislikes = prev.dislikes;
        if (prev.userVote === "LIKE") newLikes--;
        else if (prev.userVote === "DISLIKE") newDislikes--;
        if (type === "LIKE") newLikes++;
        else if (type === "DISLIKE") newDislikes++;
        return { ...prev, likes: newLikes, dislikes: newDislikes, userVote: type === "NONE" ? null : type };
      });
    }

    try {
      await fetch(`/api/marketplace/${templateId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeploy = async (template: MarketplaceTemplate) => {
    if (!showSecurityReport) {
      setShowSecurityReport(true);
      return;
    }

    setDeploying(true);
    try {
      const res = await fetch("/api/marketplace/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id })
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/dashboard/config?server=${data.serverId}`);
      } else {
        const err = await res.json();
        alert("Failed to deploy template: " + (err.error || "Unknown error"));
        setDeploying(false);
      }
    } catch (e) {
      console.error(e);
      alert("Error deploying template");
      setDeploying(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#030712] text-slate-100 font-sans selection:bg-accentPurple/30">
      {/* Sidebar Navigation */}
      <SidebarNavigation user={user} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative pb-24 md:pb-0">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-sidebarDark/50 backdrop-blur-md">
          <h1 className="text-xl font-extrabold tracking-tight">Community Marketplace</h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Filter className="w-4 h-4 text-mutedText absolute left-3 top-1/2 -translate-y-1/2" />
              <select 
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-100 focus:outline-none focus:border-accentPurple transition-colors appearance-none cursor-pointer"
              >
                <option value="newest" className="bg-slate-900 text-slate-100">Newest</option>
                <option value="likes" className="bg-slate-900 text-slate-100">Most Likes</option>
                <option value="downloads" className="bg-slate-900 text-slate-100">Most Deployed</option>
              </select>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-mutedText absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search templates..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-accentPurple transition-colors w-64"
              />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto space-y-8">
            <section>
              <h2 className="text-2xl font-bold mb-4">Featured Setups</h2>
              {loading ? (
                <div className="text-mutedText">Loading marketplace...</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredTemplates.map(t => (
                    <div 
                      key={t.id}
                      className="glass-panel rounded-2xl p-5 border border-white/5 hover:border-accentPurple/30 transition-all duration-300 cursor-pointer group flex flex-col h-full"
                      onClick={() => setSelectedTemplate(t)}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex gap-3 items-center">
                          <div className="w-10 h-10 rounded-lg bg-accentPurple/20 flex items-center justify-center text-accentPurple font-bold">
                            {t.gameSlug.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="font-bold text-lg text-white group-hover:text-accentPurple transition-colors flex items-center gap-2">
                              {t.name}
                              {t.verifiedLevel === 'OFFICIAL' && <span title="Official Template"><ShieldCheck className="w-4 h-4 text-emerald-400" /></span>}
                              {t.verifiedLevel === 'VERIFIED' && <span title="Verified Publisher"><ShieldCheck className="w-4 h-4 text-blue-400" /></span>}
                            </h3>
                            <p className="text-xs text-mutedText flex items-center gap-1">
                              by {t.author}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <p className="text-sm text-mutedText mb-4 line-clamp-2 flex-1">
                        {t.description}
                      </p>
                      
                      <div className="flex items-center gap-2 mb-4 flex-wrap">
                        {t.tags.split(",").filter(Boolean).map((tag: string, i: number) => (
                          <span key={i} className="text-xs px-2 py-1 rounded-md bg-white/5 text-mutedText border border-white/10">
                            {tag.trim()}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-white/5 mt-auto">
                        <div className="flex gap-4">
                          <div className="flex items-center gap-1 text-xs text-mutedText" title="Downloads">
                            <Download className="w-3.5 h-3.5" />
                            {t.downloads}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-mutedText" title="Likes">
                            <ThumbsUp className={`w-3.5 h-3.5 ${t.userVote === 'LIKE' ? 'text-accentPurple' : ''}`} />
                            {t.likes}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-mutedText" title="Dislikes">
                            <ThumbsDown className={`w-3.5 h-3.5 ${t.userVote === 'DISLIKE' ? 'text-red-400' : ''}`} />
                            {t.dislikes}
                          </div>
                        </div>
                        {t.customDefSpec && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accentBlue/20 text-accentBlue border border-accentBlue/30">
                            CUSTOM GAME
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {filteredTemplates.length === 0 && !loading && (
                    <div className="col-span-3 text-center py-12 text-mutedText">
                      No templates found matching your search.
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>

      {/* Template Detail Modal */}
      {selectedTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#08090c] border border-white/5 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-white/5 flex justify-between items-start">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-accentPurple/10 flex items-center justify-center border border-accentPurple/20 text-accentPurple font-bold text-xl">
                  {selectedTemplate.gameSlug.substring(0,2).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-2xl font-bold">{selectedTemplate.name}</h2>
                  <p className="text-mutedText">for {selectedTemplate.gameSlug} • by {selectedTemplate.author}</p>
                </div>
              </div>
              <button 
                onClick={() => { setSelectedTemplate(null); setShowSecurityReport(false); }}
                className="text-mutedText hover:text-white p-1"
              >
                ✕
              </button>
            </div>
            
            {showSecurityReport ? (() => {
              const payload = JSON.parse(selectedTemplate.payload);
              const customDef = selectedTemplate.customDefSpec ? JSON.parse(selectedTemplate.customDefSpec) : null;
              const requestedRam = customDef?.recommendedRamGB || 4;
              const ramWarning = systemMemoryGB && requestedRam > systemMemoryGB;
              const hasScripts = customDef?.install?.installScript || customDef?.launch?.launchScript;
              const riskLevel = hasScripts ? "HIGH" : (ramWarning ? "MEDIUM" : "LOW");

              return (
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                  <div className="flex items-center gap-3 text-accentPurple mb-2">
                    <ShieldAlert className="w-8 h-8" />
                    <div>
                      <h3 className="font-bold text-xl">Import Security Report</h3>
                      <p className="text-sm text-slate-300">Review the blueprint configuration before deploying.</p>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-4">
                      <div className="p-2 bg-slate-800 rounded-lg"><Wrench className="w-5 h-5 text-blue-400" /></div>
                      <div>
                        <div className="font-bold text-sm text-white">Mods & Plugins</div>
                        <div className="text-sm text-mutedText">{payload.mods?.length || 0} packages. Handled natively via trusted providers.</div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-4">
                      <div className="p-2 bg-slate-800 rounded-lg"><HardDrive className="w-5 h-5 text-amber-400" /></div>
                      <div>
                        <div className="font-bold text-sm text-white">Resource Usage</div>
                        <div className="text-sm text-mutedText">Template requests {requestedRam} GB RAM.</div>
                        {ramWarning && (
                          <div className="mt-2 text-xs text-red-400 font-bold flex items-center gap-1">
                            <AlertTriangle className="w-4 h-4" /> Warning: Host machine only has {systemMemoryGB.toFixed(1)} GB available.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-start gap-4">
                      <div className="p-2 bg-slate-800 rounded-lg"><ShieldCheck className="w-5 h-5 text-emerald-400" /></div>
                      <div>
                        <div className="font-bold text-sm text-white">Security Risk Level</div>
                        <div className={`text-sm font-bold ${riskLevel === 'HIGH' ? 'text-red-400' : riskLevel === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {riskLevel}
                        </div>
                        <div className="text-xs text-mutedText mt-1">
                          No arbitrary scripts detected. Template operates strictly as a data blueprint.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })() : (
              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center">
                    <Download className="w-5 h-5 text-mutedText mb-1" />
                    <span className="font-bold">{selectedTemplate.downloads}</span>
                    <span className="text-[10px] text-mutedText">Deploys</span>
                  </div>
                  <div 
                    className={`p-4 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-all ${
                      selectedTemplate.userVote === 'LIKE' ? 'bg-accentPurple/20 border-accentPurple text-accentPurple' : 'bg-white/5 border-white/10 hover:border-accentPurple/50'
                    }`}
                    onClick={() => handleVote(selectedTemplate.id, selectedTemplate.userVote === 'LIKE' ? 'NONE' : 'LIKE')}
                  >
                    <ThumbsUp className="w-5 h-5 mb-1" />
                    <span className="font-bold">{selectedTemplate.likes}</span>
                    <span className="text-[10px] opacity-70">Likes</span>
                  </div>
                  <div 
                    className={`p-4 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-all ${
                      selectedTemplate.userVote === 'DISLIKE' ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-white/5 border-white/10 hover:border-red-500/50'
                    }`}
                    onClick={() => handleVote(selectedTemplate.id, selectedTemplate.userVote === 'DISLIKE' ? 'NONE' : 'DISLIKE')}
                  >
                    <ThumbsDown className="w-5 h-5 mb-1" />
                    <span className="font-bold">{selectedTemplate.dislikes}</span>
                    <span className="text-[10px] opacity-70">Dislikes</span>
                  </div>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center">
                    <div className="font-bold text-lg text-center truncate w-full">{selectedTemplate.tags.split(',')[0]}</div>
                    <span className="text-[10px] text-mutedText">Primary Tag</span>
                  </div>
                </div>

                <p className="text-gray-300 leading-relaxed">
                  {selectedTemplate.description}
                </p>

                {selectedTemplate.customDefSpec && (
                  <div className="p-4 rounded-xl bg-accentBlue/10 border border-accentBlue/30">
                    <h3 className="font-bold text-accentBlue mb-1 flex items-center gap-2">
                      <Wrench className="w-4 h-4" />
                      Custom Game Definition
                    </h3>
                    <p className="text-sm text-blue-200/70">
                      This template introduces a game not officially supported by RealmSwap yet. The game definition will be installed automatically.
                    </p>
                  </div>
                )}

                <div>
                  <h3 className="font-bold mb-3 flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-accentPurple" />
                    What's Included
                  </h3>
                  <div className="space-y-3">
                    {(() => {
                      const payload = JSON.parse(selectedTemplate.payload);
                      return (
                        <>
                          <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                            <p className="text-sm font-semibold mb-1">Mods / Plugins</p>
                            <p className="text-xs text-mutedText">
                              {payload.mods?.length || 0} packages will be installed
                            </p>
                          </div>
                          <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                            <p className="text-sm font-semibold mb-1">Configuration Overrides</p>
                            <p className="text-xs text-mutedText">
                              {payload.configOverrides?.length || 0} config files modified
                            </p>
                          </div>
                          <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                            <p className="text-sm font-semibold mb-1">Custom Startup Parameters</p>
                            <p className="text-xs text-mutedText">
                              {Object.keys(payload.startupParams || {}).length} arguments adjusted
                            </p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            <div className="p-6 border-t border-white/5 bg-black/20 flex justify-end gap-3">
              <button 
                onClick={() => setSelectedTemplate(null)}
                className="px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-white/5 transition-colors"
                disabled={deploying}
              >
                Cancel
              </button>
              <button 
                onClick={() => handleDeploy(selectedTemplate)}
                disabled={deploying}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm bg-accentPurple hover:bg-accentPurpleHover text-white shadow-lg shadow-accentPurple/20 transition-all border border-accentPurple/30 disabled:opacity-50"
              >
                {deploying ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <Download className="w-4 h-4" />}
                {showSecurityReport ? "Approve & Deploy" : "One-Click Deploy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
