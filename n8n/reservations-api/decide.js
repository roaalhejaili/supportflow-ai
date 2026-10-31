// Decides what to do with a validated request, using the Availability and
// Reservations tabs. The Reservations tab is the source of truth for online
// bookings; "Booked Count" in Availability is treated as seats already taken
// offline (e.g. phone bookings), so every action needs at most one sheet write.
//
// Output: op = 'append' | 'update' (a write is needed; success_body is returned
// only after the write succeeds) or op = 'none' (http_status + body are final).
const req = $('Validate Request').first().json;

const availRaw = $('Load Availability').all().map(i => i.json);
const resRaw = $('Load Reservations').all().map(i => i.json);
if (availRaw.some(r => r && r.error)) throw new Error('Availability sheet could not be read');
if (resRaw.some(r => r && r.error)) throw new Error('Reservations sheet could not be read');

function normDate(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return DateTime.fromMillis(Math.round((v - 25569) * 86400000), { zone: 'utc' }).toFormat('yyyy-MM-dd');
  const s = String(v).trim();
  let d = DateTime.fromISO(s.slice(0, 10));
  for (const f of ['yyyy/MM/dd', 'M/d/yyyy', 'MM/dd/yyyy', 'd MMM yyyy', 'MMM d, yyyy']) { if (d.isValid) break; d = DateTime.fromFormat(s, f); }
  return d.isValid ? d.toFormat('yyyy-MM-dd') : s;
}
function normTime(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && v < 1) { const m = Math.round(v * 1440); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  const m = String(v).trim().toLowerCase().replace(/\./g, '').match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(am|pm)?$/);
  if (!m) return String(v).trim();
  let h = Number(m[1]);
  if (m[3] === 'pm' && h < 12) h += 12;
  if (m[3] === 'am' && h === 12) h = 0;
  return String(h).padStart(2, '0') + ':' + (m[2] || '00');
}

const slots = availRaw.filter(r => r && r.Date && r.Time).map(r => ({
  date: normDate(r.Date), time: normTime(r.Time), capacity: Number(r.Capacity) || 0, offline: Number(r['Booked Count']) || 0,
}));
if (slots.length === 0) throw new Error('No availability rows found');

const reservations = resRaw.filter(r => r && r['Reservation ID']).map(r => ({
  id: String(r['Reservation ID']).trim().toUpperCase(),
  name: String(r['Customer Name'] || '').trim(),
  email: String(r['Customer Email'] || '').trim().toLowerCase(),
  date: normDate(r.Date),
  time: normTime(r.Time),
  guests: Number(r['Number of Guests']) || 0,
  status: String(r.Status || '').trim(),
}));
const isActive = r => r.status.toLowerCase() === 'confirmed';

const start = (date, time) => DateTime.fromISO(date + 'T' + time, { zone: $now.zoneName });
const remaining = (slot, excludeId) => {
  const online = reservations
    .filter(r => isActive(r) && r.id !== excludeId && r.date === slot.date && r.time === slot.time)
    .reduce((sum, r) => sum + r.guests, 0);
  return Math.max(slot.capacity - slot.offline - online, 0);
};
const listSlots = (date, guests, excludeId) => slots
  .filter(s => (!date || s.date === date) && start(s.date, s.time) > $now)
  .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  .map(s => { const left = remaining(s, excludeId); return { date: s.date, time: s.time, remaining: left, available: left >= guests }; });

const done = (status, body) => [{ json: { op: 'none', http_status: status, body } }];
const fail = (status, code, message, extra = {}) => done(status, { success: false, error: { code, message, ...extra } });
const publicView = r => ({ reservation_id: r.id, customer_name: r.name, customer_email: r.email, date: r.date, time: r.time, guests: r.guests, status: r.status });
const sheetRow = r => ({ 'Reservation ID': r.id, 'Customer Name': r.name, 'Customer Email': r.email, Date: r.date, Time: r.time, 'Number of Guests': r.guests, Status: r.status });
const write = (op, record, action, message) => [{ json: {
  op, row: sheetRow(record), success_body: { success: true, action, reservation: publicView(record), message },
} }];

// Returns a failure response if the slot can't take the booking, otherwise null.
function slotProblem(date, time, guests, excludeId) {
  const slot = slots.find(s => s.date === date && s.time === time);
  const others = () => listSlots(date, guests, excludeId).filter(s => s.available && s.time !== time);
  if (!slot) return fail(409, 'slot_not_offered', `We don't take reservations on ${date} at ${time}.`, { alternatives: others() });
  if (start(date, time) <= $now) return fail(409, 'slot_in_past', `${date} at ${time} has already passed.`);
  const left = remaining(slot, excludeId);
  if (left < guests) {
    const message = left === 0 ? `Sorry, ${date} at ${time} is fully booked.` : `Sorry, only ${left} seat${left === 1 ? '' : 's'} left on ${date} at ${time}.`;
    return fail(409, 'slot_unavailable', message, { remaining: left, alternatives: others() });
  }
  return null;
}
// Lookup requires the matching email too; a wrong email looks the same as a wrong ID.
const findOwned = () => reservations.find(r => r.id === req.reservation_id && r.email === req.customer_email) || null;
const notFound = () => fail(404, 'not_found', "We couldn't find a reservation with that ID and email.");
const tooLate = r => start(r.date, r.time).minus({ hours: 24 }) <= $now;

switch (req.action) {
  case 'availability':
    return done(200, { success: true, action: 'availability', date: req.date || null, guests: req.guests || 1, slots: listSlots(req.date, req.guests || 1) });

  case 'create': {
    const dup = reservations.find(r => isActive(r) && r.email === req.customer_email && r.date === req.date && r.time === req.time);
    if (dup) return fail(409, 'duplicate_booking', `You already have a reservation on ${req.date} at ${req.time} (${dup.id}). We didn't create a second one.`, { reservation_id: dup.id });
    const problem = slotProblem(req.date, req.time, req.guests);
    if (problem) return problem;
    const taken = new Set(reservations.map(r => r.id));
    let id;
    do { id = 'RES-' + req.date.replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0'); } while (taken.has(id));
    const record = { id, name: req.customer_name, email: req.customer_email, date: req.date, time: req.time, guests: req.guests, status: 'Confirmed' };
    return write('append', record, 'create', `Your reservation is confirmed. Reservation ID: ${id}.`);
  }

  case 'lookup': {
    const r = findOwned();
    return r ? done(200, { success: true, action: 'lookup', reservation: publicView(r) }) : notFound();
  }

  case 'cancel': {
    const r = findOwned();
    if (!r) return notFound();
    if (r.status.toLowerCase() === 'cancelled') return fail(409, 'already_cancelled', `Reservation ${r.id} is already cancelled.`);
    if (!isActive(r)) return fail(409, 'not_active', `Reservation ${r.id} can't be cancelled online (status: ${r.status || 'unknown'}).`);
    if (tooLate(r)) return fail(409, 'too_late', 'Online cancellations are possible up to 24 hours before the booking. Please contact support.');
    return write('update', { ...r, status: 'Cancelled' }, 'cancel', `Reservation ${r.id} has been cancelled.`);
  }

  case 'modify': {
    const r = findOwned();
    if (!r) return notFound();
    if (!isActive(r)) return fail(409, 'not_active', `Reservation ${r.id} can't be changed online (status: ${r.status || 'unknown'}).`);
    if (tooLate(r)) return fail(409, 'too_late', 'Online changes are possible up to 24 hours before the booking. Please contact support.');
    if (r.date === req.date && r.time === req.time && r.guests === req.guests) return fail(400, 'no_change', 'The new details are the same as your current reservation.');
    const dup = reservations.find(x => x.id !== r.id && isActive(x) && x.email === r.email && x.date === req.date && x.time === req.time);
    if (dup) return fail(409, 'duplicate_booking', `You already have another reservation on ${req.date} at ${req.time} (${dup.id}).`, { reservation_id: dup.id });
    const problem = slotProblem(req.date, req.time, req.guests, r.id);
    if (problem) return problem;
    return write('update', { ...r, date: req.date, time: req.time, guests: req.guests }, 'modify', `Reservation ${r.id} has been updated.`);
  }
}
throw new Error('Unknown action ' + req.action);
