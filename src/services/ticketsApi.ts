import { SAMPLE_TICKETS } from "@/data/sampleTickets";
import type { Ticket } from "@/types/support";

// TODO: Wire to a secure backend read API (server function with admin auth)
// that reads tickets from the n8n Google Sheets log or a database.
export async function fetchTickets(): Promise<Ticket[]> {
  await new Promise((r) => setTimeout(r, 600));
  return SAMPLE_TICKETS;
}

export const IS_DEMO_TICKET_DATA = true;
