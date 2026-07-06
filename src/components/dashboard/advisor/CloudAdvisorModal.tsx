"use client";

import React, { useState, useEffect } from "react";
import { X, Sparkles, Server, Zap, CheckCircle2, ChevronRight, Settings, Loader2, ArrowRight } from "lucide-react";
import { ProviderMatrix } from "./ProviderMatrix";
import { toast } from "sonner";

interface Props {
  serverId: string;
  serverName: string;
  onClose: () => void;
  onMigrateSuccess: () => void;
}

export function CloudAdvisorModal({ serverId, serverName, onClose, onMigrateSuccess }: Props) {
  const [step, setStep] = useState<"ANALYZING" | "READINESS" | "PREFERENCES" | "RECOMMENDATIONS" | "MIGRATING">("ANALYZING");
  const [readiness, setReadiness] = useState<any>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [preferences, setPreferences] = useState({
    priority: "Best Value",
    region: "North America",
    expectedUptime: "24/7"
  });
  
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  useEffect(() => {
    // Initial analyze
    const analyze = async () => {
      try {
        const res = await fetch(`/api/servers/${serverId}/advisor/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preferences })
        });
        const data = await res.json();
        
        // Simulate a tiny bit of loading so the UI feels like it's "thinking"
        setTimeout(() => {
          setReadiness(data.readiness);
          setRecommendations(data.recommendations);
          setStep("READINESS");
        }, 1500);
      } catch (e) {
        toast.error("Failed to analyze server.");
        onClose();
      }
    };
    
    if (step === "ANALYZING") {
      analyze();
    }
  }, [serverId]);

  const handleFetchRecommendations = async () => {
    setStep("ANALYZING");
    try {
      const res = await fetch(`/api/servers/${serverId}/advisor/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences })
      });
      const data = await res.json();
      setRecommendations(data.recommendations);
      setSelectedProviderId(data.recommendations[0]?.providerId || null);
      setSelectedPlanId(data.recommendations[0]?.plan?.id || null);
      setStep("RECOMMENDATIONS");
    } catch (e) {
      toast.error("Failed to fetch recommendations.");
    }
  };

  const handleMigrate = async () => {
    if (!selectedProviderId || !selectedPlanId) return;
    
    setStep("MIGRATING");
    try {
      const res = await fetch(`/api/servers/${serverId}/advisor/migrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: selectedProviderId, planId: selectedPlanId })
      });
      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Migration failed.");
      }
      
      toast.success("Server successfully migrated to cloud!");
      onMigrateSuccess();
    } catch (e: any) {
      toast.error(e.message || "Failed to migrate.");
      setStep("RECOMMENDATIONS");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in" onClick={onClose}>
      <div 
        className="w-full max-w-2xl rounded-2xl bg-slate-950 border border-accentPurple/30 shadow-[0_0_50px_rgba(167,139,250,0.15)] flex flex-col overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accentPurple to-indigo-600 flex items-center justify-center shadow-lg shadow-accentPurple/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">Cloud Advisor</h2>
              <p className="text-xs text-slate-400 font-medium">Intelligent Hosting Recommendations for {serverName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 relative min-h-[400px]">
          {/* STEP: ANALYZING */}
          {step === "ANALYZING" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
              <div className="relative mb-6">
                <div className="w-20 h-20 rounded-full border-4 border-slate-800 border-t-accentPurple animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Server className="w-8 h-8 text-accentPurple animate-pulse" />
                </div>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Analyzing Server Footprint</h3>
              <p className="text-sm text-slate-400 max-w-sm">
                Evaluating historical CPU usage, RAM footprint, world size, and installed mods to determine your ideal cloud requirements...
              </p>
            </div>
          )}

          {/* STEP: READINESS */}
          {step === "READINESS" && readiness && (
            <div className="flex flex-col items-center justify-center h-full animate-fade-in text-center">
              <div className="mb-8 relative">
                <svg className="w-32 h-32 transform -rotate-90">
                  <circle cx="64" cy="64" r="60" className="stroke-slate-800" strokeWidth="8" fill="none" />
                  <circle cx="64" cy="64" r="60" className="stroke-accentPurple" strokeWidth="8" fill="none" strokeDasharray="377" strokeDashoffset={377 - (377 * readiness.score) / 100} strokeLinecap="round" style={{ transition: "stroke-dashoffset 1.5s ease-out" }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-black text-white">{readiness.score}%</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Readiness</span>
                </div>
              </div>

              <h3 className="text-2xl font-black text-white mb-3">
                {readiness.recommendation === "MIGRATE" ? "Time to Upgrade." : "You're Good to Stay Local."}
              </h3>
              <p className="text-slate-400 text-sm max-w-md mb-8">
                {readiness.reasoning}
              </p>

              <div className="flex gap-4">
                <button 
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl border border-white/10 text-white font-bold hover:bg-white/5 transition-colors"
                >
                  Stay Local
                </button>
                <button 
                  onClick={() => setStep("PREFERENCES")}
                  className="px-6 py-2.5 rounded-xl bg-accentPurple hover:bg-purple-500 text-white font-bold flex items-center gap-2 shadow-lg shadow-accentPurple/25 transition-all hover:-translate-y-0.5"
                >
                  Find Cloud Hosts <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP: PREFERENCES */}
          {step === "PREFERENCES" && (
            <div className="animate-fade-in h-full flex flex-col">
              <h3 className="text-xl font-bold text-white mb-2">What's most important to you?</h3>
              <p className="text-sm text-slate-400 mb-6">Customize your recommendations.</p>

              <div className="space-y-5 flex-1">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Primary Goal</label>
                  <select 
                    value={preferences.priority}
                    onChange={(e) => setPreferences({...preferences, priority: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-3 outline-none focus:border-accentPurple transition-colors"
                  >
                    <option>Cheapest</option>
                    <option>Performance</option>
                    <option>Best Value</option>
                    <option>Simplest Setup</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Player Region</label>
                  <select 
                    value={preferences.region}
                    onChange={(e) => setPreferences({...preferences, region: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg p-3 outline-none focus:border-accentPurple transition-colors"
                  >
                    <option>North America</option>
                    <option>Europe</option>
                    <option>Asia</option>
                    <option>Australia</option>
                    <option>Mixed</option>
                  </select>
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <button 
                  onClick={handleFetchRecommendations}
                  className="px-6 py-2.5 rounded-xl bg-accentPurple hover:bg-purple-500 text-white font-bold flex items-center gap-2 shadow-lg shadow-accentPurple/25 transition-all"
                >
                  Generate Recommendations <Sparkles className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP: RECOMMENDATIONS */}
          {step === "RECOMMENDATIONS" && (
            <div className="animate-fade-in flex flex-col h-full">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">Recommended Hosts</h3>
                  <p className="text-xs text-slate-400 mt-1">Based on your server footprint and preferences.</p>
                </div>
                <button onClick={() => setStep("PREFERENCES")} className="text-xs text-accentPurple hover:text-purple-400 flex items-center gap-1 font-bold">
                  <Settings className="w-3 h-3" /> Edit Preferences
                </button>
              </div>

              <ProviderMatrix 
                recommendations={recommendations} 
                selectedProviderId={selectedProviderId}
                onSelect={(pid, planId) => {
                  setSelectedProviderId(pid);
                  setSelectedPlanId(planId);
                }} 
              />

              <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
                <div className="text-xs text-slate-400">
                  Estimated Downtime: <strong className="text-white">Under 15 minutes</strong>
                </div>
                <button 
                  onClick={handleMigrate}
                  disabled={!selectedProviderId}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  1-Click Migrate <Zap className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP: MIGRATING */}
          {step === "MIGRATING" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950 z-10">
              <div className="relative mb-8 w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="absolute top-0 left-0 h-full bg-emerald-500 w-full animate-[progress_15s_ease-in-out_infinite]" style={{ transformOrigin: "left", animationName: "progress-fill" }}></div>
                <style>{`
                  @keyframes progress-fill {
                    0% { transform: scaleX(0); }
                    20% { transform: scaleX(0.2); }
                    50% { transform: scaleX(0.6); }
                    80% { transform: scaleX(0.8); }
                    100% { transform: scaleX(0.95); }
                  }
                `}</style>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Migrating your Realm...</h3>
              <p className="text-sm text-slate-400 max-w-sm">
                We are currently zipping your world files, provisioning your cloud server, and uploading your configuration. Do not close this window.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
