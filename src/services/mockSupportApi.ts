import type { Priority, SupportRequest, SupportResponse } from "@/types/support";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const RULES: { words: string[]; category: string; priority: Priority; reply: string }[] = [
  {
    words: ["charged", "refund", "invoice", "billing", "payment", "twice"],
    category: "Billing",
    priority: "high",
    reply:
      "I'm sorry about the billing trouble. I've checked our records and duplicate charges are usually pending authorizations that drop off within 3–5 business days. If it's still there after that, reply here and we'll issue a refund right away.",
  },
  {
    words: ["password", "login", "log in", "account", "sign in", "2fa"],
    category: "Account",
    priority: "medium",
    reply:
      "No problem! Head to the sign-in page and click “Forgot password”. We'll email you a secure reset link that's valid for 30 minutes. Check your spam folder if it doesn't arrive within a couple of minutes.",
  },
  {
    words: ["order", "shipping", "delivery", "package", "tracking"],
    category: "Shipping",
    priority: "medium",
    reply:
      "Thanks for reaching out! Orders usually ship within 1–2 business days. You'll find your tracking link in the confirmation email, or under Account → Orders. Most deliveries arrive within 5 business days.",
  },
  {
    words: ["error", "bug", "crash", "not working", "broken", "slow"],
    category: "Technical",
    priority: "high",
    reply:
      "Sorry you're running into that. Please try clearing your browser cache and signing in again. If the issue persists, tell me which device and browser you're on and I'll dig deeper.",
  },
];

const ESCALATE = ["angry", "lawyer", "urgent", "cancel", "furious", "unacceptable", "sue"];

export async function mockSubmitSupportMessage(req: SupportRequest): Promise<SupportResponse> {
  await sleep(1000 + Math.random() * 1000);
  const text = req.original_message.toLowerCase();
  const rule = RULES.find((r) => r.words.some((w) => text.includes(w)));
  const escalate = ESCALATE.some((w) => text.includes(w));
  const firstName = req.customer_name.split(" ")[0];

  if (escalate) {
    return {
      customer_reply: `I completely understand, ${firstName}, and I'm sorry for the frustration. I've flagged this as a priority and passed it to a specialist on our team who can take care of it personally.`,
      category: rule?.category ?? "General",
      priority: "urgent",
      requires_human: true,
      resolution_status: "escalated",
    };
  }
  if (rule) {
    return { customer_reply: rule.reply, category: rule.category, priority: rule.priority, requires_human: false, resolution_status: "resolved" };
  }
  return {
    customer_reply: `Thanks, ${firstName}! I want to make sure you get the right answer, so I've logged your question and a teammate will review it. In the meantime, is there anything else I can help with?`,
    category: "General",
    priority: "low",
    requires_human: false,
    resolution_status: "pending",
  };
}
