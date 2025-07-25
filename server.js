const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const API_KEY = process.env.GEOCODING_API_KEY;

app.use(cors());

app.get('/api/geocode', async (req, res) => {
  const address = req.query.address;
  if (!address) return res.status(400).json({ error: 'Missing address' });
  if (!API_KEY) return res.status(500).json({ error: 'API Key not set on server' });
  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { address, key: API_KEY },
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: 'Geocoding failed', details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy server running on port ${PORT}`)); 