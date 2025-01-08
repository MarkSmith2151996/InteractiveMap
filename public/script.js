import { 
    initializeLocationDetails, 
    initializePOISearch, 
    updateLocationInfo, 
    routeToPOI 
} from '/locationServices.js';

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
function showError(message, duration = 3000) {
    const statusInfo = document.getElementById('status-info');
    if (statusInfo) {
        statusInfo.textContent = message;
        statusInfo.classList.add('error');
        if (duration > 0) {
            setTimeout(() => {
                statusInfo.textContent = '';
                statusInfo.classList.remove('error');
            }, duration);
        }
    }
}

function showStatus(message, duration = 3000) {
    const statusInfo = document.getElementById('status-info');
    if (statusInfo) {
        statusInfo.textContent = message;
        statusInfo.classList.remove('error');
        if (duration > 0) {
            setTimeout(() => {
                statusInfo.textContent = '';
            }, duration);
        }
    }
}

// UI update functions
function updateLocationDisplay(coordinates) {
    if (!coordinates) return;
    
    const locationDetailsElement = document.getElementById('location-details');
    if (locationDetailsElement) {
        locationDetailsElement.innerHTML = `Latitude: ${coordinates.lat?.toFixed(4)}, Longitude: ${coordinates.lon?.toFixed(4)}`;
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
            const response = await fetch('/api/config');
            config = await response.json();
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

        // Add map move handlers
        map.on('moveend', handleMapMoveEnd);
        map.on('zoomend', handleMapMoveEnd);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19,
            crossOrigin: true,
            useCache: true,
            maxRequests: 6,
            maxAge: 24 * 60 * 60 * 1000
        }).addTo(map);

        initializeRouting();
        initializeEventListeners();
        initializeHeaderCollapse();
        
        const debouncedMapClick = debounce(handleMapClick, DEBOUNCE_DELAY);
        const debouncedMeasureTooltip = debounce(updateMeasureTooltip, 50);
        
        map.on('click', debouncedMapClick);
        map.on('mousemove', debouncedMeasureTooltip);

    } catch (error) {
        console.error('Map initialization error:', error);
        showError('Failed to initialize map');
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
function locateUser() {
    if (!map) {
        showError('Map not initialized');
        return;
    }

    if (navigator.geolocation) {
        showStatus('Locating...');
        map.locate({
            setView: true,
            maxZoom: 16,
            watch: true,
            enableHighAccuracy: true
        });

        map.on('locationfound', handleLocationFound);
        map.on('locationerror', () => showError('Location access denied or unavailable.'));
    } else {
        showError('Geolocation is not supported by this browser.');
    }
}

function handleLocationFound(e) {
    markers = markers.filter(marker => {
        if (marker.isUserLocation) {
            map.removeLayer(marker);
            return false;
        }
        return true;
    });

    const marker = L.marker(e.latlng, {
        icon: customIcon,
        bubblingMouseEvents: false
    }).addTo(map);
    
    marker.isUserLocation = true;
    markers.push(marker);

    Promise.all([
        reverseGeocode(e.latlng.lat, e.latlng.lng),
        updateLocationInfo(e.latlng.lat, e.latlng.lng),
        getWeather(e.latlng.lat, e.latlng.lng)
    ]).then(() => {
        showStatus('Location found!');
        marker.bindPopup('Your current location').openPopup();
    });
}

// Geocoding
async function getCachedGeocode(location) {
    const cachedLocation = locationCache.get(location);
    const lastUpdate = lastUpdateTime.get(location);
    
    if (cachedLocation && lastUpdate && (Date.now() - lastUpdate < CACHE_DURATION)) {
        return cachedLocation;
    }

    try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(location)}`);
        if (!response.ok) throw new Error('Geocoding failed');
        
        const data = await response.json();
        if (data.geometry) {
            locationCache.set(location, data.geometry);
            lastUpdateTime.set(location, Date.now());
            
            if (locationCache.size > MAX_CACHE_SIZE) {
                const oldestKey = [...lastUpdateTime.entries()]
                    .sort((a, b) => a[1] - b[1])[0][0];
                locationCache.delete(oldestKey);
                lastUpdateTime.delete(oldestKey);
            }
            
            return data.geometry;
        }
        throw new Error('No geometry in response');
    } catch (error) {
        console.error('Geocoding error:', error);
        throw error;
    }
}

async function reverseGeocode(lat, lon) {
    const cacheKey = `${lat},${lon}`;
    const cachedAddress = locationCache.get(cacheKey);
    const lastUpdate = lastUpdateTime.get(cacheKey);
    
    if (cachedAddress && lastUpdate && (Date.now() - lastUpdate < CACHE_DURATION)) {
        updateAddressDisplay(cachedAddress);
        return cachedAddress;
    }

    try {
        const response = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`);
        if (!response.ok) throw new Error('Reverse geocoding failed');
        
        const data = await response.json();
        if (data.address) {
            locationCache.set(cacheKey, data.address);
            lastUpdateTime.set(cacheKey, Date.now());
            updateAddressDisplay(data.address);
            return data.address;
        }
        throw new Error('No address in response');
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        showError('Error retrieving address');
        throw error;
    }
}

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
    
    if (cachedWeather && lastUpdate && (Date.now() - lastUpdate < CACHE_DURATION)) {
        updateWeatherDisplay(cachedWeather);
        return cachedWeather;
    }

    try {
        const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
        if (!response.ok) throw new Error('Weather request failed');
        
        const data = await response.json();
        if (data.weather) {
            weatherCache.set(cacheKey, data.weather);
            lastUpdateTime.set(cacheKey, Date.now());
            updateWeatherDisplay(data.weather);
            return data.weather;
        }
        throw new Error('No weather data in response');
    } catch (error) {
        console.error('Weather fetch error:', error);
        showError('Weather information unavailable');
        throw error;
    }
}

function updateWeatherDisplay(weather) {
    const weatherContainer = document.getElementById('current-weather');
    if (weatherContainer) {
        weatherContainer.innerHTML = `
            <div class="weather-info">
                <img 
                    src="https://openweathermap.org/img/wn/${weather.icon}@2x.png"
                    alt="${weather.description}"
                    class="weather-icon"
                    loading="lazy"
                />
                <div class="weather-details">
                    <p class="temperature">${Math.round(weather.temperature)}°C</p>
                    <p class="description">${weather.description}</p>
                    <p class="humidity">Humidity: ${weather.humidity}%</p>
                    <p class="wind">Wind Speed: ${weather.windSpeed} m/s</p>
                </div>
            </div>
        `;
    }
    document.querySelector('.weather-container')?.classList.remove('hidden');
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

// Measurement functionality
function handleMapClick(e) {
    if (!isMeasuring) return;

    const point = e.latlng;
    measurePoints.push(point);

    const marker = L.marker(point, {
        icon: customIcon,
        draggable: true,
        bubblingMouseEvents: false
    })
    .addTo(map)
    .on('click', function() {
        if (isMeasuring) {
            removeMeasurePoint(this);
        }
    })
    .on('dragend', debounce(updateMeasurements, DEBOUNCE_DELAY));

    markers.push(marker);
    updateMeasurements();
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
    
    isMeasuring = false;
    document.getElementById('measure-distance')?.classList.remove('active');
    showStatus('Map cleared');
}

// Event listeners
function initializeEventListeners() {
    const debouncedSearch = debounce(searchLocation, DEBOUNCE_DELAY);
    const debouncedRoute = debounce((start, end) => calculateRoute(start, end), DEBOUNCE_DELAY);

    // Button click handlers with improved event delegation
    const buttonHandlers = {
        'find-location': locateUser,
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
        locateUser,
        searchLocation,
        toggleMeasuring,
        clearMap,
        showError,
        showStatus
    };
}