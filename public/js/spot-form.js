// ===== MAP SETUP =====
let map, marker;

const latInput = document.getElementById("spot_latitude");
const lonInput = document.getElementById("spot_longitude");

const initMap = (lat = 52.5, lon = -1.5, zoom = 6) => {
  map = L.map("location-map").setView([lat, lon], zoom);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  map.on("click", (e) => {
    placeMarker(e.latlng.lat, e.latlng.lng);
  });
};

const placeMarker = (lat, lon) => {
  if (marker) marker.remove();
  marker = L.marker([lat, lon], { draggable: true }).addTo(map);
  latInput.value = lat;
  lonInput.value = lon;

  marker.on("dragend", (e) => {
    const pos = e.target.getLatLng();
    latInput.value = pos.lat;
    lonInput.value = pos.lng;
  });
};

const clearLocation = () => {
  if (marker) {
    marker.remove();
    marker = null;
  }
  latInput.value = "";
  lonInput.value = "";
  map.setView([52.5, -1.5], 6);
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

    // Camera info
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

    // Date — set the datetime input from EXIF timestamp
    if (exif.DateTimeOriginal) {
      const dt = document.getElementById("spot_timestamp");
      const d = new Date(exif.DateTimeOriginal);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      dt.value = d.toISOString().slice(0, 16);
    }

    // GPS
    if (exif.latitude && exif.longitude) {
      placeMarker(exif.latitude, exif.longitude);
      map.setView([exif.latitude, exif.longitude], 15);
      document.getElementById("location-status").textContent =
        "Location detected from photo";
    }
  } catch (err) {
    console.error("EXIF error:", err);
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
        <input type="text" name="unit_number[]" placeholder="47805" required />
      </div>
      <div class="field">
        <label>Class <span class="optional">(optional)</span></label>
        <input type="text" name="unit_class[]" placeholder="Class 47" />
      </div>
      <div class="field">
        <label>Operator <span class="optional">(optional)</span></label>
        <input type="text" name="unit_operator[]" placeholder="LNER" />
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

// ===== CLEAR LOCATION BUTTON =====
document
  .getElementById("clear-location")
  ?.addEventListener("click", clearLocation);

// ===== INIT =====
unitsContainer?.appendChild(createUnitRow());
initMap();

// Set datetime to now
const dt = document.getElementById("spot_timestamp");
if (dt) {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  dt.value = now.toISOString().slice(0, 16);
}
