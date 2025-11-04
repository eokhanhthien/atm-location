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
let pendingNavigation = null;
let currentStyle = 'satellite';

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

// Tạo marker element cho user location
function createUserMarkerElement(heading = 0) {
    const el = document.createElement('div');
    el.className = 'user-marker';
    el.innerHTML = `
        <div style="position:relative;width:32px;height:32px;transform:rotate(${heading}deg);transition:transform 0.3s ease-out;">
            <div style="position:absolute;width:16px;height:16px;background:#4285F4;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(66,133,244,0.4);top:50%;left:50%;transform:translate(-50%,-50%);z-index:2;"></div>
            <div style="position:absolute;width:30px;height:40px;top:-24px;left:1px;background:linear-gradient(to top,rgba(66,133,244,0.8) 0%,rgba(66,133,244,0.6) 50%,rgba(66,133,244,0.3) 100%);clip-path:polygon(45% 100%,55% 100%,84% 0%,12% 0%);z-index:1;transform-origin:50% 100%;"></div>
        </div>
    `;
    return el;
}

// Hiển thị popup xin quyền
function showLocationPopup() {
    const popup = document.createElement('div');
    popup.className = 'location-popup-overlay';
    popup.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;';
    popup.innerHTML = `
        <div style="background:white;border-radius:12px;padding:24px;max-width:400px;width:100%;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.3);">
            <p><strong>🗺️ MapLibre GL JS - Tương tự Mapbox!</strong></p>
            <p>📍 <strong>Vị trí</strong> - Chỉ đường đến ATM/PGD<br>
            🔄 <strong>Xoay map</strong> - 2 ngón tay như Google Maps<br>
            🎮 <strong>3D</strong> - Pitch, bearing, smooth animation</p>
            <div style="display:flex;gap:10px;justify-content:center;">
                <button onclick="enableLocationAndClose()" style="background:#003A6E;color:white;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;">Bật tất cả</button>
                <button onclick="closeLocationPopup()" style="background:#f8f9fa;color:#666;border:1px solid #ddd;padding:10px 20px;border-radius:6px;cursor:pointer;">Bỏ qua</button>
            </div>
        </div>
    `;
    document.body.appendChild(popup);
    popup.onclick = (e) => { if (e.target === popup) closeLocationPopup(); };
}

window.closeLocationPopup = function () {
    const popup = document.querySelector('.location-popup-overlay');
    if (popup) popup.remove();
};

window.enableLocationAndClose = function () {
    closeLocationPopup();
    document.getElementById('locateBtn').click();
};

// Cập nhật vị trí user
function updateUserPosition(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    let heading = position.coords.heading;

    // Tính heading từ chuyển động nếu GPS không có
    if ((heading === null || heading === undefined) && lastPosition) {
        const dLng = lng - lastPosition.lng;
        const dLat = lat - lastPosition.lat;
        if (Math.abs(dLng) > 0.00001 || Math.abs(dLat) > 0.00001) {
            heading = (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360;
        }
    }

    lastPosition = { lat, lng };
    if (heading !== null && heading !== undefined) {
        currentUserHeading = heading;
    }

    // Tạo hoặc cập nhật user marker
    if (!userMarker) {
        const el = createUserMarkerElement(currentUserHeading);
        userMarker = new maplibregl.Marker({
            element: el,
            anchor: 'center'
        })
            .setLngLat([lng, lat])
            .addTo(map);

        // Center lần đầu với animation mượt
        map.flyTo({
            center: [lng, lat],
            zoom: 16,
            duration: 1500,
            essential: true
        });
    } else {
        // Cập nhật vị trí và hướng
        userMarker.setLngLat([lng, lat]);

        // Cập nhật heading rotation
        const container = userMarker.getElement().querySelector('div');
        if (container) {
            container.style.transform = `rotate(${currentUserHeading}deg)`;
        }
    }

    // Follow mode với animation mượt - như Google Maps
    if (followMode || navigationActive) {
        // Khi navigation, xoay map theo hướng user đang di chuyển
        if (navigationActive && heading !== null && heading !== undefined) {
            map.easeTo({
                center: [lng, lat],
                bearing: heading,
                duration: 800,
                essential: true
            });
        } else {
            map.easeTo({
                center: [lng, lat],
                duration: 800,
                essential: true
            });
        }
    }

    // Thực hiện navigation đang chờ
    if (pendingNavigation) {
        executePendingNavigation();
    }
}

function startLocationTracking() {
    if (navigator.geolocation && !watchPositionId) {
        watchPositionId = navigator.geolocation.watchPosition(
            updateUserPosition,
            (error) => console.error('Location error:', error),
            { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
        );
    }
}

function stopLocationTracking() {
    if (watchPositionId) {
        navigator.geolocation.clearWatch(watchPositionId);
        watchPositionId = null;
    }
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
    if (!userMarker) {
        alert('Vui lòng bật vị trí trước!');
        pendingNavigation = { type: 'atm', lat: atmLat, lng: atmLng, name: atmName };
        return;
    }

    const userLngLat = userMarker.getLngLat();

    try {
        // OSRM API với format URL đúng
        console.log('🚗 Trying OSRM routing with correct format...');
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${userLngLat.lng},${userLngLat.lat};${atmLng},${atmLat}?overview=full&geometries=geojson`);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const coordinates = route.geometry.coordinates;

            // Thêm route vào map - Style như Google Maps
            const geojson = {
                type: 'Feature',
                properties: {},
                geometry: route.geometry
            };

            // Xóa route cũ nếu có
            if (map.getSource('route')) {
                if (map.getLayer('route-background')) map.removeLayer('route-background');
                if (map.getLayer('route')) map.removeLayer('route');
                map.removeSource('route');
            }

            map.addSource('route', {
                type: 'geojson',
                data: geojson
            });

            // Route background - viền ngoài đậm
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
            
            // Route main - đường chính như Google Maps
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
                    'line-width': 7,
                    'line-opacity': 1
                }
            });

            routeSourceAdded = true;
            console.log('✅ Route ATM được tạo thành công với', coordinates.length, 'điểm');

            // Zoom về user với bearing theo hướng đi
            const userPos = [userLngLat.lng, userLngLat.lat];
            const destPos = [atmLng, atmLat];
            
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

            // Bắt đầu navigation
            const distance = (route.distance / 1000).toFixed(1);
            const duration = Math.round(route.duration / 60);

            startSimpleNavigation(atmName, route, { lat: atmLat, lng: atmLng }, distance, duration);

        } else {
            console.log('Không có route data, vẽ đường thẳng');
            drawStraightLine([userLngLat.lng, userLngLat.lat], [atmLng, atmLat], atmName);
        }
    } catch (error) {
        console.error('Routing error:', error);
        // Fallback: vẽ đường thẳng
        drawStraightLine([userLngLat.lng, userLngLat.lat], [atmLng, atmLat], atmName);
    }
};

// Chỉ đường đến PGD
window.routeToPGD = async function (pgdLat, pgdLng, pgdName) {
    if (!userMarker) {
        alert('Vui lòng bật vị trí trước!');
        pendingNavigation = { type: 'pgd', lat: pgdLat, lng: pgdLng, name: pgdName };
        return;
    }

    const userLngLat = userMarker.getLngLat();

    try {
        // OSRM API với format URL đúng cho PGD
        console.log('🚗 Trying OSRM routing for PGD...');
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${userLngLat.lng},${userLngLat.lat};${pgdLng},${pgdLat}?overview=full&geometries=geojson`);
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];

            // Thêm route vào map - Style như Google Maps
            const geojson = {
                type: 'Feature',
                properties: {},
                geometry: route.geometry
            };

            // Xóa route cũ nếu có
            if (map.getSource('route')) {
                if (map.getLayer('route-background')) map.removeLayer('route-background');
                if (map.getLayer('route')) map.removeLayer('route');
                map.removeSource('route');
            }

            map.addSource('route', {
                type: 'geojson',
                data: geojson
            });

            // Route background - viền ngoài đậm
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
            
            // Route main - đường chính như Google Maps
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
                    'line-width': 7,
                    'line-opacity': 1
                }
            });

            routeSourceAdded = true;

            // Zoom về user với bearing theo hướng đi
            const userPos = [userLngLat.lng, userLngLat.lat];
            const destPos = [pgdLng, pgdLat];
            
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

            const distance = (route.distance / 1000).toFixed(1);
            const duration = Math.round(route.duration / 60);

            startSimpleNavigation(pgdName, route, { lat: pgdLat, lng: pgdLng }, distance, duration);

        } else {
            console.log('Không có route data PGD, vẽ đường thẳng');
            drawStraightLine([userLngLat.lng, userLngLat.lat], [pgdLng, pgdLat], pgdName);
        }
    } catch (error) {
        console.error('Routing error:', error);
        drawStraightLine([userLngLat.lng, userLngLat.lat], [pgdLng, pgdLat], pgdName);
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
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
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

    followMode = true;
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

    document.getElementById('nearestInfo').innerHTML = '<div style="text-align:center;padding:8px;color:#666;">Chọn điểm trên bản đồ để chỉ đường</div>';

    enableTopbarButtons();
};

// Button handlers
document.getElementById('locateBtn').onclick = function () {
    if (!navigator.geolocation) {
        alert('Trình duyệt không hỗ trợ định vị!');
        return;
    }

    const button = this;
    button.innerHTML = '⏳ Đang tìm...';
    button.disabled = true;

    const options = {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 1000
    };

    const successHandler = (pos) => {
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
        alert('Không thể lấy vị trí. Vui lòng kiểm tra cài đặt GPS!');
        setTimeout(() => {
            button.innerHTML = '📍 Vị trí';
            button.disabled = false;
        }, 2000);
    };

    navigator.geolocation.getCurrentPosition(successHandler, errorHandler, options);
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
    const dLat = toRad(end[1] - start[1]);
    const dLng = toRad(end[0] - start[0]);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(start[1])) * Math.cos(toRad(end[1])) *
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
    console.log('🗺️ MapLibre GL JS loaded - Giống hệt Mapbox!');

    // Thêm markers
    addATMMarkers();
    addPGDMarkers();

    // Hiển thị popup sau 1 giây
    setTimeout(() => {
        if (!userMarker) {
            showLocationPopup();
        }
    }, 1000);
});

// Restore markers sau khi đổi style
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
    }, 100);
});

// Nút về vị trí user ở góc phải dưới
document.getElementById('centerUserBtn').onclick = function() {
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
document.getElementById('satelliteBtn').onclick = function() {
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

console.log('✅ ATM Location với MapLibre GL JS - Zoom limit: 10-17!');