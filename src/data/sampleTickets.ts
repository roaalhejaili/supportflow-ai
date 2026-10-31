import type { Priority, ResolutionStatus, Ticket } from "@/types/support";

const NAMES = [
  "Amelia Hart", "Omar Haddad", "Sofia Rossi", "Liam Chen", "Noor Al-Rashid", "Ethan Brooks",
  "Yuki Tanaka", "Isabella Cruz", "Mateo García", "Hannah Müller", "Arjun Patel", "Chloe Martin",
  "Lucas Silva", "Fatima Zahra", "Grace Kim", "Daniel Okafor", "Maya Levi", "Jonas Berg",
  "Priya Nair", "Oliver Smith", "Layla Hassan", "Ben Carter", "Elena Petrova", "Ravi Kumar",
  "Zoe Williams", "Kenji Sato", "Aisha Bello", "Tom Fischer", "Sara Johansson", "Leo Dubois",
];

const TEMPLATES: Record<string, { msg: string; reply: string }[]> = {
  Billing: [
    { msg: "I was charged twice for my subscription this month.", reply: "Sorry about that! The second charge is a pending authorization and will drop off within 3–5 business days." },
    { msg: "Can I get an invoice with my company VAT number?", reply: "Absolutely — add your VAT number under Billing → Details and all future invoices will include it." },
  ],
  Account: [
    { msg: "How do I reset my password?", reply: "Click “Forgot password” on the sign-in page and we'll email you a secure reset link." },
    { msg: "I can't log in after enabling 2FA.", reply: "Use one of your backup codes to sign in, then re-sync your authenticator app in Security settings." },
  ],
  Shipping: [
    { msg: "Where is my order? It's been a week.", reply: "Your order shipped on Monday; the tracking link shows it's out for delivery today." },
    { msg: "Can I change my delivery address?", reply: "Yes, as long as the order hasn't shipped. I've sent you a link to update the address." },
  ],
  Technical: [
    { msg: "The dashboard keeps crashing on Safari.", reply: "Please clear your cache and update Safari to the latest version. Our team is also investigating." },
    { msg: "API returns 500 errors since this morning.", reply: "We're seeing elevated errors on one region and engineers are on it. I'll update you shortly." },
  ],
  Refunds: [
    { msg: "I want a refund, this is unacceptable.", reply: "I understand your frustration. I've escalated this to our refunds team who will contact you today." },
    { msg: "How long do refunds take to process?", reply: "Refunds are issued within 24 hours and typically appear on your statement in 5–10 business days." },
  ],
  General: [
    { msg: "Do you offer discounts for nonprofits?", reply: "We do! Nonprofits get 30% off — reply with your registration details and we'll set it up." },
    { msg: "What are your support hours?", reply: "Our AI assistant is available 24/7 and our human team is online Mon–Fri, 8am–8pm." },
  ],
};

const CATS = Object.keys(TEMPLATES);
const PRIORITIES: Priority[] = ["low", "medium", "high", "urgent"];

// Deterministic pseudo-random so SSR and client agree.
let seed = 42;
const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

const NOW = new Date("2026-10-31T09:00:00Z").getTime();

// Indexes below are always in range; this keeps noUncheckedIndexedAccess satisfied.
function pick<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`sampleTickets: index ${index} out of range`);
  return item;
}

export const SAMPLE_TICKETS: Ticket[] = NAMES.map((name, i) => {
  const category = pick(CATS, Math.floor(rand() * CATS.length));
  const t = pick(TEMPLATES[category] ?? [], Math.floor(rand() * 2));
  const priority = pick(PRIORITIES, Math.floor(rand() * 4));
  const r = rand();
  const resolution_status: ResolutionStatus =
    priority === "urgent" || r < 0.2 ? "escalated" : r < 0.35 ? "pending" : "resolved";
  const created = NOW - Math.floor(rand() * 14 * 86400000);
  return {
    id: `TCK-${(1042 + i).toString()}`,
    customer_name: name,
    customer_email: `${pick(name.toLowerCase().split(" "), 0).replace(/[^a-z]/g, "")}@example.com`,
    original_message: t.msg,
    customer_reply: t.reply,
    category,
    priority,
    requires_human: resolution_status === "escalated",
    resolution_status,
    created_at: new Date(created).toISOString(),
    updated_at: new Date(created + Math.floor(rand() * 3600000)).toISOString(),
  };
}).sort((a, b) => b.created_at.localeCompare(a.created_at));

export const DEMO_NOW = NOW;
