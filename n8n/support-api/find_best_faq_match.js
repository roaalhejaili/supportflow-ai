// Decides how to handle the request:
//   faq      = one FAQ clearly answers a single-topic question (no AI needed)
//   ai       = related FAQs exist but the match is unclear, or the message asks
//              several things, so Gemini answers from those FAQs only
//   escalate = no FAQ fits, or the topic needs a person
const form = $('Validate Request').first().json;
const name = String(form['Customer Name'] || '').trim();
const email = String(form['Customer Email'] || '').trim();
const message = String(form['Support Message'] || '').trim();
const text = message.toLowerCase().replace(/[’`]/g, "'");

const faqs = $input.all().map(i => i.json).filter(r => r && r.Question && r.Answer);

// Topics that always go to a person. General questions about the refund
// policy are answered from the FAQ; actual refund requests still go to a person.
const sensitive = /refund|charged|double charge|chargeback|billing dispute|fraud|hacked|stolen|lawyer|legal|complain|unacceptable|speak to (a )?(human|person|manager)|real person|delete my account/;
const refundPolicyQuestion = /\brefund (policy|rules)\b|\bhow (do|does) refunds? work\b|\bhow long (do|does|will) (a )?refunds? take\b|\brefundable\b/.test(text);
const personalIssue = /charged|double charge|chargeback|billing dispute|fraud|hacked|stolen|lawyer|legal|complain|unacceptable|speak to|real person|delete my account|\b(want|need|request|get|give me) (a |my )?refund\b/.test(text);
const needsPerson = sensitive.test(text) && !(refundPolicyQuestion && !personalIssue);

// Whole-word matching with a light plural stem, so "fee" no longer matches
// "coffee" and "guests" matches "guest".
const stem = w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
const tokens = s => (String(s || '').toLowerCase().replace(/[’`]/g, "'").match(/[a-z0-9]+/g) || []).map(stem);
const msgTokens = tokens(text);
const msgPadded = ' ' + msgTokens.join(' ') + ' ';
const hasPhrase = phrase => {
  const t = tokens(phrase);
  return t.length > 0 && msgPadded.includes(' ' + t.join(' ') + ' ');
};

const stop = new Set(['the','and','for','are','does','can','you','your','what','how','with','have','this','that','please','hello','thanks','thank','there','about','when','where','which','would','could','will','want','need','know','whether','also','but','just','some','any','our','not','was','did','get','tell','like','into','from','then','than','its','it\'s','i\'m','hey','yes']);
const msgWords = new Set(msgTokens.filter(w => w.length > 2 && !stop.has(w)));

// Score each FAQ: +3 per keyword phrase in the message, +1 per shared content word
const scored = faqs.map(f => {
  let score = 0;
  let keywordHits = 0;
  const keywords = String(f.Keywords || '').split(',').map(k => k.trim()).filter(Boolean);
  for (const k of keywords) { if (hasPhrase(k)) { score += 3; keywordHits++; } }
  const qWords = new Set(tokens(String(f.Question) + ' ' + String(f.Category || '')));
  for (const w of msgWords) { if (qWords.has(w)) score += 1; }
  return { faq: f, score, keywordHits };
}).filter(s => s.score >= 2).sort((a, b) => b.score - a.score);

// A message that asks several things can't be answered by a single FAQ row
const questionMarks = (message.match(/\?/g) || []).length;
const multiPart = questionMarks > 1 || /\b(also|as well|another question|in addition|plus)\b|\band (can|do|does|is|are|how|what|where|when|will|could|would|if|whether)\b/.test(text);

const best = scored[0];
const second = scored[1];
// Reliable = the only FAQ with a keyword hit, and clearly better than the runner-up.
// When keywords from two FAQs appear (e.g. "book a table for 8 people"), both
// answers matter, so Gemini combines them instead.
const keywordMatches = scored.filter(s => s.keywordHits > 0).length;
const reliable = !!best && best.keywordHits > 0 && best.score >= 3 && keywordMatches === 1 && (!second || best.score >= second.score + 2);

const base = {
  timestamp: $now.toFormat('yyyy-MM-dd HH:mm:ss'),
  customer_name: name,
  customer_email: email,
  original_message: message,
  escalation_reply: 'Thank you' + (name ? ', ' + name : '') + '. We have received your request and our support team will reply to you by email.',
};
const escalate = (reason, priority) => ({ ...base, route: 'escalate', intent: 'Escalation', customer_reply: base.escalation_reply, category: 'General Inquiry', priority, requires_human: true, knowledge_source: 'None', action_taken: 'Escalated to support team: ' + reason, resolution_status: 'Pending - Human Follow-up' });

const askAi = top => {
  const excerpts = top.map(s => '[' + s.faq.ID + '] Q: ' + s.faq.Question + ' A: ' + s.faq.Answer).join('\n');
  return {
    ...base,
    route: 'ai',
    candidate_ids: top.map(s => s.faq.ID).join(', '),
    gemini_request: {
      systemInstruction: { parts: [{ text: 'You are a customer support assistant. Use ONLY facts from the FAQ excerpts. The customer may ask several things: answer every part the excerpts clearly cover, in 1-4 friendly sentences in the language of the question. Never invent prices, policies, hours, features, languages or account details. Set fully_answered to false if any part of the message is not clearly covered by the excerpts, and do not guess at that part. Set can_answer to false and reply to an empty string if no part is covered, or if the customer asks for a refund for themselves, or the message involves billing disputes, account access problems, complaints or legal topics.' }] },
      contents: [{ role: 'user', parts: [{ text: 'Question: ' + message + '\nFAQ excerpts:\n' + excerpts }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            can_answer: { type: 'BOOLEAN' },
            fully_answered: { type: 'BOOLEAN' },
            reply: { type: 'STRING' },
            category: { type: 'STRING', enum: ['Billing', 'Technical Support', 'Account Issues', 'Reservations', 'General Inquiry'] },
            priority: { type: 'STRING', enum: ['High', 'Medium', 'Low'] },
          },
          required: ['can_answer', 'fully_answered', 'reply', 'category', 'priority'],
        },
      },
    },
  };
};

let result;
if (faqs.length === 0) {
  result = escalate('knowledge base unavailable', 'Medium');
} else if (needsPerson) {
  result = escalate('sensitive topic', 'High');
} else if (multiPart && scored.length > 0) {
  result = askAi(scored.slice(0, 4));
} else if (reliable) {
  result = { ...base, route: 'faq', intent: 'FAQ', customer_reply: String(best.faq.Answer), category: String(best.faq.Category || 'General Inquiry'), priority: 'Low', requires_human: false, knowledge_source: String(best.faq.ID || 'Knowledge Base'), action_taken: 'Answered directly from knowledge base', resolution_status: 'Resolved' };
} else if (scored.length > 0) {
  result = askAi(scored.slice(0, 3));
} else {
  result = escalate('no matching FAQ', 'Medium');
}
return [{ json: result }];
