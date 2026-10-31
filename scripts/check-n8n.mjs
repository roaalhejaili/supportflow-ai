// Connectivity check for both n8n webhooks. Makes no writes and sends no emails:
//   1. a wrong key must be rejected (401 from the Check API Key node)
//   2. an invalid support request must return 400 invalid_request JSON
//      (stops at validation, before any ticket is logged)
//   3. a reservations availability request must return 200 JSON (read-only)
// Reads .env via `node --env-file`; the secret is never printed.
//
//   npm run check:n8n

const supportUrl = process.env.N8N_WEBHOOK_URL;
const reservationsUrl = process.env.N8N_RESERVATIONS_URL;
const secret = process.env.N8N_WEBHOOK_SECRET;

const missing = ["N8N_WEBHOOK_URL", "N8N_RESERVATIONS_URL", "N8N_WEBHOOK_SECRET"].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing in .env: ${missing.join(", ")}`);
  process.exit(1);
}

async function post(url, key, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-SupportFlow-Key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON: callers fall back to the raw text.
  }
  return { status: res.status, json, text };
}

let failures = 0;
function check(name, ok, info) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${info}`);
  if (!ok) failures++;
}

for (const [label, url] of [["support", supportUrl], ["reservations", reservationsUrl]]) {
  const r = await post(url, "wrong-key-for-testing", { action: "availability" });
  const hint = r.status === 404 ? " (webhook not registered: is the workflow published?)" : "";
  check(`${label}: wrong key rejected`, r.status === 401 || r.status === 403, `[${r.status}]${hint}`);
}

const s = await post(supportUrl, secret, { customer_name: "", customer_email: "not-an-email", original_message: "" });
check(
  "support: invalid request -> 400 JSON",
  s.status === 400 && s.json?.error?.code === "invalid_request",
  `[${s.status}] ${s.json ? JSON.stringify(s.json.error?.details ?? s.json) : s.text.slice(0, 120)}`,
);

const a = await post(reservationsUrl, secret, { action: "availability", guests: 2 });
const slots = Array.isArray(a.json?.slots) ? a.json.slots : null;
check(
  "reservations: availability -> 200 JSON",
  a.status === 200 && a.json?.success === true && slots !== null,
  `[${a.status}] ${slots ? `${slots.length} slots, ${slots.filter((x) => x.available).length} bookable for 2` : a.text.slice(0, 120)}`,
);

process.exit(failures ? 1 : 0);
