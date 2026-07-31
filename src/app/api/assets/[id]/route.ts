import { requireUserId, errorResponse, ApiError } from "@/lib/api";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireUserId();
    const { id } = await params;
    const asset = await prisma.asset.findFirst({ where: { id, project: { ownerId } } });
    if (!asset) throw new ApiError(404, "Asset not found");
    const signed = await storage.signedDownloadUrl(asset.storageKey);
    if (signed) return Response.redirect(signed, 302);
    const data = await storage.get(asset.storageKey);
    return new Response(new Uint8Array(data), { headers: { "Content-Type": asset.mimeType, "Content-Length": String(data.length), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
