// public/js/unit-show.js
document.addEventListener("DOMContentLoaded", () => {
  const hero = document.getElementById("unit-hero");
  const wikiCard = document.getElementById("wiki-card");

  const stopShimmer = () => hero?.classList.remove("img-loading-dark");

  if (!wikiCard) {
    stopShimmer();
    return;
  }

  const unitClass = wikiCard.dataset.unitClass;

  if (!unitClass) {
    stopShimmer();
    return;
  }

  const classNum = unitClass.replace(/[^0-9]/g, "");
  // Backend proxy expects just the number, not the full title
  if (!classNum) {
    stopShimmer();
    return;
  }

  // Changed to use the backend proxy to prevent exposing client IP to Wikipedia and fix CSP
  fetch(`/api/wiki/${classNum}`)
    .then((res) => {
      if (!res.ok) throw new Error("Wiki API error");
      return res.json();
    })
    .then((data) => {
      const imgSrc = data.originalimage?.source || data.thumbnail?.source;

      if (imgSrc) {
        const heroImg = document.getElementById("unit-hero-img");
        const heroBg = document.getElementById("unit-hero-bg");
        const placeholder = document.getElementById("unit-hero-placeholder");

        if (heroImg && heroBg && placeholder) {
          heroImg.onload = () => stopShimmer();
          heroImg.onerror = () => stopShimmer();
          heroImg.src = imgSrc;
          heroImg.style.display = "block";
          heroBg.style.backgroundImage = `url('${imgSrc}')`;
          heroBg.style.display = "block";
          placeholder.style.display = "none";
        }
      } else {
        // No image available — stop shimmer so the placeholder shows cleanly
        stopShimmer();
      }

      if (data.extract) {
        wikiCard.style.display = "flex";
        const wikiContent = document.getElementById("wiki-content");
        if (wikiContent) {
          wikiContent.innerHTML = `
               <p style="font-size:0.9rem; color:#333; line-height:1.6;">${data.extract}</p>
               <a href="${data.content_urls?.desktop?.page}" target="_blank" rel="noopener"
                 style="font-size:0.8rem; color:midnightblue;">Read more on Wikipedia →</a>
             `;
        }
      }
    })
    .catch((err) => {
      console.error("Wiki fetch error:", err);
      stopShimmer();
    });
});
