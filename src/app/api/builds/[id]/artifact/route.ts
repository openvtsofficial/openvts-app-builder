import { ApiError, errorResponse, requireUserId } from "@/lib/api";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireUserId();
    const { id } = await params;
    const build = await prisma.buildJob.findFirst({ where: { id, requestedById: ownerId } });
    if (!build?.artifactKey || build.status !== "SUCCEEDED") throw new ApiError(404, "Build artifact is not available");
    const signed = await storage.signedDownloadUrl(build.artifactKey);
    if (signed) return new Response(null, { status: 302, headers: { Location: signed, "Cache-Control": "private, no-store" } });
    const artifact = await storage.openDownload(build.artifactKey);
    const extension = build.type === "RELEASE_AAB" ? "aab" : build.type === "SOURCE_ZIP" ? "zip" : "apk";
    return new Response(artifact.body, { headers: { "Content-Type": extension === "zip" ? "application/zip" : "application/octet-stream", "Content-Disposition": `attachment; filename="${build.projectId}-${build.type.toLowerCase()}.${extension}"`, ...(artifact.size === undefined ? {} : { "Content-Length": String(artifact.size) }), "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
