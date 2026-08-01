import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { errorResponse, requireUserId } from "@/lib/api";

export async function GET() {
  try {
    await requireUserId();

    // Path to the bundled keystore in the container
    const keystorePath = path.resolve(process.cwd(), "signing", "application-key.jks");

    if (!existsSync(keystorePath)) {
      return Response.json({ error: "Keystore file not found" }, { status: 404 });
    }

    const keystore = await readFile(keystorePath);

    return new Response(keystore, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="application-key.jks"',
        "Content-Length": String(keystore.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
