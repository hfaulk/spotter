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

// ===== GLOBAL REPORT / SUPPORT MODAL =====
window.openReportModal = (reference, type) => {
  // Remove existing modal if somehow double-clicked
  document.getElementById("report-modal")?.remove();

  // Determine phrasing based on the type
  const isSupport = type === "private";
  const title = isSupport ? "Contact Support" : "Report Content";
  const desc = isSupport
    ? "Need help with this spot? Let us know."
    : "Please let us know why this content should be reviewed.";
  const btnText = isSupport ? "Send Message" : "Submit Report";
  const btnColor = isSupport ? "#2563eb" : "#ef4444";

  // Create the modal container
  const modal = document.createElement("div");
  modal.id = "report-modal";
  modal.innerHTML = `
      <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 1rem; backdrop-filter: blur(2px);">
          <div style="background: white; border-radius: 12px; padding: 24px; width: 100%; max-width: 400px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
              <h3 style="margin-top: 0; margin-bottom: 8px; color: #0f172a; font-size: 1.25rem;">${title}</h3>
              <p style="margin-top: 0; margin-bottom: 16px; color: #64748b; font-size: 0.875rem;">${desc}</p>
              <textarea id="report-reason" rows="4" style="width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 16px; font-family: inherit; font-size: 0.95rem; resize: vertical;" placeholder="Type your message here..."></textarea>
              <div style="display: flex; gap: 12px; justify-content: flex-end;">
                  <button id="cancel-report" style="padding: 8px 16px; border: none; background: transparent; color: #64748b; font-weight: 500; cursor: pointer; font-size: 0.95rem;">Cancel</button>
                  <button id="submit-report" style="padding: 8px 16px; border: none; background: ${btnColor}; color: white; border-radius: 6px; font-weight: 500; cursor: pointer; font-size: 0.95rem; transition: opacity 0.2s;">${btnText}</button>
              </div>
          </div>
      </div>
  `;
  document.body.appendChild(modal);

  // Close logic
  const closeModal = () => modal.remove();
  document
    .getElementById("cancel-report")
    .addEventListener("click", closeModal);

  // Submit logic
  const submitBtn = document.getElementById("submit-report");
  submitBtn.addEventListener("click", async () => {
    const reason = document.getElementById("report-reason").value.trim();
    if (!reason) return toast.error("Please provide some details");

    // UI Loading state
    submitBtn.disabled = true;
    submitBtn.style.opacity = "0.7";
    submitBtn.textContent = "Sending...";

    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, type, reason }),
      });

      if (!res.ok) throw new Error();

      toast.success("Message sent successfully");
      closeModal();
    } catch (err) {
      toast.error("Failed to send message. Please try again.");
      submitBtn.disabled = false;
      submitBtn.style.opacity = "1";
      submitBtn.textContent = btnText;
    }
  });
};
