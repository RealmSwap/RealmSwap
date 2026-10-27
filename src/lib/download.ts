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
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        emit(true);
        resolve();
      });
    }).on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}
