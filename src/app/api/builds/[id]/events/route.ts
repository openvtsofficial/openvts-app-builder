import { errorResponse, requireUserId } from "@/lib/api";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toBuildEvent(build: { id: string; projectId: string; type: string; projectRevision: number; status: string; progress: number; currentStage: string; etaSeconds: number | null; createdAt: Date; finishedAt: Date | null; artifactKey: string | null }) {
  return {
    id: build.id,
    projectId: build.projectId,
    type: build.type,
    projectRevision: build.projectRevision,
    status: build.status,
    progress: build.progress,
    currentStage: build.currentStage,
    etaSeconds: build.etaSeconds ?? undefined,
    createdAt: build.createdAt.toISOString(),
    finishedAt: build.finishedAt?.toISOString(),
    artifactName: build.artifactKey ? build.artifactKey.split("/").pop() : undefined,
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireUserId();
    const { id } = await params;
    const initial = await prisma.buildJob.findFirst({ where: { id, requestedById: ownerId } });
    if (!initial) return Response.json({ error: "Build not found" }, { status: 404 });
    const encoder = new TextEncoder();
    let timer: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        const close = () => { if (closed) return; closed = true; if (timer) clearInterval(timer); controller.close(); };
        const send = async () => {
          try {
            const build = await prisma.buildJob.findFirst({ where: { id, requestedById: ownerId } });
            if (!build) { close(); return; }
            const event = toBuildEvent(build);
            controller.enqueue(encoder.encode(`event: build\ndata: ${JSON.stringify(event)}\n\n`));
            if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(build.status)) close();
          } catch { close(); }
        };
        void send();
        timer = setInterval(() => void send(), 1500);
        request.signal.addEventListener("abort", close, { once: true });
      },
      cancel() { if (timer) clearInterval(timer); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  } catch (error) { return errorResponse(error); }
}
