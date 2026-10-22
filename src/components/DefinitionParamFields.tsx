"use client";
import React from "react";

export interface ParamSpec {
  key: string; label: string; type: "text" | "number" | "boolean" | "enum";
  default?: string | number | boolean; options?: string[]; min?: number; max?: number; required?: boolean;
  group?: string; help?: string;
}

function ParamInput({ p, values, onChange }: {
  p: ParamSpec; values: Record<string, any>; onChange: (key: string, value: any) => void;
}) {
  return (
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
      {p.help && <span className="text-[10px] text-slate-500 mt-1 block">{p.help}</span>}
    </div>
  );
}

export default function DefinitionParamFields({
  params, values, onChange,
}: { params: ParamSpec[]; values: Record<string, any>; onChange: (key: string, value: any) => void; }) {
  if (!params?.length) return null;

  const groups: { name: string | null; fields: ParamSpec[] }[] = [];
  for (const p of params) {
    const name = p.group ?? null;
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.fields.push(p);
    else groups.push({ name, fields: [p] });
  }

  return (
    <div className="space-y-4">
      <label className="text-xs font-bold text-mutedText tracking-wider uppercase block">Game Settings</label>
      {groups.map((g, i) => (
        <div key={i} className="space-y-4">
          {g.name && <h4 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">{g.name}</h4>}
          <div className="grid sm:grid-cols-2 gap-4">
            {g.fields.map((p) => <ParamInput key={p.key} p={p} values={values} onChange={onChange} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
