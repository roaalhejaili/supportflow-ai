import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookingForm } from "@/components/reservations/BookingForm";
import { ManageBooking } from "@/components/reservations/ManageBooking";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Book a Table — SupportFlow AI" },
      { name: "description", content: "Check availability, book a table and manage your reservation." },
      { property: "og:title", content: "Book a Table — SupportFlow AI" },
      { property: "og:description", content: "Live availability, instant confirmation with a reservation ID." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: BookPage,
});

function BookPage() {
  return (
    <main className="bg-gradient-surface">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:py-12">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
            <CalendarCheck className="size-3.5" /> Reservations
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">Book a table</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Pick a date and time, and get an instant confirmation with your reservation ID. Demo policy: 1–6 guests, up to 30 days ahead.
          </p>
        </div>
        <Tabs defaultValue="book">
          <TabsList className="rounded-xl">
            <TabsTrigger value="book" className="rounded-lg">Book a table</TabsTrigger>
            <TabsTrigger value="manage" className="rounded-lg">Manage booking</TabsTrigger>
          </TabsList>
          <TabsContent value="book" className="mt-5">
            <BookingForm />
          </TabsContent>
          <TabsContent value="manage" className="mt-5">
            <ManageBooking />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
