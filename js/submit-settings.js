const form = document.getElementById("setup-form");
const canvasUrlInput = document.getElementById("canvas-url");
const ntfyTopicInput = document.getElementById("ntfy-topic");
const summaryCanvas = document.getElementById("summary-canvas");
const summaryTopic = document.getElementById("summary-topic");
const formStatus = document.getElementById("form-status");
const successOverlay = document.getElementById("success-overlay");
const successMessage = document.getElementById("success-message");
const successCloseButtons = document.querySelectorAll("[data-close-success]");

// local dev = localhost / 127.0.0.1
// production = same domain the site is hosted on
const API_BASE =
  window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://canvasautomationnotifier.onrender.com";

function getSuccessMessage(message) {
  if (typeof message !== "string") {
    return "Settings submitted successfully.";
  }

  const normalizedMessage = message.trim();

  if (!normalizedMessage || normalizedMessage.toLowerCase() === "ok") {
    return "Settings submitted successfully.";
  }

  return normalizedMessage;
}

function buildPreviewPayload() {
  return {
    canvas_url: canvasUrlInput?.value.trim() || "",
    ntfy_topic: ntfyTopicInput?.value.trim() || ""
  };
}

function hideSuccessOverlay() {
  if (!successOverlay) {
    return;
  }

  successOverlay.classList.remove("is-visible");
  successOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("overlay-open");
}

function showSuccessOverlay(message) {
  if (!successOverlay || !successMessage) {
    return;
  }

  successMessage.textContent = getSuccessMessage(message);
  successOverlay.classList.add("is-visible");
  successOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("overlay-open");
}

function renderPreview() {
  const { canvas_url: canvasUrl, ntfy_topic: ntfyTopic } = buildPreviewPayload();

  if (summaryCanvas) {
    summaryCanvas.textContent = canvasUrl || "Add your Canvas calendar link above.";
  }

  if (summaryTopic) {
    summaryTopic.textContent = ntfyTopic || "Choose a topic name above.";
  }
}

if (form && canvasUrlInput && ntfyTopicInput && formStatus) {
  renderPreview();
  canvasUrlInput.addEventListener("input", renderPreview);
  ntfyTopicInput.addEventListener("input", renderPreview);
  successCloseButtons.forEach((button) => {
    button.addEventListener("click", hideSuccessOverlay);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && successOverlay?.classList.contains("is-visible")) {
      hideSuccessOverlay();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const { canvas_url: canvasUrl, ntfy_topic: ntfyTopic } = buildPreviewPayload();

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

      formStatus.textContent = "";
      form.reset();
      renderPreview();
      showSuccessOverlay(data?.message);
    } catch (error) {
      formStatus.textContent = error.message || "Could not submit settings. Check the backend URL and try again.";
      console.error("Submit failed:", error);
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {

  try {
    const response = await fetch(`${API_BASE}/api/status`, {
      method: "GET",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error || `Request failed with status ${response.status}`);
    }

    console.log("Waking up server")
  } catch (error) {
    console.error("Could not wake up server");
  }
});
