const express = require('express');
const axios = require('axios');
const path = require('path');
require('dotenv').config(); // Use .env for storing API keys

const app = express();
const port = 10000;

// Load API keys from .env
const API_KEY = process.env.OPENCAGE_API_KEY;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const TOMTOM_TRAFFIC_API_KEY = process.env.TOMTOM_TRAFFIC_API_KEY;

// Serve static files (for front-end)
app.use(express.static(path.join(__dirname, 'public')));

// Route to handle geocoding via backend proxy
app.get('/api/geocode', async (req, res) => {
  const { lat, lon } = req.query;

  try {
    const geocodeUrl = `https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lon}&key=${API_KEY}`;
    const geocodeResponse = await axios.get(geocodeUrl);

    const address = geocodeResponse.data.results[0]?.formatted || 'Address not found';
    res.json({ address });
  } catch (error) {
    console.error('Error fetching geocode data:', error.message);
    res.status(500).json({ error: 'Failed to fetch geocode data' });
  }
});

// Route to handle weather data via backend proxy
app.get('/api/weather', async (req, res) => {
  const { lat, lon } = req.query;

  try {
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`;
    const weatherResponse = await axios.get(weatherUrl);

    const weather = {
      temperature: Math.round(weatherResponse.data.main.temp),
      description: weatherResponse.data.weather[0]?.description || 'No data',
      humidity: weatherResponse.data.main.humidity
    };

    res.json({ weather });
  } catch (error) {
    console.error('Error fetching weather data:', error.message);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

// Route to handle traffic data via backend proxy
app.get('/api/traffic', async (req, res) => {
  const { lat, lon } = req.query;

  try {
    const trafficUrl = `https://api.tomtom.com/traffic/services/4/incidentDetails?key=${TOMTOM_TRAFFIC_API_KEY}&lat=${lat}&lon=${lon}&radius=5000`;
    const trafficResponse = await axios.get(trafficUrl);

    const incidents = trafficResponse.data.incidents || [];
    const trafficInfo = incidents.map(incident => ({
      type: incident.type,
      description: incident.shortDescription,
      location: incident.location.address?.freeformAddress || 'No location data'
    }));

    res.json({ trafficInfo });
  } catch (error) {
    console.error('Error fetching traffic data:', error.message);
    res.status(500).json({ error: 'Failed to fetch traffic data' });
  }
});

// Consolidated route for all location-related info
app.get('/location-info', async (req, res) => {
  const { lat, lon } = req.query;

  try {
    // Fetch data using backend proxies
    const [geocode, weather, traffic] = await Promise.all([
      axios.get(`http://localhost:${port}/api/geocode?lat=${lat}&lon=${lon}`),
      axios.get(`http://localhost:${port}/api/weather?lat=${lat}&lon=${lon}`),
      axios.get(`http://localhost:${port}/api/traffic?lat=${lat}&lon=${lon}`)
    ]);

    res.json({
      address: geocode.data.address,
      weather: weather.data.weather,
      trafficInfo: traffic.data.trafficInfo
    });
  } catch (error) {
    console.error('Error fetching consolidated location info:', error.message);
    res.status(500).json({ error: 'Failed to fetch consolidated location data' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
