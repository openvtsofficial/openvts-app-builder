import { randomBytes } from "node:crypto";
import { requireUserId, errorResponse } from "@/lib/api";
import { prisma } from "@/lib/db";
import { toStudioProject } from "@/lib/project-mapper";
import { projectSchema, slugify } from "@/lib/validation";

export async function GET() {
  try {
    const ownerId = await requireUserId();
    const projects = await prisma.project.findMany({ where: { ownerId, status: { not: "ARCHIVED" } }, include: { assets: true }, orderBy: { updatedAt: "desc" } });
    return Response.json({ projects: projects.map(toStudioProject) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const ownerId = await requireUserId();
    const input = projectSchema.parse(await request.json());
    const slug = `${slugify(input.name)}-${randomBytes(2).toString("hex")}`;
    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({ data: { ownerId, slug, ...input }, include: { assets: true } });
      await tx.auditLog.create({ data: { actorId: ownerId, projectId: created.id, action: "project.created", entityType: "Project", entityId: created.id } });
      return created;
    });
    return Response.json({ project: toStudioProject(project) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
