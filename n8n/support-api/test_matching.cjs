// Runs the Find Best FAQ Match Code node locally against the knowledge base
// snapshot. Usage: node test_matching.cjs [old|new]  (keywords column to use)
const fs = require('fs');
const path = require('path');
const { toRows } = require('./knowledge_base.cjs');

const useNew = process.argv[2] !== 'old';
const code = fs.readFileSync(path.join(__dirname, 'find_best_faq_match.js'), 'utf8');
const run = new Function('$', '$input', '$now', code);

const cases = [
  ['What are your opening hours?', 'faq FAQ008'],
  ['hi What are your opening hours?', 'faq FAQ008'],
  ['How do I reset my password?', 'faq FAQ002'],
  ['I forgot my password and cannot log in', 'faq FAQ002'],
  ['Does the app support dark mode?', 'faq FAQ001'],
  ['Does the app support dark mode, and how do I enable it?', 'ai'],
  ['I want to enable dark mode, but I also need to know whether your app supports multiple languages and if I can change my account email without losing my reservations.', 'ai'],
  ['Can I book a table for 8 people?', 'ai'],
  ['How many guests can I bring?', 'faq FAQ007'],
  ['I need to reschedule my booking to Friday', 'faq FAQ005'],
  ['How do I cancel my reservation?', 'faq FAQ006'],
  ['Is there a booking fee?', 'faq FAQ009'],
  ['The app keeps crashing on my phone', 'faq FAQ011'],
  ['Can I reserve a table for tonight?', 'ai'],
  ['Can you help me with my coffee order feedback?', 'escalate'],
  ['Please reply by email, I want to know if my reservation is confirmed', 'faq FAQ012'],
  ['It is my anniversary, can you arrange something special?', 'faq FAQ016'],
  ['I was charged twice. Can I request a refund?', 'escalate'],
  ['Can I make a reservation for six people, change it later, and get a refund if I cancel at the last minute?', 'escalate'],
  ['Do you have vegan options?', 'escalate'],
  ['Does the app support Arabic?', 'faq FAQ017'],
  ['How do I create an account?', 'faq FAQ018'],
  ['What payment methods do you accept?', 'faq FAQ019'],
  ['Can I pay with Apple Pay?', 'faq FAQ019'],
  ['What is your refund policy?', 'faq FAQ020'],
  ['I want a refund for my booking', 'escalate'],
  ['How far in advance can I book?', 'ai'],
  ['How do I modify or cancel my reservation online?', 'ai'],
];

const fakeNow = { toFormat: () => '2026-10-31 12:00:00' };
let pass = 0;
for (const [msg, expected] of cases) {
  const form = { 'Customer Name': 'Test', 'Customer Email': 'test@example.com', 'Support Message': msg };
  const $ = () => ({ first: () => ({ json: form }) });
  const $input = { all: () => toRows(useNew).map(json => ({ json })) };
  const out = run($, $input, fakeNow)[0].json;
  const got = out.route === 'faq' ? 'faq ' + out.knowledge_source : out.route;
  const ok = got === expected;
  if (ok) pass++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + got.padEnd(12) + ' | want ' + expected.padEnd(12) + ' | ' + msg + (out.candidate_ids ? '  [AI candidates: ' + out.candidate_ids + ']' : ''));
}
console.log(`\n${pass}/${cases.length} as expected (${useNew ? 'improved' : 'current'} keywords)`);
