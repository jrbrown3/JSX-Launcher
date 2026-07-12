(() => {
  const fileInput = document.getElementById("file-input");
  const pickBtn = document.getElementById("pick-btn");
  const reloadBtn = document.getElementById("reload-btn");
  const fileNameEl = document.getElementById("file-name");
  const dropzone = document.getElementById("dropzone");
  const frame = document.getElementById("sandbox-frame");
  const errorPanel = document.getElementById("error-panel");
  const errorTitle = document.getElementById("error-title");
  const errorDetail = document.getElementById("error-detail");

  let currentFile = null;   // File handle for "Reload file"
  let sandboxReady = false;
  let pendingSource = null;

  // ---- picking ----
  pickBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) loadFile(fileInput.files[0]);
    fileInput.value = ""; // allow re-picking the same file
  });

  reloadBtn.addEventListener("click", () => {
    if (currentFile) loadFile(currentFile);
  });

  // ---- drag & drop (works on the whole page) ----
  ["dragenter", "dragover"].forEach((evt) =>
    document.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragging");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    document.addEventListener(evt, (e) => {
      e.preventDefault();
      if (evt === "drop" || e.target === document.documentElement) {
        dropzone.classList.remove("dragging");
      }
    })
  );
  document.addEventListener("drop", (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    if (!/\.(jsx|js)$/i.test(file.name)) {
      showError("Unsupported file", `"${file.name}" is not a .jsx or .js file.`);
      return;
    }
    loadFile(file);
  });

  // ---- load + send to sandbox ----
  function loadFile(file) {
    currentFile = file;
    fileNameEl.textContent = file.name;
    reloadBtn.hidden = false;
    hideError();

    const reader = new FileReader();
    reader.onerror = () => showError("Read failed", "Could not read the selected file.");
    reader.onload = () => sendToSandbox(String(reader.result), file.name);
    reader.readAsText(file);
  }

  function sendToSandbox(source, name) {
    dropzone.hidden = true;
    frame.hidden = false;
    const msg = { type: "render-jsx", source, name };
    if (sandboxReady) {
      frame.contentWindow.postMessage(msg, "*");
    } else {
      pendingSource = msg;
    }
  }

  // ---- messages from sandbox ----
  window.addEventListener("message", (e) => {
    if (e.source !== frame.contentWindow || !e.data) return;
    const { type } = e.data;

    if (type === "sandbox-ready") {
      sandboxReady = true;
      if (pendingSource) {
        frame.contentWindow.postMessage(pendingSource, "*");
        pendingSource = null;
      }
    } else if (type === "render-ok") {
      hideError();
      if (e.data.warnings && e.data.warnings.length) {
        showError("Rendered with warnings", e.data.warnings.join("\n"), true);
      }
    } else if (type === "render-error") {
      showError(e.data.stage || "Error", e.data.message || "Unknown error");
    }
  });

  // ---- error panel ----
  function showError(title, detail, isWarning) {
    errorTitle.textContent = title;
    errorTitle.style.color = isWarning ? "#f5c542" : "";
    errorPanel.style.borderColor = isWarning ? "#f5c542" : "";
    errorDetail.textContent = detail;
    errorPanel.hidden = false;
  }
  function hideError() {
    errorPanel.hidden = true;
  }
})();
