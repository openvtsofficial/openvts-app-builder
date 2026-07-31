import { auth } from "@/auth";
import { isDemoMode } from "@/lib/env";
import { prisma } from "@/lib/db";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function requireUserId() {
  if (isDemoMode) return "demo-user";
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, "Authentication required");
  return session.user.id;
}

export async function requireOwnedProject(projectId: string, ownerId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, ownerId } });
  if (!project) throw new ApiError(404, "Project not found");
  return project;
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") return Response.json({ error: "An application already uses this package or bundle identifier." }, { status: 409 });
  console.error(error);
  return Response.json({ error: "Unexpected server error" }, { status: 500 });
}
