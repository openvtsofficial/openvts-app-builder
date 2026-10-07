import { ApiError, errorResponse, requireOwnedProject, requireUserId } from "@/lib/api";
import { signingKeyForProject } from "@/lib/android-signing";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ownerId = await requireUserId();
    const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
    if (projectId) await requireOwnedProject(projectId, ownerId);
    const keystore = await signingKeyForProject(projectId).then((key) => key.bytes).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") throw new ApiError(404, "Release keystore is not configured");
      throw error;
    });

    return new Response(new Uint8Array(keystore), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="application-key.jks"',
        "Content-Length": String(keystore.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
