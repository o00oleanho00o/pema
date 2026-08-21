async function parseXlsxFile(file) {
  if (!file || !/\.xlsx$/i.test(file.name)) throw new Error("Chỉ hỗ trợ file .xlsx.");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const parseXml = (source, message) => {
    const document = new DOMParser().parseFromString(source, "application/xml");
    if (!document || document.querySelector("parsererror")) throw new Error(message);
    return document;
  };
  const sharedEntry = zip.file("xl/sharedStrings.xml");
  const sharedXml = sharedEntry ? await sharedEntry.async("string") : "";
  const shared = sharedXml
    ? [...parseXml(sharedXml, "Shared strings XML không hợp lệ.").querySelectorAll("si")]
      .map((node) => [...node.querySelectorAll("t")].map((t) => t.textContent || "").join(""))
    : [];
  const workbookEntry = zip.file("xl/workbook.xml");
  const workbookXml = workbookEntry ? parseXml(await workbookEntry.async("string"), "Workbook XML không hợp lệ.") : null;
  const workbookSheet = workbookXml?.querySelector("sheet");
  const sheetName = workbookSheet?.getAttribute("name") || "Sheet";
  const resolveZipPath = (basePath, target) => {
    if (!target) return "";
    const rawPath = target.startsWith("/") ? target.slice(1) : `${basePath.slice(0, basePath.lastIndexOf("/") + 1)}${target}`;
    const parts = [];
    for (const part of rawPath.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    return parts.join("/");
  };
  let sheetPath = "";
  const relationId = workbookSheet?.getAttribute("r:id") || workbookSheet?.getAttribute("id");
  const relationsEntry = zip.file("xl/_rels/workbook.xml.rels");
  if (relationId && relationsEntry) {
    const relationsXml = parseXml(await relationsEntry.async("string"), "Workbook relationships XML không hợp lệ.");
    const relation = [...relationsXml.querySelectorAll("Relationship")].find((node) => node.getAttribute("Id") === relationId);
    if (relation) sheetPath = resolveZipPath("xl/workbook.xml", relation.getAttribute("Target"));
  }
  if (!sheetPath) {
    const sheetFiles = Object.keys(zip.files).filter((name) => /^xl\/worksheets\/[^/]+\.xml$/i.test(name));
    sheetPath = sheetFiles[0] || "";
  }
  const sheetEntry = sheetPath && zip.file(sheetPath);
  if (!sheetEntry) throw new Error("Workbook không có worksheet.");
  const xml = parseXml(await sheetEntry.async("string"), "Worksheet XML không hợp lệ.");
  const rows = [...xml.querySelectorAll("row")].map((row) => {
    const values = {};
    for (const cell of row.querySelectorAll("c")) {
      const ref = cell.getAttribute("r") || "";
      const col = ref.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() || "";
      if (!col) continue;
      const type = cell.getAttribute("t");
      const valueNode = cell.querySelector("v");
      const inlineValue = [...cell.querySelectorAll("is t")].map((t) => t.textContent || "").join("");
      const rawValue = type === "inlineStr" ? inlineValue : valueNode?.textContent || inlineValue;
      values[col] = type === "s" ? (shared[Number(rawValue)] || "") : rawValue;
    }
    return { rowNumber: Number(row.getAttribute("r") || 0), values };
  });
  // Use the same accent-insensitive key for detecting and reading headers.
  // The workbook stores labels such as "Mã" and "Tên" in shared strings.
  const headerKey = (value) => normalizeType(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, "");
  const header = rows.find((row) => {
    const keys = Object.values(row.values).map(headerKey);
    return keys.includes("ma") && keys.includes("ten");
  });
  if (!header) throw new Error("Không tìm thấy hàng tiêu đề có cột Mã và Tên.");
  const headerMap = Object.fromEntries(Object.entries(header.values).map(([column, value]) => [headerKey(value), column]));
  const codeColumn = headerMap.ma;
  const nameColumn = headerMap.ten;
  const unitColumn = headerMap.donvi;
  const typeColumn = headerMap.loai;
  if (!codeColumn || !nameColumn || !typeColumn) throw new Error("Thiếu một trong các cột Mã, Tên, Loại.");
  const dataRows = rows.filter((row) => row.rowNumber > header.rowNumber && Object.values(row.values).some((value) => String(value).trim())).map((row) => ({ code: row.values[codeColumn], name: row.values[nameColumn], unit: unitColumn ? row.values[unitColumn] : "", sourceType: row.values[typeColumn], rowNumber: row.rowNumber }));
  if (!dataRows.length) throw new Error("Không có sản phẩm trong workbook.");
  return { sheetName, headerRow: header.rowNumber, rows: dataRows };
}
