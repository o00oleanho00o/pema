const CATALOG_KEY = "prescriptionSplitter.catalog";
const OVERRIDES_KEY = "prescriptionSplitter.overrides";
const SETTINGS_KEY = "prescriptionSplitter.settings";
const DEFAULT_SETTINGS = { fuzzyEnabled: true, threshold: 0.86 };
const ROUTE_TYPES = new Set(["PRESCRIPTION", "CONSULTATION", "EXCLUDED"]);

function hasOwn(object, key) {
  return !!object && Object.prototype.hasOwnProperty.call(object, key);
}

function putIndexValue(index, key, value) {
  // defineProperty keeps special keys such as __proto__ as ordinary catalog keys.
  Object.defineProperty(index, key, { configurable: true, enumerable: true, writable: true, value });
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*([,;:/()%-])\s*/g, "$1")
    .trim()
    .toLocaleLowerCase("vi-VN");
}

function normalizeType(value) {
  return normalizeText(value);
}

function normalizeCode(value) {
  return String(value ?? "").normalize("NFKC").trim().toLocaleUpperCase("vi-VN");
}

function outputTypeFor(sourceType) {
  const type = normalizeType(sourceType);
  // Column E is authoritative: only Thuốc is a prescription route.
  // Blank or otherwise unknown values intentionally go to consultation.
  return type === "thuốc" ? "PRESCRIPTION" : "CONSULTATION";
}

function catalogRow(code, name, unit, sourceType, rowNumber) {
  const cleanCode = normalizeCode(code);
  const cleanName = String(name ?? "").trim();
  const cleanUnit = String(unit ?? "").trim();
  const cleanType = String(sourceType ?? "").trim();
  const errors = [];
  if (!cleanCode) errors.push("missing_code");
  if (!cleanName) errors.push("missing_name");
  return {
    code: cleanCode,
    name: cleanName,
    normalizedName: normalizeText(cleanName),
    unit: cleanUnit,
    sourceType: cleanType,
    outputType: outputTypeFor(cleanType),
    rowNumber,
    errors
  };
}

function buildCatalog(rows, metadata = {}) {
  if (!Array.isArray(rows)) throw new Error("Danh mục không có dữ liệu dòng.");
  const records = rows.map((row, index) => catalogRow(row?.code, row?.name, row?.unit, row?.sourceType, row?.rowNumber ?? index + 1));
  const valid = records.filter((record) => record.errors.length === 0);
  const duplicateCodes = [];
  const duplicateNames = [];
  const seenCodes = new Set();
  const seenNames = new Set();
  for (const record of valid) {
    if (seenCodes.has(record.code)) duplicateCodes.push(record.code);
    else seenCodes.add(record.code);
    if (seenNames.has(record.normalizedName)) duplicateNames.push(record.normalizedName);
    else seenNames.add(record.normalizedName);
  }
  const duplicateCodeSet = new Set(duplicateCodes);
  const duplicateNameSet = new Set(duplicateNames);
  const usable = valid.filter((record) => !duplicateCodeSet.has(record.code) && !duplicateNameSet.has(record.normalizedName));
  const byCode = {};
  const byNormalizedName = {};
  for (const record of usable) {
    putIndexValue(byCode, record.code, record);
    putIndexValue(byNormalizedName, record.normalizedName, record);
  }
  const counts = {
    totalRows: records.length,
    usableProducts: usable.length,
    prescription: usable.filter((record) => record.outputType === "PRESCRIPTION").length,
    consultation: usable.filter((record) => record.outputType === "CONSULTATION").length,
    invalidRows: records.filter((record) => record.errors.length > 0).length,
    missingTypeRows: records.filter((record) => !record.sourceType && record.errors.length === 0).length,
    duplicateCodes: duplicateCodeSet.size,
    duplicateNames: duplicateNameSet.size
  };
  return {
    version: 1,
    importedAt: metadata.importedAt || new Date().toISOString(),
    filename: metadata.filename || "danhsach.xlsx",
    records: usable,
    counts,
    byCode,
    byNormalizedName
  };
}

async function loadCatalog() {
  try {
    const result = await chrome.storage.local.get(CATALOG_KEY);
    const catalog = result[CATALOG_KEY];
    return isCatalog(catalog) ? catalog : null;
  } catch {
    return null;
  }
}

async function saveCatalog(catalog) {
  await chrome.storage.local.set({ [CATALOG_KEY]: catalog });
}

async function loadBundledCatalog() {
  const response = await fetch(chrome.runtime.getURL("default-catalog.json"));
  if (!response.ok) throw new Error("Không đọc được danh mục mặc định.");
  const source = await response.json();
  if (!source || !Array.isArray(source.rows)) throw new Error("Danh mục mặc định không hợp lệ.");
  const catalog = buildCatalog(source.rows, { filename: source.filename || "danhsach.xlsx" });
  // A transient storage failure must not prevent a read-only session from using
  // the bundled catalog in memory.
  try { await saveCatalog(catalog); } catch { /* use the in-memory catalog */ }
  return catalog;
}

async function loadCatalogOrDefault() {
  return (await loadCatalog()) || loadBundledCatalog();
}

async function loadOverrides() {
  try {
    const result = await chrome.storage.local.get(OVERRIDES_KEY);
    const overrides = result[OVERRIDES_KEY];
    return overrides && typeof overrides === "object" && !Array.isArray(overrides) ? overrides : {};
  } catch {
    return {};
  }
}

async function saveOverrides(overrides) {
  const value = overrides && typeof overrides === "object" && !Array.isArray(overrides) ? overrides : {};
  await chrome.storage.local.set({ [OVERRIDES_KEY]: value });
}

async function loadSettings() {
  let stored = null;
  try { stored = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]; } catch { stored = null; }
  const fuzzyEnabled = stored?.fuzzyEnabled === undefined ? DEFAULT_SETTINGS.fuzzyEnabled : stored.fuzzyEnabled === true || stored.fuzzyEnabled === "true";
  const parsedThreshold = Number(stored?.threshold);
  const threshold = Number.isFinite(parsedThreshold) ? Math.min(0.98, Math.max(0.70, parsedThreshold)) : DEFAULT_SETTINGS.threshold;
  return { fuzzyEnabled, threshold };
}

async function saveSettings(settings) {
  const source = settings && typeof settings === "object" ? settings : {};
  const parsedThreshold = Number(source.threshold);
  const threshold = Number.isFinite(parsedThreshold) ? Math.min(0.98, Math.max(0.70, parsedThreshold)) : DEFAULT_SETTINGS.threshold;
  await chrome.storage.local.set({ [SETTINGS_KEY]: { fuzzyEnabled: source.fuzzyEnabled !== false, threshold } });
}

function isCatalog(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.records) || !value.counts || typeof value.counts !== "object") return false;
  if (!value.byCode || typeof value.byCode !== "object" || !value.byNormalizedName || typeof value.byNormalizedName !== "object") return false;
  return value.records.every((record) => record && typeof record === "object" && typeof record.code === "string" && typeof record.name === "string" && typeof record.normalizedName === "string" && typeof record.outputType === "string");
}

function levenshtein(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) current[j] = Math.min(current[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    for (let j = 0; j <= b.length; j += 1) prev[j] = current[j];
  }
  return prev[b.length];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

function matchItem(item, catalog, overrides = {}, settings = { fuzzyEnabled: true, threshold: 0.86 }) {
  const code = normalizeCode(item.productCode);
  const normalizedName = normalizeText(item.sourceName || item.name || "");
  const nameOverride = hasOwn(overrides, normalizedName) ? overrides[normalizedName] : null;
  const codeOverride = code && hasOwn(overrides, `code:${code}`) ? overrides[`code:${code}`] : null;
  const override = nameOverride || codeOverride;
  if (override && typeof override === "object" && !Array.isArray(override) && ROUTE_TYPES.has(override.outputType)) {
    return { ...item, ...override, matchStatus: "MANUAL", matchScore: 1 };
  }
  const exactCode = code && hasOwn(catalog?.byCode, code) ? catalog.byCode[code] : null;
  if (exactCode) return applyCatalogMatch(item, exactCode, "EXACT_CODE", 1);
  const exactName = normalizedName && hasOwn(catalog?.byNormalizedName, normalizedName) ? catalog.byNormalizedName[normalizedName] : null;
  if (exactName) return applyCatalogMatch(item, exactName, "EXACT_NAME", 1);
  if (settings.fuzzyEnabled && catalog?.records?.length) {
    let best = null;
    for (const candidate of catalog.records) {
      const score = similarity(normalizedName, candidate.normalizedName);
      if (!best || score > best.score) best = { candidate, score };
    }
    if (best && best.score >= Number(settings.threshold || 0.86)) return applyCatalogMatch(item, best.candidate, "FUZZY_REVIEW", best.score);
  }
  return { ...item, normalizedName, catalogType: null, outputType: null, matchStatus: "UNKNOWN", matchedCode: null, matchedName: null, matchScore: null };
}

function applyCatalogMatch(item, record, matchStatus, score) {
  return { ...item, normalizedName: record.normalizedName, catalogType: record.sourceType, outputType: record.outputType, matchStatus, matchedCode: record.code, matchedName: record.name, matchScore: score };
}

function routeResolvedItems(items) {
  const knownRoute = (item) => ROUTE_TYPES.has(item?.outputType);
  return {
    prescriptionItems: items.filter((item) => item.outputType === "PRESCRIPTION" && item.matchStatus !== "FUZZY_REVIEW"),
    consultationItems: items.filter((item) => item.outputType === "CONSULTATION" && item.matchStatus !== "FUZZY_REVIEW"),
    unresolvedItems: items.filter((item) => !knownRoute(item) || item.matchStatus === "FUZZY_REVIEW"),
    excludedItems: items.filter((item) => item.outputType === "EXCLUDED")
  };
}
