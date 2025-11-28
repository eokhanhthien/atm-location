// MapLibre GL JS - Fork mã nguồn mở của Mapbox, 100% miễn phí!
// Tính năng giống hệt Mapbox: Vector tiles, 3D, Rotation, Performance cao

// Tọa độ các ATM - TP Cà Mau
const atms = [
    { lat: 9.169887, lng: 105.146648, name: "ATM VietinBank - Thương Nghiệp" },
    { lat: 9.176391, lng: 105.150386, name: "ATM VietinBank - Lý Thường Kiệt" },
    { lat: 9.176106, lng: 105.150526, name: "R-ATM VietinBank - Nạp - Rút" },
    { lat: 9.181793, lng: 105.142854, name: "ATM VietinBank - UBTP" },
    { lat: 9.177732, lng: 105.154361, name: "ATM VietinBank - Sense City" }
];

// Tọa độ các PGD - TP Cà Mau
const pgds = [
    { lat: 9.169887, lng: 105.146648, name: "PGD VietinBank - Thương Nghiệp" },
    { lat: 9.176391, lng: 105.150386, name: "PGD VietinBank - Lý Thường Kiệt" },
    { lat: 9.181793, lng: 105.142854, name: "PGD VietinBank - UBTP" },
    { lat: 9.175000, lng: 105.148000, name: "PGD VietinBank - Trung Tâm" }
];

// Khởi tạo MapLibre map - giống hệt Mapbox API
const map = new maplibregl.Map({
    container: 'map',
    style: {
        "version": 8,
        "sources": {
            "osm": {
                "type": "raster",
                "tiles": ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"],
                "tileSize": 256,
                "attribution": "© OpenStreetMap Contributors"
            },
            "satellite": {
                "type": "raster",
                "tiles": ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
                "tileSize": 256,
                "attribution": "© Esri"
            }
        },
        "layers": [
            {
                "id": "satellite-layer",
                "type": "raster",
                "source": "satellite"
            }
        ]
    },
    center: [105.1524, 9.1766],
    zoom: 15,
    minZoom: 10,
    maxZoom: 17,
    pitch: 0,
    bearing: 0,
    attributionControl: false
});

// Thêm navigation controls (zoom, xoay, compass, pitch)
map.addControl(new maplibregl.NavigationControl({
    visualizePitch: true,
    showCompass: true,
    showZoom: true
}), 'bottom-left');

// Biến toàn cục
let navigationActive = false;
let followMode = false;
let watchPositionId = null;
let currentUserHeading = 0;
let lastPosition = null;
let userMarker = null;
let atmMarkers = [];
let pgdMarkers = [];
let currentRoute = null;
let currentDestination = null;
let routeSourceAdded = false;
let currentRouteGeojson = null;
let pendingNavigation = null;
let currentStyle = 'satellite';
let compassTracking = false;

// Performance optimization variables for smooth compass rotation  
let lastOrientationUpdate = 0;
const ORIENTATION_THROTTLE = 50; // Max 20 FPS for smooth rotation

// Progressive route throttling
let lastRouteUpdate = 0;
const ROUTE_UPDATE_THROTTLE = 2000; // Max 1 update per 2 seconds

// GPS smoothing variables
let lastValidGPS = null;
const GPS_ACCURACY_THRESHOLD = 200; // meters - reject readings worse than this (more realistic)

// Tính bearing từ 2 điểm (để xoay map theo hướng đi)
function calculateBearing(start, end) {
    const startLat = start[1] * Math.PI / 180;
    const startLng = start[0] * Math.PI / 180;
    const endLat = end[1] * Math.PI / 180;
    const endLng = end[0] * Math.PI / 180;

    const dLng = endLng - startLng;

    const y = Math.sin(dLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);

    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360; // Normalize to 0-360
}

// Tạo marker element cho ATM
function createATMMarkerElement() {
    const el = document.createElement('div');
    el.className = 'atm-marker';
    el.innerHTML = `
        <div style="width:32px;height:32px;background:#fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 5px rgba(0,0,0,0.3);border:2px solid #000;">
            <span style="font-size:16px;transform:rotate(45deg);">🏧</span>
        </div>
    `;
    return el;
}

// Tạo marker element cho PGD
function createPGDMarkerElement() {
    const el = document.createElement('div');
    el.className = 'pgd-marker';
    el.innerHTML = `
        <div style="width:32px;height:32px;background:#47c0f6;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 5px rgba(0,0,0,0.3);border:2px solid #fff;">
            <span style="font-size:16px;transform:rotate(45deg);">🏢</span>
        </div>
    `;
    return el;
}

// Tạo marker element cho user location - SIMPLIFIED (no compass beam)
function createUserMarkerElement(heading = 0) {
    const el = document.createElement('div');
    el.className = 'user-marker';
    el.innerHTML = `
        <div style="position:relative;width:32px;height:32px;">
            <div style="position:absolute;width:16px;height:16px;background:#4285F4;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(66,133,244,0.4);top:50%;left:50%;transform:translate(-50%,-50%);z-index:2;"></div>
        </div>
    `;
    return el;
}

// Hiển thị popup đơn giản
function showLocationPopup() {
    const popup = document.createElement('div');
    popup.className = 'location-popup-overlay';
    popup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;';
    popup.innerHTML = `
        <div style="background:white;border-radius:12px;padding:24px;max-width:350px;width:100%;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.3);">
            <div style="font-size:48px;margin-bottom:16px;">📍</div>
            <h3 style="margin:0 0 8px 0;color:#003A6E;">Bật Vị Trí & Compass</h3>
            <p style="margin:0 0 20px 0;color:#666;font-size:14px;">Để sử dụng chỉ đường và xoay map theo hướng</p>
            <button onclick="enableAllFeaturesAndClose()" style="background:#003A6E;color:white;border:none;padding:12px 24px;border-radius:8px;cursor:pointer;font-size:16px;width:100%;">
                🚀 Bật Tất Cả
            </button>
        </div>
    `;
    document.body.appendChild(popup);
    popup.onclick = (e) => { if (e.target === popup) closeLocationPopup(); };
}

window.closeLocationPopup = function () {
    const popup = document.querySelector('.location-popup-overlay');
    if (popup) popup.remove();
};

window.enableAllFeaturesAndClose = async function () {
    closeLocationPopup();

    // Only enable GPS - no compass
    if (navigator.geolocation) {
        try {
            // Check permissions if available
            if ('permissions' in navigator) {
                const permission = await navigator.permissions.query({ name: 'geolocation' });
                console.log('Permission state:', permission.state);

                if (permission.state === 'denied') {
                    alert('Quyền vị trí đã bị từ chối.\n\nVui lòng:\n1. Click vào biểu tượng khóa bên trái URL\n2. Cho phép "Vị trí"\n3. Reload trang và thử lại');
                    return;
                }
            }

            // Enable GPS only
            setTimeout(() => {
                document.getElementById('locateBtn').click();
            }, 500);

        } catch (err) {
            console.log('Permission check failed, trying direct location request:', err);
            setTimeout(() => {
                document.getElementById('locateBtn').click();
            }, 500);
        }
    }

    // NO compass initialization - GPS only mode
    console.log('✅ GPS-only mode - No compass tracking');
};

// Simplified GPS-only position updates
function updateUserPosition(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const accuracy = position.coords.accuracy || 999;

    // GPS Validation - Filter bad readings
    if (!isValidGPSCoordinate(lat, lng, accuracy)) {
        console.log(`⚠️ GPS filtered: lat=${lat}, lng=${lng}, accuracy=${accuracy}m`);
        return;
    }

    // Log GPS quality
    if (accuracy <= 50) {
        console.log(`📍 Good GPS: ${accuracy}m accuracy`);
    } else if (accuracy <= 100) {
        console.log(`📍 OK GPS: ${accuracy}m accuracy`);
    } else {
        console.log(`📍 Poor GPS: ${accuracy}m accuracy (accepted)`);
    }

    // Smooth GPS position
    const smoothedPosition = smoothGPSPosition(lat, lng, lastPosition);
    lastPosition = { lat: smoothedPosition.lat, lng: smoothedPosition.lng };

    // Create or update user marker (simplified - no heading rotation)
    if (!userMarker) {
        const el = createUserMarkerElement(); // No heading parameter needed
        userMarker = new maplibregl.Marker({
            element: el,
            anchor: 'center'
        })
            .setLngLat([smoothedPosition.lng, smoothedPosition.lat])
            .addTo(map);

        // Center on first location
        map.flyTo({
            center: [smoothedPosition.lng, smoothedPosition.lat],
            zoom: 16,
            duration: 1500,
            essential: true
        });
    } else {
        // Just update position - no rotation needed
        userMarker.setLngLat([smoothedPosition.lng, smoothedPosition.lat]);
    }

    // Auto-follow only when user manually enables follow mode
    if (followMode && !navigationActive) {
        map.easeTo({
            center: [smoothedPosition.lng, smoothedPosition.lat],
            duration: 800,
            essential: true
        });
    }

    // Progressive route updates during navigation
    if (navigationActive && currentRouteGeojson) {
        updateProgressiveRoute(smoothedPosition.lat, smoothedPosition.lng);
    }

    // Execute pending navigation
    if (pendingNavigation) {
        executePendingNavigation();
    }
}

function startLocationTracking() {
    if (navigator.geolocation && !watchPositionId) {
        // Optimized GPS options cho stability và accuracy
        const gpsOptions = {
            enableHighAccuracy: true,    // Bật GPS chính xác  
            maximumAge: 2000,            // Cache 2s để GPS có thời gian lock tốt hơn
            timeout: 12000               // Timeout dài hơn cho GPS quality cao
        };

        watchPositionId = navigator.geolocation.watchPosition(
            updateUserPosition,
            (error) => {
                console.error('GPS Error:', error.message);
                // Retry mechanism cho GPS errors
                if (error.code === error.TIMEOUT) {
                    console.log('GPS timeout, retrying...');
                    setTimeout(() => {
                        if (!watchPositionId) startLocationTracking();
                    }, 2000);
                }
            },
            gpsOptions
        );

        console.log('📍 GPS tracking started with stability filters');
    }
}

function stopLocationTracking() {
    if (watchPositionId) {
        navigator.geolocation.clearWatch(watchPositionId);
        watchPositionId = null;
    }
}

// Global compass handler
let compassHandler = null;

// Smooth heading filter để tránh compass giật
function smoothHeading(newHeading, currentHeading) {
    if (currentHeading === null || currentHeading === undefined || currentHeading === 0) {
        return newHeading; // First reading
    }

    // Handle 360° wrap-around (0° và 360° là cùng hướng)
    let diff = newHeading - currentHeading;

    // Normalize difference to [-180, 180]
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;

    // Aggressive smoothing để tránh compass nhảy lung tung
    if (Math.abs(diff) > 45) {
        // Thay đổi rất lớn (>45°) = có thể noise hoặc user xoay nhanh
        const smoothFactor = 0.1; // Chỉ 10% của change để tránh shock
        return (currentHeading + diff * smoothFactor + 360) % 360;
    } else if (Math.abs(diff) > 15) {
        // Thay đổi trung bình (15-45°)
        const smoothFactor = 0.3; // 30% của change
        return (currentHeading + diff * smoothFactor + 360) % 360;
    } else {
        // Thay đổi nhỏ (<15°) - smooth bình thường
        const smoothFactor = 0.6; // 60% smooth
        return (currentHeading + diff * smoothFactor + 360) % 360;
    }
}

// GPS validation và smoothing functions
function isValidGPSCoordinate(lat, lng, accuracy) {
    // Basic coordinate validation
    if (typeof lat !== 'number' || typeof lng !== 'number' ||
        isNaN(lat) || isNaN(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return false;
    }

    // Dynamic accuracy filter - more lenient if no good GPS available
    let threshold = GPS_ACCURACY_THRESHOLD;
    if (!lastValidGPS) {
        // First GPS reading - be more accepting
        threshold = 300; // 300m for first reading
    } else {
        // If last GPS was poor, accept similar quality
        const timeSinceLastGPS = Date.now() - lastValidGPS.timestamp;
        if (timeSinceLastGPS > 10000) { // 10 seconds without GPS
            threshold = 300; // Be more lenient after GPS loss
        }
    }

    if (accuracy > threshold) {
        console.log(`📍 GPS accuracy ${accuracy}m > ${threshold}m threshold - rejected`);
        return false;
    }

    // Detect impossible jumps (>500m in 1 second = >1800km/h)
    if (lastValidGPS) {
        const distance = getDistance(lat, lng, lastValidGPS.lat, lastValidGPS.lng) * 1000; // meters
        const timeElapsed = Date.now() - lastValidGPS.timestamp; // ms
        const speed = distance / (timeElapsed / 1000) * 3.6; // km/h

        if (speed > 200) { // 200 km/h max reasonable speed
            console.log(`🚗 Speed filter: ${speed.toFixed(0)} km/h too fast, rejecting GPS`);
            return false;
        }
    }

    return true;
}

function smoothGPSPosition(lat, lng, lastPos) {
    // First reading or no smoothing needed
    if (!lastPos || !lastValidGPS) {
        lastValidGPS = { lat, lng, timestamp: Date.now() };
        return { lat, lng };
    }

    // Calculate distance moved
    const distance = getDistance(lat, lng, lastPos.lat, lastPos.lng) * 1000; // meters

    // If movement is very small (<2m), smooth more aggressively to reduce jitter
    if (distance < 2) {
        const smoothFactor = 0.3; // Use only 30% of new reading
        const smoothedLat = lastPos.lat + (lat - lastPos.lat) * smoothFactor;
        const smoothedLng = lastPos.lng + (lng - lastPos.lng) * smoothFactor;

        lastValidGPS = { lat: smoothedLat, lng: smoothedLng, timestamp: Date.now() };
        return { lat: smoothedLat, lng: smoothedLng };
    }

    // Normal movement - light smoothing
    const smoothFactor = 0.7;
    const smoothedLat = lastPos.lat + (lat - lastPos.lat) * smoothFactor;
    const smoothedLng = lastPos.lng + (lng - lastPos.lng) * smoothFactor;

    lastValidGPS = { lat: smoothedLat, lng: smoothedLng, timestamp: Date.now() };
    return { lat: smoothedLat, lng: smoothedLng };
}

// Remove compass-related functions
function updateUserDirectionFast(heading) {
    // DISABLED - No compass rotation needed
    return true;
}

// Compass tracking functions
function startCompassTracking() {
    // DISABLED - No compass tracking needed
    console.log('🧭 Compass tracking disabled - GPS only mode');
    return;
}

function stopCompassTracking() {
    // Already disabled
    return;
}

function executePendingNavigation() {
    if (pendingNavigation && userMarker) {
        const { type, lat, lng, name } = pendingNavigation;
        pendingNavigation = null;
        if (type === 'atm') routeToATM(lat, lng, name);
        else if (type === 'pgd') routeToPGD(lat, lng, name);
    }
}

// Thêm ATM markers
function addATMMarkers() {
    // Xóa markers cũ
    atmMarkers.forEach(marker => marker.remove());
    atmMarkers = [];

    atms.forEach(atm => {
        const el = createATMMarkerElement();
        const marker = new maplibregl.Marker({
            element: el,
            anchor: 'bottom'
        })
            .setLngLat([atm.lng, atm.lat])
            .setPopup(
                new maplibregl.Popup({ offset: 25 })
                    .setHTML(`
                        <div style="text-align:center;">
                            <strong>${atm.name}</strong><br>
                            <button onclick="routeToATM(${atm.lat}, ${atm.lng}, '${atm.name}')" 
                                    style="background:#003A6E;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;margin-top:8px;">
                                🚗 Chỉ đường
                            </button>
                        </div>
                    `)
            )
            .addTo(map);

        atmMarkers.push(marker);
    });
}

// Thêm PGD markers
function addPGDMarkers() {
    pgdMarkers.forEach(marker => marker.remove());
    pgdMarkers = [];

    pgds.forEach(pgd => {
        const el = createPGDMarkerElement();
        const marker = new maplibregl.Marker({
            element: el,
            anchor: 'bottom'
        })
            .setLngLat([pgd.lng, pgd.lat])
            .setPopup(
                new maplibregl.Popup({ offset: 25 })
                    .setHTML(`
                        <div style="text-align:center;">
                            <strong>${pgd.name}</strong><br>
                            <button onclick="routeToPGD(${pgd.lat}, ${pgd.lng}, '${pgd.name}')" 
                                    style="background:#47c0f6;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;margin-top:8px;">
                                🚗 Chỉ đường
                            </button>
                        </div>
                    `)
            )
            .addTo(map);

        pgdMarkers.push(marker);
    });
}

function clearAllMarkers() {
    atmMarkers.forEach(marker => marker.remove());
    pgdMarkers.forEach(marker => marker.remove());
    atmMarkers = [];
    pgdMarkers = [];

    // Xóa cả 2 layer của route
    if (map.getSource('route')) {
        if (map.getLayer('route-background')) map.removeLayer('route-background');
        if (map.getLayer('route')) map.removeLayer('route');
        map.removeSource('route');
        routeSourceAdded = false;
    }

    document.getElementById('nearestInfo').innerHTML = '';
}

// Chỉ đường đến ATM với OpenRouteService miễn phí
window.routeToATM = async function (atmLat, atmLng, atmName) {
    // Nếu chưa có vị trí người dùng, lưu pending và yêu cầu bật vị trí
    if (!userMarker) {
        alert('Vui lòng bật vị trí trước!');
        pendingNavigation = { type: 'atm', lat: atmLat, lng: atmLng, name: atmName };
        return;
    }

    // Mở Google Maps - ưu tiên app trên mobile
    try {
        const userLngLat = userMarker.getLngLat();
        const origin = `${userLngLat.lat},${userLngLat.lng}`;
        const destination = `${atmLat},${atmLng}`;

        // Detect mobile device
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (isMobile) {
            // Try to open native Google Maps app first
            const intentUrl = `intent://maps.google.com/maps?daddr=${destination}&saddr=${origin}&directionsmode=driving#Intent;scheme=https;package=com.google.android.apps.maps;end`;
            const iosUrl = `comgooglemaps://?daddr=${destination}&saddr=${origin}&directionsmode=driving`;

            // For Android
            if (/Android/i.test(navigator.userAgent)) {
                console.log('🚗 Opening Google Maps app on Android...');
                window.location.href = intentUrl;
            }
            // For iOS  
            else if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                console.log('🚗 Opening Google Maps app on iOS...');
                window.location.href = iosUrl;

                // Fallback to web if app not installed
                setTimeout(() => {
                    const webUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
                    window.open(webUrl, '_blank');
                }, 1500);
            }
        } else {
            // Desktop: open web version
            const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
            window.open(url, '_blank');
        }

        // Optionally provide a quick haptic feedback on supported devices
        if ('vibrate' in navigator) navigator.vibrate(100);

        // Clear any pending navigation (we've handed off to Google Maps)
        pendingNavigation = null;
        return;
    } catch (err) {
        console.error('Failed to open Google Maps, falling back to in-app routing', err);
        // Nếu lỗi, fallback về logic cũ (vẽ route)
    }
};

// Chỉ đường đến PGD
window.routeToPGD = async function (pgdLat, pgdLng, pgdName) {
    // Nếu chưa có vị trí user
    if (!userMarker) {
        alert('Vui lòng bật vị trí trước!');
        pendingNavigation = { type: 'pgd', lat: pgdLat, lng: pgdLng, name: pgdName };
        return;
    }

    // Mở Google Maps - ưu tiên app trên mobile
    try {
        const userLngLat = userMarker.getLngLat();
        const origin = `${userLngLat.lat},${userLngLat.lng}`;
        const destination = `${pgdLat},${pgdLng}`;

        // Detect mobile device
        const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (isMobile) {
            // Try to open native Google Maps app first
            const intentUrl = `intent://maps.google.com/maps?daddr=${destination}&saddr=${origin}&directionsmode=driving#Intent;scheme=https;package=com.google.android.apps.maps;end`;
            const iosUrl = `comgooglemaps://?daddr=${destination}&saddr=${origin}&directionsmode=driving`;

            // For Android
            if (/Android/i.test(navigator.userAgent)) {
                console.log('🚗 Opening Google Maps app on Android...');
                window.location.href = intentUrl;
            }
            // For iOS  
            else if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                console.log('🚗 Opening Google Maps app on iOS...');
                window.location.href = iosUrl;

                // Fallback to web if app not installed
                setTimeout(() => {
                    const webUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
                    window.open(webUrl, '_blank');
                }, 1500);
            }
        } else {
            // Desktop: open web version
            const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
            window.open(url, '_blank');
        }
        if ('vibrate' in navigator) navigator.vibrate(100);
        pendingNavigation = null;
        return;
    } catch (err) {
        console.error('Failed to open Google Maps for PGD, falling back to in-app routing', err);
    }
};

// Vẽ đường thẳng - fallback khi OSRM fail
function drawStraightLine(start, end, name) {
    console.log('� Drawing straight line fallback from', start, 'to', end);

    const geojson = {
        type: 'Feature',
        properties: {},
        geometry: {
            type: 'LineString',
            coordinates: [start, end]
        }
    };

    // Lưu route data để restore sau khi đổi style
    currentRouteGeojson = geojson;

    // Xóa route cũ
    if (map.getSource('route')) {
        if (map.getLayer('route-background')) map.removeLayer('route-background');
        if (map.getLayer('route')) map.removeLayer('route');
        map.removeSource('route');
    }

    map.addSource('route', {
        type: 'geojson',
        data: geojson
    });

    // Straight line với style rõ ràng
    map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': '#4285F4',
            'line-width': 6,
            'line-opacity': 0.9,
            'line-dasharray': [15, 10]
        }
    });

    routeSourceAdded = true;
    console.log('✅ Straight line route created');

    // Zoom về user với bearing hướng đến đích
    const userPos = start;
    const destPos = end;

    // Tính bearing từ user đến destination
    const bearing = calculateBearing(userPos, destPos);

    // Zoom về user với hướng nhìn theo route
    map.flyTo({
        center: userPos,
        zoom: 16,
        bearing: bearing,
        pitch: 45,
        duration: 2000
    });

    // Tính khoảng cách thẳng
    const distance = getDistance(start[1], start[0], end[1], end[0]);

    // Đợi một chút để route render xong, sau đó fit bounds
    setTimeout(() => {
        const bounds = new maplibregl.LngLatBounds()
            .extend(start)
            .extend(end);

        map.fitBounds(bounds, {
            padding: 100,
            duration: 1500
        });
    }, 500);

    startSimpleNavigation(name, null, { lat: end[1], lng: end[0] }, distance.toFixed(1), Math.round(distance * 2));
}

function getDistance(lat1, lng1, lat2, lng2) {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(end[1] - start[1]);
    const dLng = toRad(end[0] - start[0]);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(start[1])) * Math.cos(toRad(end[1])) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function startSimpleNavigation(destination, route, destinationCoords, distance, duration) {
    navigationActive = true;
    currentRoute = route;
    currentDestination = destinationCoords;

    document.getElementById('nearestInfo').innerHTML = `
        <div style="background:#4285F4;color:white;padding:10px;border-radius:6px;margin:4px;">
            <div style="font-size:14px;font-weight:bold;">
                🎯 ${destination} - ${distance} km (${duration} phút)
            </div>
            <button onclick="stopSimpleNavigation()" 
                    style="background:rgba(255,255,255,0.2);color:white;border:1px solid rgba(255,255,255,0.3);padding:4px 8px;border-radius:12px;cursor:pointer;font-size:11px;margin-top:4px;">
                ✕ Dừng
            </button>
        </div>`;

    // Map controls are now always visible - no need to show/hide

    if (!watchPositionId) {
        startLocationTracking();
    }

    // Không auto follow - user có thể xoay map tự do
    followMode = false;
    disableTopbarButtons();
}

window.stopSimpleNavigation = function () {
    navigationActive = false;
    followMode = false;

    // Map controls are now always visible - no need to show/hide
    stopLocationTracking();

    // Xóa cả 2 layer của route
    if (map.getSource('route')) {
        if (map.getLayer('route-background')) map.removeLayer('route-background');
        if (map.getLayer('route')) map.removeLayer('route');
        map.removeSource('route');
        routeSourceAdded = false;
    }

    // Reset map view về bình thường
    map.easeTo({
        bearing: 0,
        pitch: 0,
        duration: 1000
    });

    currentRoute = null;
    currentDestination = null;
    currentRouteGeojson = null;

    document.getElementById('nearestInfo').innerHTML = '<div style="text-align:center;padding:8px;color:#666;">Chọn điểm trên bản đồ để chỉ đường</div>';

    enableTopbarButtons();
};

// Button handlers
document.getElementById('locateBtn').onclick = async function () {
    if (!navigator.geolocation) {
        alert('Trình duyệt không hỗ trợ định vị!');
        return;
    }

    // Kiểm tra HTTPS trên domain khác localhost
    if (window.location.protocol !== 'https:' && !window.location.hostname.includes('localhost') && window.location.hostname !== '127.0.0.1') {
        alert('⚠️ Cần HTTPS để sử dụng GPS!\n\nTrang web cần chạy trên HTTPS để trình duyệt cho phép truy cập vị trí.\n\nVui lòng mở trang bằng https://...');
        return;
    }

    const button = this;
    button.innerHTML = '⏳ Đang tìm...';
    button.disabled = true;

    // Kiểm tra permissions trước nếu browser hỗ trợ
    if ('permissions' in navigator) {
        try {
            const permission = await navigator.permissions.query({ name: 'geolocation' });
            console.log('Geolocation permission:', permission.state);

            if (permission.state === 'denied') {
                button.innerHTML = '❌ Bị từ chối';
                alert('Quyền truy cập vị trí bị từ chối.\n\nVui lòng:\n1. Click vào biểu tượng khóa/thông tin trang web\n2. Cho phép "Vị trí"\n3. Reload lại trang và thử lại');
                setTimeout(() => {
                    button.innerHTML = '📍 Vị trí';
                    button.disabled = false;
                }, 3000);
                return;
            }
        } catch (err) {
            console.log('Permission check failed:', err);
            // Tiếp tục với geolocation request thông thường
        }
    }

    const options = {
        enableHighAccuracy: true,
        timeout: 15000,        // Tăng timeout cho GPS yếu
        maximumAge: 5000       // Cache 5s để tránh request liên tục
    };

    const successHandler = (pos) => {
        console.log('✅ GPS Success:', pos.coords.accuracy + 'm accuracy');
        updateUserPosition(pos);
        startLocationTracking();
        button.innerHTML = '✅ Đã bật vị trí';
        setTimeout(() => {
            button.innerHTML = '📍 Vị trí';
            button.disabled = false;
        }, 2000);
    };

    const errorHandler = (err) => {
        console.error('Location error:', err);
        button.innerHTML = '❌ Lỗi';

        let errorMessage = 'Không thể lấy vị trí. ';

        // Debug: hiển thị thông tin lỗi chi tiết
        console.error('Geolocation Error Details:', {
            code: err.code,
            message: err.message,
            PERMISSION_DENIED: err.PERMISSION_DENIED,
            POSITION_UNAVAILABLE: err.POSITION_UNAVAILABLE,
            TIMEOUT: err.TIMEOUT
        });

        switch (err.code) {
            case err.PERMISSION_DENIED:
                errorMessage += 'Bạn chưa cho phép truy cập vị trí. Vui lòng:\n\n' +
                    '1. Bật vị trí trong cài đặt điện thoại\n' +
                    '2. Cho phép trình duyệt truy cập vị trí\n' +
                    '3. Reload trang và thử lại\n\n' +
                    'Error: ' + err.message;
                break;
            case err.POSITION_UNAVAILABLE:
                errorMessage += 'Không thể xác định vị trí. Vui lòng:\n\n' +
                    '1. Kiểm tra GPS đã bật\n' +
                    '2. Ra ngoài trời hoặc gần cửa sổ\n' +
                    '3. Thử lại sau vài giây\n\n' +
                    'Error: ' + err.message;
                break;
            case err.TIMEOUT:
                errorMessage += 'Hết thời gian chờ GPS. Vui lòng:\n\n' +
                    '1. Kiểm tra tín hiệu GPS\n' +
                    '2. Ra ngoài trời để GPS tìm vệ tinh\n' +
                    '3. Thử lại\n\n' +
                    'Error: ' + err.message;
                break;
            default:
                errorMessage += 'Lỗi không xác định (Code: ' + err.code + '):\n' + err.message + '\n\nVui lòng thử lại!';
        }

        alert(errorMessage);

        setTimeout(() => {
            button.innerHTML = '📍 Vị trí';
            button.disabled = false;
        }, 2000);
    };

    // Thử getCurrentPosition với options chính
    console.log('🔄 Requesting GPS with high accuracy...');
    navigator.geolocation.getCurrentPosition(successHandler, (err) => {
        console.warn('High accuracy failed:', err.message);

        // Fallback: thử với accuracy thấp hơn nếu high accuracy fail
        if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
            console.log('🔄 Retrying with lower accuracy...');
            button.innerHTML = '🔄 Thử lại...';

            const fallbackOptions = {
                enableHighAccuracy: false,  // Dùng network location
                timeout: 10000,
                maximumAge: 10000
            };

            navigator.geolocation.getCurrentPosition(successHandler, errorHandler, fallbackOptions);
        } else {
            errorHandler(err);
        }
    }, options);
};

document.getElementById('showAllBtn').onclick = function () {
    if (navigationActive) stopSimpleNavigation();

    clearAllMarkers();
    addATMMarkers();
    addPGDMarkers();

    // Fit bounds to all markers
    const bounds = new maplibregl.LngLatBounds();
    [...atms, ...pgds].forEach(location => {
        bounds.extend([location.lng, location.lat]);
    });
    map.fitBounds(bounds, { padding: 80, duration: 1500 });

    this.innerHTML = '✅ Hiển thị tất cả';
    setTimeout(() => { this.innerHTML = '🏢 PGD + ATM'; }, 1500);
};

document.getElementById('showATMBtn').onclick = function () {
    if (navigationActive) stopSimpleNavigation();

    clearAllMarkers();
    addATMMarkers();

    const bounds = new maplibregl.LngLatBounds();
    atms.forEach(atm => bounds.extend([atm.lng, atm.lat]));
    map.fitBounds(bounds, { padding: 80, duration: 1500 });

    // Hiển thị gợi ý ATM gần nhất
    const nearestATM = findNearestATM();
    showNearestSuggestion('ATM', nearestATM);

    this.innerHTML = '✅ Chỉ ATM';
    setTimeout(() => { this.innerHTML = '🏧 ATM'; }, 1500);
};

document.getElementById('showPGDBtn').onclick = function () {
    if (navigationActive) stopSimpleNavigation();

    clearAllMarkers();
    addPGDMarkers();

    const bounds = new maplibregl.LngLatBounds();
    pgds.forEach(pgd => bounds.extend([pgd.lng, pgd.lat]));
    map.fitBounds(bounds, { padding: 80, duration: 1500 });

    // Hiển thị gợi ý PGD gần nhất
    const nearestPGD = findNearestPGD();
    showNearestSuggestion('PGD', nearestPGD);

    this.innerHTML = '✅ Chỉ PGD';
    setTimeout(() => { this.innerHTML = '🏢 PGD'; }, 1500);
};

// Helper function to calculate distance between two points (Haversine formula)
function calculateDistance(start, end) {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371; // Earth's radius in km
    const dLat = (end[1] - start[1]) * Math.PI / 180;
    const dLng = (end[0] - start[0]) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(start[1] * Math.PI / 180) * Math.cos(end[1] * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Helper functions for nearest suggestions
function findNearestATM() {
    if (!userMarker) return null;

    const userLngLat = userMarker.getLngLat();
    let nearestATM = null;
    let shortestDistance = Infinity;

    atms.forEach(atm => {
        const distance = calculateDistance([userLngLat.lng, userLngLat.lat], [atm.lng, atm.lat]);
        if (distance < shortestDistance) {
            shortestDistance = distance;
            nearestATM = { ...atm, distance: distance };
        }
    });

    return nearestATM;
}

function findNearestPGD() {
    if (!userMarker) return null;

    const userLngLat = userMarker.getLngLat();
    let nearestPGD = null;
    let shortestDistance = Infinity;

    pgds.forEach(pgd => {
        const distance = calculateDistance([userLngLat.lng, userLngLat.lat], [pgd.lng, pgd.lat]);
        if (distance < shortestDistance) {
            shortestDistance = distance;
            nearestPGD = { ...pgd, distance: distance };
        }
    });

    return nearestPGD;
}

function showNearestSuggestion(type, nearest) {
    if (!nearest) {
        document.getElementById('nearestInfo').innerHTML = `
            <div style="text-align: center; padding: 6px; color: #666; font-size: 0.8em;">
                Bật vị trí để xem gợi ý ${type} gần nhất
            </div>
        `;
        return;
    }

    const distanceText = nearest.distance < 1 ?
        `${(nearest.distance * 1000).toFixed(0)}m` :
        `${nearest.distance.toFixed(1)}km`;

    document.getElementById('nearestInfo').innerHTML = `
        <div style="background: rgba(255,255,255,0.95); padding: 6px; border-radius: 4px; border-left: 3px solid ${type === 'ATM' ? '#228B22' : '#47c0f6'}; display: flex; align-items: center; gap: 8px;">
            <div style="flex: 1;">
                <div style="font-size: 0.75em; font-weight: bold; color: ${type === 'ATM' ? '#228B22' : '#47c0f6'}; margin-bottom: 2px;">
                    🎯 ${type} gần nhất (${distanceText})
                </div>
                <div style="font-size: 0.7em; color: #333; line-height: 1.2;">
                    ${nearest.name}
                </div>
            </div>
            <button onclick="${type === 'ATM' ? 'routeToATM' : 'routeToPGD'}(${nearest.lat}, ${nearest.lng}, '${nearest.name}')" 
                    style="background: ${type === 'ATM' ? '#228B22' : '#47c0f6'}; color: white; border: none; 
                           padding: 4px 8px; border-radius: 3px; font-size: 0.7em; cursor: pointer; white-space: nowrap;">
                🚗 Đường
            </button>
        </div>
    `;
}

function disableTopbarButtons() {
    const buttons = ['showAllBtn', 'showATMBtn', 'showPGDBtn', 'locateBtn'];
    buttons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = '0.5';
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
        }
    });
}

// Khởi tạo khi map load
map.on('load', () => {
    console.log('🗺️ MapLibre GL JS loaded - GPS-only mode');

    // Add markers
    addATMMarkers();
    addPGDMarkers();

    // Show popup after 1 second
    setTimeout(() => {
        if (!userMarker) {
            showLocationPopup();
        }
    }, 1000);
});

// Restore markers và routes sau khi đổi style
map.on('styledata', () => {
    // Re-add markers sau khi style thay đổi
    setTimeout(() => {
        if (atmMarkers.length > 0) {
            atmMarkers.forEach(marker => marker.addTo(map));
        }
        if (pgdMarkers.length > 0) {
            pgdMarkers.forEach(marker => marker.addTo(map));
        }
        if (userMarker) {
            userMarker.addTo(map);
        }

        // Restore route nếu đang navigation
        if (navigationActive && currentRouteGeojson) {
            // Add route source
            if (!map.getSource('route')) {
                map.addSource('route', {
                    type: 'geojson',
                    data: currentRouteGeojson
                });
            }

            // Add route layers
            if (!map.getLayer('route-background')) {
                map.addLayer({
                    id: 'route-background',
                    type: 'line',
                    source: 'route',
                    layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    paint: {
                        'line-color': '#1557b0',
                        'line-width': 10,
                        'line-opacity': 0.8
                    }
                });
            }

            if (!map.getLayer('route')) {
                map.addLayer({
                    id: 'route',
                    type: 'line',
                    source: 'route',
                    layout: {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    paint: {
                        'line-color': '#4285F4',
                        'line-width': currentRouteGeojson.geometry.type === 'LineString' && currentRouteGeojson.geometry.coordinates.length === 2 ? 6 : 7,
                        'line-opacity': currentRouteGeojson.geometry.type === 'LineString' && currentRouteGeojson.geometry.coordinates.length === 2 ? 0.9 : 1,
                        ...(currentRouteGeojson.geometry.type === 'LineString' && currentRouteGeojson.geometry.coordinates.length === 2 ? { 'line-dasharray': [15, 10] } : {})
                    }
                });
            }

            routeSourceAdded = true;
        }
    }, 200);
});

// Nút về vị trí user ở góc phải dưới
document.getElementById('centerUserBtn').onclick = function () {
    if (userMarker) {
        const lngLat = userMarker.getLngLat();
        map.flyTo({
            center: [lngLat.lng, lngLat.lat],
            zoom: 16,
            pitch: 0,
            bearing: 0,
            duration: 1500
        });
    } else {
        alert('Chưa có vị trí hiện tại! Vui lòng bật GPS trước.');
    }
};

// Nút satellite toggle ở góc phải dưới
document.getElementById('satelliteBtn').onclick = function () {
    if (currentStyle === 'satellite') {
        // Chuyển sang street map (OpenStreetMap)
        map.setStyle({
            version: 8,
            sources: {
                'osm': {
                    type: 'raster',
                    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                    tileSize: 256,
                    attribution: '© OpenStreetMap contributors'
                }
            },
            layers: [{
                id: 'osm',
                type: 'raster',
                source: 'osm'
            }]
        });
        currentStyle = 'streets';
        this.innerHTML = '🛰️';
        this.classList.remove('active');
        this.title = 'Chuyển sang bản đồ vệ tinh';
    } else {
        // Chuyển sang satellite (Esri World Imagery)
        map.setStyle({
            version: 8,
            sources: {
                'satellite': {
                    type: 'raster',
                    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
                    tileSize: 256,
                    attribution: '© Esri, Maxar, Earthstar Geographics'
                }
            },
            layers: [{
                id: 'satellite',
                type: 'raster',
                source: 'satellite'
            }]
        });
        currentStyle = 'satellite';
        this.innerHTML = '🗺️';
        this.classList.add('active');
        this.title = 'Chuyển về bản đồ thường';
    }
};

// Khởi tạo trạng thái nút satellite
const satelliteBtnElement = document.getElementById('satelliteBtn');
if (satelliteBtnElement && currentStyle === 'satellite') {
    satelliteBtnElement.innerHTML = '🗺️';
    satelliteBtnElement.classList.add('active');
    satelliteBtnElement.title = 'Chuyển về bản đồ thường';
} else if (satelliteBtnElement) {
    satelliteBtnElement.innerHTML = '🛰️';
    satelliteBtnElement.classList.remove('active');
    satelliteBtnElement.title = 'Chuyển sang bản đồ vệ tinh';
}

// Optimize route geometry for better accuracy
function optimizeRouteGeometry(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return coordinates;
    }

    // Remove duplicate consecutive points
    const optimized = [coordinates[0]];
    let totalDistance = 0;

    for (let i = 1; i < coordinates.length; i++) {
        const prev = coordinates[i - 1];
        const curr = coordinates[i];

        // Calculate distance between points
        const distance = getDistance(prev[1], prev[0], curr[1], curr[0]) * 1000; // meters
        totalDistance += distance;

        // Only keep point if it's significant enough (> 5 meters from previous)
        if (distance > 5 || i === coordinates.length - 1) {
            optimized.push(curr);
        }
    }

    console.log(`📍 Route optimized: ${coordinates.length} → ${optimized.length} points, total: ${(totalDistance / 1000).toFixed(1)}km`);
    return optimized;
}

// Enhanced straight line with intermediate points for smoothness  
function createSmoothStraightLine(start, end, name) {
    console.log('🔗 Creating smooth straight line from', start, 'to', end);

    const interpolatePoints = 15; // More points for smoother line
    const coordinates = [];

    for (let i = 0; i <= interpolatePoints; i++) {
        const ratio = i / interpolatePoints;
        const lng = start[0] + (end[0] - start[0]) * ratio;
        const lat = start[1] + (end[1] - start[1]) * ratio;
        coordinates.push([lng, lat]);
    }

    return coordinates;
}

// Progressive route - ẩn phần đã đi qua
function updateProgressiveRoute(userLat, userLng) {
    // Throttle route updates để tránh spam
    const now = Date.now();
    if (now - lastRouteUpdate < ROUTE_UPDATE_THROTTLE) {
        return;
    }

    if (!currentRouteGeojson || !currentRouteGeojson.geometry || !currentRouteGeojson.geometry.coordinates) {
        return;
    }

    const coords = currentRouteGeojson.geometry.coordinates;
    if (coords.length < 2) return;

    // Tìm điểm gần nhất trên route
    let closestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < coords.length; i++) {
        const [lng, lat] = coords[i];
        const distance = getDistance(userLat, userLng, lat, lng) * 1000; // meters

        if (distance < minDistance) {
            minDistance = distance;
            closestIndex = i;
        }
    }

    // Progressive route - cắt phần đã đi qua ngay khi user di chuyển
    const passedRatio = closestIndex / coords.length;

    // Điều kiện cắt route: đã đi >5% và trong 50m từ route
    if (passedRatio > 0.05 && minDistance < 50) { // 5% route và trong 50m (sensitive hơn)
        // Tạo route mới chỉ từ vị trí hiện tại đến cuối
        const remainingCoords = coords.slice(Math.max(0, closestIndex - 2)); // Giữ lại 2 điểm trước để mượt

        if (remainingCoords.length >= 2) {
            const updatedGeojson = {
                type: 'Feature',
                properties: currentRouteGeojson.properties || {},
                geometry: {
                    type: 'LineString',
                    coordinates: remainingCoords
                }
            };

            // Cập nhật route trên map
            if (map.getSource('route')) {
                map.getSource('route').setData(updatedGeojson);
                console.log(`🛣️ Route updated: ${(passedRatio * 100).toFixed(1)}% completed, ${coords.length}→${remainingCoords.length} points, ${minDistance.toFixed(0)}m from route`);
                lastRouteUpdate = now; // Update throttle timestamp
            }

            // Cập nhật stored route
            currentRouteGeojson = updatedGeojson;
        }
    } else {
        // Debug info khi không cắt route
        if (minDistance < 200) { // Chỉ log khi gần route
            console.log(`🛣️ No cut: ${(passedRatio * 100).toFixed(1)}% progress, ${minDistance.toFixed(0)}m from route`);
        }
    }
}

console.log('✅ ATM Location với MapLibre GL JS - High accuracy routing + Progressive route enabled!');