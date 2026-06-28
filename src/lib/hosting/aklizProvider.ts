import { HostCredentials, HostingProvider, SftpClient } from "./types";
import { makeSftpClient } from "./sftpClient";

export const aklizProvider: HostingProvider = {
  id: "AKLIZ",
  displayName: "Akliz",
  validateCredentials(c: HostCredentials): string | null {
    if (!c.host || !c.host.trim()) return "SFTP host is required";
    if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535) return "Port must be between 1 and 65535";
    if (!c.username || !c.username.trim()) return "Username is required";
    if (!c.password || !c.password.trim()) return "Password is required";
    if (!c.remoteBasePath || !c.remoteBasePath.trim()) return "Remote base path is required";
    return null;
  },
  createClient(c: HostCredentials): SftpClient {
    return makeSftpClient(c);
  },
};
