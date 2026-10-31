// Checks the X-SupportFlow-Key header. Only a SHA-256 hash of the shared key is
// stored here, so the key itself never lives in n8n or in Git.
// (Used instead of the Webhook node's Header Auth, which rejected even matching
// keys on this n8n instance.)
const crypto = require('crypto');
const EXPECTED_SHA256 = '__KEY_SHA256__';

const item = $input.first().json;
const key = String((item.headers || {})['x-supportflow-key'] || '');
const actual = crypto.createHash('sha256').update(key).digest();
const expected = Buffer.from(EXPECTED_SHA256, 'hex');
const authorized = key.length > 0 && expected.length === actual.length && crypto.timingSafeEqual(actual, expected);

return [{ json: { ...item, authorized } }];
