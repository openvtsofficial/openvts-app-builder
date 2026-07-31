import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";

try {
  await access("sites-preview");
} catch {
  console.log("sites-preview/ not found — skipping sites-preview build.");
  process.exit(0);
}

await rm("dist", { recursive: true, force: true });
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await cp("sites-preview", "dist", { recursive: true });
await cp(".openai/hosting.json", "dist/.openai/hosting.json");

const textAssets = Object.fromEntries(
  await Promise.all(
    ["index.html", "styles.css", "app.js"].map(async (file) => [
      `/${file}`,
      await readFile(`sites-preview/${file}`, "utf8"),
    ]),
  ),
);
const binaryAssets = {
  "/open-vts-logo.png": (await readFile("sites-preview/open-vts-logo.png")).toString("base64"),
};

const worker = `const textAssets = ${JSON.stringify(textAssets)};
const binaryAssets = ${JSON.stringify(binaryAssets)};
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
};
const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const app = {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD", ...securityHeaders },
      });
    }

    const url = new URL(request.url);
    let path;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad request", { status: 400, headers: securityHeaders });
    }
    if (path === "/") path = "/index.html";

    const isText = Object.hasOwn(textAssets, path);
    const isBinary = Object.hasOwn(binaryAssets, path);
    const isAsset = isText || isBinary;
    const encoded = isBinary ? atob(binaryAssets[path]) : "";
    const body = isBinary ? Uint8Array.from(encoded, (character) => character.charCodeAt(0)) : isText ? textAssets[path] : textAssets["/index.html"];
    const extension = isAsset ? path.slice(path.lastIndexOf(".")) : ".html";
    const headers = new Headers({
      "Content-Type": types[extension] || "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600",
      ...securityHeaders,
    });
    return new Response(request.method === "HEAD" ? null : body, {
      status: 200,
      headers,
    });
  },
};

export default app;
`;

await writeFile("dist/server/index.js", worker);
