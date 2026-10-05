import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

try {
  loadEnvFile(".env");
} catch {}

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    globalSetup: "./tests/global-setup.ts",
    env: { NODE_ENV: "test", DATABASE_URL: process.env.DATABASE_URL_TEST ?? "" },
    fileParallelism: false,
  },
});
