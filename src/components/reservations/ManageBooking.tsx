import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Detail } from "./BookingForm";
import { prettyDate } from "@/lib/dates";
import { DatePicker, GuestsSelect, TimeSlots } from "./SlotPickers";
import { cancelReservation, getAvailability, lookupReservation, modifyReservation } from "@/services/reservationsApi";
import { ReservationApiError, type Reservation } from "@/types/reservations";
import { cn } from "@/lib/utils";

type Mode = "view" | "edit" | "confirm-cancel";

export function ManageBooking() {
  const queryClient = useQueryClient();
  const [id, setId] = useState("");
  const [email, setEmail] = useState("");
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: () => Promise<{ reservation: Reservation; message: string }>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await action();
      setReservation(res.reservation);
      setNotice(res.message || null);
      setMode("view");
      queryClient.invalidateQueries({ queryKey: ["availability"] });
    } catch (e) {
      setError(e instanceof ReservationApiError ? [e.message, ...e.details].join(" ") : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const lookup = (e: React.FormEvent) => {
    e.preventDefault();
    setReservation(null);
    run(() => lookupReservation(id.trim(), email.trim()));
  };

  const active = reservation?.status === "Confirmed";

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <form onSubmit={lookup} className="space-y-4 self-start rounded-2xl border border-border bg-card p-5 shadow-soft">
        <h2 className="font-semibold">Find your booking</h2>
        <div className="space-y-1.5">
          <Label htmlFor="res-id">Reservation ID</Label>
          <Input id="res-id" value={id} placeholder="RES-20261102-AB12" onChange={(e) => setId(e.target.value)} className="rounded-xl font-mono uppercase" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="res-email">Email used for the booking</Label>
          <Input id="res-email" type="email" value={email} placeholder="jane@company.com" onChange={(e) => setEmail(e.target.value)} className="rounded-xl" />
        </div>
        <Button type="submit" disabled={busy || !id.trim() || !email.trim()} className="w-full rounded-xl">
          {busy && !reservation ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Look up booking
        </Button>
      </form>

      <div className="space-y-4">
        {error && (
          <div role="alert" className="flex gap-2.5 rounded-xl border border-destructive/20 bg-danger-soft p-3.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
          </div>
        )}
        {notice && (
          <div className="flex gap-2.5 rounded-xl bg-success-soft p-3.5 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {notice}
          </div>
        )}

        {!reservation && !error && (
          <div className="grid h-full min-h-48 place-items-center rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Enter your reservation ID and email to view, change or cancel your booking.
          </div>
        )}

        {reservation && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-lg font-bold">{reservation.reservation_id}</span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", active ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>
                {reservation.status}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Detail label="Date" value={prettyDate(reservation.date)} />
              <Detail label="Time" value={reservation.time} />
              <Detail label="Guests" value={String(reservation.guests)} />
              <Detail label="Name" value={reservation.customer_name} />
            </dl>

            {active && mode === "view" && (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="outline" className="rounded-xl" onClick={() => setMode("edit")}>Change booking</Button>
                <Button variant="outline" className="rounded-xl text-destructive hover:text-destructive" onClick={() => setMode("confirm-cancel")}>Cancel reservation</Button>
              </div>
            )}

            {mode === "confirm-cancel" && (
              <div className="mt-5 rounded-xl border border-destructive/20 bg-danger-soft p-4 text-sm">
                <p className="font-medium text-destructive">Cancel this reservation? This can't be undone.</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="destructive" className="rounded-xl" disabled={busy} onClick={() => run(() => cancelReservation(reservation.reservation_id, email.trim()))}>
                    {busy && <Loader2 className="size-4 animate-spin" />} Yes, cancel it
                  </Button>
                  <Button variant="ghost" className="rounded-xl" disabled={busy} onClick={() => setMode("view")}>Keep it</Button>
                </div>
              </div>
            )}

            {mode === "edit" && (
              <EditBooking
                reservation={reservation}
                busy={busy}
                onCancel={() => setMode("view")}
                onSave={(change) => run(() => modifyReservation({ reservation_id: reservation.reservation_id, customer_email: email.trim(), ...change }))}
              />
            )}

            {active && <p className="mt-4 text-xs text-muted-foreground">Online changes and cancellations are possible up to 24 hours before the booking.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function EditBooking({ reservation, busy, onCancel, onSave }: {
  reservation: Reservation;
  busy: boolean;
  onCancel: () => void;
  onSave: (change: { date: string; time: string; guests: number }) => void;
}) {
  const [guests, setGuests] = useState(reservation.guests);
  const [date, setDate] = useState<string | undefined>(reservation.date);
  const [time, setTime] = useState<string | undefined>(reservation.time);
  const availability = useQuery({ queryKey: ["availability", guests], queryFn: () => getAvailability(guests) });
  // Seats held by this booking are free for itself when it stays in the same slot.
  const slots = (availability.data ?? []).map((s) =>
    s.date === reservation.date && s.time === reservation.time
      ? { ...s, remaining: s.remaining + reservation.guests, available: s.remaining + reservation.guests >= guests }
      : s,
  );
  const daySlots = slots.filter((s) => s.date === date);

  return (
    <div className="mt-5 space-y-4 rounded-xl border border-border p-4">
      <p className="text-sm font-semibold">New details</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="edit-guests">Guests</Label>
          <GuestsSelect id="edit-guests" value={guests} onChange={setGuests} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-date">Date</Label>
          <DatePicker id="edit-date" slots={slots} value={date} onChange={(d) => { setDate(d); setTime(undefined); }} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Time</Label>
        <TimeSlots slots={daySlots} value={time} onChange={setTime} loading={availability.isLoading} />
      </div>
      <div className="flex gap-2">
        <Button className="rounded-xl" disabled={busy || !date || !time} onClick={() => date && time && onSave({ date, time, guests })}>
          {busy && <Loader2 className="size-4 animate-spin" />} Save changes
        </Button>
        <Button variant="ghost" className="rounded-xl" disabled={busy} onClick={onCancel}>Back</Button>
      </div>
    </div>
  );
}
