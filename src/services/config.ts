/**
 * Single switch for both the support chat and reservations:
 *   mock (default) = demo responses in the browser, no backend needed
 *   VITE_USE_MOCK_API=false = real n8n workflows via the secure server-side proxies
 */
export const USE_MOCK_API = import.meta.env["VITE_USE_MOCK_API"] !== "false";
