import { createServerFn } from "@tanstack/react-start";
import { reservationErrorSchema, reservationRequestSchema } from "@/types/reservations";
import { checkDemoGuard } from "./demo-guard";

// Server function results must be serializable; the client validates the shape with zod.
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type ReservationProxyResult =
  | { ok: true; data: Json }
  | {
      ok: false;
      status: number;
      code: string;
      message: string;
      details?: string[];
      alternatives?: { date: string; time: string; remaining: number; available: boolean }[];
    };

const TIMEOUT_MS = 30_000;
const UNAVAILABLE = "Reservations are temporarily unavailable. Please try again in a moment.";

/**
 * reservations-proxy: forwards a reservation action to the n8n "SupportFlow AI -
 * Reservations API" webhook. The URL and secret live only in server-side env vars;
 * the secret is sent in the X-SupportFlow-Key header that n8n checks (Check API Key node).
 */
export const reservationsProxy = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => reservationRequestSchema.parse(input))
  .handler(async ({ data }): Promise<ReservationProxyResult> => {
    const blocked = await checkDemoGuard("reservations");
    if (blocked) return { ok: false, status: blocked.status, code: blocked.code, message: blocked.message };

    const url = process.env["N8N_RESERVATIONS_URL"];
    const secret = process.env["N8N_WEBHOOK_SECRET"];
    if (!url || !secret) {
      return { ok: false, status: 503, code: "not_configured", message: "Reservations backend is not configured yet." };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-SupportFlow-Key": secret },
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      const text = await res.text();
      let json: Json = null;
      try {
        json = JSON.parse(text) as Json;
      } catch {
        json = null;
      }
      if (res.ok) return { ok: true, data: json };

      // Business errors (invalid input, slot unavailable, duplicate, not found, too late,
      // booking not saved) carry a friendly message from n8n: pass them through.
      const parsed = reservationErrorSchema.safeParse(json);
      if (parsed.success && res.status !== 401 && res.status !== 403) {
        const { code, message, details, alternatives } = parsed.data.error;
        return { ok: false, status: res.status, code, message, ...(details && { details }), ...(alternatives && { alternatives }) };
      }
      if (res.status === 401 || res.status === 403) console.error(`n8n reservations webhook rejected the X-SupportFlow-Key header [${res.status}]`);
      else console.error(`n8n reservations webhook failed [${res.status}]: ${text.slice(0, 500)}`);
      return { ok: false, status: 502, code: "server", message: UNAVAILABLE };
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return { ok: false, status: aborted ? 504 : 502, code: aborted ? "timeout" : "server", message: UNAVAILABLE };
    } finally {
      clearTimeout(timer);
    }
  });
