// Global state for POIs
let currentPOIs = [];
let selectedPOI = null;

// Location Details Management
export function initializeLocationDetails() {
    const header = document.getElementById('location-header');
    const content = document.getElementById('location-content');

    if (header && content) {
        header.addEventListener('click', () => {
            content.classList.toggle('collapsed');
            const icon = header.querySelector('i');
            icon.classList.toggle('fa-chevron-down');
            icon.classList.toggle('fa-chevron-up');
        });
    }
}

export function updateLocationInfo(lat, lng) {
    try {
        const detailsContainer = document.querySelector('.location-details-container');
        detailsContainer.style.display = 'block';
        
        // Clear existing details
        clearLocationDetails();
        
        // Update coordinates (always show)
        updateDetailItem('coordinates', `${lat.toFixed(6)}, ${lng.toFixed(6)}`, 'compass');
        
        // Update other details asynchronously
        fetchAndUpdateDetails(lat, lng);
    } catch (error) {
        console.error('Error updating location info:', error);
        showError('Failed to update location information');
    }
}

function clearLocationDetails() {
    const detailsGrid = document.querySelector('.details-grid');
    if (detailsGrid) {
        detailsGrid.innerHTML = '';
    }
}

function updateDetailItem(id, content, icon) {
    if (!content) return; // Don't show empty items

    const detailsGrid = document.querySelector('.details-grid');
    if (!detailsGrid) return;

    const detailItem = document.createElement('div');
    detailItem.className = 'detail-item';
    detailItem.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${content}</span>
    `;
    detailsGrid.appendChild(detailItem);
}

async function fetchAndUpdateDetails(lat, lng) {
    try {
        const [addressInfo, nearbyPlaces] = await Promise.all([
            reverseGeocode(lat, lng),
            getNearbyPlaces(lat, lng)
        ]);

        if (addressInfo?.address) {
            updateDetailItem('address', addressInfo.address, 'map-marker-alt');
        }
        
        if (addressInfo?.road) {
            updateDetailItem('nearest-road', addressInfo.road, 'road');
        }
        
        if (nearbyPlaces?.length > 0) {
            updateDetailItem('nearby-places', 
                `Nearby: ${nearbyPlaces.slice(0, 3).join(', ')}`, 'building');
        }

    } catch (error) {
        console.error('Error fetching location details:', error);
        showError('Failed to fetch location details');
    }
}

// POI Search Management
export function initializePOISearch(map, markers, routingControl, showStatus, showError) {
    const searchContainer = document.querySelector('.search-container');
    const searchTypeBtn = document.createElement('button');
    searchTypeBtn.className = 'search-type-selector';
    searchTypeBtn.innerHTML = '<i class="fas fa-list"></i>';
    searchTypeBtn.title = 'Search by category';
    searchContainer.appendChild(searchTypeBtn);

    // Add POI categories
    const categories = document.createElement('div');
    categories.className = 'poi-categories hidden';
    categories.innerHTML = getPOICategoriesHTML();
    searchContainer.appendChild(categories);

    // Add category click handlers
    categories.addEventListener('click', (e) => {
        const category = e.target.closest('.poi-category');
        if (category) {
            const categoryName = category.dataset.category;
            const center = map.getCenter();
            searchPOIs(categoryName, center.lat, center.lng, map, markers, routingControl, showStatus, showError);
            categories.classList.add('hidden');
        }
    });

    // Event listeners
    searchTypeBtn.addEventListener('click', () => {
        categories.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!searchContainer.contains(e.target)) {
            categories.classList.add('hidden');
        }
    });
}

function getPOICategoriesHTML() {
    const categories = [
        { icon: 'utensils', name: 'Restaurants' },
        { icon: 'shopping-cart', name: 'Shops' },
        { icon: 'coffee', name: 'Cafes' },
        { icon: 'hotel', name: 'Hotels' },
        { icon: 'hospital', name: 'Hospitals' },
        { icon: 'gas-pump', name: 'Gas Stations' }
    ];

    return categories.map(cat => `
        <div class="poi-category" data-category="${cat.name.toLowerCase()}">
            <i class="fas fa-${cat.icon}"></i>
            <span>${cat.name}</span>
        </div>
    `).join('');
}

async function searchPOIs(category, lat, lng, map, markers, routingControl, showStatus, showError) {
    try {
        showStatus('Searching nearby places...');
        const response = await fetch(`/api/pois?category=${category}&lat=${lat}&lon=${lng}`);
        if (!response.ok) throw new Error('POI search failed');
        
        const data = await response.json();
        currentPOIs = data.pois || [];
        
        clearPOIMarkers(map, markers);
        
        // Add new POI markers
        currentPOIs.forEach(poi => {
            const marker = L.marker([poi.lat, poi.lon], {
                icon: customIcon
            })
            .bindPopup(`
                <div class="poi-popup">
                    <h4>${poi.name}</h4>
                    <p>${poi.address}</p>
                    ${poi.rating ? `<p>Rating: ${poi.rating} ⭐</p>` : ''}
                    <button onclick="routeToPOI(${poi.lat}, ${poi.lon})">Route Here</button>
                </div>
            `)
            .addTo(map);
            
            markers.push(marker);
        });

        showStatus(`Found ${currentPOIs.length} locations`);
    } catch (error) {
        console.error('Error searching POIs:', error);
        showError('Failed to search nearby places');
    }
}

function clearPOIMarkers(map, markers) {
    markers.forEach(marker => {
        if (!marker.isUserLocation) {
            map.removeLayer(marker);
        }
    });
    markers = markers.filter(marker => marker.isUserLocation);
}

export function routeToPOI(lat, lon, routingControl, map) {
    if (routingControl) {
        const start = routingControl.getWaypoints()[0]?.latLng || map.getCenter();
        routingControl.setWaypoints([L.latLng(start), L.latLng(lat, lon)]);
    }
}

// Helper functions
function showError(message) {
    const event = new CustomEvent('showError', { detail: message });
    document.dispatchEvent(event);
}

function reverseGeocode(lat, lon) {
    return fetch(`/api/geocode?lat=${lat}&lon=${lon}`)
        .then(response => response.json())
        .catch(error => {
            console.error('Geocoding error:', error);
            return null;
        });
}

async function getNearbyPlaces(lat, lon) {
    try {
        const response = await fetch(`/api/nearby?lat=${lat}&lon=${lon}`);
        
        if (!response.ok) {
            // If 404 error, handle accordingly
            if (response.status === 404) {
                console.error(`API endpoint for nearby places not found at ${lat}, ${lon}`);
                return [];
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data.places || [];
    } catch (error) {
        console.error('Error fetching nearby places:', error);
        return [];
    }
}
