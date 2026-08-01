import { errorResponse, requireUserId } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await requireUserId();

    // Check if any build is currently running (not QUEUED, SUCCEEDED, FAILED, or CANCELLED)
    const runningBuild = await prisma.buildJob.findFirst({
      where: {
        status: {
          in: ["PREPARING", "CUSTOMIZING", "RESOLVING_DEPENDENCIES", "COMPILING", "SIGNING", "UPLOADING"],
        },
      },
      select: {
        id: true,
        type: true,
        status: true,
        progress: true,
        currentStage: true,
        requestedBy: { select: { email: true } },
      },
      orderBy: { startedAt: "asc" },
    });

    return Response.json({
      busy: !!runningBuild,
      currentBuild: runningBuild
        ? {
            id: runningBuild.id,
            type: runningBuild.type,
            status: runningBuild.status,
            progress: runningBuild.progress,
            currentStage: runningBuild.currentStage,
            userEmail: runningBuild.requestedBy?.email || "Unknown",
          }
        : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
