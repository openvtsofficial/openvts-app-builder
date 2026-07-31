import { isDemoMode } from "@/lib/env";

export function GET() {
  return Response.json({ status: "ok", mode: isDemoMode ? "demo" : "production", timestamp: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
