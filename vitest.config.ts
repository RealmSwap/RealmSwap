import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "electron/**/*.test.js", "agent/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
