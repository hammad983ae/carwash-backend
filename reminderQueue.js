// reminderQueue.js
require('dotenv').config();
const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const { MailerSend, EmailParams, Recipient } = require('mailersend');

// 🔌 Redis connection
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// 📨 MailerSend setup
const mailerSend = new MailerSend({ apiKey: process.env.MAILERSEND_API_KEY });

// 🎯 Create Queue
const reminderQueue = new Queue('reminderQueue', { connection });

// 📅 Schedule reminder function
async function scheduleReminderEmail(booking) {
  const bookingDateTime = new Date(`${booking.date}T${booking.time}`);
  const reminderTime = new Date(bookingDateTime.getTime() - 24 * 60 * 60 * 1000);
  const delay = reminderTime.getTime() - Date.now();

  if (delay > 0) {
    await reminderQueue.add('sendReminder', booking, { delay });
    console.log(`📬 Reminder scheduled for ${booking.customerEmail} in ${Math.floor(delay / 60000)} minutes`);
  } else {
    console.warn(`⚠️ Booking too soon or already passed: ${booking.customerEmail}`);
  }
}

// 🧠 Worker that sends the actual reminder
new Worker(
  'reminderQueue',
  async job => {
    const b = job.data;

    const reminderParams = new EmailParams({
      from: { email: 'no-reply@wavespoole.com', name: 'Your Car Wash' },
      to: [new Recipient(b.customerEmail, b.customerName)],
      subject: '⏰ Reminder: Your Car Wash Appointment is Tomorrow 🚘',
      html: `
//         <h2>Hi ${booking.customerName},</h2>
//         <p>Just a quick reminder that you’ve got a car wash booking with us tomorrow.</p>
    
//         <p>Here are your appointment details:</p>
    
//         <p>📍 <strong>Location:</strong><br>
//         Waves Hand Car Wash – Tesco Extra Car Park<br>
//         Tower Park, Poole, BH12 4NX</p>
    
//         <p>🚗 <strong>Vehicle:</strong> ${booking.vehicleMake} ${booking.vehicleModel}</p>
//         <p>🧼 <strong>Package:</strong> ${booking.packageName}</p>
//         <p>➕ <strong>Extras:</strong> ${booking.extras?.length ? booking.extras.join(', ') : 'None'}</p>
//         <p>📅 <strong>Date & Time:</strong> ${booking.date} at ${booking.time}</p>
//         <p>⏳ <strong>Estimated Duration:</strong> ${booking.estimatedTime}</p>
    
//         <p>If you need to cancel or reschedule, please give us a call on <strong>07500 182276</strong>.</p>
    
//         <p>We’ll see you then – your car’s in good hands.</p>
    
//         <p>Best,<br>
//         The Waves Poole Team</p>
//       `,
      text: `Hi ${booking.customerName},
    
    Just a quick reminder that you’ve got a car wash booking with us tomorrow.
    
    Here are your appointment details:
    
    📍 Location:
    Waves Hand Car Wash – Tesco Extra Car Park
    Tower Park, Poole, BH12 4NX
    
    🚗 Vehicle: ${booking.vehicleMake} ${booking.vehicleModel}
    🧼 Package: ${booking.packageName}
    ➕ Extras: ${booking.extras?.length ? booking.extras.join(', ') : 'None'}
    📅 Date & Time: ${booking.date} at ${booking.time}
    ⏳ Estimated Duration: ${booking.estimatedTime}
    
    If you need to cancel or reschedule, please give us a call on 07500 182276.
    
    We’ll see you then – your car’s in good hands.
    
    Best,  
    The Waves Poole Team`

    });

    try {
      await mailerSend.email.send(reminderParams);
      console.log(`✅ Email sent to ${b.customerEmail}`);
    } catch (err) {
      console.error('❌ Email sending failed:', err?.response?.body || err.message);
    }
  },
  { connection }
);

// ✅ Export the function so index.js can use it
module.exports = { scheduleReminderEmail };
