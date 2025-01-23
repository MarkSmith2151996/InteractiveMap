import { showError } from './utils.js';

let trafficLayer = null;
let weatherLayer = null;
let incidents = [];
let weatherMarkers = [];
let trafficUpdateInterval = null;
let weatherUpdateInterval = null;

// Constants for API configurations
const WEATHER_UPDATE_INTERVAL = 300000; // 5 minutes
const TRAFFIC_UPDATE_INTERVAL = 180000; // 3 minutes

// Weather icon mapping
const WEATHER_ICONS = {
    '01d': 'sun',
    '01n': 'moon',
    '02d': 'cloud-sun',
    '02n': 'cloud-moon',
    '03d': 'cloud',
    '03n': 'cloud',
    '04d': 'cloud',
    '04n': 'cloud',
    '09d': 'cloud-showers-heavy',
    '09n': 'cloud-showers-heavy',
    '10d': 'cloud-sun-rain',
    '10n': 'cloud-moon-rain',
    '11d': 'bolt',
    '11n': 'bolt',
    '13d': 'snowflake',
    '13n': 'snowflake',
    '50d': 'smog',
    '50n': 'smog'
};

export async function initializeTrafficLayer(map) {
    try {
        const TOMTOM_API_KEY = process.env.TOMTOM_TRAFFIC_API_KEY;
        
        trafficLayer = L.tileLayer(`https://{s}.api.tomtom.com/traffic/map/4/tile/{z}/{x}/{y}.png?key=${TOMTOM_API_KEY}`, {
            subdomains: ['1', '2', '3', '4'],
            opacity: 0.75
        });

        map.addLayer(trafficLayer);
        
        // Start periodic updates
        await updateTrafficData(map);
        startTrafficUpdates(map);

        return trafficLayer;
    } catch (error) {
        console.error('Traffic layer initialization failed:', error);
        showError('Failed to load traffic data');
    }
}

export async function initializeWeatherLayer(map) {
    try {
        const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
        
        // Create weather overlay group
        weatherLayer = L.layerGroup().addTo(map);
        
        // Initial weather data fetch
        await updateWeatherData(map);
        startWeatherUpdates(map);

        return weatherLayer;
    } catch (error) {
        console.error('Weather layer initialization failed:', error);
        showError('Failed to load weather data');
    }
}

async function updateTrafficData(map) {
    try {
        const bounds = map.getBounds();
        const TOMTOM_API_KEY = process.env.TOMTOM_TRAFFIC_API_KEY;
        
        const response = await fetch(
            `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?` +
            `bbox=${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}&` +
            `key=${TOMTOM_API_KEY}`
        );

        if (!response.ok) throw new Error('Traffic data fetch failed');
        
        const data = await response.json();
        updateTrafficIncidents(map, data.flowSegmentData);
        
    } catch (error) {
        console.error('Traffic update failed:', error);
    }
}

async function updateWeatherData(map) {
    try {
        const bounds = map.getBounds();
        const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
        
        const center = bounds.getCenter();
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?` +
            `lat=${center.lat}&lon=${center.lng}&appid=${WEATHER_API_KEY}&units=metric`
        );

        if (!response.ok) throw new Error('Weather data fetch failed');
        
        const data = await response.json();
        updateWeatherDisplay(map, data);
        
    } catch (error) {
        console.error('Weather update failed:', error);
    }
}

function updateTrafficIncidents(map, incidents) {
    // Clear existing incidents
    clearTrafficIncidents();
    
    // Add new incidents
    incidents.forEach(incident => {
        const marker = createTrafficIncidentMarker(incident);
        marker.addTo(map);
        incidents.push(marker);
    });
}

function createTrafficIncidentMarker(incident) {
    const severity = getTrafficSeverityIcon(incident.currentSpeed, incident.freeFlowSpeed);
    
    return L.marker([incident.coordinates.latitude, incident.coordinates.longitude], {
        icon: L.divIcon({
            className: 'traffic-incident-icon',
            html: `<i class="fas ${severity.icon}" style="color: ${severity.color}"></i>`,
            iconSize: [24, 24]
        })
    }).bindPopup(createTrafficPopupContent(incident));
}

function getTrafficSeverityIcon(currentSpeed, freeFlowSpeed) {
    const ratio = currentSpeed / freeFlowSpeed;
    
    if (ratio < 0.25) return { icon: 'fa-exclamation-triangle', color: '#d32f2f' };
    if (ratio < 0.5) return { icon: 'fa-exclamation-circle', color: '#f57c00' };
    if (ratio < 0.75) return { icon: 'fa-info-circle', color: '#fbc02d' };
    return { icon: 'fa-info', color: '#4caf50' };
}

function updateWeatherDisplay(map, weatherData) {
    // Clear existing weather markers
    clearWeatherMarkers();
    
    // Create new weather marker
    const marker = createWeatherMarker(weatherData);
    marker.addTo(weatherLayer);
    weatherMarkers.push(marker);
    
    // Update weather control panel
    updateWeatherControl(weatherData);
}

function createWeatherMarker(weatherData) {
    const icon = WEATHER_ICONS[weatherData.weather[0].icon] || 'cloud';
    
    return L.marker([weatherData.coord.lat, weatherData.coord.lon], {
        icon: L.divIcon({
            className: 'weather-icon',
            html: `<i class="fas fa-${icon}" style="font-size: 24px;"></i>`,
            iconSize: [24, 24]
        })
    }).bindPopup(createWeatherPopupContent(weatherData));
}

function createWeatherPopupContent(weatherData) {
    return `
        <div class="weather-popup">
            <h3>${weatherData.name}</h3>
            <div class="weather-details">
                <p><i class="fas fa-thermometer-half"></i> ${Math.round(weatherData.main.temp)}°C</p>
                <p><i class="fas fa-tint"></i> ${weatherData.main.humidity}%</p>
                <p><i class="fas fa-wind"></i> ${Math.round(weatherData.wind.speed * 3.6)} km/h</p>
            </div>
        </div>
    `;
}

function updateWeatherControl(weatherData) {
    const weatherControl = document.querySelector('.weather-container');
    if (!weatherControl) return;
    
    weatherControl.innerHTML = `
        <div class="weather-info">
            <div class="weather-main">
                <i class="fas fa-${WEATHER_ICONS[weatherData.weather[0].icon]}"></i>
                <span>${Math.round(weatherData.main.temp)}°C</span>
            </div>
            <div class="weather-details">
                <p>${weatherData.weather[0].description}</p>
                <p>Humidity: ${weatherData.main.humidity}%</p>
                <p>Wind: ${Math.round(weatherData.wind.speed * 3.6)} km/h</p>
            </div>
        </div>
    `;
}

function startTrafficUpdates(map) {
    if (trafficUpdateInterval) clearInterval(trafficUpdateInterval);
    trafficUpdateInterval = setInterval(() => updateTrafficData(map), TRAFFIC_UPDATE_INTERVAL);
}

function startWeatherUpdates(map) {
    if (weatherUpdateInterval) clearInterval(weatherUpdateInterval);
    weatherUpdateInterval = setInterval(() => updateWeatherData(map), WEATHER_UPDATE_INTERVAL);
}

function clearTrafficIncidents() {
    incidents.forEach(incident => {
        if (incident && incident.remove) incident.remove();
    });
    incidents = [];
}

function clearWeatherMarkers() {
    weatherMarkers.forEach(marker => {
        if (marker && marker.remove) marker.remove();
    });
    weatherMarkers = [];
}

export function stopUpdates() {
    if (trafficUpdateInterval) clearInterval(trafficUpdateInterval);
    if (weatherUpdateInterval) clearInterval(weatherUpdateInterval);
    clearTrafficIncidents();
    clearWeatherMarkers();
}