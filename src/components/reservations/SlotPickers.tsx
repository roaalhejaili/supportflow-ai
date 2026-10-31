import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { MAX_GUESTS, type Slot } from "@/types/reservations";
import { prettyDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function GuestsSelect({ value, onChange, id }: { value: number; onChange: (n: number) => void; id?: string }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger id={id} className="rounded-xl">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: MAX_GUESTS }, (_, i) => i + 1).map((n) => (
          <SelectItem key={n} value={String(n)}>
            {n} {n === 1 ? "guest" : "guests"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Date picker that only enables dates with at least one bookable slot. */
export function DatePicker({ slots, value, onChange, id }: { slots: Slot[]; value?: string | undefined; onChange: (d: string) => void; id?: string }) {
  const [open, setOpen] = useState(false);
  const bookable = useMemo(() => new Set(slots.filter((s) => s.available).map((s) => s.date)), [slots]);
  const month = value ?? slots[0]?.date;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" className={cn("w-full justify-start rounded-xl font-normal", !value && "text-muted-foreground")}>
          <CalendarDays className="size-4" />
          {value ? prettyDate(value) : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          {...(value && { selected: parseISO(value) })}
          {...(month && { defaultMonth: parseISO(month) })}
          onSelect={(d) => {
            if (!d) return;
            onChange(format(d, "yyyy-MM-dd"));
            setOpen(false);
          }}
          disabled={(d) => !bookable.has(format(d, "yyyy-MM-dd"))}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Time buttons for one date, showing seats left. */
export function TimeSlots({ slots, value, onChange, loading }: { slots: Slot[]; value?: string | undefined; onChange: (t: string) => void; loading?: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
      </div>
    );
  }
  if (slots.length === 0) return <p className="text-sm text-muted-foreground">Pick a date to see available times.</p>;
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Time">
      {slots.map((s) => (
        <button
          key={s.time}
          type="button"
          role="radio"
          aria-checked={value === s.time}
          disabled={!s.available}
          onClick={() => onChange(s.time)}
          className={cn(
            "rounded-xl border px-3 py-2 text-left transition",
            value === s.time ? "border-primary bg-accent ring-2 ring-primary/30" : "border-border bg-card hover:border-primary/50",
            !s.available && "cursor-not-allowed opacity-50 hover:border-border",
          )}
        >
          <span className="block font-semibold">{s.time}</span>
          <span className="block text-xs text-muted-foreground">{s.available ? `${s.remaining} seats left` : s.remaining === 0 ? "Fully booked" : `Only ${s.remaining} left`}</span>
        </button>
      ))}
    </div>
  );
}
