import React from "react";
import { Check, Star, DownloadCloud, Zap } from "lucide-react";

interface ProviderMatrixProps {
  recommendations: any[];
  onSelect: (providerId: string, planId: string) => void;
  selectedProviderId: string | null;
}

export function ProviderMatrix({ recommendations, onSelect, selectedProviderId }: ProviderMatrixProps) {
  if (recommendations.length === 0) {
    return <div className="text-slate-400 text-sm py-4 text-center">No providers match your criteria perfectly.</div>;
  }

  return (
    <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2">
      {recommendations.map((rec, i) => (
        <div 
          key={rec.providerId}
          onClick={() => onSelect(rec.providerId, rec.plan?.id)}
          className={`relative p-4 rounded-xl border transition-all cursor-pointer \${
            selectedProviderId === rec.providerId 
              ? "bg-accentPurple/20 border-accentPurple shadow-[0_0_15px_rgba(167,139,250,0.3)]"
              : "bg-slate-900 border-white/10 hover:border-accentPurple/50 hover:bg-slate-800"
          }`}
        >
          {i === 0 && (
            <div className="absolute -top-3 -right-2 bg-gradient-to-r from-amber-400 to-amber-600 text-black text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-lg flex items-center gap-1 border border-amber-300">
              <Star className="w-3 h-3 fill-black" /> Top Match
            </div>
          )}

          <div className="flex justify-between items-start mb-2">
            <div>
              <h4 className="text-lg font-bold text-white flex items-center gap-2">
                {rec.name}
              </h4>
              <p className="text-xs text-slate-400 mt-1">{rec.reasoning}</p>
            </div>
            {rec.plan && (
              <div className="text-right">
                <div className="text-xl font-black text-emerald-400">$\{(rec.plan.monthlyCost).toFixed(2)}<span className="text-[10px] font-medium text-emerald-400/50">/mo</span></div>
                <div className="text-[10px] text-slate-400 font-medium">Estimated Cost</div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/5">
            <div>
              <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">Performance</div>
              <div className="flex text-amber-400">
                {[...Array(5)].map((_, idx) => (
                  <Star key={idx} className={`w-3.5 h-3.5 \${idx < rec.rating.performance ? 'fill-amber-400' : 'text-slate-700'}`} />
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">Ease of Setup</div>
              <div className="flex text-amber-400">
                {[...Array(5)].map((_, idx) => (
                  <Star key={idx} className={`w-3.5 h-3.5 \${idx < rec.rating.easeOfMigration ? 'fill-amber-400' : 'text-slate-700'}`} />
                ))}
              </div>
            </div>
            {rec.plan && (
              <div>
                <div className="text-[10px] uppercase text-slate-500 font-bold mb-1">Specs</div>
                <div className="text-xs text-slate-300 font-medium whitespace-nowrap">
                  {rec.plan.ramGB}GB RAM • {rec.plan.cpuCores} CPU
                </div>
              </div>
            )}
          </div>

          {rec.badges && rec.badges.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {rec.badges.map((b: string) => (
                <span key={b} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
