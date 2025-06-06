require('dotenv').config(); // ✅ Load environment variables
const express = require('express');
const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');

// ✅ MailerSend
const { MailerSend, EmailParams, Recipient } = require('mailersend');
const mailerSend = new MailerSend({ apiKey: process.env.MAILERSEND_API_KEY });

const app = express();
app.use(express.json());
app.use(cors());

// ------------------ ROUTES ------------------

app.get('/', (req, res) => {
  res.json({
    message: 'Vehicle API Server',
    endpoints: {
      'GET /api/vehicle?vrm=<registration>': 'Get vehicle dimensions and classify by size',
    },
  });
});

// ✅ Vehicle Lookup
app.get('/api/vehicle', async (req, res) => {
  const { vrm } = req.query;
  if (!vrm) return res.status(400).json({ error: 'VRM is required' });

  try {
    const result = await axios.get('https://uk.api.vehicledataglobal.com/r2/lookup', {
      params: {
        ApiKey: '308bbf41-9c4e-49b6-b519-ef273ad2f56d',
        PackageName: 'dimensions',
        Vrm: vrm,
      },
    });

    const dims = result.data?.Results?.ModelDetails?.Dimensions;
    const bodyType = result.data?.Results?.VehicleDetails?.BodyType;
    const make = result.data?.Results?.ModelDetails?.ModelIdentification?.Make || 'Unknown';
    const model = result.data?.Results?.ModelDetails?.ModelIdentification?.Model || 'Unknown';

    if (!dims?.LengthMm || !dims?.WidthMm || !dims?.HeightMm) {
      return res.status(404).json({ error: 'Missing vehicle dimensions' });
    }

    const { LengthMm, WidthMm, HeightMm } = dims;
    const isVan = bodyType?.toLowerCase().includes('van');

    if (isVan) {
      const lengthCm = LengthMm / 10;
      const category = lengthCm <= 480 ? 'Van 1' : 'Van 2/3';

      return res.json({
        vrm,
        type: 'van',
        make,
        model,
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
        volumeM3: parseFloat(volumeM3.toFixed(2)),
        category,
      });
    }
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Vehicle lookup failed' });
  }
});

// ✅ Stripe Payment Intent
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

// ✅ MailerSend Booking Confirmation
app.post('/api/send-confirmation', async (req, res) => {
  const booking = req.body;

  if (!booking?.customerEmail || !booking?.customerName) {
    return res.status(400).json({ error: 'Missing customer name or email' });
  }

  try {
    const emailParams = new EmailParams({
      from: {
        email: 'no-reply@test-y7zpl98nxeo45vx6.mlsender.net', // Replace with your MailerSend verified sender
        name: 'Your Car Wash'
      },
      to: [
        new Recipient(booking.customerEmail, booking.customerName)
      ],
      subject: '✅ Your Car Wash Booking is Confirmed',
      html: `
        <h2>Hi ${booking.customerName},</h2>
        <p>Your booking is confirmed for <strong>${booking.date}</strong> at <strong>${booking.time}</strong>.</p>
        <p>Service: ${booking.service} - £${booking.price}</p>
        <p>Total: £${booking.totalPrice || booking.price}</p>
        <p>Thank you for choosing us!</p>
      `,
      text: `Hi ${booking.customerName}, your car wash is booked for ${booking.date} at ${booking.time}.`
    });

    await mailerSend.email.send(emailParams);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ MailerSend error:', err?.response?.body || err.message || err);
    res.status(500).json({ error: 'Failed to send confirmation email' });
  }
});

// ------------------ START SERVER ------------------

const port = 5001;
app.listen(port, () => console.log(`✅ Backend running at http://localhost:${port}`));
