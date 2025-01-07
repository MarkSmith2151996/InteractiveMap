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

// Mock data
const mockTrafficData = {
    traffic: [
        {
            id: 1,
            description: "Heavy traffic on Main Street",
            severity: "high",
            location: "Main Street",
            speed: 25,
            delay: 15
        },
        {
            id: 2,
            description: "Normal flow on Highway 1",
            severity: "low",
            location: "Highway 1",
            speed: 65,
            delay: 0
        }
    ]
};

const mockRoadworkData = {
    roadwork: [
        {
            id: 1,
            description: "Road repairs on Oak Avenue",
            startDate: "2024-01-07",
            endDate: "2024-01-14",
            status: "ongoing",
            impact: "moderate"
        },
        {
            id: 2,
            description: "Bridge maintenance on River Road",
            startDate: "2024-01-10",
            endDate: "2024-01-20",
            status: "scheduled",
            impact: "high"
        }
    ]
};

const mockIncidentsData = {
    incidents: [
        {
            id: 1,
            description: "Minor accident on Pine Street",
            type: "accident",
            severity: "low",
            timestamp: "2024-01-07T10:30:00",
            status: "cleared"
        },
        {
            id: 2,
            description: "Vehicle breakdown on Cedar Lane",
            type: "breakdown",
            severity: "medium",
            timestamp: "2024-01-07T11:15:00",
            status: "active"
        }
    ]
};

// Validate environment variables
const requiredEnvVars = ['OPENCAGE_API_KEY', 'WEATHER_API_KEY', 'TOMTOM_TRAFFIC_API_KEY', 'PLACES_API_KEY'];
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

// Updated Traffic endpoint with mock data fallback
app.get('/api/traffic', async (req, res) => {
    try {
        const { lat, lon } = req.query;

        if (!lat || !lon) {
            return res.json(mockTrafficData);
        }

        const response = await axios.get('https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json', {
            params: {
                point: `${lat},${lon}`,
                key: process.env.TOMTOM_TRAFFIC_API_KEY
            }
        });

        console.log('Traffic API response:', response.data);

        const flowData = response.data.flowSegmentData;

        res.json({
            currentSpeed: flowData.currentSpeed,
            freeFlowSpeed: flowData.freeFlowSpeed,
            currentTravelTime: flowData.currentTravelTime,
            freeFlowTravelTime: flowData.freeFlowTravelTime,
            confidence: flowData.confidence,
            roadClosure: flowData.roadClosure,
            coordinates: flowData.coordinates
        });
    } catch (error) {
        console.error('Traffic endpoint error:', error.response?.data || error.message);
        // Fallback to mock data on error
        res.json(mockTrafficData);
    }
});

// Updated Roadwork endpoint with mock data
app.get('/api/roadwork', (req, res) => {
    res.json(mockRoadworkData);
});

// Updated Incidents endpoint with mock data
app.get('/api/incidents', (req, res) => {
    res.json(mockIncidentsData);
});

// New endpoint: Nearby Places
app.get('/api/nearby', async (req, res) => {
    try {
        const { lat, lon } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({ error: 'Missing latitude or longitude' });
        }

        const response = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', {
            params: {
                location: `${lat},${lon}`,
                radius: 1500,
                key: process.env.PLACES_API_KEY
            }
        });

        const places = response.data.results.map(place => ({
            name: place.name,
            address: place.vicinity,
            rating: place.rating
        }));

        res.json({ places });
    } catch (error) {
        console.error('Nearby Places error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'Nearby places service error',
            details: error.response?.data || error.message
        });
    }
});

// Route Endpoints 
// Add this to server.js just before the error handling middleware
app.get('/api/route', async (req, res) => {
    try {
        const { start, end } = req.query;
        
        if (!start || !end) {
            return res.status(400).json({ error: 'Missing start or end location' });
        }

        // Use Nominatim for geocoding
        const [startLocation, endLocation] = await Promise.all([
            axios.get('https://nominatim.openstreetmap.org/search', {
                params: {
                    q: start,
                    format: 'json',
                    limit: 1
                },
                headers: {
                    'User-Agent': process.env.NOMINATIM_USER_AGENT || 'YourAppName/1.0'
                }
            }),
            axios.get('https://nominatim.openstreetmap.org/search', {
                params: {
                    q: end,
                    format: 'json',
                    limit: 1
                },
                headers: {
                    'User-Agent': process.env.NOMINATIM_USER_AGENT || 'YourAppName/1.0'
                }
            })
        ]);

        if (!startLocation.data[0] || !endLocation.data[0]) {
            return res.status(404).json({ error: 'One or both locations not found' });
        }

        res.json({
            route: {
                start: {
                    lat: parseFloat(startLocation.data[0].lat),
                    lon: parseFloat(startLocation.data[0].lon),
                    display_name: startLocation.data[0].display_name
                },
                end: {
                    lat: parseFloat(endLocation.data[0].lat),
                    lon: parseFloat(endLocation.data[0].lon),
                    display_name: endLocation.data[0].display_name
                }
            }
        });

    } catch (error) {
        console.error('Route error:', error);
        res.status(500).json({
            error: 'Route calculation error',
            details: error.message
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

// Middleware for logging requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Mock data enabled for traffic, roadwork, and incidents endpoints');
});