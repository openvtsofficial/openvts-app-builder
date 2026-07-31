import { z } from "zod";
import { ApiError, errorResponse, requireOwnedProject, requireUserId } from "@/lib/api";
import { prisma } from "@/lib/db";

const requestSchema = z.object({ type: z.enum(["DEBUG_APK", "RELEASE_APK", "SIGNED_APK", "RELEASE_AAB", "SOURCE_ZIP"]) });

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireUserId();
    const { id } = await params;
    await requireOwnedProject(id, ownerId);
    const builds = await prisma.buildJob.findMany({ where: { projectId: id, requestedById: ownerId }, orderBy: { createdAt: "desc" }, take: 50 });
    return Response.json({ builds });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireUserId();
    const { id } = await params;
    const project = await requireOwnedProject(id, ownerId);
    const { type } = requestSchema.parse(await request.json());
    if (["SIGNED_APK", "RELEASE_AAB"].includes(type)) {
      const signing = await prisma.signingProfile.findUnique({ where: { projectId: id } });
      if (!signing) throw new ApiError(409, "Connect an Android signing profile before requesting this build");
    }
    const build = await prisma.$transaction(async (tx) => {
      const job = await tx.buildJob.create({ data: { projectId: id, requestedById: ownerId, type, projectRevision: project.configurationRevision, currentStage: "Waiting for an isolated Flutter runner", etaSeconds: type === "SOURCE_ZIP" ? 30 : 300 } });
      await tx.project.update({ where: { id }, data: { status: "BUILDING" } });
      await tx.auditLog.create({ data: { actorId: ownerId, projectId: id, action: "build.requested", entityType: "BuildJob", entityId: job.id, metadata: { type, templateVersion: project.templateVersion } } });
      return job;
    });
    return Response.json({ build }, { status: 202 });
  } catch (error) { return errorResponse(error); }
}
