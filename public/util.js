// utils.js

export function showError(message, duration = 3000) {
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

export function showStatus(message, duration = 3000) {
    const statusInfo = document.getElementById('status-info');
    if (!statusInfo) {
        console.error('Status element not found');
        return;
    }
    
    statusInfo.textContent = message;
    statusInfo.classList.remove('error');
    statusInfo.classList.add('active');
    
    if (duration > 0) {
        setTimeout(() => {
            statusInfo.textContent = '';
            statusInfo.classList.remove('active');
        }, duration);
    }
}

export function debounce(func, wait) {
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

export function throttle(func, limit) {
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

export async function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

export function formatDistance(meters) {
    if (meters < 1000) {
        return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
}

export function formatDuration(seconds) {
    if (seconds < 60) {
        return `${Math.round(seconds)}s`;
    }
    if (seconds < 3600) {
        return `${Math.floor(seconds / 60)}min`;
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}min`;
}

export function getLocationIcon(type = 'default') {
    const icons = {
        default: {
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        },
        start: {
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        },
        end: {
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        },
        current: {
            className: 'current-location-icon',
            html: '<div class="location-marker pulse"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        }
    };

    if (type === 'current') {
        return L.divIcon(icons.current);
    }
    return L.icon(icons[type] || icons.default);
}

// Cache management
export class Cache {
    constructor(maxSize = 100, duration = 5 * 60 * 1000) {
        this.maxSize = maxSize;
        this.duration = duration;
        this.cache = new Map();
        this.timestamps = new Map();
    }

    set(key, value) {
        if (this.cache.size >= this.maxSize) {
            this.removeOldest();
        }
        this.cache.set(key, value);
        this.timestamps.set(key, Date.now());
    }

    get(key) {
        const timestamp = this.timestamps.get(key);
        if (!timestamp) return null;

        if (Date.now() - timestamp > this.duration) {
            this.delete(key);
            return null;
        }

        return this.cache.get(key);
    }

    delete(key) {
        this.cache.delete(key);
        this.timestamps.delete(key);
    }

    removeOldest() {
        const oldest = Array.from(this.timestamps.entries())
            .sort(([, a], [, b]) => a - b)[0];
        if (oldest) {
            this.delete(oldest[0]);
        }
    }

    clear() {
        this.cache.clear();
        this.timestamps.clear();
    }
}

// Error handling
export class MapError extends Error {
    constructor(message, type = 'general') {
        super(message);
        this.name = 'MapError';
        this.type = type;
    }
}

// Constants
export const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
export const MAX_CACHE_SIZE = 100;
export const DEBOUNCE_DELAY = 300;
export const THROTTLE_DELAY = 100;

// URL validation
export function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}