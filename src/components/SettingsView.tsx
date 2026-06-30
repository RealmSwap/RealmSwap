"use client";

import { useState } from "react";
import { SidebarNavigation } from "@/components/dashboard/SidebarNavigation";
import { Save } from "lucide-react";
import { toast } from "sonner";

export function SettingsView({ user }: { user: any }) {
  const [discordId, setDiscordId] = useState(user?.discordId || "");
  const [loading, setLoading] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordId }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      toast.success("Settings saved successfully!");
    } catch (err: any) {
      toast.error(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#030712] text-slate-100 font-sans selection:bg-accentPurple/30">
      <SidebarNavigation user={user} />

      <main className="flex-1 p-8 lg:p-12 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">
              Settings
            </h1>
            <p className="text-slate-400 text-sm">
              Manage your personal GameVault preferences and integrations.
            </p>
          </div>

          <form onSubmit={handleSave} className="space-y-6 bg-slate-950/50 p-6 rounded-2xl border border-white/5">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Discord Integration</h2>
              <p className="text-xs text-slate-400 mb-4">
                Connect your Discord account to manage your servers via the GameVault Discord Bot.
              </p>
              
              <div className="max-w-md">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                  Discord User ID
                </label>
                <input
                  type="text"
                  value={discordId}
                  onChange={(e) => setDiscordId(e.target.value)}
                  placeholder="e.g. 1521483069381542028"
                  className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accentPurple focus:ring-1 focus:ring-accentPurple transition-all"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  You can find this by enabling Developer Mode in Discord and right-clicking your profile.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-white/5 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 bg-accentPurple hover:bg-purple-500 text-white px-5 py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Settings
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
