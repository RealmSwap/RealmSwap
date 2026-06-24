// Creates build/template.db: schema applied, no rows. Shipped in the installer
// and copied to userData on first launch.
"use strict";
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const out = path.join(__dirname, "..", "build", "template.db");
fs.mkdirSync(path.dirname(out), { recursive: true });
if (fs.existsSync(out)) fs.unlinkSync(out);

execSync("npx prisma db push --skip-generate", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: "file:" + out.replace(/\\/g, "/") },
});
console.log("Template DB created at", out);
