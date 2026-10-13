import { tmpdir } from "node:os";
import { join } from "node:path";
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
    env: { NODE_ENV: "test", APP_ENV: "test", PAYMENT_SIMULATION: "on", DATABASE_URL: process.env.DATABASE_URL_TEST ?? "", UPLOAD_DIR: join(tmpdir(), "tienda-test-uploads") },
    fileParallelism: false,
  },
});
