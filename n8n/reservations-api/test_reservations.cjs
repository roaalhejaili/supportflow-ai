// Runs the reservation Code nodes locally in the same order as the n8n workflow,
// with simulated Google Sheets data. Usage: node test_reservations.cjs
const fs = require('fs');
const path = require('path');
const { DateTime } = require('luxon');

const load = f => new Function('$', '$input', '$now', 'DateTime', fs.readFileSync(path.join(__dirname, f), 'utf8'));
const nodes = { validate: load('validate_request.js'), decide: load('decide.js'), confirm: load('confirm_saved.js'), error: load('build_error.js') };

// "Now" for the tests: Saturday 31 Oct 2026, 12:00.
const NOW = DateTime.fromISO('2026-10-31T12:00:00', { zone: 'UTC' });

// Availability tab as it is in the sheet today.
const AVAILABILITY = [
  ['2026-11-02', '18:00', 6, 0], ['2026-11-02', '19:00', 6, 2], ['2026-11-02', '20:00', 6, 6],
  ['2026-11-03', '18:00', 6, 1], ['2026-11-03', '19:00', 6, 0], ['2026-11-03', '20:00', 6, 3],
].map(([Date, Time, Capacity, booked], i) => ({ row_number: i + 2, Date, Time, Capacity: String(Capacity), 'Booked Count': String(booked), Status: 'DEMO' }));

const RESERVATIONS = [
  { 'Reservation ID': 'RES-20261102-AB12', 'Customer Name': 'Sara Ahmed', 'Customer Email': 'sara@example.com', Date: '2026-11-02', Time: '19:00', 'Number of Guests': '2', Status: 'Confirmed' },
  { 'Reservation ID': 'RES-20261101-ZZ99', 'Customer Name': 'Omar Ali', 'Customer Email': 'omar@example.com', Date: '2026-11-01', Time: '11:00', 'Number of Guests': '2', Status: 'Confirmed' },
];

// Runs one request through the pipeline. sheets: { availability, reservations, write }
function run(body, sheets = {}) {
  const ran = {};
  const ref = name => {
    if (!(name in ran)) throw new Error(`Node '${name}' hasn't been executed`);
    const items = ran[name];
    return { first: () => { if (!items.length) throw new Error('no items'); return items[0]; }, all: () => items };
  };
  const exec = (name, fn, input) => {
    const out = fn(ref, { first: () => input[0], all: () => input }, NOW, DateTime);
    ran[name] = out;
    return out;
  };
  const errorPath = input => exec('Build Error Response', nodes.error, input)[0].json;

  ran['Webhook'] = [{ json: { body } }];
  const v = exec('Validate Request', nodes.validate, ran['Webhook'])[0];
  if (!v.json.valid) return errorPath([v]);

  ran['Load Availability'] = (sheets.availability || AVAILABILITY).map(json => ({ json }));
  const res = sheets.reservations || RESERVATIONS;
  ran['Load Reservations'] = (res.length ? res : [{}]).map(json => ({ json })); // alwaysOutputData gives {} when empty
  let d;
  try { d = exec('Decide', nodes.decide, ran['Load Reservations'])[0].json; } catch (e) { return errorPath([{ json: { error: e.message } }]); }
  if (d.op === 'none') return { http_status: d.http_status, body: d.body, op: d.op };

  // A failing Sheets node sends its input item (Decide's output) plus "error" to its error output.
  if (sheets.writeThrows) return errorPath([{ json: { ...d, error: sheets.writeThrows } }]);
  const written = sheets.write || d.row; // the Sheets node returns the written row
  return { ...exec('Confirm Saved', nodes.confirm, [{ json: written }])[0].json, op: d.op, row: d.row };
}

const base = { customer_name: 'Lina Saleh', customer_email: 'lina@example.com' };
const cases = [
  ['Successful reservation', { action: 'create', ...base, date: '2026-11-03', time: '19:00', guests: 4 }, {},
    r => r.http_status === 200 && /^RES-20261103-[A-Z0-9]{4}$/.test(r.body.reservation.reservation_id) && r.op === 'append' && r.row.Status === 'Confirmed'],
  ['Unavailable time slot (fully booked)', { action: 'create', ...base, date: '2026-11-02', time: '20:00', guests: 2 }, {},
    r => r.http_status === 409 && r.body.error.code === 'slot_unavailable' && r.body.error.alternatives.length > 0],
  ['Not enough seats (counts online bookings)', { action: 'create', ...base, date: '2026-11-02', time: '19:00', guests: 3 }, {},
    r => r.http_status === 409 && r.body.error.code === 'slot_unavailable' && r.body.error.remaining === 2],
  ['Slot not offered', { action: 'create', ...base, date: '2026-11-04', time: '19:00', guests: 2 }, {},
    r => r.http_status === 409 && r.body.error.code === 'slot_not_offered'],
  ['Duplicate booking', { action: 'create', customer_name: 'Sara Ahmed', customer_email: 'SARA@example.com', date: '2026-11-02', time: '19:00', guests: 2 }, {},
    r => r.http_status === 409 && r.body.error.code === 'duplicate_booking' && r.body.error.reservation_id === 'RES-20261102-AB12'],
  ['Invalid date (not a real date)', { action: 'create', ...base, date: '2026-02-30', time: '19:00', guests: 2 }, {},
    r => r.http_status === 400 && r.body.error.details.some(d => d.includes('real date'))],
  ['Invalid date (in the past)', { action: 'create', ...base, date: '2026-10-01', time: '19:00', guests: 2 }, {},
    r => r.http_status === 400 && r.body.error.details.some(d => d.includes('past'))],
  ['Invalid details (bad email, 8 guests)', { action: 'create', customer_name: 'X', customer_email: 'nope', date: '2026-11-03', time: '7pm', guests: 8 }, {},
    r => r.http_status === 400 && r.body.error.details.length === 3],
  ['Availability for a date', { action: 'availability', date: '2026-11-02', guests: 2 }, {},
    r => r.http_status === 200 && r.body.slots.length === 3 && r.body.slots.find(s => s.time === '19:00').remaining === 2 && r.body.slots.find(s => s.time === '20:00').available === false],
  ['Booking lookup', { action: 'lookup', reservation_id: 'res-20261102-ab12', customer_email: 'sara@example.com' }, {},
    r => r.http_status === 200 && r.body.reservation.guests === 2 && r.body.reservation.status === 'Confirmed'],
  ['Lookup with wrong email (privacy)', { action: 'lookup', reservation_id: 'RES-20261102-AB12', customer_email: 'other@example.com' }, {},
    r => r.http_status === 404 && r.body.error.code === 'not_found'],
  ['Cancellation', { action: 'cancel', reservation_id: 'RES-20261102-AB12', customer_email: 'sara@example.com' }, {},
    r => r.http_status === 200 && r.op === 'update' && r.row.Status === 'Cancelled' && r.body.reservation.status === 'Cancelled'],
  ['Cancellation within 24 hours', { action: 'cancel', reservation_id: 'RES-20261101-ZZ99', customer_email: 'omar@example.com' }, {},
    r => r.http_status === 409 && r.body.error.code === 'too_late'],
  ['Modification to a free slot', { action: 'modify', reservation_id: 'RES-20261102-AB12', customer_email: 'sara@example.com', date: '2026-11-03', time: '18:00', guests: 4 }, {},
    r => r.http_status === 200 && r.row.Date === '2026-11-03' && r.row.Time === '18:00' && r.row['Number of Guests'] === 4],
  ['Modification: more guests in same slot (own seats excluded)', { action: 'modify', reservation_id: 'RES-20261102-AB12', customer_email: 'sara@example.com', date: '2026-11-02', time: '19:00', guests: 4 }, {},
    r => r.http_status === 200 && r.row['Number of Guests'] === 4],
  ['Google Sheets failure (read)', { action: 'create', ...base, date: '2026-11-03', time: '19:00', guests: 2 }, { availability: [{ error: 'The service is currently unavailable' }] },
    r => r.http_status === 503 && r.body.error.code === 'service_unavailable'],
  ['Google Sheets failure (save) - not confirmed', { action: 'create', ...base, date: '2026-11-03', time: '19:00', guests: 2 }, { write: { error: 'Quota exceeded' } },
    r => r.http_status === 503 && r.body.error.code === 'booking_not_saved' && !r.body.reservation],
  ['Google Sheets failure (save node errors) - not confirmed', { action: 'create', ...base, date: '2026-11-03', time: '19:00', guests: 2 }, { writeThrows: 'The service is currently unavailable' },
    r => r.http_status === 503 && r.body.error.code === 'booking_not_saved'],
  ['Google Sheets failure (cancel not saved)', { action: 'cancel', reservation_id: 'RES-20261102-AB12', customer_email: 'sara@example.com' }, { writeThrows: 'The service is currently unavailable' },
    r => r.http_status === 503 && r.body.error.code === 'change_not_saved'],
  ['Empty Reservations tab', { action: 'create', ...base, date: '2026-11-02', time: '18:00', guests: 6 }, { reservations: [] },
    r => r.http_status === 200 && r.body.reservation.guests === 6],
];

let pass = 0;
for (const [label, body, sheets, check] of cases) {
  let r;
  try { r = run(body, sheets); } catch (e) { r = { crash: e.message }; }
  const ok = !r.crash && check(r);
  if (ok) pass++;
  const summary = r.crash ? 'CRASH ' + r.crash : `${r.http_status} ${r.body.success ? (r.body.reservation ? r.body.reservation.reservation_id + ' ' + r.body.reservation.status : 'ok') : r.body.error.code + ': ' + r.body.error.message}`;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${label.padEnd(58)} | ${summary}`);
}
console.log(`\n${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
