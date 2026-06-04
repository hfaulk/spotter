// ===== MAP SETUP =====
let map, marker;

const latInput = document.getElementById("spot_latitude");
const lonInput = document.getElementById("spot_longitude");

const initMap = (lat = 52.5, lon = -1.5, zoom = 5) => {
  map = new maplibregl.Map({
    container: "location-map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [lon, lat],
    zoom: zoom,
  });

  map.on("click", (e) => {
    placeMarker(e.lngLat.lat, e.lngLat.lng);
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

  const isHeic = file.type === "image/heic" || file.type === "image/heif";
  if (!isHeic) {
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
  }
  labelText.textContent = file.name;

  try {
    const exif = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      ifd0: true,
    });

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
        <input type="text" name="unit_number" placeholder="47805" required />
      </div>
      <div class="field">
        <label>Class <span class="optional">(optional)</span></label>
        <input type="text" name="unit_class" placeholder="Class 47" />
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

// Check if there's an error message displayed and show as toast
const formError = document.querySelector(".form-error");
if (formError && formError.textContent.trim()) {
  toast.error(formError.textContent.trim());
}

// ===== CLEAR FORM AFTER SUCCESSFUL SUBMISSION =====
const resetFormState = () => {
  // Show success toast
  toast.success("Spot created successfully!");

  // Reset form inputs
  const form = document.querySelector(".spot-form");
  if (form) form.reset();

  // Reset units
  unitsContainer.innerHTML = "";
  unitsContainer.appendChild(createUnitRow());

  // Reset location
  clearLocation();

  // Reset photo
  const photoPreview = document.getElementById("photo-preview");
  if (photoPreview) photoPreview.style.display = "none";
  const photoLabel = document.getElementById("photo-label-text");
  if (photoLabel) photoLabel.textContent = "Add a photo";

  // Reset EXIF panel
  const exifPanel = document.getElementById("exif-panel");
  if (exifPanel) exifPanel.style.display = "none";
  document.getElementById("exif-camera").textContent = "—";
  document.getElementById("exif-shutter").textContent = "—";
  document.getElementById("exif-aperture").textContent = "—";
  document.getElementById("exif-iso").textContent = "—";
  document.getElementById("exif-focal").textContent = "—";

  // Reset timestamp to current
  if (dt) {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    dt.value = now.toISOString().slice(0, 16);
  }
};

// Check if form should be reset (user came back from successful submission)
if (sessionStorage.getItem("spotFormSubmitted")) {
  sessionStorage.removeItem("spotFormSubmitted");
  resetFormState();
}

// Listen for form submission
const form = document.querySelector(".spot-form");
if (form) {
  form.addEventListener("submit", (e) => {
    // Validate required fields
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

    // Show submission progress
    toast.info("Submitting...");

    // Mark as submitted if form is valid
    if (form.checkValidity()) {
      sessionStorage.setItem("spotFormSubmitted", "true");
    }
  });
}
