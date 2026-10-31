import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const sheetsCred = { googleSheetsOAuth2Api: { id: 'YOUR_GOOGLE_SHEETS_CREDENTIAL_ID', name: 'Google Sheets account' } };

const apiWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Support API Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'supportflow-ai-api',
      authentication: 'none',
      responseMode: 'responseNode',
      // No ignoreBots: it rejects server-to-server calls (curl, Node, axios user agents).
      options: {}
    }
  }
});

// The key is checked here rather than with the Webhook node's Header Auth; see check_api_key.js.
const checkApiKey = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Check API Key', parameters: { jsCode: "// Checks the X-SupportFlow-Key header. Only a SHA-256 hash of the shared key is\n// stored here, so the key itself never lives in n8n or in Git.\n// (Used instead of the Webhook node's Header Auth, which rejected even matching\n// keys on this n8n instance.)\nconst crypto = require('crypto');\nconst EXPECTED_SHA256 = 'REPLACE_WITH_SHA256_OF_N8N_WEBHOOK_SECRET';\n\nconst item = $input.first().json;\nconst key = String((item.headers || {})['x-supportflow-key'] || '');\nconst actual = crypto.createHash('sha256').update(key).digest();\nconst expected = Buffer.from(EXPECTED_SHA256, 'hex');\nconst authorized = key.length > 0 && expected.length === actual.length && crypto.timingSafeEqual(actual, expected);\n\nreturn [{ json: { ...item, authorized } }];\n" } }
});

const isAuthorized = ifElse({
  version: 2.2,
  config: {
    name: 'Authorized?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ id: 'is-authorized', leftValue: expr('{{ $json.authorized }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      },
      options: {}
    }
  }
});

const respondUnauthorized = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond Unauthorized',
    parameters: {
      respondWith: 'json',
      responseBody: expr("{{ JSON.stringify({ success: false, error: { code: 'unauthorized', message: 'Missing or invalid API key.' } }) }}"),
      options: { responseCode: 401, responseHeaders: { entries: [{ name: 'Cache-Control', value: 'no-store' }] } }
    }
  }
});

const validateRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Validate Request', parameters: { jsCode: "// Checks the JSON body from the server-side caller and maps it to the\n// field names the rest of the workflow already uses.\nconst body = $input.first().json.body || {};\nconst str = v => (typeof v === 'string' ? v.trim() : '');\nconst name = str(body.customer_name);\nconst email = str(body.customer_email).toLowerCase();\nconst message = str(body.original_message);\n\nconst errors = [];\nif (!name) errors.push('customer_name is required');\nelse if (name.length > 120) errors.push('customer_name must be 120 characters or fewer');\nif (!email) errors.push('customer_email is required');\nelse if (email.length > 254 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) errors.push('customer_email must be a valid email address');\nif (!message) errors.push('original_message is required');\nelse if (message.length > 4000) errors.push('original_message must be 4000 characters or fewer');\n\nreturn [{ json: {\n  valid: errors.length === 0,\n  errors,\n  'Customer Name': name,\n  'Customer Email': email,\n  'Support Message': message,\n} }];\n" } }
});

const isValid = ifElse({
  version: 2.2,
  config: {
    name: 'Valid Request?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ id: 'is-valid', leftValue: expr('{{ $json.valid }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      },
      options: {}
    }
  }
});

const loadKb = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Load Knowledge Base',
    executeOnce: true,
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    alwaysOutputData: true,
    onError: 'continueRegularOutput',
    parameters: {
      documentId: { __rl: true, mode: 'list', value: 'YOUR_KNOWLEDGE_BASE_SHEET_ID', cachedResultName: 'SupportFlow AI Knowledge Base', cachedResultUrl: 'https://docs.google.com/spreadsheets/d/YOUR_KNOWLEDGE_BASE_SHEET_ID/edit?usp=drivesdk' },
      sheetName: { __rl: true, mode: 'name', value: 'Knowledge Base' },
      options: {}
    },
    credentials: sheetsCred
  }
});

const findMatch = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Find Best FAQ Match', onError: 'continueErrorOutput', parameters: { jsCode: "// Decides how to handle the request:\n//   faq      = one FAQ clearly answers a single-topic question (no AI needed)\n//   ai       = related FAQs exist but the match is unclear, or the message asks\n//              several things, so Gemini answers from those FAQs only\n//   escalate = no FAQ fits, or the topic needs a person\nconst form = $('Validate Request').first().json;\nconst name = String(form['Customer Name'] || '').trim();\nconst email = String(form['Customer Email'] || '').trim();\nconst message = String(form['Support Message'] || '').trim();\nconst text = message.toLowerCase().replace(/[\u2019`]/g, \"'\");\n\nconst faqs = $input.all().map(i => i.json).filter(r => r && r.Question && r.Answer);\n\n// Topics that always go to a person. General questions about the refund\n// policy are answered from the FAQ; actual refund requests still go to a person.\nconst sensitive = /refund|charged|double charge|chargeback|billing dispute|fraud|hacked|stolen|lawyer|legal|complain|unacceptable|speak to (a )?(human|person|manager)|real person|delete my account/;\nconst refundPolicyQuestion = /\\brefund (policy|rules)\\b|\\bhow (do|does) refunds? work\\b|\\bhow long (do|does|will) (a )?refunds? take\\b|\\brefundable\\b/.test(text);\nconst personalIssue = /charged|double charge|chargeback|billing dispute|fraud|hacked|stolen|lawyer|legal|complain|unacceptable|speak to|real person|delete my account|\\b(want|need|request|get|give me) (a |my )?refund\\b/.test(text);\nconst needsPerson = sensitive.test(text) && !(refundPolicyQuestion && !personalIssue);\n\n// Whole-word matching with a light plural stem, so \"fee\" no longer matches\n// \"coffee\" and \"guests\" matches \"guest\".\nconst stem = w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);\nconst tokens = s => (String(s || '').toLowerCase().replace(/[\u2019`]/g, \"'\").match(/[a-z0-9]+/g) || []).map(stem);\nconst msgTokens = tokens(text);\nconst msgPadded = ' ' + msgTokens.join(' ') + ' ';\nconst hasPhrase = phrase => {\n  const t = tokens(phrase);\n  return t.length > 0 && msgPadded.includes(' ' + t.join(' ') + ' ');\n};\n\nconst stop = new Set(['the','and','for','are','does','can','you','your','what','how','with','have','this','that','please','hello','thanks','thank','there','about','when','where','which','would','could','will','want','need','know','whether','also','but','just','some','any','our','not','was','did','get','tell','like','into','from','then','than','its','it\\'s','i\\'m','hey','yes']);\nconst msgWords = new Set(msgTokens.filter(w => w.length > 2 && !stop.has(w)));\n\n// Score each FAQ: +3 per keyword phrase in the message, +1 per shared content word\nconst scored = faqs.map(f => {\n  let score = 0;\n  let keywordHits = 0;\n  const keywords = String(f.Keywords || '').split(',').map(k => k.trim()).filter(Boolean);\n  for (const k of keywords) { if (hasPhrase(k)) { score += 3; keywordHits++; } }\n  const qWords = new Set(tokens(String(f.Question) + ' ' + String(f.Category || '')));\n  for (const w of msgWords) { if (qWords.has(w)) score += 1; }\n  return { faq: f, score, keywordHits };\n}).filter(s => s.score >= 2).sort((a, b) => b.score - a.score);\n\n// A message that asks several things can't be answered by a single FAQ row\nconst questionMarks = (message.match(/\\?/g) || []).length;\nconst multiPart = questionMarks > 1 || /\\b(also|as well|another question|in addition|plus)\\b|\\band (can|do|does|is|are|how|what|where|when|will|could|would|if|whether)\\b/.test(text);\n\nconst best = scored[0];\nconst second = scored[1];\n// Reliable = the only FAQ with a keyword hit, and clearly better than the runner-up.\n// When keywords from two FAQs appear (e.g. \"book a table for 8 people\"), both\n// answers matter, so Gemini combines them instead.\nconst keywordMatches = scored.filter(s => s.keywordHits > 0).length;\nconst reliable = !!best && best.keywordHits > 0 && best.score >= 3 && keywordMatches === 1 && (!second || best.score >= second.score + 2);\n\nconst base = {\n  timestamp: $now.toFormat('yyyy-MM-dd HH:mm:ss'),\n  customer_name: name,\n  customer_email: email,\n  original_message: message,\n  escalation_reply: 'Thank you' + (name ? ', ' + name : '') + '. We have received your request and our support team will reply to you by email.',\n};\nconst escalate = (reason, priority) => ({ ...base, route: 'escalate', intent: 'Escalation', customer_reply: base.escalation_reply, category: 'General Inquiry', priority, requires_human: true, knowledge_source: 'None', action_taken: 'Escalated to support team: ' + reason, resolution_status: 'Pending - Human Follow-up' });\n\nconst askAi = top => {\n  const excerpts = top.map(s => '[' + s.faq.ID + '] Q: ' + s.faq.Question + ' A: ' + s.faq.Answer).join('\\n');\n  return {\n    ...base,\n    route: 'ai',\n    candidate_ids: top.map(s => s.faq.ID).join(', '),\n    gemini_request: {\n      systemInstruction: { parts: [{ text: 'You are a customer support assistant. Use ONLY facts from the FAQ excerpts. The customer may ask several things: answer every part the excerpts clearly cover, in 1-4 friendly sentences in the language of the question. Never invent prices, policies, hours, features, languages or account details. Set fully_answered to false if any part of the message is not clearly covered by the excerpts, and do not guess at that part. Set can_answer to false and reply to an empty string if no part is covered, or if the customer asks for a refund for themselves, or the message involves billing disputes, account access problems, complaints or legal topics.' }] },\n      contents: [{ role: 'user', parts: [{ text: 'Question: ' + message + '\\nFAQ excerpts:\\n' + excerpts }] }],\n      generationConfig: {\n        temperature: 0.1,\n        maxOutputTokens: 1024,\n        responseMimeType: 'application/json',\n        responseSchema: {\n          type: 'OBJECT',\n          properties: {\n            can_answer: { type: 'BOOLEAN' },\n            fully_answered: { type: 'BOOLEAN' },\n            reply: { type: 'STRING' },\n            category: { type: 'STRING', enum: ['Billing', 'Technical Support', 'Account Issues', 'Reservations', 'General Inquiry'] },\n            priority: { type: 'STRING', enum: ['High', 'Medium', 'Low'] },\n          },\n          required: ['can_answer', 'fully_answered', 'reply', 'category', 'priority'],\n        },\n      },\n    },\n  };\n};\n\nlet result;\nif (faqs.length === 0) {\n  result = escalate('knowledge base unavailable', 'Medium');\n} else if (needsPerson) {\n  result = escalate('sensitive topic', 'High');\n} else if (multiPart && scored.length > 0) {\n  result = askAi(scored.slice(0, 4));\n} else if (reliable) {\n  result = { ...base, route: 'faq', intent: 'FAQ', customer_reply: String(best.faq.Answer), category: String(best.faq.Category || 'General Inquiry'), priority: 'Low', requires_human: false, knowledge_source: String(best.faq.ID || 'Knowledge Base'), action_taken: 'Answered directly from knowledge base', resolution_status: 'Resolved' };\n} else if (scored.length > 0) {\n  result = askAi(scored.slice(0, 3));\n} else {\n  result = escalate('no matching FAQ', 'Medium');\n}\nreturn [{ json: result }];\n" } }
});

const needsAi = ifElse({
  version: 2.2,
  config: {
    name: 'Needs AI?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{ id: 'route-ai', leftValue: expr('{{ $json.route }}'), rightValue: 'ai', operator: { type: 'string', operation: 'equals' } }],
        combinator: 'and'
      },
      options: {}
    }
  }
});

const askGemini = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.2,
  config: {
    name: 'Ask Gemini',
    onError: 'continueRegularOutput',
    parameters: {
      method: 'POST',
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googlePalmApi',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: expr('{{ JSON.stringify($json.gemini_request) }}'),
      options: { timeout: 30000 }
    },
    credentials: { googlePalmApi: { id: 'YOUR_GEMINI_CREDENTIAL_ID', name: 'Google Gemini(PaLM) Api account' } }
  }
});

const finalizeAnswer = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Finalize Answer', onError: 'continueErrorOutput', parameters: { jsCode: "// Combines the FAQ decision with Gemini's answer (when Gemini was used).\n// If Gemini failed, timed out, or was not confident, the request is escalated.\n// If Gemini answered only part of the message, the customer gets that part and\n// the rest is escalated.\nconst { gemini_request, ...ticket } = $('Find Best FAQ Match').first().json;\nif (ticket.route !== 'ai') return [{ json: ticket }];\n\nlet ai = null;\ntry { ai = JSON.parse($input.first().json.candidates[0].content.parts[0].text); } catch (e) { ai = null; }\n\nconst reply = ai ? String(ai.reply || '').trim() : '';\nif (ai && ai.can_answer === true && reply) {\n  if (ai.fully_answered !== false) {\n    return [{ json: { ...ticket, intent: 'AI Answer', customer_reply: reply, category: ai.category || 'General Inquiry', priority: ai.priority || 'Low', requires_human: false, knowledge_source: 'AI using ' + ticket.candidate_ids, action_taken: 'Answered by AI from knowledge base', resolution_status: 'Resolved' } }];\n  }\n  return [{ json: { ...ticket, intent: 'AI Partial Answer', customer_reply: reply + ' For the rest of your question, our support team will reply to you by email.', category: ai.category || 'General Inquiry', priority: 'Medium', requires_human: true, knowledge_source: 'AI using ' + ticket.candidate_ids + ' (partial)', action_taken: 'AI answered part of the request - rest escalated to support team', resolution_status: 'Pending - Human Follow-up' } }];\n}\nreturn [{ json: { ...ticket, intent: 'Escalation', customer_reply: ticket.escalation_reply, category: (ai && ai.category) || 'General Inquiry', priority: (ai && ai.priority) || 'Medium', requires_human: true, knowledge_source: 'No reliable answer (checked ' + ticket.candidate_ids + ')', action_taken: ai ? 'AI not confident - escalated to support team' : 'AI unavailable - escalated to support team', resolution_status: 'Pending - Human Follow-up' } }];\n" } }
});

const saveTicket = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Save Ticket to Sheet',
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 2000,
    onError: 'continueRegularOutput',
    parameters: {
      operation: 'append',
      documentId: { __rl: true, mode: 'list', value: 'YOUR_TICKETS_SHEET_ID', cachedResultName: 'SupportFlow_AI_Tickets', cachedResultUrl: 'https://docs.google.com/spreadsheets/d/YOUR_TICKETS_SHEET_ID/edit?usp=drivesdk' },
      sheetName: { __rl: true, mode: 'list', value: 285209571, cachedResultName: 'Tickets', cachedResultUrl: 'https://docs.google.com/spreadsheets/d/YOUR_TICKETS_SHEET_ID/edit#gid=285209571' },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          'Timestamp': expr('{{ $json.timestamp }}'),
          'Customer Name': expr('{{ $json.customer_name }}'),
          'Customer Email': expr('{{ $json.customer_email }}'),
          'Original Message': expr('{{ $json.original_message }}'),
          'Category': expr('{{ $json.category }}'),
          'Priority': expr('{{ $json.priority }}'),
          'Suggested Response': expr('{{ $json.customer_reply }}'),
          'Requires Human': expr('{{ $json.requires_human }}'),
          'Intent': expr('{{ $json.intent }}'),
          'Knowledge Source': expr('{{ $json.knowledge_source }}'),
          'Action Taken': expr('{{ $json.action_taken }}'),
          'Resolution Status': expr('{{ $json.resolution_status }}')
        },
        schema: [{"id": "Timestamp", "displayName": "Timestamp", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}, {"id": "Customer Name", "displayName": "Customer Name", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}, {"id": "Customer Email", "displayName": "Customer Email", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}, {"id": "Original Message", "displayName": "Original Message", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}, {"id": "Category", "displayName": "Category", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}, {"id": "Priority", "displayName": "Priority", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}, {"id": "Suggested Response", "displayName": "Suggested Response", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}, {"id": "Requires Human", "displayName": "Requires Human", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}, {"id": "Intent", "displayName": "Intent", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}, {"id": "Knowledge Source", "displayName": "Knowledge Source", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}, {"id": "Action Taken", "displayName": "Action Taken", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}, {"id": "Resolution Status", "displayName": "Resolution Status", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}]
      },
      options: {}
    },
    credentials: sheetsCred
  }
});

const needsEscalation = ifElse({
  version: 2.2,
  config: {
    name: 'Needs Escalation?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        conditions: [{ id: 'needs-human', leftValue: expr('{{ $(\'Finalize Answer\').item.json.requires_human }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
        combinator: 'and'
      },
      options: {}
    }
  }
});

const notifyTeam = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: {
    name: 'Notify Support Team',
    retryOnFail: true,
    maxTries: 2,
    onError: 'continueRegularOutput',
    parameters: {
      sendTo: "support-team@example.com",
      subject: expr('[{{ $("Finalize Answer").item.json.priority }}] Support request from {{ $("Finalize Answer").item.json.customer_name }}'),
      message: expr("<h2>Support request needs a reply</h2><p><b>Time:</b> {{ $(\"Finalize Answer\").item.json.timestamp }}<br><b>Customer:</b> {{ $(\"Finalize Answer\").item.json.customer_name }} ({{ $(\"Finalize Answer\").item.json.customer_email }})<br><b>Category:</b> {{ $(\"Finalize Answer\").item.json.category }}<br><b>Priority:</b> {{ $(\"Finalize Answer\").item.json.priority }}<br><b>Why escalated:</b> {{ $(\"Finalize Answer\").item.json.action_taken }}<br><b>FAQs checked:</b> {{ $(\"Finalize Answer\").item.json.knowledge_source }}</p><h3>Customer message</h3><p>{{ $(\"Finalize Answer\").item.json.original_message }}</p><h3>What the customer was told</h3><p>{{ $(\"Finalize Answer\").item.json.customer_reply }}</p><p><i>Please reply to the customer by email.</i></p>"),
      options: { appendAttribution: false }
    },
    credentials: { gmailOAuth2: { id: 'YOUR_GMAIL_CREDENTIAL_ID', name: 'Gmail account' } }
  }
});

const buildResponse = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Build Response', onError: 'continueErrorOutput', parameters: { jsCode: "// Builds the JSON returned to the caller. Only reports what actually happened:\n// ticket_logged is true only if the sheet append succeeded, and an escalation\n// is only reported as successful if Gmail accepted the team notification.\nconst t = $('Finalize Answer').first().json;\n\nconst saved = $('Save Ticket to Sheet').first().json || {};\nconst ticketLogged = !saved.error && Object.keys(saved).length > 0;\n\nlet escalationNotified = false;\nif (t.requires_human) {\n  try {\n    const sent = $('Notify Support Team').first().json || {};\n    escalationNotified = !sent.error && !!sent.id;\n  } catch (e) {\n    escalationNotified = false;\n  }\n  // The customer is told the team will reply by email, so that must be true.\n  if (!escalationNotified) {\n    throw new Error('Support team notification was not sent' + (ticketLogged ? ' (ticket was logged)' : ' and ticket was not logged'));\n  }\n}\n\nconst warnings = [];\nif (!ticketLogged) warnings.push('ticket_not_logged');\n\nreturn [{ json: {\n  success: true,\n  customer_reply: t.customer_reply,\n  category: t.category,\n  priority: String(t.priority || 'Medium').toLowerCase(),\n  requires_human: t.requires_human === true,\n  resolution_status: t.requires_human ? 'escalated' : 'resolved',\n  // The Tickets sheet has no ticket ID column, so no ID is available to return.\n  ticket_id: null,\n  ticket_logged: ticketLogged,\n  escalation_notified: escalationNotified,\n  warnings,\n} }];\n" } }
});

const respondSuccess = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond to Webhook',
    parameters: {
      respondWith: 'firstIncomingItem',
      options: { responseCode: 200, responseHeaders: { entries: [{ name: 'Cache-Control', value: 'no-store' }] } }
    }
  }
});

const respondError = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond with Error',
    parameters: {
      respondWith: 'json',
      responseBody: expr("{{ JSON.stringify($json.valid === false && Array.isArray($json.errors) ? { success: false, error: { code: 'invalid_request', message: 'Please check your details and try again.', details: $json.errors } } : { success: false, error: { code: 'processing_failed', message: 'Sorry, we could not process your request right now. Please try again in a few minutes.' } }) }}"),
      options: {
        responseCode: expr('{{ $json.valid === false ? 400 : 500 }}'),
        responseHeaders: { entries: [{ name: 'Cache-Control', value: 'no-store' }] }
      }
    }
  }
});

export default workflow('supportflow-ai-api', 'SupportFlow AI - API')
  .add(apiWebhook)
  .to(checkApiKey)
  .to(isAuthorized
    .onTrue(validateRequest)
    .onFalse(respondUnauthorized))
  .add(validateRequest)
  .to(isValid
    .onTrue(loadKb.to(findMatch))
    .onFalse(respondError))
  .add(findMatch.onError(respondError))
  .to(needsAi
    .onTrue(askGemini.to(finalizeAnswer))
    .onFalse(finalizeAnswer))
  .add(finalizeAnswer.onError(respondError))
  .to(saveTicket)
  .to(needsEscalation
    .onTrue(notifyTeam.to(buildResponse))
    .onFalse(buildResponse))
  .add(buildResponse.onError(respondError))
  .to(respondSuccess);
