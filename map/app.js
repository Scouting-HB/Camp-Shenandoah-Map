// --- Affine transform calibration ---
// Reference points: [pixelX, pixelY, lat, lon]
const refPoints = [
  [476, 378, 38.134167, -79.234444],  // Men's Shower
  [480, 600, 38.134167, -79.230833],  // Dining Hall Central Entrance
  [493, 595, 38.134444, -79.231111],  // Dining Hall West Entrance
  [469, 575, 38.133889, -79.231111],  // Trading Post SW Corner
  [385, 613, 38.132778, -79.230556],  // Trail/Stewart Intersection
];

// Compute least-squares affine: lat = a*px + b*py + c, lon = d*px + e*py + f
function computeAffine(points) {
  // Build normal equations for least squares: [px, py, 1] * [a,b,c]^T = lat (and same for lon)
  let sxx = 0, syy = 0, sxy = 0, sx = 0, sy = 0, n = points.length;
  let sxLat = 0, syLat = 0, sLat = 0;
  let sxLon = 0, syLon = 0, sLon = 0;
  for (const [px, py, lat, lon] of points) {
    sxx += px * px; syy += py * py; sxy += px * py;
    sx += px; sy += py;
    sxLat += px * lat; syLat += py * lat; sLat += lat;
    sxLon += px * lon; syLon += py * lon; sLon += lon;
  }
  // Solve 3x3 system via Cramer's rule
  // | sxx sxy sx | |a|   |sxLat|
  // | sxy syy sy | |b| = |syLat|
  // | sx  sy  n  | |c|   |sLat |
  function solve3(m, v) {
    const det = m[0]*(m[4]*m[8]-m[5]*m[7]) - m[1]*(m[3]*m[8]-m[5]*m[6]) + m[2]*(m[3]*m[7]-m[4]*m[6]);
    const res = [];
    for (let i = 0; i < 3; i++) {
      const mc = [...m];
      mc[i] = v[0]; mc[i+3] = v[1]; mc[i+6] = v[2];
      const di = mc[0]*(mc[4]*mc[8]-mc[5]*mc[7]) - mc[1]*(mc[3]*mc[8]-mc[5]*mc[6]) + mc[2]*(mc[3]*mc[7]-mc[4]*mc[6]);
      res.push(di / det);
    }
    return res;
  }
  const M = [sxx, sxy, sx, sxy, syy, sy, sx, sy, n];
  const [a, b, c] = solve3(M, [sxLat, syLat, sLat]);
  const [d, e, f] = solve3(M, [sxLon, syLon, sLon]);
  return { a, b, c, d, e, f };
}

const affine = computeAffine(refPoints);

function pixelToGps(px, py) {
  return {
    lat: affine.a * px + affine.b * py + affine.c,
    lon: affine.d * px + affine.e * py + affine.f,
  };
}

function gpsToPixel(lat, lon) {
  const { a, b, c, d, e, f } = affine;
  const det = a * e - b * d;
  const px = (e * (lat - c) - b * (lon - f)) / det;
  const py = (a * (lon - f) - d * (lat - c)) / det;
  return { px, py };
}

// --- DMS parsing ---
function parseDMS(s) {
  const m = s.match(/(\d+)d(\d+)'(\d+)"?\s*([NSEW])/i);
  if (!m) return NaN;
  let deg = parseInt(m[1]) + parseInt(m[2]) / 60 + parseInt(m[3]) / 3600;
  if (m[4] === 'S' || m[4] === 'W') deg = -deg;
  return deg;
}

// --- Landmarks from locs.csv ---
const landmarks = [
  { name: "Showers", latDMS: "38d8'3\"N", lonDMS: "79d14'4\"W" },
  { name: "Timber Mountain Program Area", latDMS: "38d8'4\"N", lonDMS: "79d13'54\"W" },
  { name: "Trail/Stewart Intersection", latDMS: "38d7'58\"N", lonDMS: "79d13'50\"W" },
  { name: "Trading Post (SW)", latDMS: "38d8'2\"N", lonDMS: "79d13'52\"W" },
  { name: "Trading Post (NW)", latDMS: "38d8'3\"N", lonDMS: "79d13'52\"W" },
  { name: "Dining Hall (Central)", latDMS: "38d8'3\"N", lonDMS: "79d13'51\"W" },
  { name: "Dining Hall (West)", latDMS: "38d8'4\"N", lonDMS: "79d13'52\"W" },
];

// Parse GPS and compute pixel positions
for (const lm of landmarks) {
  lm.lat = parseDMS(lm.latDMS);
  lm.lon = parseDMS(lm.lonDMS);
  const { px, py } = gpsToPixel(lm.lat, lm.lon);
  lm.px = px;
  lm.py = py;
}

// --- Map setup ---
const IMG_W = 816;
const IMG_H = 1056;

const map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -2,
  maxZoom: 4,
  zoomSnap: 0.25,
  zoomDelta: 0.5,
  attributionControl: false,
});

// In CRS.Simple, we use [y, x] where y=0 is bottom. Image pixel (px, py) → leaflet [IMG_H - py, px]
const bounds = [[0, 0], [IMG_H, IMG_W]];
L.imageOverlay('CampShenandoahMap2021.svg', bounds).addTo(map);
map.fitBounds(bounds);
map.setMaxBounds([[-100, -100], [IMG_H + 100, IMG_W + 100]]);

function pxToLeaflet(px, py) {
  return [IMG_H - py, px];
}

function leafletToPx(latlng) {
  return { px: latlng.lng, py: IMG_H - latlng.lat };
}

// --- Load official trails from processed data ---
fetch('trails-geo.json')
  .then(r => r.ok ? r.json() : [])
  .catch(() => [])
  .then(officialTrails => {
    for (const trail of officialTrails) {
      const latlngs = trail.points.map(p => pxToLeaflet(p.px, p.py));
      const pl = L.polyline(latlngs, { color: '#6b4c2a', weight: 3, opacity: 0.7 }).addTo(map);
      if (trail.name) {
        pl.bindPopup(`<div class="landmark-popup">${trail.name}</div>`, { closeButton: false });
      }
    }
  });

// --- Add landmark markers ---
const markerIcon = L.divIcon({
  className: '',
  html: '<div style="width:12px;height:12px;border-radius:50%;background:#dc2626;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

for (const lm of landmarks) {
  const pos = pxToLeaflet(lm.px, lm.py);
  const marker = L.marker(pos, { icon: markerIcon }).addTo(map);
  marker.bindPopup(
    `<div class="landmark-popup">${lm.name}<div class="coords">${lm.lat.toFixed(5)}, ${lm.lon.toFixed(5)}</div></div>`,
    { closeButton: false, offset: [0, -4] }
  );
}

// --- Coordinate display on hover / touch-hold ---
const coordDisplay = document.getElementById('coordDisplay');

function formatCoord(gps) {
  const latD = Math.abs(gps.lat);
  const latDeg = Math.floor(latD);
  const latMin = Math.floor((latD - latDeg) * 60);
  const latSec = ((latD - latDeg - latMin / 60) * 3600).toFixed(1);
  const lonD = Math.abs(gps.lon);
  const lonDeg = Math.floor(lonD);
  const lonMin = Math.floor((lonD - lonDeg) * 60);
  const lonSec = ((lonD - lonDeg - lonMin / 60) * 3600).toFixed(1);
  return `${latDeg}\u00b0${latMin}'${latSec}"${gps.lat >= 0 ? 'N' : 'S'}  ${lonDeg}\u00b0${lonMin}'${lonSec}"${gps.lon >= 0 ? 'E' : 'W'}`;
}

function updateCoordDisplay(latlng) {
  const { px, py } = leafletToPx(latlng);
  if (px < 0 || px > IMG_W || py < 0 || py > IMG_H) {
    coordDisplay.classList.remove('visible');
    return;
  }
  const gps = pixelToGps(px, py);
  coordDisplay.textContent = formatCoord(gps);
  coordDisplay.classList.add('visible');
}

map.on('mousemove', function (e) { updateCoordDisplay(e.latlng); });
map.on('mouseout', function () { coordDisplay.classList.remove('visible'); });

// Touch-hold support
let touchHoldTimer = null;
map.getContainer().addEventListener('touchstart', function (e) {
  if (e.touches.length !== 1) return;
  touchHoldTimer = setTimeout(() => {
    const touch = e.touches[0];
    const pt = map.containerPointToLatLng([touch.clientX, touch.clientY]);
    updateCoordDisplay(pt);
  }, 400);
}, { passive: true });
map.getContainer().addEventListener('touchmove', function (e) {
  if (touchHoldTimer) { clearTimeout(touchHoldTimer); touchHoldTimer = null; }
  if (coordDisplay.classList.contains('visible') && e.touches.length === 1) {
    const touch = e.touches[0];
    const pt = map.containerPointToLatLng([touch.clientX, touch.clientY]);
    updateCoordDisplay(pt);
  }
}, { passive: true });
map.getContainer().addEventListener('touchend', function () {
  if (touchHoldTimer) { clearTimeout(touchHoldTimer); touchHoldTimer = null; }
  coordDisplay.classList.remove('visible');
});

// --- GPS geolocation ---
let userMarker = null;
let userCircle = null;
let watchId = null;
const locateBtn = document.getElementById('locateBtn');

locateBtn.addEventListener('click', () => {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
    locateBtn.classList.remove('active');
    if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
    if (userCircle) { map.removeLayer(userCircle); userCircle = null; }
    return;
  }

  if (!navigator.geolocation) {
    alert('Geolocation not supported');
    return;
  }

  locateBtn.classList.add('active');
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { px, py } = gpsToPixel(pos.coords.latitude, pos.coords.longitude);
      const latlng = pxToLeaflet(px, py);

      if (!userMarker) {
        const icon = L.divIcon({ className: 'user-marker', iconSize: [18, 18], iconAnchor: [9, 9] });
        userMarker = L.marker(latlng, { icon, zIndexOffset: 1000 }).addTo(map);
        map.setView(latlng, 1);
      } else {
        userMarker.setLatLng(latlng);
      }

      // Accuracy circle (rough conversion: 1 degree lat ~ 111000m, map scale)
      const metersPerPixel = 111000 * Math.abs(affine.a);  // approx
      const radiusPx = pos.coords.accuracy / metersPerPixel;
      if (userCircle) map.removeLayer(userCircle);
      userCircle = L.circle(latlng, { radius: radiusPx, color: '#2563eb', fillOpacity: 0.1, weight: 1 }).addTo(map);
    },
    (err) => {
      console.warn('Geolocation error:', err.message);
      if (err.code === 1) alert('Location access denied');
    },
    { enableHighAccuracy: true, maximumAge: 5000 }
  );
});

// --- Trail drawing ---
const drawBtn = document.getElementById('drawBtn');
const drawToolbar = document.getElementById('drawToolbar');
const undoTrailBtn = document.getElementById('undoTrailBtn');
const exportTrailBtn = document.getElementById('exportTrailBtn');
const clearTrailBtn = document.getElementById('clearTrailBtn');

let drawMode = false;
let drawing = false;
let currentTrail = [];
let trails = JSON.parse(localStorage.getItem('trails') || '[]');
let trailPolylines = [];
let activePolyline = null;

function saveTrails() {
  localStorage.setItem('trails', JSON.stringify(trails));
}

function renderTrails() {
  trailPolylines.forEach(p => map.removeLayer(p));
  trailPolylines = [];
  for (const trail of trails) {
    const latlngs = trail.map(([x, y]) => pxToLeaflet(x, y));
    const pl = L.polyline(latlngs, { color: '#e11d48', weight: 3, opacity: 0.8 }).addTo(map);
    trailPolylines.push(pl);
  }
}

// Load any trails from URL params
(function loadFromUrl() {
  const params = new URLSearchParams(location.search);
  const data = params.get('trails');
  if (data) {
    try {
      const imported = JSON.parse(atob(data));
      if (Array.isArray(imported)) {
        trails = trails.concat(imported);
        saveTrails();
      }
    } catch (e) { console.warn('Failed to parse trail data from URL'); }
  }
})();

renderTrails();

drawBtn.addEventListener('click', () => {
  drawMode = !drawMode;
  drawBtn.classList.toggle('active', drawMode);
  drawToolbar.classList.toggle('visible', drawMode);
  map.dragging[drawMode ? 'disable' : 'enable']();
  map.getContainer().style.cursor = drawMode ? 'crosshair' : 'crosshair';
});

function startDraw(latlng) {
  if (!drawMode) return;
  drawing = true;
  const { px, py } = leafletToPx(latlng);
  currentTrail = [[Math.round(px), Math.round(py)]];
  activePolyline = L.polyline([latlng], { color: '#e11d48', weight: 3, opacity: 0.8, dashArray: '6,4' }).addTo(map);
}

function continueDraw(latlng) {
  if (!drawing) return;
  const { px, py } = leafletToPx(latlng);
  currentTrail.push([Math.round(px), Math.round(py)]);
  activePolyline.addLatLng(latlng);
}

function endDraw() {
  if (!drawing) return;
  drawing = false;
  if (activePolyline) { map.removeLayer(activePolyline); activePolyline = null; }
  if (currentTrail.length >= 2) {
    trails.push(currentTrail);
    saveTrails();
    renderTrails();
  }
  currentTrail = [];
}

// Mouse drawing
map.on('mousedown', (e) => { if (drawMode) { startDraw(e.latlng); } });
map.on('mousemove', (e) => { if (drawing) { continueDraw(e.latlng); } });
map.on('mouseup', () => { endDraw(); });

// Touch drawing
map.getContainer().addEventListener('touchstart', function (e) {
  if (!drawMode || e.touches.length !== 1) return;
  const touch = e.touches[0];
  const containerRect = map.getContainer().getBoundingClientRect();
  const point = L.point(touch.clientX - containerRect.left, touch.clientY - containerRect.top);
  startDraw(map.containerPointToLatLng(point));
}, { passive: true });

map.getContainer().addEventListener('touchmove', function (e) {
  if (!drawing || e.touches.length !== 1) return;
  const touch = e.touches[0];
  const containerRect = map.getContainer().getBoundingClientRect();
  const point = L.point(touch.clientX - containerRect.left, touch.clientY - containerRect.top);
  continueDraw(map.containerPointToLatLng(point));
}, { passive: true });

map.getContainer().addEventListener('touchend', function () {
  if (drawing) endDraw();
}, { passive: true });

// Prevent click popup when in draw mode
const origClickHandler = map._events.click;
map.off('click');
map.on('click', function (e) {
  if (drawMode) return;
  const { px, py } = leafletToPx(e.latlng);
  if (px < 0 || px > IMG_W || py < 0 || py > IMG_H) return;
  const gps = pixelToGps(px, py);
  L.popup()
    .setLatLng(e.latlng)
    .setContent(`<div class="landmark-popup"><div class="coords">${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}</div></div>`)
    .openOn(map);
});

undoTrailBtn.addEventListener('click', () => {
  if (trails.length === 0) return;
  trails.pop();
  saveTrails();
  renderTrails();
});

exportTrailBtn.addEventListener('click', () => {
  const json = JSON.stringify(trails, null, 2);
  // Try URL param (if short enough)
  const b64 = btoa(JSON.stringify(trails));
  const url = location.origin + location.pathname + '?trails=' + encodeURIComponent(b64);
  if (url.length < 2000) {
    prompt('Share this URL (or copy the downloaded file):', url);
  }
  // Always also download as file
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'trails.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

clearTrailBtn.addEventListener('click', () => {
  if (!confirm('Clear all drawn trails?')) return;
  trails = [];
  saveTrails();
  renderTrails();
});

// --- Register service worker ---
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}
