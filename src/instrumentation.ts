export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PUBLIC_DEMO_MODE !== "true" && process.env.DISABLE_EMBEDDED_WORKER !== "true") {
    const { startEmbeddedWorker } = await import("@/lib/embedded-worker");
    startEmbeddedWorker();
  }
}
