// Vercel Build Output API function entry.
//
// The Build Output Node launcher invokes the default export as a classic Node
// `(req, res)` handler — NOT a web handler. TanStack Start emits a portable web
// fetch handler (dist/server/server.js), so we adapt: Node IncomingMessage → web
// Request, run the fetch handler, stream the web Response back onto ServerResponse.
// Node 22 has global Request/Response/Headers/ReadableStream.
//
// Bundled (with its deps + the SSR handler's dynamic ./assets chunks) into
// .vercel/output/functions/render.func/index.mjs by build-vercel.sh.
import type { IncomingMessage, ServerResponse } from "node:http";

import handler from "./dist/server/server.js";

const fetchHandler = handler as {
  fetch: (request: Request) => Response | Promise<Response>;
};

const toWebRequest = (req: IncomingMessage): Request => {
  const host = req.headers.host ?? "localhost";
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const url = `${proto}://${host}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else if (value != null) headers.set(key, value);
  }
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(url, {
    method,
    headers,
    ...(hasBody
      ? { body: req as unknown as ReadableStream, duplex: "half" }
      : {}),
  } as RequestInit);
};

/**
 * TanStack Start's SSR emits modulepreload links and a $_TSR inline script
 * that stores the manifest (including script URLs), but it does NOT emit
 * the actual <script type="module"> tags needed to execute the client bundle.
 * 
 * This function extracts script URLs from the $_TSR manifest and injects
 * the corresponding <script type="module"> tags before the </body> or at
 * the end of the response.
 */
function injectClientScripts(html: string): string {
  // Extract script URLs from the $_TSR router manifest
  const scriptUrls: string[] = [];
  
  // Match patterns like: scripts:$R[N]=[$R[N]={attrs:$R[N]={type:"module",async:!0,src:"/assets/index-XXXXX.js"}}]
  const scriptRegex = /src:"([^"]+\.js)"/g;
  let match;
  while ((match = scriptRegex.exec(html)) !== null) {
    const url = match[1];
    // Only include module scripts (not inline or data URLs)
    if (url.startsWith("/assets/") && !scriptUrls.includes(url)) {
      scriptUrls.push(url);
    }
  }
  
  if (scriptUrls.length === 0) return html;
  
  // Build script tags
  const scriptTags = scriptUrls
    .map(src => `<script type="module" async src="${src}"></script>`)
    .join("");
  
  // Inject before </body> if present, otherwise append
  if (html.includes("</body>")) {
    return html.replace("</body>", `${scriptTags}</body>`);
  }
  // Inject before the closing </div> or </html>
  if (html.includes("</html>")) {
    return html.replace("</html>", `${scriptTags}</html>`);
  }
  return html + scriptTags;
}

export default async function vercelHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const webRes = await fetchHandler.fetch(toWebRequest(req));
    res.statusCode = webRes.status;
    webRes.headers.forEach((value, key) => res.setHeader(key, value));
    
    // For HTML responses, buffer and inject client scripts
    const contentType = webRes.headers.get("content-type") || "";
    if (contentType.includes("text/html") && webRes.body) {
      const reader = webRes.body.getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      // Concatenate chunks
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      const html = new TextDecoder().decode(combined);
      const modified = injectClientScripts(html);
      res.write(modified);
    } else if (webRes.body) {
      const reader = webRes.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  } catch (error) {
    // Log the detail server-side (captured by the host's function logs); never
    // return a stack trace to the public visitor of the site.
    console.error("[team-site] SSR request failed", error);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain");
    res.end("Internal Server Error");
  }
}
