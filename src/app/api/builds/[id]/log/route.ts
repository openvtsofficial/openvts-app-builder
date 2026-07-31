import { errorResponse, requireUserId } from "@/lib/api";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireUserId();
    const { id } = await params;
    const initial = await prisma.buildJob.findFirst({ where: { id, requestedById: ownerId }, select: { id: true } });
    if (!initial) return Response.json({ error: "Build not found" }, { status: 404 });
    const encoder = new TextEncoder();
    let timer: ReturnType<typeof setInterval> | undefined;
    let lastLength = 0;
    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        const close = () => { if (closed) return; closed = true; if (timer) clearInterval(timer); controller.close(); };
        const send = async () => {
          try {
            const build = await prisma.buildJob.findFirst({ where: { id, requestedById: ownerId }, select: { buildLog: true, status: true } });
            if (!build) { close(); return; }
            const log = build.buildLog ?? "";
            if (log.length > lastLength) {
              const newContent = log.slice(lastLength);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(newContent)}\n\n`));
              lastLength = log.length;
            }
            if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(build.status)) {
              controller.enqueue(encoder.encode(`event: done\ndata: ${build.status}\n\n`));
              close();
            }
          } catch { close(); }
        };
        void send();
        timer = setInterval(() => void send(), 2000);
        request.signal.addEventListener("abort", close, { once: true });
      },
      cancel() { if (timer) clearInterval(timer); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  } catch (error) { return errorResponse(error); }
}
