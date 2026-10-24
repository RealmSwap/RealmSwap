/**
 * Status-share link helpers — pure and client-safe so the modal, the
 * celebration, and tests agree on what a share URL looks like and when it
 * can't leave the machine.
 */

export function statusPageUrl(code: string, origin: string): string {
  return `${origin.replace(/\/+$/, "")}/s/${code}`;
}

/**
 * The dashboard app runs on the host's machine (localhost in dev,
 * 127.0.0.1:<port> packaged), and that port is never exposed to the
 * internet — it's the authenticated control plane. A status link copied
 * from a loopback origin therefore only resolves on this machine, and the
 * UI must say so instead of presenting it as a public URL.
 */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}
