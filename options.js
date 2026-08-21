const fileInput = document.getElementById("file");
const importButton = document.getElementById("import");
const result = document.getElementById("result");
const stats = document.getElementById("stats");
const fuzzyEnabled = document.getElementById("fuzzyEnabled");
const threshold = document.getElementById("threshold");
const thresholdValue = document.getElementById("thresholdValue");
function escapeHtml(value) { return String(value ?? "").replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[character])); }

function showStats(catalog) {
  if (!catalog) { stats.innerHTML = "<dt>Trạng thái</dt><dd>Chưa import</dd>"; return; }
  const c = catalog.counts;
  stats.innerHTML = `<dt>File</dt><dd>${escapeHtml(catalog.filename)}</dd><dt>Tổng dòng sản phẩm</dt><dd>${c.totalRows}</dd><dt>Sản phẩm dùng được</dt><dd>${c.usableProducts}</dd><dt>Đơn thuốc</dt><dd>${c.prescription}</dd><dt>Phiếu tư vấn</dt><dd>${c.consultation}</dd><dt>Dòng lỗi</dt><dd>${c.invalidRows || 0}</dd><dt>Dòng thiếu Loại</dt><dd>${c.missingTypeRows || 0}</dd><dt>Mã trùng</dt><dd>${c.duplicateCodes}</dd><dt>Tên trùng</dt><dd>${c.duplicateNames}</dd><dt>Cập nhật</dt><dd>${new Date(catalog.importedAt).toLocaleString("vi-VN")}</dd>`;
}
async function load() { showStats(await loadCatalogOrDefault()); const settings = await loadSettings(); fuzzyEnabled.checked = settings.fuzzyEnabled; threshold.value = settings.threshold; thresholdValue.value = Number(settings.threshold).toFixed(2); }
importButton.addEventListener("click", async () => {
  const file = fileInput.files?.[0];
  if (!file) { result.textContent = "Chọn danhsach.xlsx trước."; result.className = "error"; return; }
  importButton.disabled = true; result.className = ""; result.textContent = "Đang đọc và validate...";
  try {
    const parsed = await parseXlsxFile(file);
    const catalog = buildCatalog(parsed.rows, { filename: file.name });
    if (catalog.counts.invalidRows || catalog.counts.duplicateCodes || catalog.counts.duplicateNames) {
      const problems = [];
      if (catalog.counts.invalidRows) problems.push(`${catalog.counts.invalidRows} dòng thiếu Mã/Tên`);
      if (catalog.counts.duplicateCodes) problems.push(`${catalog.counts.duplicateCodes} mã trùng`);
      if (catalog.counts.duplicateNames) problems.push(`${catalog.counts.duplicateNames} tên trùng`);
      throw new Error(`Danh sách không hợp lệ (${problems.join(", ")}); danh mục cũ được giữ nguyên.`);
    }
    await saveCatalog(catalog);
    showStats(catalog);
    result.textContent = `Đã commit ${catalog.counts.usableProducts} sản phẩm; ${catalog.counts.missingTypeRows || 0} dòng thiếu Loại route vào Phiếu tư vấn.`;
  }
  catch (error) { result.textContent = error.message || "Import thất bại; danh mục cũ được giữ nguyên."; result.className = "error"; }
  finally { importButton.disabled = false; fileInput.value = ""; }
});
threshold.addEventListener("input", () => { thresholdValue.value = Number(threshold.value).toFixed(2); });
async function saveMatchingSettings() {
  try {
    await saveSettings({ fuzzyEnabled: fuzzyEnabled.checked, threshold: Number(threshold.value) });
  } catch (error) {
    result.textContent = error.message || "Không lưu được cài đặt matching.";
    result.className = "error";
  }
}
fuzzyEnabled.addEventListener("change", saveMatchingSettings); threshold.addEventListener("change", saveMatchingSettings);
load().catch((error) => {
  result.textContent = /failed to fetch|networkerror/i.test(error?.message || "")
    ? "Không đọc được danh mục mặc định; hãy chọn danhsach.xlsx để import."
    : (error.message || "Không đọc được cài đặt hiện tại.");
  result.className = "error";
});
