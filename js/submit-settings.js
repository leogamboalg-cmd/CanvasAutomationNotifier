const form = document.getElementById("setup-form");
const canvasUrlInput = document.getElementById("canvas-url");
const ntfyTopicInput = document.getElementById("ntfy-topic");
const passcodeInput = document.getElementById("passcode");
const summaryCanvas = document.getElementById("summary-canvas");
const summaryTopic = document.getElementById("summary-topic");
const formStatus = document.getElementById("form-status");
const successOverlay = document.getElementById("success-overlay");
const successMessage = document.getElementById("success-message");
const successCloseButtons = document.querySelectorAll("[data-close-success]");
const deleteForm = document.getElementById("delete-form");
const deleteNtfyTopicInput = document.getElementById("delete-ntfy-topic");
const deletePasscodeInput = document.getElementById("delete-passcode");
const deleteFormStatus = document.getElementById("delete-form-status");
const confirmOverlay = document.getElementById("confirm-overlay");
const confirmMessage = document.getElementById("confirm-message");
const confirmAcceptButton = document.getElementById("confirm-accept");
const confirmCloseButtons = document.querySelectorAll("[data-close-confirm]");

// local dev = localhost / 127.0.0.1
// production = same domain the site is hosted on
const API_BASE =
  window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://canvasautomationnotifier.onrender.com";

function getSuccessMessage(message) {
  if (typeof message !== "string") {
    return "Action completed successfully.";
  }

  const normalizedMessage = message.trim();

  if (!normalizedMessage || normalizedMessage.toLowerCase() === "ok") {
    return "Action completed successfully.";
  }

  return normalizedMessage;
}

function buildPreviewPayload() {
  return {
    canvas_url: canvasUrlInput?.value.trim() || "",
    ntfy_topic: ntfyTopicInput?.value.trim() || "",
    pass_code: passcodeInput?.value.trim() || "",
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

function showSuccessOverlay(message, title = "Success") {
  if (!successOverlay || !successMessage) return;

  const successTitle = document.getElementById("success-title");

  if (successTitle) {
    successTitle.textContent = title;
  }

  successMessage.textContent = getSuccessMessage(message);
  successOverlay.classList.add("is-visible");
  successOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("overlay-open");
}

function renderPreview() {
  const {
    canvas_url: canvasUrl,
    ntfy_topic: ntfyTopic,
    pass_code: passCode,
  } = buildPreviewPayload();

  if (summaryCanvas) {
    summaryCanvas.textContent =
      canvasUrl || "Add your Canvas calendar link above.";
  }

  if (summaryTopic) {
    summaryTopic.textContent = ntfyTopic || "Choose a topic name above.";
  }
}

if (form && canvasUrlInput && ntfyTopicInput && passcodeInput && formStatus) {
  renderPreview();
  canvasUrlInput.addEventListener("input", renderPreview);
  ntfyTopicInput.addEventListener("input", renderPreview);
  successCloseButtons.forEach((button) => {
    button.addEventListener("click", hideSuccessOverlay);
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      successOverlay?.classList.contains("is-visible")
    ) {
      hideSuccessOverlay();
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const {
      canvas_url: canvasUrl,
      ntfy_topic: ntfyTopic,
      pass_code: passCode,
    } = buildPreviewPayload();

    if (!canvasUrl || !ntfyTopic || !passCode) {
      formStatus.textContent =
        "Enter both the Canvas URL, ntfy topic, and passcode.";
      return;
    }

    const passCodeError = validatePassCode(passCode);

    if (passCodeError) {
      formStatus.textContent = passCodeError;
      return;
    }

    formStatus.textContent = "Submitting...";

    try {
      const response = await fetch(`${API_BASE}/api/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          canvas_url: canvasUrl,
          ntfy_topic: ntfyTopic,
          pass_code: passCode,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.error || `Request failed with status ${response.status}`,
        );
      }

      formStatus.textContent = "";
      form.reset();
      renderPreview();
      showSuccessOverlay(data?.message, "Settings launched.");
    } catch (error) {
      formStatus.textContent =
        error.message ||
        "Could not submit settings. Check the backend URL and try again.";
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
      throw new Error(
        data?.error || `Request failed with status ${response.status}`,
      );
    }

    console.log("Waking up server");
  } catch (error) {
    console.error("Could not wake up server");
  }
});

if (deleteForm && deleteNtfyTopicInput && deletePasscodeInput && deleteFormStatus) {
  deleteForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const ntfyTopic = deleteNtfyTopicInput.value.trim();
    const passCode = deletePasscodeInput.value.trim();

    const topicError = validateNtfyTopic(ntfyTopic);
    if (topicError) {
      deleteFormStatus.textContent = topicError;
      return;
    }

    const passCodeError = validatePassCode(passCode);
    if (passCodeError) {
      deleteFormStatus.textContent = passCodeError;
      return;
    }

    showConfirmOverlay(
      "Delete your reminder setup? This cannot be undone.",
      async () => {
        deleteFormStatus.textContent = "Deleting...";

        try {
          const response = await fetch(`${API_BASE}/api/delete`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ntfy_topic: ntfyTopic,
              pass_code: passCode,
            }),
          });

          const data = await response.json().catch(() => null);

          if (!response.ok) {
            throw new Error(
              data?.error || `Request failed with status ${response.status}`
            );
          }

          deleteFormStatus.textContent = "";
          deleteForm.reset();

          showSuccessOverlay(
            data?.message || "Reminder setup deleted successfully.",
            "Setup removed."
          );
        } catch (error) {
          deleteFormStatus.textContent =
            error.message || "Could not delete reminder setup.";
          console.error("Delete failed:", error);
        }
      }
    );
  });
}

function validateNtfyTopic(value) {
  if (typeof value !== "string") {
    return "Topic must be a string.";
  }

  const topic = value.trim();

  if (!topic) {
    return "Enter your ntfy topic.";
  }

  if (topic.length < 3 || topic.length > 64) {
    return "Topic must be 3 to 64 characters.";
  }

  if (!/^[A-Za-z0-9_-]+$/.test(topic)) {
    return "Topic can only use letters, numbers, hyphens, and underscores.";
  }

  return "";
}

function validatePassCode(value) {
  if (typeof value !== "string") {
    return "Passcode must be a string.";
  }

  const passCode = value.trim();

  if (!passCode) {
    return "Enter a passcode.";
  }

  if (passCode.length < 6 || passCode.length > 64) {
    return "Passcode must be 6 to 64 characters.";
  }

  const hasLetter = /[A-Za-z]/.test(passCode);
  const hasNumber = /[0-9]/.test(passCode);

  if (!hasLetter || !hasNumber) {
    return "Passcode must include at least one letter and one number.";
  }

  return "";
}

let confirmAction = null;

function hideConfirmOverlay() {
  if (!confirmOverlay) {
    return;
  }

  confirmOverlay.classList.remove("is-visible");
  confirmOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("overlay-open");
  confirmAction = null;
}

function showConfirmOverlay(message, onConfirm) {
  if (!confirmOverlay || !confirmMessage) {
    return;
  }

  confirmMessage.textContent = message;
  confirmAction = onConfirm;

  confirmOverlay.classList.add("is-visible");
  confirmOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("overlay-open");
}

confirmCloseButtons.forEach((button) => {
  button.addEventListener("click", hideConfirmOverlay);
});

confirmAcceptButton?.addEventListener("click", async () => {
  if (typeof confirmAction === "function") {
    await confirmAction();
  }

  hideConfirmOverlay();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (confirmOverlay?.classList.contains("is-visible")) {
    hideConfirmOverlay();
    return;
  }

  if (successOverlay?.classList.contains("is-visible")) {
    hideSuccessOverlay();
  }
});