export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    const { startEmbeddedWorker } = await import("@/lib/embedded-worker");
    startEmbeddedWorker();
  }
}
