import { workflow, node, trigger, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

const sheetsCred = { googleSheetsOAuth2Api: { id: 'YOUR_GOOGLE_SHEETS_CREDENTIAL_ID', name: 'Google Sheets account' } };
const doc = { __rl: true, mode: 'list', value: 'YOUR_KNOWLEDGE_BASE_SHEET_ID', cachedResultName: 'SupportFlow AI Knowledge Base' };
const readOptions = { outputFormatting: { values: { general: 'FORMATTED_VALUE', date: 'FORMATTED_STRING' } } };
const reservationColumns = {
  'Reservation ID': expr("{{ $json.row['Reservation ID'] }}"),
  'Customer Name': expr("{{ $json.row['Customer Name'] }}"),
  'Customer Email': expr("{{ $json.row['Customer Email'] }}"),
  'Date': expr('{{ $json.row.Date }}'),
  'Time': expr('{{ $json.row.Time }}'),
  'Number of Guests': expr("{{ $json.row['Number of Guests'] }}"),
  'Status': expr('{{ $json.row.Status }}')
};
const reservationSchema = [{"id": "Reservation ID", "displayName": "Reservation ID", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}, {"id": "Customer Name", "displayName": "Customer Name", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}, {"id": "Customer Email", "displayName": "Customer Email", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}, {"id": "Date", "displayName": "Date", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}, {"id": "Time", "displayName": "Time", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}, {"id": "Number of Guests", "displayName": "Number of Guests", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}, {"id": "Status", "displayName": "Status", "required": false, "defaultMatch": false, "display": true, "type": "string", "canBeUsedToMatch": true}];

const apiWebhook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Reservations API Webhook',
    parameters: {
      httpMethod: 'POST',
      path: 'supportflow-reservations',
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
  config: { name: 'Validate Request', parameters: { jsCode: "// Validates the JSON body for one of five actions and normalises the fields.\n//   availability: date? guests?\n//   create:       customer_name, customer_email, date, time, guests\n//   lookup:       reservation_id, customer_email\n//   cancel:       reservation_id, customer_email\n//   modify:       reservation_id, customer_email, date, time, guests\nconst body = $input.first().json.body || {};\nconst str = v => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');\nconst action = str(body.action).toLowerCase();\nconst errors = [];\nconst out = { action };\nconst today = $now.startOf('day');\n\nconst need = {\n  availability: [],\n  create: ['name', 'email', 'date', 'time', 'guests'],\n  lookup: ['id', 'email'],\n  cancel: ['id', 'email'],\n  modify: ['id', 'email', 'date', 'time', 'guests'],\n}[action];\n\nif (!need) {\n  errors.push('action must be one of: availability, create, lookup, modify, cancel');\n} else {\n  const required = f => need.includes(f);\n\n  const name = str(body.customer_name);\n  if (name) { if (name.length > 100) errors.push('customer_name must be 100 characters or fewer'); else out.customer_name = name; }\n  else if (required('name')) errors.push('customer_name is required');\n\n  const email = str(body.customer_email).toLowerCase();\n  if (email) { if (email.length > 254 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) errors.push('customer_email must be a valid email address'); else out.customer_email = email; }\n  else if (required('email')) errors.push('customer_email is required');\n\n  const id = str(body.reservation_id).toUpperCase();\n  if (id) { if (!/^RES-\\d{8}-[A-Z0-9]{4}$/.test(id)) errors.push('reservation_id must look like RES-20261102-AB12'); else out.reservation_id = id; }\n  else if (required('id')) errors.push('reservation_id is required');\n\n  const date = str(body.date);\n  if (date) {\n    const d = DateTime.fromFormat(date, 'yyyy-MM-dd', { zone: $now.zoneName });\n    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date) || !d.isValid) errors.push('date must be a real date in YYYY-MM-DD format');\n    else if (d < today) errors.push('date cannot be in the past');\n    else if (d > today.plus({ days: 30 })) errors.push('reservations can be made up to 30 days in advance');\n    else out.date = date;\n  } else if (required('date')) errors.push('date is required (YYYY-MM-DD)');\n\n  const time = str(body.time);\n  if (time) { if (!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(time)) errors.push('time must be in 24-hour HH:MM format'); else out.time = time; }\n  else if (required('time')) errors.push('time is required (HH:MM)');\n\n  const rawGuests = body.guests;\n  if (rawGuests !== undefined && rawGuests !== null && rawGuests !== '') {\n    const g = Number(rawGuests);\n    if (!Number.isInteger(g) || g < 1) errors.push('guests must be a whole number of at least 1');\n    else if (g > 6) errors.push('online reservations are for 1 to 6 guests; please contact support for larger groups');\n    else out.guests = g;\n  } else if (required('guests')) errors.push('guests is required');\n}\n\nreturn [{ json: { valid: errors.length === 0, errors, ...out } }];\n" } }
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

const loadAvailability = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Load Availability',
    executeOnce: true,
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 1000,
    onError: 'continueErrorOutput',
    parameters: { documentId: doc, sheetName: { __rl: true, mode: 'name', value: 'Availability' }, options: readOptions },
    credentials: sheetsCred
  }
});

const loadReservations = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Load Reservations',
    executeOnce: true,
    alwaysOutputData: true,
    retryOnFail: true,
    maxTries: 2,
    waitBetweenTries: 1000,
    onError: 'continueErrorOutput',
    parameters: { documentId: doc, sheetName: { __rl: true, mode: 'name', value: 'Reservations' }, options: readOptions },
    credentials: sheetsCred
  }
});

const decide = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Decide', onError: 'continueErrorOutput', parameters: { jsCode: "// Decides what to do with a validated request, using the Availability and\n// Reservations tabs. The Reservations tab is the source of truth for online\n// bookings; \"Booked Count\" in Availability is treated as seats already taken\n// offline (e.g. phone bookings), so every action needs at most one sheet write.\n//\n// Output: op = 'append' | 'update' (a write is needed; success_body is returned\n// only after the write succeeds) or op = 'none' (http_status + body are final).\nconst req = $('Validate Request').first().json;\n\nconst availRaw = $('Load Availability').all().map(i => i.json);\nconst resRaw = $('Load Reservations').all().map(i => i.json);\nif (availRaw.some(r => r && r.error)) throw new Error('Availability sheet could not be read');\nif (resRaw.some(r => r && r.error)) throw new Error('Reservations sheet could not be read');\n\nfunction normDate(v) {\n  if (v === null || v === undefined || v === '') return '';\n  if (typeof v === 'number') return DateTime.fromMillis(Math.round((v - 25569) * 86400000), { zone: 'utc' }).toFormat('yyyy-MM-dd');\n  const s = String(v).trim();\n  let d = DateTime.fromISO(s.slice(0, 10));\n  for (const f of ['yyyy/MM/dd', 'M/d/yyyy', 'MM/dd/yyyy', 'd MMM yyyy', 'MMM d, yyyy']) { if (d.isValid) break; d = DateTime.fromFormat(s, f); }\n  return d.isValid ? d.toFormat('yyyy-MM-dd') : s;\n}\nfunction normTime(v) {\n  if (v === null || v === undefined || v === '') return '';\n  if (typeof v === 'number' && v < 1) { const m = Math.round(v * 1440); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }\n  const m = String(v).trim().toLowerCase().replace(/\\./g, '').match(/^(\\d{1,2})(?::(\\d{2}))?(?::\\d{2})?\\s*(am|pm)?$/);\n  if (!m) return String(v).trim();\n  let h = Number(m[1]);\n  if (m[3] === 'pm' && h < 12) h += 12;\n  if (m[3] === 'am' && h === 12) h = 0;\n  return String(h).padStart(2, '0') + ':' + (m[2] || '00');\n}\n\nconst slots = availRaw.filter(r => r && r.Date && r.Time).map(r => ({\n  date: normDate(r.Date), time: normTime(r.Time), capacity: Number(r.Capacity) || 0, offline: Number(r['Booked Count']) || 0,\n}));\nif (slots.length === 0) throw new Error('No availability rows found');\n\nconst reservations = resRaw.filter(r => r && r['Reservation ID']).map(r => ({\n  id: String(r['Reservation ID']).trim().toUpperCase(),\n  name: String(r['Customer Name'] || '').trim(),\n  email: String(r['Customer Email'] || '').trim().toLowerCase(),\n  date: normDate(r.Date),\n  time: normTime(r.Time),\n  guests: Number(r['Number of Guests']) || 0,\n  status: String(r.Status || '').trim(),\n}));\nconst isActive = r => r.status.toLowerCase() === 'confirmed';\n\nconst start = (date, time) => DateTime.fromISO(date + 'T' + time, { zone: $now.zoneName });\nconst remaining = (slot, excludeId) => {\n  const online = reservations\n    .filter(r => isActive(r) && r.id !== excludeId && r.date === slot.date && r.time === slot.time)\n    .reduce((sum, r) => sum + r.guests, 0);\n  return Math.max(slot.capacity - slot.offline - online, 0);\n};\nconst listSlots = (date, guests, excludeId) => slots\n  .filter(s => (!date || s.date === date) && start(s.date, s.time) > $now)\n  .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))\n  .map(s => { const left = remaining(s, excludeId); return { date: s.date, time: s.time, remaining: left, available: left >= guests }; });\n\nconst done = (status, body) => [{ json: { op: 'none', http_status: status, body } }];\nconst fail = (status, code, message, extra = {}) => done(status, { success: false, error: { code, message, ...extra } });\nconst publicView = r => ({ reservation_id: r.id, customer_name: r.name, customer_email: r.email, date: r.date, time: r.time, guests: r.guests, status: r.status });\nconst sheetRow = r => ({ 'Reservation ID': r.id, 'Customer Name': r.name, 'Customer Email': r.email, Date: r.date, Time: r.time, 'Number of Guests': r.guests, Status: r.status });\nconst write = (op, record, action, message) => [{ json: {\n  op, row: sheetRow(record), success_body: { success: true, action, reservation: publicView(record), message },\n} }];\n\n// Returns a failure response if the slot can't take the booking, otherwise null.\nfunction slotProblem(date, time, guests, excludeId) {\n  const slot = slots.find(s => s.date === date && s.time === time);\n  const others = () => listSlots(date, guests, excludeId).filter(s => s.available && s.time !== time);\n  if (!slot) return fail(409, 'slot_not_offered', `We don't take reservations on ${date} at ${time}.`, { alternatives: others() });\n  if (start(date, time) <= $now) return fail(409, 'slot_in_past', `${date} at ${time} has already passed.`);\n  const left = remaining(slot, excludeId);\n  if (left < guests) {\n    const message = left === 0 ? `Sorry, ${date} at ${time} is fully booked.` : `Sorry, only ${left} seat${left === 1 ? '' : 's'} left on ${date} at ${time}.`;\n    return fail(409, 'slot_unavailable', message, { remaining: left, alternatives: others() });\n  }\n  return null;\n}\n// Lookup requires the matching email too; a wrong email looks the same as a wrong ID.\nconst findOwned = () => reservations.find(r => r.id === req.reservation_id && r.email === req.customer_email) || null;\nconst notFound = () => fail(404, 'not_found', \"We couldn't find a reservation with that ID and email.\");\nconst tooLate = r => start(r.date, r.time).minus({ hours: 24 }) <= $now;\n\nswitch (req.action) {\n  case 'availability':\n    return done(200, { success: true, action: 'availability', date: req.date || null, guests: req.guests || 1, slots: listSlots(req.date, req.guests || 1) });\n\n  case 'create': {\n    const dup = reservations.find(r => isActive(r) && r.email === req.customer_email && r.date === req.date && r.time === req.time);\n    if (dup) return fail(409, 'duplicate_booking', `You already have a reservation on ${req.date} at ${req.time} (${dup.id}). We didn't create a second one.`, { reservation_id: dup.id });\n    const problem = slotProblem(req.date, req.time, req.guests);\n    if (problem) return problem;\n    const taken = new Set(reservations.map(r => r.id));\n    let id;\n    do { id = 'RES-' + req.date.replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0'); } while (taken.has(id));\n    const record = { id, name: req.customer_name, email: req.customer_email, date: req.date, time: req.time, guests: req.guests, status: 'Confirmed' };\n    return write('append', record, 'create', `Your reservation is confirmed. Reservation ID: ${id}.`);\n  }\n\n  case 'lookup': {\n    const r = findOwned();\n    return r ? done(200, { success: true, action: 'lookup', reservation: publicView(r) }) : notFound();\n  }\n\n  case 'cancel': {\n    const r = findOwned();\n    if (!r) return notFound();\n    if (r.status.toLowerCase() === 'cancelled') return fail(409, 'already_cancelled', `Reservation ${r.id} is already cancelled.`);\n    if (!isActive(r)) return fail(409, 'not_active', `Reservation ${r.id} can't be cancelled online (status: ${r.status || 'unknown'}).`);\n    if (tooLate(r)) return fail(409, 'too_late', 'Online cancellations are possible up to 24 hours before the booking. Please contact support.');\n    return write('update', { ...r, status: 'Cancelled' }, 'cancel', `Reservation ${r.id} has been cancelled.`);\n  }\n\n  case 'modify': {\n    const r = findOwned();\n    if (!r) return notFound();\n    if (!isActive(r)) return fail(409, 'not_active', `Reservation ${r.id} can't be changed online (status: ${r.status || 'unknown'}).`);\n    if (tooLate(r)) return fail(409, 'too_late', 'Online changes are possible up to 24 hours before the booking. Please contact support.');\n    if (r.date === req.date && r.time === req.time && r.guests === req.guests) return fail(400, 'no_change', 'The new details are the same as your current reservation.');\n    const dup = reservations.find(x => x.id !== r.id && isActive(x) && x.email === r.email && x.date === req.date && x.time === req.time);\n    if (dup) return fail(409, 'duplicate_booking', `You already have another reservation on ${req.date} at ${req.time} (${dup.id}).`, { reservation_id: dup.id });\n    const problem = slotProblem(req.date, req.time, req.guests, r.id);\n    if (problem) return problem;\n    return write('update', { ...r, date: req.date, time: req.time, guests: req.guests }, 'modify', `Reservation ${r.id} has been updated.`);\n  }\n}\nthrow new Error('Unknown action ' + req.action);\n" } }
});

const routeWrite = switchCase({
  version: 3.2,
  config: {
    name: 'Write Needed?',
    parameters: {
      rules: {
        values: [
          { outputKey: 'New booking', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.op }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'append' }], combinator: 'and' } },
          { outputKey: 'Change booking', renameOutput: true, conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' }, conditions: [{ leftValue: expr('{{ $json.op }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'update' }], combinator: 'and' } }
        ]
      },
      options: { fallbackOutput: 'extra', renameFallbackOutput: 'No write' }
    }
  }
});

const saveReservation = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Save Reservation',
    onError: 'continueErrorOutput',
    parameters: {
      operation: 'append',
      documentId: doc,
      sheetName: { __rl: true, mode: 'name', value: 'Reservations' },
      columns: { mappingMode: 'defineBelow', value: reservationColumns, schema: reservationSchema },
      options: { cellFormat: 'RAW' }
    },
    credentials: sheetsCred
  }
});

const updateReservation = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Update Reservation',
    onError: 'continueErrorOutput',
    parameters: {
      operation: 'update',
      documentId: doc,
      sheetName: { __rl: true, mode: 'name', value: 'Reservations' },
      columns: { mappingMode: 'defineBelow', matchingColumns: ['Reservation ID'], value: reservationColumns, schema: reservationSchema },
      options: { cellFormat: 'RAW' }
    },
    credentials: sheetsCred
  }
});

const confirmSaved = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Confirm Saved', onError: 'continueErrorOutput', parameters: { jsCode: "// Only reached after a sheet write. Confirms the booking/change only if Google\n// Sheets returned the written row; otherwise responds that nothing was saved.\nconst decision = $('Decide').first().json;\nconst written = $input.first().json || {};\nif (written.error || Object.keys(written).length === 0) {\n  const body = decision.op === 'append'\n    ? { code: 'booking_not_saved', message: \"We couldn't save your reservation, so it is NOT confirmed. Please try again in a few minutes.\" }\n    : { code: 'change_not_saved', message: \"We couldn't save your change, so your reservation was not changed. Please try again in a few minutes.\" };\n  return [{ json: { http_status: 503, body: { success: false, error: body } } }];\n}\nreturn [{ json: { http_status: 200, body: decision.success_body } }];\n" } }
});

const buildError = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Build Error Response', parameters: { jsCode: "// Turns invalid input, sheet read failures and failed writes into friendly JSON.\n// A failed write is never reported as a confirmed booking or change. When a\n// Sheets write node fails, its error item still carries Decide's \"op\" field.\nconst item = $input.first().json || {};\nif (item.valid === false && Array.isArray(item.errors)) {\n  return [{ json: { http_status: 400, body: { success: false, error: { code: 'invalid_request', message: 'Please check your booking details.', details: item.errors } } } }];\n}\n\nlet code = 'service_unavailable';\nlet message = 'Reservations are temporarily unavailable. Please try again in a few minutes.';\nif (item.op === 'append') {\n  code = 'booking_not_saved';\n  message = \"We couldn't save your reservation, so it is NOT confirmed. Please try again in a few minutes.\";\n} else if (item.op === 'update') {\n  code = 'change_not_saved';\n  message = \"We couldn't save your change, so your reservation was not changed. Please try again in a few minutes.\";\n}\nreturn [{ json: { http_status: 503, body: { success: false, error: { code, message } } } }];\n" } }
});

const respond = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Respond to Webhook',
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ JSON.stringify($json.body) }}'),
      options: {
        responseCode: expr('{{ $json.http_status }}'),
        responseHeaders: { entries: [{ name: 'Cache-Control', value: 'no-store' }] }
      }
    }
  }
});

export default workflow('supportflow-reservations', 'SupportFlow AI - Reservations API')
  .add(apiWebhook)
  .to(checkApiKey)
  .to(isAuthorized
    .onTrue(validateRequest)
    .onFalse(respondUnauthorized))
  .add(validateRequest)
  .to(isValid
    .onTrue(loadAvailability.to(loadReservations.to(decide)))
    .onFalse(buildError))
  .add(loadAvailability.onError(buildError))
  .add(loadReservations.onError(buildError))
  .add(decide.onError(buildError))
  .to(routeWrite
    .onCase(0, saveReservation.to(confirmSaved))
    .onCase(1, updateReservation.to(confirmSaved))
    .onCase(2, respond))
  .add(saveReservation.onError(buildError))
  .add(updateReservation.onError(buildError))
  .add(confirmSaved.onError(buildError))
  .to(respond)
  .add(buildError)
  .to(respond);
