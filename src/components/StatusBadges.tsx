import { cn } from "@/lib/utils";
import type { Priority, ResolutionStatus } from "@/types/support";

const base = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize";

const PRIORITY: Record<Priority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-info-soft text-info",
  high: "bg-warning-soft text-warning",
  urgent: "bg-danger-soft text-destructive",
};
const STATUS: Record<ResolutionStatus, string> = {
  resolved: "bg-success-soft text-success",
  escalated: "bg-danger-soft text-destructive",
  pending: "bg-warning-soft text-warning",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={cn(base, PRIORITY[priority])}>{priority}</span>;
}
export function StatusBadge({ status }: { status: ResolutionStatus }) {
  return (
    <span className={cn(base, STATUS[status])}>
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
export function CategoryBadge({ category }: { category: string }) {
  return <span className={cn(base, "bg-accent text-accent-foreground")}>{category}</span>;
}
