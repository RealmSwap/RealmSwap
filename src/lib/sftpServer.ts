import { Server as SSH2Server, utils } from "ssh2";
const { STATUS_CODE } = utils.sftp;
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { prisma } from "./db";
import { safeJoin } from "./safePath";
import { dataRoot } from "./appPaths";

const SSH_PORT = 2022;
const KEYS_DIR = path.join(dataRoot(), "keys");
const HOST_KEY_PATH = path.join(KEYS_DIR, "host.rsa");

function ensureHostKey() {
  if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });
  if (!fs.existsSync(HOST_KEY_PATH)) {
    const { privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    fs.writeFileSync(HOST_KEY_PATH, privateKey);
  }
  return fs.readFileSync(HOST_KEY_PATH);
}

// Global SFTP Server instance
let sftpServer: SSH2Server | null = null;

export function startSFTPServer() {
  if (sftpServer) return;

  const hostKey = ensureHostKey();

  sftpServer = new SSH2Server({ hostKeys: [hostKey] }, (client) => {
    console.log("[SFTP] Client connected");

    let authenticatedServerId: string | null = null;
    let chroot: string | null = null;

    client.on("authentication", async (ctx) => {
      if (ctx.method !== "password") return ctx.reject();

      // Username is expected to be the serverId
      const serverId = ctx.username;
      const password = ctx.password;

      try {
        const server = await prisma.server.findUnique({ where: { id: serverId } });
        if (!server || !server.sftpPassword || server.sftpPassword !== password) {
          return ctx.reject();
        }

        authenticatedServerId = server.id;
        // The root folder they are allowed to access
        chroot = safeJoin(dataRoot(), "local-servers", server.id);
        
        if (!fs.existsSync(chroot)) {
          fs.mkdirSync(chroot, { recursive: true });
        }

        ctx.accept();
      } catch (err) {
        ctx.reject();
      }
    });

    client.on("ready", () => {
      client.on("session", (accept, reject) => {
        const session = accept();
        session.on("sftp", (acceptSftp, rejectSftp) => {
          const sftpStream = acceptSftp();
          console.log(`[SFTP] Session opened for server ${authenticatedServerId}`);

          const resolvePath = (reqPath: string) => {
             // If reqPath is absolute (e.g. /), strip the leading slash so safeJoin treats it relative to chroot
             let relativePath = reqPath.startsWith('/') ? reqPath.slice(1) : reqPath;
             return safeJoin(chroot!, relativePath);
          };

          // --- Implement core SFTP commands mapped to fs ---
          
          sftpStream.on("OPENDIR", (reqid, reqpath) => {
            try {
              const fullPath = resolvePath(reqpath);
              const handle = Buffer.from(fullPath);
              const stats = fs.statSync(fullPath);
              if (!stats.isDirectory()) return sftpStream.status(reqid, STATUS_CODE.FAILURE);
              sftpStream.handle(reqid, handle);
            } catch (err) {
              sftpStream.status(reqid, STATUS_CODE.NO_SUCH_FILE);
            }
          });

          sftpStream.on("READDIR", (reqid, handle) => {
            try {
              const fullPath = handle.toString();
              const files = fs.readdirSync(fullPath);
              
              // To prevent endless READDIR requests, we must handle EOF. 
              // For simplicity, we send all files at once and then an EOF on the next call.
              // We'll mutate the handle to mark it as read.
              if ((handle as any).read) {
                 sftpStream.status(reqid, STATUS_CODE.EOF);
                 return;
              }
              
              const attrs = files.map(f => {
                const p = path.join(fullPath, f);
                const s = fs.statSync(p);
                return {
                  filename: f,
                  longname: f, // ssh2 doesn't strictly need a `ls -l` formatted longname
                  attrs: {
                    mode: s.mode,
                    uid: s.uid,
                    gid: s.gid,
                    size: s.size,
                    atime: Math.floor(s.atimeMs / 1000),
                    mtime: Math.floor(s.mtimeMs / 1000)
                  }
                };
              });

              (handle as any).read = true;
              sftpStream.name(reqid, attrs);
            } catch (err) {
              sftpStream.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          sftpStream.on("REALPATH", (reqid, reqpath) => {
            // Virtualize the path back to the user
            sftpStream.name(reqid, [{ filename: reqpath || "/", longname: reqpath || "/", attrs: {} as any }]);
          });

          sftpStream.on("STAT", (reqid, reqpath) => {
             try {
                const stats = fs.statSync(resolvePath(reqpath));
                sftpStream.attrs(reqid, {
                    mode: stats.mode, uid: stats.uid, gid: stats.gid, size: stats.size,
                    atime: Math.floor(stats.atimeMs / 1000), mtime: Math.floor(stats.mtimeMs / 1000)
                });
             } catch(e) {
                sftpStream.status(reqid, STATUS_CODE.NO_SUCH_FILE);
             }
          });

          sftpStream.on("LSTAT", (reqid, reqpath) => {
             try {
                const stats = fs.lstatSync(resolvePath(reqpath));
                sftpStream.attrs(reqid, {
                    mode: stats.mode, uid: stats.uid, gid: stats.gid, size: stats.size,
                    atime: Math.floor(stats.atimeMs / 1000), mtime: Math.floor(stats.mtimeMs / 1000)
                });
             } catch(e) {
                sftpStream.status(reqid, STATUS_CODE.NO_SUCH_FILE);
             }
          });

          const openFiles = new Map<string, number>();

          sftpStream.on("OPEN", (reqid, filename, flags, attrs) => {
             try {
                // SFTP flag mapping to FS flags is complex. For simplicity:
                const stringFlags = flags === 1 ? 'r' : (flags === 26 ? 'w' : (flags === 10 ? 'a' : 'r+'));
                const fd = fs.openSync(resolvePath(filename), stringFlags);
                const handle = Buffer.alloc(4);
                handle.writeUInt32BE(fd, 0);
                openFiles.set(handle.toString('hex'), fd);
                sftpStream.handle(reqid, handle);
             } catch(e) {
                sftpStream.status(reqid, STATUS_CODE.FAILURE);
             }
          });

          sftpStream.on("READ", (reqid, handle, offset, length) => {
             try {
                const fd = openFiles.get(handle.toString('hex'));
                if (fd === undefined) throw new Error();
                const buffer = Buffer.alloc(length);
                const bytesRead = fs.readSync(fd, buffer, 0, length, offset);
                if (bytesRead === 0) sftpStream.status(reqid, STATUS_CODE.EOF);
                else sftpStream.data(reqid, buffer.slice(0, bytesRead));
             } catch(e) {
                sftpStream.status(reqid, STATUS_CODE.FAILURE);
             }
          });

          sftpStream.on("WRITE", (reqid, handle, offset, data) => {
             try {
                const fd = openFiles.get(handle.toString('hex'));
                if (fd === undefined) throw new Error();
                fs.writeSync(fd, data, 0, data.length, offset);
                sftpStream.status(reqid, STATUS_CODE.OK);
             } catch(e) {
                sftpStream.status(reqid, STATUS_CODE.FAILURE);
             }
          });

          sftpStream.on("CLOSE", (reqid, handle) => {
             try {
                const hex = handle.toString('hex');
                if (openFiles.has(hex)) {
                    fs.closeSync(openFiles.get(hex)!);
                    openFiles.delete(hex);
                }
                sftpStream.status(reqid, STATUS_CODE.OK);
             } catch(e) {
                sftpStream.status(reqid, STATUS_CODE.FAILURE);
             }
          });
          
          sftpStream.on("MKDIR", (reqid, reqpath, attrs) => {
            try {
               fs.mkdirSync(resolvePath(reqpath));
               sftpStream.status(reqid, STATUS_CODE.OK);
            } catch(e) { sftpStream.status(reqid, STATUS_CODE.FAILURE); }
          });
          
          sftpStream.on("RMDIR", (reqid, reqpath) => {
            try {
               fs.rmdirSync(resolvePath(reqpath));
               sftpStream.status(reqid, STATUS_CODE.OK);
            } catch(e) { sftpStream.status(reqid, STATUS_CODE.FAILURE); }
          });
          
          sftpStream.on("REMOVE", (reqid, reqpath) => {
            try {
               fs.unlinkSync(resolvePath(reqpath));
               sftpStream.status(reqid, STATUS_CODE.OK);
            } catch(e) { sftpStream.status(reqid, STATUS_CODE.FAILURE); }
          });
          
          sftpStream.on("RENAME", (reqid, oldPath, newPath) => {
             try {
                fs.renameSync(resolvePath(oldPath), resolvePath(newPath));
                sftpStream.status(reqid, STATUS_CODE.OK);
             } catch(e) { sftpStream.status(reqid, STATUS_CODE.FAILURE); }
          });

          sftpStream.on("SETSTAT", (reqid, reqpath, attrs) => {
             // Accept silently to prevent clients from failing when trying to set mtime
             sftpStream.status(reqid, STATUS_CODE.OK);
          });
        });
      });
    });

    client.on("error", (err) => {
      console.log(`[SFTP] Client error: ${err.message}`);
    });
  });

  sftpServer.listen(SSH_PORT, "0.0.0.0", () => {
    console.log(`[SFTP] Server securely listening on port ${SSH_PORT}`);
  });
}
