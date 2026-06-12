// public/js/spot-sheet.js
// Global "Log a spot" sheet: opens over any page from the + button.
// Lazy-loads MapLibre + exifr the first time it opens, submits via fetch,
// then navigates to the new spot's page (back button returns here).
document.addEventListener("DOMContentLoaded", () => {
  const sheet = document.getElementById("spot-sheet");
  const backdrop = document.getElementById("spot-sheet-backdrop");
  if (!sheet || !backdrop) return; // sheet not on this page (e.g. guest)

  const form = document.getElementById("ss-form");
  const submitBtn = document.getElementById("ss-submit");
  const latInput = document.getElementById("ss-lat");
  const lonInput = document.getElementById("ss-lon");

  let libsLoaded = false;
  let libsLoading = null;
  let map = null;
  let marker = null;
  let isSatellite = false;
  let isSubmitting = false;
  let lastFocused = null;

  // ===== LAZY SCRIPT/STYLE LOADING =====
  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });

  const loadCss = (href) =>
    new Promise((resolve) => {
      if (document.querySelector(`link[href="${href}"]`)) return resolve();
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = href;
      l.onload = resolve;
      l.onerror = resolve; // map still works without css in worst case
      document.head.appendChild(l);
    });

  const loadLibs = () => {
    if (libsLoaded) return Promise.resolve();
    if (libsLoading) return libsLoading;
    libsLoading = Promise.all([
      window.maplibregl
        ? Promise.resolve()
        : Promise.all([
            loadCss("https://unpkg.com/maplibre-gl/dist/maplibre-gl.css"),
            loadScript("https://unpkg.com/maplibre-gl/dist/maplibre-gl.js"),
          ]),
      window.exifr
        ? Promise.resolve()
        : loadScript("https://unpkg.com/exifr@7.1.3/dist/full.umd.cjs"),
    ]).then(() => {
      libsLoaded = true;
    });
    return libsLoading;
  };

  // ===== MAP =====
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
      // Transparent place names + boundaries overlay (hybrid mode)
      "esri-labels": {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        maxzoom: 19,
      },
    },
    layers: [
      { id: "satellite-layer", type: "raster", source: "esri-satellite" },
      { id: "labels-layer", type: "raster", source: "esri-labels" },
    ],
  };

  const initMap = () => {
    if (map) {
      map.resize(); // container size can change between opens
      return;
    }
    map = new maplibregl.Map({
      container: "ss-location-map",
      style: streetStyle,
      center: [-1.5, 52.5],
      zoom: 5,
      maxZoom: 19,
    });

    map.on("click", (e) => placeMarker(e.lngLat.lat, e.lngLat.lng));

    document
      .getElementById("ss-map-toggle-btn")
      ?.addEventListener("click", (e) => {
        e.preventDefault();
        isSatellite = !isSatellite;
        map.setStyle(isSatellite ? satelliteStyle : streetStyle);
        document
          .getElementById("ss-map-toggle-btn")
          .classList.toggle("active", isSatellite);
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
      const ll = marker.getLngLat();
      latInput.value = ll.lat;
      lonInput.value = ll.lng;
    });
  };

  const clearLocation = () => {
    if (marker) {
      marker.remove();
      marker = null;
    }
    latInput.value = "";
    lonInput.value = "";
    if (map) map.flyTo({ center: [-1.5, 52.5], zoom: 5 });
    document.getElementById("ss-location-status").textContent = "";
  };

  document
    .getElementById("ss-clear-location")
    ?.addEventListener("click", clearLocation);

  // ===== EXIF =====
  const formatShutterSpeed = (t) =>
    t >= 1 ? `${t}s` : `1/${Math.round(1 / t)}`;

  document.getElementById("ss-photo")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const preview = document.getElementById("ss-photo-preview");
    const labelText = document.getElementById("ss-photo-label-text");
    labelText.textContent = "Extracting camera data...";

    const isHeic = file.type === "image/heic" || file.type === "image/heif";
    if (!isHeic) {
      preview.src = URL.createObjectURL(file);
      preview.style.display = "block";
    }

    try {
      await loadLibs(); // exifr may still be loading on slow connections
      const exif = await exifr.parse(file, {
        tiff: true,
        exif: true,
        gps: true,
        ifd0: true,
      });
      labelText.textContent = file.name;
      if (!exif) return;

      const set = (id, val) => {
        if (val) document.getElementById(id).textContent = val;
      };
      const camera = exif.Model;
      const shutter = exif.ExposureTime
        ? formatShutterSpeed(exif.ExposureTime)
        : null;
      const aperture = exif.FNumber ? `f/${exif.FNumber}` : null;
      const iso = exif.ISOSpeedRatings || exif.ISO || null;
      const focal = exif.FocalLength ? `${exif.FocalLength}mm` : null;

      set("ss-exif-camera", camera);
      set("ss-exif-shutter", shutter);
      set("ss-exif-aperture", aperture);
      set("ss-exif-iso", iso);
      set("ss-exif-focal", focal);
      if (camera || shutter || aperture || iso || focal) {
        document.getElementById("ss-exif-panel").style.display = "block";
      }

      if (exif.DateTimeOriginal) {
        const d = new Date(exif.DateTimeOriginal);
        d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
        document.getElementById("ss-timestamp").value = d
          .toISOString()
          .slice(0, 16);
      }

      if (exif.latitude && exif.longitude && map) {
        placeMarker(exif.latitude, exif.longitude);
        map.flyTo({ center: [exif.longitude, exif.latitude], zoom: 15 });
        document.getElementById("ss-location-status").textContent =
          "Location detected from photo";
      }
    } catch {
      labelText.textContent = file.name;
    }
  });

  // ===== DYNAMIC UNITS =====
  const unitsContainer = document.getElementById("ss-units-container");

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
      if (unitsContainer.querySelectorAll(".unit-row").length > 1) row.remove();
    });
    return row;
  };

  document.getElementById("ss-add-unit")?.addEventListener("click", () => {
    unitsContainer.appendChild(createUnitRow());
  });

  // ===== FORM STATE =====
  const setNowTimestamp = () => {
    const dt = document.getElementById("ss-timestamp");
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    dt.value = now.toISOString().slice(0, 16);
  };

  const setNonce = () => {
    document.getElementById("ss-nonce").value = crypto.randomUUID
      ? crypto.randomUUID()
      : Date.now().toString();
  };

  const resetForm = () => {
    form.reset();
    unitsContainer.innerHTML = "";
    unitsContainer.appendChild(createUnitRow());
    clearLocation();
    const preview = document.getElementById("ss-photo-preview");
    preview.style.display = "none";
    preview.src = "";
    document.getElementById("ss-photo-label-text").textContent = "Add a photo";
    document.getElementById("ss-exif-panel").style.display = "none";
    ["camera", "shutter", "aperture", "iso", "focal"].forEach((k) => {
      document.getElementById(`ss-exif-${k}`).textContent = "—";
    });
    setNowTimestamp();
    setNonce();
    setSubmitting(false);
  };

  const setSubmitting = (on) => {
    isSubmitting = on;
    submitBtn.disabled = on;
    submitBtn.style.opacity = on ? "0.7" : "";
    submitBtn.textContent = on ? "Uploading spot..." : "Save spot";
  };

  // Initial state (one unit row, timestamp, nonce)
  unitsContainer.appendChild(createUnitRow());
  setNowTimestamp();
  setNonce();

  // ===== BFCACHE RESTORE =====
  // Pressing Back after a successful save can restore this page from the
  // back-forward cache, frozen mid-submit: sheet open, form filled, and
  // isSubmitting=true (which blocks closeSheet). Reset everything.
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    isSubmitting = false;
    resetForm();
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
    backdrop.classList.remove("visible");
    document.body.style.overflow = "";
  });

  // ===== OPEN / CLOSE =====
  const openSheet = () => {
    lastFocused = document.activeElement;
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
    backdrop.classList.add("visible");
    document.body.style.overflow = "hidden";
    sheet.scrollTop = 0;

    loadLibs()
      .then(() => initMap())
      .catch(() => {
        // Map libs failed (offline?) — form still usable without location
        console.warn("Map libraries failed to load");
      });
  };

  const closeSheet = () => {
    if (isSubmitting) return; // don't let the sheet vanish mid-upload
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
    backdrop.classList.remove("visible");
    document.body.style.overflow = "";
    lastFocused?.focus?.();
    lastFocused = null;
  };

  document.querySelectorAll(".js-open-spot-sheet").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openSheet();
    });
  });

  document
    .getElementById("spot-sheet-close")
    ?.addEventListener("click", closeSheet);
  backdrop.addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sheet.classList.contains("open")) closeSheet();
  });

  // ===== SUBMIT (fetch + redirect) =====
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const title = document.getElementById("ss-title");
    const timestamp = document.getElementById("ss-timestamp");
    const unitInputs = form.querySelectorAll("input[name='unit_number']");

    if (!title.value.trim()) return toast.warning("Please enter a spot title");
    if (!timestamp.value) return toast.warning("Please select a date and time");
    if (!Array.from(unitInputs).some((u) => u.value.trim()))
      return toast.warning("Please add at least one unit number");

    setSubmitting(true);
    toast.info("Uploading your spot...");

    try {
      const res = await fetch("/spots", {
        method: "POST",
        body: new FormData(form),
        credentials: "include",
        headers: { "X-Requested-With": "fetch" },
      });

      if (res.status === 401) {
        toast.error("Your session has expired — taking you to login.");
        setTimeout(() => (window.location.href = "/login"), 1500);
        return;
      }

      const data = await res.json().catch(() => null);

      if (res.ok && data?.success && data.spotId) {
        // Flag for the show page to fire the success toast on arrival
        sessionStorage.setItem("spotCreated", "1");
        window.location.href = `/spots/${data.spotId}`;
        return; // keep button disabled while navigating
      }

      toast.error(data?.error || "Failed to save spot — please try again.");
      setSubmitting(false);
    } catch (err) {
      console.error("Spot submit error:", err);
      toast.error("Network error — your spot was not saved. Please try again.");
      setSubmitting(false);
    }
  });
});
