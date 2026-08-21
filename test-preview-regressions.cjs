const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const { pathToFileURL } = require("url");
const { chromium } = require("C:/Users/email/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const ROOT_URL = "file:///E:/codex/indon/";

function pageCount(pdf) {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
}

function assertA5Landscape(pdf) {
  const match = pdf.toString("latin1").match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
  assert.ok(match, "PDF is missing a MediaBox");
  const width = Number(match[1]);
  const height = Number(match[2]);
  assert.ok(width > 590 && width < 600 && height > 415 && height < 425, `Unexpected page size ${width} x ${height}`);
}

async function pdfText(pdf) {
  const pdfjs = await import("./.testdeps/node_modules/pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: new Uint8Array(pdf) }).promise;
  const pages = [];
  for (let index = 1; index <= document.numPages; index += 1) {
    const page = await document.getPage(index);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  return pages.join("\n");
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
  assertA5Landscape(consultationPdf);
  assert.strictEqual(pageCount(consultationPdf), 1, "Two consultation products should fit on one A5 page");
  const consultationText = await pdfText(consultationPdf);
  assert.ok(consultationText.includes("VITILSI GEL") && consultationText.includes("Đèn Philip"));
  const allPdf = await tranPreview.pdf({ preferCSSPageSize: true, printBackground: true });
  assert.strictEqual(pageCount(allPdf), 2, "Printing both document groups should create one A5 page per group for this case");
  const allText = await pdfText(allPdf);
  assert.ok(allText.includes("Tatopic 0.1%") && allText.includes("Đèn Philip"));
  await tranPreview.screenshot({ path: "preview-tran.png", fullPage: true });
  await tranPreview.close();

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
  assertA5Landscape(compactPdf);
  assert.strictEqual(pageCount(compactPdf), 1, "The three-item prescription should not be split prematurely");
  const compactText = await pdfText(compactPdf);
  assert.ok(compactText.includes("Nibean Itraconazol") && compactText.includes("VERTUCID"));
  await compactPreview.close();

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
  const manyPage = await manyPreview.locator(".print-page").evaluate((page) => ({ clientHeight: page.clientHeight, scrollHeight: page.scrollHeight }));
  assert.strictEqual(manyPage.clientHeight, manyPage.scrollHeight);
  const manyPdf = await filteredPdf(manyPreview, "prescription");
  assertA5Landscape(manyPdf);
  assert.ok(pageCount(manyPdf) > 1, "A long prescription should flow onto additional physical pages");
  const manyText = await pdfText(manyPdf);
  assert.ok(manyText.includes("Sản phẩm 1 ") && manyText.includes("Sản phẩm 30 "));
  await manyPreview.close();

  await browser.close();
  console.log(JSON.stringify({ consultationPages: pageCount(consultationPdf), allPages: pageCount(allPdf), compactPages: pageCount(compactPdf), manyPages: pageCount(manyPdf) }));
})().catch((error) => { console.error(error); process.exit(1); });
