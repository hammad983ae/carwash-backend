require('dotenv').config(); // ✅ Load environment variables
const express = require('express');
const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const crypto = require('crypto'); // ✅ For hashing email (Meta CAPI)
const { MailerSend, EmailParams, Recipient } = require('mailersend');
const mailerSend = new MailerSend({ apiKey: process.env.MAILERSEND_API_KEY });

const app = express();
app.use(express.json());
app.use(cors());

// ------------------ Meta Conversions API ------------------
const META_PIXEL_ID = process.env.META_PIXEL_ID;
const META_CAPI_TOKEN = process.env.META_CAPI_TOKEN;

function hashEmail(email) {
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

async function sendMetaConversionEvent({ eventName, email }) {
  if (!META_PIXEL_ID || !META_CAPI_TOKEN) {
    console.warn('⚠️ Meta Pixel ID or Token missing. Skipping CAPI.');
    return;
  }

  try {
    const res = await axios.post(
      `https://graph.facebook.com/v17.0/${META_PIXEL_ID}/events?access_token=${META_CAPI_TOKEN}`,
      {
        data: [
          {
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            action_source: "website",
            user_data: {
              em: [hashEmail(email)]
            }
          }
        ]
      }
    );
    console.log("✅ Meta CAPI event sent:", res.data);
  } catch (err) {
    console.error("❌ Meta CAPI error:", err.response?.data || err.message);
  }
}

// ------------------ ROUTES ------------------

app.get('/', (req, res) => {
  res.json({
    message: 'Vehicle API Server',
    endpoints: {
      'GET /api/vehicle?vrm=<registration>': 'Get vehicle dimensions and classify by size',
    },
  });
});

app.get('/api/vehicle', async (req, res) => {
  const { vrm } = req.query;
  if (!vrm) return res.status(400).json({ error: 'VRM is required' });

  try {
    const result = await axios.get('https://uk.api.vehicledataglobal.com/r2/lookup', {
      params: {
        ApiKey: process.env.UKVD_API_KEY,
        PackageName: 'dimensions',
        Vrm: vrm,
      },
    });

    const dims = result.data?.Results?.ModelDetails?.Dimensions;
    const modelClassification = result.data?.Results?.ModelDetails?.ModelClassification || {};
    const taxationClass = modelClassification.TaxationClass || 'Unknown';
    const make = result.data?.Results?.ModelDetails?.ModelIdentification?.Make || 'Unknown';
    const model = result.data?.Results?.ModelDetails?.ModelIdentification?.Model || 'Unknown';

    if (!dims?.LengthMm || !dims?.WidthMm || !dims?.HeightMm) {
      return res.status(404).json({ error: 'Missing vehicle dimensions' });
    }

    const { LengthMm, WidthMm, HeightMm } = dims;

    if (taxationClass === 'LCV') {
      const lengthCm = LengthMm / 10;
      const category = lengthCm <= 480 ? 'Van volume 1' : 'Van volume 2/3';

      return res.json({
        vrm,
        type: 'van',
        make,
        model,
        vehicleClass: 'LCV',
        lengthCm: parseFloat(lengthCm.toFixed(1)),
        category,
      });
    } else {
      const volumeM3 = (LengthMm * WidthMm * HeightMm) / 1_000_000_000;

      let category;
      if (volumeM3 < 9.7) category = 'Volume 1';
      else if (volumeM3 <= 11.3) category = 'Volume 2';
      else if (volumeM3 <= 13.7) category = 'Volume 3';
      else category = 'Volume 4';

      return res.json({
        vrm,
        type: 'car',
        make,
        model,
        vehicleClass: taxationClass,
        volumeM3: parseFloat(volumeM3.toFixed(2)),
        category,
      });
    }
  } catch (error) {
    console.error('Vehicle lookup failed:', error.message || error);
    res.status(500).json({ error: 'Vehicle lookup failed' });
  }
});

app.post('/api/create-payment-intent', async (req, res) => {
  const { amount } = req.body;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert GBP to pence
      currency: 'gbp',
      automatic_payment_methods: { enabled: true },
    });

    res.send({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Payment intent creation failed' });
  }
});

app.post('/api/send-confirmation', async (req, res) => {
  const booking = req.body;

  if (!booking?.customerEmail || !booking?.customerName) {
    return res.status(400).json({ error: 'Missing customer name or email' });
  }

  try {
    const emailParams = new EmailParams({
      from: {
        email: 'no-reply@wavespoole.com/', // Replace with your MailerSend verified sender
        name: 'Your Car Wash'
      },
      to: [
        new Recipient(booking.customerEmail, booking.customerName)
      ],
      subject: 'Booking Confirmation – Waves Hand Car Wash Poole',
      html: `
      <h2>Hi ${booking.customerName},</h2>
      <p>Thanks for booking with us!</p>
      <p>Here are the details of your appointment:</p>
  
      <p>📍 <strong>Location:</strong><br>
      Waves Hand Car Wash – Tesco Extra Car Park<br>
      Tower Park, Poole, BH12 4NX</p>
  
      <p>🚗 <strong>Vehicle:</strong> ${booking.vehicleMake} ${booking.vehicleModel}</p>
      <p>🧼 <strong>Package Booked:</strong> ${booking.packageName}</p>
      <p>➕ <strong>Extras:</strong> ${booking.extras?.length ? booking.extras.join(', ') : 'None'}</p>
      <p>📅 <strong>Date & Time:</strong> ${booking.date} at ${booking.time}</p>
      <p>⏳ <strong>Estimated Duration:</strong> ${booking.estimatedTime}</p>
  
      <p>If you need to cancel or make changes to your booking, please call us directly on <strong>07500 182276</strong>.</p>
  
      <p>We’re looking forward to giving your car the care it deserves – see you soon!</p>
  
      <p>Warm regards,<br>
      The Waves Poole Team</p>
    `,
    text: `Hi ${booking.customerName},
  
  Thanks for booking with us!
  
  Here are the details of your appointment:
  
  📍 Location:
  Waves Hand Car Wash – Tesco Extra Car Park
  Tower Park, Poole, BH12 4NX
  
  🚗 Vehicle: ${booking.vehicleMake} ${booking.vehicleModel}
  🧼 Package Booked: ${booking.packageName}
  ➕ Extras: ${booking.extras?.length ? booking.extras.join(', ') : 'None'}
  📅 Date & Time: ${booking.date} at ${booking.time}
  ⏳ Estimated Duration: ${booking.estimatedTime}
  
  If you need to cancel or make changes to your booking, please call us directly on 07500 182276.
  
  We’re looking forward to giving your car the care it deserves – see you soon!
  
  Warm regards,  
  The Waves Poole Team`
    });

    await mailerSend.email.send(emailParams);

    // After await mailerSend.email.send(emailParams);
const bookingTime = new Date(`${booking.date}T${booking.time}`);
const reminderTime = new Date(bookingTime.getTime() - 24 * 60 * 60 * 1000); // 24 hours before
const timeUntilReminder = reminderTime - Date.now();

if (timeUntilReminder > 0) {
  setTimeout(async () => {
    try {
      const reminderParams = new EmailParams({
        from: {
          email: 'no-reply@wavespoole.com',
          name: 'Your Car Wash'
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
      console.error('❌ Reminder email failed:', err?.response?.body || err.message || err);
    }
  }, timeUntilReminder);
} else {
  console.warn(`⚠️ Booking is too soon or already passed. Skipping reminder.`);
}


    // ✅ Fire Meta Conversion API event
    await sendMetaConversionEvent({
      eventName: 'Purchase',
      email: booking.customerEmail
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ MailerSend error:', err?.response?.body || err.message || err);
    res.status(500).json({ error: 'Failed to send confirmation email' });
  }
});

app.post('/api/refund', async (req, res) => {
  const { paymentIntentId, bookingCreatedAt } = req.body;

  if (!paymentIntentId || !bookingCreatedAt) {
    return res.status(400).json({ error: 'Missing paymentIntentId or bookingCreatedAt' });
  }

  try {
    const bookingTime = new Date(bookingCreatedAt);
    const now = new Date();
    const hoursSinceBooking = (now - bookingTime) / (1000 * 60 * 60);

    if (hoursSinceBooking > 24) {
      return res.status(403).json({ error: 'Refund only allowed within 24 hours of booking' });
    }

    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId
    });

    return res.status(200).json({
      message: 'Refund processed',
      refundId: refund.id,
      status: refund.status
    });
  } catch (err) {
    console.error('❌ Refund error:', err.message || err);
    res.status(500).json({ error: 'Refund failed' });
  }
});

// ------------------ START SERVER ------------------

const port = 5001;
app.listen(port, () => console.log(`✅ Backend running at http://localhost:${port}`));
