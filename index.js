const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.json({
    message: 'Vehicle API Server',
    endpoints: {
      'GET /api/vehicle?vrm=<registration>': 'Get vehicle dimensions and classify by size'
    }
  });
});

app.get('/api/vehicle', async (req, res) => {
  const { vrm } = req.query;
  if (!vrm) return res.status(400).json({ error: 'VRM is required' });

  try {
    const result = await axios.get('https://uk.api.vehicledataglobal.com/r2/lookup', {
      params: {
        ApiKey: '43E85F53-568B-47F7-8650-708BE3DCC094',
        PackageName: 'dimensions',
        Vrm: vrm
      }
    });

    const dims = result.data?.Results?.ModelDetails?.Dimensions;
    const bodyType = result.data?.Results?.VehicleDetails?.BodyType;
    const make = result.data?.Results?.ModelDetails?.ModelIdentification?.Make || 'Unknown';
    const model = result.data?.Results?.ModelDetails?.ModelIdentification?.Model || 'Unknown';

    if (!dims?.LengthMm || !dims?.WidthMm || !dims?.HeightMm) {
      return res.status(404).json({ error: 'Missing vehicle dimensions' });
    }

    const { LengthMm, WidthMm, HeightMm } = dims;

    // 🚗 Vehicle classification logic
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
        category
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
        category
      });
    }
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Vehicle lookup failed' });
  }
});

const port = 5001;
app.listen(port, () => console.log(`✅ Backend running at http://localhost:${port}`));
