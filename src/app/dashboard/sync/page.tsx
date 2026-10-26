import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import SyncClientView from "@/components/SyncClientView";
import { parseInviteLink, isLegacyInviteLink, fetchVerifiedManifest } from "@/lib/realmsync";

export const dynamic = "force-dynamic";

function InvalidLinkScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-slate-100 px-4">
      <div className="glass-panel-purple p-8 rounded-2xl max-w-md text-center">
        <h1 className="text-xl font-bold text-red-400 mb-2">{title}</h1>
        <p className="text-sm text-slate-400 mb-6">{message}</p>
        <a href="/dashboard" className="px-4 py-2 bg-accentPurple text-white rounded-lg font-bold">Return to Dashboard</a>
      </div>
    </div>
  );
}

export default async function SyncPage(props: { searchParams: Promise<{ link?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  const link = searchParams.link;
  if (!link || !link.startsWith("realmsync://")) {
    return (
      <InvalidLinkScreen
        title="Invalid Invite Link"
        message="The invite link provided is invalid or missing."
      />
    );
  }

  // Parse realmsync://1.2.3.4:3000/<codeId><secret>
  const parsed = parseInviteLink(link);

  if (!parsed) {
    if (isLegacyInviteLink(link)) {
      return (
        <InvalidLinkScreen
          title="Invite Link Needs Refreshing"
          message="This invite link was created by an older version of RealmSwap. Ask the host to regenerate the invite and send the new link."
        />
      );
    }
    return (
      <InvalidLinkScreen
        title="Malformed Invite Link"
        message="The invite link format is incorrect. Ensure it includes the host and code."
      />
    );
  }

  // Fetch the manifest from the host with the HMAC proof and verify the
  // response signature before trusting anything it says.
  let manifest = null;
  let errorMsg = null;
  try {
    manifest = await fetchVerifiedManifest(parsed.host, parsed.codeId, parsed.secret);
  } catch (err: any) {
    errorMsg = err.message || "Failed to reach the host server. They may be offline.";
  }

  return (
    <SyncClientView
      link={link}
      host={parsed.host}
      codeId={parsed.codeId}
      secret={parsed.secret}
      manifest={manifest}
      error={errorMsg}
    />
  );
}
