const fs = require('fs');
const file = 'src/components/DashboardView.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add imports
const imports = `import { SidebarNavigation } from "./dashboard/SidebarNavigation";
import { GlobalHeader } from "./dashboard/GlobalHeader";
import { ServerHeroCard } from "./dashboard/ServerHeroCard";
import { HealthSidebar } from "./dashboard/HealthSidebar";
import { ActivityFeed } from "./dashboard/ActivityFeed";
import { VaultSection } from "./dashboard/VaultSection";
`;

content = content.replace('import React,', imports + '\nimport React,');

const renderMatch = content.match(/  return \(\r?\n\s+<div className="min-h-screen/);
if (!renderMatch) {
  throw new Error("Could not find exact render block start target");
}

const renderStart = renderMatch.index;

const newRender = `  return (
    <div className="min-h-screen flex bg-[#030712] text-slate-100 font-sans selection:bg-accentPurple/30">
      
      {/* Sidebar Navigation */}
      <SidebarNavigation user={data.user} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Global Search Header */}
        <GlobalHeader />

        {/* Dashboard Content */}
        <main className="flex-1 overflow-y-auto p-8 flex gap-8">
          
          {/* Center Column: KPI, Servers, Vault, Logs */}
          <div className="flex-1 max-w-5xl space-y-8 min-w-0">
            
            {/* KPI Cards */}
            <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[18px] p-5 shadow-xl hover:-translate-y-1 transition-transform group">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-extrabold tracking-widest text-slate-500 mb-1">Local Servers</div>
                    <div className="text-2xl font-black text-white">{data.servers.filter((s:any) => s.runnerType === "LOCAL").length}</div>
                    <div className="text-xs text-emerald-400 font-bold mt-2 flex items-center gap-1"><Check className="w-3 h-3"/> Running Smooth</div>
                  </div>
                  <div className="p-2 bg-accentPurple/10 text-accentPurple rounded-xl group-hover:scale-110 transition-transform">
                    <ServerIcon className="w-5 h-5" />
                  </div>
                </div>
              </div>
              <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[18px] p-5 shadow-xl hover:-translate-y-1 transition-transform group">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-extrabold tracking-widest text-slate-500 mb-1">Vaulted Worlds</div>
                    <div className="text-2xl font-black text-white">{data.archives.length}</div>
                    <div className="text-xs text-blue-400 font-bold mt-2 flex items-center gap-1"><Archive className="w-3 h-3"/> Safely Archived</div>
                  </div>
                  <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl group-hover:scale-110 transition-transform">
                    <Layers className="w-5 h-5" />
                  </div>
                </div>
              </div>
              <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[18px] p-5 shadow-xl hover:-translate-y-1 transition-transform group">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-extrabold tracking-widest text-slate-500 mb-1">Vault Size</div>
                    <div className="text-2xl font-black text-white">{totalVaultSize} GB</div>
                    <div className="text-xs text-slate-400 font-bold mt-2 flex items-center gap-1"><Database className="w-3 h-3"/> Local Storage</div>
                  </div>
                  <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl group-hover:scale-110 transition-transform">
                    <Database className="w-5 h-5" />
                  </div>
                </div>
              </div>
              <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[18px] p-5 shadow-xl hover:-translate-y-1 transition-transform group">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-extrabold tracking-widest text-slate-500 mb-1">Global Ping</div>
                    <div className="text-2xl font-black text-white">12ms</div>
                    <div className="text-xs text-emerald-400 font-bold mt-2 flex items-center gap-1"><Activity className="w-3 h-3"/> Excellent</div>
                  </div>
                  <div className="p-2 bg-orange-500/10 text-orange-400 rounded-xl group-hover:scale-110 transition-transform">
                    <Activity className="w-5 h-5" />
                  </div>
                </div>
              </div>
            </section>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl font-medium text-sm flex justify-between items-center shadow-lg shadow-red-500/5">
                <span>{errorMessage}</span>
                <button onClick={() => setErrorMessage(null)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Active Servers Hero Grid */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-extrabold text-white uppercase tracking-wider flex items-center gap-2">
                  <ServerIcon className="w-5 h-5 text-accentPurple" />
                  <span>Active Servers</span>
                </h2>
                <Link
                  href="/dashboard/servers/new"
                  className="px-4 py-2 rounded-xl bg-accentPurple hover:bg-accentPurple/90 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-accentPurple/25 hover:-translate-y-0.5"
                >
                  <Plus className="w-4 h-4" />
                  Deploy New Server
                </Link>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {data.servers.map((server: any) => (
                  <ServerHeroCard
                    key={server.id}
                    server={server}
                    serverStats={serverStats[server.id]}
                    progressMap={progressMap}
                    isServerLoading={actionLoading?.split("-")[0] === server.id}
                    copiedIp={copiedIp}
                    actions={{
                      handlePowerAction,
                      handleArchiveServer,
                      handleOpenServerFolder,
                      setHostModalServer,
                      setImportMapServer,
                      setImportWorldPath,
                      setImportError,
                      setImportSuccess,
                      setCopiedIp
                    }}
                  />
                ))}
                {data.servers.length === 0 && (
                  <div className="col-span-full py-16 flex flex-col items-center justify-center border border-white/5 border-dashed rounded-[18px] bg-slate-900/20">
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4">
                      <ServerIcon className="w-8 h-8 text-slate-500" />
                    </div>
                    <h3 className="font-extrabold text-lg text-white mb-2">No Active Servers</h3>
                    <p className="text-slate-400 text-sm mb-6 max-w-sm text-center">Deploy a new dedicated server to get started. RealmSwap handles the installation and port forwarding automatically.</p>
                    <Link
                      href="/dashboard/servers/new"
                      className="px-6 py-2.5 rounded-xl bg-accentPurple hover:bg-accentPurple/90 text-white font-bold text-sm transition-all shadow-lg shadow-accentPurple/25"
                    >
                      Deploy First Server
                    </Link>
                  </div>
                )}
              </div>
            </section>

            <VaultSection archives={data.archives} actions={{ handleRestoreArchive, handleDeleteArchive }} actionLoading={actionLoading} />
            
            <ActivityFeed activityLogs={data.activityLogs} />

          </div>

          {/* Right Column: Server Health */}
          <HealthSidebar 
            servers={data.servers} 
            actions={{ handleGenerateInvite }} 
          />
          
        </main>
      </div>

      {/* Host Transfer Modal */}
      {hostModalServer && (
        <HostTransferModal
          isOpen={!!hostModalServer}
          onClose={() => setHostModalServer(null)}
          serverId={hostModalServer.id}
          serverName={hostModalServer.name}
        />
      )}

      {/* Import Map Dialog Overlay */}
      {importMapServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-emerald-500/30 rounded-2xl p-6 shadow-2xl flex flex-col shadow-[0_0_40px_rgba(16,185,129,0.15)]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
              <div>
                <h3 className="font-extrabold text-white text-base">Import Existing Map</h3>
                <p className="text-xs text-slate-400">
                  Copy world save data into {importMapServer.name} ({importMapServer.game})
                </p>
              </div>
              <button 
                onClick={() => setImportMapServer(null)}
                className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Help guidelines */}
            <div className="p-3.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-xs text-slate-300 leading-normal space-y-2 mb-4">
              <span className="font-bold text-white block">Instructions:</span>
              <p>Enter the absolute path to your existing world save folder or file.</p>
            </div>

            <form onSubmit={handleImportWorld} className="flex flex-col gap-4">
              {importError && (
                <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold">
                  {importError}
                </div>
              )}
              {importSuccess && (
                <div className="p-3 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                  {importSuccess}
                </div>
              )}
              
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                  Source Path on Host PC
                </label>
                <input
                  type="text"
                  required
                  placeholder="C:\\Users\\Name\\AppData\\..."
                  value={importWorldPath}
                  onChange={(e) => setImportWorldPath(e.target.value)}
                  className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                />
              </div>

              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setImportMapServer(null)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 font-bold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importLoading || !importWorldPath}
                  className="px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm flex items-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40"
                >
                  {importLoading ? "Importing..." : "Start Import"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}`;

content = content.substring(0, renderStart) + newRender;

fs.writeFileSync(file, content);
