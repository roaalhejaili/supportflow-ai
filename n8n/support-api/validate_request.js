// Checks the JSON body from the server-side caller and maps it to the
// field names the rest of the workflow already uses.
const body = $input.first().json.body || {};
const str = v => (typeof v === 'string' ? v.trim() : '');
const name = str(body.customer_name);
const email = str(body.customer_email).toLowerCase();
const message = str(body.original_message);

const errors = [];
if (!name) errors.push('customer_name is required');
else if (name.length > 120) errors.push('customer_name must be 120 characters or fewer');
if (!email) errors.push('customer_email is required');
else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('customer_email must be a valid email address');
if (!message) errors.push('original_message is required');
else if (message.length > 4000) errors.push('original_message must be 4000 characters or fewer');

return [{ json: {
  valid: errors.length === 0,
  errors,
  'Customer Name': name,
  'Customer Email': email,
  'Support Message': message,
} }];
