require('dotenv').config();
console.log('API KEY:', process.env.MAILERSEND_API_KEY); // 👈 Print it out

const { MailerSend, EmailParams, Recipient } = require('mailersend');

const mailerSend = new MailerSend({ apiKey: process.env.MAILERSEND_API_KEY });

const emailParams = new EmailParams({
  from: { email: 'no-reply@wavespoole.com', name: 'Test Sender' },
  to: [new Recipient('hammad.work983@gmail.com', 'Your Name')],
  subject: 'Test Email',
  html: '<p>Hello from MailerSend!</p>',
  text: 'Hello from MailerSend!',
});

mailerSend.email.send(emailParams)
  .then(() => console.log('✅ Test email sent'))
  .catch(err => console.error('❌ MailerSend failed:', err?.response?.body || err.message));
