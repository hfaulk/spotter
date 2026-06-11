// public/js/spot-show.js
document.addEventListener("DOMContentLoaded", () => {
  // ===== CREATION SUCCESS TOAST =====
  // Set by spot-sheet.js right before navigating here after a successful save
  if (sessionStorage.getItem("spotCreated")) {
    sessionStorage.removeItem("spotCreated");
    toast.success("Spot created successfully!");
  }

  // ===== MAP INITIALIZATION =====
  const mapEl = document.getElementById("spot-map");
  if (mapEl) {
    const lat = parseFloat(mapEl.dataset.lat);
    const lon = parseFloat(mapEl.dataset.lon);
    const map = new maplibregl.Map({
      container: "spot-map",
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [lon, lat],
      zoom: 14,
    });
    map.on("load", () => {
      new maplibregl.Marker().setLngLat([lon, lat]).addTo(map);
    });
  }

  // ===== COPY SHARE & DYNAMIC URL =====
  const copyBtn = document.getElementById("copy-share");
  const shareUrl = document.getElementById("share-url");

  if (shareUrl && shareUrl.dataset.token) {
    shareUrl.textContent = `${window.location.origin}/s/${shareUrl.dataset.token}`;
  }

  const fallbackCopy = (text) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  };

  copyBtn?.addEventListener("click", () => {
    const url = shareUrl.textContent.trim();
    const onSuccess = () => {
      toast.success("Link copied to clipboard!");
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy"), 2000);
    };

    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(url)
        .then(onSuccess)
        .catch(() => {
          fallbackCopy(url);
          onSuccess();
        });
    } else {
      fallbackCopy(url);
      onSuccess();
    }
  });

  // ===== THREE DOTS MENU =====
  const menuTrigger = document.getElementById("spot-menu-trigger");
  const menuDropdown = document.getElementById("spot-menu-dropdown");

  menuTrigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle("open");
  });

  document.addEventListener("click", () =>
    menuDropdown?.classList.remove("open"),
  );

  // ===== DELETE =====
  const deleteBtn = document.getElementById("delete-btn");
  deleteBtn?.addEventListener("click", () => {
    if (!confirm("Are you sure? This cannot be undone.")) return;

    const spotId = deleteBtn.dataset.spotId;
    if (!spotId) return;

    toast.info("Deleting...");
    fetch(`/spots/${spotId}`, { method: "DELETE" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          toast.success("Spot deleted!");
          setTimeout(() => {
            window.location.href = "/profile";
          }, 600);
        } else {
          toast.error(
            data.error || "Failed to delete spot — please try again.",
          );
        }
      })
      .catch((err) => {
        toast.error("Network error — could not delete spot.");
        console.error("Delete error:", err);
      });
  });
});
