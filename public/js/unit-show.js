// public/js/unit-show.js
document.addEventListener("DOMContentLoaded", () => {
  const wikiCard = document.getElementById("wiki-card");
  if (!wikiCard) return;

  const unitClass = wikiCard.dataset.unitClass;

  if (unitClass) {
    const classNum = unitClass.replace(/[^0-9]/g, "");
    const wikiTitle = classNum ? `British_Rail_Class_${classNum}` : null;

    if (wikiTitle) {
      fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${wikiTitle}`)
        .then((res) => res.json())
        .then((data) => {
          const imgSrc = data.originalimage?.source || data.thumbnail?.source;

          if (imgSrc) {
            const heroImg = document.getElementById("unit-hero-img");
            const heroBg = document.getElementById("unit-hero-bg");
            const placeholder = document.getElementById(
              "unit-hero-placeholder",
            );

            if (heroImg && heroBg && placeholder) {
              heroImg.src = imgSrc;
              heroImg.style.display = "block";
              heroBg.style.backgroundImage = `url('${imgSrc}')`;
              heroBg.style.display = "block";
              placeholder.style.display = "none";
            }
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
        .catch((err) => console.error("Wiki fetch error:", err));
    }
  }
});
