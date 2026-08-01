import { ApiError, errorResponse, requireUserId } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireUserId();
    const { id } = await params;
    const build = await prisma.buildJob.findFirst({ where: { id, requestedById: ownerId } });
    if (!build) throw new ApiError(404, "Build not found");
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(build.status)) {
      throw new ApiError(400, "Build is already finished");
    }
    await prisma.buildJob.update({
      where: { id },
      data: {
        status: "CANCELLED",
        currentStage: "Cancelled by user",
        etaSeconds: null,
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });
    return Response.json({ cancelled: true });
  } catch (error) { return errorResponse(error); }
}
