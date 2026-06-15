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

  // ===== UPLOAD OVERLAY =====
  const MESSAGES = [
    "Logging your spot...",
    "Compressing your photo...",
    "Uploading to the cloud...",
    "Saving unit details...",
    "Almost there...",
    "Pinning to the map...",
    "Just a moment...",
    "Finishing up...",
  ];

  let overlayEl = null;
  let overlayBarEl = null;
  let overlayMsgEl = null;
  let msgIndex = 0;
  let msgTimer = null;
  let progressTimer = null;
  let currentProgress = 0;

  const buildOverlay = () => {
    if (overlayEl) return;
    overlayEl = document.createElement("div");
    overlayEl.className = "upload-overlay";
    overlayEl.innerHTML = `
      <div class="upload-overlay-inner">
        <div class="upload-overlay-dot">
          <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"
               fill="none" stroke="white" stroke-width="2.5"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10"/>
            <path d="M12 6v6l4 2"/>
          </svg>
        </div>
        <p class="upload-overlay-msg" id="upload-overlay-msg">${MESSAGES[0]}</p>
        <div class="upload-progress-track">
          <div class="upload-progress-bar" id="upload-progress-bar"></div>
        </div>
        <p class="upload-overlay-sub">This can take a while with large photos</p>
      </div>
    `;
    document.body.appendChild(overlayEl);
    overlayBarEl = document.getElementById("upload-progress-bar");
    overlayMsgEl = document.getElementById("upload-overlay-msg");
  };

  const setProgress = (pct) => {
    currentProgress = pct;
    if (overlayBarEl) overlayBarEl.style.width = `${pct}%`;
  };

  const nextMessage = () => {
    if (!overlayMsgEl) return;
    overlayMsgEl.classList.add("fade");
    setTimeout(() => {
      msgIndex = (msgIndex + 1) % MESSAGES.length;
      overlayMsgEl.textContent = MESSAGES[msgIndex];
      overlayMsgEl.classList.remove("fade");
    }, 300);
  };

  const showOverlay = () => {
    buildOverlay();
    msgIndex = 0;
    currentProgress = 0;
    if (overlayMsgEl) overlayMsgEl.textContent = MESSAGES[0];
    setProgress(0);

    // Show it
    requestAnimationFrame(() => overlayEl.classList.add("visible"));

    // Animate progress to ~85% over ~12s
    const STEPS = [
      { target: 15, delay: 400 },
      { target: 35, delay: 1800 },
      { target: 55, delay: 3500 },
      { target: 70, delay: 5500 },
      { target: 80, delay: 8000 },
      { target: 85, delay: 11000 },
    ];
    STEPS.forEach(({ target, delay }) => {
      progressTimer = setTimeout(() => setProgress(target), delay);
    });

    // Cycle through messages every 6s
    msgTimer = setInterval(nextMessage, 6000);
  };

  const hideOverlay = (success = false) => {
    clearInterval(msgTimer);
    clearTimeout(progressTimer);

    if (success) {
      setProgress(100);
      setTimeout(() => {
        if (overlayEl) overlayEl.classList.remove("visible");
      }, 350);
    } else {
      if (overlayEl) overlayEl.classList.remove("visible");
    }
  };

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
      l.onerror = resolve;
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

  const initMap = () => {
    if (map) {
      map.resize();
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
      ?.addEventListener("click", async (e) => {
        e.preventDefault();
        isSatellite = !isSatellite;
        document
          .getElementById("ss-map-toggle-btn")
          .classList.toggle("active", isSatellite);
        map.setStyle(isSatellite ? await getHybridStyle() : streetStyle);
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
      await loadLibs();
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
          <input type="text" name="unit_number" placeholder="47805" required inputmode="numeric" pattern="[0-9]*" autocomplete="off" spellcheck="false" />
        </div>
        <div class="field">
          <label>Class</label>
          <input type="text" name="unit_class" placeholder="Class 47" readonly />
        </div>
        <div class="field">
          <label>Operator</label>
          <div id="ss-operator-container">
            <select name="unit_operator" id="ss-operator-select" disabled>
              <option value="">Enter unit number first...</option>
            </select>
          </div>
        </div>
      </div>
      <button type="button" class="btn-remove-unit" aria-label="Remove unit">✕</button>
    `;

    setupAutoFill(row);

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

  const clearPhotoUI = () => {
    const photoInput = document.getElementById("ss-photo");
    if (photoInput) photoInput.value = "";

    const preview = document.getElementById("ss-photo-preview");
    if (preview) {
      preview.style.display = "none";
      preview.src = "";
    }

    const labelText = document.getElementById("ss-photo-label-text");
    if (labelText) labelText.textContent = "Add a photo";

    const exifPanel = document.getElementById("ss-exif-panel");
    if (exifPanel) exifPanel.style.display = "none";

    ["camera", "shutter", "aperture", "iso", "focal"].forEach((k) => {
      const el = document.getElementById(`ss-exif-${k}`);
      if (el) el.textContent = "—";
    });
  };

  const resetForm = () => {
    form.reset();
    unitsContainer.innerHTML = "";
    unitsContainer.appendChild(createUnitRow());
    clearLocation();
    clearPhotoUI();
    setNowTimestamp();
    setNonce();
    setSubmitting(false);
  };

  const setSubmitting = (on) => {
    isSubmitting = on;
    submitBtn.disabled = on;
    submitBtn.style.opacity = on ? "0.7" : "";
    submitBtn.textContent = on ? "Uploading..." : "Save spot";
  };

  // Initial state
  unitsContainer.appendChild(createUnitRow());
  setNowTimestamp();
  setNonce();

  // ===== BFCACHE RESTORE =====
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    isSubmitting = false;
    hideOverlay(false);
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
        console.warn("Map libraries failed to load");
      });
  };

  const closeSheet = () => {
    if (isSubmitting) return;
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
    backdrop.classList.remove("visible");
    document.body.style.overflow = "";
    lastFocused?.focus?.();
    lastFocused = null;

    // NEW: Silently reset the form *after* the CSS slide-down animation completes (300ms)
    setTimeout(() => {
      resetForm();
    }, 300);
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
    showOverlay();

    try {
      const res = await fetch("/spots", {
        method: "POST",
        body: new FormData(form),
        credentials: "include",
        headers: { "X-Requested-With": "fetch" },
      });

      if (res.status === 401) {
        hideOverlay(false);
        setSubmitting(false);
        toast.error("Your session has expired — please log in again.");
        setTimeout(() => (window.location.href = "/login"), 1800);
        return;
      }

      const data = await res.json().catch(() => null);

      if (res.ok && data?.success && data.spotId) {
        hideOverlay(true);
        sessionStorage.setItem("spotCreated", "1");
        // Brief pause so the progress bar reaches 100% visually
        setTimeout(() => {
          window.location.href = `/spots/${data.spotId}`;
        }, 400);
        return;
      }

      // Server returned an error response
      hideOverlay(false);
      setSubmitting(false);

      const message = data?.error || "Failed to save spot — please try again.";
      toast.error(message, 8000); // longer duration so it's readable

      // AI Moderation Hook: clear the rejected photo but keep the text
      if (
        message.toLowerCase().includes("flagged") ||
        message.toLowerCase().includes("safety filters")
      ) {
        clearPhotoUI();
      }
    } catch (err) {
      console.error("Spot submit error:", err);
      hideOverlay(false);
      setSubmitting(false);
      toast.error("Network error — check your connection and try again.", 8000);
    }
  });
});

const setupAutoFill = (row) => {
  const numberInput = row.querySelector("input[name='unit_number']");
  const classInput = row.querySelector("input[name='unit_class']");
  const opContainer = row.querySelector("#ss-operator-container");

  numberInput.addEventListener("input", () => {
    clearTimeout(numberInput.dataset.timer);
    numberInput.dataset.timer = setTimeout(async () => {
      const val = numberInput.value.trim();

      // 1. Reset state if input is cleared or too short
      if (val.length < 3) {
        classInput.value = "";
        classInput.readOnly = false;
        opContainer.innerHTML = `
          <select name="unit_operator" id="ss-operator-select" disabled>
            <option value="">Enter unit number first...</option>
          </select>`;
        return;
      }

      const response = await fetch("/data/roster.json");
      const roster = await response.json();
      const classes = Object.keys(roster).sort((a, b) => b.length - a.length);

      const matchKey = classes.find((key) =>
        val.startsWith(key.replace("Class ", "")),
      );

      if (matchKey && roster[matchKey].operators?.length > 0) {
        // MATCH FOUND: Set class (read-only) and populate dropdown
        classInput.value = matchKey;
        classInput.readOnly = true;

        const options = roster[matchKey].operators
          .map((op) => {
            // Converts "rail_operations_group" to "RAIL OPERATIONS GROUP"
            const label = op.toUpperCase().replace(/_/g, " ");
            return `<option value="${op}">${label}</option>`;
          })
          .join("");

        opContainer.innerHTML = `<select name="unit_operator" id="ss-operator-select" required>${options}</select>`;
      } else {
        // NO MATCH FOUND: Unlock class for manual entry and provide text input
        classInput.readOnly = false;
        opContainer.innerHTML = `<input type="text" name="unit_operator" placeholder="Enter operator" required />`;
      }
    }, 300);
  });
};
