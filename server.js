// server.js
const express = require('express');
const axios = require('axios');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const app = express();

// Load environment variables
dotenv.config();

// Initialize cache
const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes default TTL

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/api/', limiter);

// Validate environment variables
const requiredEnvVars = [
    'OPENCAGE_API_KEY',
    'WEATHER_API_KEY',
    'TOMTOM_TRAFFIC_API_KEY',
    'PLACES_API_KEY'
];

requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        console.error(`Missing required environment variable: ${varName}`);
        process.exit(1);
    }
});

// API Routes
// Config endpoint
app.get('/api/config', (req, res) => {
    res.json({
        mapConfig: {
            initialView: [51.505, -0.09],
            zoom: 13
        },
        apiKeys: {
            places: process.env.PLACES_API_KEY,
            tomtom: process.env.TOMTOM_TRAFFIC_API_KEY
        }
    });
});

// Geocoding endpoint with caching
app.get('/api/geocode', async (req, res) => {
    try {
        const { q, lat, lon } = req.query;
        const cacheKey = q ? `geocode:${q}` : `reverse:${lat},${lon}`;
        const cachedResult = cache.get(cacheKey);

        if (cachedResult) {
            return res.json(cachedResult);
        }

        if (q) {
            const response = await axios.get('https://api.opencagedata.com/geocode/v1/json', {
                params: {
                    q,
                    key: process.env.OPENCAGE_API_KEY,
                    limit: 5
                }
            });

            const results = response.data.results.map(result => ({
                geometry: {
                    lat: result.geometry.lat,
                    lon: result.geometry.lng
                },
                address: result.formatted,
                components: result.components
            }));

            cache.set(cacheKey, { results });
            res.json({ results });
        } else if (lat && lon) {
            const response = await axios.get('https://api.opencagedata.com/geocode/v1/json', {
                params: {
                    q: `${lat}+${lon}`,
                    key: process.env.OPENCAGE_API_KEY,
                    limit: 1
                }
            });

            const result = {
                address: response.data.results[0].formatted,
                components: response.data.results[0].components
            };

            cache.set(cacheKey, result);
            res.json(result);
        } else {
            res.status(400).json({ error: 'Missing required parameters' });
        }
    } catch (error) {
        console.error('Geocoding error:', error);
        res.status(500).json({ error: 'Geocoding service error' });
    }
});

// Weather endpoint with caching
app.get('/api/weather', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        const cacheKey = `weather:${lat},${lon}`;
        const cachedResult = cache.get(cacheKey);

        if (cachedResult) {
            return res.json(cachedResult);
        }

        const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
            params: {
                lat,
                lon,
                appid: process.env.WEATHER_API_KEY,
                units: 'metric'
            }
        });

        const weatherData = {
            temperature: response.data.main.temp,
            description: response.data.weather[0].description,
            humidity: response.data.main.humidity,
            windSpeed: response.data.wind.speed,
            icon: response.data.weather[0].icon,
            feelsLike: response.data.main.feels_like,
            pressure: response.data.main.pressure,
            sunrise: new Date(response.data.sys.sunrise * 1000).toLocaleTimeString(),
            sunset: new Date(response.data.sys.sunset * 1000).toLocaleTimeString()
        };

        cache.set(cacheKey, { weather: weatherData });
        res.json({ weather: weatherData });
    } catch (error) {
        console.error('Weather error:', error);
        res.status(500).json({ error: 'Weather service error' });
    }
});

// Traffic endpoint
app.get('/api/traffic', async (req, res) => {
    try {
        const { bounds } = req.query;
        const response = await axios.get(
            `https://api.tomtom.com/traffic/services/4/flowSegmentData/relative/10/json`,
            {
                params: {
                    key: process.env.TOMTOM_TRAFFIC_API_KEY,
                    bbox: bounds
                }
            }
        );
        res.json(response.data);
    } catch (error) {
        console.error('Traffic error:', error);
        res.status(500).json({ error: 'Traffic service error' });
    }
});

// Places endpoint
app.get('/api/places', async (req, res) => {
    try {
        const { lat, lon, query } = req.query;
        const cacheKey = `places:${lat},${lon},${query}`;
        const cachedResult = cache.get(cacheKey);

        if (cachedResult) {
            return res.json(cachedResult);
        }

        const response = await axios.get('https://api.geoapify.com/v2/places', {
            params: {
                categories: query,
                filter: `circle:${lon},${lat},1000`,
                limit: 20,
                apiKey: process.env.PLACES_API_KEY
            }
        });

        const places = response.data.features.map(feature => ({
            name: feature.properties.name,
            category: feature.properties.category,
            address: feature.properties.formatted,
            coordinates: {
                lat: feature.geometry.coordinates[1],
                lon: feature.geometry.coordinates[0]
            }
        }));

        cache.set(cacheKey, { places });
        res.json({ places });
    } catch (error) {
        console.error('Places error:', error);
        res.status(500).json({ error: 'Places service error' });
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
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});