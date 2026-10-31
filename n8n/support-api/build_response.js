// Builds the JSON returned to the caller. Only reports what actually happened:
// ticket_logged is true only if the sheet append succeeded, and an escalation
// is only reported as successful if Gmail accepted the team notification.
const t = $('Finalize Answer').first().json;

const saved = $('Save Ticket to Sheet').first().json || {};
const ticketLogged = !saved.error && Object.keys(saved).length > 0;

let escalationNotified = false;
if (t.requires_human) {
  try {
    const sent = $('Notify Support Team').first().json || {};
    escalationNotified = !sent.error && !!sent.id;
  } catch (e) {
    escalationNotified = false;
  }
  // The customer is told the team will reply by email, so that must be true.
  if (!escalationNotified) {
    throw new Error('Support team notification was not sent' + (ticketLogged ? ' (ticket was logged)' : ' and ticket was not logged'));
  }
}

const warnings = [];
if (!ticketLogged) warnings.push('ticket_not_logged');

return [{ json: {
  success: true,
  customer_reply: t.customer_reply,
  category: t.category,
  priority: String(t.priority || 'Medium').toLowerCase(),
  requires_human: t.requires_human === true,
  resolution_status: t.requires_human ? 'escalated' : 'resolved',
  // The Tickets sheet has no ticket ID column, so no ID is available to return.
  ticket_id: null,
  ticket_logged: ticketLogged,
  escalation_notified: escalationNotified,
  warnings,
} }];
