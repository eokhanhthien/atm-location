// Array of ATM coordinates (latitude, longitude, name) - TP Cà Mau
const atms = [
    { lat: 9.169887, lng: 105.146648, name: "ATM VietinBank - Thương Nghiệp" },
    { lat: 9.176391, lng: 105.150386, name: "ATM VietinBank - Lý Thường Kiệt" },
    { lat: 9.176106, lng: 105.150526, name: "R-ATM VietinBank - Nạp - Rút" },
    { lat: 9.181793, lng: 105.142854, name: "ATM VietinBank - UBTP" },
    { lat: 9.177732, lng: 105.154361, name: "ATM VietinBank - Sense City" }
];

// Array of PGD coordinates (latitude, longitude, name) - TP Cà Mau
const pgds = [
    { lat: 9.169887, lng: 105.146648, name: "PGD VietinBank - Thương Nghiệp" },
    { lat: 9.176391, lng: 105.150386, name: "PGD VietinBank - Lý Thường Kiệt" },
    { lat: 9.181793, lng: 105.142854, name: "PGD VietinBank - UBTP" },
    { lat: 9.175000, lng: 105.148000, name: "PGD VietinBank - Trung Tâm" }
];

// Initialize map at TP Cà Mau with bearing support
const map = L.map('map', {
    zoomControl: true,
    attributionControl: false,
    bearing: 0
}).setView([9.1766, 105.1524], 16);

// Navigation state variables
let navigationActive = false;
let followMode = false;
let watchPositionId = null;
let currentBearing = 0;
let currentUserHeading = 0; // Store current user heading
let lastPosition = null; // Track previous position for heading calculation
let defaultView = { lat: 9.1766, lng: 105.1524, zoom: 16 };

// Advanced routing variables
let currentRoute = null; // Store current route data
let routeCoordinates = []; // Full route coordinates
let passedRouteCoordinates = []; // Coordinates already passed
let currentDestination = null; // Current navigation destination
let lastRouteUpdateTime = 0; // Throttle route updates

// Rotation variables
let isRotating = false;
let mapPane = null;
let startRotationAngle = 0;
let rotationCenter = null;

// User tracking variables
let userAccuracyCircle = null;

// Pending navigation when location is not available
let pendingNavigation = null;

// Map layers
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');

// Start with satellite layer
satelliteLayer.addTo(map);

let currentLayer = 'satellite';
let userMarker, nearestATM, nearestPGD, routeLine, atmMarkers = [], pgdMarkers = [];

// Mobile touch rotation like Google Maps - FULLY ENABLED
function initializeMapRotation() {
    console.log('🔄 FULLY ENABLING touch rotation for complete Google Maps experience');

    const mapContainer = map.getContainer();

    console.log('✅ Mobile touch rotation ACTIVE');

    // Touch rotation variables
    let isTouchRotating = false;
    let initialTouchAngle = 0;
    let initialTouchDistance = 0;
    let startBearing = 0;

    // Touch rotation (2-finger) - FULLY ENABLED
    mapContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];

            initialTouchDistance = getTouchDistance(touch1, touch2);
            initialTouchAngle = getTouchAngle(touch1, touch2);
            isTouchRotating = true;
            startBearing = currentBearing;

            // Disable default Leaflet touch handling temporarily
            map.touchZoom.disable();
            map.dragging.disable();

            showRotationIndicator();
            console.log('🔄 2-finger rotation started');
            e.preventDefault();
        }
    }, { passive: false });

    mapContainer.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && isTouchRotating) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];

            const currentDistance = getTouchDistance(touch1, touch2);
            const currentAngle = getTouchAngle(touch1, touch2);

            // Calculate distance change for zoom vs rotate detection
            const distanceChange = Math.abs(currentDistance - initialTouchDistance);

            if (distanceChange < 30) {
                // If distance is stable, this is rotation
                let angleDiff = currentAngle - initialTouchAngle;

                // Handle angle wrapping
                if (angleDiff > 180) angleDiff -= 360;
                if (angleDiff < -180) angleDiff += 360;

                // Only rotate if significant angle change
                if (Math.abs(angleDiff) > 5) {
                    rotateMapTouch(startBearing + angleDiff);
                }
            }

            e.preventDefault();
        }
    }, { passive: false });

    mapContainer.addEventListener('touchend', (e) => {
        if (isTouchRotating) {
            isTouchRotating = false;
            hideRotationIndicator();

            // Re-enable Leaflet controls
            setTimeout(() => {
                map.touchZoom.enable();
                map.dragging.enable();
            }, 100);

            console.log('🔄 2-finger rotation ended');
        }
    });
}

// Rotate map using CSS transform - FULLY ENABLED
function rotateMapTouch(angle) {
    currentBearing = ((angle % 360) + 360) % 360;

    console.log('🔄 Rotating map to:', currentBearing.toFixed(1) + '°');

    // Use CSS transform for smooth rotation (Leaflet bearing API not available)
    const mapPane = map.getPanes().mapPane;
    if (mapPane) {
        mapPane.style.transform = `rotate(${currentBearing}deg)`;
        mapPane.style.transformOrigin = 'center center';
    }

    // Also rotate tiles pane for complete rotation
    const tilePane = map.getPanes().tilePane;
    if (tilePane) {
        tilePane.style.transform = `rotate(${currentBearing}deg)`;
        tilePane.style.transformOrigin = 'center center';
    }

    updateCompassNeedle();
    updateRotationIndicator();
}

function getTouchDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function getTouchAngle(touch1, touch2) {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.atan2(dy, dx) * (180 / Math.PI);
}

function showRotationIndicator() {
    // Create indicator if not exists
    let indicator = document.getElementById('rotationIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'rotationIndicator';
        indicator.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 14px;
            z-index: 1000;
            display: none;
        `;
        document.body.appendChild(indicator);
    }

    indicator.style.display = 'block';
    updateRotationIndicator();
}

function hideRotationIndicator() {
    const indicator = document.getElementById('rotationIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

function showAutoReturnIndicator() {
    // Tắt indicator - không hiển thị nữa
    return;
}

function updateRotationIndicator() {
    const indicator = document.getElementById('rotationIndicator');
    if (indicator) {
        const bearing = Math.round(currentBearing);
        indicator.textContent = `🧭 ${bearing}°`;
    }
}

// Map control functions
function resetMapRotation() {
    console.log('🧭 Resetting map rotation to North');
    currentBearing = 0;

    // Reset CSS transforms
    const mapPane = map.getPanes().mapPane;
    if (mapPane) {
        mapPane.style.transform = 'rotate(0deg)';
    }

    const tilePane = map.getPanes().tilePane;
    if (tilePane) {
        tilePane.style.transform = 'rotate(0deg)';
    }

    updateCompassNeedle();
    updateRotationIndicator();
}

function resetMapView() {
    map.setView([defaultView.lat, defaultView.lng], defaultView.zoom);
    resetMapRotation();
}

function centerOnUser() {
    if (userMarker) {
        map.setView(userMarker.getLatLng(), 18);
    }
}

function updateCompassNeedle() {
    const needle = document.querySelector('.compass-needle');
    if (needle) {
        needle.style.transform = `rotate(${-currentBearing}deg)`;
    }
}

function toggleFollowMode() {
    followMode = !followMode;
    const btn = document.getElementById('followBtn');

    if (btn) {
        if (followMode) {
            btn.innerHTML = '🔒 Đang theo';
            btn.classList.add('active');

            // Zoom sát vào user khi bật follow
            if (userMarker) {
                map.setView(userMarker.getLatLng(), 19);
            }

            if (!watchPositionId) {
                startLocationTracking();
            }
        } else {
            btn.innerHTML = '🎯 Theo dõi';
            btn.classList.remove('active');
        }
    } else {
        console.log('Follow button not found - feature disabled');
    }
}

function startLocationTracking() {
    if (navigator.geolocation && !watchPositionId) {
        // Mobile-optimized GPS settings for maximum accuracy
        const options = {
            enableHighAccuracy: true,    // Sử dụng GPS thay vì WiFi/Cell tower
            timeout: 8000,               // Shorter timeout cho mobile
            maximumAge: 500              // Rất ngắn cho real-time updates
        };

        watchPositionId = navigator.geolocation.watchPosition(
            (position) => {
                updateUserPosition(position);
                console.log('Position updated:', {
                    lat: position.coords.latitude.toFixed(6),
                    lng: position.coords.longitude.toFixed(6),
                    heading: position.coords.heading,
                    accuracy: position.coords.accuracy
                });
            },
            (error) => {
                console.error('Tracking error:', error);
            },
            options
        );
    }
}

function stopLocationTracking() {
    if (watchPositionId) {
        navigator.geolocation.clearWatch(watchPositionId);
        watchPositionId = null;
    }
}

function updateUserPosition(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    let heading = position.coords.heading;
    const accuracy = position.coords.accuracy;

    // Calculate heading from movement if GPS heading not available
    if ((heading === null || heading === undefined) && lastPosition) {
        const deltaLat = lat - lastPosition.lat;
        const deltaLng = lng - lastPosition.lng;

        // Only calculate if there's significant movement (>5 meters)
        const distance = Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng) * 111000; // rough meters
        if (distance > 5) {
            heading = (Math.atan2(deltaLng, deltaLat) * 180 / Math.PI + 90 + 360) % 360;
            console.log('Calculated heading from movement:', heading.toFixed(1), '°, distance:', distance.toFixed(1), 'm');
        }
    }

    // Store current position and heading for next calculation
    lastPosition = { lat, lng };
    if (heading !== null && heading !== undefined) {
        currentUserHeading = heading;
    }

    if (userMarker) {
        // Update position
        userMarker.setLatLng([lat, lng]);

        // Prioritize device orientation over GPS heading
        let finalHeading = null;

        // 1. Try device compass first (real-time orientation)
        if (deviceOrientationHeading !== null) {
            finalHeading = deviceOrientationHeading;
            console.log(`🧭 Device compass: ${getHeadingDirection(finalHeading)} (${finalHeading.toFixed(1)}°)`);
        }
        // 2. Fallback to GPS heading (movement direction)
        else if (heading !== null && heading !== undefined && !isNaN(heading)) {
            finalHeading = heading;
            console.log(`📍 GPS heading: ${getHeadingDirection(finalHeading)} (${finalHeading.toFixed(1)}°)`);
        }
        // 3. Last resort: Calculate from movement
        else if (lastPosition) {
            const deltaLat = lat - lastPosition.lat;
            const deltaLng = lng - lastPosition.lng;
            const distance = Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng) * 111000;

            if (distance > 3) {
                finalHeading = (Math.atan2(deltaLng, deltaLat) * 180 / Math.PI + 90 + 360) % 360;
                console.log(`🚶 Movement heading: ${getHeadingDirection(finalHeading)} (${finalHeading.toFixed(1)}°)`);
            }
        }

        // Update icon if we have a valid heading
        if (finalHeading !== null) {
            const newIcon = createUserLocationIcon(finalHeading);
            userMarker.setIcon(newIcon);
        }

        // Update accuracy circle - Skip during navigation
        if (userAccuracyCircle) {
            map.removeLayer(userAccuracyCircle);
        }
        if (accuracy && accuracy < 100 && !navigationActive) {
            userAccuracyCircle = L.circle([lat, lng], {
                radius: accuracy,
                color: '#4285F4',
                fillColor: '#4285F4',
                fillOpacity: 0.1,
                weight: 1
            }).addTo(map);
        }

        // Auto follow during navigation - zoom sát
        if (navigationActive) {
            // Zoom sát và follow user trong navigation
            map.setView([lat, lng], 19);

            // Smart routing: Update route progress and check for deviations
            if (routeCoordinates && routeCoordinates.length > 0) {
                // Update progressive route (hide passed portions)
                updateProgressiveRoute(lat, lng);

                // Check if user is off route
                if (isUserOffRoute(lat, lng, routeCoordinates, 75)) {
                    console.log('User is off route, recalculating...');
                    recalculateRoute();
                }
            }

            // Rotate map theo hướng di chuyển - DISABLED
            // if (heading !== null && heading !== undefined) {
            //     rotateMapTouch(heading);
            // }
        } else if (followMode) {
            // Follow bình thường khi không navigation
            map.panTo([lat, lng]);
        }
    }
}

// Create ATM icon
const atmIcon = L.divIcon({
    html: `<div class="atm-icon-container">
        <img src="images/icon.png" class="atm-icon" />
    </div>`,
    className: 'custom-atm-icon',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40]
});

// Create PGD icon
const pgdIcon = L.divIcon({
    html: `<div class="pgd-icon-container">
        <img src="images/pgd.png" class="pgd-icon" />
    </div>`,
    className: 'custom-pgd-icon',
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -40]
});

// Create user location icon with simple static light beam like Google Maps
function createUserLocationIcon(heading = 0) {
    return L.divIcon({
        html: `<div class="user-location-container" style="transform: rotate(${heading}deg)">
            <div class="user-light-beam-outer"></div>
            <div class="user-light-beam"></div>
            <div class="user-location-dot"></div>
        </div>`,
        className: 'custom-user-icon',
        iconSize: [64, 64],
        iconAnchor: [32, 32],
        popupAnchor: [0, -32]
    });
}

// Default user icon for when no heading is available
const userLocationIcon = createUserLocationIcon(0);

// Add custom CSS for icons (removed compass styles)
const style = document.createElement('style');
style.textContent = `
    .custom-atm-icon, .custom-pgd-icon, .custom-user-icon {
        background: none !important;
        border: none !important;
    }
    
    /* ATM Icon - White background with black border */
    .atm-icon-container {
        position: relative;
        width: 32px;
        height: 32px;
        background: #fff;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        border: 2px solid #000;
    }
    
    .atm-icon {
        width: 16px;
        height: 16px;
        object-fit: contain;
        transform: rotate(45deg);
    }
    
    /* PGD Icon - Blue background with white border */
    .pgd-icon-container {
        position: relative;
        width: 32px;
        height: 32px;
        background: #47c0f6;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        border: 2px solid #fff;
    }
    
    .pgd-icon {
        width: 16px;
        height: 16px;
        object-fit: contain;
        transform: rotate(45deg);
    }
    
    /* Simple user location like Google Maps */
    .user-location-container {
        position: relative;
        width: 64px;
        height: 64px;
        display: flex;
        align-items: center;
        justify-content: center;
        transform-origin: center center;
    }
    

    
    .user-location-dot {
        position: absolute;
        width: 16px;
        height: 16px;
        top: 24px;
        left: 24px;
        background: #4285F4;
        border: 3px solid #fff;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(66, 133, 244, 0.4);
        z-index: 3;
        transform: translate(-50%, -50%);
    }
    
    /* Simple static light beam - like Google Maps */
    .user-light-beam {
        position: absolute;
        width: 40px;
        height: 60px;
        top: -36px;
        left: 5px;
        background: linear-gradient(
            to top,
            rgba(66, 133, 244, 0.4) 0%,
            rgba(66, 133, 244, 0.2) 50%,
            transparent 100%
        );
        clip-path: polygon(40% 100%, 60% 100%, 70% 0%, 30% 0%);
        z-index: 1;
        transform-origin: 50% 100%;
    }
    

    
    /* Simple background circle - no animation */
    .user-location-container::before {
        content: '';
        position: absolute;
        width: 24px;
        height: 24px;
        top: 20px;
        left: 20px;
        background: rgba(66, 133, 244, 0.1);
        border-radius: 50%;
        z-index: 0;
    }
    

    

`;
document.head.appendChild(style);

// Add CSS for custom popup
const popupStyle = document.createElement('style');
popupStyle.textContent = `
    /* Custom popup overlay */
    .location-popup-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 2000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
    }
    
    .location-popup {
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 400px;
        width: 100%;
        text-align: center;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    }
    
    .location-popup h3 {
        margin: 0 0 16px 0;
        color: #003A6E;
        font-size: 1.2em;
    }
    
    .location-popup p {
        margin: 0 0 20px 0;
        color: #666;
        line-height: 1.5;
    }
    
    .location-popup-buttons {
        display: flex;
        gap: 10px;
        justify-content: center;
        flex-wrap: wrap;
    }
    
    .location-popup button {
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.9em;
        transition: background 0.2s;
    }
    
    .location-popup .btn-primary {
        background: #003A6E;
        color: white;
    }
    
    .location-popup .btn-primary:hover {
        background: #00509E;
    }
    
    .location-popup .btn-secondary {
        background: #f8f9fa;
        color: #666;
        border: 1px solid #ddd;
    }
    
    .location-popup .btn-secondary:hover {
        background: #e9ecef;
    }
    
    @media (max-width: 600px) {
        .location-popup {
            padding: 20px;
            margin: 10px;
        }
        
        .location-popup-buttons {
            flex-direction: column;
        }
    }
`;
document.head.appendChild(popupStyle);

// Function to show combined location & compass permission popup
function showLocationPopup() {
    // Remove existing popup if any
    const existingPopup = document.querySelector('.location-popup-overlay');
    if (existingPopup) {
        existingPopup.remove();
    }

    const popup = document.createElement('div');
    popup.className = 'location-popup-overlay';
    popup.innerHTML = `
        <div class="location-popup">
            <h3>� Bật vị trí</h3>
            <p>Cần vị trí để chỉ đường và compass để xem hướng di chuyển</p>
            <div class="location-popup-buttons">
                <button class="btn-primary" onclick="enableLocationAndCompass()">Bật</button>
                <button class="btn-secondary" onclick="closeLocationPopup()">Bỏ qua</button>
            </div>
        </div>
    `;

    document.body.appendChild(popup);

    // Close popup when clicking overlay
    popup.addEventListener('click', (e) => {
        if (e.target === popup) {
            closeLocationPopup();
        }
    });
}

// Function to close location popup
window.closeLocationPopup = function () {
    const popup = document.querySelector('.location-popup-overlay');
    if (popup) {
        popup.remove();
    }
};

// Function to enable both location and compass
window.enableLocationAndCompass = function () {
    closeLocationPopup();
    
    console.log('🚀 Enabling both location and compass...');
    
    // First enable location
    document.getElementById('locateBtn').click();
    
    // Request compass permission immediately (don't wait)
    console.log('📱 Requesting compass permission...');
    requestDeviceOrientationPermission();
    
    // Also force compass tracking after location is ready
    setTimeout(() => {
        console.log('🧭 Force starting compass tracking...');
        if (!deviceOrientationHeading) {
            startDeviceOrientationTracking();
        }
    }, 2000);
};

// Execute pending navigation after location is obtained
function executePendingNavigation() {
    if (pendingNavigation && userMarker) {
        console.log('Executing pending navigation to:', pendingNavigation.name);

        if (pendingNavigation.type === 'atm') {
            routeToATM(pendingNavigation.lat, pendingNavigation.lng, pendingNavigation.name);
        } else if (pendingNavigation.type === 'pgd') {
            routeToPGD(pendingNavigation.lat, pendingNavigation.lng, pendingNavigation.name);
        }

        // Clear pending navigation
        pendingNavigation = null;
    }
}

// Simple navigation - just follow user closely
function startSimpleNavigation(destination, route, destinationCoords = null) {
    navigationActive = true;

    // Store route data for smart routing
    currentRoute = route;
    if (route && route.geometry && route.geometry.coordinates) {
        routeCoordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]); // Convert to lat,lng
    } else {
        routeCoordinates = [];
    }
    passedRouteCoordinates = [];
    currentDestination = destinationCoords;
    lastRouteUpdateTime = 0;

    console.log('Navigation started with', routeCoordinates.length, 'route points');

    // Show simple info in nearestInfo instead of big panel
    const distance = (route.distance / 1000).toFixed(1);
    const duration = Math.round(route.duration / 60);

    document.getElementById('nearestInfo').innerHTML =
        `🎯 Đang đi đến <b>${destination}</b><br>📏 ${distance} km - ${duration} phút
        <button onclick="stopSimpleNavigation()" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; margin-left: 8px; cursor: pointer; font-size: 0.8em;">
            ❌ Dừng
        </button>`;

    // Show navigation controls
    document.getElementById('navigationControls').style.display = 'flex';

    // Auto start location tracking for navigation
    if (!watchPositionId) {
        startLocationTracking();
    }

    // Auto zoom sát vào user location
    if (userMarker) {
        map.setView(userMarker.getLatLng(), 19); // Zoom level 19 - rất sát
    }

    // Disable topbar buttons during navigation
    disableTopbarButtons();

    // Enable auto follow mode
    followMode = true;

    // Set up auto return to user when map is dragged
    setupAutoReturnToUser();
}

function getStepIcon(maneuverType) {
    const icons = {
        'turn-right': '➡️',
        'turn-left': '⬅️',
        'turn-slight-right': '↗️',
        'turn-slight-left': '↖️',
        'turn-sharp-right': '⤴️',
        'turn-sharp-left': '⤵️',
        'straight': '⬆️',
        'uturn': '🔄',
        'roundabout': '🔄',
        'depart': '🚀',
        'arrive': '🎯'
    };

    return icons[maneuverType] || '⬆️';
}

// Auto return to user - DISABLED
// let autoReturnTimer = null;
// let lastInteractionTime = 0;

function setupAutoReturnToUser() {
    // DISABLED: Auto return functionality removed
    console.log('Auto return disabled');
    return;

    // Reset timer on any map interaction
    function resetAutoReturnTimer() {
        if (navigationActive) {
            // Clear existing timer
            if (autoReturnTimer) {
                clearTimeout(autoReturnTimer);
            }

            // Update last interaction time
            lastInteractionTime = Date.now();

            // Set new timer for 3 seconds after interaction stops
            autoReturnTimer = setTimeout(() => {
                if (navigationActive && userMarker) {
                    // Only return if no interaction for 3 seconds
                    const timeSinceLastInteraction = Date.now() - lastInteractionTime;
                    if (timeSinceLastInteraction >= 3000) {
                        // Show brief indicator before returning
                        showAutoReturnIndicator();

                        setTimeout(() => {
                            if (navigationActive && userMarker) {
                                map.setView(userMarker.getLatLng(), 19);
                                console.log('Auto returned to user location after 3s of no interaction');
                            }
                        }, 500);
                    }
                }
            }, 3000);
        }
    }

    // Listen for all map interaction events
    map.on('dragstart', resetAutoReturnTimer);
    map.on('dragend', resetAutoReturnTimer);
    map.on('drag', resetAutoReturnTimer);
    map.on('zoomstart', resetAutoReturnTimer);
    map.on('zoomend', resetAutoReturnTimer);
    map.on('movestart', resetAutoReturnTimer);
    map.on('moveend', resetAutoReturnTimer);

    // Also listen for touch events on mobile
    map.getContainer().addEventListener('touchstart', resetAutoReturnTimer);
    map.getContainer().addEventListener('touchmove', resetAutoReturnTimer);
    map.getContainer().addEventListener('touchend', resetAutoReturnTimer);
}

window.stopSimpleNavigation = function () {
    navigationActive = false;
    followMode = false;

    // Hide navigation controls
    document.getElementById('navigationControls').style.display = 'none';

    // Stop tracking
    stopLocationTracking();

    // Clear auto return timer - DISABLED
    // if (autoReturnTimer) {
    //     clearTimeout(autoReturnTimer);
    //     autoReturnTimer = null;
    // }

    // Remove all map event listeners
    map.off('dragstart');
    map.off('dragend');
    map.off('drag');
    map.off('zoomstart');
    map.off('zoomend');
    map.off('movestart');
    map.off('moveend');

    // Remove touch event listeners
    map.getContainer().removeEventListener('touchstart', () => { });
    map.getContainer().removeEventListener('touchmove', () => { });
    map.getContainer().removeEventListener('touchend', () => { });

    // Remove route line
    if (routeLine) {
        map.removeLayer(routeLine);
        routeLine = null;
    }

    // Clear smart routing data
    currentRoute = null;
    routeCoordinates = [];
    passedRouteCoordinates = [];
    currentDestination = null;
    lastRouteUpdateTime = 0;

    // Clear info
    document.getElementById('nearestInfo').innerHTML = '';

    // Re-enable topbar buttons
    enableTopbarButtons();
};

// Handle location - back to original simple version
document.getElementById('locateBtn').onclick = function () {
    if (!navigator.geolocation) {
        alert('Trình duyệt không hỗ trợ định vị.');
        return;
    }

    const button = this;
    button.innerHTML = '⏳ Đang tìm...';
    button.disabled = true;

    // Mobile-optimized location options
    const options = {
        enableHighAccuracy: true,     // GPS cao cấp cho độ chính xác tối đa
        timeout: 12000,               // Đủ thời gian cho GPS lock
        maximumAge: 1000              // Cache ngắn cho dữ liệu fresh
    };

    const successHandler = (pos) => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;

        console.log(`User location: ${userLat}, ${userLng}`);

        // Remove previous markers and routes
        if (userMarker) map.removeLayer(userMarker);
        if (routeLine) map.removeLayer(routeLine);

        // Show user location with direction arrow
        const initialIcon = createUserLocationIcon(0);
        userMarker = L.marker([userLat, userLng], {
            icon: initialIcon
        }).addTo(map).bindPopup("📍 Vị trí của bạn").openPopup();

        map.setView([userLat, userLng], 17);

        // Start continuous tracking for direction updates automatically
        startLocationTracking();

        // FORCE compass permission dialog immediately
        forceCompassPermission();

        // Optimize for mobile performance
        optimizeForMobile();

        // Execute pending navigation if exists
        setTimeout(() => {
            executePendingNavigation();
        }, 500); // Small delay to ensure marker is fully created

        button.innerHTML = '📍 Vị trí';
        button.disabled = false;
    };

    const errorHandler = (err) => {
        console.error('Geolocation error:', err);
        let errorMsg = 'Không thể lấy vị trí của bạn.';

        switch (err.code) {
            case err.PERMISSION_DENIED:
                errorMsg = 'Bạn đã từ chối cấp quyền truy cập vị trí.\nVui lòng cho phép truy cập vị trí trong cài đặt trình duyệt.';
                break;
            case err.POSITION_UNAVAILABLE:
                errorMsg = 'Không thể xác định vị trí. Vui lòng kiểm tra GPS/WiFi.';
                break;
            case err.TIMEOUT:
                errorMsg = 'Quá thời gian chờ. Vui lòng thử lại.';
                break;
        }

        alert(errorMsg);
        button.innerHTML = '📍 Vị trí';
        button.disabled = false;
    };

    navigator.geolocation.getCurrentPosition(successHandler, errorHandler, options);
};

// Add ATM markers
function addATMMarkers() {
    atmMarkers.forEach(marker => map.removeLayer(marker));
    atmMarkers = [];

    atms.forEach(atm => {
        const marker = L.marker([atm.lat, atm.lng], { icon: atmIcon })
            .addTo(map)
            .bindPopup(`
                <div style="text-align: center;">
                    <b>${atm.name}</b><br>
                    📍 ATM VietinBank<br>
                    <button onclick="routeToATM(${atm.lat}, ${atm.lng}, '${atm.name}')" 
                            style="background: #228B22; color: white; border: none; padding: 5px 10px; border-radius: 4px; margin-top: 8px; cursor: pointer;">
                        🗺️ Chỉ đường đến đây
                    </button>
                </div>
            `);
        atmMarkers.push(marker);
    });
}

// Add PGD markers
function addPGDMarkers() {
    pgdMarkers.forEach(marker => map.removeLayer(marker));
    pgdMarkers = [];

    pgds.forEach(pgd => {
        const marker = L.marker([pgd.lat, pgd.lng], { icon: pgdIcon })
            .addTo(map)
            .bindPopup(`
                <div style="text-align: center;">
                    <b>${pgd.name}</b><br>
                    🏢 PGD VietinBank<br>
                    <button onclick="routeToPGD(${pgd.lat}, ${pgd.lng}, '${pgd.name}')" 
                            style="background: #47c0f6; color: white; border: none; padding: 5px 10px; border-radius: 4px; margin-top: 8px; cursor: pointer;">
                        🗺️ Chỉ đường đến đây
                    </button>
                </div>
            `);
        pgdMarkers.push(marker);
    });
}

// Clear all markers
function clearAllMarkers() {
    atmMarkers.forEach(marker => map.removeLayer(marker));
    pgdMarkers.forEach(marker => map.removeLayer(marker));
    if (routeLine) map.removeLayer(routeLine);
    document.getElementById('nearestInfo').innerHTML = '';
}

// Initialize both ATM and PGD markers
addATMMarkers();
addPGDMarkers();

// Haversine formula to calculate distance (km) - CORRECTED
function getDistance(lat1, lng1, lat2, lng2) {
    function toRad(x) { return x * Math.PI / 180; }
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1); // CORRECTED: was lat2-lat1, should be lng2-lng1
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
}

// Show all ATMs and PGDs
document.getElementById('showAllBtn').onclick = function () {
    // Stop navigation if active
    if (navigationActive) {
        stopSimpleNavigation();
    }

    clearAllMarkers();
    addATMMarkers();
    addPGDMarkers();

    const allMarkers = [...atmMarkers, ...pgdMarkers];
    const group = new L.featureGroup(allMarkers);
    map.fitBounds(group.getBounds().pad(0.3));

    this.innerHTML = '✅ Hiển thị tất cả';
    setTimeout(() => {
        this.innerHTML = '🏢 PGD + ATM';
    }, 1500);
};

// Show only ATMs
document.getElementById('showATMBtn').onclick = function () {
    // Stop navigation if active
    if (navigationActive) {
        stopSimpleNavigation();
    }

    clearAllMarkers();
    addATMMarkers();

    // If user location exists, find nearest ATM
    if (userMarker) {
        findNearestATM();
    }

    const group = new L.featureGroup(atmMarkers);
    map.fitBounds(group.getBounds().pad(0.3));

    this.innerHTML = '✅ Chỉ ATM';
    setTimeout(() => {
        this.innerHTML = '🏧 ATM';
    }, 1500);
};

// Show only PGDs
document.getElementById('showPGDBtn').onclick = function () {
    // Stop navigation if active
    if (navigationActive) {
        stopSimpleNavigation();
    }

    clearAllMarkers();
    addPGDMarkers();

    // If user location exists, find nearest PGD
    if (userMarker) {
        findNearestPGD();
    }

    const group = new L.featureGroup(pgdMarkers);
    map.fitBounds(group.getBounds().pad(0.3));

    this.innerHTML = '✅ Chỉ PGD';
    setTimeout(() => {
        this.innerHTML = '🏢 PGD';
    }, 1500);
};

// Find nearest ATM function
function findNearestATM() {
    if (!userMarker) return;

    const userLatLng = userMarker.getLatLng();
    let minDist = Infinity;
    nearestATM = null;

    atms.forEach((atm) => {
        const dist = getDistance(userLatLng.lat, userLatLng.lng, atm.lat, atm.lng);
        if (dist < minDist) {
            minDist = dist;
            nearestATM = atm;
        }
    });

    if (nearestATM) {
        document.getElementById('nearestInfo').innerHTML =
            `🏧 ATM gần nhất: <b>${nearestATM.name}</b><br>📏 Cách ${minDist.toFixed(2)} km
            <button onclick="routeToATM(${nearestATM.lat}, ${nearestATM.lng}, '${nearestATM.name}')" 
                    style="background: #228B22; color: white; border: none; padding: 4px 8px; border-radius: 4px; margin-left: 8px; cursor: pointer; font-size: 0.8em;">
                🗺️ Chỉ đường
            </button>`;
    }
}

// Find nearest PGD function
function findNearestPGD() {
    if (!userMarker) return;

    const userLatLng = userMarker.getLatLng();
    let minDist = Infinity;
    nearestPGD = null;

    pgds.forEach((pgd) => {
        const dist = getDistance(userLatLng.lat, userLatLng.lng, pgd.lat, pgd.lng);
        if (dist < minDist) {
            minDist = dist;
            nearestPGD = pgd;
        }
    });

    if (nearestPGD) {
        document.getElementById('nearestInfo').innerHTML =
            `🏢 PGD gần nhất: <b>${nearestPGD.name}</b><br>📏 Cách ${minDist.toFixed(2)} km
            <button onclick="routeToPGD(${nearestPGD.lat}, ${nearestPGD.lng}, '${nearestPGD.name}')" 
                    style="background: #47c0f6; color: white; border: none; padding: 4px 8px; border-radius: 4px; margin-left: 8px; cursor: pointer; font-size: 0.8em;">
                🗺️ Chỉ đường
            </button>`;
    }
}

// Route to specific ATM function (called from popup) - Enhanced with navigation
window.routeToATM = async function (atmLat, atmLng, atmName) {
    if (!userMarker) {
        // Lưu thông tin để chỉ đường sau khi có location
        pendingNavigation = {
            type: 'atm',
            lat: atmLat,
            lng: atmLng,
            name: atmName
        };
        showLocationPopup();
        return;
    }

    const userLatLng = userMarker.getLatLng();

    try {
        // Remove existing route
        if (routeLine) map.removeLayer(routeLine);

        // Get detailed route from OSRM with steps
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${userLatLng.lng},${userLatLng.lat};${atmLng},${atmLat}?overview=full&geometries=geojson&steps=true`);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const coordinates = route.geometry.coordinates;

            // Convert coordinates to Leaflet format
            const latlngs = coordinates.map(coord => [coord[1], coord[0]]);

            // Draw route with Google Maps-like styling
            routeLine = L.polyline(latlngs, {
                color: '#4285F4',
                weight: 6,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(map);

            // Fit map to show entire route
            map.fitBounds(routeLine.getBounds(), { padding: [20, 80] });

            // Start simple navigation with destination coordinates
            startSimpleNavigation(atmName, route, { lat: atmLat, lng: atmLng });

            // FORCE compass permission for navigation - silently
            if (!deviceOrientationHeading) {
                console.log('🧭 Navigation started - requesting compass quietly');
                setTimeout(() => {
                    requestDeviceOrientationPermission();
                }, 1000);
            }

            // Mobile haptic feedback when navigation starts
            if ('vibrate' in navigator) {
                navigator.vibrate([200, 100, 200]); // Short-long-short pattern
            }            // Update info with route details
            const distance = (route.distance / 1000).toFixed(1);
            const duration = Math.round(route.duration / 60);

            document.getElementById('nearestInfo').innerHTML =
                `🗺️ Chỉ đường đến <b>${atmName}</b><br>🛣️ ${distance} km - ${duration} phút
                <button onclick="stopSimpleNavigation()" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; margin-left: 8px; cursor: pointer; font-size: 0.8em;">
                    ❌ Tắt chỉ đường
                </button>`;
        } else {
            // Fallback: draw straight line with Google Maps styling
            const fallbackRoute = {
                distance: getDistance(userLatLng.lat, userLatLng.lng, atmLat, atmLng) * 1000,
                duration: getDistance(userLatLng.lat, userLatLng.lng, atmLat, atmLng) * 1000 / 50 * 3.6 // rough estimate
            };

            routeLine = L.polyline([
                [userLatLng.lat, userLatLng.lng],
                [atmLat, atmLng]
            ], {
                color: '#4285F4',
                weight: 6,
                opacity: 0.9,
                dashArray: '15, 10',
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(map);

            startSimpleNavigation(atmName, fallbackRoute, { lat: atmLat, lng: atmLng });

            document.getElementById('nearestInfo').innerHTML =
                `🗺️ Đường thẳng đến <b>${atmName}</b>
                <button onclick="stopSimpleNavigation()" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; margin-left: 8px; cursor: pointer; font-size: 0.8em;">
                    ❌ Tắt
                </button>`;
        }

    } catch (error) {
        console.error('Routing error:', error);
        // Fallback: draw straight line with Google Maps styling
        const fallbackRoute = {
            distance: getDistance(userLatLng.lat, userLatLng.lng, atmLat, atmLng) * 1000,
            duration: getDistance(userLatLng.lat, userLatLng.lng, atmLat, atmLng) * 1000 / 50 * 3.6
        };

        routeLine = L.polyline([
            [userLatLng.lat, userLatLng.lng],
            [atmLat, atmLng]
        ], {
            color: '#4285F4',
            weight: 6,
            opacity: 0.9,
            dashArray: '15, 10',
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(map);

        startSimpleNavigation(atmName, fallbackRoute, { lat: atmLat, lng: atmLng });

        document.getElementById('nearestInfo').innerHTML =
            `🗺️ Đường thẳng đến <b>${atmName}</b>
            <button onclick="stopSimpleNavigation()" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; margin-left: 8px; cursor: pointer; font-size: 0.8em;">
                ❌ Tắt
            </button>`;
    }
};

// Route to PGD function - Enhanced with navigation
window.routeToPGD = async function (pgdLat, pgdLng, pgdName) {
    if (!userMarker) {
        // Lưu thông tin để chỉ đường sau khi có location
        pendingNavigation = {
            type: 'pgd',
            lat: pgdLat,
            lng: pgdLng,
            name: pgdName
        };
        showLocationPopup();
        return;
    }

    const userLatLng = userMarker.getLatLng();

    try {
        if (routeLine) map.removeLayer(routeLine);

        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${userLatLng.lng},${userLatLng.lat};${pgdLng},${pgdLat}?overview=full&geometries=geojson&steps=true`);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const coordinates = route.geometry.coordinates;
            const latlngs = coordinates.map(coord => [coord[1], coord[0]]);

            routeLine = L.polyline(latlngs, {
                color: '#47c0f6',
                weight: 6,
                opacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(map);

            map.fitBounds(routeLine.getBounds(), { padding: [20, 80] });

            // Start simple navigation
            startSimpleNavigation(pgdName, route, { lat: pgdLat, lng: pgdLng });

            // FORCE compass permission for navigation - silently
            if (!deviceOrientationHeading) {
                console.log('🧭 PGD Navigation started - requesting compass quietly');
                setTimeout(() => {
                    requestDeviceOrientationPermission();
                }, 1000);
            }

            const distance = (route.distance / 1000).toFixed(1);
            const duration = Math.round(route.duration / 60);

            document.getElementById('nearestInfo').innerHTML =
                `🗺️ Chỉ đường đến <b>${pgdName}</b><br>🛣️ ${distance} km - ${duration} phút
                <button onclick="stopSimpleNavigation()" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; margin-left: 8px; cursor: pointer; font-size: 0.8em;">
                    ❌ Tắt chỉ đường
                </button>`;
        } else {
            const fallbackRoute = {
                distance: getDistance(userLatLng.lat, userLatLng.lng, pgdLat, pgdLng) * 1000,
                duration: getDistance(userLatLng.lat, userLatLng.lng, pgdLat, pgdLng) * 1000 / 50 * 3.6
            };

            routeLine = L.polyline([
                [userLatLng.lat, userLatLng.lng],
                [pgdLat, pgdLng]
            ], {
                color: '#47c0f6',
                weight: 6,
                opacity: 0.9,
                dashArray: '15, 10',
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(map);

            startSimpleNavigation(pgdName, fallbackRoute, { lat: pgdLat, lng: pgdLng });

            document.getElementById('nearestInfo').innerHTML =
                `🗺️ Đường thẳng đến <b>${pgdName}</b>
                <button onclick="stopSimpleNavigation()" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; margin-left: 8px; cursor: pointer; font-size: 0.8em;">
                    ❌ Tắt
                </button>`;
        }
    } catch (error) {
        console.error('Routing error:', error);
        const fallbackRoute = {
            distance: getDistance(userLatLng.lat, userLatLng.lng, pgdLat, pgdLng) * 1000,
            duration: getDistance(userLatLng.lat, userLatLng.lng, pgdLat, pgdLng) * 1000 / 50 * 3.6
        };

        routeLine = L.polyline([
            [userLatLng.lat, userLatLng.lng],
            [pgdLat, pgdLng]
        ], {
            color: '#47c0f6',
            weight: 6,
            opacity: 0.9,
            dashArray: '15, 10',
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(map);

        startSimpleNavigation(pgdName, fallbackRoute, { lat: pgdLat, lng: pgdLng });

        document.getElementById('nearestInfo').innerHTML =
            `🗺️ Đường thẳng đến <b>${pgdName}</b>
            <button onclick="stopSimpleNavigation()" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; margin-left: 8px; cursor: pointer; font-size: 0.8em;">
                ❌ Tắt
            </button>`;
    }
};

// Satellite toggle functionality
document.getElementById('satelliteBtn').onclick = function () {
    if (currentLayer === 'osm') {
        map.removeLayer(osmLayer);
        satelliteLayer.addTo(map);
        currentLayer = 'satellite';
        this.classList.add('active');
        this.title = 'Chuyển bản đồ thường';
    } else {
        map.removeLayer(satelliteLayer);
        osmLayer.addTo(map);
        currentLayer = 'osm';
        this.classList.remove('active');
        this.title = 'Chuyển bản đồ vệ tinh';
    }
};

// Navigation control event listeners
document.getElementById('centerUserBtn').onclick = function () {
    if (userMarker) {
        // Zoom sát vào user location
        map.setView(userMarker.getLatLng(), 19);
        this.classList.add('active');
        setTimeout(() => {
            this.classList.remove('active');
        }, 200);
    }
};

// reopenNavBtn removed - no longer needed

// Initialize rotation after map is ready
map.whenReady(function () {
    console.log('Map ready - initializing Google Maps-style rotation');
    initializeMapRotation();
    updateCompassNeedle();
});

// Add keyboard shortcuts
document.addEventListener('keydown', function (e) {
    if (e.key === 'r' || e.key === 'R') {
        resetMapRotation();
    } else if (e.key === 'c' || e.key === 'C') {
        if (userMarker) centerOnUser();
    } else if (e.key === 'h' || e.key === 'H') {
        // Show current user heading
        showUserHeadingInfo();
    } else if (e.key === 'o' || e.key === 'O') {
        // Debug device orientation
        console.log('🔍 Orientation Debug:');
        console.log('- Device heading:', deviceOrientationHeading);
        console.log('- User heading:', getCurrentUserHeading());
        requestDeviceOrientationPermission();
    } else if (e.key === 'Escape') {
        if (navigationActive) stopSimpleNavigation();
    }
});

// Touch gesture instructions
function showRotationInstructions() {
    const instructions = document.createElement('div');
    instructions.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 10px 20px;
        border-radius: 8px;
        z-index: 2000;
        font-size: 14px;
        text-align: center;
    `;
    instructions.innerHTML = `
        �️ <strong>Tính năng như Google Maps:</strong><br>

        � 2 ngón tay để xoay trên mobile<br>
        📍 Các tính năng khác vẫn hoạt động bình thường<br>
        🧭 Bấm compass để reset về Bắc
    `;

    document.body.appendChild(instructions);

    setTimeout(() => {
        instructions.remove();
    }, 4000);
}

// Show instructions on first load - DISABLED
// setTimeout(() => {
//     if (localStorage.getItem('rotation-instructions-shown') !== 'true') {
//         showRotationInstructions();
//         localStorage.setItem('rotation-instructions-shown', 'true');
//     }
// }, 2000);

// Disable/Enable topbar buttons during navigation
function disableTopbarButtons() {
    const buttons = ['showAllBtn', 'showATMBtn', 'showPGDBtn', 'locateBtn'];
    buttons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        }
    });
}

function enableTopbarButtons() {
    const buttons = ['showAllBtn', 'showATMBtn', 'showPGDBtn', 'locateBtn'];
    buttons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }
    });
}

// Set satellite button as active by default
const satelliteBtn = document.getElementById('satelliteBtn');
if (satelliteBtn) {
    satelliteBtn.classList.add('active');
    satelliteBtn.title = 'Chuyển bản đồ thường';
}

// Advanced routing functions
function isUserOffRoute(userLat, userLng, routeCoords, threshold = 50) {
    if (!routeCoords || routeCoords.length === 0) return false;

    // Find closest point on route
    let minDistance = Infinity;
    for (let i = 0; i < routeCoords.length; i++) {
        const routePoint = routeCoords[i];
        const distance = getDistance(userLat, userLng, routePoint[0], routePoint[1]) * 1000; // meters
        if (distance < minDistance) {
            minDistance = distance;
        }
    }

    console.log('Distance from route:', minDistance.toFixed(1), 'm');
    return minDistance > threshold;
}

function updateProgressiveRoute(userLat, userLng) {
    if (!routeCoordinates || routeCoordinates.length === 0) return;

    // Find closest point on route and mark previous points as passed
    let closestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < routeCoordinates.length; i++) {
        const routePoint = routeCoordinates[i];
        const distance = getDistance(userLat, userLng, routePoint[0], routePoint[1]);
        if (distance < minDistance) {
            minDistance = distance;
            closestIndex = i;
        }
    }

    // Update passed coordinates (user đã đi qua)
    if (closestIndex > 0) {
        const newlyPassed = routeCoordinates.slice(0, closestIndex);
        passedRouteCoordinates = [...passedRouteCoordinates, ...newlyPassed];
        routeCoordinates = routeCoordinates.slice(closestIndex);

        // Redraw route with passed portion hidden
        updateRouteVisualization();

        console.log('Route progress updated, passed:', passedRouteCoordinates.length, 'remaining:', routeCoordinates.length);
    }
}

function updateRouteVisualization() {
    // Remove old route
    if (routeLine) {
        map.removeLayer(routeLine);
    }

    // Only show remaining route (not passed portion)
    if (routeCoordinates && routeCoordinates.length > 0) {
        routeLine = L.polyline(routeCoordinates, {
            color: '#4285F4',
            weight: 6,
            opacity: 0.8
        }).addTo(map);
    }
}

async function recalculateRoute() {
    if (!userMarker || !currentDestination) return;

    const now = Date.now();
    // Throttle route recalculation to every 10 seconds
    if (now - lastRouteUpdateTime < 10000) return;
    lastRouteUpdateTime = now;

    console.log('Recalculating route to destination...');

    const userLatLng = userMarker.getLatLng();

    try {
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${userLatLng.lng},${userLatLng.lat};${currentDestination.lng},${currentDestination.lat}?overview=full&geometries=geojson&steps=true`);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            currentRoute = route;
            routeCoordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]); // Swap lng,lat to lat,lng
            passedRouteCoordinates = []; // Reset passed coordinates

            updateRouteVisualization();

            console.log('Route recalculated successfully');
            return route;
        }
    } catch (error) {
        console.error('Route recalculation failed:', error);
    }

    return null;
}

// Helper function to get current user heading
function getCurrentUserHeading() {
    return currentUserHeading || 0;
}

function getHeadingDirection(heading) {
    if (heading >= 337.5 || heading < 22.5) return "Bắc ⬆️";
    else if (heading >= 22.5 && heading < 67.5) return "Đông Bắc ↗️";
    else if (heading >= 67.5 && heading < 112.5) return "Đông ➡️";
    else if (heading >= 112.5 && heading < 157.5) return "Đông Nam ↘️";
    else if (heading >= 157.5 && heading < 202.5) return "Nam ⬇️";
    else if (heading >= 202.5 && heading < 247.5) return "Tây Nam ↙️";
    else if (heading >= 247.5 && heading < 292.5) return "Tây ⬅️";
    else if (heading >= 292.5 && heading < 337.5) return "Tây Bắc ↖️";
}

// Function to display user heading info
function showUserHeadingInfo() {
    const heading = getCurrentUserHeading();
    const direction = getHeadingDirection(heading);
    console.log(`🧭 User đang hướng: ${direction} (${heading.toFixed(1)}°)`);
    return { heading, direction };
}

// Device orientation for real-time compass heading
let deviceOrientationHeading = null;
let gyroscopeSupported = false;
let accelerometerData = { x: 0, y: 0, z: 0 };
let lastOrientationUpdate = 0;
const ORIENTATION_THROTTLE = 50; // Max 20 FPS for smooth but efficient updates

function requestDeviceOrientationPermission() {
    console.log('🔐 Requesting device orientation permission...');

    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS 13+ permission request
        console.log('📱 iOS detected, requesting permission...');
        DeviceOrientationEvent.requestPermission()
            .then(response => {
                console.log('📋 Permission response:', response);
                if (response === 'granted') {
                    console.log('✅ Permission granted!');
                    startDeviceOrientationTracking();
                } else {
                    console.log('❌ Permission denied');
                }
            })
            .catch(error => {
                console.error('❌ Permission error:', error);
            });
    } else {
        // Android or older iOS
        console.log('🤖 Android/Desktop detected, starting tracking...');
        startDeviceOrientationTracking();
    }
}

// Make function globally accessible for button clicks
window.requestDeviceOrientationPermission = requestDeviceOrientationPermission;

function startDeviceOrientationTracking() {
    if (window.DeviceOrientationEvent) {
        // Use fast handlers for better mobile performance
        window.addEventListener('deviceorientationabsolute', handleDeviceOrientationFast, { passive: true });
        window.addEventListener('deviceorientation', handleDeviceOrientationFast, { passive: true });

        // Enhanced motion tracking for better accuracy
        if (window.DeviceMotionEvent) {
            window.addEventListener('devicemotion', handleDeviceMotion, { passive: false });
            gyroscopeSupported = true;
        }

        // Request high-frequency sensor access (if available)
        if ('Sensor' in window) {
            console.log('🎯 Advanced sensor API available');
            initializeAdvancedSensors();
        }

        console.log('📱 Orientation tracking started');

        // Test if orientation is working after 2 seconds
        setTimeout(() => {
            if (deviceOrientationHeading === null) {
                console.log('⚠️ Using GPS heading fallback');
            } else {
                console.log('✅ Device orientation active');
            }
        }, 2000);
    } else {
        console.log('❌ DeviceOrientationEvent not supported');
    }
}

// Fast mobile orientation handling - no smoothing for instant response
function handleDeviceOrientation(event) {
    let heading = null;

    if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
        // iOS - direct compass heading
        heading = event.webkitCompassHeading;
    } else if (event.alpha !== null && event.alpha !== undefined) {
        // Android - direct alpha conversion
        heading = (360 - event.alpha + 360) % 360;
    }

    if (heading !== null && !isNaN(heading)) {
        deviceOrientationHeading = heading;

        // Instant update - no delay for mobile responsiveness
        if (userMarker) {
            requestAnimationFrame(() => {
                const newIcon = createUserLocationIcon(heading);
                userMarker.setIcon(newIcon);
            });
        }
    }
}

// FORCE compass permission immediately - no delays
function forceCompassPermission() {
    console.log('🧭 FORCING compass permission dialog immediately');

    // Skip separate compass dialog since we now have combined dialog
    // Just initialize compass tracking quietly
    setTimeout(() => {
        requestDeviceOrientationPermission();
    }, 500);
}

// Enhanced compass permission dialog
function showCompassPermissionDialog() {
    // Remove any existing dialogs
    const existing = document.querySelector('.compass-permission-dialog');
    if (existing) existing.remove();

    const dialog = document.createElement('div');
    dialog.className = 'compass-permission-dialog';
    dialog.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.7);
        z-index: 3000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
    `;

    dialog.innerHTML = `
        <div style="
            background: white;
            border-radius: 12px;
            padding: 20px;
            max-width: 300px;
            width: 90%;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        ">
            <div style="font-size: 40px; margin-bottom: 12px;">🧭</div>
            <h3 style="margin: 0 0 12px 0; color: #003A6E; font-size: 18px;">Bật Compass</h3>
            <p style="margin: 0 0 16px 0; color: #666; font-size: 14px;">
                Cho phép compass để xem vệt ánh sáng chỉ hướng
            </p>
            <div style="display: flex; gap: 8px; justify-content: center;">
                <button onclick="enableCompassFeatures()" style="
                    background: #4285F4; 
                    color: white; 
                    border: none; 
                    padding: 10px 20px; 
                    border-radius: 6px; 
                    cursor: pointer; 
                    font-size: 14px;
                    font-weight: bold;
                ">
                    Bật ngay
                </button>
                <button onclick="skipCompassFeatures()" style="
                    background: #f0f0f0; 
                    color: #666; 
                    border: none; 
                    padding: 10px 16px; 
                    border-radius: 6px; 
                    cursor: pointer;
                    font-size: 14px;
                ">
                    Bỏ qua
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);
}

// Global functions for dialog buttons
window.enableCompassFeatures = function () {
    console.log('🚀 User chose to enable ALL compass features');

    // Close dialog
    const dialog = document.querySelector('.compass-permission-dialog');
    if (dialog) dialog.remove();

    // Request permissions immediately
    requestDeviceOrientationPermission();

    // Show success message
    setTimeout(() => {
        showCompassSuccessMessage();
    }, 1000);
};

window.skipCompassFeatures = function () {
    console.log('⏭️ User skipped compass features');

    // Close dialog
    const dialog = document.querySelector('.compass-permission-dialog');
    if (dialog) dialog.remove();
};

function showCompassSuccessMessage() {
    const success = document.createElement('div');
    success.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #4285F4;
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        z-index: 2000;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(66, 133, 244, 0.3);
    `;
    success.textContent = '🧭 Compass đã bật';

    document.body.appendChild(success);

    setTimeout(() => {
        success.remove();
    }, 2000);
}

function showCompassPermissionPrompt() {
    const prompt = document.createElement('div');
    prompt.style.cssText = `
        position: fixed;
        top: 70px;
        left: 10px;
        right: 10px;
        background: rgba(66, 133, 244, 0.95);
        color: white;
        padding: 12px;
        border-radius: 8px;
        z-index: 2000;
        text-align: center;
        font-size: 14px;
    `;
    prompt.innerHTML = `
        🧭 Bật compass?
        <button onclick="requestDeviceOrientationPermission(); this.parentElement.remove();" 
                style="background: white; color: #4285F4; border: none; padding: 4px 10px; border-radius: 4px; margin-left: 8px; cursor: pointer; font-size: 13px;">
            Bật
        </button>
        <button onclick="this.parentElement.remove();" 
                style="background: transparent; color: white; border: 1px solid white; padding: 4px 8px; border-radius: 4px; margin-left: 4px; cursor: pointer; font-size: 13px;">
            Không
        </button>
    `;

    document.body.appendChild(prompt);

    // Auto remove after 10 seconds
    setTimeout(() => {
        if (prompt.parentElement) {
            prompt.remove();
        }
    }, 10000);
}

// Device Motion API for accelerometer and gyroscope
function handleDeviceMotion(event) {
    if (event.accelerationIncludingGravity) {
        accelerometerData = {
            x: event.accelerationIncludingGravity.x || 0,
            y: event.accelerationIncludingGravity.y || 0,
            z: event.accelerationIncludingGravity.z || 0
        };
    }

    // Use gyroscope data if available for smoother rotation
    if (event.rotationRate) {
        const rotationRate = {
            alpha: event.rotationRate.alpha || 0,
            beta: event.rotationRate.beta || 0,
            gamma: event.rotationRate.gamma || 0
        };

        // Smooth the compass heading using gyroscope
        if (deviceOrientationHeading !== null && Math.abs(rotationRate.alpha) > 0.1) {
            console.log('🌀 Using gyroscope for smooth heading updates');
        }
    }
}

// Advanced sensor initialization for modern mobile devices
function initializeAdvancedSensors() {
    // Try to access magnetometer directly (for compass)
    if ('Magnetometer' in window) {
        try {
            const magnetometer = new Magnetometer({ frequency: 60 });
            magnetometer.addEventListener('reading', () => {
                console.log('🧲 Magnetometer reading:', magnetometer.x, magnetometer.y, magnetometer.z);
            });
            magnetometer.start();
        } catch (error) {
            console.log('🧲 Magnetometer not available:', error.message);
        }
    }

    // Access gyroscope for rotation rate
    if ('Gyroscope' in window) {
        try {
            const gyroscope = new Gyroscope({ frequency: 60 });
            gyroscope.addEventListener('reading', () => {
                console.log('🌀 Gyroscope reading:', gyroscope.x, gyroscope.y, gyroscope.z);
            });
            gyroscope.start();
        } catch (error) {
            console.log('🌀 Gyroscope not available:', error.message);
        }
    }
}

// Mobile performance optimizations
function optimizeForMobile() {
    // Request high performance mode
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
            console.log('⚡ Using idle time for optimizations');
        });
    }

    // Prevent screen sleep during navigation
    if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then((wakeLock) => {
            console.log('🔋 Screen wake lock activated');
        }).catch((err) => {
            console.log('🔋 Wake lock failed:', err.message);
        });
    }

    // Request persistent storage for offline capability
    if ('storage' in navigator && 'persist' in navigator.storage) {
        navigator.storage.persist().then((persistent) => {
            if (persistent) {
                console.log('💾 Persistent storage granted');
            }
        });
    }

    // Battery-aware optimization
    if ('getBattery' in navigator) {
        navigator.getBattery().then((battery) => {
            // Reduce update frequency if battery is low
            if (battery.level < 0.2) {
                console.log('🔋 Low battery mode');
            }
        });
    }

    // Network information for data optimization
    if ('connection' in navigator) {
        const connection = navigator.connection;
        console.log(`📶 Network: ${connection.effectiveType} (${connection.downlink}Mbps)`);

        // Optimize based on connection speed
        if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
            console.log('📶 Slow connection - reducing API calls');
        }
    }
}

// Alternative fast method: Direct CSS transform (faster than recreating icons)
function updateUserDirectionFast(heading) {
    if (userMarker && userMarker.getElement) {
        const markerElement = userMarker.getElement();
        if (markerElement) {
            const container = markerElement.querySelector('.user-location-container');
            if (container) {
                container.style.transform = `rotate(${heading}deg)`;
                return true;
            }
        }
    }
    return false;
}

// Enhanced orientation handler with throttling and fast CSS method
function handleDeviceOrientationFast(event) {
    const now = performance.now();
    if (now - lastOrientationUpdate < ORIENTATION_THROTTLE) {
        return; // Throttle updates for smooth performance
    }
    lastOrientationUpdate = now;

    let heading = null;

    if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
        heading = event.webkitCompassHeading;
    } else if (event.alpha !== null && event.alpha !== undefined) {
        heading = (360 - event.alpha + 360) % 360;
    }

    if (heading !== null && !isNaN(heading)) {
        deviceOrientationHeading = heading;
        console.log(`🧭 Compass heading: ${heading.toFixed(1)}°`);

        // Update user marker with compass heading
        if (userMarker) {
            // Try fast CSS method first, fallback to icon recreation
            if (!updateUserDirectionFast(heading)) {
                const newIcon = createUserLocationIcon(heading);
                userMarker.setIcon(newIcon);
            }
        }
    }
}

console.log('ATM Location App initialized with custom map rotation!');
