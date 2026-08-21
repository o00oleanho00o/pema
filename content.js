(() => {
  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const visible = (element) => element instanceof Element && getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden" && element.getClientRects().length > 0;
  const textOf = (element) => clean(element?.value ?? element?.innerText ?? element?.textContent ?? "");
  const dataElements = (root, id) => [...root.querySelectorAll(`[dataid="${id}"]`)].filter(visible);
  const firstData = (root, id) => dataElements(root, id)[0] || null;
  const dataText = (root, id) => textOf(firstData(root, id));
  const titleNode = [...document.querySelectorAll("body *")].find((element) => visible(element) && /^(ĐƠN THUỐC|PHIẾU TƯ VẤN)$/i.test(clean(element.textContent)));
  if (!titleNode) throw new Error("Không tìm thấy tiêu đề prescription đang hiển thị.");

  let container = titleNode.closest("form#PrintfArea") || null;
  if (!container) {
    for (let current = titleNode; current && current !== document.body; current = current.parentElement) {
      if (!visible(current)) continue;
      const text = clean(current.innerText);
      const hasPatient = dataElements(current, "custname").length || /Họ tên/i.test(text);
      const hasItems = dataElements(current, "medicinename").length || /\b\d+\s*[.)]/.test(text);
      if (hasPatient && hasItems) { container = current; break; }
    }
  }
  if (!container) throw new Error("Không tìm thấy container prescription đang hiển thị.");

  const canonicalDate = (value) => clean(value).replace(/^(?:Ngày\s*:?[ ]*)+/i, "").trim();
  const patient = {
    name: dataText(container, "custname"),
    age: dataText(container, "CustAge"),
    address: dataText(container, "custaddress"),
    gender: (() => {
      const state = (element) => element?.checked === true
        || element?.getAttribute("aria-checked") === "true"
        || element?.getAttribute("data-checked") === "true"
        || element?.classList.contains("active")
        || element?.classList.contains("selected");
      const male = dataElements(container, "IsMale").some(state);
      const female = [...dataElements(container, "IsFeMale"), ...dataElements(container, "IsFemale")].some(state);
      // Do not infer from flattened text; ambiguous state remains unknown.
      return male === female ? null : (male ? "Nam" : "Nữ");
    })(),
    diagnosis: dataText(container, "Diagnostic")
  };

  const itemFields = dataElements(container, "medicinename");
  const groups = [];
  for (const nameElement of itemFields) {
    let group = null;
    for (let current = nameElement.parentElement; current && current !== container; current = current.parentElement) {
      const names = dataElements(current, "medicinename");
      const hasQuantity = dataElements(current, "quantity").length > 0;
      const hasUnit = dataElements(current, "unitName").length > 0;
      if (names.length === 1 && (hasQuantity || hasUnit)) { group = current; }
      if (names.length > 1) break;
    }
    group = group || nameElement.parentElement || nameElement;
    if (!groups.includes(group)) groups.push(group);
  }
  const readGroup = (group, id) => textOf(dataElements(group, id)[0]);
  const readCode = (group) => {
    const node = [...group.querySelectorAll('[dataid="productCode"], [dataid="ProductCode"], [dataid="medicineCode"], [dataid="MedicineCode"], [data-code], [data-product-code]')].find(visible);
    const value = node?.value || node?.getAttribute("data-code") || node?.getAttribute("data-product-code") || node?.textContent || "";
    return /^[A-Z]{1,4}\d{2,}$/i.test(clean(value)) ? clean(value) : null;
  };
  const items = groups.map((group, index) => {
    const sourceName = readGroup(group, "medicinename");
    const quantity = readGroup(group, "quantity");
    const unit = readGroup(group, "unitName");
    const usageParts = ["NoteMedicine", "noteDosageMorning", "noteDosageNoon", "noteDosageEverning", "noteDosageEvening"].map((id) => readGroup(group, id)).filter(Boolean);
    const rawText = clean(group.innerText || sourceName);
    return {
      index: Number(readGroup(group, "medicinenum")) || index + 1,
      sourceName,
      normalizedName: "",
      productCode: readCode(group),
      quantity,
      unit,
      usage: usageParts.join(" "),
      catalogType: null,
      outputType: null,
      matchStatus: "UNKNOWN",
      matchedCode: null,
      matchedName: null,
      matchScore: null,
      rawText,
      category: null
    };
  }).filter((item) => item.sourceName || item.rawText);

  const fallbackLines = (container.innerText || "").split(/\r?\n/).map(clean).filter(Boolean);
  const noteLabel = dataText(container, "note");
  const dateElement = firstData(container, "datestring");
  const footerNoteLines = (() => {
    for (let current = dateElement; current && current !== container; current = current.parentElement) {
      const labels = [...current.querySelectorAll("label")].filter(visible);
      const values = labels.map(textOf).filter(Boolean);
      const start = values.findIndex((line) => /^Dặn dò\s*:?[ ]*$/i.test(line));
      const lines = (start >= 0 ? values.slice(start + 1) : values).filter((line) => /^-\s*/.test(line));
      if (lines.length) return lines;
    }
    return [];
  })();
  // The clinic renders each note as a separate label; keep those boundaries for print layout.
  const notes = footerNoteLines.length ? footerNoteLines.join("\n") : ((noteLabel && !/^Dặn dò\s*:?[ ]*$/i.test(noteLabel)) ? noteLabel : (() => {
    const start = fallbackLines.findIndex((line) => /^Dặn dò\s*:?[ ]*$/i.test(line));
    const dateIndex = fallbackLines.findIndex((line) => /Ngày\s+\d{1,2}\s+Tháng\s+\d{1,2}\s+Năm\s+\d{4}/i.test(line));
    return start >= 0 ? fallbackLines.slice(start + 1, dateIndex >= 0 ? dateIndex : fallbackLines.length).filter((line) => !/^Zalo OA$/i.test(line)).join("\n") : "";
  })());
  const dateRaw = dataText(container, "datestring") || (fallbackLines.find((line) => /Ngày\s+\d{1,2}\s+Tháng\s+\d{1,2}\s+Năm\s+\d{4}/i.test(line)) || "");
  const doctorLabel = "Bác sĩ khám";
  const doctorCandidate = dataText(container, "doctor") || "";
  const doctor = doctorCandidate && !/^Bác sĩ khám$/i.test(doctorCandidate) ? doctorCandidate : null;
  const visibleLabels = [...container.querySelectorAll("label")].filter(visible).map(textOf);
  const clinicName = dataText(container, "BranchName") || visibleLabels.find((text) => /phòng khám|bệnh viện/i.test(text)) || "";
  const slogan = dataText(container, "BranchSlogan") || visibleLabels.find((text) => /Chuẩn Y khoa/i.test(text)) || "";
  const sourceUrl = (() => {
    try {
      const url = new URL(location.href);
      return `${url.origin}${url.pathname}`;
    } catch {
      return location.origin;
    }
  })();
  // The print builder uses bundled clinic assets. Do not copy large data URIs
  // from the clinic DOM into the transient prescription model.
  return {
    clinic: { name: clinicName, slogan, phone: dataText(container, "BranchTel"), address: dataText(container, "BranchAddress"), logo: null, qr: null },
    patient,
    items,
    notes,
    date: canonicalDate(dateRaw),
    doctor,
    doctorLabel,
    sourceFormTitle: /PHIẾU TƯ VẤN/i.test(clean(titleNode.textContent)) ? "PHIẾU TƯ VẤN" : "ĐƠN THUỐC",
    sourceTitle: document.title,
    sourceUrl
  };
})();
