"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Loader2, Rocket, Sparkles } from "lucide-react";

/**
 * First-run deploy wizard, shown on the dashboard when the user has no
 * servers: pick a game → name it → deploy. Deliberately minimal — defaults
 * everywhere, tuning happens later in Game Settings. Uses the same
 * POST /api/servers the full create form uses.
 */
export function FirstServerWizard({ onDeployed }: { onDeployed: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [definitions, setDefinitions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [ram, setRam] = useState(4);
  const [password, setPassword] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deployedId, setDeployedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/definitions")
      .then((r) => r.json())
      .then((d) => setDefinitions(d.definitions || []))
      .catch(() => setError("Failed to load game list"))
      .finally(() => setLoading(false));
  }, []);

  const pick = (def: any) => {
    setPicked(def);
    setName(`${def.displayName} Server`);
    setRam(def.recommendedRamGB || 4);
    setStep(2);
  };

  const deploy = async () => {
    if (!picked) return;
    setDeploying(true);
    setError(null);
    try {
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          definitionId: picked.id,
          ramAllocation: ram,
          password: password || undefined,
          paramValues: {},
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deployment failed");
      setDeployedId(data.id);
      setStep(3);
      onDeployed();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="col-span-full py-10 px-6 flex flex-col items-center border border-accentPurple/20 rounded-[18px] bg-gradient-to-b from-accentPurple/5 to-slate-900/20">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-accentPurple" />
        <span className="text-[10px] font-extrabold text-accentPurple uppercase tracking-widest">Welcome to RealmSwap</span>
      </div>
      <h3 className="font-extrabold text-xl text-white mb-1">Deploy your first server</h3>
      <p className="text-slate-400 text-sm mb-6 text-center max-w-md">
        Three quick steps. RealmSwap downloads and configures everything — you just pick a game.
      </p>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8 text-[11px] font-bold">
        {["Pick Game", "Name It", "Deploy"].map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <span className="w-8 h-px bg-white/10" />}
            <span className={`flex items-center gap-1.5 ${step === i + 1 ? "text-white" : step > i + 1 ? "text-emerald-400" : "text-slate-500"}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${step === i + 1 ? "bg-accentPurple text-white" : step > i + 1 ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800"}`}>
                {step > i + 1 ? <Check className="w-3 h-3" /> : i + 1}
              </span>
              {label}
            </span>
          </React.Fragment>
        ))}
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold max-w-lg text-center">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="w-full max-w-3xl">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-accentPurple animate-spin" /></div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {definitions.map((def) => (
                <button
                  key={def.id}
                  onClick={() => pick(def)}
                  className="group text-left p-4 rounded-xl bg-slate-900/60 border border-white/5 hover:border-accentPurple/40 hover:bg-slate-900 transition-all"
                >
                  <div className="text-2xl mb-2">{def.icon || "🎮"}</div>
                  <div className="font-bold text-sm text-white group-hover:text-accentPurple transition-colors">{def.displayName}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{def.description}</div>
                  <div className="text-[10px] text-slate-400 mt-1.5 font-mono">{def.recommendedRamGB} GB RAM</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 2 && picked && (
        <div className="w-full max-w-md space-y-5">
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Server name</label>
            <input
              type="text"
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-sm text-white focus:border-accentPurple focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              RAM allocation — <span className="text-accentPurple font-mono">{ram} GB</span>
            </label>
            <input
              type="range"
              min={2}
              max={32}
              step={1}
              value={ram}
              onChange={(e) => setRam(Number(e.target.value))}
              className="w-full accent-accentPurple"
            />
            <p className="text-[10px] text-slate-500 mt-1">{picked.displayName} recommends {picked.recommendedRamGB} GB.</p>
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Password <span className="text-slate-600 normal-case font-medium">(optional — keeps randoms out)</span>
            </label>
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave empty for an open server"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-sm text-white focus:border-accentPurple focus:outline-none"
            />
          </div>
          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-slate-400 hover:text-white text-sm font-bold transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button
              onClick={deploy}
              disabled={deploying || !name.trim()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accentPurple hover:bg-accentPurple/90 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-lg shadow-accentPurple/25"
            >
              {deploying ? <><Loader2 className="w-4 h-4 animate-spin" /> Deploying…</> : <><Rocket className="w-4 h-4" /> Deploy Server</>}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="text-center max-w-md">
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7 text-emerald-400" />
          </div>
          <h4 className="font-extrabold text-white mb-1">{name} is ready</h4>
          <p className="text-sm text-slate-400 mb-6">
            Press Start on its card to boot it the first time — the game files download automatically. Then tune anything in Game Settings.
          </p>
          <Link
            href={deployedId ? `/dashboard/config?server=${deployedId}` : "/dashboard"}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accentPurple hover:bg-accentPurple/90 text-white font-bold text-sm transition-all"
          >
            Open Game Settings <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
