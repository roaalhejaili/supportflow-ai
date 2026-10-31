import { USE_MOCK_API } from "./config";
import { mockReservationRequest } from "./mockReservationsApi";
import { reservationsProxy } from "./reservations-proxy.functions";
import {
  availabilityResponseSchema,
  ReservationApiError,
  reservationResponseSchema,
  type Reservation,
  type ReservationRequest,
  type Slot,
} from "@/types/reservations";

async function call(req: ReservationRequest): Promise<unknown> {
  let result;
  try {
    result = USE_MOCK_API ? await mockReservationRequest(req) : await reservationsProxy({ data: req });
  } catch {
    throw new ReservationApiError("We couldn't reach reservations. Check your connection and try again.", "network");
  }
  if (!result.ok) throw new ReservationApiError(result.message, result.code, result.details ?? [], result.alternatives ?? []);
  return result.data;
}

function parseReservation(data: unknown): { reservation: Reservation; message: string } {
  const parsed = reservationResponseSchema.safeParse(data);
  if (!parsed.success) throw new ReservationApiError("Received an unexpected reply. Please try again.", "invalid_response");
  return { reservation: parsed.data.reservation, message: parsed.data.message ?? "" };
}

export async function getAvailability(guests: number, date?: string): Promise<Slot[]> {
  const parsed = availabilityResponseSchema.safeParse(await call({ action: "availability", guests, ...(date && { date }) }));
  if (!parsed.success) throw new ReservationApiError("Received an unexpected reply. Please try again.", "invalid_response");
  return parsed.data.slots;
}

export const createReservation = async (req: { customer_name: string; customer_email: string; date: string; time: string; guests: number }) =>
  parseReservation(await call({ action: "create", ...req }));

export const lookupReservation = async (reservation_id: string, customer_email: string) =>
  parseReservation(await call({ action: "lookup", reservation_id, customer_email }));

export const cancelReservation = async (reservation_id: string, customer_email: string) =>
  parseReservation(await call({ action: "cancel", reservation_id, customer_email }));

export const modifyReservation = async (req: { reservation_id: string; customer_email: string; date: string; time: string; guests: number }) =>
  parseReservation(await call({ action: "modify", ...req }));
