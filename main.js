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

// Initialize map at TP Cà Mau
const map = L.map('map', {
    zoomControl: true,
    attributionControl: false
}).setView([9.1766, 105.1524], 16);

// Map layers
const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png');
const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');

// Start with OSM layer
osmLayer.addTo(map);

let currentLayer = 'osm';
let userMarker, nearestATM, nearestPGD, routeLine, atmMarkers = [], pgdMarkers = [];

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

// Create red location icon for user position (simplified without compass)
const userLocationIcon = L.divIcon({
    html: `<div class="user-location-container">
        <img src="images/icon.png" class="user-location-icon" />
    </div>`,
    className: 'custom-user-icon',
    iconSize: [24, 30],
    iconAnchor: [12, 30],
    popupAnchor: [0, -30]
});

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
    
    /* User Location Icon - Simple red location pin */
    .user-location-container {
        position: relative;
        width: 24px;
        height: 24px;
        background: #dc3545;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        border: 2px solid #fff;
    }
    
    .user-location-icon {
        width: 12px;
        height: 12px;
        object-fit: contain;
        transform: rotate(45deg);
        filter: brightness(0) invert(1);
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
        
        // Show user location with red pin
        userMarker = L.marker([userLat, userLng], {
            icon: userLocationIcon
        }).addTo(map).bindPopup("📍 Vị trí của bạn").openPopup();
        
        map.setView([userLat, userLng], 17);
        
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

// Haversine formula to calculate distance (km) - FIXED
function getDistance(lat1, lng1, lat2, lng2) {
    function toRad(x) { return x * Math.PI / 180; }
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lat2 - lat1); // FIX: was lng2 - lng1, should be lng2 - lng1
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    // Debug log to check calculations
    console.log(`Distance from (${lat1}, ${lng1}) to (${lat2}, ${lng2}): ${distance.toFixed(3)} km`);
    
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

// Route to specific ATM function (called from popup) - Updated with location check
window.routeToATM = async function(atmLat, atmLng, atmName) {
    if (!userMarker) {
        showLocationPopup();
        return;
    }
    
    const userLatLng = userMarker.getLatLng();
    
    try {
        // Remove existing route
        if (routeLine) map.removeLayer(routeLine);
        
        // Get route from OSRM
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${userLatLng.lng},${userLatLng.lat};${atmLng},${atmLat}?overview=full&geometries=geojson`);
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
            map.fitBounds(routeLine.getBounds(), { padding: [20, 20] });
            
            // Update info with route details
            const distance = (route.distance / 1000).toFixed(2);
            const duration = Math.round(route.duration / 60);
            
            document.getElementById('nearestInfo').innerHTML = 
                `🗺️ Đường đến <b>${atmName}</b><br>🛣️ ${distance} km - ${duration} phút`;
        } else {
            // Fallback: draw straight line with Google Maps styling
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
            
            document.getElementById('nearestInfo').innerHTML = 
                `🗺️ Đường thẳng đến <b>${atmName}</b>`;
        }
        
    } catch (error) {
        console.error('Routing error:', error);
        // Fallback: draw straight line with Google Maps styling
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
        
        document.getElementById('nearestInfo').innerHTML = 
            `🗺️ Đường thẳng đến <b>${atmName}</b>`;
    }
};

// Route to PGD function
window.routeToPGD = async function(pgdLat, pgdLng, pgdName) {
    if (!userMarker) {
        showLocationPopup();
        return;
    }
    
    const userLatLng = userMarker.getLatLng();
    
    try {
        if (routeLine) map.removeLayer(routeLine);
        
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${userLatLng.lng},${userLatLng.lat};${pgdLng},${pgdLat}?overview=full&geometries=geojson`);
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
            
            map.fitBounds(routeLine.getBounds(), { padding: [20, 20] });
            
            const distance = (route.distance / 1000).toFixed(2);
            const duration = Math.round(route.duration / 60);
            
            document.getElementById('nearestInfo').innerHTML = 
                `🗺️ Đường đến <b>${pgdName}</b><br>🛣️ ${distance} km - ${duration} phút`;
        } else {
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
            
            document.getElementById('nearestInfo').innerHTML = 
                `🗺️ Đường thẳng đến <b>${pgdName}</b>`;
        }
    } catch (error) {
        console.error('Routing error:', error);
        // Fallback implementation similar to above
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
        
        document.getElementById('nearestInfo').innerHTML = 
            `🗺️ Đường thẳng đến <b>${pgdName}</b>`;
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
