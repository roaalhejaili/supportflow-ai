"""Builds the n8n Workflow SDK code for both workflows from the Code node sources.

    python n8n/build.py           # public build: safe placeholders -> workflow.ts (committed)
    python n8n/build.py --local   # your values from .env -> workflow.local.ts (git-ignored)
    python n8n/build.py --public  # public live-demo copies -> workflow.public.ts (git-ignored)

The --public variant is for an internet-facing demo: its own webhook paths and key, demo
copies of the Google Sheets, and escalations are logged but never emailed.

Paste the output into n8n's MCP/SDK tooling (validate_workflow / create_workflow_from_code)
to recreate a workflow. Instance-specific values (Sheet IDs, credential IDs, the support
inbox and the API key hash) never go into the committed files; see PLACEHOLDERS below.
"""
import hashlib
import json
import os
import sys
from pathlib import Path

here = Path(__file__).parent
public = "--public" in sys.argv
local = "--local" in sys.argv or public

# Token in the templates -> (environment variable, public placeholder)
PLACEHOLDERS = {
    "__KB_SHEET_ID__": ("N8N_KB_SHEET_ID", "YOUR_KNOWLEDGE_BASE_SHEET_ID"),
    "__TICKETS_SHEET_ID__": ("N8N_TICKETS_SHEET_ID", "YOUR_TICKETS_SHEET_ID"),
    "__SHEETS_CREDENTIAL_ID__": ("N8N_SHEETS_CREDENTIAL_ID", "YOUR_GOOGLE_SHEETS_CREDENTIAL_ID"),
    "__GEMINI_CREDENTIAL_ID__": ("N8N_GEMINI_CREDENTIAL_ID", "YOUR_GEMINI_CREDENTIAL_ID"),
    "__GMAIL_CREDENTIAL_ID__": ("N8N_GMAIL_CREDENTIAL_ID", "YOUR_GMAIL_CREDENTIAL_ID"),
    "__SUPPORT_EMAIL__": ("SUPPORT_TEAM_EMAIL", "support-team@example.com"),
    "__KEY_SHA256__": ("N8N_KEY_SHA256", "REPLACE_WITH_SHA256_OF_N8N_WEBHOOK_SECRET"),
}


def load_dotenv(path: Path) -> dict:
    values = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip()
    return values


values = {token: placeholder for token, (_, placeholder) in PLACEHOLDERS.items()}
if local:
    env = {**load_dotenv(here.parent / ".env"), **os.environ}
    # Only the hash of the shared key is ever written, never the key itself.
    if not env.get("N8N_KEY_SHA256") and env.get("N8N_WEBHOOK_SECRET"):
        env["N8N_KEY_SHA256"] = hashlib.sha256(env["N8N_WEBHOOK_SECRET"].encode()).hexdigest()
    if public:
        # Separate key and demo sheets; no Gmail is used by the public copy.
        public_key = env.get("N8N_PUBLIC_WEBHOOK_SECRET", "")
        env["N8N_KEY_SHA256"] = hashlib.sha256(public_key.encode()).hexdigest() if public_key else ""
        env["N8N_KB_SHEET_ID"] = env.get("N8N_DEMO_KB_SHEET_ID") or "PENDING_DEMO_KB_SHEET_ID"
        env["N8N_TICKETS_SHEET_ID"] = env.get("N8N_DEMO_TICKETS_SHEET_ID") or "PENDING_DEMO_TICKETS_SHEET_ID"
        env["N8N_GMAIL_CREDENTIAL_ID"] = "NOT_USED_IN_PUBLIC_DEMO"
        env["SUPPORT_TEAM_EMAIL"] = "not-used@example.com"
    missing = [var for var, _ in PLACEHOLDERS.values() if not env.get(var)]
    if missing:
        sys.exit("Missing in .env or environment: " + ", ".join(missing))
    values = {token: env[var] for token, (var, _) in PLACEHOLDERS.items()}


NO_EMAIL_NOTE = "in the full app our support team would reply by email (this public demo does not send emails)."
# Explicit, checked changes for the public variant: (file, old text, new text).
PUBLIC_PATCHES = [
    ("support-api/workflow.template.ts", "path: 'supportflow-ai-api',", "path: 'supportflow-ai-api-public',"),
    ("support-api/workflow.template.ts", ".onTrue(notifyTeam.to(buildResponse))", ".onTrue(buildResponse)"),
    ("support-api/workflow.template.ts", "workflow('supportflow-ai-api', 'SupportFlow AI - API')",
     "workflow('supportflow-ai-api-public', 'SupportFlow AI - API (public demo)')"),
    ("reservations-api/workflow.template.ts", "path: 'supportflow-reservations',", "path: 'supportflow-reservations-public',"),
    ("reservations-api/workflow.template.ts", "workflow('supportflow-reservations', 'SupportFlow AI - Reservations API')",
     "workflow('supportflow-reservations-public', 'SupportFlow AI - Reservations API (public demo)')"),
    # Demo copies of the spreadsheets: select the Tickets tab by name so it survives "Make a copy".
    ("support-api/workflow.template.ts",
     "documentId: { __rl: true, mode: 'list', value: '__KB_SHEET_ID__', cachedResultName: 'SupportFlow AI Knowledge Base', cachedResultUrl: 'https://docs.google.com/spreadsheets/d/__KB_SHEET_ID__/edit?usp=drivesdk' },",
     "documentId: { __rl: true, mode: 'list', value: '__KB_SHEET_ID__', cachedResultName: 'SupportFlow AI Knowledge Base (demo copy)' },"),
    ("support-api/workflow.template.ts",
     "documentId: { __rl: true, mode: 'list', value: '__TICKETS_SHEET_ID__', cachedResultName: 'SupportFlow_AI_Tickets', cachedResultUrl: 'https://docs.google.com/spreadsheets/d/__TICKETS_SHEET_ID__/edit?usp=drivesdk' },",
     "documentId: { __rl: true, mode: 'list', value: '__TICKETS_SHEET_ID__', cachedResultName: 'SupportFlow_AI_Tickets (demo copy)' },"),
    ("support-api/workflow.template.ts",
     "sheetName: { __rl: true, mode: 'list', value: 285209571, cachedResultName: 'Tickets', cachedResultUrl: 'https://docs.google.com/spreadsheets/d/__TICKETS_SHEET_ID__/edit#gid=285209571' },",
     "sheetName: { __rl: true, mode: 'name', value: 'Tickets' },"),
    ("reservations-api/workflow.template.ts",
     "cachedResultName: 'SupportFlow AI Knowledge Base' };", "cachedResultName: 'SupportFlow AI Knowledge Base (demo copy)' };"),
    ("support-api/find_best_faq_match.js", "our support team will reply to you by email.", NO_EMAIL_NOTE),
    ("support-api/finalize_answer.js", "our support team will reply to you by email.", NO_EMAIL_NOTE),
    ("support-api/build_response.js",
     "  // The customer is told the team will reply by email, so that must be true.\n"
     "  if (!escalationNotified) {\n"
     "    throw new Error('Support team notification was not sent' + (ticketLogged ? ' (ticket was logged)' : ' and ticket was not logged'));\n"
     "  }\n",
     "  // Public demo: escalations are logged in the demo sheet but never emailed.\n"),
    ("support-api/build_response.js", "if (!ticketLogged) warnings.push('ticket_not_logged');\n",
     "if (!ticketLogged) warnings.push('ticket_not_logged');\nif (t.requires_human) warnings.push('public_demo_no_email');\n"),
]


def read(path: str) -> str:
    text = (here / path).read_text(encoding="utf-8")
    if public:
        for file, old, new in PUBLIC_PATCHES:
            if file == path:
                if text.count(old) != 1:
                    sys.exit(f"Public patch did not apply exactly once in {path}: {old[:60]!r}")
                text = text.replace(old, new)
    return text


def fill(text: str) -> str:
    for token, value in values.items():
        text = text.replace(token, value)
    return text


def js(folder: str, name: str) -> str:
    return json.dumps(fill(read(f"{folder}/{name}" if folder != "." else name)))


check_key = js(".", "check_api_key.js")


def schema(columns):
    return json.dumps([{"id": c, "displayName": c, "required": False, "defaultMatch": False, "display": True,
                        "type": "string", "canBeUsedToMatch": True} for c in columns])


# --- Support API -------------------------------------------------------------
F = '$("Finalize Answer").item.json'
email = (
    "<h2>Support request needs a reply</h2><p><b>Time:</b> {{ F.timestamp }}<br>"
    "<b>Customer:</b> {{ F.customer_name }} ({{ F.customer_email }})<br>"
    "<b>Category:</b> {{ F.category }}<br><b>Priority:</b> {{ F.priority }}<br>"
    "<b>Why escalated:</b> {{ F.action_taken }}<br><b>FAQs checked:</b> {{ F.knowledge_source }}</p>"
    "<h3>Customer message</h3><p>{{ F.original_message }}</p>"
    "<h3>What the customer was told</h3><p>{{ F.customer_reply }}</p>"
    "<p><i>Please reply to the customer by email.</i></p>"
).replace("F.", F + ".")

err_body = (
    "{{ JSON.stringify($json.valid === false && Array.isArray($json.errors)"
    " ? { success: false, error: { code: 'invalid_request', message: 'Please check your details and try again.', details: $json.errors } }"
    " : { success: false, error: { code: 'processing_failed', message: 'Sorry, we could not process your request right now. Please try again in a few minutes.' } }) }}"
)

ticket_columns = ["Timestamp", "Customer Name", "Customer Email", "Original Message", "Category", "Priority",
                  "Suggested Response", "Requires Human", "Intent", "Knowledge Source", "Action Taken", "Resolution Status"]

out_name = "workflow.public.ts" if public else "workflow.local.ts" if local else "workflow.ts"

support = (fill(read("support-api/workflow.template.ts"))
           .replace("__CHECKKEY__", check_key)
           .replace("__VALIDATE__", js("support-api", "validate_request.js"))
           .replace("__FIND__", js("support-api", "find_best_faq_match.js"))
           .replace("__FINALIZE__", js("support-api", "finalize_answer.js"))
           .replace("__BUILD__", js("support-api", "build_response.js"))
           .replace("__SCHEMA__", schema(ticket_columns))
           .replace("__EMAIL__", json.dumps(email))
           .replace("__ERRBODY__", json.dumps(err_body)))
(here / "support-api" / out_name).write_text(support, encoding="utf-8")

# --- Reservations API ----------------------------------------------------------
reservation_columns = ["Reservation ID", "Customer Name", "Customer Email", "Date", "Time", "Number of Guests", "Status"]
reservations = (fill(read("reservations-api/workflow.template.ts"))
                .replace("__CHECKKEY__", check_key)
                .replace("__SCHEMA__", schema(reservation_columns))
                .replace("__VALIDATE__", js("reservations-api", "validate_request.js"))
                .replace("__DECIDE__", js("reservations-api", "decide.js"))
                .replace("__CONFIRM__", js("reservations-api", "confirm_saved.js"))
                .replace("__ERROR__", js("reservations-api", "build_error.js")))
(here / "reservations-api" / out_name).write_text(reservations, encoding="utf-8")

print(f"Wrote support-api/{out_name} and reservations-api/{out_name}" + ("" if local else " (placeholders)"))
