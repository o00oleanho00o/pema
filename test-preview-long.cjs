const assert = require("assert");
const { chromium } = require("C:/Users/email/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

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
    const footer = node.querySelector(".print-footer").getBoundingClientRect();
    return {
      items: node.querySelectorAll(".print-item").length,
      height: pageBox.height,
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
      lastItemBottom: lastItem.bottom - pageBox.top,
      footerTop: footer.top - pageBox.top,
      footerBottom: footer.bottom - pageBox.top
    };
  });
  assert.strictEqual(layout.items, 10);
  assert.ok(layout.height > 793, `Long preview should grow beyond the 210mm minimum instead of clipping: ${JSON.stringify(layout)}`);
  assert.strictEqual(layout.scrollHeight, layout.clientHeight, "The paper canvas itself should expand to contain long content");
  assert.ok(layout.lastItemBottom <= layout.footerTop + 1, `The footer should follow the final item: ${JSON.stringify(layout)}`);
  assert.ok(layout.footerBottom <= layout.clientHeight + 1, `Footer should remain fully visible inside the expanded canvas: ${JSON.stringify(layout)}`);

  const scrollLayout = await page.locator(".section-scroll").evaluate((node) => ({ clientHeight: node.clientHeight, scrollHeight: node.scrollHeight }));
  assert.ok(scrollLayout.scrollHeight > scrollLayout.clientHeight, `The modal viewport, not the paper, should handle scrolling: ${JSON.stringify(scrollLayout)}`);

  await page.evaluate(() => { document.body.dataset.printFilter = "prescription"; });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  assertA5Portrait(pdf);
  assert.ok(pageCount(pdf) > 1, "Long content should flow across additional physical A5 portrait pages");
  await browser.close();
  console.log(JSON.stringify({ layout, physicalPages: pageCount(pdf) }));
})().catch((error) => { console.error(error); process.exit(1); });
