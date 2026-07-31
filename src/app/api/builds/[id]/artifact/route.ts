import { ApiError, errorResponse, requireUserId } from "@/lib/api";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireUserId();
    const { id } = await params;
    const build = await prisma.buildJob.findFirst({ where: { id, requestedById: ownerId } });
    if (!build?.artifactKey || build.status !== "SUCCEEDED") throw new ApiError(404, "Build artifact is not available");
    const signed = await storage.signedDownloadUrl(build.artifactKey);
    if (signed) return Response.redirect(signed, 302);
    const artifact = await storage.get(build.artifactKey);
    const extension = build.type === "RELEASE_AAB" ? "aab" : build.type === "SOURCE_ZIP" ? "zip" : "apk";
    return new Response(new Uint8Array(artifact), { headers: { "Content-Type": extension === "zip" ? "application/zip" : "application/octet-stream", "Content-Disposition": `attachment; filename="${build.projectId}-${build.type.toLowerCase()}.${extension}"`, "Content-Length": String(artifact.length), "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
