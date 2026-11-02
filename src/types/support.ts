import { z } from "zod";

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export const RESOLUTION_STATUSES = ["resolved", "escalated", "pending"] as const;

export type Priority = (typeof PRIORITIES)[number];
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

export const supportRequestSchema = z.object({
  customer_name: z.string().trim().min(1, "Name is required").max(100),
  customer_email: z.string().trim().email("Enter a valid email").max(255),
  original_message: z.string().trim().min(1, "Message is required").max(4000),
});
export type SupportRequest = z.infer<typeof supportRequestSchema>;

export const supportResponseSchema = z.object({
  customer_reply: z.string(),
  category: z.string(),
  priority: z.enum(PRIORITIES),
  requires_human: z.boolean(),
  resolution_status: z.enum(RESOLUTION_STATUSES),
  // Extra fields returned by the n8n API workflow (absent in mock responses).
  ticket_id: z.string().nullable().optional(),
  ticket_logged: z.boolean().optional(),
  escalation_notified: z.boolean().optional(),
  warnings: z.array(z.string()).optional(),
});
export type SupportResponse = z.infer<typeof supportResponseSchema>;

export interface Ticket extends SupportRequest, SupportResponse {
  id: string;
  created_at: string;
  updated_at: string;
}

export class SupportApiError extends Error {
  constructor(
    message: string,
    public code: "network" | "timeout" | "invalid_response" | "not_configured" | "server" | "validation" | "human_check" | "rate_limited",
  ) {
    super(message);
    this.name = "SupportApiError";
  }
}
