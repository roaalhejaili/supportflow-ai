import { USE_MOCK_API } from "./config";
import { mockSubmitSupportMessage } from "./mockSupportApi";
import { supportProxy } from "./support-proxy.functions";
import {
  SupportApiError,
  supportRequestSchema,
  supportResponseSchema,
  type SupportRequest,
  type SupportResponse,
} from "@/types/support";

export async function submitSupportMessage(req: SupportRequest): Promise<SupportResponse> {
  const input = supportRequestSchema.safeParse(req);
  if (!input.success) {
    throw new SupportApiError(input.error.issues[0]?.message ?? "Invalid input", "validation");
  }

  let raw: unknown;
  try {
    if (USE_MOCK_API) {
      raw = await mockSubmitSupportMessage(input.data);
    } else {
      const result = await supportProxy({ data: input.data });
      if (!result.ok) throw new SupportApiError(result.error, result.code);
      raw = result.data;
    }
  } catch (e) {
    if (e instanceof SupportApiError) throw e;
    throw new SupportApiError("We couldn't reach support. Check your connection and try again.", "network");
  }

  const parsed = supportResponseSchema.safeParse(raw);
  if (!parsed.success) throw new SupportApiError("Received an unexpected reply. Please try again.", "invalid_response");
  return parsed.data;
}
