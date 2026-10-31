// Validates the JSON body for one of five actions and normalises the fields.
//   availability: date? guests?
//   create:       customer_name, customer_email, date, time, guests
//   lookup:       reservation_id, customer_email
//   cancel:       reservation_id, customer_email
//   modify:       reservation_id, customer_email, date, time, guests
const body = $input.first().json.body || {};
const str = v => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const action = str(body.action).toLowerCase();
const errors = [];
const out = { action };
const today = $now.startOf('day');

const need = {
  availability: [],
  create: ['name', 'email', 'date', 'time', 'guests'],
  lookup: ['id', 'email'],
  cancel: ['id', 'email'],
  modify: ['id', 'email', 'date', 'time', 'guests'],
}[action];

if (!need) {
  errors.push('action must be one of: availability, create, lookup, modify, cancel');
} else {
  const required = f => need.includes(f);

  const name = str(body.customer_name);
  if (name) { if (name.length > 100) errors.push('customer_name must be 100 characters or fewer'); else out.customer_name = name; }
  else if (required('name')) errors.push('customer_name is required');

  const email = str(body.customer_email).toLowerCase();
  if (email) { if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('customer_email must be a valid email address'); else out.customer_email = email; }
  else if (required('email')) errors.push('customer_email is required');

  const id = str(body.reservation_id).toUpperCase();
  if (id) { if (!/^RES-\d{8}-[A-Z0-9]{4}$/.test(id)) errors.push('reservation_id must look like RES-20261102-AB12'); else out.reservation_id = id; }
  else if (required('id')) errors.push('reservation_id is required');

  const date = str(body.date);
  if (date) {
    const d = DateTime.fromFormat(date, 'yyyy-MM-dd', { zone: $now.zoneName });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !d.isValid) errors.push('date must be a real date in YYYY-MM-DD format');
    else if (d < today) errors.push('date cannot be in the past');
    else if (d > today.plus({ days: 30 })) errors.push('reservations can be made up to 30 days in advance');
    else out.date = date;
  } else if (required('date')) errors.push('date is required (YYYY-MM-DD)');

  const time = str(body.time);
  if (time) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.push('time must be in 24-hour HH:MM format'); else out.time = time; }
  else if (required('time')) errors.push('time is required (HH:MM)');

  const rawGuests = body.guests;
  if (rawGuests !== undefined && rawGuests !== null && rawGuests !== '') {
    const g = Number(rawGuests);
    if (!Number.isInteger(g) || g < 1) errors.push('guests must be a whole number of at least 1');
    else if (g > 6) errors.push('online reservations are for 1 to 6 guests; please contact support for larger groups');
    else out.guests = g;
  } else if (required('guests')) errors.push('guests is required');
}

return [{ json: { valid: errors.length === 0, errors, ...out } }];
