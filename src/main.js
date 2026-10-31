import "./styles.css";

const MAX_COMFORTABLE_BYTES = 150 * 1024 * 1024;
const worker = new Worker(new URL("./pdf.worker.js", import.meta.url), { type: "module" });
const pending = new Map();
let requestSequence = 0;
let entries = [];
let draggedId = null;

const elements = {
  fileInput: document.querySelector("#file-input"),
  dropZone: document.querySelector("#drop-zone"),
  fileListWrap: document.querySelector("#file-list-wrap"),
  fileList: document.querySelector("#file-list"),
  fileSummary: document.querySelector("#file-summary"),
  addMore: document.querySelector("#add-more"),
  sizeWarning: document.querySelector("#size-warning"),
  mergeButton: document.querySelector("#merge-button"),
  actionHint: document.querySelector("#action-hint"),
  status: document.querySelector("#status"),
  themeToggle: document.querySelector("#theme-toggle"),
};

function syncThemeToggle() {
  const isDark = document.documentElement.classList.contains("dark");
  elements.themeToggle.setAttribute("aria-pressed", String(isDark));
  elements.themeToggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
}

elements.themeToggle.addEventListener("click", () => {
  const isDark = document.documentElement.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  syncThemeToggle();
});

syncThemeToggle();

worker.addEventListener("message", (event) => {
  const message = event.data;
  const request = pending.get(message.id);
  if (!request) return;

  if (message.progress) {
    request.onProgress?.(message.progress);
    return;
  }

  pending.delete(message.id);
  if (message.ok) request.resolve(message.result);
  else request.reject(new Error(message.error));
});

function askWorker(action, payload, transfer = [], onProgress) {
  const id = ++requestSequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    worker.postMessage({ id, action, payload }, transfer);
  });
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function formatPages(count) {
  return `${count} ${count === 1 ? "page" : "pages"}`;
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]);
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function readyEntries() {
  return entries.filter((entry) => entry.status === "ready");
}

function render() {
  const totalBytes = entries.reduce((sum, entry) => sum + entry.file.size, 0);
  const ready = readyEntries();
  const isInspecting = entries.some((entry) => entry.status === "reading");
  const hasErrors = entries.some((entry) => entry.status === "error");
  const canMerge = entries.length >= 2 && ready.length === entries.length;

  elements.fileListWrap.hidden = entries.length === 0;
  elements.dropZone.classList.toggle("compact", entries.length > 0);
  elements.fileSummary.textContent = entries.length
    ? `${entries.length} ${entries.length === 1 ? "file" : "files"} · ${formatBytes(totalBytes)}`
    : "No files yet";
  elements.sizeWarning.hidden = totalBytes < MAX_COMFORTABLE_BYTES;
  elements.mergeButton.disabled = !canMerge;

  if (isInspecting) elements.actionHint.textContent = "Checking your PDFs...";
  else if (hasErrors) elements.actionHint.textContent = "Remove unreadable files to continue.";
  else if (entries.length < 2) elements.actionHint.textContent = "Add at least two PDFs to continue.";
  else {
    const pages = ready.reduce((sum, entry) => sum + entry.pageCount, 0);
    elements.actionHint.textContent = `${pages} pages will be combined in the order shown.`;
  }

  elements.fileList.innerHTML = entries.map((entry, index) => {
    const detail = entry.status === "reading"
      ? "Reading PDF..."
      : entry.status === "error"
        ? entry.error
        : `${formatPages(entry.pageCount)} · ${formatBytes(entry.file.size)}`;

    return `
      <li class="file-card ${entry.status === "error" ? "has-error" : ""}"
          data-id="${entry.id}" draggable="true">
        <button class="drag-handle" type="button" aria-label="Drag ${escapeHtml(entry.file.name)} to reorder" tabindex="-1">
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3h1M10 3h1M5 8h1M10 8h1M5 13h1M10 13h1" /></svg>
        </button>
        <span class="order-number" aria-label="Position ${index + 1}">${String(index + 1).padStart(2, "0")}</span>
        <span class="file-type" aria-hidden="true">PDF</span>
        <span class="file-info">
          <strong title="${escapeHtml(entry.file.name)}">${escapeHtml(entry.file.name)}</strong>
          <small>${escapeHtml(detail)}</small>
        </span>
        <span class="move-buttons">
          <button type="button" data-action="up" aria-label="Move ${escapeHtml(entry.file.name)} up" ${index === 0 ? "disabled" : ""}>↑</button>
          <button type="button" data-action="down" aria-label="Move ${escapeHtml(entry.file.name)} down" ${index === entries.length - 1 ? "disabled" : ""}>↓</button>
        </span>
        <button class="remove-file" type="button" data-action="remove" aria-label="Remove ${escapeHtml(entry.file.name)}">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8m0-8-8 8" /></svg>
        </button>
      </li>`;
  }).join("");
}

async function inspectEntry(entry) {
  try {
    const buffer = await entry.file.arrayBuffer();
    const result = await askWorker("inspect", { buffer }, [buffer]);
    entry.pageCount = result.pageCount;
    entry.status = "ready";
  } catch (error) {
    entry.status = "error";
    entry.error = error.message;
  }
  render();
}

function addFiles(fileList) {
  const files = [...fileList].filter((file) =>
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"),
  );

  if (!files.length) {
    elements.status.textContent = "Please choose PDF files.";
    return;
  }

  elements.status.textContent = "";
  const additions = files.map((file) => ({
    id: createId(),
    file,
    status: "reading",
    pageCount: 0,
    error: "",
  }));
  entries.push(...additions);
  render();

  // Read sequentially to avoid a memory spike when several large files arrive together.
  additions.reduce((chain, entry) => chain.then(() => inspectEntry(entry)), Promise.resolve());
}

function moveEntry(id, offset) {
  const index = entries.findIndex((entry) => entry.id === id);
  const nextIndex = index + offset;
  if (index < 0 || nextIndex < 0 || nextIndex >= entries.length) return;
  const [entry] = entries.splice(index, 1);
  entries.splice(nextIndex, 0, entry);
  render();
}

function moveEntryBefore(sourceId, targetId) {
  const sourceIndex = entries.findIndex((entry) => entry.id === sourceId);
  let targetIndex = entries.findIndex((entry) => entry.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
  const [entry] = entries.splice(sourceIndex, 1);
  if (sourceIndex < targetIndex) targetIndex -= 1;
  entries.splice(targetIndex, 0, entry);
  render();
}

function savePdf(buffer) {
  const blob = new Blob([buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "merged.pdf";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

async function mergeFiles() {
  const ready = readyEntries();
  if (ready.length < 2 || ready.length !== entries.length) return;

  elements.mergeButton.disabled = true;
  elements.mergeButton.classList.add("is-working");
  elements.mergeButton.querySelector(".button-label").textContent = "Preparing...";
  elements.status.textContent = "Reading your files locally...";

  try {
    const buffers = [];
    for (const entry of ready) buffers.push(await entry.file.arrayBuffer());

    const result = await askWorker(
      "merge",
      { buffers },
      buffers,
      ({ completed, total }) => {
        const percent = Math.round((completed / total) * 100);
        elements.mergeButton.style.setProperty("--progress", `${percent}%`);
        elements.mergeButton.querySelector(".button-label").textContent = `Merging ${completed} of ${total}`;
        elements.status.textContent = `Combining document ${completed} of ${total}...`;
      },
    );

    savePdf(result);
    elements.status.textContent = "Your merged PDF is ready and has been downloaded.";
    elements.mergeButton.querySelector(".button-label").textContent = "Downloaded";
  } catch (error) {
    elements.status.textContent = error.message;
    elements.mergeButton.querySelector(".button-label").textContent = "Try again";
  } finally {
    setTimeout(() => {
      elements.mergeButton.classList.remove("is-working");
      elements.mergeButton.style.removeProperty("--progress");
      elements.mergeButton.querySelector(".button-label").textContent = "Merge & download";
      render();
    }, 1200);
  }
}

elements.dropZone.addEventListener("click", () => elements.fileInput.click());
elements.dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    elements.fileInput.click();
  }
});
elements.addMore.addEventListener("click", () => elements.fileInput.click());
elements.fileInput.addEventListener("change", (event) => {
  addFiles(event.target.files);
  event.target.value = "";
});

for (const eventName of ["dragenter", "dragover"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("is-dragging");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("is-dragging");
  });
}
elements.dropZone.addEventListener("drop", (event) => addFiles(event.dataTransfer.files));

elements.fileList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = button.closest("[data-id]");
  const action = button.dataset.action;
  if (action === "remove") entries = entries.filter((entry) => entry.id !== card.dataset.id);
  if (action === "up") moveEntry(card.dataset.id, -1);
  if (action === "down") moveEntry(card.dataset.id, 1);
  render();
});
elements.fileList.addEventListener("dragstart", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card) return;
  draggedId = card.dataset.id;
  card.classList.add("is-dragged");
  event.dataTransfer.effectAllowed = "move";
});
elements.fileList.addEventListener("dragover", (event) => {
  const card = event.target.closest("[data-id]");
  if (!card || card.dataset.id === draggedId) return;
  event.preventDefault();
  card.classList.add("is-drag-target");
});
elements.fileList.addEventListener("dragleave", (event) => {
  event.target.closest("[data-id]")?.classList.remove("is-drag-target");
});
elements.fileList.addEventListener("drop", (event) => {
  const card = event.target.closest("[data-id]");
  event.preventDefault();
  if (card && draggedId) moveEntryBefore(draggedId, card.dataset.id);
  draggedId = null;
  render();
});
elements.fileList.addEventListener("dragend", () => {
  draggedId = null;
  render();
});
elements.mergeButton.addEventListener("click", mergeFiles);

render();
