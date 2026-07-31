import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { url } = (await request.json()) as { url?: string };
    if (!url || typeof url !== "string") {
      return Response.json({ valid: false, error: "URL is required" }, { status: 400 });
    }

    if (!/^https?:\/\//.test(url)) {
      return Response.json({ valid: false, error: "URL must start with http:// or https://" });
    }

    const healthUrl = url.endsWith("/") ? `${url}health` : `${url}/health`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(healthUrl, {
        method: "GET",
        signal: controller.signal,
        headers: { "User-Agent": "OpenVTS-AppStudio/1.0" },
      });
      clearTimeout(timeout);

      if (response.ok) {
        return Response.json({ valid: true, status: response.status });
      }
      return Response.json({ valid: false, error: `Health endpoint returned ${response.status}` });
    } catch (fetchError) {
      clearTimeout(timeout);
      const message = fetchError instanceof Error ? fetchError.message : "Connection failed";
      if (message.includes("abort")) {
        return Response.json({ valid: false, error: "Connection timed out (8s)" });
      }
      return Response.json({ valid: false, error: message });
    }
  } catch {
    return Response.json({ valid: false, error: "Invalid request" }, { status: 400 });
  }
}
