import { readdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
const root = join(process.cwd(), "out");
for (const size of [192, 512])
  await sharp("public/icon.svg")
    .resize(size, size)
    .png()
    .toFile(join(root, `icon-${size}.png`));
async function walk(dir) {
  let result = [];
  for (const f of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) result.push(...(await walk(p)));
    else result.push(p);
  }
  return result;
}
const files = (await walk(root)).filter(
  (p) =>
    !p.endsWith("sw.js") &&
    !p.endsWith(".map") &&
    !p.endsWith(".txt") &&
    !p.endsWith("404.html") &&
    !p.endsWith("_not-found.html"),
);
const assets = files.map((p) => "/" + relative(root, p).replaceAll("\\", "/"));
const hash = createHash("sha256");
for (const f of files) hash.update(await readFile(f));
const version = hash.digest("hex").slice(0, 14);
const source = `const CACHE='fieldwork-${version}';
const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(ASSETS);await self.skipWaiting();})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('fieldwork-')&&key!==CACHE)await caches.delete(key);await self.clients.claim();})());});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
if(event.request.mode==='navigate'){event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match('/index.html')||await fetch(event.request);})());return;}
if(ASSETS.includes(url.pathname)){event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(url.pathname)||await fetch(event.request);})());}
});
`;
await writeFile(join(root, "sw.js"), source);
console.log(
  `Precached ${assets.length} local assets. Offline shell version ${version}. External maps and Supabase responses are never cached.`,
);
