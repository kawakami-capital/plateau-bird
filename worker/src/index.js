/**
 * 非公開の R2 バケット plateau-bird を、承認済み公開URLへ配信するWorker。
 * 2026年11月11日（日本時間）: blob画像取得用CSPとHTTP部分応答を修正。
 * r2.dev や独自ドメインをバケットに直接付けず、この Worker 経由で返す想定。
 */
const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' blob: data: https://msearch.gsi.go.jp/address-search/AddressSearch; img-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};

function cacheControlFor(key) {
  const lower = key.toLowerCase();
  if (/^bird\/releases\/20261111-[a-f0-9]{12}\//.test(key)) return "public, max-age=31536000, immutable";
  if (
    lower.endsWith(".glb") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".wasm") ||
    lower.includes("/vendor/")
  ) {
    return "public, max-age=31536000, immutable";
  }
  if (lower.endsWith(".html")) return "no-store, no-cache, max-age=0, must-revalidate";
  if (lower.endsWith(".json")) return "public, max-age=300";
  if (lower.endsWith(".mjs") || lower.endsWith(".js") || lower.endsWith(".css")) {
    return "public, max-age=3600";
  }
  return "public, max-age=300";
}

function contentTypeFor(key, stored) {
  if (stored) return stored;
  const lower = key.toLowerCase();
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".mjs") || lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".glb")) return "model/gltf-binary";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function objectKey(pathname) {
  let p = pathname;
  if (p.includes("\0") || p.includes("..")) return null;
  if (p === "/") return "__index_redirect__";
  if (p.endsWith("/")) p += "index.html";
  return p.replace(/^\/+/, "");
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("許可されていない方法です", {
        status: 405,
        headers: { ...SECURITY, Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    let key;
    try { key = objectKey(decodeURIComponent(url.pathname)); } catch { key = null; }
    if (key === null) {
      return new Response("このファイルはありません", {
        status: 400,
        headers: { ...SECURITY, "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    if (key === "__index_redirect__") {
      return new Response(null, { status: 302, headers: { ...SECURITY, Location: "/bird/" } });
    }

    const isHtml = key.toLowerCase().endsWith(".html");
    // バージョン付き資産と変更しない3Dモデルだけをエッジに保存。HTMLは絶対に保存しない。
    const isVersioned = /^bird\/releases\/20261111-[a-f0-9]{12}\//.test(key);
    const useEdge = request.method === "GET" && (isVersioned || key.endsWith(".glb")) &&
      !["range", "if-match", "if-none-match", "if-modified-since", "if-unmodified-since"].some(k => request.headers.has(k));
    const cacheRequest = useEdge ? new Request(url.origin + url.pathname, { method: "GET" }) : null;
    if (useEdge) {
      const cached = await caches.default.match(cacheRequest);
      if (cached) { const h = new Headers(cached.headers); h.set("X-Soramachi-Edge", "HIT"); return new Response(cached.body, {status:cached.status,headers:h}); }
    }
    // Always return a fresh HTML document/CSP, even when a browser sends an old ETag.
    const object = await env.BUCKET.get(key, isHtml ? {} : {
      range: request.headers,
      onlyIf: request.headers,
    });
    if (!object) {
      return new Response("このファイルはありません", {
        status: 404,
        headers: { ...SECURITY, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Type", contentTypeFor(key, object.httpMetadata?.contentType || headers.get("Content-Type")));
    headers.set("Cache-Control", isHtml ? "no-store, no-cache, max-age=0, must-revalidate" : (isVersioned ? cacheControlFor(key) : object.httpMetadata?.cacheControl || cacheControlFor(key)));
    headers.set("X-Soramachi-Release", "studio-20261111");
    if (isHtml) {
      headers.set("CDN-Cache-Control", "no-store");
      headers.set("Cloudflare-CDN-Cache-Control", "no-store");
      headers.set("Expires", "0");
      headers.delete("etag");
      headers.delete("Last-Modified");
    }
    for (const [k, v] of Object.entries(SECURITY)) headers.set(k, v);

    // R2 omits the body when conditional request headers are not satisfied.
    if (!("body" in object)) {
      const precondition = request.headers.has("if-match") || request.headers.has("if-unmodified-since");
      return new Response(null, { status: precondition ? 412 : 304, headers });
    }
    const status = !isHtml && object.range && request.headers.has("range") ? 206 : 200;
    if (status === 206) {
      const length = object.range.length ?? Math.min(object.range.suffix, object.size);
      const offset = object.range.offset ?? object.size - length;
      headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
      headers.set("Content-Length", String(length));
    } else {
      headers.set("Content-Length", String(object.size));
    }
    if (request.method === "HEAD") {
      return new Response(null, { status, headers });
    }
    const response = new Response(object.body, { status, headers });
    if (useEdge && status === 200) {
      headers.set("X-Soramachi-Edge", "MISS");
      const outgoing = new Response(response.body, {status,headers});
      ctx.waitUntil(caches.default.put(cacheRequest, outgoing.clone()).catch(e => console.warn(JSON.stringify({event:"edge-cache-skip",message:String(e)}))));
      return outgoing;
    }
    return response;
  },
};
