const isLoggedIn = window.SPOTTER_CONFIG?.isLoggedIn || false;

// MapLibre Styles
const streetStyle = "https://tiles.openfreemap.org/styles/liberty";
const satelliteStyle = {
  version: 8,
  sources: {
    "esri-satellite": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Tiles © Esri",
      maxzoom: 19, // <-- MOVED HERE: Stops fetching new tiles past 19, but allows stretching
    },
  },
  layers: [
    {
      id: "satellite-layer",
      type: "raster",
      source: "esri-satellite",
      // <-- REMOVED maxzoom from here so the layer never turns off
    },
  ],
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

toggleBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  isSatellite = !isSatellite;

  if (isSatellite) {
    map.setStyle(satelliteStyle);
    toggleBtn.classList.add("active");
  } else {
    map.setStyle(streetStyle);
    toggleBtn.classList.remove("active");
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

  document.getElementById("map-sheet-content").innerHTML = `
    ${
      preview_image
        ? `<div class="sheet-hero" style="background-image:url('${preview_image}')">
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
    // Only allow default scroll if we're scrolling within content (not at the top)
    const isAtTop = sheet.scrollTop === 0;
    const touchCurrentY = e.touches[0].clientY;
    const diffY = touchCurrentY - touchStartY;

    // If at the top and swiping down, prevent default to allow custom handling
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

    // Swipe down more than horizontal movement, and more than 80px
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

map.on("load", async () => {
  try {
    const res = await fetch("/api/map");
    const geojson = await res.json();

    geojson.features.forEach((feature) => {
      const { is_hotspot, spot_count } = feature.properties;
      const [lon, lat] = feature.geometry.coordinates;

      const el = document.createElement("div");
      if (is_hotspot) {
        el.className = "map-marker-hotspot";
        el.innerHTML = `<span>${spot_count}</span>`;
      } else {
        el.className = "map-marker-dot";
      }

      new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([lon, lat])
        .addTo(map);

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        openSheet(feature);
      });
    });
  } catch (err) {
    console.error("Failed to load map data:", err);
    toast.error("Failed to load map data. Please refresh the page.");
  }
});

document.getElementById("near-me-btn").addEventListener("click", () => {
  if (!navigator.geolocation) {
    console.warn("Geolocation not supported");
    toast.error("Geolocation is not supported by your browser.");
    return;
  }
  const btn = document.getElementById("near-me-btn");
  btn.classList.add("loading");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      try {
        map.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 12,
          duration: 1500,
        });
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
