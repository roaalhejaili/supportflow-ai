import { useEffect, useRef, useState, type ReactNode } from "react";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { HUMAN_CHECK_EVENT, PUBLIC_DEMO, TURNSTILE_SITE_KEY } from "@/services/config";
import { verifyHuman } from "@/services/human-check.functions";

// Public live demo only (VITE_PUBLIC_DEMO / VITE_TURNSTILE_SITE_KEY). Without those settings
// both components render nothing extra, so local development and the Pages demo are unchanged.

const STORAGE_KEY = "supportflow-human-check";

type TurnstileApi = {
  render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; "error-callback"?: () => void }) => string;
  reset: (id?: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | undefined;
function loadTurnstile(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile failed to load"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function DemoBanner() {
  if (!PUBLIC_DEMO) return null;
  return (
    <div className="border-b border-warning/30 bg-warning-soft">
      <p className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 text-xs text-warning sm:px-6 sm:text-sm">
        <TriangleAlert className="size-4 shrink-0" />
        Live demo with fictional policies – please don't enter real personal information. No emails are sent.
      </p>
    </div>
  );
}

/** Shows a one-time Cloudflare Turnstile check before the page content when a site key is set. */
export function HumanGate({ children }: { children: ReactNode }) {
  const [verified, setVerified] = useState(false);
  const [checked, setChecked] = useState(!TURNSTILE_SITE_KEY);
  const [error, setError] = useState("");
  const widget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    try {
      setVerified(sessionStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Storage unavailable: the visitor just completes the check again.
    }
    setChecked(true);
    const expired = () => {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      setVerified(false);
    };
    window.addEventListener(HUMAN_CHECK_EVENT, expired);
    return () => window.removeEventListener(HUMAN_CHECK_EVENT, expired);
  }, []);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || verified || !checked || !widget.current) return;
    let widgetId: string | undefined;
    loadTurnstile()
      .then(() => {
        if (!widget.current || !window.turnstile) return;
        widgetId = window.turnstile.render(widget.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: async (token) => {
            setError("");
            const result = await verifyHuman({ data: { token } }).catch(() => ({ ok: false }));
            if (result.ok) {
              try {
                sessionStorage.setItem(STORAGE_KEY, "1");
              } catch {
                // ignore
              }
              setVerified(true);
            } else {
              setError("The check didn't go through. Please try again.");
              window.turnstile?.reset(widgetId);
            }
          },
          "error-callback": () => setError("The check couldn't load. Please refresh the page."),
        });
      })
      .catch(() => setError("The check couldn't load. Please refresh the page."));
  }, [verified, checked]);

  if (!TURNSTILE_SITE_KEY || verified) return <>{children}</>;
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-elegant">
        <ShieldCheck className="size-6" />
      </span>
      <h1 className="text-2xl font-bold tracking-tight">Quick check before the live demo</h1>
      <p className="text-sm text-muted-foreground">
        This demo talks to a real AI backend, so we make sure you're not a bot. It only takes a second.
      </p>
      <div ref={widget} className="min-h-[65px]" />
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
