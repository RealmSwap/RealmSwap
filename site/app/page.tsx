"use client";

import React, { useState, useEffect } from "react";
import { 
  Archive, 
  Cpu, 
  Database, 
  ShieldAlert, 
  ShieldCheck, 
  Zap, 
  Layers, 
  RefreshCw, 
  Sparkles, 
  ChevronDown, 
  Globe, 
  Users, 
  Coins, 
  Terminal, 
  Check,
  HardDrive
} from "lucide-react";

// Static-site config. The desktop installer is published as a version-less
// asset on GitHub Releases so this "latest" URL is always valid.
const DOWNLOAD_URL =
  "https://github.com/RealmSwap/RealmSwap/releases/latest/download/RealmSwap-Setup.exe";
const RELEASES_URL = "https://github.com/RealmSwap/RealmSwap/releases";
// GitHub Pages serves this project at the /RealmSwap subpath. Raw <img> tags are
// not auto-prefixed by Next's basePath, so prefix root-absolute assets manually.
const ASSET_PREFIX = "/RealmSwap";

// Mock games data for the interactive widget
const GAMES_LIST = [
  { id: "mc", name: "Minecraft", icon: "⛏️", color: "from-green-500 to-emerald-700", text: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/30", description: "Survival Server", ram: "4 GB", port: "25565", activeText: "Mining blocks since 2011" },
  { id: "vh", name: "Valheim", icon: "⛵", color: "from-amber-500 to-amber-700", text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", description: "Odin's Realm", ram: "6 GB", port: "2456", activeText: "Conquering the 10th Norse world" },
  { id: "pz", name: "Project Zomboid", icon: "🧟", color: "from-red-500 to-rose-700", text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", description: "Muldraugh Hideout", ram: "8 GB", port: "16261", activeText: "This is how you died." },
  { id: "ark", name: "ARK: Survival Evolved", icon: "🦖", color: "from-cyan-500 to-blue-700", text: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/30", description: "T-Rex Taming Base", ram: "12 GB", port: "7777", activeText: "Surviving on the ARK" }
];

export default function LandingPage() {
  const [activeGame, setActiveGame] = useState(GAMES_LIST[0]);
  const [vaultedGames, setVaultedGames] = useState(GAMES_LIST.slice(1));
  const [transitioning, setTransitioning] = useState(false);
  const [transitionStep, setTransitionStep] = useState(""); // "archiving" or "restoring"
  const [activeStatus, setActiveStatus] = useState("Online");

  const handleSwap = (selectedGameId: string) => {
    if (transitioning) return;
    setTransitioning(true);
    setTransitionStep("archiving");
    setActiveStatus("Vaulting...");

    // Find the chosen game
    const nextGame = GAMES_LIST.find(g => g.id === selectedGameId)!;

    // Step 1: Slide down active server into Vault
    setTimeout(() => {
      setTransitionStep("restoring");
      setActiveStatus("Restoring...");
      
      // Swap items in list
      setVaultedGames(prev => {
        const remaining = prev.filter(g => g.id !== selectedGameId);
        return [...remaining, activeGame];
      });
      setActiveGame(nextGame);

      // Step 2: Slide up next server into Active Slot
      setTimeout(() => {
        setTransitioning(false);
        setTransitionStep("");
        setActiveStatus("Online");
      }, 900);
    }, 900);
  };

  // Mock CPU / Memory fluctuation
  const [cpu, setCpu] = useState(14.5);
  const [ram, setRam] = useState(62.3);
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeStatus === "Online") {
        setCpu(parseFloat((8 + Math.random() * 12).toFixed(1)));
        setRam(parseFloat((55 + Math.random() * 15).toFixed(1)));
      } else {
        setCpu(0);
        setRam(0);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [activeStatus]);

  // FAQ accordion state
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="min-h-screen text-white flex flex-col">
      {/* Header / Navbar */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-borderDark px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 group">
            <img src={`${ASSET_PREFIX}/logo.png`} alt="RealmSwap" className="h-10 w-auto scale-[7] origin-left -translate-x-16 translate-y-2 pointer-events-none select-none" />
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-mutedText">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#demo" className="hover:text-white transition-colors">The Vault Demo</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-4">
            <a
              href={DOWNLOAD_URL}
              className="bg-accentPurple hover:bg-accentPurpleHover text-white px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 shadow-md shadow-accentPurple/20 border border-accentPurple/30"
            >
              Download
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto flex flex-col items-center text-center relative overflow-hidden">
        {/* Glow Spheres */}
        <div className="absolute top-20 left-1/4 w-96 h-96 bg-accentPurple/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute top-40 right-1/4 w-96 h-96 bg-accentBlue/10 rounded-full blur-[120px] pointer-events-none"></div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-400 mb-6 animate-float">
          <Sparkles className="w-3.5 h-3.5" />
          <span>100% Free • Local Hosting • Zero Cloud Fees</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight max-w-4xl leading-tight mb-6">
          Your Hardware. <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-accentPurple via-fuchsia-400 to-accentBlue text-glow-purple">
            Infinite Game Worlds.
          </span>
        </h1>

        <p className="text-mutedText text-lg sm:text-xl max-w-2xl mb-8 leading-relaxed">
          Ditch paying for multiple cloud servers your friends only play half the time. Host your own worlds locally on your PC, archive them to your hard drive when you switch games, and restore them instantly. Zero data loss, zero wasted cash.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center w-full max-w-md mb-4">
          <a
            href={DOWNLOAD_URL}
            className="w-full sm:w-auto bg-accentPurple hover:bg-accentPurpleHover text-white px-8 py-4 rounded-xl text-base font-bold transition-all duration-200 shadow-lg shadow-accentPurple/20 border border-accentPurple/40"
          >
            Download Free
          </a>
          <a
            href="#demo"
            className="w-full sm:w-auto bg-white/5 hover:bg-white/10 border border-white/10 text-white px-8 py-4 rounded-xl text-base font-bold transition-all duration-200 flex items-center justify-center gap-2"
          >
            <Zap className="w-5 h-5 text-yellow-400" />
            See How it Works
          </a>
        </div>
        <a
          href={RELEASES_URL}
          className="text-xs text-mutedText hover:text-white transition-colors mb-16"
        >
          All versions &amp; release notes
        </a>

        {/* Demo Interactive Widget */}
        <div id="demo" className="w-full max-w-4xl mx-auto mt-10">
          <div className="text-left mb-6 ml-4">
            <h3 className="font-extrabold text-xl tracking-wider uppercase text-slate-300">Your Local Machine</h3>
          </div>
          
          <div className="grid md:grid-cols-[1.5fr_1fr] gap-6">
            
            {/* Active Server Slot */}
            <div className="glass-panel p-6 rounded-2xl border border-accentPurple/30 shadow-[0_0_50px_-12px_rgba(167,139,250,0.15)] relative overflow-hidden flex flex-col min-h-[380px]">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-accentPurple to-accentBlue"></div>
              
              <div className="flex items-center justify-between mb-8">
                <span className="text-xs font-bold uppercase tracking-wider text-mutedText flex items-center gap-2">
                  <Terminal className="w-4 h-4" />
                  Active Execution Slot
                </span>
                <span className={`text-[10px] px-2 py-1 rounded font-mono font-bold uppercase tracking-widest ${
                  activeStatus === "Online" ? "bg-emerald-500/20 text-emerald-400 animate-pulse" : "bg-amber-500/20 text-amber-400"
                }`}>
                  {activeStatus}
                </span>
              </div>

              {/* Active Game Content */}
              <div className={`transition-all duration-500 ${transitioning && transitionStep === "archiving" ? "translate-y-10 opacity-0" : transitioning && transitionStep === "restoring" ? "translate-y-10 opacity-0" : "translate-y-0 opacity-100"} flex-1 flex flex-col justify-center`}>
                <div className="flex items-center gap-5 mb-6">
                  <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-3xl bg-gradient-to-br ${activeGame.color} shadow-lg`}>
                    {activeGame.icon}
                  </div>
                  <div>
                    <h2 className="text-2xl font-extrabold text-white">{activeGame.name}</h2>
                    <p className="text-sm text-mutedText">{activeGame.description}</p>
                  </div>
                </div>

                <div className="glass-panel rounded-xl border border-white/5 p-4 mb-6">
                  <p className="text-sm font-mono text-slate-300 italic">"{activeGame.activeText}"</p>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-auto border-t border-white/5 pt-6">
                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-mutedText">CPU Usage</span>
                      <span className="font-mono text-slate-200">{cpu}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-accentPurple rounded-full transition-all duration-1000" style={{ width: `${cpu * 2}%` }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-2">
                      <span className="text-mutedText">RAM Allocation</span>
                      <span className="font-mono text-slate-200">{ram}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-accentBlue rounded-full transition-all duration-1000" style={{ width: `${ram}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Overlay while archiving */}
              {transitioning && (
                <div className="absolute inset-0 bg-[#0a0c12]/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                  <RefreshCw className="w-8 h-8 text-accentPurple animate-spin mb-4" />
                  <p className="text-sm font-bold text-white tracking-widest uppercase">{activeStatus}</p>
                </div>
              )}
            </div>

            {/* The Vault List */}
            <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col">
              <div className="flex items-center gap-2 mb-6">
                <Archive className="w-5 h-5 text-mutedText" />
                <span className="text-sm font-bold uppercase tracking-wider text-slate-300">Local Hard Drive Vault</span>
              </div>

              <p className="text-xs text-mutedText mb-4">Click a game to instantly swap it into the active execution slot.</p>

              <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                {vaultedGames.map((game) => (
                  <button 
                    key={game.id}
                    onClick={() => handleSwap(game.id)}
                    disabled={transitioning}
                    className="w-full text-left p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/10 transition-all duration-200 flex items-center gap-4 group disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl bg-gradient-to-br ${game.color} shadow opacity-80 group-hover:opacity-100 transition-opacity`}>
                      {game.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-sm text-slate-200 truncate">{game.name}</h4>
                      <div className="flex items-center gap-2 text-[10px] text-mutedText">
                        <span className="flex items-center gap-1"><Database className="w-3 h-3" /> {game.ram}</span>
                        <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> Port {game.port}</span>
                      </div>
                    </div>
                    <RefreshCw className="w-4 h-4 text-slate-600 group-hover:text-accentPurple transition-colors" />
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Features Matrix */}
      <section id="features" className="py-20 px-6 max-w-7xl mx-auto border-t border-borderDark relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[500px] bg-accentPurple/5 rounded-full blur-[150px] pointer-events-none"></div>
        
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-5xl font-extrabold mb-4">
            Built for Gamers. Fully Local.
          </h2>
          <p className="text-mutedText max-w-2xl mx-auto">
            Take full advantage of the gaming PC you already own. RealmSwap handles the complicated networking, storage, and orchestration automatically.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: Cpu,
              title: "Harness Your Hardware",
              desc: "Don't rent a 2GB RAM cloud server when you have a 32GB beast at home. RealmSwap runs locally on your Windows PC utilizing your own CPU cores for zero lag."
            },
            {
              icon: Layers,
              title: "Instant Game Swapping",
              desc: "Archive your Minecraft world, deploy ARK, and play in under 60 seconds. Our automated systems pack, compress, and save states seamlessly to your hard drive."
            },
            {
              icon: HardDrive,
              title: "Local Hard Drive Vaults",
              desc: "We back up your world saves, player files, configurations, and mods directly to your disk. You retain 100% ownership of your files, accessible at any time."
            },
            {
              icon: Globe,
              title: "Auto UPnP Port Forwarding",
              desc: "Forget logging into your router. RealmSwap uses UPnP to automatically forward and map ports so your friends can connect immediately via your public IP."
            },
            {
              icon: ShieldCheck,
              title: "Crash Recovery",
              desc: "Background monitors watch your server processes. If a crash is detected, RealmSwap will automatically try to restart your server to keep your players online."
            },
            {
              icon: Users,
              title: "Collaborator Access",
              desc: "Invite your gaming group to the local dashboard. They can help install mods, restart servers, or read audit logs—all from an intuitive UI."
            }
          ].map((item, idx) => (
            <div key={idx} className="glass-panel p-8 rounded-2xl border border-white/5 hover:border-accentPurple/25 transition-all duration-300 group hover:box-glow-purple">
              <div className="w-12 h-12 rounded-xl bg-accentPurple/10 border border-accentPurple/20 flex items-center justify-center mb-6 group-hover:bg-accentPurple/20 transition-all duration-300">
                <item.icon className="w-6 h-6 text-accentPurple" />
              </div>
              <h3 className="font-bold text-xl mb-3 group-hover:text-accentPurple transition-colors">{item.title}</h3>
              <p className="text-mutedText text-sm leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 px-6 max-w-4xl mx-auto border-t border-borderDark">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-extrabold">Frequently Asked Questions</h2>
        </div>

        <div className="space-y-4">
          {[
            {
              q: "Is it really 100% free?",
              a: "Yes! RealmSwap is a local application that runs on your own hardware. Because we do not provide cloud servers or off-site data storage, there are absolutely zero subscription fees."
            },
            {
              q: "How does the Game History Vault actually work?",
              a: "When you archive a server, we run a command to shut down the server process, trigger a full world save, tar-compress your server folder (including world blocks, inventory, configuration files, and installed mods), and store it on your PC's hard drive. When you restore, we pull that archive back out and boot it up. All your progress is exactly where you left it."
            },
            {
              q: "Do I need to know how to port forward?",
              a: "No! RealmSwap has a built-in UPnP networking layer. When you start a game, it automatically talks to your home router to securely open the necessary ports, and closes them when you shut the server down."
            },
            {
              q: "Do my friends need to install RealmSwap?",
              a: "No, only the person hosting the server needs to run RealmSwap. Your friends will connect via the game's built-in multiplayer menu using your public IP address, exactly like a normal dedicated server."
            },
            {
              q: "Can I use RealmSwap while playing the game on the same PC?",
              a: "Yes! Modern gaming PCs have more than enough RAM and CPU cores to host a dedicated server for a small group of friends while simultaneously running the game client."
            }
          ].map((item, index) => (
            <div 
              key={index} 
              className="glass-panel rounded-xl border border-white/5 overflow-hidden transition-all duration-300"
            >
              <button 
                onClick={() => toggleFaq(index)}
                className="w-full px-6 py-5 text-left font-bold flex items-center justify-between hover:text-accentPurple transition-colors"
              >
                <span>{item.q}</span>
                <ChevronDown className={`w-5 h-5 text-mutedText transition-transform duration-300 ${openFaq === index ? "rotate-180 text-accentPurple" : ""}`} />
              </button>
              <div 
                className={`px-6 overflow-hidden transition-all duration-300 ease-in-out ${
                  openFaq === index ? "max-h-[300px] pb-5 opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                <p className="text-mutedText text-sm leading-relaxed">{item.a}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 max-w-5xl mx-auto mb-20 text-center relative overflow-hidden rounded-3xl bg-gradient-to-br from-accentPurple/20 via-slate-900 to-accentBlue/20 border border-accentPurple/30">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-accentPurple/10 rounded-full blur-[100px] pointer-events-none"></div>
        
        <h2 className="text-3xl sm:text-5xl font-extrabold mb-4">
          Take Back Your Game Servers.
        </h2>
        <p className="text-mutedText max-w-2xl mx-auto mb-8">
          Join thousands of gamer friend groups hosting smarter. Install RealmSwap on your PC today and run your own local game network for free.
        </p>
        <a
          href={DOWNLOAD_URL}
          className="inline-block bg-accentPurple hover:bg-accentPurpleHover text-white px-8 py-4 rounded-xl text-base font-bold transition-all duration-200 shadow-lg shadow-accentPurple/20 border border-accentPurple/40"
        >
          Download Free Now
        </a>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-borderDark bg-[#08090c] py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <img src={`${ASSET_PREFIX}/logo.png`} alt="RealmSwap" className="h-8 w-auto scale-[7] origin-left -translate-x-16 translate-y-2 pointer-events-none select-none" />
          </div>

          <p className="text-xs text-mutedText">
            © 2026 RealmSwap. All rights reserved. Developed for gamers, by gamers.
          </p>

          <div className="flex items-center gap-6 text-sm text-mutedText">
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Discord Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
