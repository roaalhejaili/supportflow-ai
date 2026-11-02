/**
 * Single switch for both the support chat and reservations:
 *   mock (default) = demo responses in the browser, no backend needed
 *   VITE_USE_MOCK_API=false = real n8n workflows via the secure server-side proxies
 */
export const USE_MOCK_API = import.meta.env["VITE_USE_MOCK_API"] !== "false";

/** Public live demo only: show the demo banner and require a Cloudflare Turnstile check. */
export const PUBLIC_DEMO = import.meta.env["VITE_PUBLIC_DEMO"] === "true";
export const TURNSTILE_SITE_KEY: string = import.meta.env["VITE_TURNSTILE_SITE_KEY"] ?? "";
/** Fired when the server asks for a new bot check (e.g. the 2-hour session expired). */
export const HUMAN_CHECK_EVENT = "supportflow:human-check";
