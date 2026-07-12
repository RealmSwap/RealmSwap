import SftpClientLib from "ssh2-sftp-client";
import type sftp from "ssh2-sftp-client";
import path from "path";
import { FileEntry, HostCredentials, SftpClient } from "./types";

// Thin adapter from ssh2-sftp-client to our injectable SftpClient interface.
// Left to manual verification against a live Akliz instance.
export function makeSftpClient(creds: HostCredentials): SftpClient {
  const sftp = new SftpClientLib();
  return {
    async connect() {
      // readyTimeout bounds the SSH handshake, but a silently-dropped TCP
      // connect can still leave the socket pending far longer, which surfaces
      // in the UI as a "Connecting..." spinner that never resolves. Race the
      // connect against an explicit deadline so a bad host/port/credential
      // always fails fast with an actionable message.
      const TIMEOUT_MS = 20000;
      let timer: NodeJS.Timeout | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out connecting to ${creds.host}:${creds.port}. Verify the SFTP host, port, username, and password.`)),
          TIMEOUT_MS,
        );
      });
      try {
        await Promise.race([
          sftp.connect({
            host: creds.host,
            port: creds.port,
            username: creds.username,
            password: creds.password,
            readyTimeout: TIMEOUT_MS,
          }),
          deadline,
        ]);
      } catch (err) {
        // Ensure the underlying socket is torn down on either failure path so a
        // timed-out connect doesn't leak a dangling connection.
        try { await sftp.end(); } catch { /* ignore */ }
        throw err;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    async list(remoteDir: string): Promise<FileEntry[]> {
      const items = await sftp.list(remoteDir);
      return items.map((it: sftp.FileInfo) => ({
        relPath: it.name, // basename; walkRemote composes full relPaths
        size: it.size,
        mtimeMs: it.modifyTime,
        isDir: it.type === "d",
      }));
    },
    async mkdir(remoteDir: string) {
      await sftp.mkdir(remoteDir, true);
    },
    async put(localPath: string, remotePath: string) {
      await sftp.mkdir(path.posix.dirname(remotePath), true).catch(() => {});
      await sftp.put(localPath, remotePath);
    },
    async get(remotePath: string, localPath: string) {
      await sftp.get(remotePath, localPath);
    },
    async end() {
      await sftp.end();
    },
  };
}
