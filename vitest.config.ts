import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // Site tests use relative imports (the "@" alias belongs to src/, and the
    // site has its own node_modules).
    include: ["src/**/*.test.ts", "electron/**/*.test.js", "agent/**/*.test.ts", "site/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
