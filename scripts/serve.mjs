import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root = resolve("out"),
  types = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".png": "image/png",
    ".ico": "image/x-icon",
  };
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    let f = resolve(root, "." + (path === "/" ? "/index.html" : path));
    if (!f.startsWith(root + "\\") && !f.startsWith(root + "/")) {
      res.writeHead(403);
      res.end();
      return;
    }
    if ((await stat(f)).isDirectory()) f = resolve(f, "index.html");
    res.setHeader(
      "Content-Type",
      types[extname(f)] || "application/octet-stream",
    );
    res.setHeader("Cache-Control", "no-cache");
    res.end(await readFile(f));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(3100, "0.0.0.0", () =>
  console.log("Fieldwork production preview: http://localhost:3100"),
);
