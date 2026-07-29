/**
 * POST /api/admin/logout — clear session cookie
 */

import { createServerFn } from "@tanstack/react-start";
import { clearAdminSession } from "~/lib/admin-auth";

export const postAdminLogout = createServerFn({ method: "POST" }).handler(async () => {
  clearAdminSession();
  return { success: true };
});
