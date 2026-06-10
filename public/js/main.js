// public/js/main.js
document.addEventListener("DOMContentLoaded", () => {
  // Global handler for all back buttons
  document.querySelectorAll(".js-back-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      history.back();
    });
  });
});
