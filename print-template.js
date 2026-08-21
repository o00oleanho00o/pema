const PRINT_ASSETS = {
  logo: "assets/clinic-logo.png",
  specialties: "assets/specialty-icons.png",
  qr: "assets/zalo-qr.png"
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}

function lineBreaks(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function canonicalDate(value) {
  return String(value ?? "").replace(/^(?:Ngày\s*:?[ ]*)+/i, "").trim();
}

function buildHeader(data) {
  return `<header class="original-header">
    <div class="identity-row">
      <div class="logo-cell"><img src="${PRINT_ASSETS.logo}" alt="Pema"></div>
      <div class="clinic-column"><div class="clinic-cell"><div class="clinic-name">${escapeHtml(data.clinic?.name)}</div><div class="clinic-slogan">${escapeHtml(data.clinic?.slogan)}</div></div>
        <div class="contact-row"><span class="contact-icon">&#9742;</span><span>${escapeHtml(data.clinic?.phone)}</span></div>
        <div class="contact-row address-row"><span class="contact-icon">&#9679;</span><span>${escapeHtml(data.clinic?.address)}</span></div>
      </div>
      <img class="specialties" src="${PRINT_ASSETS.specialties}" alt="">
    </div>
  </header>`;
}

function buildPatient(data) {
  const patient = data.patient || {};
  const gender = String(patient.gender || "").toLocaleLowerCase("vi-VN");
  const genderBox = (label, value) => `<span class="gender-option"><i class="gender-box${gender === value ? " checked" : ""}" aria-hidden="true"></i>${label}</span>`;
  return `<section class="patient-grid">
    <div><span>Họ tên:</span> ${escapeHtml(patient.name)}</div><div><span>Tuổi:</span> ${escapeHtml(patient.age)}</div>
    <div><span>Địa chỉ:</span> ${escapeHtml(patient.address)}</div><div class="gender-cell"><span>Giới tính:</span> ${genderBox("Nam", "nam")} ${genderBox("Nữ", "nữ")}</div>
    <div class="diagnosis"><span>Chẩn đoán:</span> ${escapeHtml(patient.diagnosis)}</div>
  </section>`;
}

function buildItems(items) {
  return `<section class="item-list">${items.map((item) => `<div class="print-item">
    <div class="item-line"><span class="item-number">${escapeHtml(item.index)}.</span><span class="item-name">${escapeHtml(item.name || item.sourceName || item.rawText)}</span><span class="item-quantity">x&nbsp;${escapeHtml(item.quantity)}&nbsp;${escapeHtml(item.unit)}</span></div>
    <div class="item-usage">${escapeHtml(item.usage || "")}</div>
  </div>`).join("")}</section>`;
}

function buildFooter(data) {
  const notes = data.notes || "";
  return `<footer class="print-footer">
    <div class="notes"><span class="footer-label">Dặn dò:</span>${notes ? `<div>${lineBreaks(notes)}</div>` : ""}</div>
    <div class="qr-cell"><img src="${PRINT_ASSETS.qr}" alt="Zalo QR"><b>Zalo OA</b></div>
    <div class="signature"><div>${escapeHtml(data.date ? `Ngày ${canonicalDate(data.date)}` : "")}</div><b>${escapeHtml(data.doctor || data.doctorLabel || "Bác sĩ khám")}</b></div>
  </footer>`;
}

function buildPrintDocument({ title, clinic, patient, items, notes, date, doctor, doctorLabel }) {
  const data = { clinic, patient, notes, date, doctor, doctorLabel };
  return `<article class="print-page">
    ${buildHeader(data)}
    <h1 class="print-title">${escapeHtml(title)}</h1>
    ${buildPatient(data)}
    ${buildItems(items || [])}
    ${buildFooter(data)}
  </article>`;
}

function buildDocumentSet(model) {
  const routes = routeResolvedItems(model.items || []);
  if (routes.unresolvedItems.length) throw new Error("Còn sản phẩm chưa được xác định cách xử lý.");
  const documents = [];
  const renumber = (items) => items.map((item, index) => ({ ...item, index: index + 1 }));
  if (routes.prescriptionItems.length) documents.push({ key: "prescription", title: "ĐƠN THUỐC", items: renumber(routes.prescriptionItems) });
  if (routes.consultationItems.length) documents.push({ key: "consultation", title: "PHIẾU TƯ VẤN", items: renumber(routes.consultationItems) });
  return documents.map((document) => ({ ...document, html: buildPrintDocument({ ...model, ...document }) }));
}
