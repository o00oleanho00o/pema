const ALLOWED_ORIGIN = "https://annam.vttechsolution.vn";
const PREVIEW_STORAGE_PREFIX = "prescriptionSplitter.preview.";
const readButton = document.getElementById("readButton");
const previewButton = document.getElementById("previewButton");
const copyButton = document.getElementById("copyButton");
const importButton = document.getElementById("importButton");
const catalogFile = document.getElementById("catalogFile");
const settingsButton = document.getElementById("settingsButton");
const patientSummary = document.getElementById("patientSummary");
const itemsSection = document.getElementById("itemsSection");
const itemsList = document.getElementById("itemsList");
const routeSummary = document.getElementById("routeSummary");
const technicalOutput = document.getElementById("technicalOutput");
const catalogStatus = document.getElementById("catalogStatus");
const status = document.getElementById("status");
let currentModel = null;

function setStatus(message, isError = false) { status.textContent = message; status.classList.toggle("error", isError); }
function allowed(url) { try { return new URL(url).origin === ALLOWED_ORIGIN; } catch { return false; } }
function escapeText(value) { return String(value ?? "").replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character])); }
function renderCatalogStatus(catalog) { catalogStatus.textContent = catalog ? `${catalog.filename} · ${catalog.counts.usableProducts} sản phẩm · cập nhật ${new Date(catalog.importedAt).toLocaleString("vi-VN")}` : "Chưa có danh mục local"; }
function renderModel(model) {
  patientSummary.hidden = false;
  patientSummary.innerHTML = `<b>${escapeText(model.patient.name || "Chưa có tên")}</b><span>Tuổi ${escapeText(model.patient.age)} · ${escapeText(model.patient.gender || "Chưa xác định giới tính")}</span><span>Chẩn đoán: ${escapeText(model.patient.diagnosis || "—")}</span><span>Ngày: ${escapeText(model.date || "—")}</span>`;
  itemsSection.hidden = false;
  itemsList.innerHTML = model.items.map((item, index) => {
    const needsManual = !["PRESCRIPTION", "CONSULTATION", "EXCLUDED"].includes(item.outputType) || item.matchStatus === "FUZZY_REVIEW";
    return `<article class="item-card"><div><b>${index + 1}. ${escapeText(item.sourceName || item.rawText)}</b><small>${escapeText(item.quantity)} ${escapeText(item.unit)} · ${escapeText(item.matchStatus)}</small></div><span class="route ${item.outputType === "PRESCRIPTION" ? "drug" : item.outputType === "CONSULTATION" ? "consult" : item.outputType === "EXCLUDED" ? "excluded" : "unknown"}">${item.outputType === "PRESCRIPTION" ? "Đơn thuốc" : item.outputType === "CONSULTATION" ? "Phiếu tư vấn" : item.outputType === "EXCLUDED" ? "Không in" : "Chưa xác định"}</span>${item.matchedCode ? `<small class="match-detail">${escapeText(item.matchedCode)} · ${escapeText(item.catalogType)}${item.matchStatus === "FUZZY_REVIEW" ? ` · score ${Number(item.matchScore).toFixed(2)}` : ""}</small>` : ""}${needsManual ? `<div class="manual-row"><select data-resolve-index="${index}"><option value="">${item.outputType === "EXCLUDED" ? "Đã chọn: Không in" : "Chọn cách xử lý..."}</option><option value="PRESCRIPTION">Đơn thuốc</option><option value="CONSULTATION">Phiếu tư vấn</option><option value="EXCLUDE">Không in</option></select><label><input type="checkbox" data-remember-index="${index}"> Ghi nhớ</label></div>` : ""}</article>`;
  }).join("");
  const routes = routeResolvedItems(model.items);
  routeSummary.textContent = `Đơn thuốc: ${routes.prescriptionItems.length} · Phiếu tư vấn: ${routes.consultationItems.length} · Chưa xác định: ${routes.unresolvedItems.length} · Không in: ${routes.excludedItems.length}`;
  technicalOutput.value = JSON.stringify(model, null, 2);
  // Do not let an unresolved or fuzzy item disappear silently from print.
  // Every item must be routed or explicitly excluded first.
  previewButton.disabled = routes.unresolvedItems.length > 0 || (!routes.prescriptionItems.length && !routes.consultationItems.length);
  copyButton.disabled = false;
}

async function refreshCatalogStatus() { renderCatalogStatus(await loadCatalogOrDefault()); }

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall through to the DOM selection fallback; clipboard permission is optional.
    }
  }
  const helper = document.createElement("textarea");
  helper.value = value;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  document.body.appendChild(helper);
  helper.select();
  const copied = document.execCommand("copy");
  helper.remove();
  if (!copied) throw new Error("copy_failed");
}

importButton.addEventListener("click", () => catalogFile.click());
catalogFile.addEventListener("change", async () => {
  const file = catalogFile.files?.[0];
  if (!file) return;
  importButton.disabled = true;
  setStatus("Đang kiểm tra danh sách Excel...");
  try {
    const parsed = await parseXlsxFile(file);
    const catalog = buildCatalog(parsed.rows, { filename: file.name });
    if (catalog.counts.invalidRows || catalog.counts.duplicateCodes || catalog.counts.duplicateNames) {
      const problems = [];
      if (catalog.counts.invalidRows) problems.push(`${catalog.counts.invalidRows} dòng thiếu Mã/Tên`);
      if (catalog.counts.duplicateCodes) problems.push(`${catalog.counts.duplicateCodes} mã trùng`);
      if (catalog.counts.duplicateNames) problems.push(`${catalog.counts.duplicateNames} tên trùng`);
      throw new Error(`Danh sách không hợp lệ (${problems.join(", ")}); không thay thế danh mục hiện tại.`);
    }
    await saveCatalog(catalog);
    await refreshCatalogStatus();
    setStatus(`Đã cập nhật ${catalog.counts.usableProducts} sản phẩm; ${catalog.counts.missingTypeRows} dòng thiếu Loại vẫn được route vào Phiếu tư vấn.`);
  } catch (error) { setStatus(error.message || "Import thất bại; danh mục cũ vẫn được giữ.", true); }
  finally { importButton.disabled = false; catalogFile.value = ""; }
});

readButton.addEventListener("click", async () => {
  readButton.disabled = true;
  previewButton.disabled = true;
  copyButton.disabled = true;
  setStatus("Đang đọc prescription đang mở...");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !allowed(tab.url)) throw new Error("Hãy mở trang annam.vttechsolution.vn trước.");
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    if (!result?.result) throw new Error("Không tìm thấy prescription đang hiển thị.");
    const catalog = await loadCatalogOrDefault();
    const settings = await loadSettings();
    const overrides = await loadOverrides();
    currentModel = { ...result.result, items: result.result.items.map((item) => matchItem(item, catalog, overrides, settings)) };
    renderModel(currentModel);
    setStatus(`Đã đọc ${currentModel.items.length} sản phẩm; kiểm tra các mục Chưa xác định trước khi in.`);
  } catch (error) { currentModel = null; patientSummary.hidden = true; itemsSection.hidden = true; technicalOutput.value = ""; setStatus(error.message || "Không thể đọc prescription.", true); }
  finally { readButton.disabled = false; }
});

copyButton.addEventListener("click", async () => { if (!currentModel) return; try { await copyText(JSON.stringify(currentModel, null, 2)); setStatus("Đã copy JSON."); } catch { technicalOutput.focus(); technicalOutput.select(); setStatus("Copy thất bại; hãy nhấn Ctrl+C.", true); } });
function createPreviewToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("") || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function storePreviewModel(model) {
  if (!chrome.storage?.session) throw new Error("Chrome hiện tại không hỗ trợ phiên preview tạm thời.");
  const token = createPreviewToken();
  const key = `${PREVIEW_STORAGE_PREFIX}${token}`;
  await chrome.storage.session.set({ [key]: model });
  return { token, key };
}

previewButton.addEventListener("click", async () => {
  if (!currentModel) return;
  previewButton.disabled = true;
  let storedPreview = null;
  try {
    storedPreview = await storePreviewModel(currentModel);
    await chrome.tabs.create({ url: `${chrome.runtime.getURL("preview.html")}#${encodeURIComponent(storedPreview.token)}` });
    setStatus("Đã mở preview; dữ liệu bệnh nhân chỉ nằm trong phiên trình duyệt.");
  } catch (error) {
    if (storedPreview?.key && typeof chrome.storage.session.remove === "function") {
      await Promise.resolve(chrome.storage.session.remove(storedPreview.key)).catch(() => {});
    }
    setStatus(error.message || "Không thể mở preview.", true);
  } finally {
    const routes = currentModel && routeResolvedItems(currentModel.items);
    previewButton.disabled = !routes || routes.unresolvedItems.length > 0 || (!routes.prescriptionItems.length && !routes.consultationItems.length);
  }
});
itemsList.addEventListener("change", async (event) => {
  const select = event.target.closest("select[data-resolve-index]");
  if (!select || !currentModel) return;
  const index = Number(select.dataset.resolveIndex);
  const choice = select.value;
  if (!choice) return;
  const item = currentModel.items[index];
  if (choice === "EXCLUDE") { item.outputType = "EXCLUDED"; item.matchStatus = "MANUAL"; }
  else { item.outputType = choice; item.catalogType = choice === "PRESCRIPTION" ? "Thuốc (manual)" : "Manual"; item.matchStatus = "MANUAL"; }
  try {
    if (document.querySelector(`[data-remember-index="${index}"]`)?.checked) {
      const overrides = await loadOverrides();
      const key = normalizeText(item.sourceName);
      if (key) {
        Object.defineProperty(overrides, key, {
          configurable: true,
          enumerable: true,
          writable: true,
          value: { outputType: item.outputType, catalogType: item.catalogType, matchedCode: item.matchedCode, matchedName: item.matchedName }
        });
        await saveOverrides(overrides);
      }
    }
    renderModel(currentModel);
    setStatus("Đã cập nhật cách xử lý item.");
  } catch (error) {
    setStatus(error.message || "Không lưu được lựa chọn xử lý item.", true);
  }
});
settingsButton.addEventListener("click", () => {
  try {
    Promise.resolve(chrome.runtime.openOptionsPage()).catch(() => setStatus("Không mở được Cài đặt.", true));
  } catch {
    setStatus("Không mở được Cài đặt.", true);
  }
});
refreshCatalogStatus().catch((error) => {
  renderCatalogStatus(null);
  const message = /failed to fetch|networkerror/i.test(error?.message || "")
    ? "Không đọc được danh mục mặc định; hãy Import danhsach.xlsx trong popup hoặc Cài đặt."
    : (error.message || "Không đọc được danh mục mặc định.");
  setStatus(message, true);
});
