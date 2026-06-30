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

  const [notifyDiscord, setNotifyDiscord] = useState(user?.notifyDiscord ?? true);
  const [notifyEmail, setNotifyEmail] = useState(user?.notifyEmail ?? true);
  const [notifyWebPush, setNotifyWebPush] = useState(user?.notifyWebPush ?? true);
  const [pushSupported, setPushSupported] = useState(false);

  // Check if push is supported on mount
  if (typeof window !== "undefined" && !pushSupported) {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setPushSupported(true);
      // Register Service Worker silently
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }
  }

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const handlePushSubscribe = async () => {
    try {
      setLoading(true);
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Notification permission denied");
      }

      const registration = await navigator.serviceWorker.ready;
      const vapidRes = await fetch("/api/web-push/vapid");
      if (!vapidRes.ok) throw new Error("Failed to get public key");
      const { publicKey } = await vapidRes.json();

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      const res = await fetch("/api/web-push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription)
      });

      if (!res.ok) throw new Error("Failed to save subscription");
      toast.success("Push notifications enabled for this browser!");
      setNotifyWebPush(true);
    } catch (err: any) {
      toast.error(err.message || "Failed to enable push notifications");
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/user/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyDiscord, notifyEmail, notifyWebPush })
      });
      if (!res.ok) throw new Error("Failed to save preferences");
      toast.success("Notification preferences saved!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save preferences");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#030712] text-slate-100 font-sans selection:bg-accentPurple/30">
      <SidebarNavigation user={user} />

      <main className="flex-1 p-8 pb-24 md:pb-8 lg:p-12 lg:pb-12 overflow-y-auto">
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
                {user?.discordId ? (
                  <div className="bg-slate-900 border border-emerald-500/30 rounded-lg p-4 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <div>
                      <p className="text-sm font-bold text-emerald-400">Account Linked Successfully</p>
                      <p className="text-xs text-slate-400">Discord ID: {user.discordId}</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                      6-Digit Linking Code
                    </label>
                    <input
                      type="text"
                      value={discordId}
                      onChange={(e) => setDiscordId(e.target.value)}
                      placeholder="e.g. 123456"
                      className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accentPurple focus:ring-1 focus:ring-accentPurple transition-all"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Type <strong>/link</strong> in the Discord Bot to generate your secure linking code.
                    </p>
                  </>
                )}
              </div>
            </div>

            {!user?.discordId && (
              <div className="pt-4 border-t border-white/5 flex justify-end">
                <button
                  type="button"
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const res = await fetch("/api/user/discord-link", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ code: discordId }),
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || "Failed to link Discord account");
                      toast.success("Account successfully linked! Please refresh the page.");
                      setTimeout(() => window.location.reload(), 1500);
                    } catch (err: any) {
                      toast.error(err.message || "Something went wrong.");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                  className="flex items-center gap-2 bg-accentPurple hover:bg-purple-500 text-white px-5 py-2 rounded-lg font-bold text-sm transition-colors disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Link Account
                </button>
              </div>
            )}
          </form>

          <form onSubmit={(e) => { e.preventDefault(); savePreferences(); }} className="space-y-6 bg-slate-950/50 p-6 rounded-2xl border border-white/5">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Notifications</h2>
              <p className="text-xs text-slate-400 mb-6">
                Choose how you want to be alerted when a server crashes, fails to restart, or a backup fails.
              </p>

              <div className="space-y-4">
                {/* Discord Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-900 border border-white/5 rounded-lg">
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">Discord Direct Messages</h3>
                    <p className="text-xs text-slate-500">Receive an instant DM from the GameVault bot.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={notifyDiscord} onChange={(e) => setNotifyDiscord(e.target.checked)} />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accentPurple"></div>
                  </label>
                </div>

                {/* Email Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-900 border border-white/5 rounded-lg">
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">Email Notifications</h3>
                    <p className="text-xs text-slate-500">Receive alerts to your registered email address.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={notifyEmail} onChange={(e) => setNotifyEmail(e.target.checked)} />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accentPurple"></div>
                  </label>
                </div>

                {/* Web Push Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-900 border border-white/5 rounded-lg">
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">Browser Push Notifications</h3>
                    <p className="text-xs text-slate-500">Native OS notifications via your web browser.</p>
                    {!pushSupported && <p className="text-[10px] text-red-400 mt-1">Not supported in this browser.</p>}
                  </div>
                  <div className="flex items-center gap-4">
                    {pushSupported && (
                      <button
                        type="button"
                        onClick={handlePushSubscribe}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg font-bold transition-colors"
                      >
                        Enable Browser Push
                      </button>
                    )}
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={notifyWebPush} onChange={(e) => setNotifyWebPush(e.target.checked)} disabled={!pushSupported} />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accentPurple peer-disabled:opacity-50"></div>
                    </label>
                  </div>
                </div>
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
                Save Preferences
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
