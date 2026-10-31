// Turns invalid input, sheet read failures and failed writes into friendly JSON.
// A failed write is never reported as a confirmed booking or change. When a
// Sheets write node fails, its error item still carries Decide's "op" field.
const item = $input.first().json || {};
if (item.valid === false && Array.isArray(item.errors)) {
  return [{ json: { http_status: 400, body: { success: false, error: { code: 'invalid_request', message: 'Please check your booking details.', details: item.errors } } } }];
}

let code = 'service_unavailable';
let message = 'Reservations are temporarily unavailable. Please try again in a few minutes.';
if (item.op === 'append') {
  code = 'booking_not_saved';
  message = "We couldn't save your reservation, so it is NOT confirmed. Please try again in a few minutes.";
} else if (item.op === 'update') {
  code = 'change_not_saved';
  message = "We couldn't save your change, so your reservation was not changed. Please try again in a few minutes.";
}
return [{ json: { http_status: 503, body: { success: false, error: { code, message } } } }];
