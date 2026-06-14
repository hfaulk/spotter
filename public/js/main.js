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

document.addEventListener("submit", (e) => {
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');

  if (submitBtn && !form.dataset.submitting) {
    // Mark form to prevent duplicate event triggers
    form.dataset.submitting = "true";

    // Save original dimensions to prevent button collapsing/shifting
    const rect = submitBtn.getBoundingClientRect();
    submitBtn.style.width = `${rect.width}px`;
    submitBtn.style.height = `${rect.height}px`;

    // Disable button and change state
    submitBtn.disabled = true;
    submitBtn.style.opacity = "0.7";
    submitBtn.style.cursor = "wait";
    submitBtn.innerHTML = `
      <svg class="spinner" viewBox="0 0 50 50" style="width: 20px; height: 20px; animation: spin 1s linear infinite; vertical-align: middle; margin-right: 8px;">
        <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="31.4 31.4" stroke-linecap="round"></circle>
      </svg>
      Saving...
    `;

    // Add a simple keyframe animation for the spinner if it doesn't exist
    if (!document.getElementById("spinner-style")) {
      const style = document.createElement("style");
      style.id = "spinner-style";
      style.innerHTML = `@keyframes spin { 100% { transform: rotate(360deg); } }`;
      document.head.appendChild(style);
    }
  }
});
