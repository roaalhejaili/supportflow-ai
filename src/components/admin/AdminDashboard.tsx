import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, Clock, Database, Inbox, Search, X } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CategoryBadge, PriorityBadge, StatusBadge } from "@/components/StatusBadges";
import { TicketSheet } from "./TicketSheet";
import { fetchTickets, IS_DEMO_TICKET_DATA } from "@/services/ticketsApi";
import { DEMO_NOW } from "@/data/sampleTickets";
import type { Ticket } from "@/types/support";

export function AdminDashboard() {
  const { data: tickets, isLoading } = useQuery({ queryKey: ["tickets"], queryFn: fetchTickets });
  const [banner, setBanner] = useState(IS_DEMO_TICKET_DATA);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [selected, setSelected] = useState<Ticket | null>(null);

  const list = useMemo(() => tickets ?? [], [tickets]);
  const stats = useMemo(() => {
    const resolved = list.filter((t) => t.resolution_status === "resolved").length;
    const escalated = list.filter((t) => t.resolution_status === "escalated").length;
    return { total: list.length, resolved, escalated };
  }, [list]);

  const daily = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const d = subDays(new Date(DEMO_NOW), 13 - i);
        const key = format(d, "yyyy-MM-dd");
        const day = list.filter((t) => t.created_at.slice(0, 10) === key);
        return {
          day: format(d, "MMM d"),
          tickets: day.length,
          resolved: day.filter((t) => t.resolution_status === "resolved").length,
        };
      }),
    [list],
  );
  const byCategory = useMemo(() => {
    const m: Record<string, number> = {};
    list.forEach((t) => (m[t.category] = (m[t.category] ?? 0) + 1));
    return Object.entries(m).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
  }, [list]);

  const filtered = list.filter((t) => {
    const s = q.toLowerCase();
    return (
      (status === "all" || t.resolution_status === status) &&
      (priority === "all" || t.priority === priority) &&
      (!s || [t.id, t.customer_name, t.customer_email, t.category, t.original_message].some((v) => v.toLowerCase().includes(s)))
    );
  });

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:py-10">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Support overview</h1>
        <p className="mt-1 text-muted-foreground">Last 14 days of AI-handled conversations.</p>
      </div>

      {banner && (
        <div className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-accent px-4 py-3 text-sm text-accent-foreground">
          <Database className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">
            <span className="font-semibold">Demo data</span> — connect a secure backend read API to show live tickets.
          </p>
          <button onClick={() => setBanner(false)} aria-label="Dismiss" className="rounded-full p-1 hover:bg-card">
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi loading={isLoading} icon={Inbox} label="Total tickets" value={stats.total} trend={12.4} />
        <Kpi loading={isLoading} icon={CheckCircle2} label="Resolved" value={stats.resolved} trend={8.1} />
        <Kpi loading={isLoading} icon={AlertTriangle} label="Escalated" value={stats.escalated} trend={-4.3} goodWhenDown />
        <Kpi loading={isLoading} icon={Clock} label="Avg. response time" value="1.8s" trend={-11.2} goodWhenDown />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Tickets over time" className="lg:col-span-2">
          {isLoading ? <Skeleton className="h-64 w-full rounded-xl" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={daily} margin={{ left: -20, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }} />
                <Area type="monotone" dataKey="tickets" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#g1)" />
                <Area type="monotone" dataKey="resolved" stroke="var(--chart-2)" strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title="By category">
          {isLoading ? <Skeleton className="h-64 w-full rounded-xl" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byCategory} layout="vertical" margin={{ left: 8, right: 8 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="category" tickLine={false} axisLine={false} fontSize={12} width={80} stroke="var(--muted-foreground)" />
                <Tooltip cursor={{ fill: "var(--accent)" }} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)" }} />
                <Bar dataKey="count" fill="var(--chart-1)" radius={[0, 8, 8, 0]} barSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center">
          <h2 className="font-semibold md:mr-auto">Tickets</h2>
          <div className="relative md:w-64">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tickets…" className="rounded-xl pl-9" />
          </div>
          <div className="grid grid-cols-2 gap-3 md:flex">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="rounded-xl md:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger className="rounded-xl md:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Ticket ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="hidden lg:table-cell">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : filtered.map((t) => (
                  <TableRow key={t.id} onClick={() => setSelected(t)} className="cursor-pointer hover:bg-accent/50">
                    <TableCell className="pl-4 font-mono text-xs font-medium">{t.id}</TableCell>
                    <TableCell>
                      <p className="font-medium">{t.customer_name}</p>
                      <p className="text-xs text-muted-foreground">{t.customer_email}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell"><CategoryBadge category={t.category} /></TableCell>
                    <TableCell><PriorityBadge priority={t.priority} /></TableCell>
                    <TableCell className="hidden sm:table-cell"><StatusBadge status={t.resolution_status} /></TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{format(new Date(t.created_at), "MMM d, h:mm a")}</TableCell>
                  </TableRow>
                ))}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">No tickets match your filters.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <TicketSheet ticket={selected} onClose={() => setSelected(null)} />
    </main>
  );
}

function Panel({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-5 shadow-soft ${className ?? ""}`}>
      <h2 className="mb-4 font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, trend, goodWhenDown, loading }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: number | string; trend: number; goodWhenDown?: boolean; loading: boolean;
}) {
  const good = goodWhenDown ? trend < 0 : trend > 0;
  const Arrow = trend > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="grid size-9 place-items-center rounded-xl bg-accent text-primary"><Icon className="size-4" /></span>
      </div>
      {loading ? <Skeleton className="mt-3 h-8 w-20" /> : <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>}
      <p className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${good ? "text-success" : "text-destructive"}`}>
        <Arrow className="size-3.5" /> {Math.abs(trend)}% <span className="text-muted-foreground">vs last period</span>
      </p>
    </div>
  );
}
