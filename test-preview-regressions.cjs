const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const { pathToFileURL } = require("url");
const { chromium } = require("C:/Users/email/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const ROOT_URL = "file:///E:/codex/indon/";

function pageCount(pdf) {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
}

function assertA5Portrait(pdf) {
  const matches = [...pdf.toString("latin1").matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/g)];
  assert.ok(matches.length, "PDF is missing a MediaBox");
  for (const match of matches) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    assert.ok(width > 415 && width < 425 && height > 590 && height < 600, `Unexpected portrait A5 page size ${width} x ${height}`);
  }
}

async function pdfText(pdf) {
  return (await pdfPageTexts(pdf)).join("\n");
}

async function pdfPageTexts(pdf) {
  const pdfjs = await import("./.testdeps/node_modules/pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
  const pages = [];
  for (let index = 1; index <= document.numPages; index += 1) {
    const page = await document.getPage(index);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  return pages;
}

async function openPreview(browser, model, token) {
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  await page.addInitScript(({ payload }) => {
    globalThis.chrome = {
      storage: { session: { get: async (key) => ({ [key]: payload }), remove: async () => {} } },
      runtime: { getURL: (path) => `file:///E:/codex/indon/${path}` }
    };
  }, { payload: model });
  await page.goto(`${ROOT_URL}preview.html#${token}`);
  await page.waitForFunction(() => document.querySelectorAll(".print-page").length > 0);
  return page;
}

async function filteredPdf(page, filter) {
  await page.evaluate((value) => { document.body.dataset.printFilter = value; }, filter);
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  await page.evaluate(() => { delete document.body.dataset.printFilter; });
  return pdf;
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  const fixturePage = await browser.newPage();
  await fixturePage.goto(pathToFileURL("E:/codex/indon/donthat/Trần Thị Thùy Dung.html").href);
  const contentSource = fs.readFileSync("content.js", "utf8");
  const extracted = await fixturePage.evaluate((source) => eval(source), contentSource);
  await fixturePage.close();
  assert.deepStrictEqual(extracted.items.map((item) => item.sourceName), [
    "VITILSI GEL 15g A24L146 - 31/12/2029 - P",
    "Tatopic 0.1% - Hộp 1 tuýp 10g thuốc mỡ bôi da - A",
    "Đèn Philip - A"
  ]);

  const sandbox = { chrome: { storage: { local: {} } } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync("catalog.js", "utf8"), sandbox);
  const catalog = sandbox.buildCatalog(JSON.parse(fs.readFileSync("default-catalog.json", "utf8")).rows);
  const matchedModel = {
    ...extracted,
    items: extracted.items.map((item) => sandbox.matchItem(item, catalog, {}, { fuzzyEnabled: false, threshold: 0.86 }))
  };
  assert.deepStrictEqual(matchedModel.items.map((item) => item.outputType), ["CONSULTATION", "PRESCRIPTION", "CONSULTATION"]);

  const tranPreview = await openPreview(browser, matchedModel, "tran-regression");
  assert.strictEqual(await tranPreview.title(), "Tách đơn - Trần Thị Thùy Dung");
  const consultationNames = await tranPreview.locator('[data-doc="consultation"] .item-name').allTextContents();
  assert.deepStrictEqual(consultationNames, [
    "VITILSI GEL 15g A24L146 - 31/12/2029 - P",
    "Đèn Philip - A"
  ]);
  const consultationLayout = await tranPreview.locator('[data-doc="consultation"] .print-page').evaluate((page) => {
    const pageBox = page.getBoundingClientRect();
    return {
      clientHeight: page.clientHeight,
      scrollHeight: page.scrollHeight,
      items: [...page.querySelectorAll(".print-item")].map((item) => {
        const box = item.getBoundingClientRect();
        return { top: box.top - pageBox.top, bottom: box.bottom - pageBox.top };
      })
    };
  });
  assert.strictEqual(consultationLayout.clientHeight, consultationLayout.scrollHeight);
  assert.ok(consultationLayout.items.every((item) => item.top >= 0 && item.bottom <= consultationLayout.clientHeight + 1));
  const consultationPdf = await filteredPdf(tranPreview, "consultation");
  assertA5Portrait(consultationPdf);
  assert.strictEqual(pageCount(consultationPdf), 1, "Two consultation products should fit on one portrait A5 page");
  const consultationText = await pdfText(consultationPdf);
  assert.ok(consultationText.includes("VITILSI GEL") && consultationText.includes("Đèn Philip"));
  const allPdf = await tranPreview.pdf({ preferCSSPageSize: true, printBackground: true });
  assert.strictEqual(pageCount(allPdf), 2, "Printing both document groups should create one portrait A5 page per group for this case");
  const allText = await pdfText(allPdf);
  assert.ok(allText.includes("Tatopic 0.1%") && allText.includes("Đèn Philip"));
  await tranPreview.screenshot({ path: "preview-tran.png", fullPage: true });
  await tranPreview.close();

  const lePage = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await lePage.goto(pathToFileURL("E:/codex/indon/donthat/Lê Quốc Chượng.html").href);
  const leExtracted = await lePage.evaluate((source) => eval(source), contentSource);
  await lePage.close();
  assert.strictEqual(leExtracted.items.length, 7);
  const leItems = leExtracted.items.map((item) => sandbox.matchItem(item, catalog, {}, { fuzzyEnabled: false, threshold: 0.86 }));
  // The last product is intentionally unknown and is resolved explicitly for this fixture.
  const unresolvedLe = leItems.find((item) => item.sourceName.includes("Neostrata"));
  assert.strictEqual(unresolvedLe.matchStatus, "UNKNOWN");
  unresolvedLe.outputType = "CONSULTATION";
  unresolvedLe.matchStatus = "MANUAL";
  const leModel = { ...leExtracted, items: leItems };
  const lePreview = await openPreview(browser, leModel, "le-regression");
  assert.strictEqual(await lePreview.title(), "Tách đơn - Lê Quốc Chượng");
  assert.strictEqual(await lePreview.locator('[data-doc="prescription"] .item-name').count(), 5);
  assert.strictEqual(await lePreview.locator('[data-doc="consultation"] .item-name').count(), 2);
  const leHeaderLayout = await lePreview.locator('[data-doc="prescription"] .print-page').evaluate((page) => {
    const root = page.getBoundingClientRect();
    const rect = (selector) => {
      const box = page.querySelector(selector).getBoundingClientRect();
      return { left: box.left - root.left, right: box.right - root.left, top: box.top - root.top };
    };
    return {
      logo: rect(".logo-cell"),
      clinic: rect(".clinic-cell"),
      phone: rect(".contact-row"),
      address: rect(".address-row")
    };
  });
  assert.ok(leHeaderLayout.phone.left <= leHeaderLayout.logo.left + 1, `Phone row should start beneath the logo: ${JSON.stringify(leHeaderLayout)}`);
  assert.ok(leHeaderLayout.address.left <= leHeaderLayout.logo.left + 1, `Address row should start beneath the logo: ${JSON.stringify(leHeaderLayout)}`);
  assert.ok(leHeaderLayout.clinic.left >= leHeaderLayout.logo.right - 1, `Clinic name should remain beside the logo: ${JSON.stringify(leHeaderLayout)}`);
  const lePrescriptionLayout = await lePreview.locator('[data-doc="prescription"] .print-page').evaluate((page) => ({
    height: page.getBoundingClientRect().height,
    scrollHeight: page.scrollHeight,
    clientHeight: page.clientHeight,
    itemCount: page.querySelectorAll(".print-item").length,
    footerBottom: page.querySelector(".print-footer").getBoundingClientRect().bottom - page.getBoundingClientRect().top
  }));
  assert.ok(lePrescriptionLayout.height > 793, `Expected the five-item prescription canvas to grow naturally, got ${JSON.stringify(lePrescriptionLayout)}`);
  assert.strictEqual(lePrescriptionLayout.scrollHeight, lePrescriptionLayout.clientHeight, `Prescription content should not overflow its paper canvas: ${JSON.stringify(lePrescriptionLayout)}`);
  assert.ok(lePrescriptionLayout.footerBottom <= lePrescriptionLayout.height + 1, `Prescription footer should remain inside the expanded canvas: ${JSON.stringify(lePrescriptionLayout)}`);
  const leItemLayout = await lePreview.locator('[data-doc="prescription"] .print-page').evaluate((page) => {
    const top = page.getBoundingClientRect().top;
    return [...page.querySelectorAll(".print-item")].map((item) => Math.round(item.getBoundingClientRect().top - top));
  });
  assert.deepStrictEqual(leItemLayout, [268, 342, 437, 511, 585]);
  const leItemAlignment = await lePreview.locator('[data-doc="prescription"] .print-item:first-child').evaluate((item) => {
    const line = item.querySelector(".item-line").getBoundingClientRect();
    const number = item.querySelector(".item-number");
    const usage = item.querySelector(".item-usage").getBoundingClientRect();
    return { numberAlign: getComputedStyle(number).textAlign, lineLeft: line.left, usageLeft: usage.left };
  });
  assert.strictEqual(leItemAlignment.numberAlign, "left");
  assert.ok(Math.abs(leItemAlignment.lineLeft - leItemAlignment.usageLeft) <= 1, `Item usage should share the outer left edge: ${JSON.stringify(leItemAlignment)}`);
  const leScroll = await lePreview.locator('[data-doc="prescription"] .section-scroll').evaluate((node) => ({ clientHeight: node.clientHeight, scrollHeight: node.scrollHeight }));
  assert.ok(leScroll.scrollHeight > leScroll.clientHeight, `Expected the clinic-like viewport to scroll: ${JSON.stringify(leScroll)}`);
  assert.ok((await lePreview.locator('[data-doc="consultation"] .patient-note').textContent()).includes("Chú ý ngủ sớm"));
  assert.strictEqual(
    (await lePreview.locator('[data-doc="consultation"] .footer-heading').innerText()).replace(/\s+/g, " ").trim(),
    "Dặn dò: Chú ý ngủ sớm, hạn chế đồ ngọt đồ ăn cay nóng."
  );
  assert.ok((await lePreview.locator('[data-doc="consultation"] .notes').textContent()).includes("Quý khách vui lòng đặt lịch hẹn"));
  await lePreview.locator("#consultationView").click();
  assert.strictEqual(await lePreview.locator(".document-set.is-active").getAttribute("data-doc"), "consultation");
  const lePrescriptionPdf = await filteredPdf(lePreview, "prescription");
  const leConsultationPdf = await filteredPdf(lePreview, "consultation");
  assertA5Portrait(lePrescriptionPdf);
  assertA5Portrait(leConsultationPdf);
  assert.strictEqual(pageCount(lePrescriptionPdf), 1, "The five-item Lê Quốc Chượng prescription and footer should fit on one A5 page");
  assert.strictEqual(pageCount(leConsultationPdf), 1, "The two-item Lê Quốc Chượng consultation should fit on one portrait A5 page");
  assert.ok((await pdfText(lePrescriptionPdf)).includes("VERTUCID"));
  assert.ok((await pdfText(leConsultationPdf)).includes("Neostrata"));
  const lePrescriptionPages = await pdfPageTexts(lePrescriptionPdf);
  assert.ok(lePrescriptionPages.some((page) => page.includes("VERTUCID")), "The final item must remain in the printed prescription");
  assert.ok(lePrescriptionPages.some((page) => page.includes("Dặn dò")), "The prescription footer must remain in the printed output");
  await lePreview.screenshot({ path: "preview-le.png", fullPage: true });
  await lePreview.close();

  const compactModel = {
    clinic: extracted.clinic,
    patient: { name: "Phạm Hoàng Minh", age: "17", address: "Linh Đàm - Hoàng Mai Thành phố Hà Nội", gender: "Nữ", diagnosis: "Viêm nang lông" },
    items: [
      { sourceName: "Nibean Itraconazol 100mg - A", quantity: "40", unit: "Viên", usage: "Uống ngày 2 viên chia 2 sau ăn", outputType: "PRESCRIPTION", matchStatus: "EXACT_NAME" },
      { sourceName: "Oratane, 10mg, caps 60s", quantity: "1", unit: "Hộp", usage: "Uống ngày 1 viên trong ăn tối", outputType: "PRESCRIPTION", matchStatus: "EXACT_NAME" },
      { sourceName: "VERTUCID - A", quantity: "2", unit: "Hộp", usage: "Chấm mụn tối", outputType: "PRESCRIPTION", matchStatus: "EXACT_NAME" }
    ],
    notes: extracted.notes,
    date: extracted.date,
    doctor: null,
    doctorLabel: "Bác sĩ khám"
  };
  const compactPreview = await openPreview(browser, compactModel, "compact-regression");
  const compactPdf = await filteredPdf(compactPreview, "prescription");
  assertA5Portrait(compactPdf);
  assert.strictEqual(pageCount(compactPdf), 1, "The three-item prescription should not be split prematurely");
  const compactText = await pdfText(compactPdf);
  assert.ok(compactText.includes("Nibean Itraconazol") && compactText.includes("VERTUCID"));
  await compactPreview.close();

  const sevenModel = {
    ...compactModel,
    patient: { ...compactModel.patient, name: "Bảy sản phẩm" },
    items: Array.from({ length: 7 }, (_, index) => ({
      sourceName: `Sản phẩm ${index + 1}`,
      quantity: "1",
      unit: "Hộp",
      usage: "Dùng sáng và tối theo hướng dẫn",
      outputType: "PRESCRIPTION",
      matchStatus: "EXACT_NAME"
    }))
  };
  const sevenPreview = await openPreview(browser, sevenModel, "seven-regression");
  const sevenPdf = await filteredPdf(sevenPreview, "prescription");
  assertA5Portrait(sevenPdf);
  const sevenPages = await pdfPageTexts(sevenPdf);
  assert.ok(sevenPages[0].includes("Sản phẩm 7"), "Seven compact items should remain on the first A5 page");
  await sevenPreview.close();

  const sevenLongModel = { ...leModel, items: leItems.map((item) => ({ ...item, outputType: "PRESCRIPTION", matchStatus: "MANUAL" })) };
  const sevenLongPreview = await openPreview(browser, sevenLongModel, "seven-long-regression");
  await sevenLongPreview.emulateMedia({ media: "print" });
  const sevenLongPrintDensity = await sevenLongPreview.locator('[data-doc="prescription"] .print-page').evaluate((page) => ({
    fontSize: getComputedStyle(page).fontSize,
    lineHeight: getComputedStyle(page).lineHeight,
    padding: getComputedStyle(page).padding,
    footer: (() => {
      const footer = page.querySelector(".print-footer").getBoundingClientRect();
      const heading = page.querySelector(".footer-heading").getBoundingClientRect();
      const notes = page.querySelector(".notes").getBoundingClientRect();
      const qr = page.querySelector(".qr-cell").getBoundingClientRect();
      const signature = page.querySelector(".signature").getBoundingClientRect();
      const qrImage = page.querySelector(".qr-cell img").getBoundingClientRect();
      return { footerWidth: footer.width, headingWidth: heading.width, notesWidth: notes.width, qrWidth: qr.width, signatureWidth: signature.width, qrImageWidth: qrImage.width };
    })()
  }));
  assert.strictEqual(sevenLongPrintDensity.fontSize, "14px");
  assert.strictEqual(sevenLongPrintDensity.lineHeight, "21px");
  assert.strictEqual(sevenLongPrintDensity.padding, "11.3386px");
  assert.ok(Math.abs(sevenLongPrintDensity.footer.footerWidth - sevenLongPrintDensity.footer.headingWidth) <= 1);
  assert.ok(sevenLongPrintDensity.footer.notesWidth > sevenLongPrintDensity.footer.signatureWidth);
  assert.ok(sevenLongPrintDensity.footer.qrWidth < sevenLongPrintDensity.footer.signatureWidth);
  assert.ok(sevenLongPrintDensity.footer.qrImageWidth > 60 && sevenLongPrintDensity.footer.qrImageWidth < 61);
  const sevenLongPdf = await filteredPdf(sevenLongPreview, "prescription");
  assertA5Portrait(sevenLongPdf);
  assert.strictEqual(pageCount(sevenLongPdf), 2, "Seven realistic items should use the first A5 page and leave the footer to flow naturally");
  const sevenLongPages = await pdfPageTexts(sevenLongPdf);
  assert.ok(sevenLongPages[0].includes("Neostrata"), "Seven realistic items should remain on the first A5 page");
  assert.ok(sevenLongPages.some((page) => page.includes("Dặn dò")), "The footer should remain in the printed output");
  await sevenLongPreview.close();

  const manyModel = {
    ...compactModel,
    patient: { ...compactModel.patient, name: "Danh sách dài" },
    items: Array.from({ length: 30 }, (_, index) => ({
      sourceName: `Sản phẩm ${index + 1} với tên đủ dài để kiểm tra xuống dòng an toàn`,
      quantity: String((index % 3) + 1),
      unit: index % 2 ? "Hộp" : "Tuýp",
      usage: "Dùng sáng và tối theo hướng dẫn của bác sĩ",
      outputType: "PRESCRIPTION",
      matchStatus: "EXACT_NAME"
    }))
  };
  const manyPreview = await openPreview(browser, manyModel, "many-regression");
  assert.strictEqual(await manyPreview.locator(".print-item").count(), 30);
  const manyPage = await manyPreview.locator(".print-page").evaluate((page) => ({
    height: page.getBoundingClientRect().height,
    clientHeight: page.clientHeight,
    scrollHeight: page.scrollHeight,
    footerBottom: page.querySelector(".print-footer").getBoundingClientRect().bottom - page.getBoundingClientRect().top
  }));
  assert.ok(manyPage.height > 793, `Expected the 30-item form to grow beyond one portrait sheet: ${JSON.stringify(manyPage)}`);
  assert.strictEqual(manyPage.scrollHeight, manyPage.clientHeight, `The 30-item canvas should expand instead of clipping content: ${JSON.stringify(manyPage)}`);
  assert.ok(manyPage.footerBottom <= manyPage.height + 1, `The 30-item footer should remain inside the expanded canvas: ${JSON.stringify(manyPage)}`);
  const manyPdf = await filteredPdf(manyPreview, "prescription");
  assertA5Portrait(manyPdf);
  assert.ok(pageCount(manyPdf) > 1, "A long prescription should flow onto additional physical pages");
  const manyText = await pdfText(manyPdf);
  assert.ok(manyText.includes("Sản phẩm 1 ") && manyText.includes("Sản phẩm 30 "));
  await manyPreview.close();

  await browser.close();
  console.log(JSON.stringify({ consultationPages: pageCount(consultationPdf), allPages: pageCount(allPdf), lePrescriptionItems: 5, leConsultationItems: 2, compactPages: pageCount(compactPdf), manyPages: pageCount(manyPdf) }));
})().catch((error) => { console.error(error); process.exit(1); });
