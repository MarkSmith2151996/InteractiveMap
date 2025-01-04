// server.js
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const port = 10000;

// API Keys ( move these to .env file for security)
const API_KEY = 'eb74122e726742799140125dc8efc149';  // OpenCage API key
const WEATHER_API_KEY = '849faba731d18dfcae62c703c094c63e'; // Weather API key
const TOMTOM_TRAFFIC_API_KEY = 'qzfGbMUcpj7bZbGVf07O8k4ZKuPFCRRe'; // TomTom Traffic API key

// Serve static files (for front-end)
app.use(express.static(path.join(__dirname, 'public')));

// Route to handle geolocation, weather, and traffic API calls
app.get('/location-info', async (req, res) => {
  const { lat, lon } = req.query;  // Expecting lat and lon to be passed in query parameters
  
  try {
    const geocodeUrl = `https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lon}&key=${API_KEY}`;
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`;
    const trafficUrl = `https://api.tomtom.com/traffic/services/4/incidentDetails?key=${TOMTOM_TRAFFIC_API_KEY}&lat=${lat}&lon=${lon}&radius=5000`; // 5 km radius

    // Make API requests
    const [geocodeResponse, weatherResponse, trafficResponse] = await Promise.all([
      axios.get(geocodeUrl),
      axios.get(weatherUrl),
      axios.get(trafficUrl)
    ]);

    // Extract necessary data
    const address = geocodeResponse.data.results[0]?.formatted || 'Address not found';
    const weather = weatherResponse.data;
    const incidents = trafficResponse.data.incidents || [];

    // Send response back to the client
    res.json({
      address,
      weather: {
        temperature: Math.round(weather.main.temp),
        description: weather.weather[0]?.description || 'No data',
        humidity: weather.main.humidity
      },
      trafficInfo: incidents.map(incident => ({
        type: incident.type,
        description: incident.shortDescription,
        location: incident.location.address.freeformAddress
      }))
    });
  } catch (error) {
    console.error('Error fetching location info:', error);
    res.status(500).json({ error: 'Error retrieving location data' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
