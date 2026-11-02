import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { startHumanSession } from "./demo-guard";

/** Exchanges a Cloudflare Turnstile token for a short human session (public demo only). */
export const verifyHuman = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(1).max(2048) }).parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean }> => ({ ok: await startHumanSession(data.token) }));
