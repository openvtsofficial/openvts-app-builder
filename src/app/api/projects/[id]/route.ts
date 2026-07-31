import { requireOwnedProject, requireUserId, errorResponse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toStudioProject } from "@/lib/project-mapper";
import { projectSchema } from "@/lib/validation";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireUserId();
    const { id } = await params;
    const project = await prisma.project.findFirst({ where: { id, ownerId }, include: { assets: true } });
    if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
    return Response.json({ project: toStudioProject(project) });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireUserId();
    const { id } = await params;
    await requireOwnedProject(id, ownerId);
    const input = projectSchema.partial().parse(await request.json());
    const project = await prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({ where: { id }, data: { ...input, configurationRevision: { increment: 1 }, status: "DRAFT" }, include: { assets: true } });
      await tx.auditLog.create({ data: { actorId: ownerId, projectId: id, action: "project.updated", entityType: "Project", entityId: id, metadata: { fields: Object.keys(input) } } });
      return updated;
    });
    return Response.json({ project: toStudioProject(project) });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireUserId();
    const { id } = await params;
    await requireOwnedProject(id, ownerId);
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { actorId: ownerId, projectId: id, action: "project.deleted", entityType: "Project", entityId: id } });
      await tx.project.delete({ where: { id } });
    });
    return new Response(null, { status: 204 });
  } catch (error) { return errorResponse(error); }
}
