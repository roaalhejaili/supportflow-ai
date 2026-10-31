import { format } from "date-fns";
import { Bot, Mail, User } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CategoryBadge, PriorityBadge, StatusBadge } from "@/components/StatusBadges";
import type { Ticket } from "@/types/support";

export function TicketSheet({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
  return (
    <Sheet open={!!ticket} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {ticket && (
          <>
            <SheetHeader>
              <SheetDescription className="font-mono text-xs">{ticket.id}</SheetDescription>
              <SheetTitle className="text-xl">{ticket.customer_name}</SheetTitle>
              <a href={`mailto:${ticket.customer_email}`} className="inline-flex items-center gap-1.5 text-sm text-primary">
                <Mail className="size-3.5" /> {ticket.customer_email}
              </a>
            </SheetHeader>
            <div className="space-y-6 px-4 pb-6">
              <div className="flex flex-wrap gap-2">
                <CategoryBadge category={ticket.category} />
                <PriorityBadge priority={ticket.priority} />
                <StatusBadge status={ticket.resolution_status} />
              </div>
              <Section icon={User} title="Original message">
                <p className="rounded-xl bg-muted p-3.5 text-sm">{ticket.original_message}</p>
              </Section>
              <Section icon={Bot} title="AI reply">
                <p className="rounded-xl bg-accent p-3.5 text-sm text-accent-foreground">{ticket.customer_reply}</p>
              </Section>
              <dl className="grid grid-cols-2 gap-4 rounded-xl border border-border p-4 text-sm">
                <Item label="Requires human" value={ticket.requires_human ? "Yes" : "No"} />
                <Item label="Status" value={ticket.resolution_status} />
                <Item label="Created" value={format(new Date(ticket.created_at), "MMM d, yyyy h:mm a")} />
                <Item label="Updated" value={format(new Date(ticket.updated_at), "MMM d, yyyy h:mm a")} />
              </dl>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" /> {title}
      </h3>
      {children}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium capitalize">{value}</dd>
    </div>
  );
}
