/**
 * Admin auth helpers — HMAC-signed cookie authentication.
 * Used by both API routes and page loaders.
 */

import { getCookie, deleteCookie } from "@tanstack/react-start/server";
import { createHmac, timingSafeEqual } from "node:crypto";

export function getSigningSecret(): string {
  return process.env.ADMIN_SECRET || process.env.STRIPE_SECRET_KEY || "dev-fallback-secret";
}

export function sign(value: string): string {
  const hmac = createHmac("sha256", getSigningSecret());
  hmac.update(value);
  return value + "." + hmac.digest("hex");
}

export function verifyCookie(signed: string): string | null {
  const lastDot = signed.lastIndexOf(".");
  if (lastDot < 0) return null;
  const value = signed.substring(0, lastDot);
  const expected = sign(value);
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signed);
    if (a.length !== b.length) return null;
    return timingSafeEqual(a, b) ? value : null;
  } catch {
    return null;
  }
}

export function getAdminSession(): { email: string; isSuperadmin: boolean } | null {
  const cookie = getCookie("lns_admin");
  if (!cookie) return null;
  const email = verifyCookie(cookie);
  if (!email) return null;

  const admins = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const superadmins = (process.env.SUPERADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!admins.includes(email)) return null;
  return { email, isSuperadmin: superadmins.includes(email) };
}

export function clearAdminSession(): void {
  deleteCookie("lns_admin", { path: "/" });
}
