const assert = require("assert");
const { chromium } = require("C:/Users/email/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

async function previewLayout(page, documentType = "prescription") {
  return page.locator(".toolbar").evaluate((toolbar, type) => {
    const documents = document.querySelector("#documents");
    const modal = toolbar.closest('.preview-shell[role="dialog"]');
    const surface = toolbar.closest(".preview-surface");

    const panel = document.querySelector(`[data-doc="${type}"]`);
    const scroll = panel.querySelector(".section-scroll");
    const canvas = panel.querySelector(".document-canvas");
    const box = (node) => {
      const bounds = node.getBoundingClientRect();
      return { top: bounds.top, right: bounds.right, bottom: bounds.bottom, left: bounds.left, width: bounds.width, height: bounds.height };
    };

    return {
      viewport: { width: innerWidth, height: innerHeight },
      modalTag: modal.tagName,
      modalBackground: getComputedStyle(modal).backgroundColor,
      modal: box(modal),
      surfaceBackground: getComputedStyle(surface).backgroundColor,
      surface: box(surface),
      toolbar: box(toolbar),
      toolbarClientWidth: toolbar.clientWidth,
      toolbarScrollWidth: toolbar.scrollWidth,
      documents: box(documents),
      panel: box(panel),
      scroll: box(scroll),
      scrollClientHeight: scroll.clientHeight,
      scrollScrollHeight: scroll.scrollHeight,
      scrollClientLeft: scroll.getBoundingClientRect().left + scroll.clientLeft,
      scrollClientWidth: scroll.clientWidth,
      scrollScrollWidth: scroll.scrollWidth,
      canvas: box(canvas)
    };
  }, documentType);
}

function assertInsideViewport(bounds, viewport, label) {
  assert.ok(bounds.top >= -1 && bounds.left >= -1, `${label} should start inside the viewport: ${JSON.stringify({ bounds, viewport })}`);
  assert.ok(bounds.right <= viewport.width + 1 && bounds.bottom <= viewport.height + 1, `${label} should end inside the viewport: ${JSON.stringify({ bounds, viewport })}`);
}

async function assertResponsivePreview(page, viewport) {
  await page.setViewportSize(viewport);
  const layout = await previewLayout(page);
  assertInsideViewport(layout.modal, layout.viewport, `Preview modal at ${viewport.width}x${viewport.height}`);
  assert.ok(layout.toolbar.left >= layout.surface.left - 1 && layout.toolbar.right <= layout.surface.right + 1, `Toolbar should stay inside the modal width at ${viewport.width}x${viewport.height}: ${JSON.stringify(layout)}`);
  assert.ok(layout.toolbarScrollWidth <= layout.toolbarClientWidth + 1, `Toolbar should wrap without horizontal overflow at ${viewport.width}x${viewport.height}: ${JSON.stringify(layout)}`);
  assert.ok(layout.documents.left >= layout.surface.left - 1 && layout.documents.right <= layout.surface.right + 1, `Documents should stay inside the modal width at ${viewport.width}x${viewport.height}: ${JSON.stringify(layout)}`);
  assert.ok(layout.scroll.height > (viewport.height > viewport.width ? 180 : 80), `Preview should retain a usable scroll area at ${viewport.width}x${viewport.height}: ${JSON.stringify(layout)}`);
  assert.ok(layout.scroll.left >= layout.surface.left - 1 && layout.scroll.right <= layout.surface.right + 1 && layout.scroll.bottom <= layout.modal.bottom + 1, `Scroll area should stay inside the modal at ${viewport.width}x${viewport.height}: ${JSON.stringify(layout)}`);
  assert.ok(layout.scrollScrollWidth > layout.scrollClientWidth, `Portrait paper should remain horizontally scrollable at ${viewport.width}x${viewport.height}: ${JSON.stringify(layout)}`);

  const horizontalReach = await page.locator('[data-doc="prescription"] .section-scroll').evaluate((scroll) => {
    const canvas = scroll.querySelector(".document-canvas");
    const position = () => {
      const scrollBox = scroll.getBoundingClientRect();
      const canvasBox = canvas.getBoundingClientRect();
      return { scrollLeft: scroll.scrollLeft, scrollLeftEdge: scrollBox.left, scrollRightEdge: scrollBox.right, canvasLeft: canvasBox.left, canvasRight: canvasBox.right };
    };
    scroll.scrollLeft = 0;
    const start = position();
    const maxScrollLeft = scroll.scrollWidth - scroll.clientWidth;
    scroll.scrollLeft = maxScrollLeft;
    const end = position();
    scroll.scrollLeft = 0;
    return { maxScrollLeft, start, end };
  });
  assert.ok(horizontalReach.maxScrollLeft > 0);
  assert.ok(horizontalReach.start.canvasLeft >= horizontalReach.start.scrollLeftEdge - 1, `Left paper edge should be reachable: ${JSON.stringify(horizontalReach)}`);
  assert.ok(horizontalReach.end.canvasRight <= horizontalReach.end.scrollRightEdge + 1, `Right paper edge should be reachable: ${JSON.stringify(horizontalReach)}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const model = {
    clinic: {
      name: "Phòng khám Da liễu Thẩm Mỹ",
      slogan: "Chuẩn Y khoa - An toàn - Hiệu quả",
      phone: "18008048",
      address: "Liền kề TT03, khu đô thị Nam Đô, 609 đường Trương Định, phường Hoàng Mai, Thành phố Hà Nội, Việt Nam"
    },
    patient: { name: "Đỗ Kiều Phương Nhi", age: "2", address: "Xã Đông Anh , Hà Nội", gender: null, diagnosis: "Bớt Ota, bớt rượu vang" },
    items: [
      { sourceName: "Cicaderm Cream 40ml - Kem làm mềm da, dưỡng ẩm, hỗ trợ làm đều màu da, mờ sẹo 40 ml - A", quantity: "1", unit: "Hộp", usage: "Bôi sáng tối sau laser trong 1 tuần", outputType: "CONSULTATION", matchStatus: "EXACT_NAME" },
      { sourceName: "Fudareus B (Hộp 1 tuýp 15g), NSX: Việt Nam - A", quantity: "1", unit: "Tuýp", usage: "Bôi sáng tối sau laser trong 1 tuần", outputType: "PRESCRIPTION", matchStatus: "EXACT_NAME" }
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
  assert.strictEqual(await page.locator(".page-dimensions").textContent(), "148 mm × 210 mm", "Preview dimensions should describe the portrait A5 paper");
  assert.strictEqual(await page.locator(".document-set").count(), 2);
  assert.strictEqual(await page.locator(".document-set.is-active").getAttribute("data-doc"), "prescription");
  assert.strictEqual(await page.locator("#prescriptionView").getAttribute("aria-selected"), "true");
  assert.strictEqual(await page.locator("#consultationView").getAttribute("aria-selected"), "false");
  assert.strictEqual(await page.locator("#prescriptionView").getAttribute("aria-controls"), "prescriptionPanel");
  assert.strictEqual(await page.locator("#prescriptionPanel").getAttribute("role"), "tabpanel");

  const screen = await page.locator('[data-doc="prescription"] .print-page').evaluate((node) => ({
    width: node.getBoundingClientRect().width,
    height: node.getBoundingClientRect().height,
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
    fontSize: getComputedStyle(node).fontSize,
    lineHeight: getComputedStyle(node).lineHeight,
    boxShadow: getComputedStyle(node).boxShadow
  }));
  assert.ok(screen.width > 550 && screen.width < 570, `Expected portrait clinic canvas, got ${screen.width}px`);
  assert.ok(screen.height > 790, `Expected long portrait canvas, got ${screen.height}px`);
  assert.strictEqual(screen.scrollHeight, screen.clientHeight);
  assert.strictEqual(screen.fontSize, "14px");
  assert.strictEqual(screen.lineHeight, "21px");
  assert.strictEqual(screen.boxShadow, "none");
  const desktopLayout = await previewLayout(page);
  assert.strictEqual(desktopLayout.modalTag, "SECTION", "The preview should use its dedicated dialog shell");
  assert.strictEqual(desktopLayout.surfaceBackground, "rgb(255, 255, 255)");
  assert.ok(desktopLayout.modal.width >= desktopLayout.viewport.width * 0.9, `Modal should use nearly all viewport width: ${JSON.stringify(desktopLayout)}`);
  assert.ok(desktopLayout.modal.height >= desktopLayout.viewport.height * 0.9, `Modal should use nearly all viewport height: ${JSON.stringify(desktopLayout)}`);
  assertInsideViewport(desktopLayout.modal, desktopLayout.viewport, "Desktop preview modal");
  assert.ok(desktopLayout.surface.width >= desktopLayout.modal.width - 21 && desktopLayout.surface.height >= desktopLayout.modal.height - 21, `White preview surface should fill the dialog shell: ${JSON.stringify(desktopLayout)}`);
  assert.ok(desktopLayout.toolbar.top >= desktopLayout.modal.top - 1 && desktopLayout.toolbar.bottom <= desktopLayout.modal.bottom + 1, `Toolbar should stay inside the modal: ${JSON.stringify(desktopLayout)}`);
  assert.ok(desktopLayout.documents.top >= desktopLayout.toolbar.bottom - 1 && desktopLayout.documents.bottom >= desktopLayout.surface.bottom - 2, `Documents should fill the white surface below the toolbar: ${JSON.stringify(desktopLayout)}`);
  assert.ok(desktopLayout.scroll.width >= desktopLayout.panel.width - 2, `Scroll area should fill the modal body width: ${JSON.stringify(desktopLayout)}`);
  assert.ok(desktopLayout.scroll.bottom >= desktopLayout.panel.bottom - 2, `Scroll area should fill the remaining modal body height: ${JSON.stringify(desktopLayout)}`);
  assert.ok(Math.abs(desktopLayout.canvas.width - 559.37) < 2, `Expected a 148mm paper canvas, got ${desktopLayout.canvas.width}px`);
  assert.ok(Math.abs((desktopLayout.canvas.left + desktopLayout.canvas.right) / 2 - (desktopLayout.scrollClientLeft + desktopLayout.scrollClientWidth / 2)) < 2, `Paper canvas should be centered in the usable scroll viewport: ${JSON.stringify(desktopLayout)}`);
  const clinicLayout = await page.locator('[data-doc="prescription"] .print-page').evaluate((node) => {
    const root = node.getBoundingClientRect();
    const relativeBox = (selector) => {
      const box = node.querySelector(selector).getBoundingClientRect();
      return { top: box.top - root.top, height: box.height };
    };
    return { header: relativeBox(".original-header"), title: relativeBox(".print-title"), patient: relativeBox(".patient-grid") };
  });
  assert.ok(clinicLayout.header.height > 136 && clinicLayout.header.height < 141, `Unexpected clinic header: ${JSON.stringify(clinicLayout)}`);
  assert.ok(clinicLayout.title.top > 138 && clinicLayout.title.top < 141 && clinicLayout.title.height > 38 && clinicLayout.title.height < 40);
  assert.ok(clinicLayout.patient.top > 185 && clinicLayout.patient.top < 188);
  const prescriptionViewport = page.locator('[data-doc="prescription"] .section-scroll');
  await page.setViewportSize({ width: 1200, height: 720 });
  const viewportMetrics = await prescriptionViewport.evaluate((node) => ({ clientHeight: node.clientHeight, scrollHeight: node.scrollHeight }));
  assert.ok(viewportMetrics.scrollHeight > viewportMetrics.clientHeight, `Expected a clinic-like scroll viewport: ${JSON.stringify(viewportMetrics)}`);
  await prescriptionViewport.evaluate((node) => { node.scrollTop = Math.min(120, node.scrollHeight - node.clientHeight); });
  const savedScrollTop = await prescriptionViewport.evaluate((node) => node.scrollTop);

  await page.locator("#consultationView").click();
  assert.strictEqual(await page.locator(".document-set.is-active").getAttribute("data-doc"), "consultation");
  assert.strictEqual(await page.locator('[data-doc="consultation"] .item-name').count(), 1);
  assert.strictEqual(await page.locator('[data-doc="prescription"] .section-scroll').evaluate((node) => getComputedStyle(node.parentElement).display), "none");
  assert.strictEqual(await page.locator("#consultationView").getAttribute("aria-selected"), "true");
  await page.locator("#consultationView").focus();
  await page.keyboard.press("ArrowLeft");
  assert.strictEqual(await page.locator(".document-set.is-active").getAttribute("data-doc"), "prescription");
  assert.strictEqual(await page.locator("#prescriptionView").getAttribute("tabindex"), "0");
  assert.ok(Math.abs(await prescriptionViewport.evaluate((node) => node.scrollTop) - savedScrollTop) <= 1);

  await assertResponsivePreview(page, { width: 390, height: 844 });
  await assertResponsivePreview(page, { width: 667, height: 375 });

  await page.emulateMedia({ media: "print" });
  const printStyle = await page.locator('[data-doc="prescription"] .print-page').evaluate((node) => ({
    color: getComputedStyle(node).color,
    titleBorder: getComputedStyle(node.querySelector(".print-title")).borderBottomColor,
    logoFilter: getComputedStyle(node.querySelector("img")).filter
  }));
  assert.strictEqual(printStyle.color, "rgb(0, 0, 0)");
  assert.strictEqual(printStyle.titleBorder, "rgb(0, 0, 0)");
  assert.ok(printStyle.logoFilter.includes("grayscale"), `Printed assets should be monochrome: ${JSON.stringify(printStyle)}`);
  await page.emulateMedia({ media: "screen" });

  await page.screenshot({ path: "preview-test.png", fullPage: true });
  await browser.close();
  console.log(JSON.stringify({ title: "Tách đơn - Đỗ Kiều Phương Nhi", documents: 2, activeAfterSwitch: "consultation", screen }));
})().catch((error) => { console.error(error); process.exit(1); });
