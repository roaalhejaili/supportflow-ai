import { createServerFn } from "@tanstack/react-start";
import { supportRequestSchema, supportResponseSchema, type SupportResponse } from "@/types/support";
import { checkDemoGuard } from "./demo-guard";

export type ProxyResult =
  | { ok: true; data: SupportResponse }
  | {
      ok: false;
      status: number;
      error: string;
      code: "not_configured" | "timeout" | "server" | "invalid_response" | "validation" | "human_check" | "rate_limited";
    };

// n8n may call Gemini, so allow more time than a plain FAQ lookup needs.
const TIMEOUT_MS = 45_000;
const UNAVAILABLE = "We couldn't reach support right now. Please try again in a moment.";

type N8nError = { error?: { code?: unknown; message?: unknown; details?: unknown } };

/**
 * support-proxy: forwards a support message to the n8n "SupportFlow AI - API" webhook.
 * Webhook URL and secret live only in server-side secrets; the secret is sent in the
 * X-SupportFlow-Key header that n8n checks (Check API Key node).
 */
export const supportProxy = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => supportRequestSchema.parse(input))
  .handler(async ({ data }): Promise<ProxyResult> => {
    const blocked = await checkDemoGuard("support");
    if (blocked) return { ok: false, status: blocked.status, code: blocked.code, error: blocked.message };

    const url = process.env["N8N_WEBHOOK_URL"];
    const secret = process.env["N8N_WEBHOOK_SECRET"];
    if (!url || !secret) {
      return { ok: false, status: 503, code: "not_configured", error: "Support backend is not configured yet." };
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
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (!res.ok) {
        const err = (json as N8nError | null)?.error;
        // n8n rejected the input: show its friendly message and the specific problems.
        if (res.status === 400 && err?.code === "invalid_request") {
          const details = Array.isArray(err.details) ? err.details.filter((d): d is string => typeof d === "string") : [];
          const message = typeof err.message === "string" ? err.message : "Please check your details and try again.";
          return { ok: false, status: 400, code: "validation", error: [message, ...details].join(" ") };
        }
        if (res.status === 401 || res.status === 403) {
          console.error(`n8n webhook rejected the X-SupportFlow-Key header [${res.status}]`);
        } else if (res.status === 404) {
          console.error("n8n webhook not found [404]: publish the workflow, or click Execute workflow when using the test URL");
        } else {
          console.error(`n8n webhook failed [${res.status}]: ${text.slice(0, 500)}`);
        }
        return { ok: false, status: 502, code: "server", error: UNAVAILABLE };
      }

      const body = Array.isArray(json) ? json[0] : json;
      const parsed = supportResponseSchema.safeParse(body);
      if (!parsed.success) {
        console.error("Invalid n8n response", parsed.error.flatten());
        return { ok: false, status: 502, code: "invalid_response", error: "Unexpected response from support service." };
      }
      return { ok: true, data: parsed.data };
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        status: aborted ? 504 : 502,
        code: aborted ? "timeout" : "server",
        error: aborted ? "The support service took too long to respond. Please try again." : UNAVAILABLE,
      };
    } finally {
      clearTimeout(timer);
    }
  });
