"""Builds the n8n Workflow SDK code for both workflows from the Code node sources.

    python n8n/build.py           # public build: safe placeholders -> workflow.ts (committed)
    python n8n/build.py --local   # your values from .env -> workflow.local.ts (git-ignored)

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
local = "--local" in sys.argv

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
    missing = [var for var, _ in PLACEHOLDERS.values() if not env.get(var)]
    if missing:
        sys.exit("Missing in .env or environment: " + ", ".join(missing))
    values = {token: env[var] for token, (var, _) in PLACEHOLDERS.items()}


def fill(text: str) -> str:
    for token, value in values.items():
        text = text.replace(token, value)
    return text


def js(folder: str, name: str) -> str:
    return json.dumps(fill((here / folder / name).read_text(encoding="utf-8")))


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

out_name = "workflow.local.ts" if local else "workflow.ts"

support = (fill((here / "support-api" / "workflow.template.ts").read_text(encoding="utf-8"))
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
reservations = (fill((here / "reservations-api" / "workflow.template.ts").read_text(encoding="utf-8"))
                .replace("__CHECKKEY__", check_key)
                .replace("__SCHEMA__", schema(reservation_columns))
                .replace("__VALIDATE__", js("reservations-api", "validate_request.js"))
                .replace("__DECIDE__", js("reservations-api", "decide.js"))
                .replace("__CONFIRM__", js("reservations-api", "confirm_saved.js"))
                .replace("__ERROR__", js("reservations-api", "build_error.js")))
(here / "reservations-api" / out_name).write_text(reservations, encoding="utf-8")

print(f"Wrote support-api/{out_name} and reservations-api/{out_name}" + ("" if local else " (placeholders)"))
