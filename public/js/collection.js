// public/js/collection.js
// Unit Collection (§19): wiki images on the class cards + the class
// detail overlay sheet (bottom sheet on mobile, side panel on desktop).
document.addEventListener("DOMContentLoaded", () => {
  const classes = window.SPOTTER_COLLECTION || [];

  const sheet = document.getElementById("class-sheet");
  const backdrop = document.getElementById("class-sheet-backdrop");
  const content = document.getElementById("class-sheet-content");
  if (!sheet || !backdrop || !content) return;

  sheet.setAttribute("tabindex", "-1"); // focusable for a11y
  let lastFocused = null;

  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  // ===== WIKIPEDIA (cached per class) =====
  const wikiCache = {};
  const fetchWiki = (classNum) => {
    if (!classNum) return Promise.resolve(null);
    if (wikiCache[classNum]) return wikiCache[classNum];

    wikiCache[classNum] = fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/British_Rail_Class_${classNum}`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) =>
        data
          ? {
              thumb:
                data.thumbnail?.source || data.originalimage?.source || null,
              original: data.originalimage?.source || null,
              originalWidth: data.originalimage?.width || 0,
              extract: data.extract || null,
              url: data.content_urls?.desktop?.page || null,
            }
          : null,
      )
      .catch(() => null);

    return wikiCache[classNum];
  };

  // Hero image: the API thumb is ~320px and looks soft at hero size.
  // Wikimedia rejects (400) any rendition request wider than the original,
  // so only ask for a 640px rendition when the original is genuinely wider;
  // otherwise just use the original image itself. No probing, no failed
  // requests in the console.
  const setHeroImage = (heroEl, info) => {
    if (!heroEl || !info?.thumb) return;

    let src = info.thumb;
    if (info.originalWidth > 640 && /\/\d+px-/.test(info.thumb)) {
      src = info.thumb.replace(/\/\d+px-/, "/640px-");
    } else if (info.original) {
      src = info.original;
    }

    heroEl.style.backgroundImage = `url('${src}')`;
    heroEl.classList.remove("class-sheet-hero-empty");
  };

  // ===== CLASS CARD IMAGES (lazy — the grid is ~60 cards now) =====
  const loadCardImage = (card) => {
    const num = card.dataset.classNum;
    if (!num) return;
    fetchWiki(num).then((info) => {
      if (info?.thumb) {
        const imgEl = card.querySelector(".class-card-img");
        if (imgEl) {
          imgEl.style.backgroundImage = `url('${info.thumb}')`;
          imgEl.classList.add("has-img");
        }
      }
    });
  };

  const cards = document.querySelectorAll(".class-card");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          obs.unobserve(entry.target);
          loadCardImage(entry.target);
        });
      },
      { rootMargin: "200px" },
    );
    cards.forEach((card) => io.observe(card));
  } else {
    cards.forEach(loadCardImage);
  }

  // ===== SHEET OPEN / CLOSE =====
  const closeSheet = () => {
    sheet.classList.remove("open");
    backdrop.classList.remove("visible");
    document.body.style.overflow = "";
    lastFocused?.focus?.();
    lastFocused = null;
  };

  const buildUnitTiles = (cls) => {
    const spotted = cls.units
      .map(
        (u) => `
        <a href="${u.latest_spot_id ? `/spots/${esc(u.latest_spot_id)}` : `/units/${esc(u.unit_id)}`}" class="unit-tile">
          ${
            u.image
              ? `<img src="${esc(u.image)}" alt="${esc(u.unit_number)}" loading="lazy" />`
              : `<div class="unit-tile-noimg"></div>`
          }
          <span class="unit-tile-number">${esc(u.unit_number)}</span>
        </a>`,
      )
      .join("");

    // Greyed-out "?" tiles for the units you haven't spotted yet.
    // Capped: up to 6 tiles, the last becomes "+N" when there are more.
    let grey = "";
    if (cls.total != null) {
      const remaining = Math.max(cls.total - cls.spotted, 0);
      const showQ = remaining > 6 ? 5 : Math.min(remaining, 6);
      for (let i = 0; i < showQ; i++) {
        grey += `<div class="unit-tile unit-tile-grey"><span>?</span></div>`;
      }
      if (remaining > showQ) {
        grey += `<div class="unit-tile unit-tile-grey unit-tile-more"><span>+${remaining - showQ}</span></div>`;
      }
    }

    return spotted + grey;
  };

  const openClass = (idx) => {
    const cls = classes[idx];
    if (!cls) return;

    const title = cls.classNum ? `Class ${cls.classNum}` : "Other units";
    const progressLabel =
      cls.total != null
        ? `${cls.spotted} of ${cls.total} spotted`
        : `${cls.spotted} spotted`;

    content.innerHTML = `
      <div class="class-sheet-hero class-sheet-hero-empty" id="class-sheet-hero"></div>
      <div class="class-sheet-body">
        <div class="class-sheet-header">
          <h2 class="class-sheet-title">${esc(title)}</h2>
          <span class="class-sheet-progress">${esc(progressLabel)}</span>
        </div>
        <p class="class-sheet-desc" id="class-sheet-desc" style="display:none;"></p>
        <div class="sheet-section">
          <p class="sheet-section-label">Your collection</p>
          <div class="unit-tile-grid">${buildUnitTiles(cls)}</div>
        </div>
      </div>
    `;

    lastFocused = document.activeElement;
    sheet.classList.add("open");
    backdrop.classList.add("visible");
    sheet.scrollTop = 0;
    document.body.style.overflow = "hidden"; // lock the page behind
    sheet.focus({ preventScroll: true });

    // Fill the wiki hero + description once it arrives
    fetchWiki(cls.classNum).then((info) => {
      if (!info) return;
      const hero = document.getElementById("class-sheet-hero");
      const desc = document.getElementById("class-sheet-desc");

      setHeroImage(hero, info);

      if (desc && info.extract) {
        desc.style.display = "block";
        desc.innerHTML = `${esc(info.extract)}${
          info.url
            ? ` <a href="${esc(info.url)}" target="_blank" rel="noopener">Read more →</a>`
            : ""
        }`;
      }
    });
  };

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      openClass(parseInt(card.dataset.classIndex, 10));
    });
  });

  backdrop.addEventListener("click", closeSheet);
  document
    .getElementById("class-sheet-handle")
    ?.addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSheet();
  });

  // ===== TOUCH: swipe-down to close, without scrolling the page behind =====
  let touchStartY = 0;
  let touchStartX = 0;

  sheet.addEventListener("touchstart", (e) => {
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
  });

  // When the sheet is scrolled to the top and the user keeps pulling down,
  // swallow the gesture so it can't chain to the page behind (map.js trick).
  sheet.addEventListener(
    "touchmove",
    (e) => {
      const diffY = e.touches[0].clientY - touchStartY;
      if (sheet.scrollTop === 0 && diffY > 0) e.preventDefault();
    },
    { passive: false },
  );

  sheet.addEventListener("touchend", (e) => {
    const diffY = e.changedTouches[0].clientY - touchStartY;
    const diffX = Math.abs(e.changedTouches[0].clientX - touchStartX);
    if (sheet.scrollTop === 0 && diffY > 80 && diffY > diffX) closeSheet();
  });
});
