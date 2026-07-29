/**
 * POST /api/admin/login — authenticate admin user, set session cookie
 */

import { createServerFn } from "@tanstack/react-start";
import { setCookie } from "@tanstack/react-start/server";
import { sign } from "~/lib/admin-auth";

export const postAdminLogin = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { email?: string; password?: string })
  .handler(async ({ data }) => {
    const email = (data.email || "").trim().toLowerCase();
    const password = (data.password || "").trim();

    if (!email || !password) {
      return new Response(JSON.stringify({ error: "Email and password required" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const admins = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (!admins.includes(email)) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword || password !== adminPassword) {
      return new Response(JSON.stringify({ error: "Invalid password" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    const superadmins = (process.env.SUPERADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    setCookie("lns_admin", sign(email), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 86400,
    });

    return { success: true, email, isSuperadmin: superadmins.includes(email) };
  });
