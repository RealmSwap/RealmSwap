import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import SyncClientView from "@/components/SyncClientView";

export const dynamic = "force-dynamic";

export default async function SyncPage({ searchParams }: { searchParams: { link?: string } }) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  const link = searchParams.link;
  if (!link || !link.startsWith("realmsync://")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-slate-100 px-4">
        <div className="glass-panel-purple p-8 rounded-2xl max-w-md text-center">
          <h1 className="text-xl font-bold text-red-400 mb-2">Invalid Invite Link</h1>
          <p className="text-sm text-slate-400 mb-6">The invite link provided is invalid or missing.</p>
          <a href="/dashboard" className="px-4 py-2 bg-accentPurple text-white rounded-lg font-bold">Return to Dashboard</a>
        </div>
      </div>
    );
  }

  // Parse realmsync://1.2.3.4:3000/CODE
  const urlPart = link.replace("realmsync://", "");
  const [host, inviteCode] = urlPart.split("/");

  if (!host || !inviteCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-slate-100 px-4">
        <div className="glass-panel-purple p-8 rounded-2xl max-w-md text-center">
          <h1 className="text-xl font-bold text-red-400 mb-2">Malformed Invite Link</h1>
          <p className="text-sm text-slate-400 mb-6">The invite link format is incorrect. Ensure it includes the host and code.</p>
          <a href="/dashboard" className="px-4 py-2 bg-accentPurple text-white rounded-lg font-bold">Return to Dashboard</a>
        </div>
      </div>
    );
  }

  // Fetch manifest from host
  let manifest = null;
  let errorMsg = null;
  try {
    const res = await fetch(`http://${host}/api/sync/${inviteCode}/manifest`, {
      // 10 second timeout
      signal: AbortSignal.timeout(10000)
    });
    
    if (!res.ok) {
      errorMsg = await res.text();
    } else {
      manifest = await res.json();
    }
  } catch (err: any) {
    errorMsg = err.message || "Failed to reach the host server. They may be offline.";
  }

  return (
    <SyncClientView 
      link={link}
      host={host} 
      inviteCode={inviteCode} 
      manifest={manifest} 
      error={errorMsg} 
    />
  );
}
