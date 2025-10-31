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
let defaultView = { lat: 9.1766, lng: 105.1524, zoom: 16 };

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

// Mobile-only touch rotation like Google Maps
function initializeMapRotation() {
    // DISABLED: Touch rotation functionality removed due to compatibility issues
    console.log('Map rotation disabled');
    return;
    
    const container = map.getContainer();
    
    console.log('Initializing mobile touch rotation only');
    
    // Touch rotation variables
    let isTouchRotating = false;
    let initialTouchAngle = 0;
    let initialTouchDistance = 0;
    let startBearing = 0;
    
    // Touch rotation (2-finger) - MOBILE ONLY
    container.addEventListener('touchstart', (e) => {
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
            e.preventDefault();
        }
    }, { passive: false });
    
    container.addEventListener('touchmove', (e) => {
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
    
    container.addEventListener('touchend', (e) => {
        if (isTouchRotating) {
            isTouchRotating = false;
            hideRotationIndicator();
            
            // Re-enable Leaflet controls
            setTimeout(() => {
                map.touchZoom.enable();
                map.dragging.enable();
            }, 100);
        }
    });
}

// Rotate map using proper Leaflet bearing API
function rotateMapTouch(angle) {
    // DISABLED: Rotation functionality removed
    console.log('Rotation disabled, angle requested:', angle);
    return;
    
    currentBearing = ((angle % 360) + 360) % 360;
    
    // Use Leaflet bearing API for real map rotation
    if (map.setBearing) {
        map.setBearing(currentBearing);
        console.log('Map rotated to:', currentBearing, '°');
    } else if (map.options.bearing !== undefined) {
        // Fallback: set bearing option and refresh
        map.options.bearing = currentBearing;
        map.invalidateSize();
        console.log('Map bearing set via options:', currentBearing, '°');
    } else {
        // Last resort: just update compass
        console.log('No rotation API available, compass only');
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
    const indicator = document.getElementById('rotationIndicator');
    if (indicator) {
        indicator.classList.add('active');
        updateRotationIndicator();
    }
}

function hideRotationIndicator() {
    const indicator = document.getElementById('rotationIndicator');
    if (indicator) {
        indicator.classList.remove('active');
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
    // DISABLED: Rotation functionality removed
    console.log('Rotation reset disabled');
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
}

function startLocationTracking() {
    if (navigator.geolocation && !watchPositionId) {
        const options = {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 2000  // Shorter for better heading updates
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
    const heading = position.coords.heading;
    const accuracy = position.coords.accuracy;
    
    if (userMarker) {
        // Update position
        userMarker.setLatLng([lat, lng]);
        
        // Update direction arrow if heading is available
        if (heading !== null && heading !== undefined) {
            const newIcon = createUserLocationIcon(heading);
            userMarker.setIcon(newIcon);
        }
        
        // Update accuracy circle
        if (userAccuracyCircle) {
            map.removeLayer(userAccuracyCircle);
        }
        if (accuracy && accuracy < 100) {
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

// Create user location icon with direction arrow (Google Maps style)
function createUserLocationIcon(heading = 0) {
    return L.divIcon({
        html: `<div class="user-location-container" style="transform: rotate(${heading}deg)">
            <div class="user-direction-arrow">
                <div class="arrow-body"></div>
                <div class="arrow-head"></div>
            </div>
            <div class="user-location-dot"></div>
        </div>`,
        className: 'custom-user-icon',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
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
    
    /* Google Maps style user location with direction arrow */
    .user-location-container {
        position: relative;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        transform-origin: center center;
    }
    
    .user-location-dot {
        position: absolute;
        width: 16px;
        height: 16px;
        background: #4285F4;
        border: 3px solid #fff;
        border-radius: 50%;
        box-shadow: 0 2px 8px rgba(66, 133, 244, 0.4);
        z-index: 2;
    }
    
    .user-direction-arrow {
        position: absolute;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1;
    }
    
    .arrow-body {
        position: absolute;
        width: 3px;
        height: 20px;
        background: #4285F4;
        border-radius: 1.5px;
        top: 2px;
    }
    
    .arrow-head {
        position: absolute;
        width: 0;
        height: 0;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-bottom: 8px solid #4285F4;
        top: 0px;
    }
    
    /* Pulsing animation for user location */
    .user-location-container::before {
        content: '';
        position: absolute;
        width: 32px;
        height: 32px;
        background: rgba(66, 133, 244, 0.2);
        border-radius: 50%;
        animation: pulse 2s infinite;
        z-index: 0;
    }
    
    @keyframes pulse {
        0% {
            transform: scale(0.5);
            opacity: 1;
        }
        70% {
            transform: scale(1.2);
            opacity: 0.3;
        }
        100% {
            transform: scale(1.5);
            opacity: 0;
        }
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

// Function to show location permission popup
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
            <h3>🗺️ Cần truy cập vị trí</h3>
            <p>Để sử dụng tính năng chỉ đường, chúng tôi cần biết vị trí hiện tại của bạn.</p>
            <p><strong>Vui lòng:</strong></p>
            <p>1. Bấm "Cho phép" khi trình duyệt hỏi<br>
               2. Hoặc bấm "📍 Vị trí" để bật định vị</p>
            <div class="location-popup-buttons">
                <button class="btn-primary" onclick="enableLocationAndClose()">📍 Bật vị trí ngay</button>
                <button class="btn-secondary" onclick="closeLocationPopup()">Để sau</button>
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
window.closeLocationPopup = function() {
    const popup = document.querySelector('.location-popup-overlay');
    if (popup) {
        popup.remove();
    }
};

// Function to enable location and close popup
window.enableLocationAndClose = function() {
    closeLocationPopup();
    document.getElementById('locateBtn').click();
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
function startSimpleNavigation(destination, route) {
    navigationActive = true;
    
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

// Auto return to user when no interaction for 3 seconds during navigation
let autoReturnTimer = null;
let lastInteractionTime = 0;

function setupAutoReturnToUser() {
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

window.stopSimpleNavigation = function() {
    navigationActive = false;
    followMode = false;
    
    // Hide navigation controls
    document.getElementById('navigationControls').style.display = 'none';
    
    // Stop tracking
    stopLocationTracking();
    
    // Clear auto return timer
    if (autoReturnTimer) {
        clearTimeout(autoReturnTimer);
        autoReturnTimer = null;
    }
    
    // Remove all map event listeners
    map.off('dragstart');
    map.off('dragend');
    map.off('drag');
    map.off('zoomstart');
    map.off('zoomend');
    map.off('movestart');
    map.off('moveend');
    
    // Remove touch event listeners
    map.getContainer().removeEventListener('touchstart', () => {});
    map.getContainer().removeEventListener('touchmove', () => {});
    map.getContainer().removeEventListener('touchend', () => {});
    
    // Remove route line
    if (routeLine) {
        map.removeLayer(routeLine);
        routeLine = null;
    }
    
    // Clear info
    document.getElementById('nearestInfo').innerHTML = '';
};

// Handle location - back to original simple version
document.getElementById('locateBtn').onclick = function() {
    if (!navigator.geolocation) {
        alert('Trình duyệt không hỗ trợ định vị.');
        return;
    }
    
    const button = this;
    button.innerHTML = '⏳ Đang tìm...';
    button.disabled = true;
    
    const options = {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 300000
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
        
        switch(err.code) {
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
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return distance;
}

// Show all ATMs and PGDs
document.getElementById('showAllBtn').onclick = function() {
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
document.getElementById('showATMBtn').onclick = function() {
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
document.getElementById('showPGDBtn').onclick = function() {
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
window.routeToATM = async function(atmLat, atmLng, atmName) {
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
            
            // Start simple navigation
            startSimpleNavigation(atmName, route);
            
            // Update info with route details
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
            
            startSimpleNavigation(atmName, fallbackRoute);
            
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
        
        startSimpleNavigation(atmName, fallbackRoute);
        
        document.getElementById('nearestInfo').innerHTML = 
            `🗺️ Đường thẳng đến <b>${atmName}</b>
            <button onclick="stopSimpleNavigation()" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; margin-left: 8px; cursor: pointer; font-size: 0.8em;">
                ❌ Tắt
            </button>`;
    }
};

// Route to PGD function - Enhanced with navigation
window.routeToPGD = async function(pgdLat, pgdLng, pgdName) {
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
            startSimpleNavigation(pgdName, route);
            
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
            
            startSimpleNavigation(pgdName, fallbackRoute);
            
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
        
        startSimpleNavigation(pgdName, fallbackRoute);
        
        document.getElementById('nearestInfo').innerHTML = 
            `🗺️ Đường thẳng đến <b>${pgdName}</b>
            <button onclick="stopSimpleNavigation()" style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 4px; margin-left: 8px; cursor: pointer; font-size: 0.8em;">
                ❌ Tắt
            </button>`;
    }
};

// Satellite toggle functionality
document.getElementById('satelliteBtn').onclick = function() {
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
document.getElementById('centerUserBtn').onclick = function() {
    if (userMarker) {
        // Zoom sát vào user location
        map.setView(userMarker.getLatLng(), 19);
        this.classList.add('active');
        setTimeout(() => {
            this.classList.remove('active');
        }, 200);
    }
};

document.getElementById('reopenNavBtn').onclick = function() {
    if (navigationActive) {
        // Toggle between showing route info and minimizing it
        const info = document.getElementById('nearestInfo');
        if (info.style.display === 'none') {
            info.style.display = '';
            this.innerHTML = '❌';
            this.title = 'Ẩn thông tin';
        } else {
            info.style.display = 'none';
            this.innerHTML = '🗺️';
            this.title = 'Hiện thông tin';
        }
    }
};

// Initialize rotation after map is ready
map.whenReady(function() {
    console.log('Map ready - initializing Google Maps-style rotation');
    initializeMapRotation();
    updateCompassNeedle();
});

// Add keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.key === 'r' || e.key === 'R') {
        resetMapRotation();
    } else if (e.key === 'c' || e.key === 'C') {
        if (userMarker) centerOnUser();
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

// Set satellite button as active by default
document.getElementById('satelliteBtn').classList.add('active');
document.getElementById('satelliteBtn').title = 'Chuyển bản đồ thường';

console.log('ATM Location App initialized with custom map rotation!');
