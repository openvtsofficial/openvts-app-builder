import { inspectIconKitchenZip } from "@/lib/icon-kitchen";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "ZIP file is required" }, { status: 400 });
    if (file.size > 20_000_000) return Response.json({ error: "ZIP must be smaller than 20 MB" }, { status: 413 });
    const { manifest } = await inspectIconKitchenZip(await file.arrayBuffer());
    return Response.json({ manifest });
  } catch {
    return Response.json({ error: "The uploaded file is not a valid Icon Kitchen ZIP." }, { status: 422 });
  }
}
