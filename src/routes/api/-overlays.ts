/**
 * Overlays API — Server functions for overlay CRUD.
 *
 * These are TanStack Start server functions (same pattern as lookupNote in
 * src/lib/api.ts) — the client pages import them directly and the RPC is
 * handled by the SSR render function.
 *
 * createOverlay(customerId, query)  — store a new overlay (max 10 per customer)
 * listOverlays(customerId)          — all overlays for a customer
 * deleteOverlay(customerId, token)  — delete one of the customer's overlays
 * getOverlay(token)                 — public read for the OBS viewer
 */

import { createServerFn } from "@tanstack/react-start";
import {
  createOverlay as createOverlayDb,
  listOverlays as listOverlaysDb,
  deleteOverlay as deleteOverlayDb,
  getOverlay as getOverlayDb,
} from "~/lib/overlays";

export const createOverlay = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { customerId?: string; query?: string })
  .handler(async ({ data }) => {
    const customerId = data.customerId?.trim() || "";
    const query = data.query?.trim() || "";
    if (!customerId) return { error: "Missing customerId" };
    if (!query) return { error: "Missing query" };
    if (query.length > 200) return { error: "Query is too long (max 200 characters)" };

    const result = await createOverlayDb(customerId, query);
    if (!result.ok) {
      if (result.reason === "limit") {
        return { error: "Overlay limit reached — you can have up to 10 overlays. Delete one first." };
      }
      return { error: "Could not create overlay — please try again." };
    }
    return { overlay: result.overlay };
  });

export const listOverlays = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { customerId?: string })
  .handler(async ({ data }) => {
    const customerId = data.customerId?.trim() || "";
    if (!customerId) return { error: "Missing customerId" };
    const overlays = await listOverlaysDb(customerId);
    return { overlays };
  });

export const deleteOverlay = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { customerId?: string; token?: string })
  .handler(async ({ data }) => {
    const customerId = data.customerId?.trim() || "";
    const token = data.token?.trim() || "";
    if (!customerId) return { error: "Missing customerId" };
    if (!token) return { error: "Missing token" };

    const deleted = await deleteOverlayDb(customerId, token);
    if (!deleted) {
      return { error: "Overlay not found or could not be deleted." };
    }
    return { success: true, token };
  });

export const getOverlay = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { token?: string })
  .handler(async ({ data }) => {
    const token = data.token?.trim() || "";
    if (!token) return { error: "Missing token" };
    const overlay = await getOverlayDb(token);
    if (!overlay) return { error: "Overlay not found" };
    return { overlay };
  });
