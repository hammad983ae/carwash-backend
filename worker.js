require('dotenv').config();
const Queue = require('bull');
const { MailerSend, EmailParams, Recipient } = require('mailersend');
const mailerSend = new MailerSend({ apiKey: process.env.MAILERSEND_API_KEY });

// Initialize the same queue as in the main app
const reminderQueue = new Queue('reminder-emails', {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
    },
  });
  
  reminderQueue.on('waiting', (jobId) => {
    console.log(`⏳ Job waiting: ${jobId}`);
  });
  
  reminderQueue.on('active', (job) => {
    console.log(`🚀 Job is being processed: ${job.id}`);
  });
  
  reminderQueue.on('completed', (job) => {
    console.log(`✅ Job completed: ${job.id}`);
  });
  
  reminderQueue.on('failed', (job, err) => {
    console.error(`❌ Job failed: ${job.id}`, err.message || err);
  });
  

// Process jobs from the queue
reminderQueue.process(async (job) => {
  const { booking } = job.data;

  try {
    console.log('MailerSend API Key:', process.env.MAILERSEND_API_KEY ? 'Loaded' : 'Missing');
    console.log('Attempting to send reminder email to:', booking.customerEmail);

    const reminderParams = new EmailParams({
      from: {
        email: 'no-reply@wavespoole.com', // Replace with your verified MailerSend sender
        name: 'Your Car Wash',
      },
      to: [new Recipient(booking.customerEmail, booking.customerName)],
      subject: '⏰ Reminder: Your Car Wash Appointment is Tomorrow 🚘',
      html: `
        <h2>Hi ${booking.customerName},</h2>
        <p>Just a quick reminder that you’ve got a car wash booking with us tomorrow.</p>
        <p>Here are your appointment details:</p>
        <p>📍 <strong>Location:</strong><br>
        Waves Hand Car Wash – Tesco Extra Car Park<br>
        Tower Park, Poole, BH12 4NX</p>
        <p>🚗 <strong>Vehicle:</strong> ${booking.vehicleMake} ${booking.vehicleModel}</p>
        <p>🧼 <strong>Package:</strong> ${booking.packageName}</p>
        <p>➕ <strong>Extras:</strong> ${booking.extras?.length ? booking.extras.join(', ') : 'None'}</p>
        <p>📅 <strong>Date & Time:</strong> ${booking.date} at ${booking.time}</p>
        <p>⏳ <strong>Estimated Duration:</strong> ${booking.estimatedTime}</p>
        <p>If you need to cancel or reschedule, please give us a call on <strong>07500 182276</strong>.</p>
        <p>We’ll see you then – your car’s in good hands.</p>
        <p>Best,<br>
        The Waves Poole Team</p>
      `,
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

    await mailerSend.email.send(reminderParams);
    console.log(`✅ Reminder sent to ${booking.customerEmail}`);
  } catch (err) {
    console.error('❌ Reminder email error:', JSON.stringify(err, null, 2));
    throw err; // Let Bull handle retries
  }
});

console.log('✅ Reminder worker running...');