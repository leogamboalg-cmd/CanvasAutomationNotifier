const form = document.getElementById("setup-form");
const canvasUrlInput = document.getElementById("canvas-url");
const ntfyTopicInput = document.getElementById("ntfy-topic");
const formStatus = document.getElementById("form-status");

// Detect environment (local vs deployed)
const API_BASE =
  window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://your-backend-domain.com"; // <-- CHANGE THIS

if (form && canvasUrlInput && ntfyTopicInput && formStatus) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const canvasUrl = canvasUrlInput.value.trim();
    const ntfyTopic = ntfyTopicInput.value.trim();

    if (!canvasUrl || !ntfyTopic) {
      formStatus.textContent = "Enter both the Canvas URL and ntfy topic.";
      return;
    }

    formStatus.textContent = "Submitting...";

    try {
      const response = await fetch(`${API_BASE}/api/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          canvas_url: canvasUrl,
          ntfy_topic: ntfyTopic
        })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || `Request failed with status ${response.status}`);
      }

      formStatus.textContent = data?.message || "Settings submitted successfully.";
      form.reset();
    } catch (error) {
      formStatus.textContent = "Could not submit settings. Check the backend URL and try again.";
      console.error("Submit failed:", error);
    }
  });
}