const documents = document.getElementById("documents");
const status = document.getElementById("previewStatus");
const PREVIEW_STORAGE_PREFIX = "prescriptionSplitter.preview.";
let model = null;
let previewStorageKey = null;
let printCleanupTimer = null;
let printAfterHandler = null;

function previewError(message) {
  status.textContent = message;
  status.classList.add("error");
  ["prescriptionPrint", "consultationPrint", "allPrint"].forEach((id) => { document.getElementById(id).disabled = true; });
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
  documents.innerHTML = set.map((document) => `<section data-doc="${document.key}" class="document-set"><div class="document-label">${document.title}</div>${document.html}</section>`).join("");
  const patientName = String(model.patient?.name || "").replace(/\s+/g, " ").trim();
  document.title = patientName ? `Tách đơn - ${patientName}` : "Tách đơn - Xem trước";
  document.getElementById("prescriptionPrint").disabled = !set.some((document) => document.key === "prescription");
  document.getElementById("consultationPrint").disabled = !set.some((document) => document.key === "consultation");
  document.getElementById("allPrint").disabled = set.length === 0;
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
loadModel().then(render).catch((error) => previewError(error.message || "Dữ liệu xem trước không hợp lệ."));
