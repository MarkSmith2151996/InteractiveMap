// location.js
let locationMarker = null;
let accuracyCircle = null;
let watchId = null;
let bestAccuracy = Infinity;
let lastPosition = null;
let locationCache = new Map();
let addressRequestController = null;
let statusTimeout = null; // Added to manage status message timeouts

// Enhanced location options with reduced timeout
const HIGH_PRECISION_OPTIONS = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0
};

// Accuracy thresholds in meters
const ACCURACY_THRESHOLDS = {
    EXCELLENT: 5,
    GOOD: 10,
    ACCEPTABLE: 20
};

// Status message management
function showStatusWithTimeout(message, duration = 3000) {
    // Clear any existing timeout
    if (statusTimeout) {
        clearTimeout(statusTimeout);
    }

    const statusElement = document.querySelector('#status-info');
    if (!statusElement) return;

    // Create and append new message
    const messageElement = document.createElement('div');
    messageElement.className = 'fade-message';
    messageElement.textContent = message;
    
    // Clear existing content and add new message
    statusElement.innerHTML = '';
    statusElement.appendChild(messageElement);

    // Set timeout for removal
    if (duration > 0) {
        statusTimeout = setTimeout(() => {
            messageElement.style.opacity = '0';
            setTimeout(() => {
                if (statusElement.contains(messageElement)) {
                    statusElement.removeChild(messageElement);
                }
            }, 500);
        }, duration);
    }
}

function showError(message) {
    const statusElement = document.querySelector('#status-info');
    if (statusElement) {
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message fade-message';
        errorElement.innerHTML = `⚠️ ${message}`;
        
        statusElement.innerHTML = '';
        statusElement.appendChild(errorElement);
    }
    console.error(message);
}

function locateUser(map) {
    if (!map?.addLayer) {
        console.error('Invalid map object');
        showError('Map not initialized');
        return;
    }

    if (!navigator.geolocation) {
        showError('Geolocation not supported');
        return;
    }

    cleanupExistingTracking();
    initializeTracking(map);
}

function cleanupExistingTracking() {
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    
    if (addressRequestController) {
        addressRequestController.abort();
        addressRequestController = null;
    }

    if (statusTimeout) {
        clearTimeout(statusTimeout);
        statusTimeout = null;
    }

    bestAccuracy = Infinity;
    lastPosition = null;
}

function initializeTracking(map) {
    // Initial status message
    showStatusWithTimeout('Finding your location...', 3000);

    // After 3 seconds, show the second message
    setTimeout(() => {
        showStatusWithTimeout('Approximate location found', 3000);
    }, 3000);

    navigator.geolocation.getCurrentPosition(
        position => {
            handlePosition(position, map);
            startContinuousTracking(map);
        },
        () => startContinuousTracking(map),
        { ...HIGH_PRECISION_OPTIONS, maximumAge: 3000 }
    );
}

function startContinuousTracking(map) {
    let timeoutDuration = 15000;
    
    watchId = navigator.geolocation.watchPosition(
        position => {
            handlePosition(position, map);
            if (position.coords.accuracy <= ACCURACY_THRESHOLDS.EXCELLENT) {
                timeoutDuration = Math.min(timeoutDuration, 5000);
            }
        },
        handleError,
        HIGH_PRECISION_OPTIONS
    );

    const progressiveTimeout = () => {
        if (watchId) {
            if (lastPosition?.coords.accuracy <= ACCURACY_THRESHOLDS.EXCELLENT) {
                stopTracking();
            } else if (timeoutDuration < 30000) {
                timeoutDuration += 5000;
                setTimeout(progressiveTimeout, 5000);
            } else {
                stopTracking();
            }
        }
    };

    setTimeout(progressiveTimeout, timeoutDuration);
}

function stopTracking() {
    if (watchId) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
}

function handlePosition(position, map) {
    const { accuracy } = position.coords;

    if (accuracy >= bestAccuracy) return;

    bestAccuracy = accuracy;
    lastPosition = position;

    updateMapMarkers(position, map);
    updateAddressInfo(position, map);
}

function updateMapMarkers(position, map) {
    const { latitude, longitude, accuracy } = position.coords;

    [locationMarker, accuracyCircle].forEach(marker => {
        if (marker && map.hasLayer(marker)) {
            map.removeLayer(marker);
        }
    });

    locationMarker = L.marker([latitude, longitude], {
        icon: L.divIcon({
            className: 'current-location-icon',
            html: '<div class="location-marker pulse"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        })
    }).addTo(map);

    accuracyCircle = L.circle([latitude, longitude], {
        radius: accuracy,
        fillColor: '#3388ff',
        fillOpacity: 0.15,
        color: '#3388ff',
        weight: 1.5
    }).addTo(map);

    const zoomLevel = accuracy <= 10 ? 18 :
                     accuracy <= 50 ? 17 :
                     accuracy <= 100 ? 16 : 15;

    map.flyTo([latitude, longitude], zoomLevel, {
        duration: 1.5,
        easeLinearity: 0.5
    });
}

async function updateAddressInfo(position, map) {
    const { latitude, longitude } = position.coords;
    const locationKey = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;

    if (locationCache.has(locationKey)) {
        updateLocationPopup(position, locationCache.get(locationKey), map);
        return;
    }

    if (addressRequestController) {
        addressRequestController.abort();
    }

    addressRequestController = new AbortController();

    try {
        const address = await getPreciseAddress(latitude, longitude, addressRequestController.signal);
        locationCache.set(locationKey, address);
        updateLocationPopup(position, address, map);
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Address lookup failed:', error);
            updateLocationPopup(position, null, map);
        }
    }
}

async function getPreciseAddress(latitude, longitude, signal) {
    const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?` +
        `format=json&lat=${latitude}&lon=${longitude}` +
        `&zoom=18&addressdetails=1&namedetails=1`,
        {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'LocationFinderApp/2.0'
            },
            signal
        }
    );

    if (!response.ok) throw new Error('Address lookup failed');

    const data = await response.json();
    
    return {
        full: data.display_name,
        shortAddress: formatAddress(data.address),
        details: data.address
    };
}

function formatAddress(addressData) {
    const parts = [];
    
    if (addressData.house_number) parts.push(addressData.house_number);
    if (addressData.road) parts.push(addressData.road);
    if (addressData.suburb) parts.push(addressData.suburb);
    if (addressData.city || addressData.town || addressData.village) {
        parts.push(addressData.city || addressData.town || addressData.village);
    }
    if (addressData.postcode) parts.push(addressData.postcode);

    return parts.join(', ');
}

function updateLocationPopup(position, address, map) {
    if (!locationMarker) return;

    const popupContent = createPopupContent(position, address);
    locationMarker.bindPopup(popupContent).openPopup();
}

function createPopupContent(position, address = null) {
    const { latitude, longitude, accuracy, altitude, heading, speed } = position.coords;
    
    return `
        <div class="location-popup">
            <h4>Approximate Location</h4>
            ${address ? `<div class="address">${address.full}</div>` : ''}
            <div class="location-details">
                <div>Accuracy: ±${Math.round(accuracy)}m</div>
                <div>Coordinates: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}</div>
                ${altitude ? `<div>Altitude: ${Math.round(altitude)}m</div>` : ''}
                ${heading ? `<div>Heading: ${Math.round(heading)}°</div>` : ''}
                ${speed ? `<div>Speed: ${(speed * 3.6).toFixed(1)} km/h</div>` : ''}
            </div>
        </div>
    `;
}

function handleError(error) {
    let message;
    switch (error.code) {
        case error.PERMISSION_DENIED:
            message = 'Location access denied. Please check browser settings.';
            break;
        case error.POSITION_UNAVAILABLE:
            message = 'Location unavailable. Please check GPS/network.';
            break;
        case error.TIMEOUT:
            message = 'Location request timed out. Retrying...';
            break;
        default:
            message = 'Location error. Please try again.';
    }
    
    stopTracking();
    showError(message);
}

export { locateUser };