const documents = document.getElementById("documents");
const status = document.getElementById("previewStatus");
const prescriptionView = document.getElementById("prescriptionView");
const consultationView = document.getElementById("consultationView");
const PREVIEW_STORAGE_PREFIX = "prescriptionSplitter.preview.";
let model = null;
let previewStorageKey = null;
let printCleanupTimer = null;
let printAfterHandler = null;
let activeView = null;
const scrollPositions = new Map();

function previewError(message) {
  status.textContent = message;
  status.classList.add("error");
  ["prescriptionView", "consultationView", "prescriptionPrint", "consultationPrint", "allPrint"].forEach((id) => { document.getElementById(id).disabled = true; });
}

function setActiveView(view) {
  if (activeView) {
    const previous = documents.querySelector(`[data-doc="${activeView}"] .section-scroll`);
    if (previous) scrollPositions.set(activeView, previous.scrollTop);
  }
  activeView = view;
  for (const section of documents.querySelectorAll(".document-set")) {
    const isActive = section.dataset.doc === view;
    section.classList.toggle("is-active", isActive);
    section.setAttribute("aria-hidden", String(!isActive));
  }
  const activeScroll = documents.querySelector(`[data-doc="${view}"] .section-scroll`);
  if (activeScroll) activeScroll.scrollTop = scrollPositions.get(view) || 0;
  for (const button of [prescriptionView, consultationView]) {
    const isActive = button.dataset.view === view;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  }
  document.body.dataset.activeView = view || "";
}

async function loadModel() {
  let token;
  try { token = decodeURIComponent(location.hash.slice(1)); } catch { throw new Error("Mã preview không hợp lệ."); }
  if (!token || !/^[A-Za-z0-9._-]+$/.test(token)) throw new Error("Thiếu mã preview tạm thời.");
  if (!globalThis.chrome?.storage?.session) throw new Error("Chrome hiện tại không hỗ trợ phiên preview tạm thời.");
  const key = `${PREVIEW_STORAGE_PREFIX}${token}`;
  const stored = await globalThis.chrome.storage.session.get(key);
  model = stored?.[key] || null;
  if (!model) throw new Error("Preview đã hết hạn hoặc không còn dữ liệu.");
  previewStorageKey = key;
}

async function render() {
  if (!model) return;
  const set = buildDocumentSet(model);
  documents.innerHTML = set.map((document) => `<section id="${document.key}Panel" data-doc="${document.key}" class="document-set" role="tabpanel" aria-labelledby="${document.key}View"><div class="section-scroll" tabindex="0" aria-label="${document.title}"><div class="document-canvas">${document.html}</div></div></section>`).join("");
  const patientName = String(model.patient?.name || "").replace(/\s+/g, " ").trim();
  document.title = patientName ? `Tách đơn - ${patientName}` : "Tách đơn - Xem trước";
  document.getElementById("prescriptionPrint").disabled = !set.some((document) => document.key === "prescription");
  document.getElementById("consultationPrint").disabled = !set.some((document) => document.key === "consultation");
  document.getElementById("allPrint").disabled = set.length === 0;
  prescriptionView.disabled = !set.some((document) => document.key === "prescription");
  consultationView.disabled = !set.some((document) => document.key === "consultation");
  const firstView = set.find((document) => document.key === "prescription")?.key || set[0]?.key || null;
  prescriptionView.dataset.view = "prescription";
  consultationView.dataset.view = "consultation";
  if (firstView) setActiveView(firstView);
  const itemCount = set.reduce((total, document) => total + document.items.length, 0);
  status.textContent = set.length ? `${set.length} mẫu in · ${itemCount} sản phẩm · dữ liệu chỉ xử lý trong trình duyệt` : "Không có nhóm item đã được xác định.";
  // Remove the one-time payload only after the document has rendered successfully.
  if (previewStorageKey) {
    const remove = globalThis.chrome.storage.session.remove;
    if (typeof remove === "function") await Promise.resolve(remove.call(globalThis.chrome.storage.session, previewStorageKey)).catch(() => {});
  }
  const cleanUrl = globalThis.chrome?.runtime?.getURL?.("preview.html") || `${location.pathname}${location.search}`;
  globalThis.history?.replaceState?.({}, document.title, cleanUrl);
}

function printFilter(filter) {
  clearPrintFilter();
  document.body.dataset.printFilter = filter;
  printAfterHandler = () => clearPrintFilter();
  window.addEventListener("afterprint", printAfterHandler, { once: true });
  window.print();
  // Some Chromium builds do not emit afterprint when the dialog is closed
  // immediately, so keep a bounded fallback cleanup.
  printCleanupTimer = window.setTimeout(clearPrintFilter, 2000);
}

function clearPrintFilter() {
  delete document.body.dataset.printFilter;
  if (printCleanupTimer !== null) {
    window.clearTimeout(printCleanupTimer);
    printCleanupTimer = null;
  }
  if (printAfterHandler) {
    window.removeEventListener("afterprint", printAfterHandler);
    printAfterHandler = null;
  }
}

document.getElementById("prescriptionPrint").addEventListener("click", () => printFilter("prescription"));
document.getElementById("consultationPrint").addEventListener("click", () => printFilter("consultation"));
document.getElementById("allPrint").addEventListener("click", () => printFilter("all"));
document.getElementById("closePreview").addEventListener("click", () => window.close());
prescriptionView.addEventListener("click", () => setActiveView("prescription"));
consultationView.addEventListener("click", () => setActiveView("consultation"));
document.querySelector(".view-tabs").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = [prescriptionView, consultationView].filter((button) => !button.disabled);
  if (!tabs.length) return;
  event.preventDefault();
  const currentIndex = Math.max(0, tabs.indexOf(document.activeElement));
  const nextIndex = event.key === "Home" ? 0
    : event.key === "End" ? tabs.length - 1
      : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
  tabs[nextIndex].focus();
  setActiveView(tabs[nextIndex].dataset.view);
});
loadModel().then(render).catch((error) => previewError(error.message || "Dữ liệu xem trước không hợp lệ."));
