"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Mail, ShieldCheck, ShieldAlert, Key } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    setError("");
    setMessage("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to process request");
      }

      setMessage(data.message);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-background">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-accentPurple/5 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accentBlue/5 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md">
        {/* Logo Header */}
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="flex items-center gap-2 mb-2 group">
            <img src="/logo.png" alt="RealmSwap" className="h-12 w-auto scale-[7] -translate-x-16 translate-y-2 pointer-events-none select-none" />
          </Link>
          <p className="text-sm text-mutedText">Recover access to your game worlds</p>
        </div>

        {/* Card Form */}
        <div className="glass-panel-purple p-8 rounded-2xl border border-accentPurple/20 box-glow-purple">
          <h2 className="text-xl font-bold mb-4 text-center text-white flex items-center justify-center gap-1.5">
            <Key className="w-4.5 h-4.5 text-accentPurple" />
            Reset Password
          </h2>
          <p className="text-xs text-mutedText mb-6 text-center leading-relaxed">
            Enter your registered email address below. We'll simulate sending a reset link and reconfigure your password.
          </p>

          {error && (
            <div className="p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2 animate-slide-down">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div className="p-4 mb-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex flex-col gap-2 animate-slide-down">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                <span className="font-bold">Request Success!</span>
              </div>
              <p className="text-slate-300 leading-relaxed text-[11px]">{message}</p>
            </div>
          )}

          {!message && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-mutedText tracking-wider uppercase block mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@domain.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-950/60 border border-white/5 focus:border-accentPurple focus:ring-1 focus:ring-accentPurple outline-none transition-all duration-200 text-sm text-slate-200"
                    required
                  />
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-accentPurple hover:bg-accentPurpleHover disabled:bg-accentPurple/50 disabled:cursor-not-allowed text-white font-bold transition-all duration-200 text-sm shadow-lg shadow-accentPurple/10 border border-accentPurple/30"
              >
                {loading ? "Processing..." : "Send Reset Instructions"}
              </button>
            </form>
          )}

          <div className="mt-6 pt-4 border-t border-white/5 text-center">
            <Link 
              href="/login" 
              className="text-xs text-accentPurple hover:text-accentPurpleHover font-semibold transition-colors"
            >
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
