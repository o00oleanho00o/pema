const assert = require("assert");
const { chromium } = require("C:/Users/email/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const model = {
    clinic: {
      name: "Phòng khám Da liễu Thẩm Mỹ",
      slogan: "Chuẩn Y khoa - An toàn - Hiệu quả",
      phone: "18008048",
      address: "Liền kề TT03, khu đô thị Nam Đô, 609 đường Trương Định, phường Hoàng Mai, Thành phố Hà Nội, Việt Nam"
    },
    patient: { name: "Đỗ Kiều Phương Nhi", age: "2", address: "Xã Đông Anh , Hà Nội", gender: null, diagnosis: "Bớt Ota, bớt rượu vang" },
    items: [
      {
        sourceName: "Cicaderm Cream 40ml - Kem làm mềm da, dưỡng ẩm, hỗ trợ làm đều màu da, mờ sẹo 40 ml - A",
        quantity: "1",
        unit: "Hộp",
        usage: "Bôi sáng tối sau laser trong 1 tuần",
        outputType: "CONSULTATION",
        matchStatus: "EXACT_NAME"
      },
      {
        sourceName: "Fudareus B (Hộp 1 tuýp 15g), NSX: Việt Nam - A",
        quantity: "1",
        unit: "Tuýp",
        usage: "Bôi sáng tối sau laser trong 1 tuần",
        outputType: "PRESCRIPTION",
        matchStatus: "EXACT_NAME"
      }
    ],
    notes: "- Quý khách vui lòng đặt lịch hẹn trước khi đến\n- Vui lòng mang theo đơn này khi tái khám sau........tuần\n- Quý khách vui lòng kiểm tra thuốc trước khi thanh toán và nhận hàng.",
    date: "20 Tháng 8 Năm 2026",
    doctor: null,
    doctorLabel: "Bác sĩ khám"
  };
  await page.addInitScript(({ payload }) => {
    globalThis.chrome = { storage: { session: { get: async (key) => ({ [key]: payload }), remove: async () => {} } } };
  }, { payload: model });
  await page.goto("file:///E:/codex/indon/preview.html#test-token");
  await page.waitForFunction(() => document.querySelectorAll(".print-page").length === 2);

  assert.strictEqual(await page.title(), "Tách đơn - Đỗ Kiều Phương Nhi");
  assert.strictEqual(await page.locator(".print-page").count(), 2);
  const names = await page.locator(".item-name").allTextContents();
  assert.ok(names.some((name) => name.includes("Fudareus B")) && names.some((name) => name.includes("Cicaderm")));
  const dimensions = await page.locator(".print-page").first().evaluate((node) => ({
    width: node.getBoundingClientRect().width,
    height: node.getBoundingClientRect().height,
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight
  }));
  assert.ok(dimensions.width > 780 && dimensions.height > 540 && dimensions.height < 570);
  assert.strictEqual(dimensions.scrollHeight, dimensions.clientHeight);

  await page.screenshot({ path: "preview-test.png", fullPage: true });
  await browser.close();
  console.log(JSON.stringify({ title: "Tách đơn - Đỗ Kiều Phương Nhi", documents: 2, names, dimensions }));
})().catch((error) => { console.error(error); process.exit(1); });
