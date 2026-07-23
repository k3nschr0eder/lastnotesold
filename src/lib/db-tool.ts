/**
 * Database helper — dual-mode: Neon Postgres (when DATABASE_URL is set) or
 * team-db CLI (fallback for sandbox development).
 *
 * On Vercel (production), DATABASE_URL is always set, so this uses Neon.
 * In the sandbox (preview), it falls back to team-db CLI.
 */
import { neon } from "@neondatabase/serverless";

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  error?: string;
}

const DATABASE_URL =
  (globalThis as any).process?.env?.DATABASE_URL ||
  process.env.DATABASE_URL;

/** Full path to team-db CLI (resolved from sandbox environment) */
const TEAM_DB_PATH = "/home/agent-data-api-engineer/.local/bin/team-db";

/**
 * Run a SQL query. Returns rows on success, error message on failure.
 * Uses Neon Postgres when DATABASE_URL is set, otherwise team-db CLI.
 */
export async function dbQuery<T = Record<string, unknown>>(
  sql: string,
  params?: any[],
): Promise<QueryResult<T>> {
  if (DATABASE_URL) {
    try {
      const sqlFn = neon(DATABASE_URL);
      if (params && params.length > 0) {
        const strings = sql.split("?");
        const result = await sqlFn(strings as any, ...params);
        return { rows: (result || []) as T[] };
      } else {
        const result = await sqlFn(sql as any);
        return { rows: (result || []) as T[] };
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Neon query error:", msg);
      return { rows: [], error: msg };
    }
  }

  // Fallback: team-db CLI (use full path + PATH fallback)
  try {
    const { execSync } = await import("node:child_process");
    const escaped = sql.replace(/"/g, '\\"');
    const out = execSync(
      `PATH="/home/agent-data-api-engineer/.local/bin:$PATH" ${TEAM_DB_PATH} "${escaped}"`,
      {
        encoding: "utf-8",
        timeout: 15000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, PATH: `/home/agent-data-api-engineer/.local/bin:${process.env.PATH || ""}` },
      },
    );
    const trimmed = out.trim();
    if (!trimmed) return { rows: [] as T[] };
    return { rows: JSON.parse(trimmed) as T[] };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("team-db error:", msg);
    return { rows: [], error: msg };
  }
}

/**
 * Execute a write statement (INSERT, UPDATE, DELETE, CREATE).
 * Returns success status.
 */
export async function dbExec(
  sql: string,
  params?: any[],
): Promise<{ success: boolean; error?: string }> {
  if (DATABASE_URL) {
    try {
      const sqlFn = neon(DATABASE_URL);
      if (params && params.length > 0) {
        const strings = sql.split("?");
        await sqlFn(strings as any, ...params);
      } else {
        await sqlFn(sql as any);
      }
      return { success: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Neon exec error:", msg);
      return { success: false, error: msg };
    }
  }

  // Fallback: team-db CLI
  try {
    const { execSync } = await import("node:child_process");
    const escaped = sql.replace(/"/g, '\\"');
    execSync(
      `PATH="/home/agent-data-api-engineer/.local/bin:$PATH" ${TEAM_DB_PATH} "${escaped}"`,
      {
        encoding: "utf-8",
        timeout: 15000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, PATH: `/home/agent-data-api-engineer/.local/bin:${process.env.PATH || ""}` },
      },
    );
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("team-db exec error:", msg);
    return { success: false, error: msg };
  }
}