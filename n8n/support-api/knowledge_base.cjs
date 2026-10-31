// Snapshot of the "Knowledge Base" sheet (read from n8n execution 16) plus
// the improved Keywords column proposed for it.
const rows = [
  ['FAQ001', 'App Features', 'Does the app support dark mode?', 'Yes. Go to Settings > Appearance > Dark Mode.', 'dark mode,theme,appearance',
    'dark mode,dark theme,night mode,theme,appearance'],
  ['FAQ002', 'Account', 'How do I reset my password?', 'On the sign-in screen, select Forgot Password and follow the email instructions.', 'password,reset,login',
    'password,reset password,forgot password,forgot my password,login,log in,sign in'],
  ['FAQ003', 'Account', 'Can I change my email address?', 'Yes. Open Profile > Account Settings > Email. You may need to verify the new address.', 'email,change,account',
    'change email,change my email,update email,update my email,new email,email address,account email'],
  ['FAQ004', 'Reservations', 'How do I make a reservation?', 'Tell us your preferred date, time, and number of guests. We will check live demo availability before confirming.', 'book,reserve,table',
    'make a reservation,new reservation,book a table,reserve a table,book,reserve'],
  ['FAQ005', 'Reservations', 'Can I change my reservation?', 'Request a change with your reservation ID and new preferred date or time. Changes depend on availability and must be confirmed.', 'reschedule,modify,booking',
    'reschedule,modify,change my reservation,change reservation,change my booking,change booking,change the date,change the time,move my reservation'],
  ['FAQ006', 'Reservations', 'Can I cancel my reservation?', 'Demo policy: cancellations are allowed up to 24 hours before the reservation. A cancellation is not complete until the system confirms it.', 'cancel,cancellation',
    'cancel,cancellation,cancelling,canceling'],
  ['FAQ007', 'Reservations', 'How many guests can I book for?', 'Demo policy: online reservations support 1 to 6 guests. For larger groups, contact support.', 'party size,guests,group',
    'party size,guest,group,large group,people,how many people'],
  ['FAQ008', 'Hours', 'What are your opening hours?', 'Demo hours: every day, 9:00 AM to 9:00 PM, local time.', 'hours,open,close',
    'opening hours,hour,open,close,closed,closing time,what time'],
  ['FAQ009', 'Billing', 'Do you charge a booking fee?', 'Demo policy: standard reservations have no booking fee. Any special event fee must be disclosed before confirmation.', 'fee,price,booking cost',
    'booking fee,fee,price,cost,booking cost'],
  ['FAQ010', 'Billing', 'How do I request a refund?', 'Contact support with your reservation ID and payment reference. Refund eligibility must be reviewed by a human agent.', 'refund,payment',
    'request a refund,want a refund,get a refund,refund request,money back'],
  ['FAQ011', 'Technical', 'The app is not loading. What should I do?', 'Check your internet connection, restart the app, and try again. If the problem continues, contact technical support.', 'crash,loading,error',
    'crash,crashing,not loading,won\'t load,loading,error,bug,not working,freeze,frozen'],
  ['FAQ012', 'Reservations', 'Is my reservation confirmed immediately?', 'No. It is confirmed only after the availability check and successful booking save. You will receive a reservation ID.', 'confirmed,status,booking',
    'confirmed,confirmation,booking status,reservation status'],
  ['FAQ013', 'Support', 'How do I contact a human agent?', 'Ask to speak with support. We will create a support ticket and notify the team.', 'human,agent,help',
    'human,agent,real person,talk to someone,speak to someone,customer service'],
  ['FAQ014', 'Reservations', 'Can I reserve for today?', 'Same-day reservations may be possible. Provide the time and party size so we can check current availability.', 'today,last minute',
    'today,tonight,same day,last minute'],
  ['FAQ015', 'Privacy', 'Can you share another customer’s reservation?', 'No. We cannot disclose another customer’s booking or account details.', 'privacy,other customer',
    'privacy,other customer,another customer,someone else'],
  ['FAQ016', 'Reservations', 'Can I request a special occasion?', 'Yes. Add a note with your booking request. Special arrangements are not guaranteed until confirmed by the team.', 'birthday,anniversary,special',
    'birthday,anniversary,special occasion,celebration,surprise'],
  // New fictional demo FAQs
  ['FAQ017', 'App Features', 'Which languages does the app support?', 'Demo policy: the app and our support assistant are available in English and Arabic. Switch language in Settings > Language.', null,
    'language,arabic,english,switch language,change language,multilingual'],
  ['FAQ018', 'Account', 'How do I create an account?', 'Demo policy: tap Sign Up, enter your name, email and a password, then open the verification email we send you to activate the account.', null,
    'create an account,create account,sign up,signup,register,registration,new account,open an account'],
  ['FAQ019', 'Billing', 'What payment methods do you accept?', 'Demo policy: we accept Visa, Mastercard, Apple Pay and cash at the venue. Standard reservations do not require payment in advance.', null,
    'payment method,payment option,how can i pay,pay by,credit card,debit card,apple pay,cash,visa,mastercard'],
  ['FAQ020', 'Billing', 'What is your refund policy?', 'Demo policy: special-event deposits are refundable if you cancel at least 24 hours before your reservation. Approved refunds go back to the original payment method within 5-10 business days. Individual refund requests are reviewed by our team.', null,
    'refund policy,refund rules,how do refunds work,how long do refunds take,refundable,deposit'],
  ['FAQ021', 'Reservations', 'What is your reservation policy?', 'Demo policy: online reservations are for 1 to 6 guests, up to 30 days in advance, in one-hour slots. Tables are held for 15 minutes after the booking time.', null,
    'reservation policy,booking policy,how far in advance,advance booking,hold my table,grace period,running late'],
  ['FAQ022', 'Reservations', 'How do I modify or cancel my reservation online?', 'Demo policy: open Book a table > Manage booking, enter your reservation ID and email, then change or cancel it. Online changes and cancellations are possible up to 24 hours before the booking.', null,
    'manage booking,manage my reservation,modify or cancel,change or cancel,cancel online,modify online,reservation id'],
];

// useNew=false gives the sheet as it was before the keyword update (no new FAQs).
const toRows = useNew => rows
  .filter(r => useNew || r[4] !== null)
  .map(([ID, Category, Question, Answer, oldK, newK]) => ({ ID, Category, Question, Answer, Keywords: useNew ? newK : oldK }));
module.exports = { rows, toRows };
