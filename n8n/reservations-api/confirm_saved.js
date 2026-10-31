// Only reached after a sheet write. Confirms the booking/change only if Google
// Sheets returned the written row; otherwise responds that nothing was saved.
const decision = $('Decide').first().json;
const written = $input.first().json || {};
if (written.error || Object.keys(written).length === 0) {
  const body = decision.op === 'append'
    ? { code: 'booking_not_saved', message: "We couldn't save your reservation, so it is NOT confirmed. Please try again in a few minutes." }
    : { code: 'change_not_saved', message: "We couldn't save your change, so your reservation was not changed. Please try again in a few minutes." };
  return [{ json: { http_status: 503, body: { success: false, error: body } } }];
}
return [{ json: { http_status: 200, body: decision.success_body } }];
