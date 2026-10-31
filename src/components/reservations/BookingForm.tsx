import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { prettyDate } from "@/lib/dates";
import { DatePicker, GuestsSelect, TimeSlots } from "./SlotPickers";
import { createReservation, getAvailability } from "@/services/reservationsApi";
import { supportRequestSchema } from "@/types/support";
import { ReservationApiError, type Reservation } from "@/types/reservations";

const nameSchema = supportRequestSchema.shape.customer_name;
const emailSchema = supportRequestSchema.shape.customer_email;

export function BookingForm() {
  const queryClient = useQueryClient();
  const [guests, setGuests] = useState(2);
  const [date, setDate] = useState<string>();
  const [time, setTime] = useState<string>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<ReservationApiError | null>(null);
  const [confirmed, setConfirmed] = useState<Reservation | null>(null);

  const availability = useQuery({ queryKey: ["availability", guests], queryFn: () => getAvailability(guests) });
  const slots = availability.data ?? [];
  const daySlots = slots.filter((s) => s.date === date);

  const nameErr = nameSchema.safeParse(name).success ? null : "Please enter your name";
  const emailErr = emailSchema.safeParse(email).success ? null : "Enter a valid email address";
  const ready = !!date && !!time && !nameErr && !emailErr;

  const book = useMutation({
    mutationFn: createReservation,
    onSuccess: ({ reservation }) => {
      setConfirmed(reservation);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
    onError: (e) => {
      setError(e instanceof ReservationApiError ? e : new ReservationApiError("Something went wrong. Please try again.", "unknown"));
      // Availability may have changed since the page loaded.
      queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });

  function changeGuests(n: number) {
    setGuests(n);
    setTime(undefined);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!ready || !date || !time) return;
    book.mutate({ customer_name: name.trim(), customer_email: email.trim(), date, time, guests });
  }

  if (confirmed) {
    return (
      <Confirmation
        reservation={confirmed}
        onAgain={() => {
          setConfirmed(null);
          setTime(undefined);
          setTouched(false);
        }}
      />
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-soft">
        <h2 className="font-semibold">1. Choose a time</h2>
        <div className="space-y-1.5">
          <Label htmlFor="guests">Number of guests</Label>
          <GuestsSelect id="guests" value={guests} onChange={changeGuests} />
          <p className="text-xs text-muted-foreground">Online bookings are for 1–6 guests. For larger groups, contact support.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date">Date</Label>
          {availability.isLoading ? (
            <div className="h-9 animate-pulse rounded-xl bg-primary/10" />
          ) : (
            <DatePicker id="date" slots={slots} value={date} onChange={(d) => { setDate(d); setTime(undefined); }} />
          )}
          {availability.isError && (
            <p className="text-xs text-destructive">
              Couldn't load availability.{" "}
              <button type="button" className="underline" onClick={() => availability.refetch()}>Try again</button>
            </p>
          )}
          {!availability.isLoading && !availability.isError && slots.every((s) => !s.available) && (
            <p className="text-xs text-muted-foreground">No dates have room for {guests} guests right now.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Time</Label>
          <TimeSlots slots={daySlots} value={time} onChange={setTime} loading={availability.isFetching && !!date} />
          {touched && !time && <p className="text-xs text-destructive">Please choose a time</p>}
        </div>
      </div>

      <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-soft">
        <h2 className="font-semibold">2. Your details</h2>
        <div className="space-y-1.5">
          <Label htmlFor="book-name">Name</Label>
          <Input id="book-name" value={name} maxLength={100} placeholder="Jane Doe" onChange={(e) => setName(e.target.value)} aria-invalid={touched && !!nameErr} className="rounded-xl" />
          {touched && nameErr && <p className="text-xs text-destructive">{nameErr}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="book-email">Email</Label>
          <Input id="book-email" type="email" value={email} maxLength={254} placeholder="jane@company.com" onChange={(e) => setEmail(e.target.value)} aria-invalid={touched && !!emailErr} className="rounded-xl" />
          {touched && emailErr && <p className="text-xs text-destructive">{emailErr}</p>}
        </div>

        {date && time && (
          <div className="rounded-xl bg-accent p-3.5 text-sm text-accent-foreground">
            <span className="font-semibold">{prettyDate(date)}</span> at <span className="font-semibold">{time}</span> · {guests} {guests === 1 ? "guest" : "guests"}
          </div>
        )}

        {error && (
          <div role="alert" className="flex gap-2.5 rounded-xl border border-destructive/20 bg-danger-soft p-3.5 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="space-y-2">
              <p className="text-destructive">{error.message}</p>
              {error.details.length > 0 && <ul className="list-disc pl-4 text-destructive">{error.details.map((d) => <li key={d}>{d}</li>)}</ul>}
              {error.alternatives.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-muted-foreground">Try instead:</span>
                  {error.alternatives.map((s) => (
                    <button key={s.date + s.time} type="button" className="rounded-full border border-primary/30 bg-card px-2.5 py-0.5 text-xs font-medium hover:bg-accent" onClick={() => { setDate(s.date); setTime(s.time); setError(null); }}>
                      {s.time}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <Button type="submit" disabled={book.isPending} className="h-11 w-full rounded-xl bg-gradient-primary shadow-elegant">
          {book.isPending ? <><Loader2 className="size-4 animate-spin" /> Saving your reservation…</> : "Confirm reservation"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">Your table is only confirmed once you see a reservation ID.</p>
      </div>
    </form>
  );
}

function Confirmation({ reservation, onAgain }: { reservation: Reservation; onAgain: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-6 text-center shadow-soft sm:p-8">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-success-soft text-success">
        <CheckCircle2 className="size-7" />
      </span>
      <h2 className="mt-4 text-2xl font-bold">You're booked!</h2>
      <p className="mt-1 text-muted-foreground">Your reservation is confirmed and saved.</p>
      <div className="mt-6 rounded-xl bg-accent p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-foreground/70">Reservation ID</p>
        <div className="mt-1 flex items-center justify-center gap-2">
          <span className="font-mono text-xl font-bold text-accent-foreground">{reservation.reservation_id}</span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Copy reservation ID"
            onClick={() => navigator.clipboard?.writeText(reservation.reservation_id).then(() => toast.success("Reservation ID copied"))}
          >
            <Copy className="size-4" />
          </Button>
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-3 text-left text-sm">
        <Detail label="Date" value={prettyDate(reservation.date)} />
        <Detail label="Time" value={reservation.time} />
        <Detail label="Guests" value={String(reservation.guests)} />
        <Detail label="Name" value={reservation.customer_name} />
      </dl>
      <p className="mt-6 text-xs text-muted-foreground">Keep this ID: you'll need it with your email to change or cancel the booking (up to 24 hours before).</p>
      <Button variant="outline" className="mt-4 rounded-xl" onClick={onAgain}>Make another booking</Button>
    </div>
  );
}

export function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
