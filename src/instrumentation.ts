/**
 * Runs once when the Next.js server starts (skipped during `next build`).
 * Production refuses to start with missing configuration; development only warns,
 * so the storefront can be worked on without every key.
 * Output lists variable NAMES only — never values.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // `next build` also loads this hook while collecting page data. Building needs no
  // secrets, so validate only when the server actually starts.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { getServerEnv, validateServerEnv, formatEnvReport } = await import("@/lib/env/server");
  const env = getServerEnv();
  const report = validateServerEnv(env);
  const text = formatEnvReport(report);

  if (!report.ok && env.isProduction) {
    console.error(`[config] ${text}`);
    // Throwing alone leaves a half-working server listening; exit so the host restarts/alerts.
    setTimeout(() => process["exit"](1), 50); // bracket access: this hook is also bundled for Edge, where a static process.exit warns
    throw new Error("Refusing to start in production with incomplete configuration.");
  }
  if (!report.ok || report.warnings.length) console.warn(`[config] ${text}`);
}
