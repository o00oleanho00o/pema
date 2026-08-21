const assert = require("assert");
const { chromium } = require("C:/Users/email/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("file:///E:/codex/indon/donthat/%C4%90%E1%BB%97%20Ki%E1%BB%81u%20Ph%C6%B0%C6%A1ng%20Nhi.html");
  await page.evaluate(() => {
    const name = document.querySelector('[dataid="medicinename"]');
    let group = name;
    while (group && group !== document.body && !group.querySelector('[dataid="quantity"]')) group = group.parentElement;
    const hidden = (id, text) => {
      const node = document.createElement("label");
      node.setAttribute("dataid", id);
      node.textContent = text;
      node.style.display = "none";
      group.appendChild(node);
    };
    hidden("medicinename", "HIDDEN WRONG PRODUCT");
    hidden("quantity", "999");
    hidden("unitName", "Hidden unit");
    const hiddenGender = document.createElement("input");
    hiddenGender.setAttribute("dataid", "IsMale");
    hiddenGender.type = "checkbox";
    hiddenGender.checked = true;
    hiddenGender.style.display = "none";
    group.appendChild(hiddenGender);
  });
  const source = fs.readFileSync("content.js", "utf8");
  const model = await page.evaluate((script) => eval(script), source);
  assert.strictEqual(model.items[0].sourceName.startsWith("Cicaderm Cream"), true);
  assert.strictEqual(model.items[0].quantity, "1");
  assert.strictEqual(model.items[0].unit, "Hộp");
  assert.strictEqual(model.items.length, 2);
  assert.strictEqual(model.patient.gender, null);
  await browser.close();
  console.log("hidden DOM fields ignored");
})().catch((error) => { console.error(error); process.exit(1); });
