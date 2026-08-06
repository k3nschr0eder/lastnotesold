/**
 * Stream Events Handler — Vercel Serverless Function
 *
 * GET  /api/stream/events?token=xxx       — SSE streaming endpoint
 * GET  /api/stream/events?token=xxx&poll=1&after=N — short poll fallback
 * POST /api/stream/events                  — publish event (panel calls after lookupNote)
 *
 * SSE streaming endpoint. Polls the overlay_events table every 500ms
 * and streams events to the OBS Browser Source overlay. Uses Turso
 * (libsql HTTP API) for DB access.
 *
 * Events are persisted in the DB, so if the stream disconnects (Vercel
 * timeout), the overlay's EventSource auto-reconnect catches up from
 * the last-seen event ID. A 3s poll fallback guarantees delivery.
 *
 * Adapted from LastSoldCoin stream-events.func for LastNoteSold (paper money).
 */
import type { IncomingMessage, ServerResponse } from "node:http";

// ── Turso HTTP client (matches build-vercel.sh overlays.func pattern) ──
const TU = (process.env.TEAM_DB_URL || "").replace("libsql://", "https://");
const TT = process.env.TEAM_DB_AUTH_TOKEN || "";

const tursoFetch = async (sql: string, args: string[] = []) => {
  const r = await fetch(TU + "/v2/pipeline", {
    method: "POST",
    headers: { "Authorization": "Bearer " + TT, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [
      { type: "execute", stmt: { sql, args: args.map(v => ({ type: "text", value: String(v) })) } },
      { type: "close" }
    ]}),
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json();
  if (j.results) { for (const res of j.results) { if (res.type === "error") throw new Error("Turso pipeline error: " + JSON.stringify(res)); } }
  return j;
};

const tursoQuery = async (sql: string, args: string[] = []): Promise<Record<string, unknown>[]> => {
  const j = await tursoFetch(sql, args);
  const result = j.results?.[0]?.response?.result;
  if (!result) return [];
  const cols = (result.cols || []).map((c: any) => typeof c === "string" ? c : c.name || "");
  return (result.rows || []).map((row: any) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((col: string, i: number) => { obj[col] = row[i]?.value != null ? row[i].value : row[i]; });
    return obj;
  });
};

const tursoExec = async (sql: string, args: string[] = []) => { await tursoFetch(sql, args); };

// ── Row types ─────────────────────────────────────────────────────────
interface OverlayRow {
  id: string;
  token: string;
  customer_id: string;
  query: string | null;
}

interface EventRow {
  id: number;
  token: string;
  event_type: string;
  payload: unknown;
  created_at: string;
}

// ── DB helpers (Turso / SQLite) ───────────────────────────────────────
let overlaysEnsured = false;
async function ensureOverlaysTable() {
  if (overlaysEnsured) return;
  try { await tursoExec("CREATE TABLE IF NOT EXISTS overlays (id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, customer_id TEXT, query TEXT, name TEXT DEFAULT '', config TEXT DEFAULT '{}', is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))"); } catch (_) {}
  try { await tursoExec("CREATE INDEX IF NOT EXISTS idx_overlays_token ON overlays(token)"); } catch (_) {}
  try { await tursoExec("CREATE INDEX IF NOT EXISTS idx_overlays_customer ON overlays(customer_id)"); } catch (_) {}
  overlaysEnsured = true;
}

async function getOverlayByToken(token: string): Promise<OverlayRow | null> {
  const rows = await tursoQuery(
    "SELECT id, token, customer_id, query FROM overlays WHERE token = ? LIMIT 1",
    [token],
  );
  return (rows[0] as OverlayRow) || null;
}

let eventsEnsured = false;
async function ensureEventsTable() {
  if (eventsEnsured) return;
  try { await tursoExec("CREATE TABLE IF NOT EXISTS overlay_events (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL, event_type TEXT NOT NULL, payload TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')))"); } catch (_) {}
  try { await tursoExec("CREATE INDEX IF NOT EXISTS idx_oe_token_created ON overlay_events(token, created_at)"); } catch (_) {}
  eventsEnsured = true;
}

async function pollEvents(token: string, sinceId: number) {
  const rows = await tursoQuery(
    "SELECT id, token, event_type, payload, created_at FROM overlay_events WHERE token = ? AND id > ? ORDER BY id ASC LIMIT 50",
    [token, String(sinceId)],
  ) as EventRow[];
  const events = rows.map((r) => ({
    id: r.id,
    token: r.token,
    event_type: r.event_type,
    payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload,
    created_at: r.created_at,
  }));
  return {
    events,
    latestId: events.length > 0 ? events[events.length - 1].id : sinceId,
  };
}

async function cleanupOldEvents() {
  await tursoExec("DELETE FROM overlay_events WHERE created_at < datetime('now', '-5 minutes')");
}

async function getLatestEventId(token: string): Promise<number> {
  const rows = await tursoQuery(
    "SELECT id FROM overlay_events WHERE token = ? ORDER BY id DESC LIMIT 1",
    [token],
  );
  return Number(rows[0]?.id) || 0;
}

async function publishEvent(token: string, eventType: string, payload: unknown) {
  await tursoExec(
    "INSERT INTO overlay_events (token, event_type, payload) VALUES (?, ?, ?)",
    [token, eventType, JSON.stringify(payload)],
  );
}

// ── Handler ──────────────────────────────────────────────────────────
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "", "http://localhost");
  const method = (req.method || "GET").toUpperCase();

  // ── POST: Publish event (panel pushes results here) ──
  if (method === "POST") {
    let body = "";
    try {
      body = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        req.on("error", reject);
      });
    } catch {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Failed to read body" }));
      return;
    }

    let data: { token?: string; event_type?: string; payload?: unknown };
    try {
      data = JSON.parse(body);
    } catch {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
      return;
    }

    const token = data.token?.trim();
    if (!token) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Missing token" }));
      return;
    }

    // Validate token against overlays table
    await ensureOverlaysTable();
    const overlay = await getOverlayByToken(token);
    if (!overlay) {
      res.statusCode = 401;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Invalid or inactive overlay token" }));
      return;
    }

    // Store event
    await ensureEventsTable();
    await publishEvent(token, data.event_type || "result", data.payload || {});

    // Also persist the latest query on the overlay row
    if (data.payload && typeof data.payload === "object" && "query" in (data.payload as any)) {
      try {
        await tursoExec("UPDATE overlays SET query = ? WHERE token = ?",
          [String((data.payload as any).query), token]);
      } catch {}
    }

    // Cleanup old events occasionally
    cleanupOldEvents().catch(() => {});

    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── GET: SSE streaming or poll ──
  const token = url.searchParams.get("token");
  const lastEventId = parseInt(req.headers["last-event-id"] as string || "0", 10) || 0;

  if (!token) {
    res.statusCode = 400;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Missing token parameter" }));
    return;
  }

  await ensureOverlaysTable();

  let overlay: OverlayRow | null = null;
  try {
    overlay = await getOverlayByToken(token);
  } catch {}

  if (!overlay) {
    res.statusCode = 401;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Invalid or inactive overlay token" }));
    return;
  }

  // Poll mode (?poll=1&after=N): short JSON request returning events since N.
  if (url.searchParams.get("poll") === "1") {
    try {
      await ensureEventsTable();
      const after = parseInt(url.searchParams.get("after") || "0", 10) || 0;
      const result = await pollEvents(token, after);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.end(JSON.stringify({ events: result.events, latestId: result.latestId }));
    } catch (e) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Poll failed", detail: String(e instanceof Error ? e.message : e).substring(0, 120) }));
    }
    return;
  }

  // ── SSE streaming ──
  await ensureEventsTable();

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let latestId = lastEventId > 0 ? lastEventId : await getLatestEventId(token);

  // Store overlay query as config for initial handshake
  const config: Record<string, unknown> = { query: overlay.query || "" };
  res.write(`id: ${latestId}\nevent: connected\ndata: ${JSON.stringify({ status: "connected", token, latestId, config })}\n\n`);

  cleanupOldEvents().catch(() => {});

  let pollCount = 0;
  const MAX_POLLS = 600; // ~5 minutes at 500ms intervals
  let aborted = false;

  req.on("close", () => { aborted = true; });

  const poll = async () => {
    if (aborted) return;
    try {
      const result = await pollEvents(token, latestId);
      if (result.events.length > 0) {
        for (const evt of result.events) {
          res.write(`id: ${evt.id}\nevent: ${evt.event_type}\ndata: ${JSON.stringify(evt.payload)}\n\n`);
        }
        latestId = result.latestId;
      }
      pollCount++;
      if (pollCount % 60 === 0) {
        cleanupOldEvents().catch(() => {});
      }
      if (pollCount < MAX_POLLS && !aborted) {
        setTimeout(poll, 500);
      } else if (!aborted) {
        res.write(`id: ${latestId}\nevent: done\ndata: ${JSON.stringify({ reason: "timeout", latestId })}\n\n`);
        res.end();
      }
    } catch {
      res.write(`event: error\ndata: ${JSON.stringify({ message: "Stream error" })}\n\n`);
      pollCount++;
      if (pollCount < MAX_POLLS && !aborted) {
        setTimeout(poll, 2000);
      } else {
        res.end();
      }
    }
  };
  poll();
}
