"use client";

import React, { useState, useRef, useEffect } from "react";
import { SidebarNavigation } from "@/components/dashboard/SidebarNavigation";
import { PowerSettings } from "@/components/PowerSettings";
import { Save, UploadCloud, Languages, Moon, Sun, Mail, Webhook, Send } from "lucide-react";
import { toast } from "sonner";
import { initClientErrorReporting } from "@/lib/sentry.client";
import { useTranslation } from "@/hooks/useTranslation";
import { LOCALES } from "@/components/LocaleProvider";
import { getStoredTheme, setTheme, type Theme } from "@/lib/theme";

interface RealmReport {
  id: string;
  realm_id: string;
  reason: string;
  details: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  realm: { name: string; slug: string; status: string } | null;
  reporter: { display_name: string } | null;
}

function reportAge(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function SettingsView({ user }: { user: any }) {
  const { t, locale, setLocale } = useTranslation();
  const [theme, setThemeState] = useState<Theme>("dark");
  useEffect(() => setThemeState(getStoredTheme()), []);
  const changeTheme = (next: Theme) => {
    setThemeState(next);
    setTheme(next);
  };
  const [discordId, setDiscordId] = useState(user?.discordId || "");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEggUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const text = await file.text();
      
      const res = await fetch("/api/admin/import-egg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eggJson: text }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to import egg");
      
      toast.success(`Successfully imported ${data.definition.displayName}!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to parse or import egg.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    // Discord linking happens exclusively through the Link Account button
    // (the bot's /link code flow) — there is no raw discordId save anymore.
    e.preventDefault();
  };

  const [notifyDiscord, setNotifyDiscord] = useState(user?.notifyDiscord ?? true);
  const [notifyEmail, setNotifyEmail] = useState(user?.notifyEmail ?? true);
  const [notifyWebPush, setNotifyWebPush] = useState(user?.notifyWebPush ?? true);
  const [crashOn, setCrashOn] = useState(false);
  useEffect(() => {
    setCrashOn(window.localStorage.getItem("rs.crashReports") === "on");
  }, []);

  /* Dedicated box: launch-at-login lives in the Electron main process. The
     bridge is absent in the browser — the card explains that honestly. */
  const [launchOnBoot, setLaunchOnBoot] = useState<boolean | null>(null);
  const [launchOnBootSupported, setLaunchOnBootSupported] = useState(false);
  useEffect(() => {
    const bridge = (window as any).realmswapDesktop;
    if (!bridge?.getLaunchOnBoot) return;
    bridge.getLaunchOnBoot().then((state: { supported: boolean; openAtLogin: boolean }) => {
      setLaunchOnBootSupported(!!state?.supported);
      setLaunchOnBoot(!!state?.openAtLogin);
    }).catch(() => {});
  }, []);
  const toggleLaunchOnBoot = async () => {
    const bridge = (window as any).realmswapDesktop;
    if (!bridge?.setLaunchOnBoot) return;
    try {
      const next = !(launchOnBoot ?? false);
      const state = await bridge.setLaunchOnBoot(next);
      setLaunchOnBoot(!!state?.openAtLogin);
      toast.success(state?.openAtLogin
        ? "RealmSwap will start when this PC signs in."
        : "RealmSwap will no longer start at sign-in.");
    } catch (err: any) {
      toast.error(err?.message || "Could not update the sign-in setting.");
    }
  };
  const [pushSupported, setPushSupported] = useState(false);

  /* Admin: open realm-report queue. Null until the first successful load, so
     a 403 from the cloud boundary (local admin, not a cloud admin) leaves the
     section invisible — silent, no error noise for the mismatch case. */
  const [realmReports, setRealmReports] = useState<RealmReport[] | null>(null);
  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    fetch("/api/admin/realm-reports")
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        setRealmReports(data.reports || []);
      })
      .catch(() => {});
  }, []);

  const setRealmReportStatus = async (
    id: string,
    status: "DISMISSED" | "REVIEWED" | "ACTIONED"
  ) => {
    try {
      const res = await fetch(`/api/admin/realm-reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to update report");
      setRealmReports((prev) => (prev || []).filter((r) => r.id !== id));
      toast.success(`Report ${status.toLowerCase()}.`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update report");
    }
  };

  // Admin: notification delivery config (SMTP + Discord webhook). Null until
  // the first successful load so a 403 leaves the section silent, matching
  // the realm-reports handling above.
  interface NotificationDeliveryConfig {
    smtp: { configured: boolean; host: string; port: number; secure: boolean; user: string; from: string; passwordConfigured: boolean };
    discord: { webhookConfigured: boolean };
    health: { lastError: string | null; lastSentAt: string | null };
  }
  const [deliveryCfg, setDeliveryCfg] = useState<NotificationDeliveryConfig | null>(null);
  const [deliverySaving, setDeliverySaving] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [discordWebhook, setDiscordWebhook] = useState("");
  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    fetch("/api/system/notifications")
      .then(async (res) => {
        if (!res.ok) return;
        const data: NotificationDeliveryConfig = await res.json();
        setDeliveryCfg(data);
        setSmtpHost(data.smtp.host || "");
        setSmtpPort(String(data.smtp.port || 587));
        setSmtpSecure(!!data.smtp.secure);
        setSmtpUser(data.smtp.user || "");
        setSmtpFrom(data.smtp.from || "");
        setDiscordWebhook(""); // the webhook URL holds a secret token — never echoed back
      })
      .catch(() => {});
  }, []);

  const saveDelivery = async () => {
    setDeliverySaving(true);
    try {
      const res = await fetch("/api/system/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtpHost,
          smtpPort: parseInt(smtpPort) || 587,
          smtpSecure,
          smtpUser,
          // Blank = keep the saved password (server contract).
          smtpPass: smtpPass === "" ? undefined : smtpPass,
          smtpFrom,
          discordWebhook,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save delivery settings");
      setDeliveryCfg(data);
      setSmtpPass("");
      toast.success("Delivery settings saved.");
    } catch (err: any) {
      toast.error(err.message || "Failed to save delivery settings");
    } finally {
      setDeliverySaving(false);
    }
  };

  const testDelivery = async (channel: "email" | "discord") => {
    try {
      const res = await fetch("/api/system/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        toast.success(data.message || "Test sent.");
        // The endpoint stamps health on success — refresh what we show.
        fetch("/api/system/notifications").then(async (r) => r.ok && setDeliveryCfg(await r.json())).catch(() => {});
      } else {
        toast.error(data.error || `Test failed (${res.status})`);
        fetch("/api/system/notifications").then(async (r) => r.ok && setDeliveryCfg(await r.json())).catch(() => {});
      }
    } catch (err: any) {
      toast.error(err.message || "Test failed");
    }
  };

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

  const savePreferences = async (
    next: { notifyDiscord: boolean; notifyEmail: boolean; notifyWebPush: boolean }
  ) => {
    try {
      const res = await fetch("/api/user/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error("Failed to save preferences");
      return true;
    } catch (err: any) {
      toast.error(err.message || "Failed to save preferences");
      return false;
    }
  };

  // Toggles save the moment they flip — same semantic as the crash-reports
  // toggle directly above them. The old explicit "Save Preferences" button
  // mixed save models in one list: flip + navigate away silently lost the
  // change.
  const togglePreference = async (
    key: "notifyDiscord" | "notifyEmail" | "notifyWebPush",
    value: boolean
  ) => {
    const next = { notifyDiscord, notifyEmail, notifyWebPush, [key]: value };
    if (key === "notifyDiscord") setNotifyDiscord(value);
    if (key === "notifyEmail") setNotifyEmail(value);
    if (key === "notifyWebPush") setNotifyWebPush(value);
    const ok = await savePreferences(next);
    if (ok) toast.success("Preference saved.");
  };

  return (
    <div className="min-h-screen flex bg-background text-slate-100 font-sans selection:bg-accentPurple/30">
      <SidebarNavigation user={user} />

      <main className="flex-1 p-8 pb-24 md:pb-8 lg:p-12 lg:pb-12 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">
              Settings
            </h1>
            <p className="text-slate-400 text-sm">
              Manage your personal RealmSwap preferences and integrations.
            </p>
          </div>

          <form onSubmit={handleSave} className="space-y-6 bg-slate-950/50 p-6 rounded-2xl border border-white/5">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Discord Integration</h2>
              <p className="text-xs text-slate-400 mb-4">
                Connect your Discord account to manage your servers via the RealmSwap Discord Bot.
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

          <form onSubmit={(e) => e.preventDefault()} className="space-y-6 bg-slate-950/50 p-6 rounded-2xl border border-white/5">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Appearance</h2>
              <p className="text-xs text-slate-400 mb-6">
                Dark is the classic RealmSwap look; light follows your daytime mood.
              </p>

              <div className="flex items-center justify-between p-4 bg-slate-900 border border-white/5 rounded-lg">
                <div className="flex items-center gap-3">
                  {theme === "dark" ? <Moon className="w-4 h-4 text-slate-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
                  <h3 className="text-sm font-bold text-slate-200">Theme</h3>
                </div>
                <div className="flex rounded-lg bg-slate-950 border border-white/10 p-1 gap-1">
                  {([
                    { id: "dark" as Theme, label: "Dark", icon: Moon },
                    { id: "light" as Theme, label: "Light", icon: Sun },
                  ]).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => changeTheme(opt.id)}
                      aria-pressed={theme === opt.id}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                        theme === opt.id
                          ? "bg-accentPurple text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <opt.icon className="w-3.5 h-3.5" />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </form>

          <form onSubmit={(e) => e.preventDefault()} className="space-y-6 bg-slate-950/50 p-6 rounded-2xl border border-white/5">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">{t("settings.language.title")}</h2>
              <p className="text-xs text-slate-400 mb-6">{t("settings.language.body")}</p>

              <div className="flex items-center justify-between p-4 bg-slate-900 border border-white/5 rounded-lg">
                <div className="flex items-center gap-3">
                  <Languages className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-bold text-slate-200">{t("settings.language.title")}</h3>
                </div>
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value)}
                  aria-label={t("settings.language.title")}
                  className="bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-accentPurple focus:outline-none"
                >
                  {LOCALES.map((l) => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </form>

          <form onSubmit={(e) => e.preventDefault()} className="space-y-6 bg-slate-950/50 p-6 rounded-2xl border border-white/5">
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Notifications</h2>
              <p className="text-xs text-slate-400 mb-6">
                Choose how you want to be alerted when a server crashes, fails to restart, or a backup fails.
              </p>

              <div className="space-y-4">
                {/* Crash Reports (opt-in) */}
                <div className="flex items-center justify-between p-4 bg-slate-900 border border-white/5 rounded-lg">
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">Anonymous Crash Reports</h3>
                    <p className="text-xs text-slate-500">
                      Help us fix bugs by sending anonymous error reports when something breaks.
                      Off by default; nothing is sent unless you turn this on.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={crashOn}
                      onChange={(e) => {
                        window.localStorage.setItem("rs.crashReports", e.target.checked ? "on" : "off");
                        setCrashOn(e.target.checked);
                        if (e.target.checked) initClientErrorReporting();
                        toast.success(e.target.checked ? "Crash reporting enabled — thank you!" : "Crash reporting disabled.");
                      }}
                    />
                    <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accentPurple"></div>
                  </label>
                </div>

                {/* Discord Toggle */}
                <div className="flex items-center justify-between p-4 bg-slate-900 border border-white/5 rounded-lg">
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">Discord Direct Messages</h3>
                    <p className="text-xs text-slate-500">Receive an instant DM from the RealmSwap bot.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={notifyDiscord} onChange={(e) => togglePreference("notifyDiscord", e.target.checked)} />
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
                    <input type="checkbox" className="sr-only peer" checked={notifyEmail} onChange={(e) => togglePreference("notifyEmail", e.target.checked)} />
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
                      <input type="checkbox" className="sr-only peer" checked={notifyWebPush} onChange={(e) => togglePreference("notifyWebPush", e.target.checked)} disabled={!pushSupported} />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accentPurple peer-disabled:opacity-50"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Admin: where the alerts above actually go. Without a working
               channel here, an enabled toggle is silent — this section makes
               that visible (and fixable) instead of a no-op. */}
            {user?.role === "ADMIN" && (
              <div className="pt-6 border-t border-white/5 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-slate-400" />
                    Delivery Channels (admin)
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    SMTP carries the email alerts; a Discord webhook posts server-wide alerts to your server (no bot
                    needed). The toggles above only opt you in — without a channel here they have nothing to send through.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">SMTP Host</span>
                    <input type="text" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com"
                      className="mt-1 w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accentPurple" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">SMTP Port</span>
                    <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587"
                      className="mt-1 w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accentPurple" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">SMTP Username</span>
                    <input type="text" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="you@example.com"
                      className="mt-1 w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accentPurple" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">SMTP Password</span>
                    <input type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)}
                      placeholder={deliveryCfg?.smtp.passwordConfigured ? "Saved — leave blank to keep" : "App password"}
                      className="mt-1 w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accentPurple" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">From Address</span>
                    <input type="text" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="RealmSwap <you@example.com>"
                      className="mt-1 w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accentPurple" />
                  </label>
                  <label className="flex items-center justify-between gap-3 p-3 bg-slate-900 border border-white/5 rounded-lg self-end">
                    <span className="text-xs font-bold text-slate-300">Use TLS on connect (port 465)</span>
                    <input type="checkbox" checked={smtpSecure} onChange={(e) => setSmtpSecure(e.target.checked)}
                      className="w-4 h-4 accent-purple-500" />
                  </label>
                </div>

                <label className="block">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Webhook className="w-3.5 h-3.5" /> Discord Webhook URL
                  </span>
                  <input type="text" value={discordWebhook} onChange={(e) => setDiscordWebhook(e.target.value)}
                    placeholder={deliveryCfg?.discord.webhookConfigured ? "Saved — paste a new URL to replace" : "https://discord.com/api/webhooks/..."}
                    className="mt-1 w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accentPurple" />
                  <span className="text-[10px] text-slate-500 block mt-1">
                    Server Settings → Integrations → Webhooks in Discord. Alert embeds post to that channel.
                  </span>
                </label>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button type="button" onClick={saveDelivery} disabled={deliverySaving}
                    className="flex items-center gap-2 bg-accentPurple hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-bold text-xs transition-colors disabled:opacity-50">
                    <Save className="w-3.5 h-3.5" />
                    Save Delivery Settings
                  </button>
                  <button type="button" onClick={() => testDelivery("email")} disabled={!smtpHost}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-bold text-xs transition-colors disabled:opacity-50">
                    <Send className="w-3.5 h-3.5" />
                    Send Test Email
                  </button>
                  <button type="button" onClick={() => testDelivery("discord")} disabled={!deliveryCfg?.discord.webhookConfigured && !discordWebhook}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-bold text-xs transition-colors disabled:opacity-50">
                    <Send className="w-3.5 h-3.5" />
                    Send Test Webhook
                  </button>
                </div>

                {deliveryCfg && (
                  <div className="text-xs p-3 bg-slate-900 border border-white/5 rounded-lg">
                    {deliveryCfg.health.lastError ? (
                      <p className="text-red-400 break-words">
                        Last delivery failed: {deliveryCfg.health.lastError}
                      </p>
                    ) : deliveryCfg.health.lastSentAt ? (
                      <p className="text-emerald-400">
                        Last delivered {new Date(deliveryCfg.health.lastSentAt).toLocaleString()}.
                      </p>
                    ) : (
                      <p className="text-slate-500">No sends yet — use a test button to check a channel.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="pt-4 border-t border-white/5">
              <p className="text-[10px] text-slate-500 text-right">Preferences save the moment you flip a toggle.</p>
            </div>
          </form>

          {user?.role === "ADMIN" && (
            <div className="space-y-6 bg-slate-950/50 p-6 rounded-2xl border border-white/5 mt-8">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Dedicated Box</h2>
                <p className="text-xs text-slate-400 mb-6">
                  Turn this PC into an always-ready server box: it signs in, RealmSwap starts, and servers marked
                  &ldquo;Start with RealmSwap&rdquo; (Game Settings &rarr; Power &amp; Automation) boot on their own.
                  Discord game nights take it from there.
                </p>

                <div className="flex items-center justify-between gap-4 p-4 bg-slate-900 border border-white/5 rounded-lg">
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">Start RealmSwap when this PC signs in</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-md">
                      {launchOnBootSupported
                        ? "RealmSwap launches automatically at sign-in and keeps running in the tray when the window is closed."
                        : "Available in the RealmSwap desktop app. Running from a browser? Keep RealmSwap running by hand."}
                    </p>
                  </div>
                  {launchOnBootSupported && (
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={launchOnBoot ?? false}
                        disabled={launchOnBoot === null}
                        onChange={toggleLaunchOnBoot}
                      />
                      <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accentPurple"></div>
                    </label>
                  )}
                </div>

                <PowerSettings />
              </div>
            </div>
          )}

          {user?.role === "ADMIN" && (
            <div className="space-y-6 bg-slate-950/50 p-6 rounded-2xl border border-white/5 mt-8">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Administration</h2>
                <p className="text-xs text-slate-400 mb-6">
                  Global tools and ecosystem integrations.
                </p>

                <div className="flex items-center justify-between p-4 bg-slate-900 border border-white/5 rounded-lg">
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">Import Pterodactyl Egg</h3>
                    <p className="text-xs text-slate-500">Upload a standard Pterodactyl Egg JSON file to instantly add a new Game Definition to RealmSwap.</p>
                  </div>
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleEggUpload}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg font-bold text-xs transition-colors disabled:opacity-50"
                  >
                    <UploadCloud className="w-4 h-4" />
                    Upload JSON
                  </button>
                </div>
              </div>
            </div>
          )}

          {user?.role === "ADMIN" && realmReports !== null && (
            <div className="space-y-6 bg-slate-950/50 p-6 rounded-2xl border border-white/5 mt-8">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Realm reports</h2>
                <p className="text-xs text-slate-400 mb-6">
                  Community reports about marketplace realms.
                </p>

                {realmReports.length === 0 ? (
                  <p className="text-xs text-slate-500">No open reports.</p>
                ) : (
                  <div className="space-y-2">
                    {realmReports.map((r) => (
                      <div key={r.id} className="flex items-start justify-between gap-4 p-4 bg-slate-900 border border-white/5 rounded-lg">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-200 truncate">
                              {r.realm?.name || "Unknown realm"}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-slate-400 font-bold capitalize border border-white/5">
                              {r.reason.toLowerCase()}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              {r.reporter?.display_name ? `by ${r.reporter.display_name}` : "reporter unavailable"}
                              {" · "}
                              {reportAge(r.created_at)}
                            </span>
                          </div>
                          {r.details && (
                            <p className="text-xs text-slate-500 mt-1 truncate" title={r.details}>
                              {r.details}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setRealmReportStatus(r.id, "DISMISSED")}
                            className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg font-bold transition-colors"
                          >
                            Dismiss
                          </button>
                          <button
                            type="button"
                            onClick={() => setRealmReportStatus(r.id, "REVIEWED")}
                            className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg font-bold transition-colors"
                          >
                            Reviewed
                          </button>
                          <button
                            type="button"
                            onClick={() => setRealmReportStatus(r.id, "ACTIONED")}
                            className="text-xs bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg font-bold transition-colors"
                          >
                            Actioned
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
