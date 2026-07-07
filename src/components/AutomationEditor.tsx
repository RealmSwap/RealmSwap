"use client";

import React, { useState } from "react";
import { X, Plus, GripVertical, Settings2, Trash2 } from "lucide-react";
import { TriggerType, ConditionOperator } from "@/lib/automations/types";

interface ActionConfig {
  type: string;
  config: Record<string, any>;
}

interface ConditionConfig {
  type: string;
  operator: ConditionOperator;
  value: string;
}

interface AutomationEditorProps {
  server: any;
  automation: any; // Existing automation or null
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}

const AVAILABLE_ACTIONS = [
  { id: "START_SERVER", name: "Start Server" },
  { id: "STOP_SERVER", name: "Stop Server" },
  { id: "RESTART_SERVER", name: "Restart Server" },
  { id: "WAIT", name: "Wait", fields: [{ name: "seconds", label: "Seconds", type: "number" }] },
  { id: "CONSOLE_COMMAND", name: "Console Command", fields: [{ name: "command", label: "Command", type: "text" }] },
  { id: "DISCORD_ANNOUNCEMENT", name: "Discord Announcement", fields: [{ name: "message", label: "Message", type: "text" }] }
];

const AVAILABLE_CONDITIONS = [
  { id: "PLAYERS_ONLINE", name: "Players Online" },
  { id: "CPU_USAGE", name: "CPU Usage %" },
  { id: "RAM_USAGE", name: "RAM Usage GB" },
  { id: "SERVER_STATE", name: "Server State" }
];

export default function AutomationEditor({ server, automation, onSave, onClose }: AutomationEditorProps) {
  const [name, setName] = useState(automation?.name || "New Automation");
  const [enabled, setEnabled] = useState(automation?.enabled ?? true);
  
  const [triggerType, setTriggerType] = useState<TriggerType>(automation?.triggerType || "ONE_TIME");
  const [triggerConfig, setTriggerConfig] = useState<any>(
    automation?.triggerConfig ? JSON.parse(automation.triggerConfig) : {}
  );
  
  const [conditions, setConditions] = useState<ConditionConfig[]>(
    automation?.conditions?.map((c: any) => ({ type: c.type, operator: c.operator, value: c.value })) || []
  );

  const [actions, setActions] = useState<ActionConfig[]>(
    automation?.actions?.sort((a: any, b: any) => a.order - b.order).map((a: any) => ({
      type: a.type,
      config: a.config ? JSON.parse(a.config) : {}
    })) || []
  );

  const [saving, setSaving] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      name,
      enabled,
      triggerType,
      triggerConfig,
      conditions,
      actions
    });
    setSaving(false);
  };

  const addAction = (type: string) => {
    setActions([...actions, { type, config: {} }]);
  };

  const updateActionConfig = (idx: number, key: string, value: any) => {
    const newActions = [...actions];
    newActions[idx].config[key] = value;
    setActions(newActions);
  };

  const removeAction = (idx: number) => {
    setActions(actions.filter((_, i) => i !== idx));
  };

  const addCondition = () => {
    setConditions([...conditions, { type: "PLAYERS_ONLINE", operator: "EQUALS", value: "0" }]);
  };

  const updateCondition = (idx: number, field: string, value: string) => {
    const newConds = [...conditions];
    (newConds[idx] as any)[field] = value;
    setConditions(newConds);
  };

  const removeCondition = (idx: number) => {
    setConditions(conditions.filter((_, i) => i !== idx));
  };

  // Drag and Drop
  const onDragStart = (e: React.DragEvent, idx: number) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === idx) return;
    const items = [...actions];
    const draggedItem = items[draggedIdx];
    items.splice(draggedIdx, 1);
    items.splice(idx, 0, draggedItem);
    setDraggedIdx(idx);
    setActions(items);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6 overflow-y-auto">
      <div className="bg-[#030712] border border-white/10 rounded-2xl w-full max-w-4xl max-h-full flex flex-col shadow-2xl relative animate-slide-down">
        
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#030712] z-10 rounded-t-2xl">
          <div>
            <h2 className="text-2xl font-black text-white">{automation ? "Edit Automation" : "Create Automation"}</h2>
            <p className="text-slate-400 text-sm mt-1">Configure workflow for {server.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-8">
          
          {/* Basics */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-accentPurple" /> Basics
              </h3>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} className="rounded bg-slate-900 border-white/10 text-accentPurple focus:ring-accentPurple" />
                Enabled
              </label>
            </div>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Automation Name"
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-accentPurple outline-none text-lg font-bold"
            />
          </section>

          {/* Trigger */}
          <section className="space-y-4">
            <h3 className="text-lg font-bold text-white">Trigger</h3>
            <div className="p-5 bg-slate-900/50 border border-white/5 rounded-xl space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block">When should this run?</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { id: "CRON", label: "Cron", desc: "Advanced expression" },
                    { id: "DAILY", label: "Daily", desc: "Specific time" },
                    { id: "WEEKLY", label: "Weekly", desc: "Specific day/time" },
                    { id: "MONTHLY", label: "Monthly", desc: "Specific date/time" },
                    { id: "ONE_TIME", label: "One-Time", desc: "Run once" },
                    { id: "SERVER_CRASH", label: "On Crash", desc: "When server halts" },
                    { id: "PLAYER_JOINED", label: "On Join", desc: "When player logs in" }
                  ].map(t => (
                    <div 
                      key={t.id} 
                      onClick={() => setTriggerType(t.id as TriggerType)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        triggerType === t.id 
                          ? "bg-accentPurple/20 border-accentPurple text-white" 
                          : "bg-slate-950 border-white/5 text-slate-400 hover:border-white/20 hover:bg-white/5"
                      }`}
                    >
                      <div className="font-bold text-sm mb-1">{t.label}</div>
                      <div className="text-[10px] opacity-70">{t.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {triggerType === "CRON" && (
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block">Cron Expression</label>
                  <input
                    value={triggerConfig.cronExpression || ""}
                    onChange={e => setTriggerConfig({ ...triggerConfig, cronExpression: e.target.value })}
                    placeholder="0 4 * * *"
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-mono focus:border-accentPurple outline-none"
                  />
                </div>
              )}
              {["DAILY", "WEEKLY", "MONTHLY"].includes(triggerType) && (
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block">Time of Day (HH:MM)</label>
                  <input
                    type="time"
                    value={triggerConfig.timeOfDay || ""}
                    onChange={e => setTriggerConfig({ ...triggerConfig, timeOfDay: e.target.value })}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-accentPurple outline-none"
                  />
                </div>
              )}
            </div>
          </section>

          {/* Conditions */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Conditions (Optional)</h3>
              <button onClick={addCondition} className="text-xs font-bold text-accentPurple hover:text-white flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Condition
              </button>
            </div>
            
            {conditions.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No conditions. Will run every time trigger occurs.</p>
            ) : (
              <div className="space-y-3">
                {conditions.map((cond, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-slate-900/50 p-3 border border-white/5 rounded-xl">
                    <select value={cond.type} onChange={e => updateCondition(idx, "type", e.target.value)} className="flex-1 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none">
                      {AVAILABLE_CONDITIONS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select value={cond.operator} onChange={e => updateCondition(idx, "operator", e.target.value)} className="w-32 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none">
                      <option value="EQUALS">Equals (=)</option>
                      <option value="NOT_EQUALS">Not (!=)</option>
                      <option value="LESS_THAN">Less (&lt;)</option>
                      <option value="GREATER_THAN">Greater (&gt;)</option>
                    </select>
                    <input type="text" value={cond.value} onChange={e => updateCondition(idx, "value", e.target.value)} className="w-32 bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none" placeholder="Value" />
                    <button onClick={() => removeCondition(idx)} className="p-2 text-slate-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Actions */}
          <section className="space-y-4">
            <h3 className="text-lg font-bold text-white mb-4">Workflow Actions</h3>
            
            <div className="relative space-y-4 pl-4">
              {/* Timeline Line */}
              {actions.length > 0 && (
                <div className="absolute left-7 top-6 bottom-6 w-0.5 bg-white/10 rounded-full" />
              )}
              
              {actions.length === 0 ? (
                <div className="text-center p-8 border border-dashed border-white/10 rounded-xl text-slate-500 text-sm ml-4">
                  No actions defined. Add one below.
                </div>
              ) : (
                actions.map((action, idx) => {
                  const def = AVAILABLE_ACTIONS.find(a => a.id === action.type);
                  return (
                    <div 
                      key={idx} 
                      draggable
                      onDragStart={(e) => onDragStart(e, idx)}
                      onDragOver={(e) => onDragOver(e, idx)}
                      onDragEnd={() => setDraggedIdx(null)}
                      className={`relative flex flex-col bg-slate-900 border ${draggedIdx === idx ? 'border-accentPurple opacity-50' : 'border-white/10'} rounded-xl transition-all cursor-move shadow-lg`}
                    >
                      <div className="flex items-center p-4">
                        <GripVertical className="w-5 h-5 text-slate-500 mr-3 opacity-50 hover:opacity-100 transition-opacity" />
                        <div className="flex-1 font-bold text-white flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-accentPurple text-white flex items-center justify-center text-xs shadow-md z-10 border-2 border-slate-900">
                            {idx + 1}
                          </div>
                          <span className="tracking-wide">{def?.name || action.type}</span>
                        </div>
                        <button onClick={() => removeAction(idx)} className="p-2 text-slate-500 hover:text-red-400 transition-colors hover:bg-white/5 rounded-lg">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {def?.fields && def.fields.length > 0 && (
                        <div className="px-14 pb-5 pt-0 space-y-4">
                          {def.fields.map(f => (
                            <div key={f.name}>
                              <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1.5">{f.label}</label>
                              <input 
                                type={f.type}
                                value={action.config[f.name] || ""}
                                onChange={e => updateActionConfig(idx, f.name, e.target.value)}
                                className="w-full bg-slate-950 border border-white/5 rounded-lg px-3 py-2.5 text-sm text-white focus:border-accentPurple outline-none transition-colors"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Add Action Menu */}
            <div className="pt-2">
              <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Add Action</label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_ACTIONS.map(a => (
                  <button
                    key={a.id}
                    onClick={() => addAction(a.id)}
                    className="px-3 py-1.5 text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-white/5 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> {a.name}
                  </button>
                ))}
              </div>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-[#030712] rounded-b-2xl flex justify-end gap-3 sticky bottom-0 z-10">
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-slate-300 hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="px-8 py-2.5 rounded-xl bg-accentPurple hover:bg-accentPurpleHover font-bold text-white transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Automation"}
          </button>
        </div>

      </div>
    </div>
  );
}
