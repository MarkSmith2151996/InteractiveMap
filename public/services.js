// services.js
import { MapError, Cache } from './utils.js';
import { mapConfig } from './config.js';

const geocodeCache = new Cache(mapConfig.cache.maxSize, mapConfig.cache.duration);
const weatherCache = new Cache(mapConfig.cache.maxSize, mapConfig.cache.duration);
const routeCache = new Cache(mapConfig.cache.maxSize, mapConfig.cache.duration);

export async function geocodeLocation(query) {
    const cacheKey = `geocode:${query}`;
    const cached = geocodeCache.get(cacheKey);
    if (cached) return cached;

    try {
        const { opencage } = mapConfig.geocodingService;
        const response = await fetch(
            `${opencage.baseUrl}?q=${encodeURIComponent(query)}&key=${opencage.apiKey}&limit=5`
        );

        if (!response.ok) throw new MapError('Geocoding failed', 'geocoding');
        
        const data = await response.json();
        if (!data.results?.length) {
            throw new MapError('Location not found', 'geocoding');
        }

        const results = data.results.map(result => ({
            name: result.formatted,
            lat: result.geometry.lat,
            lng: result.geometry.lng,
            bounds: result.bounds,
            components: result.components
        }));

        geocodeCache.set(cacheKey, results);
        return results;
    } catch (error) {
        console.error('Geocoding error:', error);
        throw new MapError(error.message, 'geocoding');
    }
}

export async function reverseGeocode(lat, lng) {
    const cacheKey = `reverse:${lat},${lng}`;
    const cached = geocodeCache.get(cacheKey);
    if (cached) return cached;

    try {
        const { nominatim } = mapConfig.geocodingService;
        const response = await fetch(
            `${nominatim.baseUrl}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            {
                headers: {
                    'User-Agent': nominatim.userAgent
                }
            }
        );

        if (!response.ok) throw new MapError('Reverse geocoding failed', 'geocoding');
        
        const data = await response.json();
        const result = {
            address: data.display_name,
            details: data.address
        };

        geocodeCache.set(cacheKey, result);
        return result;
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        throw new MapError(error.message, 'geocoding');
    }
}

export async function getWeather(lat, lng) {
    const cacheKey = `weather:${lat},${lng}`;
    const cached = weatherCache.get(cacheKey);
    if (cached) return cached;

    try {
        const { openweather } = mapConfig.weather;
        const response = await fetch(
            `${openweather.baseUrl}?lat=${lat}&lon=${lng}&units=${openweather.units}&appid=${openweather.apiKey}`
        );

        if (!response.ok) throw new MapError('Weather request failed', 'weather');
        
        const data = await response.json();
        const weather = {
            temperature: data.main.temp,
            feelsLike: data.main.feels_like,
            humidity: data.main.humidity,
            windSpeed: data.wind.speed,
            description: data.weather[0].description,
            icon: data.weather[0].icon,
            pressure: data.main.pressure,
            sunrise: new Date(data.sys.sunrise * 1000).toLocaleTimeString(),
            sunset: new Date(data.sys.sunset * 1000).toLocaleTimeString()
        };

        weatherCache.set(cacheKey, weather);
        return weather;
    } catch (error) {
        console.error('Weather fetch error:', error);
        throw new MapError(error.message, 'weather');
    }
}

export async function getTrafficIncidents(bounds) {
    try {
        const { tomtom } = mapConfig.traffic;
        const response = await fetch(
            `https://api.tomtom.com/traffic/services/4/incidentDetails/s3/${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}/10/-1/json?key=${tomtom.apiKey}`
        );

        if (!response.ok) throw new MapError('Traffic data request failed', 'traffic');
        
        const data = await response.json();
        return data.incidents || [];
    } catch (error) {
        console.error('Traffic incidents error:', error);
        throw new MapError(error.message, 'traffic');
    }
}

export async function calculateRoute(start, end, options = {}) {
    const cacheKey = `route:${start.lat},${start.lng}|${end.lat},${end.lng}|${JSON.stringify(options)}`;
    const cached = routeCache.get(cacheKey);
    if (cached) return cached;

    try {
        const { tomtom } = mapConfig.routing;
        const response = await fetch(
            `${tomtom.baseUrl}/${start.lat},${start.lng}:${end.lat},${end.lng}/json?` +
            `key=${tomtom.apiKey}&traffic=${options.traffic || true}&routeType=${options.routeType || 'fastest'}`
        );

        if (!response.ok) throw new MapError('Route calculation failed', 'routing');
        
        const data = await response.json();
        const route = {
            points: data.routes[0].legs[0].points.map(point => ({
                lat: point.latitude,
                lng: point.longitude
            })),
            summary: {
                distance: data.routes[0].summary.lengthInMeters,
                duration: data.routes[0].summary.travelTimeInSeconds,
                trafficDelay: data.routes[0].summary.trafficDelayInSeconds || 0
            }
        };

        routeCache.set(cacheKey, route);
        return route;
    } catch (error) {
        console.error('Route calculation error:', error);
        throw new MapError(error.message, 'routing');
    }
}

export async function searchPlaces(query, bounds) {
    try {
        const response = await fetch(
            `https://api.geoapify.com/v2/places?text=${encodeURIComponent(query)}` +
            `&rect=${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}` +
            `&apiKey=${window.__ENV__.PLACES_API_KEY}`
        );

        if (!response.ok) throw new MapError('Places search failed', 'places');
        
        const data = await response.json();
        return data.features.map(feature => ({
            name: feature.properties.name,
            category: feature.properties.category,
            address: feature.properties.formatted,
            coordinates: {
                lat: feature.geometry.coordinates[1],
                lng: feature.geometry.coordinates[0]
            }
        }));
    } catch (error) {
        console.error('Places search error:', error);
        throw new MapError(error.message, 'places');
    }
}