import { useEffect, useRef, useState } from "react";
import { Bot, LifeBuoy, Loader2, Mail, RotateCcw, Send, ShieldCheck, Sparkles, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CategoryBadge, PriorityBadge } from "@/components/StatusBadges";
import { submitSupportMessage } from "@/services/supportApi";
import { SupportApiError, supportRequestSchema, type SupportResponse } from "@/types/support";
import { cn } from "@/lib/utils";

type Msg =
  | { id: string; role: "customer"; text: string; at: Date }
  | { id: string; role: "assistant"; text: string; at: Date; meta?: SupportResponse; email?: string }
  | { id: string; role: "error"; text: string; at: Date; retryText: string };

const SUGGESTIONS = ["How do I reset my password?", "I was charged twice", "Where is my order?"];
const STORAGE_KEY = "supportflow.details";
const emailSchema = supportRequestSchema.shape.customer_email;
const nameSchema = supportRequestSchema.shape.customer_name;

const fmt = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const uid = () => Math.random().toString(36).slice(2);

export function SupportChat() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState({ name: false, email: false });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
      if (saved) {
        setName(saved.name ?? "");
        setEmail(saved.email ?? "");
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ name, email }));
  }, [name, email]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  const nameErr = nameSchema.safeParse(name).success ? null : "Please enter your name";
  const emailErr = emailSchema.safeParse(email).success ? null : "Enter a valid email address";
  const detailsValid = !nameErr && !emailErr;
  const canSend = detailsValid && text.trim().length > 0 && !sending;

  async function send(message: string, fromRetry = false) {
    if (!detailsValid) {
      setTouched({ name: true, email: true });
      toast.error("Please add your name and a valid email first.");
      return;
    }
    const body = message.trim();
    if (!body || sending) return;
    if (!fromRetry) {
      setMessages((m) => [...m, { id: uid(), role: "customer", text: body, at: new Date() }]);
      setText("");
    } else {
      setMessages((m) => m.filter((x) => x.role !== "error"));
    }
    setSending(true);
    try {
      const res = await submitSupportMessage({ customer_name: name, customer_email: email, original_message: body });
      setMessages((m) => [
        ...m,
        { id: uid(), role: "assistant", text: res.customer_reply, at: new Date(), meta: res, email: email.trim() },
      ]);
      if (res.requires_human) toast.success("Your request was passed to our support team.");
    } catch (e) {
      const msg = e instanceof SupportApiError ? e.message : "Something went wrong. Please try again.";
      setMessages((m) => [...m, { id: uid(), role: "error", text: msg, at: new Date(), retryText: body }]);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="bg-gradient-surface">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[320px_1fr] lg:py-12">
        {/* Sidebar */}
        <aside className="space-y-6">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
              <Sparkles className="size-3.5" /> AI support, 24/7
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">How can we help today?</h1>
            <p className="mt-3 text-muted-foreground">
              Ask anything about your account, billing or orders. Our assistant answers instantly and loops in a human when needed.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <User className="size-4 text-primary" /> Your details
            </h2>
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  maxLength={100}
                  placeholder="Jane Doe"
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  aria-invalid={touched.name && !!nameErr}
                  className="rounded-xl"
                />
                {touched.name && nameErr && <p className="text-xs text-destructive">{nameErr}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  maxLength={255}
                  placeholder="jane@company.com"
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                  aria-invalid={touched.email && !!emailErr}
                  className="rounded-xl"
                />
                {touched.email && emailErr && <p className="text-xs text-destructive">{emailErr}</p>}
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5" /> Saved for this session only.
              </p>
            </div>
          </div>
        </aside>

        {/* Chat */}
        <section className="flex h-[min(78vh,760px)] min-h-[520px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <div className="relative">
              <span className="grid size-11 place-items-center rounded-full bg-gradient-primary text-primary-foreground">
                <Bot className="size-5" />
              </span>
              <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-card bg-success" />
            </div>
            <div>
              <p className="font-semibold">Flo · AI Assistant</p>
              <p className="text-xs text-muted-foreground">Typically replies instantly</p>
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto bg-muted/40 px-4 py-6 sm:px-6">
            <AssistantBubble at={null}>
              Hi there! 👋 I'm Flo, the SupportFlow assistant. Tell me what's going on and I'll do my best to sort it out.
            </AssistantBubble>

            {messages.length === 0 && (
              <div className="flex flex-wrap gap-2 pl-11">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => (detailsValid ? send(s) : (setText(s), setTouched({ name: true, email: true })))}
                    className="rounded-full border border-primary/25 bg-card px-3.5 py-1.5 text-sm font-medium text-accent-foreground transition hover:border-primary hover:bg-accent"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {messages.map((m) =>
              m.role === "customer" ? (
                <div key={m.id} className="flex flex-col items-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground shadow-elegant sm:max-w-[70%]">
                    {m.text}
                  </div>
                  <span className="mt-1 text-[11px] text-muted-foreground">{fmt(m.at)}</span>
                </div>
              ) : m.role === "assistant" ? (
                <AssistantBubble key={m.id} at={m.at} meta={m.meta}>
                  {m.text}
                  {m.meta?.requires_human && <EscalationCard email={m.email ?? email} />}
                </AssistantBubble>
              ) : (
                <div key={m.id} className="flex gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-danger-soft text-destructive">
                    <LifeBuoy className="size-4" />
                  </span>
                  <div className="rounded-2xl rounded-tl-md border border-destructive/20 bg-danger-soft px-4 py-3 text-sm">
                    <p className="text-destructive">{m.text}</p>
                    <Button size="sm" variant="outline" className="mt-2 rounded-full" onClick={() => send(m.retryText, true)} disabled={sending}>
                      <RotateCcw className="size-3.5" /> Retry
                    </Button>
                  </div>
                </div>
              ),
            )}

            {sending && (
              <div className="flex items-end gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-primary text-primary-foreground">
                  <Bot className="size-4" />
                </span>
                <div className="flex gap-1 rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3.5" aria-label="Assistant is typing">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="typing-dot size-2 rounded-full bg-primary" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="border-t border-border bg-card p-3 sm:p-4"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <div className="flex items-end gap-2 rounded-2xl border border-input bg-background p-2 focus-within:ring-2 focus-within:ring-ring/30">
              <Textarea
                value={text}
                maxLength={4000}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canSend) send(text);
                  }
                }}
                rows={1}
                placeholder={detailsValid ? "Type your message…" : "Add your name and email to start chatting"}
                className="max-h-36 min-h-10 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              <Button type="submit" disabled={!canSend} className="h-10 shrink-0 rounded-xl bg-gradient-primary px-4 shadow-elegant">
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                <span className="hidden sm:inline">Send</span>
              </Button>
            </div>
            <p className="mt-2 hidden px-1 text-[11px] text-muted-foreground sm:block">Enter to send · Shift + Enter for a new line</p>
          </form>
        </section>
      </div>
    </main>
  );
}

function AssistantBubble({ children, at, meta }: { children: React.ReactNode; at: Date | null; meta?: SupportResponse | undefined }) {
  return (
    <div className="flex gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-primary text-primary-foreground">
        <Bot className="size-4" />
      </span>
      <div className="flex max-w-[85%] flex-col sm:max-w-[75%]">
        <div className={cn("whitespace-pre-wrap rounded-2xl rounded-tl-md border border-border bg-card px-4 py-3 text-sm shadow-soft")}>
          {children}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {meta && (
            <>
              <CategoryBadge category={meta.category} />
              <PriorityBadge priority={meta.priority} />
            </>
          )}
          {at && <span className="text-[11px] text-muted-foreground">{fmt(at)}</span>}
        </div>
      </div>
    </div>
  );
}

function EscalationCard({ email }: { email: string }) {
  return (
    <div className="mt-3 flex gap-3 rounded-xl bg-accent p-3.5 text-accent-foreground">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card text-primary">
        <Mail className="size-4" />
      </span>
      <div>
        <p className="font-semibold">You're in good hands</p>
        <p className="mt-0.5 text-sm">
          A member of our support team will follow up at <span className="font-semibold">{email}</span> shortly.
        </p>
      </div>
    </div>
  );
}
