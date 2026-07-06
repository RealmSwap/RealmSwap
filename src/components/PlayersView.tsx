"use client";

import React, { useEffect, useState } from "react";
import { Users, ShieldAlert, Plus, Edit, Trash2, Shield, Search, X } from "lucide-react";

import { SidebarNavigation } from "@/components/dashboard/SidebarNavigation";

export default function PlayersView({ user }: { user: any }) {
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [isBanModalOpen, setIsBanModalOpen] = useState(false);
  const [banReason, setBanReason] = useState("");

  useEffect(() => {
    fetchPlayers();
  }, []);

  const fetchPlayers = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/players");
      if (res.ok) {
        setPlayers(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleGlobalBanSubmit = async () => {
    if (!selectedPlayer) return;
    try {
      const res = await fetch(`/api/players/${selectedPlayer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isGloballyBanned: true, globalBanReason: banReason })
      });
      if (res.ok) {
        fetchPlayers();
        setSelectedPlayer({ ...selectedPlayer, isGloballyBanned: true, globalBanReason: banReason });
        setIsBanModalOpen(false);
        setBanReason("");
      } else {
        const errorData = await res.json();
        alert(`Failed to ban player: ${errorData.error}`);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Error: ${e.message}`);
    }
  };

  const handleGlobalBanRevoke = async (playerId: string) => {
    try {
      const res = await fetch(`/api/players/${playerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isGloballyBanned: false, globalBanReason: null })
      });
      if (res.ok) {
        fetchPlayers();
        if (selectedPlayer && selectedPlayer.id === playerId) {
          setSelectedPlayer({ ...selectedPlayer, isGloballyBanned: false, globalBanReason: null });
        }
      } else {
        const errorData = await res.json();
        alert(`Failed to revoke ban: ${errorData.error}`);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Error: ${e.message}`);
    }
  };

  const handleAddPlayerSubmit = async () => {
    if (!newPlayerName.trim()) return;
    try {
      const res = await fetch("/api/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newPlayerName.trim() })
      });
      if (res.ok) {
        fetchPlayers();
        setIsAddModalOpen(false);
        setNewPlayerName("");
      } else {
        const errorData = await res.json();
        alert(`Failed to add player: ${errorData.error}`);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Error: ${e.message}`);
    }
  };

  const handleSyncServer = async (serverId: string) => {
    try {
      const res = await fetch(`/api/players/${serverId}/sync`, { method: "POST" });
      if (res.ok) {
        alert("Server synchronized successfully!");
      } else {
        alert("Failed to sync server");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = players.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen flex bg-[#030712] text-slate-100 font-sans selection:bg-accentPurple/30">
      <SidebarNavigation user={user} />
      <main className="flex-1 flex flex-col min-w-0 p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-black text-white flex items-center gap-3">
              <Users className="w-8 h-8 text-accentPurple" />
              Global Player Management
            </h1>
            <p className="text-slate-400 mt-2">Manage players, whitelists, and bans across all your servers from one place.</p>
          </div>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="px-5 py-2.5 bg-accentPurple hover:bg-accentPurpleHover text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-accentPurple/20 transition-all"
          >
            <Plus className="w-5 h-5" /> Add Player
          </button>
        </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left Side: Player List */}
        <div className="w-1/3 flex flex-col bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-white/5 bg-slate-950/50">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search players..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-accentPurple transition-colors"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-1">
            {loading ? (
              <p className="p-4 text-slate-400 text-sm text-center">Loading players...</p>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-slate-400 text-sm text-center">No players found.</p>
            ) : (
              filtered.map(player => (
                <div
                  key={player.id}
                  onClick={() => setSelectedPlayer(player)}
                  className={`p-3 rounded-xl flex items-center justify-between cursor-pointer transition-colors ${
                    selectedPlayer?.id === player.id 
                      ? "bg-accentPurple/20 border border-accentPurple/30 text-white" 
                      : "hover:bg-white/5 border border-transparent text-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-lg ${
                      player.isGloballyBanned ? "bg-red-500/20 text-red-400" : "bg-slate-800 text-slate-200"
                    }`}>
                      {player.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold">{player.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        {player.isGloballyBanned ? (
                          <span className="text-[10px] font-bold text-red-400 uppercase flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Banned</span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-400 uppercase">Trusted</span>
                        )}
                        {player.roles && (
                          <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold uppercase">{player.roles}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Detail View */}
        <div className="flex-1 flex flex-col bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-2xl relative">
          {selectedPlayer ? (
            <div className="absolute inset-0 flex flex-col">
              <div className="p-8 border-b border-white/5 bg-gradient-to-b from-slate-950/80 to-transparent flex justify-between items-start">
                <div className="flex items-center gap-5">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black shadow-xl ${
                    selectedPlayer.isGloballyBanned ? "bg-red-500/20 text-red-400 border-2 border-red-500/30" : "bg-gradient-to-br from-accentPurple to-blue-500 text-white"
                  }`}>
                    {selectedPlayer.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-white">{selectedPlayer.name}</h2>
                    <p className="text-sm text-slate-400 mt-1">
                      Member since {new Date(selectedPlayer.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {selectedPlayer.isGloballyBanned ? (
                  <button 
                    onClick={() => handleGlobalBanRevoke(selectedPlayer.id)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold flex items-center gap-2 transition-colors border border-white/10"
                  >
                    <Shield className="w-4 h-4 text-emerald-400" /> Revoke Global Ban
                  </button>
                ) : (
                  <button 
                    onClick={() => setIsBanModalOpen(true)}
                    className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg font-bold flex items-center gap-2 transition-colors"
                  >
                    <ShieldAlert className="w-4 h-4" /> Global Ban
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-8">
                {selectedPlayer.isGloballyBanned && (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-red-400 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-red-400 text-sm">Player is Globally Banned</h4>
                      <p className="text-xs text-red-300/80 mt-1">Reason: {selectedPlayer.globalBanReason || "No reason provided"}</p>
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-extrabold text-slate-500 uppercase tracking-widest mb-4">Unified Identity Mapping</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Steam ID</p>
                      <p className="font-mono text-sm text-slate-300">{selectedPlayer.steamId || "Not linked"}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Minecraft UUID</p>
                      <p className="font-mono text-sm text-slate-300">{selectedPlayer.minecraftUuid || "Not linked"}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Xbox ID</p>
                      <p className="font-mono text-sm text-slate-300">{selectedPlayer.xboxId || "Not linked"}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Discord ID</p>
                      <p className="font-mono text-sm text-slate-300">{selectedPlayer.discordId || "Not linked"}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-extrabold text-slate-500 uppercase tracking-widest">Server Access</h3>
                  </div>
                  <div className="space-y-3">
                    {selectedPlayer.serverAccess?.length > 0 ? (
                      selectedPlayer.serverAccess.map((access: any) => (
                        <div key={access.id} className="p-4 rounded-xl bg-slate-950/40 border border-white/5 flex items-center justify-between">
                          <div>
                            <p className="font-bold text-slate-200">{access.server.name}</p>
                            <p className="text-xs text-slate-500">{access.server.game}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            {access.isWhitelisted && (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded font-bold uppercase">Whitelisted</span>
                            )}
                            {access.serverRole && (
                              <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-1 rounded font-bold uppercase">{access.serverRole}</span>
                            )}
                            <button onClick={() => handleSyncServer(access.server.id)} className="text-xs text-accentPurple hover:text-white transition-colors">Sync Files</button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500 italic p-4 bg-slate-950/20 rounded-xl border border-white/5 text-center">
                        This player has not joined any servers yet or no specific access rules are configured.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500">
              <Users className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-sm font-bold">Select a player to view details</p>
            </div>
          )}
        </div>
      </div>
      </main>

      {/* Add Player Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button onClick={() => setIsAddModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-white mb-4">Add New Player</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Player Name</label>
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="e.g. Notch"
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accentPurple transition-colors"
                />
              </div>
              <button
                onClick={handleAddPlayerSubmit}
                disabled={!newPlayerName.trim()}
                className="w-full py-3 bg-accentPurple hover:bg-accentPurpleHover disabled:opacity-50 text-white rounded-xl font-bold transition-all"
              >
                Create Player
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Ban Modal */}
      {isBanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
            <button onClick={() => setIsBanModalOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <ShieldAlert className="w-6 h-6 text-red-500" />
              <h2 className="text-xl font-bold text-white">Issue Global Ban</h2>
            </div>
            <p className="text-sm text-slate-400 mb-6">
              This will ban <strong className="text-white">{selectedPlayer?.name}</strong> across all your synced servers instantly.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Ban Reason</label>
                <input
                  type="text"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="e.g. Griefing"
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsBanModalOpen(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGlobalBanSubmit}
                  disabled={!banReason.trim()}
                  className="flex-1 py-3 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-xl font-bold transition-colors shadow-lg shadow-red-500/20"
                >
                  Confirm Ban
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
