const API_KEY = 'eb74122e726742799140125dc8efc149';  // OpenCage API key
const WEATHER_API_KEY = '849faba731d18dfcae62c703c094c63e'; // Weather API key
const TOMTOM_TRAFFIC_API_KEY = 'qzfGbMUcpj7bZbGVf07O8k4ZKuPFCRRe'; // TomTom Traffic API key

let map = L.map('map').setView([51.505, -0.09], 2);
let markers = [];
let measurePoints = [];
let isMeasuring = false;
let polyline = null;

// Set up the OpenStreetMap layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Custom marker icon
const customIcon = L.icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Function to handle geolocation with tracking
function locateUser() {
  console.log("locateUser called");
  if (navigator.geolocation) {
    map.locate({
      setView: true,
      maxZoom: 16,
      watch: true, // Enable continuous tracking
      enableHighAccuracy: true
    });

    map.on('locationfound', (e) => {
      // Remove previous location marker if it exists
      markers.forEach(marker => {
        if (marker.isUserLocation) {
          map.removeLayer(marker);
        }
      });

      // Add new location marker
      const marker = L.marker(e.latlng, {icon: customIcon})
        .addTo(map)
        .bindPopup('Your current location')
        .openPopup();
      
      marker.isUserLocation = true;
      markers.push(marker);

      reverseGeocode(e.latlng.lat, e.latlng.lng);
      getWeather(e.latlng.lat, e.latlng.lng);
      getTrafficInfo(e.latlng.lat, e.latlng.lng); // Get traffic info for user location
    });

    map.on('locationerror', (e) => {
      alert('Location access denied or unavailable.');
    });
  } else {
    alert('Geolocation is not supported by this browser.');
  }
}

// Function to perform reverse geocoding
async function reverseGeocode(lat, lon) {
  try {
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lon}&key=${API_KEY}`;
    const response = await axios.get(url);
    const results = response.data.results;
    
    const addressElement = document.getElementById('address');
    if (addressElement) {
      if (results.length > 0) {
        addressElement.innerHTML = `
          <strong>Address:</strong><br>
          ${results[0].formatted}
        `;
      } else {
        addressElement.innerText = 'Address not found.';
      }
    }
  } catch (error) {
    console.error('Error during geocoding:', error);
    const addressElement = document.getElementById('address');
    if (addressElement) {
      addressElement.innerText = 'Error retrieving address.';
    }
  }
}

// Function to get weather information
async function getWeather(lat, lon) {
  console.log("getWeather called");
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}&units=metric`;
    const response = await axios.get(url);
    const weather = response.data;
    
    const weatherElement = document.getElementById('weather-info');
    if (weatherElement) {
      weatherElement.innerHTML = `
        <strong>Weather:</strong><br>
        Temperature: ${Math.round(weather.main.temp)}°C<br>
        Conditions: ${weather.weather[0].description}<br>
        Humidity: ${weather.main.humidity}%
      `;
    }
  } catch (error) {
    console.error('Error getting weather:', error);
    const weatherElement = document.getElementById('weather-info');
    if (weatherElement) {
      weatherElement.innerText = 'Weather information unavailable.';
    }
  }
}

// Function to get traffic information using TomTom Traffic API
async function getTrafficInfo(lat, lon) {
  console.log("getTrafficInfo called");
  try {
    const url = `https://api.tomtom.com/traffic/services/4/incidentDetails?key=${TOMTOM_TRAFFIC_API_KEY}&lat=${lat}&lon=${lon}&radius=5000`; // 5 km radius
    const response = await axios.get(url);
    const incidents = response.data.incidents;

    let trafficInfo = '<strong>Traffic Info:</strong><br>';
    if (incidents && incidents.length > 0) {
      incidents.forEach(incident => {
        trafficInfo += `
          <p><strong>${incident.type}</strong>: ${incident.shortDescription}</p>
          <p>Location: ${incident.location.address.freeformAddress}</p>
        `;
      });
    } else {
      trafficInfo += '<p>No incidents reported in this area.</p>';
    }

    const trafficElement = document.getElementById('traffic-info');
    if (trafficElement) {
      trafficElement.innerHTML = trafficInfo;
    }
  } catch (error) {
    console.error('Error getting traffic information:', error);
    const trafficElement = document.getElementById('traffic-info');
    if (trafficElement) {
      trafficElement.innerText = 'Traffic information unavailable.';
    }
  }
}

// Search functionality
async function searchLocation() {
  console.log("searchLocation called");
  const searchInput = document.getElementById('search-input').value;
  if (!searchInput) return;

  try {
    const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(searchInput)}&key=${API_KEY}`;
    const response = await axios.get(url);
    
    if (response.data.results.length > 0) {
      const result = response.data.results[0];
      const { lat, lng } = result.geometry;
      
      map.setView([lat, lng], 13);
      const marker = L.marker([lat, lng], {icon: customIcon})
        .addTo(map)
        .bindPopup(`
          <div class="custom-popup">
            <h3>${result.formatted}</h3>
            <p>Latitude: ${lat.toFixed(4)}</p>
            <p>Longitude: ${lng.toFixed(4)}</p>
          </div>
        `)
        .openPopup();
      
      markers.push(marker);
      getWeather(lat, lng);
      getTrafficInfo(lat, lng); // Get traffic info for searched location
    } else {
      alert('Location not found');
    }
  } catch (error) {
    console.error('Error searching location:', error);
    alert('Error searching for location');
  }
}

// Distance measurement functionality
function toggleMeasurement() {
  isMeasuring = !isMeasuring;
  const measureBtn = document.getElementById('measure-distance');
  
  if (isMeasuring) {
    measureBtn.classList.add('measuring-active');
    map.on('click', addMeasurePoint);
  } else {
    measureBtn.classList.remove('measuring-active');
    map.off('click', addMeasurePoint);
    clearMeasurement();
  }
}

function addMeasurePoint(e) {
  const point = e.latlng;
  measurePoints.push(point);
  
  const marker = L.marker(point, {icon: customIcon}).addTo(map);
  markers.push(marker);

  if (measurePoints.length > 1) {
    if (polyline) {
      map.removeLayer(polyline);
    }
    
    polyline = L.polyline(measurePoints, {color: 'red'}).addTo(map);
    const distance = calculateDistance();
    const distanceElement = document.getElementById('distance-info');
    if (distanceElement) {
      distanceElement.innerHTML = `
        <strong>Distance:</strong><br>
        ${distance.toFixed(2)} km
      `;
    }
  }
}

function calculateDistance() {
  let totalDistance = 0;
  for (let i = 1; i < measurePoints.length; i++) {
    totalDistance += measurePoints[i].distanceTo(measurePoints[i-1]) / 1000; // Convert to km
  }
  return totalDistance;
}

function clearMeasurement() {
  measurePoints = [];
  if (polyline) {
    map.removeLayer(polyline);
    polyline = null;
  }
  const distanceElement = document.getElementById('distance-info');
  if (distanceElement) {
    distanceElement.innerText = '';
  }
}

// Clear all markers
function clearAll() {
  markers.forEach(marker => map.removeLayer(marker));
  markers = [];
  clearMeasurement();
  const addressElement = document.getElementById('address');
  if (addressElement) {
    addressElement.innerText = '';
  }
  const weatherElement = document.getElementById('weather-info');
  if (weatherElement) {
    weatherElement.innerText = '';
  }
  const trafficElement = document.getElementById('traffic-info');
  if (trafficElement) {
    trafficElement.innerText = '';
  }
}

// Event listeners - Check if the element exists before adding event listener
document.addEventListener('DOMContentLoaded', function () {
  const locateBtn = document.getElementById('locate-btn');
  const searchBtn = document.getElementById('search-btn');
  const measureDistanceBtn = document.getElementById('measure-distance');
  const clearBtn = document.getElementById('clear-btn');

  // Debugging logs
  console.log(locateBtn, searchBtn, measureDistanceBtn, clearBtn);

  if (locateBtn) {
    locateBtn.addEventListener('click', function() {
      console.log("Locate button clicked!");
      locateUser();
    });
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', function() {
      console.log("Search button clicked!");
      searchLocation();
    });
  }

  if (measureDistanceBtn) {
    measureDistanceBtn.addEventListener('click', function() {
      console.log("Measure distance button clicked!");
      toggleMeasurement();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      console.log("Clear button clicked!");
      clearAll();
    });
  }
});
