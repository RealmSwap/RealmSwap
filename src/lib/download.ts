import fs from "fs";
import https from "https";

export interface DownloadOpts {
  maxRedirects?: number;
  /** Byte-level progress; `total` is null when the server sends no length. */
  onProgress?: (received: number, total: number | null) => void;
}

/** Download a file over HTTPS following redirects. Shared by runners, mods, and loaders. */
export function downloadFile(url: string, dest: string, opts: DownloadOpts = {}): Promise<void> {
  const maxRedirects = opts.maxRedirects ?? 5;
  return new Promise((resolve, reject) => {
    if (maxRedirects < 0) return reject(new Error("Too many redirects"));
    const file = fs.createWriteStream(dest);
    // A write-stream failure (Windows AV scanners transiently hold freshly
    // created files: EPERM/EBUSY — seen live on modpack installs) must
    // reject the promise, not crash the process on an unhandled 'error'.
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      fs.unlink(dest, () => {});
      reject(err);
    };
    file.on("error", fail);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        file.close();
        fs.unlink(dest, () => {});
        if (redirectUrl) {
          downloadFile(redirectUrl, dest, { ...opts, maxRedirects: maxRedirects - 1 }).then(resolve).catch(reject);
          return;
        }
        reject(new Error(`Redirect without location from ${url}`));
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        reject(new Error(`Failed to download ${url}: status ${response.statusCode}`));
        return;
      }
      // Progress is emitted at most every 100ms — download data events can
      // arrive thousands of times a second on fast pipes.
      const totalHeader = response.headers["content-length"];
      const total = totalHeader ? Number(totalHeader) : null;
      let received = 0;
      let lastEmit = 0;
      const emit = (force = false) => {
        if (!opts.onProgress) return;
        const now = Date.now();
        if (force || now - lastEmit >= 100) {
          lastEmit = now;
          opts.onProgress(received, total);
        }
      };
      response.on("data", (chunk: Buffer) => {
        received += chunk.length;
        emit();
      });
      response.on("error", fail);
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        emit(true);
      });
      file.on("close", () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
    }).on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

/**
 * downloadFile with retries for Windows file-lock errors. Antivirus scanners
 * routinely take EPERM/EBUSY handles on freshly-downloaded jars — a plain
 * downloadFile call fails mid-pack-install (dozens of jars in a row). The
 * schedule spreads ~14s across 6 attempts; only lock errors retry — missing
 * files, redirects, and HTTP failures fail immediately.
 */
export async function downloadFileWithRetry(
  url: string,
  dest: string,
  opts: DownloadOpts = {},
  delaysMs: number[] = [500, 1000, 2000, 3000, 4000, 4000],
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await downloadFile(url, dest, opts);
      return;
    } catch (err: any) {
      const lock = err?.code === "EPERM" || err?.code === "EBUSY" || err?.code === "EACCES";
      if (!lock || attempt >= delaysMs.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
    }
  }
}
