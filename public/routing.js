// routing.js
import { calculateRouteWithTraffic } from './trafficService.js';
import { showError } from './utils.js';

export function initializeRouting(map) {
    if (!map || !map.getContainer()) {
        console.error('Map not ready for routing initialization');
        return;
    }

    const routingOptions = {
        waypoints: [],
        routeWhileDragging: false,
        showAlternatives: true,
        useCache: true,
        profile: 'fastest',
        alternatives: 1,
        geometryOnly: false,
        continuousWorld: false,
        altLineOptions: {
            styles: [
                { color: '#1a237e', opacity: 0.15, weight: 9 },
                { color: '#ffffff', opacity: 0.8, weight: 6 },
                { color: '#0d47a1', opacity: 0.5, weight: 2 }
            ]
        }
    };

    try {
        const routingControl = L.Routing.control(routingOptions);
        routingControl.addTo(map);

        // Enhance routing control with traffic information
        const originalRoute = routingControl.route.bind(routingControl);
        routingControl.route = async function () {
            const waypoints = this.getWaypoints().filter(wp => wp.latLng);

            if (waypoints.length >= 2) {
                try {
                    // Calculate traffic-aware route
                    const trafficRoute = await calculateRouteWithTraffic(
                        waypoints[0].latLng,
                        waypoints[waypoints.length - 1].latLng,
                        map,
                        this
                    );

                    // Fall back to original routing if traffic routing fails
                    if (!trafficRoute) {
                        return originalRoute();
                    }
                } catch (error) {
                    console.error('Traffic routing failed, falling back to default:', error);
                    return originalRoute();
                }
            }
        };

        // Add routing preferences
        addRoutingPreferences(map, routingControl);

        return routingControl;
    } catch (error) {
        console.error('Routing initialization error:', error);
        showError('Failed to initialize routing');
        return null;
    }
}

function addRoutingPreferences(map, routingControl) {
    const preferenceControl = L.control({ position: 'topright' });

    preferenceControl.onAdd = function () {
        const container = L.DomUtil.create('div', 'routing-preferences leaflet-bar leaflet-control');
        container.innerHTML = `
            <div class="preference-controls">
                <select id="routing-profile" class="routing-select">
                    <option value="fastest">Fastest Route</option>
                    <option value="shortest">Shortest Route</option>
                    <option value="balanced">Balanced</option>
                    <option value="scenic">Scenic Route</option>
                </select>
                <div class="avoid-options">
                    <label><input type="checkbox" id="avoid-tolls"> Avoid Tolls</label>
                    <label><input type="checkbox" id="avoid-highways"> Avoid Highways</label>
                    <label><input type="checkbox" id="avoid-ferries"> Avoid Ferries</label>
                </div>
            </div>
        `;

        // Add event listeners
        setTimeout(() => {
            const profile = container.querySelector('#routing-profile');
            const avoidTolls = container.querySelector('#avoid-tolls');
            const avoidHighways = container.querySelector('#avoid-highways');
            const avoidFerries = container.querySelector('#avoid-ferries');

            [profile, avoidTolls, avoidHighways, avoidFerries].forEach(element => {
                element.addEventListener('change', () => {
                    if (routingControl.getWaypoints().length >= 2) {
                        routingControl.route();
                    }
                });
            });
        }, 0);

        // Hide importing accuracy or any similar data after 3 seconds
        setTimeout(() => {
            const accuracyElement = container.querySelector('.importing-accuracy');
            if (accuracyElement) {
                accuracyElement.style.display = 'none';
            }
        }, 3000);

        return container;
    };

    preferenceControl.addTo(map);
}
