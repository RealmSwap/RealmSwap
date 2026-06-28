import fs from "fs";
import path from "path";
import { FileEntry, SftpClient } from "./types";

// Recursively list a local tree as POSIX relPaths relative to `root`.
export async function walkLocal(root: string): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  if (!fs.existsSync(root)) return out;

  const walk = (absDir: string, relDir: string) => {
    for (const name of fs.readdirSync(absDir)) {
      const abs = path.join(absDir, name);
      const rel = relDir ? `${relDir}/${name}` : name; // POSIX separator on purpose — do NOT use path.join (would emit Windows backslashes)
      const st = fs.statSync(abs);
      if (st.isDirectory()) {
        out.push({ relPath: rel, size: 0, mtimeMs: st.mtimeMs, isDir: true });
        walk(abs, rel);
      } else {
        out.push({ relPath: rel, size: st.size, mtimeMs: st.mtimeMs, isDir: false });
      }
    }
  };
  walk(root, "");
  return out;
}

// Recursively list a remote tree under `base` as POSIX relPaths.
// `client.list` returns shallow entries whose `relPath` is the basename.
export async function walkRemote(client: SftpClient, base: string): Promise<FileEntry[]> {
  const out: FileEntry[] = [];

  const walk = async (remoteDir: string, relDir: string) => {
    const items = await client.list(remoteDir);
    for (const it of items) {
      const name = it.relPath;
      if (name === "." || name === "..") continue;
      const rel = relDir ? `${relDir}/${name}` : name; // POSIX separator on purpose — do NOT use path.join (would emit Windows backslashes)
      if (it.isDir) {
        out.push({ relPath: rel, size: 0, mtimeMs: it.mtimeMs, isDir: true });
        await walk(`${remoteDir}/${name}`, rel);
      } else {
        out.push({ relPath: rel, size: it.size, mtimeMs: it.mtimeMs, isDir: false });
      }
    }
  };
  await walk(base, "");
  return out;
}
