import { 
  initializeLocationDetails, 
  initializePOISearch, 
  updateLocationInfo, 
  routeToPOI 
} from '/locationServices.js';

// Global variables
let map, markers = [], measurePoints = [], isMeasuring = false, polyline = null;
let routingControl = null;
let trafficLayer = null, roadworkLayer = null, incidentsLayer = null;
let measureTooltip = null;

// Get header and content elements
const header = document.querySelector('.header'); // or use appropriate selector
const content = document.querySelector('.content'); // or use appropriate selector

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

// Initialize map
async function initializeMap() {
  try {
      const response = await fetch('/api/config');
      const config = await response.json();
      
      map = L.map('map').setView(config.mapConfig.initialView, config.mapConfig.zoom);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      // Initialize layers
      trafficLayer = L.layerGroup().addTo(map);
      roadworkLayer = L.layerGroup().addTo(map);
      incidentsLayer = L.layerGroup().addTo(map);

      // Initialize routing control
      initializeRouting();

      // Map click handler for measuring
      map.on('click', handleMapClick);
      map.on('mousemove', updateMeasureTooltip);

      // Initialize event listeners after map is ready
      initializeEventListeners();
  } catch (error) {
      console.error('Map initialization error:', error);
      showError('Failed to initialize map');
  }
}
async function fetchAndDebug(endpoint, updateFunction, type) {
  try {
      console.log(`Fetching ${type} data from ${endpoint}...`);
      const response = await axios.get(endpoint);
      console.log(`${type} API response:`, response.data);

      if (response.data && response.data[type]) {
          updateFunction(response.data[type]);
      } else {
          console.warn(`No ${type} data available in the response.`);
          document.getElementById(`${type}-info`).textContent = `No ${type} data available yet.`;
      }
  } catch (error) {
      console.error(`Error fetching ${type} data from ${endpoint}:`, error);
  }
}

function updateDebugInfo(containerId, data, type) {
  console.log(`Updating ${type} info:`, data);
  const container = document.getElementById(containerId);
  if (container) {
      container.innerHTML = data.map((item) => `<p>${item.description}</p>`).join("");
  } else {
      console.error(`${type} container element with ID "${containerId}" not found!`);
  }
}

// Example usage:
fetchAndDebug("/api/traffic", (data) => updateDebugInfo("traffic-info", data, "traffic"), "traffic");
fetchAndDebug("/api/roadwork", (data) => updateDebugInfo("roadwork-info", data, "roadwork"), "roadwork");
fetchAndDebug("/api/incidents", (data) => updateDebugInfo("incident-info", data, "incidents"), "incidents");

// Custom marker icon
const customIcon = L.icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Routing functions
function initializeRouting() {
  routingControl = L.Routing.control({
      waypoints: [],
      routeWhileDragging: true,
      showAlternatives: true,
      altLineOptions: {
          styles: [
              {color: 'black', opacity: 0.15, weight: 9},
              {color: 'white', opacity: 0.8, weight: 6},
              {color: 'blue', opacity: 0.5, weight: 2}
          ]
      },
      geocoder: L.Control.Geocoder.nominatim(),
      addWaypoints: true,
      draggableWaypoints: true,
      fitSelectedRoutes: true
  }).addTo(map);
}

// Existing initialization code (e.g., map setup, initial configuration)

// Functions related to user location and geocoding
// Existing initialization code (e.g., map setup, initial configuration)

// Functions related to user location and geocoding
async function calculateRoute(startLocation, endLocation) {
  try {
      showStatus('Calculating route...');
      
      const [startCoords, endCoords] = await Promise.all([
          geocodeLocation(startLocation),
          geocodeLocation(endLocation)
      ]);

      if (!startCoords || !endCoords) {
          throw new Error('Could not find one or both locations');
      }

      routingControl.setWaypoints([
          L.latLng(startCoords.lat, startCoords.lon),
          L.latLng(endCoords.lat, endCoords.lon)
      ]);

      showStatus('Route calculated successfully!');
  } catch (error) {
      console.error('Route calculation error:', error);
      showError('Failed to calculate route');
  }
}
//Ender
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
    // Remove previous user location markers
    markers = markers.filter(marker => {
        if (marker.isUserLocation) {
            map.removeLayer(marker);
            return false;
        }
        return true;
    });

    const marker = L.marker(e.latlng, {icon: customIcon})
        .addTo(map)
        .bindPopup('Your current location')
        .openPopup();
    
    marker.isUserLocation = true;
    markers.push(marker);

    // Get address for the location
    reverseGeocode(e.latlng.lat, e.latlng.lng);
    updateLocationInfo(e.latlng.lat, e.latlng.lng);
    showStatus('Location found!');
}
// Geocoding functions

async function geocodeLocation(location) {
    try {
        const response = await fetch(`/api/route?start=${encodeURIComponent(location)}&end=${encodeURIComponent(location)}`);
        if (!response.ok) throw new Error('Geocoding request failed');
        
        const data = await response.json();
        return data.route.start; // We only need the start coordinates since we're just geocoding one location
    } catch (error) {
        console.error('Geocoding error:', error);
        throw error;
    }
}

async function reverseGeocode(lat, lon) {
  try {
      const response = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`);
      if (!response.ok) throw new Error('Geocoding request failed');
      
      const data = await response.json();
      const addressElement = document.getElementById('address');
      if (addressElement) {
          addressElement.innerHTML = data.address || 'Address not found.';
      }
  } catch (error) {
      console.error('Error during geocoding:', error);
      showError('Error retrieving address');
      throw error;
  }
}

// Weather-related functions
async function getWeather(lat, lon) {
  try {
      const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
      if (!response.ok) throw new Error('Weather request failed');
      
      const data = await response.json();
      const weather = data.weather;
      
      const weatherContainer = document.getElementById('current-weather');
      if (weatherContainer) {
          weatherContainer.innerHTML = `
              <div class="weather-info">
                  <img 
                      src="https://openweathermap.org/img/wn/${weather.icon}@2x.png"
                      alt="${weather.description}"
                      class="weather-icon"
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
  } catch (error) {
      console.error('Error getting weather:', error);
      showError('Weather information unavailable');
      throw error;
  }
}

// Traffic-related functions
async function getTrafficInfo(lat, lon) {
  try {
      const response = await fetch(`/api/traffic?lat=${lat}&lon=${lon}`);
      if (!response.ok) throw new Error('Traffic request failed');
      
      const data = await response.json();
      const trafficInfo = data.trafficInfo;
      
      const trafficContainer = document.getElementById('traffic-info');
      if (trafficContainer) {
          if (trafficInfo) {
              const congestionLevel = calculateCongestionLevel(trafficInfo.currentSpeed, trafficInfo.freeFlowSpeed);
              const delayFactor = calculateDelayFactor(trafficInfo.currentTravelTime, trafficInfo.freeFlowTravelTime);
              
              trafficContainer.innerHTML = `
                  <div class="traffic-info">
                      <div class="traffic-status ${congestionLevel.toLowerCase()}">
                          <h4>Traffic Status</h4>
                          <p class="congestion">Congestion: <span>${congestionLevel}</span></p>
                          <p class="current-speed">Current Speed: <span>${trafficInfo.currentSpeed} km/h</span></p>
                          <p class="normal-speed">Normal Speed: <span>${trafficInfo.freeFlowSpeed} km/h</span></p>
                          <p class="delay">Delay Factor: <span>${delayFactor}x</span></p>
                          ${trafficInfo.roadClosure ? '<p class="road-closure warning">⚠️ Road Closure Reported</p>' : ''}
                      </div>
                  </div>
              `;
              
              updateTrafficLayer(trafficInfo);
          } else {
              trafficContainer.innerHTML = '<p>No traffic information available for this area.</p>';
          }
      }
  } catch (error) {
      console.error('Error getting traffic information:', error);
      showError('Traffic information unavailable');
      throw error;
  }
}

// Traffic helper functions
function calculateCongestionLevel(currentSpeed, freeFlowSpeed) {
  if (!currentSpeed || !freeFlowSpeed) return 'Unknown';
  const ratio = currentSpeed / freeFlowSpeed;
  if (ratio > 0.8) return 'Light';
  if (ratio > 0.6) return 'Moderate';
  return 'Heavy';
}

function calculateDelayFactor(currentTime, freeFlowTime) {
  if (!currentTime || !freeFlowTime || freeFlowTime === 0) return 'N/A';
  return (currentTime / freeFlowTime).toFixed(1);
}

function updateTrafficInfo() {
    console.log('Updating traffic info...');
    fetch('/api/traffic')
        .then(response => response.json())
        .then(data => {
            const trafficContainer = document.getElementById('traffic-info');
            if (data.traffic && data.traffic.length > 0) {
                const trafficHTML = data.traffic.map(item => `
                    <div class="traffic-item ${item.severity}">
                        <p><strong>${item.description}</strong></p>
                        <p>Speed: ${item.speed} mph</p>
                        <p>Delay: ${item.delay} minutes</p>
                    </div>
                `).join('');
                trafficContainer.innerHTML = trafficHTML;
            } else {
                trafficContainer.innerHTML = '<p>No current traffic issues</p>';
            }
        })
        .catch(error => console.error('Error fetching traffic data:', error));
}

function getTrafficColor(congestionLevel) {
  switch (congestionLevel.toLowerCase()) {
      case 'light': return '#4CAF50';
      case 'moderate': return '#FFA000';
      case 'heavy': return '#E53935';
      default: return '#757575';
  }
}

// New functions to handle layer updates
function updateTrafficInfo() {
    console.log('Updating traffic info...');
    fetch('/api/traffic')
        .then(response => response.json())
        .then(data => {
            const trafficContainer = document.getElementById('traffic-info');
            if (data.traffic && data.traffic.length > 0) {
                const trafficHTML = data.traffic.map(item => `
                    <div class="traffic-item ${item.severity}">
                        <p><strong>${item.description}</strong></p>
                        <p>Location: ${item.location}</p>
                        <p>Speed: ${item.speed} mph</p>
                        <p>Delay: ${item.delay} minutes</p>
                    </div>
                `).join('');
                trafficContainer.innerHTML = trafficHTML;

                // Clear existing traffic layers
                trafficLayer.clearLayers();

                // Add traffic data to the map
                data.traffic.forEach(item => {
                    if (item.coordinates) {
                        const marker = L.circleMarker([item.coordinates.lat, item.coordinates.lng], {
                            radius: 8,
                            fillColor: getTrafficSeverityColor(item.severity),
                            color: '#fff',
                            weight: 1,
                            opacity: 1,
                            fillOpacity: 0.8
                        }).bindPopup(`
                            <strong>${item.description}</strong><br>
                            Speed: ${item.speed} mph<br>
                            Delay: ${item.delay} minutes
                        `);
                        trafficLayer.addLayer(marker);
                    }
                });
            } else {
                trafficContainer.innerHTML = '<p>No current traffic issues</p>';
            }
        })
        .catch(error => {
            console.error('Error fetching traffic data:', error);
            document.getElementById('traffic-info').innerHTML = '<p>Error loading traffic data</p>';
        });
}

function updateRoadworkInfo() {
    console.log('Updating roadwork info...');
    fetch('/api/roadwork')
        .then(response => response.json())
        .then(data => {
            const roadworkContainer = document.getElementById('roadwork-info');
            if (data.roadwork && data.roadwork.length > 0) {
                const roadworkHTML = data.roadwork.map(item => `
                    <div class="roadwork-item">
                        <p><strong>${item.description}</strong></p>
                        <p>Status: ${item.status}</p>
                        <p>Impact: ${item.impact}</p>
                        <p>Duration: ${item.startDate} - ${item.endDate}</p>
                    </div>
                `).join('');
                roadworkContainer.innerHTML = roadworkHTML;

                // Clear existing roadwork layers
                roadworkLayer.clearLayers();

                // Add roadwork markers to the map
                data.roadwork.forEach(item => {
                    const icon = L.divIcon({
                        className: 'roadwork-icon',
                        html: '<i class="fas fa-hard-hat"></i>',
                        iconSize: [30, 30]
                    });

                    const marker = L.marker([item.lat, item.lng], { icon }).bindPopup(`
                        <strong>${item.description}</strong><br>
                        Status: ${item.status}<br>
                        Impact: ${item.impact}<br>
                        Duration: ${item.startDate} - ${item.endDate}
                    `);
                    roadworkLayer.addLayer(marker);
                });
            } else {
                roadworkContainer.innerHTML = '<p>No current roadwork</p>';
            }
        })
        .catch(error => {
            console.error('Error fetching roadwork data:', error);
            document.getElementById('roadwork-info').innerHTML = '<p>Error loading roadwork data</p>';
        });
}

function updateIncidentInfo() {
    console.log('Updating incident info...');
    fetch('/api/incidents')
        .then(response => response.json())
        .then(data => {
            const incidentContainer = document.getElementById('incident-info');
            if (data.incidents && data.incidents.length > 0) {
                const incidentHTML = data.incidents.map(item => `
                    <div class="incident-item ${item.severity}">
                        <p><strong>${item.description}</strong></p>
                        <p>Type: ${item.type}</p>
                        <p>Status: ${item.status}</p>
                        <p>Time: ${new Date(item.timestamp).toLocaleString()}</p>
                    </div>
                `).join('');
                incidentContainer.innerHTML = incidentHTML;

                // Clear existing incident layers
                incidentsLayer.clearLayers();

                // Add incident markers to the map
                data.incidents.forEach(item => {
                    const icon = L.divIcon({
                        className: `incident-icon ${item.severity}`,
                        html: '<i class="fas fa-exclamation-triangle"></i>',
                        iconSize: [30, 30]
                    });

                    const marker = L.marker([item.lat, item.lng], { icon }).bindPopup(`
                        <strong>${item.description}</strong><br>
                        Type: ${item.type}<br>
                        Status: ${item.status}<br>
                        Time: ${new Date(item.timestamp).toLocaleString()}
                    `);
                    incidentsLayer.addLayer(marker);
                });
            } else {
                incidentContainer.innerHTML = '<p>No current incidents</p>';
            }
        })
        .catch(error => {
            console.error('Error fetching incident data:', error);
            document.getElementById('incident-info').innerHTML = '<p>Error loading incident data</p>';
        });
}

// Helper function to determine traffic severity color
function getTrafficSeverityColor(severity) {
    switch (severity.toLowerCase()) {
        case 'high':
            return '#ff4444';
        case 'medium':
            return '#ffbb33';
        case 'low':
            return '#00C851';
        default:
            return '#757575';
    }
}

// Event listeners for layer toggles
document.getElementById('traffic-layer').addEventListener('change', function(e) {
    if (e.target.checked) {
        updateTrafficInfo();
        map.addLayer(trafficLayer);
    } else {
        map.removeLayer(trafficLayer);
        document.getElementById('traffic-info').innerHTML = '<p>Traffic layer disabled</p>';
    }
});

document.getElementById('roadwork-layer').addEventListener('change', function(e) {
    if (e.target.checked) {
        updateRoadworkInfo();
        map.addLayer(roadworkLayer);
    } else {
        map.removeLayer(roadworkLayer);
        document.getElementById('roadwork-info').innerHTML = '<p>Roadwork layer disabled</p>';
    }
});

document.getElementById('incidents-layer').addEventListener('change', function(e) {
    if (e.target.checked) {
        updateIncidentInfo();
        map.addLayer(incidentsLayer);
    } else {
        map.removeLayer(incidentsLayer);
        document.getElementById('incident-info').innerHTML = '<p>Incidents layer disabled</p>';
    }
});

// Add periodic updates (every 5 minutes)
setInterval(() => {
    if (document.getElementById('traffic-layer').checked) updateTrafficInfo();
    if (document.getElementById('roadwork-layer').checked) updateRoadworkInfo();
    if (document.getElementById('incidents-layer').checked) updateIncidentInfo();
}, 300000); // 5 minutes in milliseconds

function handleMapClick(e) {
  if (!isMeasuring) return;

  const point = e.latlng;
  measurePoints.push(point);

  const marker = L.marker(point, {
      icon: customIcon,
      draggable: true
  })
  .addTo(map)
  .on('click', function() {
      if (isMeasuring) {
          removeMeasurePoint(this);
      }
  })
  .on('dragend', updateMeasurements);

  markers.push(marker);
  updateMeasurements();
}



function updateMeasurements() {
  if (polyline) {
      map.removeLayer(polyline);
  }

  if (measurePoints.length > 1) {
      polyline = L.polyline(measurePoints, {
          color: 'red',
          weight: 3,
          opacity: 0.7,
          smoothFactor: 1
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
  if (!isMeasuring || measurePoints.length === 0) return;

  if (!measureTooltip) {
      measureTooltip = L.tooltip({
          permanent: true,
          direction: 'right',
          className: 'measuring-tooltip'
      }).addTo(map);
  }

  const lastPoint = measurePoints[measurePoints.length - 1];
  const distance = lastPoint.distanceTo(e.latlng);
  const km = (distance / 1000).toFixed(2);
  
  measureTooltip.setLatLng(e.latlng);
  measureTooltip.setContent(`Click to measure: ${km} km`);
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
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(searchValue)}`);
      if (!response.ok) throw new Error('Search request failed');
      
      const data = await response.json();
      if (data.geometry) {
          const { lat, lon } = data.geometry;
          map.setView([lat, lon], 13);
          
          const marker = L.marker([lat, lon], {icon: customIcon})
              .addTo(map)
              .bindPopup(`<strong>${data.address}</strong>`)
              .openPopup();
          
          markers.push(marker);
          await updateLocationInfo(lat, lon);
          showStatus('Location found!');

          // New addition to handle after location search
          const locationDetails = `Latitude: ${lat}, Longitude: ${lon}`;
          console.log(locationDetails); // Optional: Log location details
          document.getElementById('location-details').innerHTML = locationDetails; // Show on UI
      } else {
          showError('Location not found');
      }
  } catch (error) {
      console.error('Error searching location:', error);
      showError('Error searching for location');
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

// Clear
function clearMeasurements() {
  measurePoints = [];
  if (polyline) {
      map.removeLayer(polyline);
      polyline = null;
  }
  if (measureTooltip) {
      map.removeLayer(measureTooltip);
      measureTooltip = null;
  }
  clearMarkers();
  showStatus('Measurements cleared');
}

function clearMarkers() {
  markers.forEach(marker => map.removeLayer(marker));
  markers = [];
}

function clearMap() {
  clearMarkers();
  clearMeasurements();
  if (routingControl) {
      routingControl.setWaypoints([]);
  }
  isMeasuring = false;
  document.getElementById('measure-distance')?.classList.remove('active');
  showStatus('Map cleared');
}

// Layer toggle handlers
function handleTrafficLayerToggle(e) {
  if (e.target.checked) {
      map.addLayer(trafficLayer);
      updateTrafficInfo();
  } else {
      map.removeLayer(trafficLayer);
  }
}

function handleRoadworkLayerToggle(e) {
  if (e.target.checked) {
      map.addLayer(roadworkLayer);
      updateRoadworkInfo();
  } else {
      map.removeLayer(roadworkLayer);
  }
}

function handleIncidentLayerToggle(e) {
  if (e.target.checked) {
      map.addLayer(incidentsLayer);
      updateIncidentInfo();
  } else {
      map.removeLayer(incidentsLayer);
  }
}

// Initialize event listeners
function initializeEventListeners() {
  // Button click handlers
  document.getElementById('find-location')?.addEventListener('click', locateUser);
  document.getElementById('search-btn')?.addEventListener('click', searchLocation);
  document.getElementById('clear-all')?.addEventListener('click', clearMap);
  document.getElementById('measure-distance')?.addEventListener('click', toggleMeasuring);
  
  // Panel toggles
  document.getElementById('toggle-navigation')?.addEventListener('click', () => 
      toggleContainer('.navigation-container'));
  document.getElementById('toggle-weather')?.addEventListener('click', () => 
      toggleContainer('.weather-container'));
  document.getElementById('toggle-traffic')?.addEventListener('click', () => 
      toggleContainer('.traffic-container'));
  
  // Layer toggles
  document.getElementById('traffic-layer')?.addEventListener('change', handleTrafficLayerToggle);
  document.getElementById('roadwork-layer')?.addEventListener('change', handleRoadworkLayerToggle);
  document.getElementById('incidents-layer')?.addEventListener('change', handleIncidentLayerToggle);
  
  // Search input enter key
  document.getElementById('search-input')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') searchLocation();
  });

  // Route form
  document.getElementById('route-form')?.addEventListener('submit', function(e) {
      e.preventDefault();
      const start = document.getElementById('route-start').value;
      const end = document.getElementById('route-end').value;
      calculateRoute(start, end);
  });

  // Transport mode
  document.getElementById('transport-mode')?.addEventListener('change', function(e) {
      if (routingControl) {
          routingControl.getRouter().options.profile = e.target.value;
          routingControl.route();
      }
  });

  // Add keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcuts);
}

// Keyboard shortcuts
function handleKeyboardShortcuts(e) {
  // Escape key to exit measuring mode
  if (e.key === 'Escape') {
      if (isMeasuring) {
          toggleMeasuring();
      }
  }

  // Delete key to clear last measurement point
  if (e.key === 'Delete' || e.key === 'Backspace') {
      if (isMeasuring && measurePoints.length > 0) {
          const lastMarker = markers[markers.length - 1];
          if (lastMarker) {
              removeMeasurePoint(lastMarker);
          }
      }
  }
}

// Utility functions
function showError(message, duration = 3000) {
  const statusInfo = document.getElementById('status-info');
  if (statusInfo) {
      statusInfo.textContent = message;
      statusInfo.classList.add('error');
      setTimeout(() => {
          statusInfo.textContent = '';
          statusInfo.classList.remove('error');
      }, duration);
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

// Initialize map when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeMap();
  initializeLocationDetails();
  initializePOISearch(map, markers, routingControl, showStatus, showError);
});

// Export functions for testing if needed
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