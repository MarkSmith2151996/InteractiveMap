//script.js
import { 
    initializeLocationDetails, 
    initializePOISearch, 
    updateLocationInfo, 
    routeToPOI 
} from '/locationServices.js';
import { locateUser } from './location.js';

// Utility functions for debounce/throttle since we don't have direct lodash access
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let waiting = false;
    return function (...args) {
        if (!waiting) {
            func.apply(this, args);
            waiting = true;
            setTimeout(() => {
                waiting = false;
            }, limit);
        }
    };
}


// Global variables with proper typing
let map;
let markers = [];
let measurePoints = [];
let isMeasuring = false;
let polyline = null;
let routingControl = null;
let measureTooltip = null;
let geocoder = null;
let routeCache = new Map();
let locationCache = new Map();
let weatherCache = new Map();
let lastUpdateTime = new Map();
let isSettingStart = false;
let isSettingEnd = false;
let startMarker = null;
let endMarker = null;
let currentMeasurement = {
    points: [],
    markers: []
};




// Constants
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;
const DEBOUNCE_DELAY = 300;
const THROTTLE_DELAY = 100;

// Custom marker icon
const customIcon = L.icon({
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Utility functions
// Modified status functions
function showError(message, duration = 3000) {
    const statusInfo = document.getElementById('status-info');
    if (!statusInfo) {
        console.error('Status element not found');
        return;
    }
    
    statusInfo.textContent = message;
    statusInfo.classList.add('error', 'active');
    
    if (duration > 0) {
        setTimeout(() => {
            statusInfo.textContent = '';
            statusInfo.classList.remove('error', 'active');
        }, duration);
    }
}

function showStatus(message, duration = 3000) {
    const statusInfo = document.getElementById('status-info');
    if (!statusInfo) {
        console.error('Status element not found');
        return;
    }
    
    // Clear any existing messages and animations
    statusInfo.innerHTML = '';
    statusInfo.className = 'status-message';
    
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    messageElement.className = 'fade-message';
    statusInfo.appendChild(messageElement);
    
    if (duration > 0) {
        setTimeout(() => {
            messageElement.style.opacity = '0';
            setTimeout(() => {
                if (statusInfo.contains(messageElement)) {
                    statusInfo.removeChild(messageElement);
                }
            }, 500); // Wait for fade animation to complete
        }, duration);
    }
}
function initializeStatusElement() {
    // Check if status container already exists
    if (!document.getElementById('status-container')) {
        // Create a temporary container
        const temp = document.createElement('div');
        temp.innerHTML = statusHtml;
        
        // Insert the status container into the document
        document.body.insertBefore(temp.firstElementChild, document.body.firstChild);
    }
}

// UI update functions
function updateLocationDisplay(coordinates) {
    if (!coordinates) return;
    
    const locationDetailsElement = document.getElementById('location-details');
    if (locationDetailsElement) {
        locationDetailsElement.innerHTML = `
            <div class="location-header">
                <h3>Approximate Location Details</h3>
            </div>
            <div class="location-coords">
                Latitude: ${coordinates.lat?.toFixed(4)}, 
                Longitude: ${coordinates.lon?.toFixed(4)}
            </div>
        `;
    }
}

// Map move event handler
function handleMapMoveEnd() {
    if (measureTooltip && measurePoints.length > 0) {
        const lastPoint = measurePoints[measurePoints.length - 1];
        if (lastPoint && lastPoint.lat && lastPoint.lng) {
            measureTooltip.setLatLng(lastPoint);
        }
    }
}

// Initialize map
async function initializeMap() {
    try {
        const cachedConfig = sessionStorage.getItem('mapConfig');
        let config;

        if (cachedConfig) {
            config = JSON.parse(cachedConfig);
        } else {
            config = {
                mapConfig: {
                    initialView: [51.505, -0.09],
                    zoom: 13
                }
            };
            sessionStorage.setItem('mapConfig', JSON.stringify(config));
        }

        map = L.map('map', {
            zoomControl: true,
            attributionControl: true,
            preferCanvas: true,
            wheelDebounceTime: 150,
            wheelPxPerZoomLevel: 120,
            tap: true,
            tapTolerance: 15,
            touchZoom: true,
            bounceAtZoomLimits: false,
            zoomAnimation: true
        }).setView(config.mapConfig.initialView, config.mapConfig.zoom);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
            crossOrigin: true,
            useCache: true,
            maxRequests: 6,
            maxAge: 24 * 60 * 60 * 1000
        }).addTo(map);

        // Add map move handlers
        map.on('moveend', handleMapMoveEnd);
        map.on('zoomend', handleMapMoveEnd);

        // Initialize components
        initializeRouting();
        initializeWaypointControls();
        initializeEventListeners();
        initializeMeasurement();
        
        const debouncedMapClick = debounce(handleMapClick, DEBOUNCE_DELAY);
        const debouncedMeasureTooltip = debounce(updateMeasureTooltip, 50);
        
        map.on('click', debouncedMapClick);
        map.on('mousemove', debouncedMeasureTooltip);

        return map;

    } catch (error) {
        console.error('Map initialization error:', error);
        showError('Failed to initialize map');
        throw error;
    }
}

function initializeHeaderCollapse() {
    const header = document.querySelector('.header');
    const content = document.querySelector('.content');

    if (header && content) {
        header.addEventListener('click', () => {
            content.classList.toggle('collapsed');
            const icon = header.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-chevron-down');
                icon.classList.toggle('fa-chevron-up');
            }
        });
    }
}

// Routing initialization
function initializeRouting() {
    const routingOptions = {
        waypoints: [],
        routeWhileDragging: false,
        showAlternatives: true,
        useCache: true,
        profile: 'fastest',
        alternatives: 1,
        serviceUrl: 'https://router.project-osrm.org/route/v1',
        routingPreference: 'recommended',
        geometryOnly: false,
        continuousWorld: false,
        altLineOptions: {
            styles: [
                {color: 'black', opacity: 0.15, weight: 9},
                {color: 'white', opacity: 0.8, weight: 6},
                {color: 'blue', opacity: 0.5, weight: 2}
            ]
        }
    };

    routingControl = L.Routing.control(routingOptions).addTo(map);
    
    routingControl.on('routesfound', function(e) {
        const key = e.waypoints.map(wp => `${wp.latLng.lat},${wp.latLng.lng}`).join('|');
        routeCache.set(key, e.routes);
        lastUpdateTime.set(key, Date.now());
        
        if (routeCache.size > MAX_CACHE_SIZE) {
            const oldestKey = [...lastUpdateTime.entries()]
                .sort((a, b) => a[1] - b[1])[0][0];
            routeCache.delete(oldestKey);
            lastUpdateTime.delete(oldestKey);
        }
    });
}
function initializeWaypointControls() {
    const startButton = document.getElementById('set-start-point');
    const endButton = document.getElementById('set-end-point');

    startButton.addEventListener('click', () => {
        isSettingStart = true;
        isSettingEnd = false;
        showStatus('Click on the map to set start point');
    });

    endButton.addEventListener('click', () => {
        isSettingStart = false;
        isSettingEnd = true;
        showStatus('Click on the map to set end point');
    });

    map.on('click', handleWaypointClick);
}

function handleWaypointClick(e) {
    if (!isSettingStart && !isSettingEnd) return;

    const latlng = e.latlng;

    if (isSettingStart) {
        setStartPoint(latlng);
        isSettingStart = false;
    } else if (isSettingEnd) {
        setEndPoint(latlng);
        isSettingEnd = false;
    }

    updateRouteIfPossible();
}

function setStartPoint(latlng) {
    if (startMarker) {
        map.removeLayer(startMarker);
    }

    const greenIcon = L.icon({
        ...customIcon.options,
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41]
    });

    startMarker = L.marker(latlng, { icon: greenIcon })
        .addTo(map)
        .bindPopup('Start Point')
        .openPopup();

    const startInput = document.getElementById('route-start');
    if (startInput) {
        startInput.value = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
    }

    showStatus('Start point set');
}

function setEndPoint(latlng) {
    if (endMarker) {
        map.removeLayer(endMarker);
    }

    const redIcon = L.icon({
        ...customIcon.options,
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41]
    });

    endMarker = L.marker(latlng, { icon: redIcon })
        .addTo(map)
        .bindPopup('End Point')
        .openPopup();

    const endInput = document.getElementById('route-end');
    if (endInput) {
        endInput.value = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
    }

    showStatus('End point set');
}

function updateRouteIfPossible() {
    if (startMarker && endMarker && routingControl) {
        const waypoints = [
            L.latLng(startMarker.getLatLng()),
            L.latLng(endMarker.getLatLng())
        ];
        routingControl.setWaypoints(waypoints);
        showStatus('Calculating route...');
    }
}

// Route calculation
async function calculateRoute(startLocation, endLocation) {
    try {
        showStatus('Calculating route...');
        
        const cacheKey = `${startLocation}|${endLocation}`;
        const cachedRoute = routeCache.get(cacheKey);
        const lastUpdate = lastUpdateTime.get(cacheKey);
        
        if (cachedRoute && lastUpdate && (Date.now() - lastUpdate < CACHE_DURATION)) {
            routingControl.setWaypoints(cachedRoute.waypoints);
            showStatus('Route loaded from cache');
            return;
        }

        const [startCoords, endCoords] = await Promise.all([
            getCachedGeocode(startLocation),
            getCachedGeocode(endLocation)
        ]);

        if (!startCoords || !endCoords) {
            throw new Error('Could not find one or both locations');
        }

        const waypoints = [
            L.latLng(startCoords.lat, startCoords.lon),
            L.latLng(endCoords.lat, endCoords.lon)
        ];

        routingControl.setWaypoints(waypoints);
        showStatus('Route calculated successfully!');

    } catch (error) {
        console.error('Route calculation error:', error);
        showError('Failed to calculate route');
    }
}

// Location handling
// Location handling


function updateAddressDisplay(address) {
    const addressElement = document.getElementById('address');
    if (addressElement) {
        addressElement.innerHTML = address;
    }
}

// Weather functionality
async function getWeather(lat, lon) {
    const cacheKey = `${lat},${lon}`;
    const cachedWeather = weatherCache.get(cacheKey);
    const lastUpdate = lastUpdateTime.get(cacheKey);
    
    // Check cache validity and age
    if (cachedWeather && lastUpdate && (Date.now() - lastUpdate < CACHE_DURATION)) {
        console.log('Using cached weather data');
        updateWeatherDisplay(cachedWeather);
        return cachedWeather;
    }

    try {
        showStatus('Fetching weather information...');
        const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
        
        if (!response.ok) {
            throw new Error(`Weather request failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data || !data.weather) {
            throw new Error('Invalid weather data received');
        }

        // Format weather data for consistency
        const weatherData = {
            temperature: data.weather.main?.temp ?? data.weather.temperature,
            description: data.weather.weather?.[0]?.description ?? data.weather.description,
            icon: data.weather.weather?.[0]?.icon ?? data.weather.icon,
            humidity: data.weather.main?.humidity ?? data.weather.humidity,
            windSpeed: data.weather.wind?.speed ?? data.weather.windSpeed,
            feelsLike: data.weather.main?.feels_like,
            pressure: data.weather.main?.pressure
        };

        // Update cache
        weatherCache.set(cacheKey, weatherData);
        lastUpdateTime.set(cacheKey, Date.now());

        // Clean up old cache entries
        if (weatherCache.size > MAX_CACHE_SIZE) {
            const oldestKey = [...lastUpdateTime.entries()]
                .sort((a, b) => a[1] - b[1])[0][0];
            weatherCache.delete(oldestKey);
            lastUpdateTime.delete(oldestKey);
        }

        updateWeatherDisplay(weatherData);
        showStatus('Weather information updated');
        return weatherData;

    } catch (error) {
        console.error('Weather fetch error:', error);
        showError('Unable to fetch weather information');
        return null;
    }
}

async function getDetailedWeather(lat, lon) {
    try {
        const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=YOUR_API_KEY`);
        if (!response.ok) throw new Error(`Weather API error: ${response.status}`);
        
        const data = await response.json();
        return {
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
    } catch (error) {
        console.error('Detailed weather fetch error:', error);
        showError('Unable to fetch detailed weather information');
        return null;
    }
}

function updateWeatherDisplay(weather) {
    if (!weather) return;

    const weatherContainer = document.getElementById('current-weather');
    if (!weatherContainer) {
        console.error('Weather container element not found');
        return;
    }

    try {
        // Convert wind speed from m/s to km/h
        const windSpeedKmh = (weather.windSpeed * 3.6).toFixed(1);
        
        // Generate sunrise/sunset HTML if the data exists
        const sunTimes = weather.sunrise && weather.sunset ? `
            <div class="sun-times">
                <p><i class="fas fa-sunrise"></i> Sunrise: ${weather.sunrise}</p>
                <p><i class="fas fa-sunset"></i> Sunset: ${weather.sunset}</p>
            </div>
        ` : '';

        weatherContainer.innerHTML = `
            <div class="weather-card">
                <div class="weather-header">
                    <img 
                        src="https://openweathermap.org/img/wn/${weather.icon}@2x.png"
                        alt="${weather.description}"
                        class="weather-icon"
                        width="80"
                        height="80"
                        loading="lazy"
                    />
                    <div class="weather-main">
                        <h4>${Math.round(weather.temperature)}°C</h4>
                        <p class="feels-like">Feels like: ${Math.round(weather.feelsLike || weather.temperature)}°C</p>
                    </div>
                </div>
                <div class="weather-details">
                    <p class="description"><i class="fas fa-cloud"></i> ${weather.description}</p>
                    <p class="humidity"><i class="fas fa-tint"></i> Humidity: ${weather.humidity}%</p>
                    <p class="wind"><i class="fas fa-wind"></i> Wind: ${windSpeedKmh} km/h</p>
                    ${weather.pressure ? `<p class="pressure"><i class="fas fa-compress-arrows-alt"></i> Pressure: ${weather.pressure} hPa</p>` : ''}
                    ${sunTimes}
                </div>
            </div>
        `;

        const weatherContainerParent = document.querySelector('.weather-container');
        if (weatherContainerParent) {
            weatherContainerParent.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Error updating weather display:', error);
        showError('Error displaying weather information');
    }
}

// Search functionality
async function searchLocation() {
    const searchInput = document.getElementById('search-input');
    const searchValue = searchInput?.value.trim();
    
    if (!searchValue) {
        showError('Please enter a location to search');
        return;
    }

    try {
        showStatus('Searching location...');
        const coordinates = await getCachedGeocode(searchValue);
        
        if (coordinates) {
            map.setView([coordinates.lat, coordinates.lon], 13);
            
            const marker = L.marker([coordinates.lat, coordinates.lon], {
                icon: customIcon,
                bubblingMouseEvents: false
            })
            .addTo(map)
            .bindPopup(`<strong>${searchValue}</strong>`)
            .openPopup();
            
            markers.push(marker);
            
            await Promise.all([
                updateLocationInfo(coordinates.lat, coordinates.lon),
                getWeather(coordinates.lat, coordinates.lon)
            ]);
            
            showStatus('Location found!');
            updateLocationDisplay(coordinates);
        } else {
            showError('Location not found');
        }
    } catch (error) {
        console.error('Search error:', error);
        showError('Error searching for location');
    }
}

async function getCachedGeocode(location) {
    const cachedLocation = locationCache.get(location);
    const lastUpdate = lastUpdateTime.get(location);
    
    if (cachedLocation && lastUpdate && (Date.now() - lastUpdate < CACHE_DURATION)) {
        return cachedLocation;
    }

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`);
        if (!response.ok) throw new Error('Geocoding failed');
        
        const data = await response.json();
        if (data && data[0]) {
            const geometry = {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon)
            };
            
            locationCache.set(location, geometry);
            lastUpdateTime.set(location, Date.now());
            
            if (locationCache.size > MAX_CACHE_SIZE) {
                const oldestKey = [...lastUpdateTime.entries()]
                    .sort((a, b) => a[1] - b[1])[0][0];
                locationCache.delete(oldestKey);
                lastUpdateTime.delete(oldestKey);
            }
            
            return geometry;
        }
        throw new Error('No geometry in response');
    } catch (error) {
        console.error('Geocoding error:', error);
        throw error;
    }
}
function initializeMeasurement() {
    // Add measurement control to map
    const measureControl = L.control({position: 'topleft'});
    
    measureControl.onAdd = function(map) {
        const div = L.DomUtil.create('div', 'measurement-instructions leaflet-bar leaflet-control');
        div.style.display = 'none';
        div.innerHTML = `
            <div class="measure-info">
                <p>Click on map to start measuring</p>
                <p>Press ESC to cancel</p>
                <p>Double click to finish</p>
            </div>
        `;
        return div;
    };
    
    measureControl.addTo(map);
}

// Measurement functionality
function handleMapClick(e) {
    if (!isMeasuring) return;

    const point = e.latlng;
    currentMeasurement.points.push(point);

    // Create custom marker with measurement information
    const marker = L.marker(point, {
        icon: createMeasureMarker(currentMeasurement.points.length),
        draggable: true,
        bubblingMouseEvents: false
    })
    .addTo(map)
    .on('click', function() {
        if (isMeasuring) {
            removeMeasurePoint(this);
        }
    })
    .on('dragstart', function() {
        map.off('mousemove', updateMeasureTooltip);
    })
    .on('dragend', function(event) {
        const index = currentMeasurement.markers.indexOf(this);
        if (index > -1) {
            currentMeasurement.points[index] = event.target.getLatLng();
            updateMeasurements();
            map.on('mousemove', updateMeasureTooltip);
        }
    });

    currentMeasurement.markers.push(marker);
    updateMeasurements();
}

function createMeasureMarker(pointNumber) {
    return L.divIcon({
        className: 'measure-marker',
        html: `<div class="measure-marker-point">${pointNumber}</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
}


function updateMeasurements() {
    if (polyline && polyline._map) {
        map.removeLayer(polyline);
    }

    if (measurePoints.length > 1) {
        polyline = L.polyline(measurePoints, {
            color: 'red',
            weight: 3,
            opacity: 0.7,
            smoothFactor: 1,
            interactive: false
        }).addTo(map);

        let totalDistance = 0;
        for (let i = 1; i < measurePoints.length; i++) {
            totalDistance += measurePoints[i].distanceTo(measurePoints[i-1]);
        }

        updateMeasurementInfo(totalDistance);
    }
}

function updateMeasurementInfo(distance) {
    const km = (distance / 1000).toFixed(2);
    const miles = (km * 0.621371).toFixed(2);
    showStatus(`Total distance: ${km} km (${miles} miles)`, 0);
}

function updateMeasureTooltip(e) {
    if (!isMeasuring || !e || !e.latlng || measurePoints.length === 0) return;

    try {
        if (!measureTooltip) {
            measureTooltip = L.tooltip({
                permanent: true,
                direction: 'right',
                className: 'measuring-tooltip',
                offset: [10, 0],
                opacity: 0.9
            }).addTo(map);
        }

        const lastPoint = measurePoints[measurePoints.length - 1];
        if (!lastPoint || !lastPoint.distanceTo) return;

        const distance = lastPoint.distanceTo(e.latlng);
        if (typeof distance !== 'number') return;

        const km = (distance / 1000).toFixed(2);
        
        measureTooltip.setLatLng(e.latlng);
        measureTooltip.setContent(`Click to measure: ${km} km`);
    } catch (error) {
        console.error('Error updating measure tooltip:', error);
        // Silently fail to avoid interrupting the user experience
    }
}

function removeMeasurePoint(marker) {
    const index = markers.indexOf(marker);
    if (index > -1) {
        map.removeLayer(marker);
        markers.splice(index, 1);
        measurePoints.splice(index, 1);
        updateMeasurements();
    }
}

// Toggle functions
function toggleMeasuring() {
    isMeasuring = !isMeasuring;
    const measureBtn = document.getElementById('measure-distance');
    
    if (isMeasuring) {
        measureBtn?.classList.add('active');
        showStatus('Click on the map to measure distances');
    } else {
        measureBtn?.classList.remove('active');
        clearMeasurements();
    }
}

function toggleContainer(containerClass) {
    const container = document.querySelector(containerClass);
    container?.classList.toggle('hidden');
}

// Clear functions
function clearMeasurements() {
    measurePoints = [];
    
    if (polyline && polyline._map) {
        map.removeLayer(polyline);
        polyline = null;
    }
    
    if (measureTooltip && measureTooltip._map) {
        map.removeLayer(measureTooltip);
        measureTooltip = null;
    }
    
    clearMarkers();
    showStatus('Measurements cleared');
}

function clearMarkers() {
    markers.forEach(marker => {
        if (marker && marker._map) {
            map.removeLayer(marker);
        }
    });
    markers = [];
}

function clearMap() {
    clearMarkers();
    clearMeasurements();
    
    if (routingControl) {
        routingControl.setWaypoints([]);
    }
    
    if (measureTooltip && measureTooltip._map) {
        map.removeLayer(measureTooltip);
        measureTooltip = null;
    }

    // Clear waypoint markers
    if (startMarker) {
        map.removeLayer(startMarker);
        startMarker = null;
    }
    if (endMarker) {
        map.removeLayer(endMarker);
        endMarker = null;
    }
    
    // Reset waypoint states
    isSettingStart = false;
    isSettingEnd = false;
    
    isMeasuring = false;
    document.getElementById('measure-distance')?.classList.remove('active');
    showStatus('Map cleared');
}

// Event listeners
function initializeEventListeners() {
    const debouncedSearch = debounce(searchLocation, DEBOUNCE_DELAY);
    const debouncedRoute = debounce((start, end) => calculateRoute(start, end), DEBOUNCE_DELAY);

    // Button click handlers with improved event delegation and map passing
    const buttonHandlers = {
        'find-location': () => locateUser(map),  // Changed this line
        'search-btn': debouncedSearch,
        'clear-all': clearMap,
        'measure-distance': toggleMeasuring
    };

    Object.entries(buttonHandlers).forEach(([id, handler]) => {
        document.getElementById(id)?.addEventListener('click', handler);
    });

    // Search input with debouncing
    document.getElementById('search-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') debouncedSearch();
    });

    // Route form with optimized submission
    document.getElementById('route-form')?.addEventListener('submit', function(e) {
        e.preventDefault();
        const start = document.getElementById('route-start')?.value;
        const end = document.getElementById('route-end')?.value;
        if (start && end) {
            debouncedRoute(start, end);
        }
    });

    // Transport mode with immediate update
    document.getElementById('transport-mode')?.addEventListener('change', function(e) {
        if (routingControl) {
            routingControl.getRouter().options.profile = e.target.value;
            routingControl.route();
        }
    });

    // Add keyboard shortcuts with throttling
    document.addEventListener('keydown', throttle(handleKeyboardShortcuts, THROTTLE_DELAY));
}

// Keyboard shortcuts
function handleKeyboardShortcuts(e) {
    if (e.key === 'Escape' && isMeasuring) {
        toggleMeasuring();
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && 
        isMeasuring && 
        measurePoints.length > 0) {
        const lastMarker = markers[markers.length - 1];
        if (lastMarker) {
            removeMeasurePoint(lastMarker);
        }
    }
}

// Initialize map when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    requestAnimationFrame(() => {
        initializeMap();
        initializeLocationDetails();
        initializePOISearch(map, markers, routingControl, showStatus, showError);
    });
});

// Export functions for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializeMap,
        calculateRoute,
        locateUser: () => locateUser(map), // Changed this line
        searchLocation,
        toggleMeasuring,
        clearMap,
        showError,
        showStatus
    };
}