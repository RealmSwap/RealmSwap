"use client";

import React, { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  AlertTriangle, Check, Copy, ExternalLink, Globe, Loader2, QrCode, RefreshCw,
  ShieldCheck, X, XCircle,
} from "lucide-react";
import { isLoopbackOrigin, statusPageUrl } from "@/lib/shareLink";

interface Check {
  id: string; label: string; status: "ok" | "warn" | "fail" | "skip";
  detail: string; fixCommand?: string;
}

const STATUS_STYLES: Record<Check["status"], string> = {
  ok: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  warn: "bg-amber-500/10 border-amber-500/30 text-amber-400",
  fail: "bg-red-500/10 border-red-500/30 text-red-400",
  skip: "bg-slate-800/60 border-white/5 text-slate-500",
};
const STATUS_ICONS: Record<Check["status"], React.ReactNode> = {
  ok: <Check className="w-3.5 h-3.5" />,
  warn: <AlertTriangle className="w-3.5 h-3.5" />,
  fail: <XCircle className="w-3.5 h-3.5" />,
  skip: <div className="w-3.5 h-3.5 rounded-full border border-current opacity-50" />,
};

/**
 * "Connection" dialog: everything about friends joining this server in one
 * place — a shareable invite (QR + realmsync deep link + address/password) and
 * a friends-can't-join troubleshooter with copyable fixes.
 */
export function ConnectionModal({ server, onClose }: { server: any; onClose: () => void }) {
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [tunnelOn, setTunnelOn] = useState<boolean>(!!server.tunnelEnabled);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [inviteCode, setInviteCode] = useState<string | null>(server.inviteCode ?? null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMappingWarning, setInviteMappingWarning] = useState(false);
  const [shareCode, setShareCode] = useState<string | null>(server.statusShareCode ?? null);
  const [shareBusy, setShareBusy] = useState(false);

  // Escape closes — this is the dashboard's most-used dialog, and it was
  // reachable only by mouse (backdrop click / X button).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const manageStatusShare = async (action: "enable" | "disable" | "rotate") => {
    setShareBusy(true);
    try {
      const res = await fetch(`/api/servers/${server.id}/status-share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update the status link");
      setShareCode(json.code);
      setCopied(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setShareBusy(false);
    }
  };

  const toggleTunnel = async (enable: boolean) => {
    setTunnelBusy(true);
    try {
      const res = await fetch(`/api/servers/${server.id}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "TOGGLE_TUNNEL", enable }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to toggle tunnel");
      setTunnelOn(enable);
      load(); // re-run checks with the new path
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTunnelBusy(false);
    }
  };

  const generateInvite = async () => {
    setInviteBusy(true);
    try {
      const res = await fetch(`/api/servers/${server.id}/invite`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to generate invite");
      setInviteCode(json.inviteCode);
      setInviteMappingWarning(json.syncMappingOk === false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInviteBusy(false);
    }
  };

  const load = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${server.id}/connectivity`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load connection info");
      setData(json);
      if (json.tunnel) setTunnelOn(!!json.tunnel.enabled);
      if (json.statusShare) setShareCode(json.statusShare.code);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, [server.id]);

  useEffect(() => { load(); }, [load]);

  // QR encodes the realmsync deep link when present, else the raw address.
  useEffect(() => {
    const invite = data?.invite ? { ...data.invite, inviteCode } : undefined;
    if (!invite) return;
    const content = invite.inviteCode ? `realmsync://${invite.inviteCode}` : invite.address;
    QRCode.toDataURL(content, { width: 220, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [data, inviteCode]);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const invite = data?.invite ? { ...data.invite, inviteCode } : undefined;
  const addressPath: "tunnel" | "public" | "lan" | "loopback" | undefined = data?.invite?.addressPath;
  const inviteText = invite
    ? [
        `Join my ${invite.gameDisplayName} server — ${invite.serverName}`,
        `Address: ${invite.address}`,
        invite.password ? `Password: ${invite.password}` : null,
        invite.inviteCode ? `One-click (RealmSync app): realmsync://${invite.inviteCode}` : null,
      ].filter(Boolean).join("\n")
    : "";

  const report = data?.report;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-label={`Connection — ${server.name}`} onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-white/10 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 sticky top-0 bg-slate-900 z-10">
          <div>
            <h3 className="font-extrabold text-white text-lg flex items-center gap-2">
              <QrCode className="w-5 h-5 text-accentPurple" />
              Connection — {server.name}
            </h3>
            <p className="text-xs text-slate-400">Invite friends, or find out why they can't join.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={checking}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              title="Re-run checks"
            >
              <RefreshCw className={`w-5 h-5 ${checking ? "animate-spin" : ""}`} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-6">
          {loading && (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-accentPurple animate-spin" /></div>
          )}
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold">{error}</div>
          )}

          {/* Invite section */}
          {invite && (
            <div className="grid sm:grid-cols-[auto_1fr] gap-5 items-start p-4 rounded-xl bg-slate-950/60 border border-white/5">
              <div className="flex flex-col items-center gap-2">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Scan to join" className="w-[140px] h-[140px] rounded-lg bg-white p-1.5" />
                ) : (
                  <div className="w-[140px] h-[140px] rounded-lg bg-white/5 flex items-center justify-center text-[10px] text-slate-500">QR unavailable</div>
                )}
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Scan to join</span>
              </div>
              <div className="space-y-3">
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Address</span>
                  <div className="flex items-center gap-2">
                    <code className="text-sm text-white font-mono bg-black/40 px-3 py-1.5 rounded border border-white/10 flex-1">{invite.address}</code>
                    <button onClick={() => copy(invite.address, "addr")} className="p-2 rounded bg-white/5 hover:bg-white/10 text-slate-300">
                      {copied === "addr" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {addressPath === "tunnel" && (
                  <p className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                    <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
                    Friends connect through the playit relay — your home IP stays private.
                  </p>
                )}
                {addressPath === "public" && (
                  <p className="flex items-start gap-1.5 text-[11px] font-bold text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>This is your home&apos;s public IP — anyone you share the server with can see it, and it points at your router. Turn on the playit tunnel below to route friends through a relay instead and keep your home IP private.</span>
                  </p>
                )}
                {addressPath === "lan" && (
                  <p className="flex items-start gap-1.5 text-[11px] font-bold text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>Works for friends on your network. For friends elsewhere, turn on the playit tunnel below — no router setup, and your home IP stays private.</span>
                  </p>
                )}
                {addressPath === "loopback" && (
                  <p className="flex items-start gap-1.5 text-[11px] font-bold text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span>This is a local-only address — friends can&apos;t reach it from outside your machine. Turn on the playit tunnel below to get a shareable address.</span>
                  </p>
                )}
                {invite.password !== "" && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Password</span>
                    <div className="flex items-center gap-2">
                      <code className="text-sm text-white font-mono bg-black/40 px-3 py-1.5 rounded border border-white/10 flex-1 cursor-pointer select-all" onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? invite.password : "•".repeat(Math.min(invite.password.length, 16))}
                      </code>
                      <button onClick={() => copy(invite.password, "pw")} className="p-2 rounded bg-white/5 hover:bg-white/10 text-slate-300">
                        {copied === "pw" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
                {!invite.inviteCode && (
                  <button
                    onClick={generateInvite}
                    disabled={inviteBusy}
                    className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:border-accentPurple/50 hover:bg-accentPurple/10 text-white text-xs font-bold transition-colors"
                  >
                    {inviteBusy ? "Generating…" : "Generate one-click invite link"}
                  </button>
                )}
                {invite.inviteCode && (
                  <div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">One-click link (RealmSync app)</span>
                    <div className="flex items-center gap-2">
                      <code className="text-[11px] text-slate-300 font-mono bg-black/40 px-3 py-1.5 rounded border border-white/10 flex-1 truncate">realmsync://{invite.inviteCode}</code>
                      <button onClick={() => copy(`realmsync://${invite.inviteCode}`, "link")} className="p-2 rounded bg-white/5 hover:bg-white/10 text-slate-300">
                        {copied === "link" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}
                {inviteMappingWarning && (
                  <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-bold">
                    Your router wouldn't open TCP 3001 — this invite only works on your LAN. Forward TCP 3001 on the router for internet invites.
                  </div>
                )}
                <button
                  onClick={() => copy(inviteText, "all")}
                  className="w-full mt-1 px-4 py-2 rounded-lg bg-accentPurple hover:bg-accentPurple/90 text-white text-xs font-bold transition-colors"
                >
                  {copied === "all" ? "Copied — paste it to your friends!" : "Copy invite message"}
                </button>
              </div>
            </div>
          )}

          {/* Tunnel control — the troubleshooter's most common fix, one click away */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  Playit tunnel
                  {!tunnelOn && addressPath && addressPath !== "tunnel" && (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                      Recommended
                    </span>
                  )}
                </h4>
                <p className="text-xs text-slate-500">
                  {tunnelOn && data?.tunnel?.alive && data?.tunnel?.url
                    ? `Tunnel live — friends connect through ${data.tunnel.url}.`
                    : tunnelOn && data?.tunnel?.claimUrl
                      ? "Waiting for you to claim the agent below — RealmSwap then creates the tunnel and writes your address automatically."
                      : tunnelOn
                        ? "Agent starting — the public address appears here as soon as playit reports one."
                        : "Off — turn it on and friends connect through a playit relay: zero router setup, works behind strict routers, and your home IP stays private."}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={tunnelOn}
                disabled={tunnelBusy}
                onChange={(e) => toggleTunnel(e.target.checked)}
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accentPurple"></div>
            </label>
            </div>
            {tunnelOn && data?.tunnel?.claimUrl && !data?.tunnel?.url && (
              <a
                href={data.tunnel.claimUrl}
                target="_blank"
                rel="noreferrer"
                className="block px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-bold hover:bg-amber-500/20 transition-colors"
              >
                Claim this agent on playit.gg → RealmSwap then creates the tunnel for port {server.port} and writes your address automatically. No dashboard work needed.
              </a>
            )}
            {tunnelOn && data?.tunnel?.url && !data?.tunnel?.alive && (
              <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-bold">
                Tunnel address saved but no agent is running — toggle off and on to restart it.
              </div>
            )}
          </div>

          {/* Public status page — the no-login link to share anywhere */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 space-y-2">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-sky-400" />
              <h4 className="text-sm font-bold text-slate-200">Public status page</h4>
            </div>
            {shareCode ? (
              (() => {
                const origin = typeof window !== "undefined" ? window.location.origin : "";
                const shareUrl = statusPageUrl(shareCode, origin);
                const localOnly = isLoopbackOrigin(origin);
                return (
                  <>
                    <p className="text-xs text-slate-500">
                      {localOnly
                        ? "This status page runs on your machine, so the link below only works for you right now. Hosted public links (realmswap.app/s/<code>) are on the roadmap — the code you generate today carries over."
                        : "Anyone with this link can see when the server is up, how many players are online, and the next planned session — no login, no passwords."}
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="text-[11px] text-slate-300 font-mono bg-black/40 px-3 py-1.5 rounded border border-white/10 flex-1 truncate">
                        {shareUrl}
                      </code>
                      <button
                        onClick={() => copy(shareUrl, "share")}
                        className="p-2 rounded bg-white/5 hover:bg-white/10 text-slate-300 flex-shrink-0"
                        title={localOnly ? "Copy link (works on this machine only)" : "Copy status link"}
                      >
                        {copied === "share" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <a
                        href={`/s/${shareCode}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 rounded bg-white/5 hover:bg-white/10 text-slate-300 flex-shrink-0"
                        title="Open the status page"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                    {localOnly && (
                      <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-bold">
                        Heads up: friends can&apos;t open a <span className="font-mono">localhost</span> URL — this link won&apos;t work outside your machine yet.
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => manageStatusShare("rotate")}
                        disabled={shareBusy}
                        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-accentPurple/50 hover:bg-accentPurple/10 text-slate-300 text-[11px] font-bold transition-colors disabled:opacity-40"
                      >
                        New link
                      </button>
                      <button
                        onClick={() => manageStatusShare("disable")}
                        disabled={shareBusy}
                        className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-red-500/50 hover:bg-red-500/10 text-slate-300 hover:text-red-400 text-[11px] font-bold transition-colors disabled:opacity-40"
                      >
                        Turn off
                      </button>
                    </div>
                  </>
                );
              })()
            ) : (
              <>
                <p className="text-xs text-slate-500">
                  Create a no-login link that shows when the server is up, how many players are online, and the next planned session — perfect for pinning in Discord.
                </p>
                <button
                  onClick={() => manageStatusShare("enable")}
                  disabled={shareBusy}
                  className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:border-sky-500/50 hover:bg-sky-500/10 text-white text-xs font-bold transition-colors disabled:opacity-40"
                >
                  {shareBusy ? "Working…" : "Create public status link"}
                </button>
              </>
            )}
          </div>

          {/* Diagnose section */}
          {report && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="w-4 h-4 text-accentPurple" />
                <h4 className="text-sm font-extrabold text-white">Can friends join?</h4>
                <span className={`ml-auto px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
                  report.overall === "ready" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : report.overall === "maybe" ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  : "bg-red-500/10 text-red-400 border-red-500/30"
                }`}>
                  {report.overall === "ready" ? "Ready" : report.overall === "maybe" ? "Probably" : "Blocked"}
                </span>
              </div>
              <div className="space-y-2">
                {report.checks.map((check: Check) => (
                  <div key={check.id} className={`p-3 rounded-lg border text-xs ${STATUS_STYLES[check.status]}`}>
                    <div className="flex items-center gap-2 font-bold">
                      {STATUS_ICONS[check.status]}
                      {check.label}
                    </div>
                    <p className="mt-1 text-slate-400 leading-relaxed">{check.detail}</p>
                    {check.fixCommand && (
                      <button
                        onClick={() => copy(check.fixCommand!, `${check.id}-fix`)}
                        className="mt-2 w-full text-left px-3 py-2 rounded bg-black/40 border border-white/10 font-mono text-[10px] text-slate-300 hover:border-accentPurple/40 transition-colors break-all"
                        title="Click to copy"
                      >
                        {copied === `${check.id}-fix` ? "Copied!" : check.fixCommand}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
