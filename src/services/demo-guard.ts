import { getCookie, getRequestHeader, setCookie } from "@tanstack/react-start/server";

/**
 * Optional protection for the public live demo, used only inside server functions.
 * Active only when TURNSTILE_SECRET_KEY is set; local development and the private
 * setup behave exactly as before.
 *
 * - A visitor passes one Cloudflare Turnstile check and gets a signed, HttpOnly cookie
 *   valid for 2 hours, so they are not challenged on every message.
 * - A per-visitor rate limit caps support messages and reservation calls. It is kept in
 *   memory, so it is best-effort per server instance (Turnstile is the main gate).
 */
const COOKIE = "sf_human";
const SESSION_MS = 2 * 60 * 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000;
const LIMITS = { support: 15, reservations: 60 } as const;
const hits = new Map<string, number[]>();

export type GuardFailure = { status: number; code: "human_check" | "rate_limited"; message: string };

const turnstileSecret = () => process.env["TURNSTILE_SECRET_KEY"];

function clientIp(): string {
  const forwarded = getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim();
  return getRequestHeader("cf-connecting-ip") ?? forwarded ?? "local";
}

async function sign(value: string): Promise<string> {
  // Signed with the server-side secrets, so the cookie can't be forged by the browser.
  const keyMaterial = new TextEncoder().encode(`${turnstileSecret() ?? ""}:${process.env["N8N_WEBHOOK_SECRET"] ?? ""}`);
  const key = await crypto.subtle.importKey("raw", keyMaterial, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Verifies a Turnstile token and, if valid, starts a 2-hour human session. */
export async function startHumanSession(token: string): Promise<boolean> {
  const secret = turnstileSecret();
  if (!secret) return true;
  const body = new URLSearchParams({ secret, response: token, remoteip: clientIp() });
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const result = (await res.json()) as { success?: boolean };
    if (!result.success) return false;
  } catch {
    return false;
  }
  const expires = String(Date.now() + SESSION_MS);
  setCookie(COOKIE, `${expires}.${await sign(expires)}`, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
  return true;
}

async function hasHumanSession(): Promise<boolean> {
  const [expires, mac] = (getCookie(COOKIE) ?? "").split(".");
  if (!expires || !mac || Number(expires) < Date.now()) return false;
  return mac === (await sign(expires));
}

/** Returns a failure to send back to the browser, or null when the request may proceed. */
export async function checkDemoGuard(kind: keyof typeof LIMITS): Promise<GuardFailure | null> {
  if (!turnstileSecret()) return null;
  if (!(await hasHumanSession())) {
    return { status: 403, code: "human_check", message: "Please complete the quick check at the top of the page first." };
  }
  const now = Date.now();
  const bucket = `${kind}:${clientIp()}`;
  const recent = (hits.get(bucket) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMITS[kind]) {
    return { status: 429, code: "rate_limited", message: "You've reached the demo limit. Please try again in a few minutes." };
  }
  recent.push(now);
  hits.set(bucket, recent);
  return null;
}
