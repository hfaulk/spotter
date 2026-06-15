const isLoggedIn = window.SPOTTER_CONFIG?.isLoggedIn || false;

// MapLibre Styles
const streetStyle = "https://tiles.openfreemap.org/styles/liberty";
// ===== HYBRID SATELLITE STYLE =====
let hybridStylePromise = null;
const getHybridStyle = () => {
  if (hybridStylePromise) return hybridStylePromise;
  hybridStylePromise = fetch(streetStyle)
    .then((res) => res.json())
    .then((style) => {
      style.sources["esri-satellite"] = {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        attribution: "Tiles © Esri",
        maxzoom: 19,
      };
      const overlays = style.layers.filter(
        (l) => l.type === "symbol" || /boundary|admin/.test(l.id),
      );
      style.layers = [
        { id: "satellite-layer", type: "raster", source: "esri-satellite" },
        ...overlays,
      ];
      return style;
    })
    .catch(() => {
      hybridStylePromise = null;
      return {
        version: 8,
        sources: {
          "esri-satellite": {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            ],
            tileSize: 256,
            attribution: "Tiles © Esri",
            maxzoom: 19,
          },
        },
        layers: [
          { id: "satellite-layer", type: "raster", source: "esri-satellite" },
        ],
      };
    });
  return hybridStylePromise;
};

const map = new maplibregl.Map({
  container: "main-map",
  style: streetStyle,
  center: [-1.5, 52.5],
  zoom: 6,
});

// ===== MAP TOGGLE LOGIC =====
let isSatellite = false;
const toggleBtn = document.getElementById("map-toggle-btn");

toggleBtn?.addEventListener("click", async (e) => {
  e.preventDefault();
  isSatellite = !isSatellite;

  if (isSatellite) {
    toggleBtn.classList.add("active");
    map.setStyle(await getHybridStyle());
  } else {
    toggleBtn.classList.remove("active");
    map.setStyle(streetStyle);
  }
});

const sheet = document.getElementById("map-sheet");
const backdrop = document.getElementById("map-sheet-backdrop");

const openSheet = (feature) => {
  const {
    spot_count,
    spotter_count,
    preview_image,
    best_time,
    is_hotspot,
    recent_units,
  } = feature.properties;
  const units = JSON.parse(recent_units || "[]");

  const [lon, lat] = feature.geometry.coordinates;

  const spotsLabel = `${spot_count} ${spot_count === 1 ? "spot" : "spots"}`;
  const spottersLabel = `${spotter_count} ${spotter_count === 1 ? "spotter" : "spotters"}`;

  const unitsHtml =
    units.length > 0
      ? `
    <div class="sheet-section">
      <p class="sheet-section-label">Recently spotted here</p>
      <div class="sheet-units">
        ${units
          .map(
            (u) => `
          <div class="sheet-unit">
            <span class="sheet-unit-number">${u.unit_number}</span>
            ${u.unit_class ? `<span class="sheet-unit-meta">${u.unit_class}</span>` : ""}
            ${u.unit_operator ? `<span class="sheet-unit-meta">${u.unit_operator}</span>` : ""}
          </div>
        `,
          )
          .join("")}
      </div>
    </div>
  `
      : "";

  const ctaHtml = !isLoggedIn
    ? `
    <div class="sheet-cta">
      <p>Join Spotter to log your spots here</p>
      <a href="/register" class="btn-primary" style="font-size:0.875rem;">Sign up free</a>
    </div>
  `
    : "";

  const reportHtml = `
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center;">
        <button type="button" class="js-report-btn" data-reference="Map Coordinates: ${lat}, ${lon}" data-type="map" style="background:none; border:none; padding:0; font-size: 0.75rem; color: #ef4444; cursor: pointer; font-family: inherit;">
          ⚑ Report this area
        </button>
      </div>
    `;

  document.getElementById("map-sheet-content").innerHTML = `
    ${
      preview_image
        ? `<div class="sheet-hero img-loading-dark">
             <img
               src="${preview_image}"
               alt="Latest spot"
               onload="this.parentElement.classList.remove('img-loading-dark')"
               onerror="this.parentElement.classList.remove('img-loading-dark')"
             />
             <span class="sheet-hero-label">Latest spot</span>
           </div>`
        : `<div class="sheet-hero sheet-hero-empty"></div>`
    }
    <div class="sheet-body">
      ${is_hotspot ? `<span class="sheet-hotspot-badge">Hotspot</span>` : ""}
      <div class="sheet-stats">
        <span>${spotsLabel}</span>
        <span class="sheet-dot">·</span>
        <span>${spottersLabel}</span>
      </div>
      <div class="sheet-time">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
        </svg>
        Most active ${best_time}
      </div>
      ${unitsHtml}
      ${ctaHtml}
      ${reportHtml}
    </div>
  `;

  sheet.classList.add("open");
  backdrop.classList.add("visible");
};

const closeSheet = () => {
  sheet.classList.remove("open");
  backdrop.classList.remove("visible");
};

// ===== SWIPE GESTURE HANDLING =====
let touchStartY = 0;
let touchStartX = 0;

sheet.addEventListener(
  "touchstart",
  (e) => {
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
  },
  false,
);

sheet.addEventListener(
  "touchmove",
  (e) => {
    const isAtTop = sheet.scrollTop === 0;
    const touchCurrentY = e.touches[0].clientY;
    const diffY = touchCurrentY - touchStartY;

    if (isAtTop && diffY > 0) {
      e.preventDefault();
    }
  },
  { passive: false },
);

sheet.addEventListener(
  "touchend",
  (e) => {
    const touchEndY = e.changedTouches[0].clientY;
    const touchEndX = e.changedTouches[0].clientX;
    const diffY = touchEndY - touchStartY;
    const diffX = Math.abs(touchEndX - touchStartX);

    if (diffY > 80 && diffY > diffX) {
      closeSheet();
    }
  },
  false,
);

document
  .getElementById("map-sheet-handle")
  .addEventListener("click", closeSheet);
backdrop.addEventListener("click", closeSheet);
map.on("click", closeSheet);

// ===== BOUNDING BOX DATA FETCHING =====
let currentMarkers = [];

const loadSpots = async () => {
  try {
    const bounds = map.getBounds();
    const n = bounds.getNorth();
    const s = bounds.getSouth();
    const e = bounds.getEast();
    const w = bounds.getWest();

    const res = await fetch(`/api/map?n=${n}&s=${s}&e=${e}&w=${w}`);
    const geojson = await res.json();

    currentMarkers.forEach((marker) => marker.remove());
    currentMarkers = [];

    geojson.features.forEach((feature) => {
      const { is_hotspot, spot_count } = feature.properties;
      const [lon, lat] = feature.geometry.coordinates;

      if (typeof lat !== "number" || typeof lon !== "number") return;

      const el = document.createElement("div");
      if (is_hotspot) {
        el.className = "map-marker-hotspot";
        el.innerHTML = `<span>${spot_count}</span>`;
      } else {
        el.className = "map-marker-dot";
      }

      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([lon, lat])
        .addTo(map);

      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        openSheet(feature);
      });

      currentMarkers.push(marker);
    });
  } catch (err) {
    console.error("Failed to load map data:", err);
  }
};

map.on("load", loadSpots);
map.on("moveend", loadSpots);

// ===== USER LOCATION MARKER =====
// Inject the pulse animation once into the page
(function injectLocationStyles() {
  if (document.getElementById("user-location-styles")) return;
  const style = document.createElement("style");
  style.id = "user-location-styles";
  style.textContent = `
    .user-location-marker {
      width: 18px;
      height: 18px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .user-location-dot {
      width: 14px;
      height: 14px;
      background: #2563eb;
      border: 2.5px solid white;
      border-radius: 50%;
      box-shadow: 0 1px 6px rgba(37, 99, 235, 0.5);
      position: relative;
      z-index: 1;
    }
    .user-location-pulse {
      position: absolute;
      width: 40px;
      height: 40px;
      background: rgba(37, 99, 235, 0.18);
      border-radius: 50%;
      animation: user-location-pulse 2s ease-out infinite;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }
    @keyframes user-location-pulse {
      0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 1; }
      70%  { transform: translate(-50%, -50%) scale(1);   opacity: 0.15; }
      100% { transform: translate(-50%, -50%) scale(1);   opacity: 0; }
    }
  `;
  document.head.appendChild(style);
})();

let userLocationMarker = null;

const placeUserLocationMarker = (lon, lat) => {
  // Remove previous marker if it exists
  if (userLocationMarker) {
    userLocationMarker.remove();
    userLocationMarker = null;
  }

  const el = document.createElement("div");
  el.className = "user-location-marker";
  el.innerHTML = `
    <div class="user-location-pulse"></div>
    <div class="user-location-dot"></div>
  `;

  userLocationMarker = new maplibregl.Marker({ element: el, anchor: "center" })
    .setLngLat([lon, lat])
    .addTo(map);
};

// ===== GEOLOCATION =====
document.getElementById("near-me-btn").addEventListener("click", () => {
  if (!navigator.geolocation) {
    toast.error("Geolocation is not supported by your browser.");
    return;
  }
  const btn = document.getElementById("near-me-btn");
  btn.classList.add("loading");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      try {
        const { longitude, latitude } = pos.coords;
        map.flyTo({
          center: [longitude, latitude],
          zoom: 12,
          duration: 1500,
        });
        placeUserLocationMarker(longitude, latitude);
        toast.success("Found your location!");
      } catch (err) {
        console.error("Error flying to location:", err);
        toast.error("Error flying to your location. Please try again.");
      } finally {
        btn.classList.remove("loading");
      }
    },
    (error) => {
      console.error("Geolocation error:", error);
      let message = "Unable to access your location. ";
      if (error.code === error.PERMISSION_DENIED) {
        message +=
          "Please enable location permissions in your browser settings.";
      } else if (error.code === error.POSITION_UNAVAILABLE) {
        message +=
          "Location data is unavailable. Make sure location services are enabled.";
      } else if (error.code === error.TIMEOUT) {
        message += "Location request timed out. Please try again.";
      }
      toast.error(message);
      btn.classList.remove("loading");
    },
    { timeout: 10000, enableHighAccuracy: false },
  );
});
