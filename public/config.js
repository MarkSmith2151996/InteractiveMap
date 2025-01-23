// config.js

export const mapConfig = {
    defaultView: {
        lat: 51.505,
        lng: -0.09,
        zoom: 13
    },
    
    tileLayer: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        crossOrigin: true,
        useCache: true,
        maxRequests: 6,
        maxAge: 24 * 60 * 60 * 1000
    },

    geocodingService: {
        nominatim: {
            baseUrl: 'https://nominatim.openstreetmap.org',
            userAgent: window.__ENV__.NOMINATIM_USER_AGENT
        },
        opencage: {
            baseUrl: 'https://api.opencagedata.com/geocode/v1/json',
            apiKey: window.__ENV__.OPENCAGE_API_KEY
        }
    },

    routing: {
        osrm: {
            serviceUrl: 'https://router.project-osrm.org/route/v1'
        },
        tomtom: {
            baseUrl: 'https://api.tomtom.com/routing/1/calculateRoute',
            apiKey: window.__ENV__.TOMTOM_TRAFFIC_API_KEY
        }
    },

    traffic: {
        tomtom: {
            tileUrl: 'https://{s}.api.tomtom.com/traffic/map/4/tile/{z}/{x}/{y}.png',
            apiKey: window.__ENV__.TOMTOM_TRAFFIC_API_KEY,
            subdomains: ['1', '2', '3', '4']
        }
    },

    weather: {
        openweather: {
            baseUrl: 'https://api.openweathermap.org/data/2.5/weather',
            apiKey: window.__ENV__.WEATHER_API_KEY,
            units: 'metric'
        }
    },

    map: {
        preferCanvas: true,
        wheelDebounceTime: 150,
        wheelPxPerZoomLevel: 120,
        tap: true,
        tapTolerance: 15,
        touchZoom: true,
        bounceAtZoomLimits: false,
        zoomAnimation: true,
        zoomControl: true,
        attributionControl: true,
        fullscreenControl: true
    },

    cache: {
        maxSize: 100,
        duration: 5 * 60 * 1000 // 5 minutes
    },

    measurementOptions: {
        showBearings: true,
        showDistance: true,
        metric: true,
        feet: false,
        nautic: false,
        precision: 2
    },

    icons: {
        defaultMarker: {
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        }
    },

    controls: {
        position: {
            zoom: 'topright',
            layers: 'topright',
            scale: 'bottomleft',
            measure: 'topleft'
        }
    }
};

export const routingProfiles = {
    driving: {
        profile: 'car',
        preference: 'fastest'
    },
    walking: {
        profile: 'foot',
        preference: 'shortest'
    },
    cycling: {
        profile: 'bicycle',
        preference: 'recommended'
    },
    transit: {
        profile: 'bus',
        preference: 'balanced'
    }
};

export const trafficSeverityColors = {
    MINOR: '#fbc02d',
    MODERATE: '#f57c00',
    MAJOR: '#d32f2f',
    UNKNOWN: '#1976d2'
};

export default {
    mapConfig,
    routingProfiles,
    trafficSeverityColors
};