// Combines the FAQ decision with Gemini's answer (when Gemini was used).
// If Gemini failed, timed out, or was not confident, the request is escalated.
// If Gemini answered only part of the message, the customer gets that part and
// the rest is escalated.
const { gemini_request, ...ticket } = $('Find Best FAQ Match').first().json;
if (ticket.route !== 'ai') return [{ json: ticket }];

let ai = null;
try { ai = JSON.parse($input.first().json.candidates[0].content.parts[0].text); } catch (e) { ai = null; }

const reply = ai ? String(ai.reply || '').trim() : '';
if (ai && ai.can_answer === true && reply) {
  if (ai.fully_answered !== false) {
    return [{ json: { ...ticket, intent: 'AI Answer', customer_reply: reply, category: ai.category || 'General Inquiry', priority: ai.priority || 'Low', requires_human: false, knowledge_source: 'AI using ' + ticket.candidate_ids, action_taken: 'Answered by AI from knowledge base', resolution_status: 'Resolved' } }];
  }
  return [{ json: { ...ticket, intent: 'AI Partial Answer', customer_reply: reply + ' For the rest of your question, our support team will reply to you by email.', category: ai.category || 'General Inquiry', priority: 'Medium', requires_human: true, knowledge_source: 'AI using ' + ticket.candidate_ids + ' (partial)', action_taken: 'AI answered part of the request - rest escalated to support team', resolution_status: 'Pending - Human Follow-up' } }];
}
return [{ json: { ...ticket, intent: 'Escalation', customer_reply: ticket.escalation_reply, category: (ai && ai.category) || 'General Inquiry', priority: (ai && ai.priority) || 'Medium', requires_human: true, knowledge_source: 'No reliable answer (checked ' + ticket.candidate_ids + ')', action_taken: ai ? 'AI not confident - escalated to support team' : 'AI unavailable - escalated to support team', resolution_status: 'Pending - Human Follow-up' } }];
