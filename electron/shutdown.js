"use strict";
// Calls the in-app shutdown endpoint so running game servers are stopped
// before the app exits (Windows does not auto-kill child processes).
async function stopAllServers(port, token) {
  try {
    await fetch(`http://127.0.0.1:${port}/api/system/shutdown`, {
      method: "POST",
      headers: { "x-internal-token": token },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    // best-effort; proceed with quit regardless
  }
}
module.exports = { stopAllServers };
