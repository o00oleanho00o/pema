const assert = require("assert");
const { chromium } = require("C:/Users/email/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

function pageCount(pdf) {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const items = Array.from({ length: 10 }, (_, index) => ({
    sourceName: `Sản phẩm ${index + 1} mô tả dài 40ml với nhiều thông tin bổ sung`,
    quantity: "1",
    unit: "Hộp",
    usage: "Bôi sáng tối trong 1 tuần và tiếp tục theo hướng dẫn chi tiết",
    outputType: "PRESCRIPTION",
    matchStatus: "EXACT_NAME"
  }));
  const model = {
    clinic: { name: "Clinic", slogan: "Slogan", phone: "1", address: "Address" },
    patient: { name: "Danh sách dài", age: "2", address: "B", gender: null, diagnosis: "D" },
    items,
    notes: "- Note",
    date: "D",
    doctor: null,
    doctorLabel: "Bác sĩ khám"
  };
  await page.addInitScript(({ payload }) => {
    globalThis.chrome = {
      storage: { session: { get: async (key) => ({ [key]: payload }), remove: async () => {} } },
      runtime: { getURL: (path) => `file:///E:/codex/indon/${path}` }
    };
  }, { payload: model });
  await page.goto("file:///E:/codex/indon/preview.html#long-test");
  await page.waitForFunction(() => document.querySelectorAll(".print-item").length === 10);

  const layout = await page.locator(".print-page").evaluate((node) => {
    const pageBox = node.getBoundingClientRect();
    const lastItem = node.querySelector(".print-item:last-child").getBoundingClientRect();
    return {
      items: node.querySelectorAll(".print-item").length,
      height: pageBox.height,
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
      lastItemBottom: lastItem.bottom - pageBox.top
    };
  });
  assert.strictEqual(layout.items, 10);
  assert.ok(layout.height > 559, "Long preview should grow continuously instead of clipping");
  assert.strictEqual(layout.scrollHeight, layout.clientHeight);
  assert.ok(layout.lastItemBottom <= layout.clientHeight + 1);

  await page.evaluate(() => { document.body.dataset.printFilter = "prescription"; });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  assert.ok(pageCount(pdf) > 1, "Long content should flow across physical A5 pages");
  await browser.close();
  console.log(JSON.stringify({ layout, physicalPages: pageCount(pdf) }));
})().catch((error) => { console.error(error); process.exit(1); });
