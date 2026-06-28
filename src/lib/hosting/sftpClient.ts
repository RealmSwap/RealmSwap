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
      await sftp.connect({
        host: creds.host,
        port: creds.port,
        username: creds.username,
        password: creds.password,
        readyTimeout: 20000,
      });
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
