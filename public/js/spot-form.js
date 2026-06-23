// ===== MAP SETUP =====
let map, marker;
let isSatellite = false;

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
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "satellite-layer",
      type: "raster",
      source: "esri-satellite",
    },
  ],
};

const latInput = document.getElementById("spot_latitude");
const lonInput = document.getElementById("spot_longitude");

const initMap = (lat = 52.5, lon = -1.5, zoom = 5) => {
  map = new maplibregl.Map({
    container: "location-map",
    style: streetStyle,
    center: [lon, lat],
    zoom: zoom,
    maxZoom: 19,
  });

  map.on("click", (e) => {
    placeMarker(e.lngLat.lat, e.lngLat.lng);
  });

  // Setup Satellite Toggle
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
};

const placeMarker = (lat, lon) => {
  if (marker) marker.remove();

  marker = new maplibregl.Marker({ draggable: true })
    .setLngLat([lon, lat])
    .addTo(map);

  latInput.value = lat;
  lonInput.value = lon;

  marker.on("dragend", () => {
    const lngLat = marker.getLngLat();
    latInput.value = lngLat.lat;
    lonInput.value = lngLat.lng;
  });
};

const clearLocation = () => {
  if (marker) {
    marker.remove();
    marker = null;
  }
  latInput.value = "";
  lonInput.value = "";
  map.flyTo({ center: [-1.5, 52.5], zoom: 5 });
  document.getElementById("location-status").textContent = "";
};

// ===== SHUTTER SPEED FORMATTER =====
const formatShutterSpeed = (exposureTime) => {
  if (exposureTime >= 1) return `${exposureTime}s`;
  return `1/${Math.round(1 / exposureTime)}`;
};

// ===== PHOTO HANDLER =====
const photoInput = document.getElementById("photo");

photoInput?.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const preview = document.getElementById("photo-preview");
  const labelText = document.getElementById("photo-label-text");
  const photoLabelUI = document.querySelector(".photo-label");

  // Instant UX Feedback before heavy parsing
  labelText.textContent = "Extracting camera data...";
  if (photoLabelUI) photoLabelUI.style.borderColor = "midnightblue";

  const isHeic = file.type === "image/heic" || file.type === "image/heif";
  if (!isHeic) {
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
  }

  try {
    const exif = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      ifd0: true,
    });

    labelText.textContent = file.name; // Reset to filename when done

    if (!exif) return;

    const camera = exif.Model;
    const shutter = exif.ExposureTime
      ? formatShutterSpeed(exif.ExposureTime)
      : null;
    const aperture = exif.FNumber ? `f/${exif.FNumber}` : null;
    const iso = exif.ISOSpeedRatings || exif.ISO || null;
    const focal = exif.FocalLength ? `${exif.FocalLength}mm` : null;

    if (camera) document.getElementById("exif-camera").textContent = camera;
    if (shutter) document.getElementById("exif-shutter").textContent = shutter;
    if (aperture)
      document.getElementById("exif-aperture").textContent = aperture;
    if (iso) document.getElementById("exif-iso").textContent = iso;
    if (focal) document.getElementById("exif-focal").textContent = focal;

    if (camera || shutter || aperture || iso || focal) {
      document.getElementById("exif-panel").style.display = "block";
    }

    if (exif.DateTimeOriginal) {
      const dt = document.getElementById("spot_timestamp");
      const d = new Date(exif.DateTimeOriginal);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      dt.value = d.toISOString().slice(0, 16);
    }

    if (exif.latitude && exif.longitude) {
      placeMarker(exif.latitude, exif.longitude);
      map.flyTo({ center: [exif.longitude, exif.latitude], zoom: 15 });
      document.getElementById("location-status").textContent =
        "Location detected from photo";
    }
  } catch {
    // No EXIF — continue silently
    labelText.textContent = file.name;
  }
});

// ===== DYNAMIC UNITS =====
const unitsContainer = document.getElementById("units-container");
const addUnitBtn = document.getElementById("add-unit");

const createUnitRow = () => {
  const row = document.createElement("div");
  row.className = "unit-row";
  row.innerHTML = `
    <div class="unit-fields">
      <div class="field">
        <label>Unit number</label>
        <input type="text" name="unit_number" placeholder="47805" required inputmode="numeric" pattern="[0-9]*" />
      </div>
      <div class="field">
        <label>Class <span class="optional">(optional)</span></label>
        <input type="text" name="unit_class" placeholder="CLASS 47" autocapitalize="characters" autocorrect="off" />
      </div>
      <div class="field">
        <label>Operator <span class="optional">(optional)</span></label>
        <input type="text" name="unit_operator" placeholder="LNER" />
      </div>
    </div>
    <button type="button" class="btn-remove-unit" aria-label="Remove unit">✕</button>
  `;

  row.querySelector(".btn-remove-unit").addEventListener("click", () => {
    if (document.querySelectorAll(".unit-row").length > 1) {
      row.remove();
    }
  });

  return row;
};

addUnitBtn?.addEventListener("click", () => {
  unitsContainer.appendChild(createUnitRow());
});

document
  .getElementById("clear-location")
  ?.addEventListener("click", clearLocation);

// ===== INIT =====
unitsContainer?.appendChild(createUnitRow());
initMap();

const dt = document.getElementById("spot_timestamp");
if (dt) {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dt.value = now.toISOString().slice(0, 16);
}

const formError = document.querySelector(".form-error");
if (formError && formError.textContent.trim()) {
  toast.error(formError.textContent.trim());
}

// ===== SUBMIT LISTENER =====
const checkSession = async () => {
  try {
    const res = await fetch("/api/session-check", { credentials: "include" });
    return res.ok;
  } catch {
    return false;
  }
};

const form = document.querySelector(".spot-form");
if (form) {
  form.addEventListener("submit", async (e) => {
    // Stop native submission immediately to perform async checks
    e.preventDefault();

    const titleInput = document.getElementById("spot_title");
    const timestampInput = document.getElementById("spot_timestamp");
    const unitsInputs = document.querySelectorAll("input[name='unit_number']");

    if (!titleInput || !titleInput.value.trim()) {
      toast.warning("Please enter a spot title");
      return;
    }

    if (!timestampInput || !timestampInput.value) {
      toast.warning("Please select a date and time");
      return;
    }

    if (
      unitsInputs.length === 0 ||
      !Array.from(unitsInputs).some((u) => u.value.trim())
    ) {
      toast.warning("Please add at least one unit number");
      return;
    }

    // Gap 7 Fix: Verify session before dumping form data
    const isValidSession = await checkSession();
    if (!isValidSession) {
      toast.error(
        "Your session has expired. Please log in again. Your data has been saved below.",
      );
      setTimeout(() => (window.location.href = "/login"), 3000);
      return;
    }

    toast.info("Submitting...");

    // UI Lockout & Spinner
    if (form.checkValidity()) {
      // Set flag to force bfcache invalidation on Profile page
      sessionStorage.setItem("lineside_data_changed", "true");

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = "0.7";
        submitBtn.innerHTML = `
          <svg class="spinner" viewBox="0 0 50 50" style="width: 20px; height: 20px; vertical-align: middle; margin-right: 8px; animation: rotate 2s linear infinite;">
            <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="1, 200" stroke-dashoffset="0" style="animation: dash 1.5s ease-in-out infinite;"></circle>
          </svg>
          Uploading Spot...
        `;
      }

      form.submit();
    }
  });
}
