"use client";
import React from "react";

export interface ParamSpec {
  key: string; label: string; type: "text" | "number" | "boolean" | "enum";
  default?: string | number | boolean; options?: string[]; min?: number; max?: number; required?: boolean;
}

export default function DefinitionParamFields({
  params, values, onChange,
}: { params: ParamSpec[]; values: Record<string, any>; onChange: (key: string, value: any) => void; }) {
  if (!params?.length) return null;
  return (
    <div className="space-y-4">
      <label className="text-xs font-bold text-mutedText tracking-wider uppercase block">Game Settings</label>
      <div className="grid sm:grid-cols-2 gap-4">
        {params.map((p) => (
          <div key={p.key}>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1">{p.label}{p.required && <span className="text-red-400"> *</span>}</label>
            {p.type === "boolean" ? (
              <input type="checkbox" checked={!!values[p.key]} onChange={(e) => onChange(p.key, e.target.checked)} className="w-4 h-4 accent-accentPurple" />
            ) : p.type === "enum" ? (
              <select value={values[p.key] ?? ""} onChange={(e) => onChange(p.key, e.target.value)} className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-white/5 text-sm text-slate-200">
                {p.options?.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input type={p.type === "number" ? "number" : "text"} value={values[p.key] ?? ""} min={p.min} max={p.max}
                onChange={(e) => onChange(p.key, p.type === "number" ? Number(e.target.value) : e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-950/60 border border-white/5 text-sm text-slate-200" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
