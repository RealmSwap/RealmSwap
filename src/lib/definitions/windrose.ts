// Windrose generates its real configuration — including a server-generated invite code —
// at R5/ServerDescription.json on first launch, wrapping the settings in a
// "ServerDescription_Persistent" object. Players join via the game client
// (Play -> Connect to Server) using this invite code, not a direct IP. We read it after
// launch and surface it as the server's connect info.
//
// The file may not exist yet (server still starting) or be caught mid-write, so callers
// poll and this parser returns null for anything it can't read a code from.
export function parseWindroseInviteCode(fileContent: string): string | null {
  try {
    const data = JSON.parse(fileContent) as {
      ServerDescription_Persistent?: { InviteCode?: unknown };
    };
    const code = data?.ServerDescription_Persistent?.InviteCode;
    return typeof code === "string" && code.length > 0 ? code : null;
  } catch {
    return null;
  }
}
