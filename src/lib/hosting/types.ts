export type TransferDirection = "PUSH" | "PULL";

export interface FileEntry {
  relPath: string; // POSIX, relative to the tree root
  size: number;
  mtimeMs: number;
  isDir: boolean;
}

export interface TransferOp {
  type: "mkdir" | "copy";
  relPath: string;
}

export interface TransferPlan {
  ops: TransferOp[];
}

export interface TransferSummary {
  filesTransferred: number;
  bytesTransferred: number;
  failures: { relPath: string; error: string }[];
}

export interface SftpClient {
  connect(): Promise<void>;
  list(remoteDir: string): Promise<FileEntry[]>;
  mkdir(remoteDir: string): Promise<void>;
  put(localPath: string, remotePath: string): Promise<void>;
  get(remotePath: string, localPath: string): Promise<void>;
  end(): Promise<void>;
}

export interface HostCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  remoteBasePath: string;
}

export interface Transferer {
  mkdir(relPath: string): Promise<void>;
  copy(relPath: string): Promise<void>;
}

export interface HostingProvider {
  id: string;
  displayName: string;
  validateCredentials(c: HostCredentials): string | null;
  createClient(c: HostCredentials): SftpClient;
}

export const DEFAULT_IGNORE: string[] = [
  "logs/",
  "crash-reports/",
  "cache/",
  "**/session.lock",
  "realm.json",
  ".secret.key",
];
