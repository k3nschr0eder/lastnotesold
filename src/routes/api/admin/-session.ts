/**
 * GET /api/admin/session — return current admin session or 401
 */

import { createServerFn } from "@tanstack/react-start";
import { getAdminSession, clearAdminSession } from "~/lib/admin-auth";

export const getAdminSessionEndpoint = createServerFn({ method: "GET" }).handler(async () => {
  const session = getAdminSession();
  if (!session) {
    clearAdminSession();
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return { email: session.email, isSuperadmin: session.isSuperadmin };
});
