const API_KEY = 'eb74122e726742799140125dc8efc149';  // OpenCage API key
const map = L.map('map').setView([51.505, -0.09], 2);  // Default to a global view

// Set up the OpenStreetMap layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Function to handle geolocation
function locateUser() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude } = position.coords;
      map.setView([latitude, longitude], 13); // Zoom in on the user's location
      L.marker([latitude, longitude]).addTo(map)
        .bindPopup('You are here!')
        .openPopup();

      reverseGeocode(latitude, longitude); // Get the address
    }, () => {
      alert('Location access denied or unavailable.');
    });
  } else {
    alert('Geolocation is not supported by this browser.');
  }
}

// Function to perform reverse geocoding
function reverseGeocode(lat, lon) {
  const url = `https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lon}&key=${API_KEY}`;
  
  axios.get(url)
    .then(response => {
      const results = response.data.results;
      if (results.length > 0) {
        document.getElementById('address').innerText = `Address: ${results[0].formatted}`;
      } else {
        document.getElementById('address').innerText = 'Address not found.';
      }
    })
    .catch(error => {
      console.error('Error during geocoding:', error);
      document.getElementById('address').innerText = 'Error retrieving address.';
    });
}

// Event listener for the "Find My Location" button
document.getElementById('find-location').addEventListener('click', locateUser);
