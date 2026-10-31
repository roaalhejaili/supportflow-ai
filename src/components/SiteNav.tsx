import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { USE_MOCK_API } from "@/services/config";

export function SiteNav() {
  const linkCls =
    "rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:px-4";
  const activeProps = { className: "bg-background text-foreground shadow-soft" };
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-elegant">
            <Sparkles className="size-4.5" />
          </span>
          <span className="hidden text-lg font-bold tracking-tight sm:inline">
            SupportFlow <span className="text-primary">AI</span>
          </span>
          {USE_MOCK_API && (
            <span title="Using demo responses. Set VITE_USE_MOCK_API=false to use the n8n backend." className="whitespace-nowrap rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">
              Demo mode
            </span>
          )}
        </Link>
        <nav className="flex items-center gap-1 rounded-full bg-muted p-1">
          <Link to="/" className={linkCls} activeOptions={{ exact: true }} activeProps={activeProps}>
            Support
          </Link>
          <Link to="/book" className={linkCls} activeProps={activeProps}>
            Book
          </Link>
          <Link to="/admin" className={linkCls} activeProps={activeProps}>
            Admin
          </Link>
        </nav>
      </div>
    </header>
  );
}
