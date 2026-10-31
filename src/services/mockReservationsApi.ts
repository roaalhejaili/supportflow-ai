import { addDays, differenceInHours, format, parseISO } from "date-fns";
import { MAX_GUESTS, type Reservation, type ReservationRequest, type Slot } from "@/types/reservations";

// In-browser stand-in for the n8n Reservations API, following the same rules:
// 1-6 guests, no double booking, capacity per slot, 24-hour change/cancel cutoff.
// Data lives in memory for the current page session only.
const TIMES = ["18:00", "19:00", "20:00"];
const CAPACITY = 6;
const DAYS = 14;

type MockSlot = { date: string; time: string; offline: number };
type MockError = { status: number; code: string; message: string; details?: string[]; alternatives?: Slot[] };
export type MockResult = { ok: true; data: unknown } | ({ ok: false } & MockError);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const today = new Date();
const slots: MockSlot[] = Array.from({ length: DAYS }, (_, d) => format(addDays(today, d + 1), "yyyy-MM-dd")).flatMap((date, d) =>
  TIMES.map((time, t) => ({ date, time, offline: (d * 3 + t) % 7 === 2 ? CAPACITY : (d + t) % 4 })),
);
const reservations = new Map<string, Reservation>();

const start = (date: string, time: string) => parseISO(`${date}T${time}`);
const active = (r: Reservation) => r.status === "Confirmed";
const remaining = (s: MockSlot, excludeId?: string) =>
  Math.max(
    CAPACITY - s.offline -
      [...reservations.values()].filter((r) => active(r) && r.reservation_id !== excludeId && r.date === s.date && r.time === s.time).reduce((n, r) => n + r.guests, 0),
    0,
  );
const list = (date: string | undefined, guests: number, excludeId?: string): Slot[] =>
  slots
    .filter((s) => (!date || s.date === date) && start(s.date, s.time) > new Date())
    .map((s) => ({ date: s.date, time: s.time, remaining: remaining(s, excludeId), available: remaining(s, excludeId) >= guests }));
const fail = (status: number, code: string, message: string, extra: Partial<MockError> = {}): MockResult => ({ ok: false, status, code, message, ...extra });

function slotProblem(date: string, time: string, guests: number, excludeId?: string): MockResult | null {
  const slot = slots.find((s) => s.date === date && s.time === time);
  const alternatives = list(date, guests, excludeId).filter((s) => s.available && s.time !== time);
  if (!slot) return fail(409, "slot_not_offered", `We don't take reservations on ${date} at ${time}.`, { alternatives });
  const left = remaining(slot, excludeId);
  if (left < guests) {
    const message = left === 0 ? `Sorry, ${date} at ${time} is fully booked.` : `Sorry, only ${left} seat${left === 1 ? "" : "s"} left on ${date} at ${time}.`;
    return fail(409, "slot_unavailable", message, { alternatives });
  }
  return null;
}

export async function mockReservationRequest(req: ReservationRequest): Promise<MockResult> {
  await sleep(500 + Math.random() * 500);
  const email = req.customer_email?.toLowerCase() ?? "";
  const guests = req.guests ?? 1;
  if (req.guests !== undefined && (req.guests < 1 || req.guests > MAX_GUESTS)) {
    return fail(400, "invalid_request", "Please check your booking details.", { details: ["online reservations are for 1 to 6 guests"] });
  }
  const owned = () => {
    const r = reservations.get((req.reservation_id ?? "").toUpperCase());
    return r && r.customer_email === email ? r : null;
  };
  const tooLate = (r: Reservation) => differenceInHours(start(r.date, r.time), new Date()) < 24;

  switch (req.action) {
    case "availability":
      return { ok: true, data: { success: true, slots: list(req.date, guests) } };

    case "create": {
      const { date = "", time = "", customer_name = "" } = req;
      const dup = [...reservations.values()].find((r) => active(r) && r.customer_email === email && r.date === date && r.time === time);
      if (dup) return fail(409, "duplicate_booking", `You already have a reservation on ${date} at ${time} (${dup.reservation_id}). We didn't create a second one.`);
      const problem = slotProblem(date, time, guests);
      if (problem) return problem;
      const id = `RES-${date.replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "0")}`;
      const reservation: Reservation = { reservation_id: id, customer_name, customer_email: email, date, time, guests, status: "Confirmed" };
      reservations.set(id, reservation);
      return { ok: true, data: { success: true, reservation, message: `Your reservation is confirmed. Reservation ID: ${id}.` } };
    }

    case "lookup": {
      const r = owned();
      return r ? { ok: true, data: { success: true, reservation: r } } : fail(404, "not_found", "We couldn't find a reservation with that ID and email.");
    }

    case "cancel": {
      const r = owned();
      if (!r) return fail(404, "not_found", "We couldn't find a reservation with that ID and email.");
      if (!active(r)) return fail(409, "already_cancelled", `Reservation ${r.reservation_id} is already cancelled.`);
      if (tooLate(r)) return fail(409, "too_late", "Online cancellations are possible up to 24 hours before the booking. Please contact support.");
      const updated = { ...r, status: "Cancelled" };
      reservations.set(r.reservation_id, updated);
      return { ok: true, data: { success: true, reservation: updated, message: `Reservation ${r.reservation_id} has been cancelled.` } };
    }

    case "modify": {
      const r = owned();
      if (!r) return fail(404, "not_found", "We couldn't find a reservation with that ID and email.");
      if (!active(r)) return fail(409, "not_active", `Reservation ${r.reservation_id} can't be changed online.`);
      if (tooLate(r)) return fail(409, "too_late", "Online changes are possible up to 24 hours before the booking. Please contact support.");
      const { date = "", time = "" } = req;
      if (r.date === date && r.time === time && r.guests === guests) return fail(400, "no_change", "The new details are the same as your current reservation.");
      const problem = slotProblem(date, time, guests, r.reservation_id);
      if (problem) return problem;
      const updated = { ...r, date, time, guests };
      reservations.set(r.reservation_id, updated);
      return { ok: true, data: { success: true, reservation: updated, message: `Reservation ${r.reservation_id} has been updated.` } };
    }
  }
}
