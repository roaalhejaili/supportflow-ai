import { z } from "zod";

export const MAX_GUESTS = 6;
export const BOOKING_WINDOW_DAYS = 30;

export const RESERVATION_ACTIONS = ["availability", "create", "lookup", "modify", "cancel"] as const;
export type ReservationAction = (typeof RESERVATION_ACTIONS)[number];

// What the browser may send to the reservations proxy. n8n validates again.
export const reservationRequestSchema = z.object({
  action: z.enum(RESERVATION_ACTIONS),
  customer_name: z.string().trim().min(1).max(100).optional(),
  customer_email: z.string().trim().email().max(254).optional(),
  reservation_id: z.string().trim().max(20).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  guests: z.number().int().min(1).max(MAX_GUESTS).optional(),
});
export type ReservationRequest = z.infer<typeof reservationRequestSchema>;

export const slotSchema = z.object({
  date: z.string(),
  time: z.string(),
  remaining: z.number(),
  available: z.boolean(),
});
export type Slot = z.infer<typeof slotSchema>;

export const reservationSchema = z.object({
  reservation_id: z.string(),
  customer_name: z.string(),
  customer_email: z.string(),
  date: z.string(),
  time: z.string(),
  guests: z.number(),
  status: z.string(),
});
export type Reservation = z.infer<typeof reservationSchema>;

export const availabilityResponseSchema = z.object({ success: z.literal(true), slots: z.array(slotSchema) });
export const reservationResponseSchema = z.object({
  success: z.literal(true),
  reservation: reservationSchema,
  message: z.string().optional(),
});

// Error body returned by the n8n Reservations API for 4xx responses.
export const reservationErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.string()).optional(),
    alternatives: z.array(slotSchema).optional(),
    reservation_id: z.string().optional(),
  }),
});

export class ReservationApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public details: string[] = [],
    public alternatives: Slot[] = [],
  ) {
    super(message);
    this.name = "ReservationApiError";
  }
}
