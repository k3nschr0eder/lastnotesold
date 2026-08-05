/**
 * Overlays Lib — Turso DB access for OBS overlays.
 *
 * Reuses the same HTTP pipeline pattern as referral.ts (Turso v2 pipeline).
 * Env vars: TEAM_DB_URL, TEAM_DB_AUTH_TOKEN.
 */

/** Max overlays a single customer can create. */
export const MAX_OVERLAYS = 10;

export interface OverlayRow {
  id: string;
  token: string;
  customerId: string;
  query: string;
  createdAt: string;
}

export type CreateOverlayResult =
  | { ok: true; overlay: OverlayRow }
  | { ok: false; reason: "limit" | "error" };

function getTursoConfig(): { url: string; token: string } | null {
  const dbUrl = process.env.TEAM_DB_URL;
  const token = process.env.TEAM_DB_AUTH_TOKEN;
  if (!dbUrl || !token) return null;
  return {
    url: dbUrl.replace("libsql://", "https://"),
    token,
  };
}

interface QueryRow {
  [key: string]: any;
}

async function runQuery(sql: string, params: string[] = []): Promise<QueryRow[]> {
  const cfg = getTursoConfig();
  if (!cfg) return [];

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(cfg.url + "/v2/pipeline", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + cfg.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            type: "execute",
            stmt: {
              sql,
              args: params.map((v) => ({ type: "text", value: String(v) })),
            },
          },
          { type: "close" },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    const j = await r.json();
    const results = j.results?.[0]?.response?.result;
    const rows = results?.rows || [];
    const cols = (results?.cols || []).map((c: any) => c.name);

    return rows.map((row: any) => {
      const obj: QueryRow = {};
      if (Array.isArray(row) && cols.length > 0) {
        row.forEach((cell: any, i: number) => {
          obj[cols[i]] = cell?.value;
        });
      } else if (row.columns) {
        row.columns.forEach((c: any) => {
          obj[c.name] = c.value;
        });
      } else {
        Object.keys(row).forEach((k) => {
          obj[k] = row[k]?.value != null ? row[k].value : row[k];
        });
      }
      return obj;
    });
  } catch (e) {
    console.error(
      "Turso query error:",
      String((e as any)?.message || e).substring(0, 200)
    );
    return [];
  }
}

async function runExec(sql: string, params: string[] = []): Promise<boolean> {
  const cfg = getTursoConfig();
  if (!cfg) return false;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    await fetch(cfg.url + "/v2/pipeline", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + cfg.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            type: "execute",
            stmt: {
              sql,
              args: params.map((v) => ({ type: "text", value: String(v) })),
            },
          },
          { type: "close" },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return true;
  } catch (e) {
    console.error(
      "Turso exec error:",
      String((e as any)?.message || e).substring(0, 200)
    );
    return false;
  }
}

/**
 * Create the `overlays` table if it doesn't exist, and migrate the Phase-1
 * legacy table (which used `user_customer_id`/`name`) to the current schema
 * by adding the `customer_id`/`query` columns when missing.
 *
 * ALTER TABLE ADD COLUMN fails harmlessly when the column already exists,
 * so this is idempotent against both fresh and legacy databases.
 */
async function ensureOverlaysTable(): Promise<void> {
  await runExec(
    `CREATE TABLE IF NOT EXISTS overlays (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL,
      query TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
  );
  // Legacy Phase-1 columns — add the spec columns if they're missing.
  await runExec("ALTER TABLE overlays ADD COLUMN customer_id TEXT");
  await runExec("ALTER TABLE overlays ADD COLUMN query TEXT");
  // Backfill legacy rows so old overlays still work with the new schema.
  await runExec(
    "UPDATE overlays SET customer_id = user_customer_id WHERE customer_id IS NULL AND user_customer_id IS NOT NULL"
  );
  await runExec(
    "UPDATE overlays SET query = name WHERE query IS NULL AND name IS NOT NULL"
  );
}

/** Generate an unguessable 12-character token for the OBS URL. */
function randomToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let t = "";
  for (let i = 0; i < 12; i++) {
    t += chars[Math.floor(Math.random() * chars.length)];
  }
  return t;
}

function toOverlayRow(row: QueryRow): OverlayRow | null {
  const token = row.token || row["token"] || "";
  const query = row.query || row["query"] || "";
  if (!token || !query) return null;
  return {
    id: row.id || row["id"] || "",
    token,
    customerId: row.customer_id || row["customer_id"] || "",
    query,
    createdAt: row.created_at || row["created_at"] || "",
  };
}

/**
 * Create an overlay for a customer. Enforces the 10-overlay limit.
 */
export async function createOverlay(
  customerId: string,
  query: string
): Promise<CreateOverlayResult> {
  if (!getTursoConfig()) return { ok: false, reason: "error" };
  await ensureOverlaysTable();

  const countRows = await runQuery(
    "SELECT COUNT(*) as c FROM overlays WHERE customer_id = ?",
    [customerId]
  );
  const count = Number(countRows[0]?.c || countRows[0]?.["c"] || 0);
  if (count >= MAX_OVERLAYS) return { ok: false, reason: "limit" };

  const id = "ovl_" + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);

  // Retry on the (unlikely) token collision against the UNIQUE constraint.
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = randomToken();
    const ok = await runExec(
      "INSERT INTO overlays (id, token, customer_id, query) VALUES (?, ?, ?, ?)",
      [id, token, customerId, query]
    );
    if (ok) {
      const created = await runQuery(
        "SELECT id, token, customer_id, query, created_at FROM overlays WHERE token = ? LIMIT 1",
        [token]
      );
      return {
        ok: true,
        overlay: toOverlayRow(created[0]) || { id, token, customerId, query, createdAt: "" },
      };
    }
  }
  return { ok: false, reason: "error" };
}

/**
 * List all overlays for a customer, newest first.
 */
export async function listOverlays(customerId: string): Promise<OverlayRow[]> {
  if (!getTursoConfig()) return [];
  const rows = await runQuery(
    "SELECT id, token, customer_id, query, created_at FROM overlays WHERE customer_id = ? ORDER BY created_at DESC, rowid DESC",
    [customerId]
  );
  return rows
    .map(toOverlayRow)
    .filter((r): r is OverlayRow => r !== null);
}

/**
 * Delete an overlay owned by a customer. Returns true when a row was removed.
 */
export async function deleteOverlay(
  customerId: string,
  token: string
): Promise<boolean> {
  if (!getTursoConfig()) return false;
  const ok = await runExec(
    "DELETE FROM overlays WHERE token = ? AND customer_id = ?",
    [token, customerId]
  );
  return ok;
}

/**
 * Public read for the OBS viewer — authorized by the unguessable token alone.
 */
export async function getOverlay(token: string): Promise<OverlayRow | null> {
  if (!getTursoConfig()) return null;
  const rows = await runQuery(
    "SELECT id, token, customer_id, query, created_at FROM overlays WHERE token = ? LIMIT 1",
    [token]
  );
  return toOverlayRow(rows[0]);
}
