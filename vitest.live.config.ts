import { defineConfig, loadEnv } from "vite";
import path from "node:path";

/**
 * Read-only checks of the storefront data layer against your REAL Supabase project.
 * Loads .env.local, performs only SELECTs with the public (anon) key, writes nothing.
 *   npm run test:live
 */
export default defineConfig(({ mode }) => ({
  test: {
    include: ["tests/live/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    env: { ...loadEnv(mode, process.cwd(), ""), LIVE_TESTS: "1" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
}));
