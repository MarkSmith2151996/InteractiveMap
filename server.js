const express = require('express');
const axios = require('axios');
const path = require('path');
const dotenv = require('dotenv');
const app = express();
const port = process.env.PORT || 3000;

dotenv.config();

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Validate environment variables
const requiredEnvVars = ['OPENCAGE_API_KEY', 'WEATHER_API_KEY', 'TOMTOM_TRAFFIC_API_KEY'];
requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        console.error(`Missing required environment variable: ${varName}`);
        process.exit(1);
    }
});

// Config endpoint for frontend
app.get('/api/config', (req, res) => {
    res.json({
        mapConfig: {
            initialView: [51.505, -0.09],
            zoom: 13
        }
    });
});

// Geocoding endpoint
app.get('/api/geocode', async (req, res) => {
    try {
        const { q, lat, lon } = req.query;
        let response;

        if (q) {
            response = await axios.get('https://api.opencagedata.com/geocode/v1/json', {
                params: {
                    q: q,
                    key: process.env.OPENCAGE_API_KEY,
                    limit: 1
                }
            });

            if (response.data.results && response.data.results.length > 0) {
                const result = response.data.results[0];
                res.json({
                    geometry: {
                        lat: result.geometry.lat,
                        lon: result.geometry.lng
                    },
                    address: result.formatted
                });
            } else {
                res.status(404).json({ error: 'Location not found' });
            }
        } else if (lat && lon) {
            response = await axios.get('https://api.opencagedata.com/geocode/v1/json', {
                params: {
                    q: `${lat}+${lon}`,
                    key: process.env.OPENCAGE_API_KEY,
                    limit: 1
                }
            });

            if (response.data.results && response.data.results.length > 0) {
                res.json({ address: response.data.results[0].formatted });
            } else {
                res.status(404).json({ error: 'Address not found' });
            }
        } else {
            res.status(400).json({ error: 'Missing required parameters' });
        }
    } catch (error) {
        console.error('Geocoding error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Geocoding service error', 
            details: error.response?.data || error.message 
        });
    }
});

// Weather endpoint
app.get('/api/weather', async (req, res) => {
    try {
        const { lat, lon } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({ error: 'Missing latitude or longitude' });
        }

        const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
            params: {
                lat: lat,
                lon: lon,
                appid: process.env.WEATHER_API_KEY,
                units: 'metric'
            }
        });

        res.json({
            weather: {
                temperature: response.data.main.temp,
                description: response.data.weather[0].description,
                humidity: response.data.main.humidity,
                windSpeed: response.data.wind.speed,
                icon: response.data.weather[0].icon
            }
        });
    } catch (error) {
        console.error('Weather error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Weather service error',
            details: error.response?.data || error.message 
        });
    }
});

// Traffic endpoint
app.get('/api/traffic', async (req, res) => {
    try {
        const { lat, lon } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({ error: 'Missing latitude or longitude' });
        }

        // Using TomTom's Flow Segments API instead of Incidents
        const response = await axios.get('https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json', {
            params: {
                point: `${lat},${lon}`,
                key: process.env.TOMTOM_TRAFFIC_API_KEY
            }
        });

        // Process the flow segment data
        const flowData = response.data.flowSegmentData;
        
        // Create a more user-friendly traffic info object
        const trafficInfo = {
            currentSpeed: flowData.currentSpeed,
            freeFlowSpeed: flowData.freeFlowSpeed,
            currentTravelTime: flowData.currentTravelTime,
            freeFlowTravelTime: flowData.freeFlowTravelTime,
            confidence: flowData.confidence,
            roadClosure: flowData.roadClosure,
            coordinates: flowData.coordinates
        };

        res.json({ trafficInfo });
    } catch (error) {
        console.error('Traffic error:', error.response?.data || error.message);
        // Check if the error is due to reaching API limit
        if (error.response?.status === 403) {
            return res.status(429).json({ 
                error: 'Traffic API quota exceeded',
                details: 'Daily API limit reached'
            });
        }
        res.status(500).json({ 
            error: 'Traffic service error',
            details: error.response?.data || error.message 
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});